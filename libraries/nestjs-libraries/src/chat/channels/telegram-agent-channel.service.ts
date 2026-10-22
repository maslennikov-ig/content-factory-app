import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ChatChannelProcessor,
  MastraStateAdapter,
  defaultTypingStatus,
  formatToolApproval,
} from '@mastra/core/channels';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import { AgentThreadsService } from '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service';
import {
  CONDUCTOR_AGENT_ID,
  buildConductorContext,
  conductorResourceId,
} from '@contentfactory/nestjs-libraries/chat/conductor/conductor.context';
import {
  APPROVED_ON_CARD,
  DECLINED_ON_CARD,
  openProposalTargets,
  verifyPendingAnswer,
} from '@contentfactory/nestjs-libraries/chat/conductor/agent-chat.request';
import { approvalContentFingerprint } from '@contentfactory/nestjs-libraries/chat/capabilities/approval-summary';
import type { CapabilityIdentity } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.types';
import { createConductorExecution } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution';
import { withoutSecretShapes } from '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes';
import { pStore } from '@contentfactory/nestjs-libraries/chat/mastra.store';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { TelegramUpdatesService } from '@contentfactory/nestjs-libraries/integrations/telegram.updates.service';
import type {
  TelegramAgentChannelHandler,
  TelegramAgentLinkedMember,
  TelegramMessageLike,
  TelegramUpdateAction,
} from '@contentfactory/nestjs-libraries/integrations/telegram.update.parser';
import { redactSensitive } from '@contentfactory/nestjs-libraries/services/redact.sensitive';

export const TELEGRAM_APPROVAL_CALLBACK_PREFIX = 'cf_agent_';
export const TELEGRAM_APPROVE_ACTION_PREFIX = 'cf_agent_approve:';
export const TELEGRAM_DECLINE_ACTION_PREFIX = 'cf_agent_decline:';

const ROLE_PRIORITY: Record<'SUPERADMIN' | 'ADMIN' | 'EDITOR', number> = {
  SUPERADMIN: 3,
  ADMIN: 2,
  EDITOR: 1,
};

type TelegramBotLike = {
  sendMessage(
    chatId: string | number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<{ message_id?: number | string } | unknown>;
  sendChatAction?(chatId: string | number, action: string): Promise<unknown>;
  getFileLink?(fileId: string): Promise<string>;
  answerCallbackQuery?(
    callbackQueryId: string,
    options?: { text?: string; show_alert?: boolean }
  ): Promise<unknown>;
  editMessageText?(
    text: string,
    options?: {
      chat_id?: string | number;
      message_id?: number | string;
      reply_markup?: unknown;
    }
  ): Promise<unknown>;
  editMessageReplyMarkup?(
    replyMarkup: unknown,
    options?: {
      chat_id?: string | number;
      message_id?: number | string;
    }
  ): Promise<unknown>;
};

export const parseTelegramApprovalCallbackData = (
  data: string
): { approved: boolean; runId: string; toolCallId: string } | null => {
  if (typeof data !== 'string') return null;
  let approved: boolean;
  let rest: string;
  if (data.startsWith(TELEGRAM_APPROVE_ACTION_PREFIX)) {
    approved = true;
    rest = data.slice(TELEGRAM_APPROVE_ACTION_PREFIX.length);
  } else if (data.startsWith(TELEGRAM_DECLINE_ACTION_PREFIX)) {
    approved = false;
    rest = data.slice(TELEGRAM_DECLINE_ACTION_PREFIX.length);
  } else {
    return null;
  }
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator >= rest.length - 1) {
    return null;
  }
  const runId = rest.slice(0, separator).trim();
  const toolCallId = rest.slice(separator + 1).trim();
  if (!runId || !toolCallId) return null;
  return { approved, runId, toolCallId };
};

export const formatTelegramApprovalCallbackData = (
  approved: boolean,
  runId: string,
  toolCallId: string
): string =>
  `${approved ? TELEGRAM_APPROVE_ACTION_PREFIX : TELEGRAM_DECLINE_ACTION_PREFIX}${runId}:${toolCallId}`;

