'use strict';

/**
 * T5 (`content-factory-next-bxeb.5`): Two-way Telegram assistant channel
 * (`TelegramAgentChannelService` + `TelegramUpdatesService` + `@mastra/core/channels`).
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const parser = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts'
);

const { TelegramUpdatesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error() {}
        warn() {}
        log() {}
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.update.parser':
      parser,
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'consumer-tg-agent',
    },
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind': {
      adminBindDeclineMessage: () => 'Command not recognized.',
      adminBindSuccessMessage: () => 'Done.',
      pendingApprovalNotification: () => 'Pending.',
    },
    '@contentfactory/nestjs-libraries/locale/backend-strings': {
      resolveBackendLocale: () => 'ru',
    },
    'node-telegram-bot-api': { __esModule: true, default: class {} },
  }
);

class StubMastraStateAdapter {
  constructor() {
    this.cache = new Map();
    this.locks = new Map();
    this.subscribed = new Set();
  }
  async connect() {}
  async subscribe(threadId) {
    this.subscribed.add(threadId);
  }
  async isSubscribed(threadId) {
    return this.subscribed.has(threadId);
  }
  async set(key, value) {
    this.cache.set(key, value);
  }
  async get(key) {
    return this.cache.get(key) ?? null;
  }
  async acquireLock(threadId, ttlMs) {
    if (this.locks.has(threadId)) return null;
    const lock = { threadId, token: 'lock-1', expiresAt: Date.now() + ttlMs };
    this.locks.set(threadId, lock);
    return lock;
  }
  async releaseLock(lock) {
    this.locks.delete(lock.threadId);
  }
}

const channelsCoreStub = {
  ChatChannelProcessor: class {
    constructor() {
      this.id = 'chat-channel-context';
    }
  },
  MastraStateAdapter: StubMastraStateAdapter,
  defaultTypingStatus: (chunk) =>
    chunk?.type === 'text-delta' ? 'is typing…' : false,
  formatToolApproval: (toolName, argsSummary) =>
    `*${toolName}* \`${argsSummary}\`\n⏸ Requires approval to run. Reply "approve" or "deny".`,
};

const conductorContext = loadCapabilityModule('../conductor/conductor.context.ts');
const agentChatRequest = loadCapabilityModule('../conductor/agent-chat.request.ts');
const approvalSummaryMod = loadCapabilityModule('approval-summary.ts');
const conductorExecution = loadCapabilityModule(
  '../conductor/conductor.execution.ts'
);
const secretShapes = loadCapabilityModule('../conductor/secret-shapes.ts');

const {
  TelegramAgentChannelService,
  parseTelegramApprovalCallbackData,
  formatTelegramApprovalCallbackData,
  telegramThreadIdForMember,
} = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/channels/telegram-agent-channel.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Optional: () => () => undefined,
      Logger: class {
        error() {}
        warn() {}
        log() {}
      },
    },
    '@mastra/core/channels': channelsCoreStub,
    '@contentfactory/nestjs-libraries/chat/mastra.service': {
      MastraService: class {},
    },
    '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service': {
      AgentThreadsService: class {},
    },
    '@contentfactory/nestjs-libraries/chat/conductor/conductor.context':
      conductorContext,
    '@contentfactory/nestjs-libraries/chat/conductor/agent-chat.request':
      agentChatRequest,
    '@contentfactory/nestjs-libraries/chat/capabilities/approval-summary':
      approvalSummaryMod,
    '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution':
      conductorExecution,
    '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes':
      secretShapes,
    '@contentfactory/nestjs-libraries/chat/mastra.store': {
      pStore: {
        getStore: async () => ({
          patchThread: async () => undefined,
          listThreads: async () => ({ threads: [] }),
        }),
      },
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
      TelegramUpdatesService,
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.update.parser':
      parser,
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
  }
);

function buildHarness({
  linkedUsers = [],
  pendingRuns = [],
  streamChunks = [
    { type: 'text-delta', payload: { text: 'Готово! Черновик создан.' } },
  ],
  transcribedText = 'Сделай короткий пост про обновление',
} = {}) {
  const supportOutbox = [];
  const receipts = new Set();

  const transaction = {
    telegramUpdateConsumerLease: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    telegramUpdateReceipt: {
      create: jest.fn(async ({ data }) => {
        if (receipts.has(data.updateId)) {
          throw { code: 'P2002', meta: { target: ['updateId'] } };
        }
        receipts.add(data.updateId);
        return {};
      }),
      update: jest.fn(async () => ({})),
    },
    telegramSupportRelayOutbox: {
      create: jest.fn(async ({ data }) => {
        supportOutbox.push(data);
        return data;
      }),
    },
    telegramUpdateFailureState: {
      upsert: jest.fn(async () => ({ attempts: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    userIdentity: {
      findFirst: jest.fn(async ({ where }) => {
        const ids = where?.providerIdentifier?.in ?? [];
        const found = linkedUsers.find(
          (u) => u.telegramUserId && ids.includes(String(u.telegramUserId))
        );
        return found ? { user: found } : null;
      }),
    },
    user: {
      findFirst: jest.fn(async ({ where }) => {
        const chatMatch = where?.OR?.find((c) => c.telegramChatId)?.telegramChatId;
        const found = linkedUsers.find(
          (u) => u.telegramChatId && String(u.telegramChatId) === String(chatMatch)
        );
        return found || null;
      }),
    },
  };

  const prisma = {
    $transaction: async (cb) => cb(transaction),
    telegramUpdateConsumerLease: {
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    telegramUpdateReceipt: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _max: { updateId: null } })),
      create: jest.fn(async () => ({})),
    },
    telegramPostMetric: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    telegramDiscussionMessage: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    telegramSupportRelayOutbox: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    telegramUpdateFailureState: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };

  const streamCalls = [];
  const conductor = {
    stream: jest.fn(async (messages, options) => {
      streamCalls.push({ messages, options });
      return {
        fullStream: (async function* () {
          for (const chunk of streamChunks) {
            yield chunk;
          }
        })(),
        text: Promise.resolve(
          streamChunks
            .filter((c) => c.type === 'text-delta')
            .map((c) => c.payload?.text ?? '')
            .join('')
        ),
      };
    }),
  };

  const mastraService = {
    conductor: jest.fn(async () => conductor),
    transcribeVoice: jest.fn(async () => ({ text: transcribedText })),
    toolTitle: jest.fn((_identity, toolName) =>
      toolName === 'post_schedule' ? 'Запланировать публикацию' : toolName
    ),
  };

  const currentPending = [...pendingRuns];
  const createdThreads = new Map();
  const threads = {
    ownThread: jest.fn(async (_identity, threadId) =>
      createdThreads.get(threadId) ?? null
    ),
    threadForMessage: jest.fn(async (identity, threadId, title) => {
      const row = {
        id: threadId,
        title,
        resourceId: conductorContext.conductorResourceId(
          identity.organizationId,
          identity.userId
        ),
      };
      createdThreads.set(threadId, row);
      return row;
    }),
    claimThreadTurn: jest.fn(async () => async () => undefined),
    pendingRuns: jest.fn(async () => currentPending),
    workContextForTurn: jest.fn(async () => null),
    startTurn: jest.fn(async (_identity, _threadId, _requestId, release) => ({
      run: async (fn) => fn(),
      finish: async () => {
        await release();
      },
    })),
    approvalCardShown: jest.fn(async () => undefined),
    describeApproval: jest.fn(
      async () => 'Канал «Новости продукта» · завтра в 10:00'
    ),
    claimRun: jest.fn(async () => async () => undefined),
    approvalContentNow: jest.fn(async () => 'digest-123'),
    approvalContentShown: jest.fn(async () => 'digest-123'),
    markAnswered: jest.fn(async () => {
      currentPending.length = 0;
    }),
  };

  const aiUsage = {
    beginAiOperation: jest.fn(async () => ({
      run: async (fn) => fn(),
      finish: async () => undefined,
    })),
  };

  const updatesService = new TelegramUpdatesService(prisma);
  const channelService = new TelegramAgentChannelService(
    mastraService,
    threads,
    aiUsage,
    updatesService
  );
  channelService.setFileDownloader(async () => Buffer.from('OggS-fake-voice'));

  const bot = {
    getUpdates: jest.fn(async () => []),
    sendMessage: jest.fn(async () => ({ message_id: 501 })),
    sendChatAction: jest.fn(async () => true),
    answerCallbackQuery: jest.fn(async () => true),
    editMessageReplyMarkup: jest.fn(async () => true),
  };
  updatesService.bot = bot;

  return {
    updatesService,
    channelService,
    mastraService,
    threads,
    aiUsage,
    bot,
    transaction,
    supportOutbox,
    streamCalls,
    currentPending,
  };
}

describe('Two-way Telegram assistant channel (content-factory-next-bxeb.5)', () => {
  const editorUser = {
    id: 'user-editor-1',
    name: 'Иван Редактор',
    language: 'ru',
    timezone: 'Europe/Moscow',
    activated: true,
    blockedAt: null,
    telegramUserId: '42001',
    organizations: [
      {
        organizationId: 'org-1',
        role: 'EDITOR',
        disabled: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        organization: {
          id: 'org-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      },
    ],
  };

  test('never starts a second getUpdates poller and enables callback_query on the shared consumer', async () => {
    const channelSource = read(
      'libraries/nestjs-libraries/src/chat/channels/telegram-agent-channel.service.ts'
    );
    expect(channelSource).not.toContain('.getUpdates(');

    const { updatesService, bot } = buildHarness();
    await updatesService.pollOnce();

    expect(bot.getUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_updates: [
          'message',
          'channel_post',
          'message_reaction_count',
          'callback_query',
        ],
      })
    );
  });

  test('routes private text messages from a linked EDITOR to their assistant session and injects @mastra/core/channels context', async () => {
    const { updatesService, bot, supportOutbox, streamCalls, threads } =
      buildHarness({
        linkedUsers: [editorUser],
      });

    await updatesService.processLeasedUpdate({
      update_id: 1001,
      message: {
        chat: { id: 42001, type: 'private' },
        from: { id: 42001, username: 'ivan_editor' },
        message_id: 11,
        text: 'Напиши анонс релиза для Telegram',
      },
    });

    // Not sent to support relay outbox
    expect(supportOutbox).toHaveLength(0);

    // Routed to the member's own resourceId and persistent Telegram thread
    expect(threads.threadForMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-editor-1',
        role: 'EDITOR',
      }),
      telegramThreadIdForMember({
        organizationId: 'org-1',
        userId: 'user-editor-1',
        chatId: '42001',
      }),
      'Напиши анонс релиза для Telegram'
    );

    expect(streamCalls).toHaveLength(1);
    const { options } = streamCalls[0];
    expect(options.memory).toEqual({
      thread: 'telegram-org-1-user-editor-1-42001',
      resource: 'org-1:user-editor-1',
    });

    // Verify @mastra/core/channels ChatChannelProcessor context is populated
    const channelCtx = options.requestContext.get('channel');
    expect(channelCtx).toEqual(
      expect.objectContaining({
        platform: 'telegram',
        isDM: true,
        userId: '42001',
        userName: 'Иван Редактор',
      })
    );

    expect(bot.sendMessage).toHaveBeenCalledWith(
      '42001',
      'Готово! Черновик создан.'
    );
  });

  test('preserves support-relay for /support commands from linked members and for unlinked users', async () => {
    const { updatesService, bot, supportOutbox, streamCalls } = buildHarness({
      linkedUsers: [editorUser],
    });

    // 1. Linked member explicitly sends /support -> goes to support-relay
    await updatesService.processLeasedUpdate({
      update_id: 1002,
      message: {
        chat: { id: 42001, type: 'private' },
        from: { id: 42001, username: 'ivan_editor' },
        message_id: 12,
        text: '/support Не проходит оплата по счёту',
      },
    });

    // 2. Unlinked user sends ordinary DM -> goes to support-relay
    await updatesService.processLeasedUpdate({
      update_id: 1003,
      message: {
        chat: { id: 99999, type: 'private' },
        from: { id: 99999, username: 'stranger' },
        message_id: 13,
        text: 'Привет, как подключить тариф?',
      },
    });

    expect(streamCalls).toHaveLength(0);
    expect(bot.sendMessage).not.toHaveBeenCalled();
    expect(supportOutbox).toEqual([
      { updateId: 1002, sourceChatId: '42001', sourceMessageId: 12 },
      { updateId: 1003, sourceChatId: '99999', sourceMessageId: 13 },
    ]);
  });

  test('transcribes voice notes via MastraService.transcribeVoice and runs the assistant turn', async () => {
    const { updatesService, mastraService, streamCalls, bot } = buildHarness({
      linkedUsers: [editorUser],
      transcribedText: 'Подготовь дайджест новостей за неделю',
    });

    await updatesService.processLeasedUpdate({
      update_id: 1004,
      message: {
        chat: { id: 42001, type: 'private' },
        from: { id: 42001 },
        message_id: 14,
        voice: {
          file_id: 'voice-file-id-1',
          mime_type: 'audio/ogg; codecs=opus',
          duration: 6,
        },
      },
    });

    expect(mastraService.transcribeVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-editor-1',
      }),
      {
        buffer: Buffer.from('OggS-fake-voice'),
        mimeType: 'audio/ogg',
      }
    );
    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].messages[0].parts).toEqual([
      { type: 'text', text: 'Подготовь дайджест новостей за неделю' },
    ]);
    expect(bot.sendMessage).toHaveBeenCalledWith(
      '42001',
      'Готово! Черновик создан.'
    );
  });

  test('posts inline Approve/Decline buttons for pending tool approvals and resumes on callback_query', async () => {
    const {
      updatesService,
      bot,
      threads,
      streamCalls,
      currentPending,
    } = buildHarness({
      linkedUsers: [editorUser],
      pendingRuns: [
        {
          runId: 'run_abc123',
          threadId: 'telegram-org-1-user-editor-1-42001',
          resourceId: 'org-1:user-editor-1',
          toolCalls: [
            {
              toolCallId: 'call_pub_1',
              toolName: 'post_schedule',
              requiresApproval: true,
              args: { adaptationId: 'adap-1' },
            },
          ],
        },
      ],
    });

    // Step 1: user message triggers a turn that suspends with a tool approval
    await updatesService.processLeasedUpdate({
      update_id: 1005,
      message: {
        chat: { id: 42001, type: 'private' },
        from: { id: 42001 },
        message_id: 15,
        text: 'Поставь пост в расписание на завтра',
      },
    });

    expect(bot.sendMessage).toHaveBeenCalledWith(
      '42001',
      expect.stringContaining('⏸ Требуется подтверждение: Запланировать публикацию'),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Подтвердить',
                callback_data: formatTelegramApprovalCallbackData(
                  true,
                  'run_abc123',
                  'call_pub_1'
                ),
              },
              {
                text: '❌ Отклонить',
                callback_data: formatTelegramApprovalCallbackData(
                  false,
                  'run_abc123',
                  'call_pub_1'
                ),
              },
            ],
          ],
        },
      }
    );

    // Step 2: user taps "✅ Подтвердить" inline button in Telegram
    // Restore pending run for callback verification before markAnswered clears it
    currentPending.splice(0, currentPending.length, {
      runId: 'run_abc123',
      threadId: 'telegram-org-1-user-editor-1-42001',
      resourceId: 'org-1:user-editor-1',
      toolCalls: [
        {
          toolCallId: 'call_pub_1',
          toolName: 'post_schedule',
          requiresApproval: true,
          args: { adaptationId: 'adap-1' },
        },
      ],
    });

    const callbackData = formatTelegramApprovalCallbackData(
      true,
      'run_abc123',
      'call_pub_1'
    );
    expect(parseTelegramApprovalCallbackData(callbackData)).toEqual({
      approved: true,
      runId: 'run_abc123',
      toolCallId: 'call_pub_1',
    });

    await updatesService.processLeasedUpdate({
      update_id: 1006,
      callback_query: {
        id: 'cbq-77',
        from: { id: 42001, username: 'ivan_editor' },
        message: {
          chat: { id: 42001, type: 'private' },
          message_id: 501,
        },
        data: callbackData,
      },
    });

    expect(threads.claimRun).toHaveBeenCalledWith('run_abc123');
    expect(threads.markAnswered).toHaveBeenCalledWith('run_abc123', [
      { toolCallId: 'call_pub_1' },
    ]);
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('cbq-77', {
      text: '✓ Подтверждено',
    });
    expect(bot.editMessageReplyMarkup).toHaveBeenCalledWith(
      { inline_keyboard: [] },
      { chat_id: '42001', message_id: 501 }
    );
    expect(streamCalls).toHaveLength(2);
    expect(streamCalls[1].messages[0]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        parts: [
          expect.objectContaining({
            type: 'tool-post_schedule',
            toolCallId: 'call_pub_1',
            state: 'approval-responded',
            approval: expect.objectContaining({
              id: 'run_abc123::call_pub_1',
              approved: true,
            }),
          }),
        ],
      })
    );
  });

  test('executes real @mastra/core/channels ChatChannelProcessor, MastraStateAdapter, and formatToolApproval', () => {
    const raw = execFileSync(
      process.execPath,
      [
        '-e',
        `
        (async () => {
          const {
            ChatChannelProcessor,
            MastraStateAdapter,
            formatToolApproval,
            defaultTypingStatus,
          } = require('@mastra/core/channels');
          const { RequestContext } = require('@mastra/core/request-context');

          const proc = new ChatChannelProcessor();
          const rc = new RequestContext();
          rc.set('channel', {
            platform: 'telegram',
            isDM: true,
            userId: '42001',
            userName: 'Иван Редактор',
            botUserName: 'contentfactory_bot',
          });
          const addedSystems = [];
          proc.processInputStep({
            requestContext: rc,
            messageList: {
              addSystem(msg, id) {
                addedSystems.push({ msg, id });
              },
            },
          });

          const state = new MastraStateAdapter({
            patchThread: async () => undefined,
            listThreads: async () => ({ threads: [] }),
          });
          await state.connect();
          const lock = await state.acquireLock('telegram:42001', 10000);
          const secondLock = await state.acquireLock('telegram:42001', 10000);
          await state.releaseLock(lock);

          const approvalText = formatToolApproval('post_schedule', '{ id: 1 }', 'call-1', false);
          const typing = defaultTypingStatus({ type: 'text-delta', payload: { text: 'Hi' } }, { platform: 'telegram' });

          process.stdout.write(JSON.stringify({
            systemId: addedSystems[0]?.id,
            systemContent: addedSystems[0]?.msg?.content,
            lockAcquired: Boolean(lock?.token),
            secondLockBlocked: secondLock === null,
            approvalText,
            typing,
          }));
        })().catch((err) => { console.error(err); process.exit(1); });
        `,
      ],
      { cwd: ROOT, encoding: 'utf8', timeout: 30_000 }
    );

    const report = JSON.parse(raw);
    expect(report.systemId).toBe('chat-channel-context');
    expect(report.systemContent).toContain('You are communicating via telegram.');
    expect(report.systemContent).toContain('This is a direct message (DM) conversation.');
    expect(report.lockAcquired).toBe(true);
    expect(report.secondLockBlocked).toBe(true);
    expect(report.approvalText).toContain('post_schedule');
    expect(report.typing).toBe('is typing…');
  });
});
