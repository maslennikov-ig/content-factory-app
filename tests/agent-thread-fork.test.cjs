'use strict';

/**
 * Conversation branching & cloning (`content-factory-next-bxeb.2`):
 * - `AgentThreadsService.fork` clones an entire conversation via `Session.thread.clone()`
 *   or branches from a specific message (`upToMessageId`) via `memory.cloneThread`
 *   with `messageFilter.messageIds`, preserving `AgentWorkspaceV1` metadata and
 *   recording `forkedFromThreadId` / `forkedFromMessageId`.
 * - Rejects unknown `upToMessageId` with `AGENT_BAD_REQUEST` and enforces
 *   `{orgId}:{userId}` ownership (`AGENT_NOT_YOURS`).
 * - `POST /agent/threads/:id/fork` in `AgentController` exposes both full clone
 *   and message-level fork.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadTypeScriptModule: loadFrontendTs } = require('./helpers/load-tsx.cjs');

const noOp = () => () => undefined;
const stubs = {
  '@mastra/ai-sdk': { handleChatStream: jest.fn() },
  '@mastra/ai-sdk/ui': {
    toAISdkMessages: (messages) =>
      messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts ?? [] })),
  },
  '@mastra/memory': { Memory: class {} },
  '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
  '@nestjs/swagger': { ApiTags: noOp },
  '@contentfactory/backend/services/auth/permissions/permissions.ability': {
    CheckPolicies: noOp,
  },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
    AuthorizationActions: { Create: 'create' },
    Sections: { AI: 'ai' },
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
};

const { AgentThreadsService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts',
  stubs
);
const { AgentController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/agent.controller.ts',
  stubs
);
const { AGENT_WORKSPACE_METADATA_KEY } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/work-context.ts',
  stubs
);
const { readThreadList, readThreadHistory } = loadFrontendTs(
  'apps/frontend/src/components/agents/agent.contract.ts'
);

const IDENTITY_A = {
  organizationId: 'org-1',
  organizationCreatedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-a',
  role: 'EDITOR',
  language: 'ru',
};

const IDENTITY_B = {
  ...IDENTITY_A,
  userId: 'user-b',
};

const makeHarness = () => {
  const threads = new Map();
  const messages = [];
  const sessionCloneCalls = [];
  const memoryCloneCalls = [];
  const at = new Date('2026-10-20T12:00:00.000Z');

  const memory = {
    getThreadById: async ({ threadId }) => threads.get(threadId) ?? null,
    updateThread: async ({ id, title, metadata }) => {
      const prev = threads.get(id);
      const updated = {
        ...prev,
        ...(title !== undefined ? { title } : {}),
        ...(metadata ? { metadata: { ...(prev?.metadata ?? {}), ...metadata } } : {}),
        updatedAt: at,
      };
      threads.set(id, updated);
      return updated;
    },
    recall: async ({ threadId, resourceId }) => ({
      messages: messages.filter(
        (m) => m.threadId === threadId && m.resourceId === resourceId
      ),
    }),
    cloneThread: async (args) => {
      memoryCloneCalls.push(args);
      const source = threads.get(args.sourceThreadId);
      const clonedThread = {
        id: 'thread-cloned-mem',
        resourceId: args.resourceId ?? source.resourceId,
        title: args.title ?? source.title,
        createdAt: at,
        updatedAt: at,
        metadata: { ...(source.metadata ?? {}), ...(args.metadata ?? {}) },
      };
      threads.set(clonedThread.id, clonedThread);
      const allowedIds = args.options?.messageFilter?.messageIds
        ? new Set(args.options.messageFilter.messageIds)
        : null;
      const clonedMessages = messages
        .filter(
          (m) =>
            m.threadId === args.sourceThreadId &&
            (!allowedIds || allowedIds.has(m.id))
        )
        .map((m, idx) => ({
          ...m,
          id: `cloned-msg-${idx + 1}`,
          threadId: clonedThread.id,
        }));
      messages.push(...clonedMessages);
      return { thread: clonedThread, clonedMessages };
    },
  };

  const session = {
    thread: {
      clone: async (opts) => {
        sessionCloneCalls.push(opts);
        const source = threads.get(opts.sourceThreadId);
        const cloned = {
          id: 'thread-cloned-session',
          resourceId: opts.resourceId ?? source.resourceId,
          title: opts.title ?? source.title,
          createdAt: at,
          updatedAt: at,
          metadata: { ...(source.metadata ?? {}) },
        };
        threads.set(cloned.id, cloned);
        return cloned;
      },
    },
  };

  const mastraService = {
    conductor: async () => ({
      getMemory: async () => memory,
      listSuspendedRuns: async () => ({ runs: [] }),
    }),
    sessionFor: jest.fn(async () => session),
    validateWorkArtifact: jest.fn(async (_id, ref) => ref),
    resolveWorkContext: jest.fn(async (_id, ctx) => ({ context: ctx })),
  };

  const service = new AgentThreadsService(mastraService);
  return {
    threads,
    messages,
    sessionCloneCalls,
    memoryCloneCalls,
    service,
  };
};

describe('conversation forking and cloning (bxeb.2)', () => {
  test('clones a full thread via Session.thread.clone, preserving workspace metadata and recording forkedFromThreadId', async () => {
    const { threads, messages, sessionCloneCalls, service } = makeHarness();
    const workspace = {
      version: 'assistant-workspace/v1',
      workContext: { version: 'assistant-work-context/v1', kind: 'piece', id: 'p-1' },
      artifacts: [{ kind: 'piece', id: 'p-1' }],
      activeArtifact: { kind: 'piece', id: 'p-1' },
    };
    threads.set('t-source', {
      id: 't-source',
      resourceId: 'org-1:user-a',
      title: 'Разбор утреннего поста',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T10:05:00.000Z'),
      metadata: { [AGENT_WORKSPACE_METADATA_KEY]: workspace },
    });
    messages.push(
      {
        id: 'm-1',
        threadId: 't-source',
        resourceId: 'org-1:user-a',
        role: 'user',
        createdAt: new Date('2026-10-20T10:01:00.000Z'),
      },
      {
        id: 'm-2',
        threadId: 't-source',
        resourceId: 'org-1:user-a',
        role: 'assistant',
        createdAt: new Date('2026-10-20T10:02:00.000Z'),
      }
    );

    const forked = await service.fork(IDENTITY_A, 't-source');
    expect(sessionCloneCalls).toHaveLength(1);
    expect(sessionCloneCalls[0]).toEqual({
      sourceThreadId: 't-source',
      title: 'Разбор утреннего поста (ветка)',
      resourceId: 'org-1:user-a',
    });
    expect(forked).toEqual({
      id: 'thread-cloned-session',
      title: 'Разбор утреннего поста (ветка)',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      forkedFromThreadId: 't-source',
    });
    const stored = threads.get('thread-cloned-session');
    expect(stored.metadata[AGENT_WORKSPACE_METADATA_KEY]).toEqual(workspace);
  });

  test('forks from a specific message (upToMessageId), filtering messages up to that point and recording forkedFromMessageId', async () => {
    const { threads, messages, memoryCloneCalls, service } = makeHarness();
    threads.set('t-source', {
      id: 't-source',
      resourceId: 'org-1:user-a',
      title: 'Три гипотезы заголовка',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T10:05:00.000Z'),
      metadata: {},
    });
    messages.push(
      {
        id: 'm-1',
        threadId: 't-source',
        resourceId: 'org-1:user-a',
        role: 'user',
        createdAt: new Date('2026-10-20T10:01:00.000Z'),
      },
      {
        id: 'm-2',
        threadId: 't-source',
        resourceId: 'org-1:user-a',
        role: 'assistant',
        createdAt: new Date('2026-10-20T10:02:00.000Z'),
      },
      {
        id: 'm-3',
        threadId: 't-source',
        resourceId: 'org-1:user-a',
        role: 'user',
        createdAt: new Date('2026-10-20T10:03:00.000Z'),
      }
    );

    const forked = await service.fork(IDENTITY_A, 't-source', {
      upToMessageId: 'm-2',
    });

    expect(memoryCloneCalls).toHaveLength(1);
    expect(memoryCloneCalls[0].options).toEqual({
      messageFilter: {
        messageIds: ['m-1', 'm-2'],
      },
    });
    expect(forked).toMatchObject({
      id: 'thread-cloned-mem',
      title: 'Три гипотезы заголовка (ветка)',
      forkedFromThreadId: 't-source',
      forkedFromMessageId: 'm-2',
    });

    const clonedMsgs = messages.filter((m) => m.threadId === 'thread-cloned-mem');
    expect(clonedMsgs).toHaveLength(2);
  });

  test('rejects unknown upToMessageId with AGENT_BAD_REQUEST and blocks cross-user forking with AGENT_NOT_YOURS', async () => {
    const { threads, service } = makeHarness();
    threads.set('t-source', {
      id: 't-source',
      resourceId: 'org-1:user-a',
      title: 'Личный разговор',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T10:05:00.000Z'),
      metadata: {},
    });

    await expect(
      service.fork(IDENTITY_A, 't-source', { upToMessageId: 'non-existent' })
    ).rejects.toMatchObject({
      response: { code: 'AGENT_BAD_REQUEST' },
    });

    await expect(service.fork(IDENTITY_B, 't-source')).rejects.toMatchObject({
      response: { code: 'AGENT_NOT_YOURS' },
    });
  });

  test('POST /agent/threads/:id/fork passes upToMessageId and title to AgentThreadsService.fork and round-trips on the frontend contract', async () => {
    const fork = jest.fn(async (_identity, id, opts) => ({
      id: 't-branch-1',
      title: opts.title ?? 'Ветка',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      forkedFromThreadId: id,
      forkedFromMessageId: opts.upToMessageId,
    }));
    const controller = new AgentController({}, { fork }, {});
    const org = {
      id: 'org-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      users: [{ role: 'EDITOR' }],
    };
    const user = { id: 'user-a', language: 'ru' };

    const response = await controller.forkThread(org, user, 't-source', {
      upToMessageId: 'm-2',
      title: '  Альтернативный заход  ',
    });

    expect(fork).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-a' }),
      't-source',
      { upToMessageId: 'm-2', title: 'Альтернативный заход' }
    );

    const parsedList = readThreadList({ threads: [response] });
    expect(parsedList).toEqual([
      {
        id: 't-branch-1',
        title: 'Альтернативный заход',
        updatedAt: '2026-10-20T12:00:00.000Z',
        forkedFromThreadId: 't-source',
        forkedFromMessageId: 'm-2',
      },
    ]);

    const parsedHistory = readThreadHistory({
      thread: response,
      messages: [],
      pending: [],
    });
    expect(parsedHistory.thread).toMatchObject({
      id: 't-branch-1',
      forkedFromThreadId: 't-source',
      forkedFromMessageId: 'm-2',
    });
  });
});