export const telegramThreadIdForMember = (
  member: Pick<TelegramAgentLinkedMember, 'organizationId' | 'userId' | 'chatId'>
): string =>
  `telegram-${member.organizationId}-${member.userId}-${member.chatId}`;

/**
 * Two-way Telegram assistant channel (`content-factory-next-bxeb.5`, `A2`).
 *
 * Uses `@mastra/core/channels` (`ChatChannelProcessor`, `MastraStateAdapter`,
 * `formatToolApproval`, `defaultTypingStatus`) and shares the single
 * `TelegramUpdatesService` long-poll consumer (`TELEGRAM_TOKEN`), routing DMs
 * and inline approval button callbacks from linked workspace members
 * (`EDITOR` / `ADMIN` / `SUPERADMIN`) to their personal `conductorResourceId(orgId, userId)`
 * assistant session.
 */
@Injectable()
export class TelegramAgentChannelService implements TelegramAgentChannelHandler {
  private readonly logger = new Logger(TelegramAgentChannelService.name);
  private stateAdapterInstance?: MastraStateAdapter;
  readonly channelProcessor = new ChatChannelProcessor();
  private fileDownloader: (
    bot: TelegramBotLike,
    fileId: string
  ) => Promise<Buffer> = async (bot, fileId) => {
    if (typeof bot.getFileLink !== 'function') {
      throw new Error('Telegram bot instance does not support getFileLink.');
    }
    const link = await bot.getFileLink(fileId);
    const response = await fetch(link, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Telegram file download failed with status ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  constructor(
    private readonly mastraService: MastraService,
    private readonly threads: AgentThreadsService,
    private readonly aiUsage: AiUsageService,
    @Optional()
    private readonly telegramUpdates?: TelegramUpdatesService
  ) {
    this.telegramUpdates?.registerAgentChannel(this);
  }

  /** Overrides the Telegram voice file downloader in unit tests. */
  setFileDownloader(
    downloader: (bot: TelegramBotLike, fileId: string) => Promise<Buffer>
  ) {
    this.fileDownloader = downloader;
  }

  async stateAdapter(): Promise<MastraStateAdapter> {
    if (!this.stateAdapterInstance) {
      const memoryStore = await pStore.getStore('memory').catch(() => null);
      const fallbackMemoryStore = {
        patchThread: async (): Promise<void> => undefined,
        listThreads: async (): Promise<{ threads: never[] }> => ({ threads: [] }),
      };
      this.stateAdapterInstance = new MastraStateAdapter(
        (memoryStore ?? fallbackMemoryStore) as any,
        () => CONDUCTOR_AGENT_ID
      );
      await this.stateAdapterInstance.connect();
    }
    return this.stateAdapterInstance;
  }

  async resolveLinkedMember(
    transaction: unknown,
    message: TelegramMessageLike
  ): Promise<TelegramAgentLinkedMember | null> {
    const chatId =
      message?.chat?.id !== undefined && message?.chat?.id !== null
        ? String(message.chat.id)
        : '';
    const fromUserId =
      message?.from?.id !== undefined && message?.from?.id !== null
        ? String(message.from.id)
        : chatId;
    if (!chatId || !fromUserId) return null;
    const member = await this.resolveLinkedMemberByTelegramId(
      transaction,
      fromUserId,
      chatId
    );
    if (!member) return null;
    const fallbackName =
      message.from?.username ||
      [message.from?.first_name, message.from?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      undefined;
    return {
      ...member,
      ...(member.userName ? {} : fallbackName ? { userName: fallbackName } : {}),
    };
  }

  async resolveLinkedMemberByTelegramId(
    transaction: unknown,
    telegramUserId: string,
    chatId: string
  ): Promise<TelegramAgentLinkedMember | null> {
    const tx = transaction as {
      userIdentity?: {
        findFirst?: (args: unknown) => Promise<any>;
      };
      user?: {
        findFirst?: (args: unknown) => Promise<any>;
      };
    };

    const userSelect = {
      id: true,
      name: true,
      language: true,
      timezone: true,
      activated: true,
      blockedAt: true,
      organizations: {
        where: {
          disabled: false,
          role: { in: ['SUPERADMIN', 'ADMIN', 'EDITOR'] },
        },
        select: {
          organizationId: true,
          role: true,
          createdAt: true,
          organization: {
            select: {
              id: true,
              createdAt: true,
            },
          },
        },
      },
    };

    let userRow: any = null;
    if (typeof tx?.userIdentity?.findFirst === 'function') {
      const identityMatch = await tx.userIdentity.findFirst({
        where: {
          provider: 'TELEGRAM',
          providerIdentifier: {
            in: Array.from(new Set([telegramUserId, chatId].filter(Boolean))),
          },
        },
        include: {
          user: {
            select: userSelect,
          },
        },
      });
      if (identityMatch?.user) {
        userRow = identityMatch.user;
      }
    }

    if (!userRow && typeof tx?.user?.findFirst === 'function') {
      userRow = await tx.user.findFirst({
        where: {
          activated: true,
          blockedAt: null,
          OR: [
            { telegramChatId: chatId },
            {
              providerName: 'TELEGRAM',
              providerId: {
                in: Array.from(new Set([telegramUserId, chatId].filter(Boolean))),
              },
            },
          ],
        },
        select: userSelect,
      });
    }

    if (!userRow || userRow.activated === false || userRow.blockedAt != null) {
      return null;
    }

    const memberships = Array.isArray(userRow.organizations)
      ? userRow.organizations.filter(
          (m: any) =>
            !m?.disabled &&
            (m?.role === 'SUPERADMIN' ||
              m?.role === 'ADMIN' ||
              m?.role === 'EDITOR')
        )
      : [];
    if (memberships.length === 0) {
      return null;
    }

    memberships.sort((a: any, b: any) => {
      const priorityDiff =
        (ROLE_PRIORITY[b.role as 'SUPERADMIN' | 'ADMIN' | 'EDITOR'] ?? 0) -
        (ROLE_PRIORITY[a.role as 'SUPERADMIN' | 'ADMIN' | 'EDITOR'] ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    const chosen = memberships[0];
    const orgCreatedAt =
      chosen.organization?.createdAt instanceof Date
        ? chosen.organization.createdAt.toISOString()
        : typeof chosen.organization?.createdAt === 'string'
          ? chosen.organization.createdAt
          : new Date(0).toISOString();

    return {
      organizationId: String(chosen.organizationId),
      organizationCreatedAt: orgCreatedAt,
      userId: String(userRow.id),
      role: chosen.role as 'SUPERADMIN' | 'ADMIN' | 'EDITOR',
      language: userRow.language === 'en' ? 'en' : 'ru',
      timeZone:
        typeof userRow.timezone === 'string' && userRow.timezone.trim()
          ? userRow.timezone.trim()
          : 'Europe/Moscow',
      chatId: String(chatId),
      telegramUserId: String(telegramUserId),
      ...(typeof userRow.name === 'string' && userRow.name.trim()
        ? { userName: userRow.name.trim() }
        : {}),
    };
  }

  private toCapabilityIdentity(
    member: TelegramAgentLinkedMember
  ): CapabilityIdentity {
    return {
      organizationId: member.organizationId,
      organizationCreatedAt: member.organizationCreatedAt,
      userId: member.userId,
      role: member.role,
      language: member.language,
      timeZone: member.timeZone,
    };
  }

  async ensureTelegramThread(
    member: TelegramAgentLinkedMember,
    initialTitleText: string
  ): Promise<string> {
    const identity = this.toCapabilityIdentity(member);
    const threadId = telegramThreadIdForMember(member);
    const externalThreadId = `telegram:${member.chatId}`;
    const existing = await this.threads.ownThread(identity, threadId);
    if (!existing) {
      await this.threads.threadForMessage(
        identity,
        threadId,
        initialTitleText || 'Telegram'
      );
    }
    const state = await this.stateAdapter();
    await state.set(`thread:${externalThreadId}`, threadId, 24 * 60 * 60 * 1_000);
    await state.subscribe(externalThreadId).catch(() => undefined);
    return threadId;
  }

  async handleIncomingMessage(
    rawBot: unknown,
    member: TelegramAgentLinkedMember,
    message: TelegramMessageLike
  ): Promise<void> {
    const bot = rawBot as TelegramBotLike;
    const identity = this.toCapabilityIdentity(member);
    const externalThreadId = `telegram:${member.chatId}`;
    const state = await this.stateAdapter();
    const lock = await state.acquireLock(externalThreadId, 60_000);
    if (!lock) {
      await bot.sendMessage(
        member.chatId,
        member.language === 'en'
          ? '⏳ The previous request is still running. Please wait a moment.'
          : '⏳ Предыдущее поручение ещё выполняется. Подождите пару секунд.'
      );
      return;
    }

    try {
      let promptText = (message.text ?? message.caption ?? '').trim();
      const voiceOrAudio = message.voice ?? message.audio;
      if (voiceOrAudio?.file_id) {
        await bot.sendChatAction?.(member.chatId, 'typing').catch(() => undefined);
        const audioBuffer = await this.fileDownloader(bot, voiceOrAudio.file_id);
        const rawMime = (voiceOrAudio.mime_type ?? 'audio/ogg')
          .split(';')[0]
          ?.trim()
          .toLowerCase();
        const mimeType =
          rawMime === 'audio/oga' || rawMime === 'audio/opus'
            ? 'audio/ogg'
            : rawMime || 'audio/ogg';
        const { text: transcribed } = await this.mastraService.transcribeVoice(
          identity,
          {
            buffer: audioBuffer,
            mimeType,
          }
        );
        if (!transcribed.trim() && !promptText) {
          await bot.sendMessage(
            member.chatId,
            member.language === 'en'
              ? 'Could not recognize speech in the voice message. Please try again.'
              : 'Не удалось распознать речь в голосовом сообщении. Попробуйте ещё раз.'
          );
          return;
        }
        promptText = promptText
          ? `${transcribed.trim()}\n${promptText}`
          : transcribed.trim();
      }

      if (!promptText) {
        return;
      }

      const threadId = await this.ensureTelegramThread(member, promptText);
      await this.executeAgentTurn({
        bot,
        member,
        identity,
        threadId,
        messages: [
          {
            id: `tg-msg-${message.message_id ?? randomUUID()}`,
            role: 'user',
            parts: [{ type: 'text', text: promptText }],
          },
        ],
      });
    } catch (error) {
      this.logger.warn(
        'Telegram assistant message handling failed',
        redactSensitive(error)
      );
      await bot
        .sendMessage(
          member.chatId,
          member.language === 'en'
            ? 'Could not complete the request right now. Please try again in a moment.'
            : 'Не удалось выполнить поручение сейчас. Попробуйте чуть позже.'
        )
        .catch(() => undefined);
    } finally {
      await state.releaseLock(lock);
    }
  }

  async handleCallbackQuery(
    rawBot: unknown,
    member: TelegramAgentLinkedMember,
    action: Extract<TelegramUpdateAction, { kind: 'agent-callback' }>
  ): Promise<void> {
    const bot = rawBot as TelegramBotLike;
    const parsed = parseTelegramApprovalCallbackData(action.data);
    if (!parsed) {
      await bot
        .answerCallbackQuery?.(action.callbackQueryId, {
          text:
            member.language === 'en'
              ? 'Unrecognized action.'
              : 'Действие не распознано.',
        })
        .catch(() => undefined);
      return;
    }

    const identity = this.toCapabilityIdentity(member);
    const threadId = telegramThreadIdForMember(member);
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    let releaseRun: (() => Promise<void>) | null = null;

    try {
      const runs = await this.threads.pendingRuns(identity, threadId);
      const verified = verifyPendingAnswer(
        {
          mode: 'approval',
          threadId,
          messageId: `tg-approval-${parsed.runId}-${parsed.toolCallId}`,
          approvals: [
            {
              runId: parsed.runId,
              toolCallId: parsed.toolCallId,
              approved: parsed.approved,
            },
          ],
        },
        runs,
        { threadId, resourceId }
      );

      releaseRun = await this.threads.claimRun(verified.runId);
      if (!releaseRun) {
        await bot
          .answerCallbackQuery?.(action.callbackQueryId, {
            text:
              member.language === 'en'
                ? 'This card is already being processed.'
                : 'Эта карточка уже обрабатывается.',
          })
          .catch(() => undefined);
        return;
      }

      const contentPrints: string[] = [];
      for (const call of verified.approved ?? []) {
        const now = await this.threads.approvalContentNow(
          identity,
          call.toolName,
          call.args
        );
        if (!now) continue;
        const shown = await this.threads.approvalContentShown(
          verified.runId,
          call.toolCallId
        );
        contentPrints.push(
          approvalContentFingerprint(call.toolName, call.args, shown ?? now)
        );
      }

      await this.threads.markAnswered(verified.runId, [
        { toolCallId: parsed.toolCallId },
      ]);

      const statusText = parsed.approved
        ? member.language === 'en'
          ? '✓ Approved'
          : '✓ Подтверждено'
        : member.language === 'en'
          ? '✗ Declined'
          : '✗ Отклонено';

      await bot
        .answerCallbackQuery?.(action.callbackQueryId, { text: statusText })
        .catch(() => undefined);
      await bot
        .editMessageReplyMarkup?.(
          { inline_keyboard: [] },
          {
            chat_id: action.chatId,
            message_id: Number(action.messageId) || action.messageId,
          }
        )
        .catch(() => undefined);

      const stepNotes: string[] = [];
      if (verified.declined) stepNotes.push(DECLINED_ON_CARD);
      if (verified.approved?.length) stepNotes.push(APPROVED_ON_CARD);

      await this.executeAgentTurn({
        bot,
        member,
        identity,
        threadId,
        messages: verified.approvalMessage ? [verified.approvalMessage] : [],
        fingerprints: [...verified.fingerprints, ...contentPrints],
        stepNotes,
      });
    } catch (error) {
      this.logger.warn(
        'Telegram assistant approval callback failed',
        redactSensitive(error)
      );
      await bot
        .answerCallbackQuery?.(action.callbackQueryId, {
          text:
            member.language === 'en'
              ? 'This confirmation card is no longer active.'
              : 'Эта карточка подтверждения уже закрыта.',
        })
        .catch(() => undefined);
    } finally {
      await releaseRun?.();
    }
  }

  private async executeAgentTurn(args: {
    bot: TelegramBotLike;
    member: TelegramAgentLinkedMember;
    identity: CapabilityIdentity;
    threadId: string;
    messages: unknown[];
    fingerprints?: string[];
    stepNotes?: string[];
  }) {
    const { bot, member, identity, threadId } = args;
    const resourceId = conductorResourceId(
      identity.organizationId,
      identity.userId
    );
    const requestId = randomUUID();
    const abort = new AbortController();
    const execution = createConductorExecution({
      requestId,
      signal: abort.signal,
    });
    const releaseThread = await this.threads.claimThreadTurn(identity, threadId);

    try {
      const openProposals = openProposalTargets(
        await this.threads.pendingRuns(identity, threadId)
      );
      const workContext = await this.threads.workContextForTurn(
        identity,
        threadId
      );
      const requestContext = buildConductorContext({
        identity,
        threadId,
        executionPolicy: execution.policy,
        approvals: args.fingerprints ?? [],
        openProposals,
        requestId,
        trackExecution: true,
        workContext,
      });

      // Populate `@mastra/core/channels` channel context so `ChatChannelProcessor`
      // injects the Telegram DM context into the system prompt on every step.
      requestContext.set('channel' as any, {
        platform: 'telegram',
        isDM: true,
        userId: member.telegramUserId,
        userName: member.userName,
        botUserName: process.env.TELEGRAM_BOT_NAME?.trim(),
      });

      const admission = await this.aiUsage.beginAiOperation(
        identity.organizationId,
        'agent',
        'agent'
      );

      let turnSucceeded = false;
      let replyText = '';
      const turn = await this.threads.startTurn(
        identity,
        threadId,
        requestId,
        releaseThread
      );

      try {
        await bot.sendChatAction?.(member.chatId, 'typing').catch(() => undefined);
        const conductor = (await this.mastraService.conductor()) as any;
        await execution.run(() =>
          turn.run(() =>
            admission.run(async () => {
              const streamResult = await conductor.stream(args.messages, {
                requestContext: requestContext as any,
                memory: { thread: threadId, resource: resourceId },
                ...execution.streamOptions(args.stepNotes ?? []),
                abortSignal: execution.signal,
              });

              if (streamResult?.fullStream) {
                for await (const chunk of streamResult.fullStream) {
                  const status = defaultTypingStatus(chunk as any, {
                    platform: 'telegram',
                  } as any);
                  if (status) {
                    await bot
                      .sendChatAction?.(member.chatId, 'typing')
                      .catch(() => undefined);
                  }
                  if (
                    chunk?.type === 'text-delta' &&
                    typeof (chunk.payload?.text ?? chunk.textDelta) === 'string'
                  ) {
                    replyText += chunk.payload?.text ?? chunk.textDelta;
                  }
                }
              }
              if (!replyText && typeof streamResult?.text === 'string') {
                replyText = streamResult.text;
              } else if (
                !replyText &&
                streamResult?.text &&
                typeof streamResult.text.then === 'function'
              ) {
                replyText = (await streamResult.text) ?? '';
              }
            })
          )
        );
        turnSucceeded = true;
      } finally {
        await turn
          .finish(turnSucceeded ? 'completed' : 'failed')
          .catch(() => undefined);
        await admission.finish(turnSucceeded);
      }

      const cleanReply = withoutSecretShapes(replyText).trim();
      if (cleanReply) {
        await bot.sendMessage(member.chatId, cleanReply);
      }

      // Surface any newly suspended tool-approval cards as Telegram inline buttons.
      const pendingRuns = await this.threads.pendingRuns(identity, threadId);
      const state = await this.stateAdapter();
      for (const run of pendingRuns) {
        for (const call of run.toolCalls) {
          if (!call.requiresApproval || !call.toolCallId) continue;
          await this.threads
            .approvalCardShown(
              identity,
              run.runId,
              call.toolCallId,
              call.toolName,
              call.args ?? {}
            )
            .catch(() => undefined);

          const title =
            this.mastraService.toolTitle?.(identity, call.toolName) ??
            call.toolName ??
            'Действие';
          const description = await this.threads.describeApproval(
            identity,
            call.toolName,
            call.args ?? {}
          );
          const nativePrompt = String(
            formatToolApproval(
              title,
              description ?? '',
              call.toolCallId,
              false
            )
          );
          const cardText =
            member.language === 'en'
              ? `⏸ Confirmation required: ${title}${description ? `\n${description}` : ''}`
              : `⏸ Требуется подтверждение: ${title}${description ? `\n${description}` : ''}`;

          await state.set(
            `approval:${run.runId}:${call.toolCallId}`,
            {
              runId: run.runId,
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              nativePrompt,
            },
            24 * 60 * 60 * 1_000
          );

          await bot.sendMessage(member.chatId, withoutSecretShapes(cardText), {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      member.language === 'en'
                        ? '✅ Approve'
                        : '✅ Подтвердить',
                    callback_data: formatTelegramApprovalCallbackData(
                      true,
                      run.runId,
                      call.toolCallId
                    ),
                  },
                  {
                    text:
                      member.language === 'en' ? '❌ Decline' : '❌ Отклонить',
                    callback_data: formatTelegramApprovalCallbackData(
                      false,
                      run.runId,
                      call.toolCallId
                    ),
                  },
                ],
              ],
            },
          });
        }
      }
    } finally {
      await releaseThread();
    }
  }
}
