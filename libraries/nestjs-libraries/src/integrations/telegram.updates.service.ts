import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  parseTelegramUpdate,
  TelegramUpdateAction,
  TelegramUpdateLike,
} from '@contentfactory/nestjs-libraries/integrations/telegram.update.parser';
import { timer } from '@contentfactory/helpers/utils/timer';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { redactSensitive } from '@contentfactory/nestjs-libraries/services/redact.sensitive';
import {
  adminBindDeclineMessage,
  adminBindSuccessMessage,
  pendingApprovalNotification,
} from '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind';
import { resolveBackendLocale } from '@contentfactory/nestjs-libraries/locale/backend-strings';
import TelegramBot from 'node-telegram-bot-api';

const consumerLeaseName = 'telegram-bot-updates';
const leaseDurationMs = 45_000;
const retryDelayMs = 2_000;
const receiptRetentionMs = 7 * 24 * 60 * 60 * 1_000;
/**
 * Engagement is read from the post statistics screen long after the receipt
 * that produced it is gone, so it is retained for far longer — but not
 * forever, because nothing else ever deletes a row here. Pruned by
 * `updatedAt`, which is indexed and also means "still moving".
 */
const postMetricRetentionMs = 180 * 24 * 60 * 60 * 1_000;
/**
 * After this many failures the update is written off. Without it, one update
 * this instance cannot apply holds the cursor, and therefore every later
 * update, forever.
 */
const maximumUpdateAttempts = 3;
/**
 * A receipt stays claimable for far less time than it is retained. Retention
 * exists to deduplicate update ids; a pending connection is something a person
 * is waiting on, so anything older is an abandoned attempt. Matching words
 * across a week would let one organization pick up another one's channel.
 */
const connectClaimWindowMs = 15 * 60 * 1_000;
const supportRelayBatchSize = 50;

class TelegramLeaseOwnershipLost extends Error {}

/**
 * `P2021` is Prisma's "the table does not exist in the current database". It
 * happens for one reason here: the image carrying the support relay is running
 * against a database whose schema has not been applied yet, which is a real
 * window in the deploy runbook — the new container starts first and the schema
 * is applied after it.
 */
const isMissingTable = (error: unknown) =>
  (error as { code?: string })?.code === 'P2021';

/**
 * A unique-constraint violation means "already processed" only when it comes
 * from the receipt key. The same code raised by a metric or a discussion row
 * is a real failure, and treating it as a duplicate would drop the update.
 */
/**
 * Telegram allows exactly one outstanding `getUpdates` long-poll per bot
 * token. A second consumer — a stand still pointed at a production token, a
 * process that failed to exit, a manual `curl` left running — makes every
 * `getUpdates` call from here fail with this shape, and the bot goes quiet:
 * no `/start` bindings, no support relay, no approval-queue notification, and
 * nothing about the failure visible from the product itself. This is the same
 * class of defect as `content-factory-next-7jxo` (a failure indistinguishable
 * from success) applied to the polling loop instead of the mail path, and it
 * is the specific trap this codebase has already fallen into once — see
 * `docs/operations/*` for the incident it caused before this check existed.
 */
const isTelegramConflict = (error: unknown) => {
  const failure = error as { code?: string; response?: { statusCode?: number } };
  return failure?.code === 'ETELEGRAM' && failure?.response?.statusCode === 409;
};

/**
 * What a Telegram reply owed after `processLeasedUpdate`'s transaction
 * commits. Kept out of the transaction itself: `bot.sendMessage` is a network
 * call, and the DB write that decided whether a binding succeeded must not
 * wait on it, retry because of it, or roll back because Telegram was briefly
 * unreachable. The write is the single source of truth; this reply is best-
 * effort UX riding on top of it.
 */
type PostCommitEffect = {
  kind: 'send-message';
  chatId: string;
  message: string;
};

