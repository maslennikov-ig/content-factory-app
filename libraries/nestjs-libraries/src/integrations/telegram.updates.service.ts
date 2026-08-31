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

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!process.env.TELEGRAM_TOKEN) {
      return;
    }

    this.running = true;
    void this.pollLoop();
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
      } catch (error) {
        // Every Telegram error carries the request URL, and the request URL
        // carries the bot token. Never log one of these raw.
        this.logger.error(
          'Telegram update polling failed',
          redactSensitive(error)
        );
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
      await this.prisma.$transaction(async (transaction) => {
        await this.fenceLease(transaction);
        await transaction.telegramUpdateReceipt.create({
          data: { updateId: update.update_id },
        });

        for (const action of parseTelegramUpdate(update)) {
          await this.applyAction(transaction, update.update_id, action);
        }

        await transaction.telegramUpdateFailureState.deleteMany({
          where: { updateId: update.update_id },
        });
      });
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

  private async applyAction(
    transaction: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    updateId: number,
    action: TelegramUpdateAction
  ) {
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