const isDuplicateReceipt = (error: unknown) => {
  const failure = error as {
    code?: string;
    meta?: { modelName?: unknown; target?: unknown };
  };
  if (failure?.code !== 'P2002') {
    return false;
  }

  if (
    typeof failure.meta?.modelName === 'string' &&
    failure.meta.modelName !== 'TelegramUpdateReceipt'
  ) {
    return false;
  }

  const target = failure.meta?.target;
  const fields = Array.isArray(target) ? target : [target];
  return fields.some(
    (field) =>
      typeof field === 'string' &&
      (field === 'updateId' ||
        field.toLowerCase().includes('telegramupdatereceipt'))
  );
};

@Injectable()
export class TelegramUpdatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdatesService.name);
  private readonly consumerId = makeId(20);
  private readonly bot = new TelegramBot(process.env.TELEGRAM_TOKEN || '');
  private running = false;
  private supportConfigurationWarningLogged = false;
  /**
   * Re-evaluated on every poll rather than latched, so applying the schema to
   * a running container heals the relay within one turn instead of needing a
   * restart. It starts optimistic: on a healthy instance the first prune
   * confirms it, and the only thing riding on the initial value is whether the
   * very first private message of a broken deploy is dropped or written off.
   */
  private supportRelayTableAvailable = true;
  private supportRelayTableWarningLogged = false;
  /**
   * Set once a 409 is logged loudly, so a stuck conflict does not repeat the
   * same paragraph every `retryDelayMs`. Cleared the moment a poll succeeds,
   * so a conflict that returns later is reported again rather than staying
   * silent because it was already reported once, days ago, about a different
   * outage.
   */
  private telegramConflictWarningLogged = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!process.env.TELEGRAM_TOKEN) {
      return;
    }

    this.running = true;
    void this.pollLoop();
    // One-shot, not on the poll loop: nothing here should add a Telegram call
    // to every 20-second poll, and a fresh process only needs to know once.
    void this.verifyBotIdentity();
  }

  /**
   * TELEGRAM_BOT_NAME and TELEGRAM_TOKEN are two separate values a deploy can
   * set out of sync — most dangerously when a stand copies a production bot's
   * name to satisfy the frontend's non-null read of it, then gets its own
   * token later. The frontend builds the "add this bot to your channel" link
   * from TELEGRAM_BOT_NAME alone, so a stale name silently sends people to
   * add a *different* bot than the one this instance's token actually
   * listens as — indistinguishable from "the stand can't see the channel"
   * without this check.
   *
   * `getMe` ties the name back to the token itself, so no third value can
   * drift out from under the pair. It runs once at startup and is logged,
   * never thrown: a dead token or an unreachable api.telegram.org must not
   * take the process down, and pollLoop's own polling already reports a dead
   * token repeatedly on its own retry cadence.
   */
  private async verifyBotIdentity() {
    const configuredName = process.env.TELEGRAM_BOT_NAME?.trim();
    if (!configuredName) {
      return;
    }

    let me: { username?: string };
    try {
      me = await this.bot.getMe();
    } catch (error) {
      this.logger.error(
        'Could not verify TELEGRAM_BOT_NAME against TELEGRAM_TOKEN: the ' +
          "Telegram getMe call failed. TELEGRAM_TOKEN may be dead, or " +
          'api.telegram.org may be unreachable from here. Until this ' +
          'resolves, the "add bot to channel" link may point at the wrong bot.',
        redactSensitive(error)
      );
      return;
    }

    const actualName = me.username?.replace(/^@/, '').toLowerCase();
    const wantedName = configuredName.replace(/^@/, '').toLowerCase();
    if (actualName && actualName !== wantedName) {
      this.logger.error(
        `TELEGRAM_BOT_NAME ("${configuredName}") does not match the bot ` +
          `TELEGRAM_TOKEN authenticates as ("@${me.username}"). The ` +
          '"add bot to channel" link sent to users points at the wrong ' +
          'bot; fix TELEGRAM_BOT_NAME or TELEGRAM_TOKEN so they name the ' +
          'same bot.'
      );
    }
  }

  onModuleDestroy() {
    this.running = false;
  }

  private async acquireLease() {
    const now = new Date();
    await this.prisma.telegramUpdateConsumerLease.upsert({
      where: { name: consumerLeaseName },
      create: {
        name: consumerLeaseName,
        ownerId: this.consumerId,
        leaseUntil: now,
      },
      update: {},
    });

    const acquired = await this.prisma.telegramUpdateConsumerLease.updateMany({
      where: {
        name: consumerLeaseName,
        OR: [{ ownerId: this.consumerId }, { leaseUntil: { lt: now } }],
      },
      data: {
        ownerId: this.consumerId,
        leaseUntil: new Date(now.getTime() + leaseDurationMs),
      },
    });

    return acquired.count === 1;
  }

  private async pollLoop() {
    while (this.running) {
      try {
        await this.pollOnce();
        // A successful turn proves the token's long-poll is ours again; the
        // next conflict, if there ever is one, deserves its own loud line.
        this.telegramConflictWarningLogged = false;
      } catch (error) {
        if (isTelegramConflict(error)) {
          if (!this.telegramConflictWarningLogged) {
            this.logger.error(
              'Telegram getUpdates returned 409 Conflict: another consumer ' +
                "already holds this bot token's long-poll. Until this " +
                'clears, nothing here is delivered: no /start binding, no ' +
                'support relay, no approval-queue notification. Stop the ' +
                'other consumer, or revoke and reissue TELEGRAM_TOKEN if ' +
                "it cannot be identified. This will not log again while " +
                'the conflict continues; it logs once when a poll next ' +
                'succeeds and again if the conflict returns.',
              redactSensitive(error)
            );
            this.telegramConflictWarningLogged = true;
          }
        } else {
          // Every Telegram error carries the request URL, and the request
          // URL carries the bot token. Never log one of these raw.
          this.logger.error(
            'Telegram update polling failed',
            redactSensitive(error)
          );
        }
        await timer(retryDelayMs);
      }
    }
  }

  async pollOnce() {
    if (!(await this.acquireLease())) {
      await timer(retryDelayMs);
      return;
    }

    await this.pruneStoredHistory();
    const cursor = await this.prisma.telegramUpdateReceipt.aggregate({
      _max: { updateId: true },
    });
    if (
      cursor._max.updateId !== null &&
      !(await this.clearCompletedFailureStates(cursor._max.updateId))
    ) {
      return;
    }

    await this.deliverPendingSupportMessages();

    const updates = (await this.bot.getUpdates({
      ...(cursor._max.updateId !== null
        ? { offset: cursor._max.updateId + 1 }
        : {}),
      timeout: 20,
      allowed_updates: ['message', 'channel_post', 'message_reaction_count'],
    })) as unknown as TelegramUpdateLike[];

    // The lease was taken before a long poll that runs for up to 20 seconds,
    // so by now another replica may legitimately own the queue. Applying this
    // batch anyway would double-count every reaction and comment in it.
    if (!(await this.acquireLease())) {
      return;
    }

    // A full batch is a hundred updates, each its own transaction, and the
    // lease is held for forty-five seconds. Renewing part-way through keeps a
    // slow batch from letting the lease lapse under a replica whose clock runs
    // a little fast; losing it mid-batch costs a 409 from Telegram and a round
    // of churn, not correctness.
    let renewAt = Date.now() + leaseDurationMs / 3;

    for (const update of updates.sort((a, b) => a.update_id - b.update_id)) {
      if (Date.now() >= renewAt) {
        if (!(await this.acquireLease())) {
          return;
        }
        renewAt = Date.now() + leaseDurationMs / 3;
      }

      try {
        await this.processLeasedUpdate(update);
      } catch (error) {
        if (error instanceof TelegramLeaseOwnershipLost) {
          return;
        }

        const attempts = await this.recordFailedAttempt(update.update_id);
        if (attempts === null) {
          return;
        }
        this.logger.error(
          `Telegram update ${update.update_id} failed on attempt ${attempts}`,
          redactSensitive(error)
        );

        if (attempts < maximumUpdateAttempts) {
          // Leave the cursor where it is; the next turn retries this update
          // and the ones behind it. Wait first: with a non-empty queue
          // `getUpdates` returns at once, so without a pause all three
          // attempts burn inside a few milliseconds and a one-second problem —
          // a write conflict, a busy pool, a dropped connection — would be
          // written off as unprocessable.
          await timer(retryDelayMs);
          return;
        }

        if (!(await this.writeOffUpdate(update.update_id))) {
          return;
        }
      }
    }

    await this.deliverPendingSupportMessages();
  }

  /**
   * Telegram delivery is deliberately outside the update transaction. The
   * outbox row is durable before the API call, so an API or process failure
   * retries it. A crash after forwarding and before `deliveredAt` can forward
   * twice; that is the unavoidable at-least-once side of this boundary.
   */
  private async deliverPendingSupportMessages() {
    if (!this.supportRelayTableAvailable) {
      // Already reported by the prune probe; there is no queue to read.
      return;
    }

    const ownerChatId = process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID?.trim();
    if (!ownerChatId) {
      if (!this.supportConfigurationWarningLogged) {
        this.logger.warn(
          'TELEGRAM_SUPPORT_OWNER_CHAT_ID is not configured; private Telegram support messages remain queued'
        );
        this.supportConfigurationWarningLogged = true;
      }
      return;
    }

    this.supportConfigurationWarningLogged = false;
    const pending = await this.prisma.telegramSupportRelayOutbox.findMany({
      where: { deliveredAt: null },
      orderBy: [
        { lastAttemptAt: { sort: 'asc', nulls: 'first' } },
        { updateId: 'asc' },
      ],
      take: supportRelayBatchSize,
      select: {
        updateId: true,
        sourceChatId: true,
        sourceMessageId: true,
      },
    });

    for (const relay of pending) {
      const attemptedAt = new Date();
      try {
        await this.bot.forwardMessage(
          ownerChatId,
          relay.sourceChatId,
          relay.sourceMessageId
        );
        await this.prisma.telegramSupportRelayOutbox.updateMany({
          where: { updateId: relay.updateId, deliveredAt: null },
          data: {
            attemptCount: { increment: 1 },
            lastAttemptAt: attemptedAt,
            deliveredAt: new Date(),
          },
        });
      } catch (error) {
        try {
          await this.prisma.telegramSupportRelayOutbox.update({
            where: { updateId: relay.updateId },
            data: {
              attemptCount: { increment: 1 },
              lastAttemptAt: attemptedAt,
            },
          });
        } catch (persistenceError) {
          this.logger.error(
            `Telegram support relay ${relay.updateId} attempt could not be recorded`,
            redactSensitive(persistenceError)
          );
        }
        this.logger.warn(
          `Telegram support relay ${relay.updateId} delivery failed and will be retried`,
          redactSensitive(error)
        );
      }
    }
  }

  private async pruneStoredHistory() {
    const now = Date.now();
    await this.prisma.telegramUpdateReceipt.deleteMany({
      where: { createdAt: { lt: new Date(now - receiptRetentionMs) } },
    });
    // This runs once per poll on the table the support relay owns, which makes
    // it the natural probe for whether that table is there at all. Everything
    // Telegram does — `/connect`, statistics, discussion mapping — predates
    // the relay and must not stop because the newest feature's table has not
    // been created yet.
    try {
      await this.prisma.telegramSupportRelayOutbox.deleteMany({
        // `lt` excludes NULL, so pending relays are never aged out. Only
        // metadata for a delivery Telegram already accepted follows receipt
        // retention.
        where: { deliveredAt: { lt: new Date(now - receiptRetentionMs) } },
      });
      if (!this.supportRelayTableAvailable) {
        this.logger.log(
          'TelegramSupportRelayOutbox is present again; support relay resumed'
        );
      }
      this.supportRelayTableAvailable = true;
      this.supportRelayTableWarningLogged = false;
    } catch (error) {
      if (!isMissingTable(error)) {
        throw error;
      }
      this.supportRelayTableAvailable = false;
      if (!this.supportRelayTableWarningLogged) {
        this.logger.error(
          'TelegramSupportRelayOutbox does not exist; apply the Prisma schema. ' +
            'Private support messages are dropped until it does. Channel ' +
            'connection, statistics and discussions are unaffected.'
        );
        this.supportRelayTableWarningLogged = true;
      }
    }
    await this.prisma.telegramPostMetric.deleteMany({
      where: { updatedAt: { lt: new Date(now - postMetricRetentionMs) } },
    });
    // Dropped on the same horizon as the metric it points at: a mapping whose
    // metric row is already gone can only resurrect a counter for a post
    // nobody is reading any more, and this table gains a row per comment
    // forever otherwise.
    await this.prisma.telegramDiscussionMessage.deleteMany({
      where: { createdAt: { lt: new Date(now - postMetricRetentionMs) } },
    });
  }

  /**
   * Records the receipt without applying anything, which moves the cursor past
   * an update this instance has repeatedly failed to process.
   */
  private async fenceLease(
    transaction: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]
  ) {
    const held = await transaction.telegramUpdateConsumerLease.updateMany({
      where: {
        name: consumerLeaseName,
        ownerId: this.consumerId,
      },
      // This conditional no-op is intentional. PostgreSQL locks the matched
      // lease row until this transaction ends, so a takeover cannot interleave
      // with receipt, effect, retry-state, or write-off writes.
      data: { ownerId: this.consumerId },
    });
    if (held.count !== 1) {
      throw new TelegramLeaseOwnershipLost();
    }
  }

  private async recordFailedAttempt(updateId: number) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.fenceLease(transaction);
        const failure = await transaction.telegramUpdateFailureState.upsert({
          where: { updateId },
          create: {
            updateId,
            ownerId: this.consumerId,
            attempts: 1,
          },
          update: {
            ownerId: this.consumerId,
            attempts: { increment: 1 },
          },
          select: { attempts: true },
        });
        return failure.attempts;
      });
    } catch (error) {
      if (error instanceof TelegramLeaseOwnershipLost) {
        return null;
      }
      throw error;
    }
  }

  private async clearFailureState(updateId: number) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.fenceLease(transaction);
        await transaction.telegramUpdateFailureState.deleteMany({
          where: { updateId },
        });
      });
      return true;
    } catch (error) {
      if (error instanceof TelegramLeaseOwnershipLost) {
        return false;
      }
      throw error;
    }
  }

  private async clearCompletedFailureStates(maximumUpdateId: number) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.fenceLease(transaction);
        await transaction.telegramUpdateFailureState.deleteMany({
          where: { updateId: { lte: maximumUpdateId } },
        });
      });
      return true;
    } catch (error) {
      if (error instanceof TelegramLeaseOwnershipLost) {
        return false;
      }
      throw error;
    }
  }

  private async writeOffUpdate(updateId: number) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.fenceLease(transaction);
        await transaction.telegramUpdateReceipt.create({ data: { updateId } });
        await transaction.telegramUpdateFailureState.deleteMany({
          where: { updateId },
        });
      });
    } catch (error) {
      if (error instanceof TelegramLeaseOwnershipLost) {
        return false;
      }
      if (isDuplicateReceipt(error)) {
        if (!(await this.clearFailureState(updateId))) {
          return false;
        }
      } else {
        throw error;
      }
    }

    this.logger.error(
      `Telegram update ${updateId} skipped after ${maximumUpdateAttempts} failed attempts`
    );
    return true;
  }

  /**
   * The only way an update is ever applied. It used to have a public sibling
   * that passed `requireLease = false`, which nothing but the tests called: an
   * entry point that writes receipts and effects without holding the lease is
   * a way past the one invariant this consumer has, so both it and the flag
   * are gone.
   */
  private async processLeasedUpdate(update: TelegramUpdateLike) {
    try {
      const effects = await this.prisma.$transaction(async (transaction) => {
        await this.fenceLease(transaction);
        await transaction.telegramUpdateReceipt.create({
          data: { updateId: update.update_id },
        });

        const collected: PostCommitEffect[] = [];
        for (const action of parseTelegramUpdate(update)) {
          const effect = await this.applyAction(
            transaction,
            update.update_id,
            action
          );
          if (effect) {
            collected.push(effect);
          }
        }

        await transaction.telegramUpdateFailureState.deleteMany({
          where: { updateId: update.update_id },
        });
        return collected;
      });

      // Outside the transaction on purpose — see `PostCommitEffect`. Reached
      // only once the write it depends on is durable, so a delivery failure
      // here can never leave a chat believing it is bound when it is not, or
      // the reverse.
      await this.deliverPostCommitEffects(effects);
      return true;
    } catch (error) {
      if (isDuplicateReceipt(error)) {
        if (!(await this.clearFailureState(update.update_id))) {
          throw new TelegramLeaseOwnershipLost();
        }
        return false;
      }
      throw error;
    }
  }

  /**
   * Delivers what `applyAction` decided to say once the write behind it is
   * durable. Best-effort: a failed reply here means the chat was bound (or
   * correctly refused) without hearing about it, which is a worse experience
   * than a lost confirmation, not a lost binding. Logged loudly rather than
   * silently dropped — a swallowed failure here is the same shape of defect
   * `content-factory-next-7jxo` named for the mail path.
   */
  private async deliverPostCommitEffects(effects: PostCommitEffect[]) {
    for (const effect of effects) {
      try {
        await this.bot.sendMessage(effect.chatId, effect.message);
      } catch (error) {
        this.logger.warn(
          `Telegram reply to chat could not be delivered`,
          redactSensitive(error)
        );
      }
    }
  }

  private async applyAction(
    transaction: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    updateId: number,
    action: TelegramUpdateAction
  ): Promise<PostCommitEffect | void> {
    if (action.kind === 'admin-bind') {
      const now = new Date();
      const candidate = await transaction.user.findFirst({
        where: {
          telegramBindingCode: action.code,
          telegramBindingCodeExpiresAt: { gt: now },
          // Defense in depth: this table has no gate of its own guaranteeing
          // a binding code only ever exists on a super-admin account, so the
          // lookup itself must not honour a match on any other account.
          isSuperAdmin: true,
        },
      });
      if (!candidate) {
        // Unknown and expired are indistinguishable on purpose — see
        // `adminBindDeclineMessage`.
        return {
          kind: 'send-message',
          chatId: action.chatId,
          message: adminBindDeclineMessage(resolveBackendLocale(undefined)),
        };
      }

      // Conditioned on the code still matching: two `/start` messages
      // racing on the same code (the same person double-tapping the link)
      // must bind exactly once, not twice with the second overwriting the
      // first chat.
      const claimed = await transaction.user.updateMany({
        where: { id: candidate.id, telegramBindingCode: action.code },
        data: {
          telegramChatId: action.chatId,
          telegramBindingCode: null,
          telegramBindingCodeExpiresAt: null,
        },
      });
      const locale = resolveBackendLocale(candidate.language);
      return {
        kind: 'send-message',
        chatId: action.chatId,
        message:
          claimed.count === 1
            ? adminBindSuccessMessage(locale)
            : adminBindDeclineMessage(locale),
      };
    }

    if (action.kind === 'support-relay') {
      if (!this.supportRelayTableAvailable) {
        // Postgres aborts the whole transaction on a failed statement, so this
        // cannot be caught after the fact: the receipt and every other action
        // for this update would be lost with it. Skipping keeps the update
        // consumable; the missing table is already logged once per outage.
        return;
      }

      await transaction.telegramSupportRelayOutbox.create({
        data: {
          updateId,
          sourceChatId: action.sourceChatId,
          sourceMessageId: action.sourceMessageId,
        },
      });
      return;
    }

    if (action.kind === 'connect') {
      await transaction.telegramUpdateReceipt.update({
        where: { updateId },
        data: {
          connectWord: action.word,
          connectChatId: action.chatId,
          connectMessageId: action.messageId,
        },
      });
      return;
    }

    if (action.kind === 'reaction-count') {
      await transaction.telegramPostMetric.upsert({
        where: {
          channelChatId_channelMessageId: {
            channelChatId: action.chatId,
            channelMessageId: action.messageId,
          },
        },
        create: {
          channelChatId: action.chatId,
          channelMessageId: action.messageId,
          reactionCount: action.total,
          reactionUpdatedAt: new Date(),
        },
        update: {
          reactionCount: action.total,
          reactionUpdatedAt: new Date(),
        },
      });
      return;
    }

    if (action.kind === 'discussion-forward') {
      await transaction.telegramPostMetric.upsert({
        where: {
          channelChatId_channelMessageId: {
            channelChatId: action.channelChatId,
            channelMessageId: action.channelMessageId,
          },
        },
        create: {
          channelChatId: action.channelChatId,
          channelMessageId: action.channelMessageId,
        },
        update: {},
      });
      await transaction.telegramDiscussionMessage.upsert({
        where: {
          discussionChatId_discussionMessageId: {
            discussionChatId: action.discussionChatId,
            discussionMessageId: action.discussionMessageId,
          },
        },
        create: {
          discussionChatId: action.discussionChatId,
          discussionMessageId: action.discussionMessageId,
          channelChatId: action.channelChatId,
          channelMessageId: action.channelMessageId,
        },
        update: {
          channelChatId: action.channelChatId,
          channelMessageId: action.channelMessageId,
        },
      });
      return;
    }

    const parent = await transaction.telegramDiscussionMessage.findUnique({
      where: {
        discussionChatId_discussionMessageId: {
          discussionChatId: action.discussionChatId,
          discussionMessageId: action.parentDiscussionMessageId,
        },
      },
    });
    if (!parent) {
      return;
    }

    await transaction.telegramDiscussionMessage.upsert({
      where: {
        discussionChatId_discussionMessageId: {
          discussionChatId: action.discussionChatId,
          discussionMessageId: action.discussionMessageId,
        },
      },
      create: {
        discussionChatId: action.discussionChatId,
        discussionMessageId: action.discussionMessageId,
        channelChatId: parent.channelChatId,
        channelMessageId: parent.channelMessageId,
      },
      update: {},
    });
    // The forward branch normally creates the metric row first, but the row
    // can also be missing — pruned, or the forward update was written off — and
    // a comment must still count rather than raise P2025.
    await transaction.telegramPostMetric.upsert({
      where: {
        channelChatId_channelMessageId: {
          channelChatId: parent.channelChatId,
          channelMessageId: parent.channelMessageId,
        },
      },
      create: {
        channelChatId: parent.channelChatId,
        channelMessageId: parent.channelMessageId,
        commentCount: 1,
      },
      update: { commentCount: { increment: 1 } },
    });
  }

  async getConnection(word: string) {
    // The controller validates too, but this service is also called directly;
    // an absent word must never reach Prisma, where it would drop the filter.
    if (typeof word !== 'string' || !word) {
      return {};
    }

    const receipt = await this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.telegramUpdateReceipt.findFirst({
        where: {
          connectWord: word,
          connectConsumedAt: null,
          createdAt: { gte: new Date(Date.now() - connectClaimWindowMs) },
        },
        orderBy: { updateId: 'asc' },
      });
      if (!candidate?.connectChatId || !candidate.connectMessageId) {
        return null;
      }

      const claimed = await transaction.telegramUpdateReceipt.updateMany({
        where: {
          updateId: candidate.updateId,
          connectConsumedAt: null,
        },
        data: { connectConsumedAt: new Date() },
      });
      return claimed.count === 1 ? candidate : null;
    });

    if (!receipt?.connectChatId || !receipt.connectMessageId) {
      return {};
    }

    try {
      await this.confirmConnection(
        receipt.connectChatId,
        receipt.connectMessageId
      );
    } catch (error) {
      this.logger.warn(
        'Telegram connection cleanup failed',
        redactSensitive(error)
      );
    }
    return { chatId: Number(receipt.connectChatId) };
  }

  /**
   * Pages every administrator who has bound a chat when approval mode writes
   * a new, switched-off account. Called from the registration path itself, so
   * it must never throw: a person who registered successfully must not see
   * that succeed as a failure because paging the administrators about it did
   * not go through.
   *
   * One admin's failed delivery does not stop another's — `Promise.allSettled`
   * rather than `Promise.all`, and each failure is logged loudly rather than
   * swallowed. An administrator who believes they will be paged and is not
   * must be discoverable from the log.
   */
  async notifyAdminsOfPendingApproval(email: string, createdAt: Date) {
    let admins: { id: string; telegramChatId: string | null; language: string }[];
    try {
      admins = await this.prisma.user.findMany({
        where: { isSuperAdmin: true, telegramChatId: { not: null } },
        select: { id: true, telegramChatId: true, language: true },
      });
    } catch (error) {
      this.logger.error(
        'Could not read which administrators have a bound Telegram chat; ' +
          'no approval-queue notification was sent for this registration',
        redactSensitive(error)
      );
      return;
    }

    if (admins.length === 0) {
      return;
    }

    const adminUrl = `${process.env.FRONTEND_URL}/admin/users`;
    const results = await Promise.allSettled(
      admins.map((admin) =>
        this.bot.sendMessage(
          admin.telegramChatId as string,
          pendingApprovalNotification(resolveBackendLocale(admin.language), {
            email,
            createdAt,
            adminUrl,
          })
        )
      )
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Telegram approval-queue notification to admin ${admins[index].id} failed`,
          redactSensitive(result.reason)
        );
      }
    });
  }

  async getPostMetrics(channelChatId: string, channelMessageId: string) {
    const metric = await this.prisma.telegramPostMetric.findUnique({
      where: {
        channelChatId_channelMessageId: {
          channelChatId,
          channelMessageId,
        },
      },
      select: {
        reactionCount: true,
        commentCount: true,
        updatedAt: true,
      },
    });

    return metric
      ? {
          reactions: metric.reactionCount,
          comments: metric.commentCount,
          collectedAt: metric.updatedAt.toISOString(),
        }
      : null;
  }

  private async confirmConnection(chatId: string, messageId: string) {
    const botId = (await this.bot.getMe()).id;
    const member = await this.bot.getChatMember(chatId, botId);
    const canDelete =
      (member.status === 'administrator' || member.status === 'creator') &&
      !!member.can_delete_messages;

    if (!canDelete) {
      await this.bot.sendMessage(
        chatId,
        "Connection Successful. I don't have admin privileges to delete these messages, please go ahead and remove them yourself."
      );
      return;
    }

    await this.bot.deleteMessage(chatId, Number(messageId));
    const confirmation = await this.bot.sendMessage(
      chatId,
      'Connection Successful. Message will be deleted in 10 seconds.'
    );
    setTimeout(() => {
      void this.bot.deleteMessage(chatId, confirmation.message_id);
    }, 10_000);
  }
}
