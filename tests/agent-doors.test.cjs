'use strict';

/**
 * The `/agent` doors (`content-factory-next-kcxz.8`): one `agent` operation
 * per model-running request, free reads, personal threads, server-built turns.
 *
 * The controller and `AgentThreadsService` are the real ones; Mastra is an
 * in-memory stand-in with the same method shapes (memory threads, suspended
 * runs), and `handleChatStream` is a stub that hands back the stream a test
 * scripts. The agent inside Mastra is proven in `agent-conductor.agent.test.cjs`.
 *
 * Premortem rows: U2, U3, U4, S2, S4, S5, S6, S7, A3.
 */

const { EventEmitter } = require('node:events');
const { Reflector } = require('@nestjs/core');
const { Logger } = require('@nestjs/common');
const { ThrottlerStorageService } = require('@nestjs/throttler');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { approvalFingerprint: fingerprintOf } = require('./helpers/agent-capabilities.cjs')
  .loadCapabilityModule('approval-fingerprint.ts');
const { questionCardId: CARD } = require('./helpers/agent-capabilities.cjs').loadCapabilityModule(
  'question-card.ts'
);
const { approvalContentFingerprint } = require('./helpers/agent-capabilities.cjs').loadCapabilityModule(
  'approval-summary.ts'
);
/**
 * What «Нет» on an approval card leaves in the thread (W3 walk P3-K), and what
 * the model reads about it on that request only (correctness review F9).
 */
const { DECLINED_ON_CARD, DECLINED_STORED } = require('./helpers/agent-capabilities.cjs').loadCapabilityModule(
  '../conductor/agent-chat.request.ts'
);
/** The id of the avatar card `pendingQuestion` leaves waiting (review W2 F3). */
const QUESTION_CARD = CARD({ question: 'Включить?' });

const noOp = () => () => undefined;

/** ESM-first packages and the Nest-only decorators, stubbed for every file. */
const stubs = (handleChatStream) => ({
  '@mastra/ai-sdk': { handleChatStream },
  '@mastra/ai-sdk/ui': {
    toAISdkMessages: (messages) =>
      messages.map((message) => ({ id: message.id, role: message.role, parts: message.parts })),
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
});

const ORG = { id: 'org-1', createdAt: '2026-01-01T00:00:00.000Z', users: [{ role: 'EDITOR' }] };
const USER_A = { id: 'user-a', language: 'ru' };
const USER_B = { id: 'user-b', language: 'ru' };
const RESOURCE_A = 'org-1:user-a';
const RESOURCE_B = 'org-1:user-b';

/** Mastra's memory and suspended runs, in memory. */
const fakeMastra = () => {
  const threads = new Map();
  const messages = [];
  const runs = [];
  const at = new Date('2026-09-27T09:00:00.000Z');
  const memory = {
    getThreadById: async ({ threadId }) => threads.get(threadId) ?? null,
    listThreads: async ({ filter }) => ({
      threads: [...threads.values()].filter((thread) => thread.resourceId === filter.resourceId),
    }),
    createThread: async ({ threadId, resourceId, title }) => {
      const thread = { id: threadId, resourceId, title, createdAt: at, updatedAt: at, metadata: {} };
      threads.set(threadId, thread);
      return thread;
    },
    updateThread: async ({ id, title, metadata }) => {
      const thread = { ...threads.get(id), title, metadata };
      threads.set(id, thread);
      return thread;
    },
    deleteThread: async (threadId) => void threads.delete(threadId),
    recall: async ({ threadId, resourceId }) => ({
      messages: messages.filter(
        (message) => message.threadId === threadId && message.resourceId === resourceId
      ),
    }),
  };
  const conductor = {
    getMemory: async () => memory,
    listSuspendedRuns: async ({ threadId, resourceId }) => ({
      runs: runs.filter((run) => run.threadId === threadId && run.resourceId === resourceId),
    }),
  };
  const deletedRuns = [];
  const workflows = {
    deleteWorkflowRunById: async ({ runId, workflowName }) => {
      deletedRuns.push([runId, workflowName]);
      const index = runs.findIndex((run) => run.runId === runId);
      if (index !== -1) runs.splice(index, 1);
    },
  };
  // What a post card would send out now (review W2 F4); a test edits it.
  const content = { text: 'Первый текст' };
  const mastraService = {
    approvalContent: jest.fn(async (_identity, toolName) =>
      toolName === 'plan_publish_now' ? `digest:${content.text}` : null
    ),
    mastra: async () => ({ name: 'mastra', getStorage: () => ({ getStore: async () => workflows }) }),
    conductor: async () => conductor,
    // The registry's describer, reading the caller's workspace (review W1 F1).
    describeApproval: jest.fn(async (identity, toolName, args) =>
      toolName === 'piece_delete'
        ? `Удалить заготовку cnt-01 «Про созвоны» (${identity.organizationId}, ${args.pieceId})`
        : null
    ),
  };
  return { threads, messages, runs, memory, mastraService, deletedRuns, content };
};

/** A UI message stream that plays `parts`, then either ends or waits. */
const scriptedStream = (parts, { hang = false } = {}) => {
  const state = { cancelled: false };
  const stream = new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      if (!hang) controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
};

/** An Express response that records what was written. */
class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
    this.headersSent = false;
    this.writableEnded = false;
    this.statusCode = undefined;
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }
  flushHeaders() {
    this.headersSent = true;
  }
  write(chunk) {
    this.headersSent = true;
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
  }
  parts() {
    return this.chunks
      .map((chunk) => chunk.replace(/^data: /, '').trim())
      .filter((line) => line && line !== '[DONE]')
      .map((line) => JSON.parse(line));
  }
}

const setup = ({ parts = [{ type: 'start' }, { type: 'finish' }], hang = false, claims } = {}) => {
  const mastra = fakeMastra();
  const scripted = { current: null };
  const handleChatStream = jest.fn(async () => {
    scripted.current = scriptedStream(parts, { hang });
    return scripted.current.stream;
  });
  const modules = stubs(handleChatStream);
  const { AgentThreadsService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts',
    modules
  );
  const { AgentController } = loadTypeScriptModule(
    'apps/backend/src/api/routes/agent.controller.ts',
    modules
  );
  const admissions = [];
  const aiUsage = {
    beginAiOperation: jest.fn(async (organizationId, operation, role) => {
      const admission = { organizationId, operation, role, finished: [] };
      admissions.push(admission);
      return {
        run: (callback) => callback(),
        finish: async (succeeded) => void admission.finished.push(succeeded),
      };
    }),
  };
  const threads = new AgentThreadsService(mastra.mastraService, claims);
  const controller = new AgentController(mastra.mastraService, threads, aiUsage);
  return { controller, mastra, handleChatStream, aiUsage, admissions, scripted };
};

const userMessage = (text = 'что у нас есть?') => ({
  id: 'msg-user-1',
  role: 'user',
  parts: [{ type: 'text', text }],
});

const chat = async (context, body, user = USER_A) => {
  const res = new FakeResponse();
  await context.controller.chat(ORG, user, body, res);
  return res;
};

const pendingApproval = (mastra, { resourceId = RESOURCE_A, threadId = 'thread-a-1' } = {}) =>
  mastra.runs.push({
    runId: 'run-approve-1',
    threadId,
    resourceId,
    toolCalls: [
      { toolCallId: 'call-1', toolName: 'piece_delete', args: { pieceId: 'p1' }, requiresApproval: true },
    ],
  });

const pendingQuestion = (mastra, { resourceId = RESOURCE_A, threadId = 'thread-a-1' } = {}) =>
  mastra.runs.push({
    runId: 'run-question-1',
    threadId,
    resourceId,
    toolCalls: [
      {
        toolCallId: 'call-7',
        toolName: 'avatar_activate',
        requiresApproval: false,
        suspendPayload: { question: 'Включить?' },
      },
    ],
  });

const approvalBody = (overrides = {}) => ({
  threadId: 'thread-a-1',
  messages: [
    {
      id: 'msg-assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-piece_delete',
          toolCallId: 'call-1',
          state: 'approval-responded',
          // Tampered: the card showed p1.
          input: { pieceId: 'p2' },
          approval: { id: 'run-approve-1::call-1', approved: true },
        },
      ],
    },
  ],
  ...overrides,
});

const threadOf = async (context, id, resourceId, title = 'Разговор') =>
  context.mastra.memory.createThread({ threadId: id, resourceId, title });

describe('U4: opening the screen spends nothing; each model-running request opens exactly one', () => {
  test('threads, history with pending cards, rename and delete open no operation', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingQuestion(context.mastra);
    context.mastra.messages.push({
      id: 'm1',
      role: 'user',
      parts: [{ type: 'text', text: 'привет' }],
      threadId: 'thread-a-1',
      resourceId: RESOURCE_A,
    });

    const list = await context.controller.listThreads(ORG, USER_A);
    const history = await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    await context.controller.renameThread(ORG, USER_A, 'thread-a-1', { title: 'Про созвоны' });
    await context.controller.deleteThread(ORG, USER_A, 'thread-a-1');

    expect(list.threads.map((thread) => thread.id)).toEqual(['thread-a-1']);
    expect(history.messages).toEqual([{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'привет' }] }]);
    expect(history.pending).toEqual([
      {
        runId: 'run-question-1',
        toolCallId: 'call-7',
        toolName: 'avatar_activate',
        kind: 'question',
        // The card as the live part showed it: with its id (review W2 F3).
        suspendPayload: { question: 'Включить?', cardId: QUESTION_CARD },
      },
    ]);
    expect(context.mastra.threads.has('thread-a-1')).toBe(false);
    // F12: what waited in the deleted thread is deleted with it.
    expect(context.mastra.deletedRuns).toEqual([
      ['run-question-1', 'agentic-loop'],
      ['run-question-1', 'durable-agentic-loop'],
    ]);
    expect(context.mastra.runs).toEqual([]);
    expect(context.aiUsage.beginAiOperation).not.toHaveBeenCalled();
    expect(context.handleChatStream).not.toHaveBeenCalled();
  });

  test('a message opens one `agent` operation with role `agent`, closed as a success', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = await chat(context, { threadId: 'thread-a-1', messages: [userMessage()] });
    expect(context.admissions).toEqual([
      { organizationId: 'org-1', operation: 'agent', role: 'agent', finished: [true] },
    ]);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(res.headers['x-agent-thread-id']).toBe('thread-a-1');
    expect(res.parts().map((part) => part.type)).toEqual(['start', 'finish']);
    expect(res.chunks.at(-1)).toBe('data: [DONE]\n\n');
    expect(res.writableEnded).toBe(true);
  });

  test('an approval answer and a question answer each open exactly one, and reach the agent', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingApproval(context.mastra);
    pendingQuestion(context.mastra);

    await chat(context, approvalBody());
    await chat(context, {
      threadId: 'thread-a-1',
      runId: 'run-question-1',
      cardId: QUESTION_CARD,
      resumeData: { consentGiven: true },
    });

    expect(context.admissions.map((admission) => admission.finished)).toEqual([[true], [true]]);
    const [approval, resume] = context.handleChatStream.mock.calls.map(([options]) => options);
    // The approval: the stored call, and its fingerprint granted for this request.
    expect(approval.params.messages).toEqual([
      {
        id: 'msg-assistant-1',
        role: 'assistant',
        parts: [
          expect.objectContaining({
            type: 'tool-piece_delete',
            input: { pieceId: 'p1' },
            approval: { id: 'run-approve-1::call-1', approved: true },
          }),
        ],
      },
    ]);
    expect(approval.params.requestContext.get('cf.approvals')).toBe(
      fingerprintOf('piece_delete', { pieceId: 'p1' })
    );
    expect(approval.params.requestContext.get('cf.paidLimit')).toBe(2);
    expect(approval.params.maxSteps).toBe(7);
    // The question: resumed by its run and its pinned call (review W1 F7),
    // with the ordinary paid cap (F3).
    expect(resume.params).toMatchObject({
      runId: 'run-question-1',
      toolCallId: 'call-7',
      resumeData: { consentGiven: true },
      messages: [],
    });
    expect(resume.params.requestContext.get('cf.paidLimit')).toBe(1);
  });
});

describe('S5: the turn is built by the server', () => {
  test('memory, request context, limits, tool choice and provider options in the body change nothing', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    await chat(context, {
      threadId: 'thread-a-1',
      messages: [userMessage()],
      memory: { thread: 'thread-b-1', resource: RESOURCE_B },
      requestContext: { 'cf.role': 'ADMIN', mastra__resourceId: RESOURCE_B },
      maxSteps: 50,
      toolChoice: { type: 'tool', toolName: 'piece_delete' },
      providerOptions: { openai: { reasoningEffort: 'high' } },
      activeTools: ['piece_delete'],
    });
    const [{ params, version, agentId, onError }] = context.handleChatStream.mock.calls[0];
    expect(version).toBe('v7');
    expect(agentId).toBe('content-factory');
    expect(onError).toEqual(expect.any(Function));
    expect(Object.keys(params).sort()).toEqual(
      ['abortSignal', 'maxSteps', 'memory', 'messages', 'prepareStep', 'requestContext'].sort()
    );
    // The last step of the cap speaks (W3 walk P2-B): built by the server.
    expect(params.prepareStep({ stepNumber: 6, systemMessages: [] })).toMatchObject({ toolChoice: 'none' });
    expect(params.prepareStep({ stepNumber: 5, systemMessages: [] })).toBeUndefined();
    expect(params.memory).toEqual({ thread: 'thread-a-1', resource: RESOURCE_A });
    expect(params.maxSteps).toBe(7);
    expect(params.requestContext.get('mastra__resourceId')).toBe(RESOURCE_A);
    expect(params.requestContext.get('cf.role')).toBe('EDITOR');
    expect(params.requestContext.get('cf.paidLimit')).toBe(1);
    expect(params.messages).toEqual([
      { id: 'msg-user-1', role: 'user', parts: [{ type: 'text', text: 'что у нас есть?' }] },
    ]);
  });

  test('kcxz.15: the zone is the browser’s header when Intl knows it, else the saved offset, else UTC', async () => {
    const zoneOf = async (header, user = USER_A) => {
      const context = setup();
      await threadOf(context, 'thread-a-1', RESOURCE_A);
      const res = new FakeResponse();
      await context.controller.chat(ORG, user, { threadId: 'thread-a-1', messages: [userMessage()] }, res, header);
      return context.handleChatStream.mock.calls[0][0].params.requestContext.get('cf.timeZone');
    };
    // Valid: canonical IANA, summer time is Intl's business.
    expect(await zoneOf('Europe/Moscow')).toBe('Europe/Moscow');
    expect(await zoneOf('europe/berlin')).toBe('Europe/Berlin');
    // Invalid: not a zone, or not a zone name at all — the saved offset, else UTC.
    const saved = { ...USER_A, timezone: 180 };
    expect(await zoneOf('Mars/Olympus', saved)).toBe('+03:00');
    expect(await zoneOf('Europe/Moscow; drop table', saved)).toBe('+03:00');
    expect(await zoneOf('x'.repeat(200))).toBe('UTC');
    // Absent: the saved offset, else UTC.
    expect(await zoneOf(undefined, saved)).toBe('+03:00');
    expect(await zoneOf(undefined)).toBe('UTC');
    expect(await zoneOf(undefined, { ...USER_A, timezone: 5000 })).toBe('UTC');
  });

  test('a first message without a thread opens a new one, named after it, once admitted', async () => {
    const context = setup();
    const res = await chat(context, { messages: [userMessage('Напиши пост про созвоны')] });
    const threadId = res.headers['x-agent-thread-id'];
    expect(threadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.mastra.threads.get(threadId)).toMatchObject({
      resourceId: RESOURCE_A,
      title: 'Напиши пост про созвоны',
    });
  });

  test('a refused admission leaves no empty thread behind', async () => {
    const context = setup();
    context.aiUsage.beginAiOperation.mockRejectedValueOnce(
      Object.assign(new Error('quota'), { status: 429 })
    );
    await expect(
      chat(context, { threadId: 'thread-new-1', messages: [userMessage()] })
    ).rejects.toMatchObject({ status: 429 });
    expect(context.mastra.threads.size).toBe(0);
    expect(context.handleChatStream).not.toHaveBeenCalled();
  });
});

describe('S2, S4, S7: nobody reaches another person’s conversation', () => {
  const refused = expect.objectContaining({ status: 403, code: 'AGENT_NOT_YOURS' });

  test('S2: resuming or approving with another person’s run runs nothing and bills nothing', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    await threadOf(context, 'thread-b-1', RESOURCE_B);
    pendingApproval(context.mastra, { resourceId: RESOURCE_B, threadId: 'thread-b-1' });
    pendingQuestion(context.mastra, { resourceId: RESOURCE_B, threadId: 'thread-b-1' });

    // With A's own thread and B's run ids: A's thread holds no such card, so
    // it is not pending — which says nothing about whose it is (review W1 F6).
    const notPending = expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' });
    await expect(chat(context, approvalBody())).rejects.toEqual(notPending);
    await expect(
      chat(context, {
        threadId: 'thread-a-1',
        runId: 'run-question-1',
        cardId: QUESTION_CARD,
        resumeData: { consentGiven: true },
      })
    ).rejects.toEqual(notPending);
    // With B's thread itself.
    await expect(chat(context, approvalBody({ threadId: 'thread-b-1' }))).rejects.toEqual(refused);

    expect(context.aiUsage.beginAiOperation).not.toHaveBeenCalled();
    expect(context.handleChatStream).not.toHaveBeenCalled();
    expect(context.mastra.runs).toHaveLength(2);
  });

  test('S4: a message into another person’s thread is 403 and the thread is untouched', async () => {
    const context = setup();
    await threadOf(context, 'thread-b-1', RESOURCE_B, 'Разговор Б');
    const before = { ...context.mastra.threads.get('thread-b-1') };
    await expect(
      chat(context, { threadId: 'thread-b-1', messages: [userMessage()] })
    ).rejects.toEqual(refused);
    expect(context.mastra.threads.get('thread-b-1')).toEqual(before);
    expect(context.aiUsage.beginAiOperation).not.toHaveBeenCalled();
  });

  test('S7: B cannot list, read, rename or delete A’s thread; the old org-keyed thread is invisible', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A, 'Разговор А');
    // The inherited screen wrote under the organization alone.
    await threadOf(context, 'thread-legacy', 'org-1', 'Старый разговор');

    const listB = await context.controller.listThreads(ORG, USER_B);
    const listA = await context.controller.listThreads(ORG, USER_A);
    expect(listB.threads).toEqual([]);
    expect(listA.threads.map((thread) => thread.id)).toEqual(['thread-a-1']);

    await expect(context.controller.getThread(ORG, USER_B, 'thread-a-1')).rejects.toEqual(refused);
    await expect(
      context.controller.renameThread(ORG, USER_B, 'thread-a-1', { title: 'Моё' })
    ).rejects.toEqual(refused);
    await expect(context.controller.deleteThread(ORG, USER_B, 'thread-a-1')).rejects.toEqual(refused);
    for (const user of [USER_A, USER_B]) {
      await expect(context.controller.getThread(ORG, user, 'thread-legacy')).rejects.toEqual(refused);
    }
    expect(context.mastra.threads.get('thread-a-1').title).toBe('Разговор А');
  });

  test('a missing thread is 404; a bad id or title is 400', async () => {
    const context = setup();
    await expect(context.controller.getThread(ORG, USER_A, 'thread-none')).rejects.toMatchObject({
      status: 404,
    });
    await expect(context.controller.getThread(ORG, USER_A, '../../etc')).rejects.toMatchObject({
      status: 400,
    });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    await expect(
      context.controller.renameThread(ORG, USER_A, 'thread-a-1', { title: '   ' })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('U2, U3, S6: how a turn ends is how it is billed', () => {
  test('U2: a turn whose stream carries an error is closed as failed', async () => {
    const context = setup({
      parts: [
        { type: 'start' },
        { type: 'error', errorText: 'AI_PROVIDER_BUSY' },
      ],
    });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = await chat(context, { threadId: 'thread-a-1', messages: [userMessage()] });
    expect(context.admissions[0].finished).toEqual([false]);
    expect(res.parts()).toContainEqual({ type: 'error', errorText: 'AI_PROVIDER_BUSY' });
  });

  test('S6: an error part never carries a stack, a path or node_modules', async () => {
    const leak =
      'Error: 400 bad model\n    at doStream (/srv/app/node_modules/@ai-sdk/openai/dist/index.js:1:1)';
    const context = setup({ parts: [{ type: 'start' }, { type: 'error', errorText: leak }] });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = await chat(context, { threadId: 'thread-a-1', messages: [userMessage()] });
    const text = res.chunks.join('');
    expect(text).not.toMatch(/\s+at\s|\/srv\/|node_modules/);
    expect(res.parts()).toContainEqual({ type: 'error', errorText: 'AGENT_FAILED' });
    expect(context.admissions[0].finished).toEqual([false]);
  });

  test('U3: the person leaving mid-stream closes the admission as failed and stops the turn', async () => {
    const context = setup({ parts: [{ type: 'start' }, { type: 'text-delta', delta: 'Мы' }], hang: true });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = new FakeResponse();
    const running = context.controller.chat(
      ORG,
      USER_A,
      { threadId: 'thread-a-1', messages: [userMessage()] },
      res
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    res.emit('close');
    await running;
    const [{ params }] = context.handleChatStream.mock.calls[0];
    expect(params.abortSignal.aborted).toBe(true);
    expect(context.scripted.current.state.cancelled).toBe(true);
    expect(context.admissions[0].finished).toEqual([false]);
  });

  test('a turn that cannot start is an HTTP error with a code, closed as failed', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    context.handleChatStream.mockRejectedValueOnce(
      Object.assign(new Error('/srv/app/x.js exploded'), { statusCode: 503 })
    );
    await expect(
      chat(context, { threadId: 'thread-a-1', messages: [userMessage()] })
    ).rejects.toMatchObject({ status: 502, response: { code: 'AI_PROVIDER_BUSY' } });
    expect(context.admissions[0].finished).toEqual([false]);
  });
});

describe('correctness review W1: cards, answers and attachments at the door', () => {
  const approvalStream = [
    { type: 'start' },
    { type: 'tool-input-available', toolCallId: 'call-1', toolName: 'piece_delete', input: { pieceId: 'p1' } },
    { type: 'tool-approval-request', approvalId: 'run-approve-1::call-1', toolCallId: 'call-1' },
    { type: 'data-progress', data: { capability: 'piece.create', stage: 'piece' } },
  ];

  test('F1: the approval request carries what and where, read by the server for the call', async () => {
    const context = setup({ parts: approvalStream });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = await chat(context, { threadId: 'thread-a-1', messages: [userMessage('удали cnt-1')] });
    const request = res.parts().find((part) => part.type === 'tool-approval-request');
    expect(request).toEqual({
      type: 'tool-approval-request',
      approvalId: 'run-approve-1::call-1',
      toolCallId: 'call-1',
      reason: 'Удалить заготовку cnt-01 «Про созвоны» (org-1, p1)',
    });
    expect(context.mastra.mastraService.describeApproval).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: 'user-a' }),
      'piece_delete',
      { pieceId: 'p1' }
    );
  });

  test('F1: a reloaded card says the same, from the stored arguments', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingApproval(context.mastra);
    const history = await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    expect(history.pending).toEqual([
      {
        runId: 'run-approve-1',
        toolCallId: 'call-1',
        toolName: 'piece_delete',
        kind: 'approval',
        args: { pieceId: 'p1' },
        summary: 'Удалить заготовку cnt-01 «Про созвоны» (org-1, p1)',
      },
    ]);
  });

  test('progress parts reach the browser transient', async () => {
    const context = setup({ parts: approvalStream });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = await chat(context, { threadId: 'thread-a-1', messages: [userMessage()] });
    expect(res.parts().find((part) => part.type === 'data-progress')).toEqual({
      type: 'data-progress',
      data: { capability: 'piece.create', stage: 'piece' },
      transient: true,
    });
  });

  test('F3: «Нет» keeps the ordinary paid cap; «Да» raises it to the hard one', async () => {
    // Two workspaces: one card is answered once (kcxz.29, D2).
    const answered = async (approved) => {
      const context = setup();
      await threadOf(context, 'thread-a-1', RESOURCE_A);
      pendingApproval(context.mastra);
      const body = approvalBody();
      body.messages[0].parts[0].approval.approved = approved;
      await chat(context, body);
      return context.handleChatStream.mock.calls[0][0].params;
    };
    const no = await answered(false);
    const yes = await answered(true);
    expect(no.requestContext.get('cf.paidLimit')).toBe(1);
    expect(no.requestContext.get('cf.approvals')).toBe('');
    expect(yes.requestContext.get('cf.paidLimit')).toBe(2);
  });

  test('F4: answers of one step share the step cap of one request', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    context.mastra.runs.push({
      runId: 'run-approve-2',
      threadId: 'thread-a-1',
      resourceId: RESOURCE_A,
      toolCalls: [
        { toolCallId: 'call-1', toolName: 'piece_delete', args: { pieceId: 'p1' }, requiresApproval: true },
        { toolCallId: 'call-2', toolName: 'piece_delete', args: { pieceId: 'p2' }, requiresApproval: true },
      ],
    });
    const part = (toolCallId) => ({
      type: 'tool-piece_delete',
      toolCallId,
      state: 'approval-responded',
      approval: { id: `run-approve-2::${toolCallId}`, approved: true },
    });
    await chat(context, {
      threadId: 'thread-a-1',
      messages: [{ id: 'msg-assistant-1', role: 'assistant', parts: [part('call-1'), part('call-2')] }],
    });
    const [{ params }] = context.handleChatStream.mock.calls[0];
    expect(params.maxSteps).toBe(3);
    expect(context.admissions).toHaveLength(1);
  });

  test('F5: the same card answered twice at once runs once; the second is 409 and billed nothing', async () => {
    const context = setup({ parts: [{ type: 'start' }], hang: true });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingApproval(context.mastra);
    const first = new FakeResponse();
    const running = context.controller.chat(ORG, USER_A, approvalBody(), first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(chat(context, approvalBody())).rejects.toEqual(
      expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' })
    );
    expect(context.handleChatStream).toHaveBeenCalledTimes(1);
    expect(context.admissions).toHaveLength(1);
    first.emit('close');
    await running;
    // Released with the stream: a later answer is judged by what still waits.
    expect(await context.controller.threads.claimRun('run-approve-1')).toEqual(expect.any(Function));
  });

  test('kcxz.47 (review W4-39-40 F5): a claim store that fails refuses the answer as AGENT_FAILED, before it runs or is billed', async () => {
    const down = () => Promise.reject(new Error('Connection is closed.'));
    const claims = { incr: down, expire: down, del: down, get: down, set: down };
    const context = setup({ claims });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingApproval(context.mastra);
    await expect(chat(context, approvalBody())).rejects.toEqual(
      expect.objectContaining({ status: 503, code: 'AGENT_FAILED' })
    );
    expect(context.handleChatStream).not.toHaveBeenCalled();
    expect(context.admissions).toHaveLength(0);
    await expect(context.controller.threads.claimRun('run-approve-1')).rejects.toEqual(
      expect.objectContaining({ status: 503, code: 'AGENT_FAILED' })
    );
  });

  test('kcxz.29 D2: a question answered once is never run again, even if the stream was cut and the run still reads as suspended', async () => {
    const context = setup({
      parts: [{ type: 'data-avatar', data: { kind: 'avatar', id: 'a1' } }],
      hang: true,
    });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingQuestion(context.mastra);
    const answer = {
      threadId: 'thread-a-1',
      runId: 'run-question-1',
      toolCallId: 'call-7',
      cardId: QUESTION_CARD,
      resumeData: { consentGiven: true, avatarName: 'Игорь' },
    };
    const first = new FakeResponse();
    const running = context.controller.chat(ORG, USER_A, answer, first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The browser drops the stream after the capability ran; Mastra still
    // lists the run as suspended (the fake keeps it).
    first.emit('close');
    await running;
    expect(context.mastra.runs.map((run) => run.runId)).toContain('run-question-1');

    // A reload does not redraw the card …
    const history = await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    expect(history.pending).toEqual([]);
    // … and a retry of the same answer runs nothing and bills nothing.
    await expect(chat(context, answer)).rejects.toEqual(
      expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' })
    );
    expect(context.handleChatStream).toHaveBeenCalledTimes(1);
    expect(context.admissions).toHaveLength(1);
  });

  test('kcxz.29 D2: a second card of the same run stays answerable after the first was answered', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    context.mastra.runs.push({
      runId: 'run-approve-3',
      threadId: 'thread-a-1',
      resourceId: RESOURCE_A,
      toolCalls: [
        { toolCallId: 'call-1', toolName: 'piece_delete', args: { pieceId: 'p1' }, requiresApproval: true },
      ],
    });
    const body = (toolCallId) => ({
      threadId: 'thread-a-1',
      messages: [
        {
          id: 'msg-assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-piece_delete',
              toolCallId,
              state: 'approval-responded',
              approval: { id: `run-approve-3::${toolCallId}`, approved: true },
            },
          ],
        },
      ],
    });
    await chat(context, body('call-1'));
    // The run stops again on the next card of the loop.
    context.mastra.runs[0].toolCalls = [
      { toolCallId: 'call-2', toolName: 'piece_delete', args: { pieceId: 'p2' }, requiresApproval: true },
    ];
    await chat(context, body('call-2'));
    expect(context.handleChatStream).toHaveBeenCalledTimes(2);
    await expect(chat(context, body('call-1'))).rejects.toEqual(
      expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' })
    );
  });

  test('F6: a card that no longer waits is 409 «no longer pending», not «somebody else»', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    await expect(chat(context, approvalBody())).rejects.toEqual(
      expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' })
    );
    expect(context.aiUsage.beginAiOperation).not.toHaveBeenCalled();
  });

  test('F15: a person who left while the turn was admitted is not billed a finished turn', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const res = new FakeResponse();
    context.aiUsage.beginAiOperation.mockImplementationOnce(async (organizationId, operation, role) => {
      res.emit('close');
      const admission = { organizationId, operation, role, finished: [] };
      context.admissions.push(admission);
      return {
        run: (callback) => callback(),
        finish: async (succeeded) => void admission.finished.push(succeeded),
      };
    });
    await context.controller.chat(ORG, USER_A, { threadId: 'thread-a-1', messages: [userMessage()] }, res);
    expect(context.admissions[0].finished).toEqual([false]);
    expect(context.handleChatStream).not.toHaveBeenCalled();
    expect(res.headersSent).toBe(false);
  });

  test('F2: a link as an attachment is refused before anything is billed', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    await expect(
      chat(context, {
        threadId: 'thread-a-1',
        messages: [
          {
            id: 'msg-user-1',
            role: 'user',
            parts: [
              { type: 'text', text: 'прочитай' },
              { type: 'file', url: 'http://10.0.0.5:9000/internal', mediaType: 'application/pdf' },
            ],
          },
        ],
      })
    ).rejects.toEqual(expect.objectContaining({ status: 400, code: 'AGENT_BAD_REQUEST' }));
    expect(context.aiUsage.beginAiOperation).not.toHaveBeenCalled();
  });
});

describe('correctness review W2: an answer is bound to the card, «Да» to the text', () => {
  const consent = {
    kind: 'consent',
    subject: 'autopilot',
    question: 'Канал «Блог» на автопилоте. Писать?',
    answerKey: 'consentGiven',
    canDecideForPerson: false,
    channel: null,
  };
  const interview = {
    kind: 'interview',
    question: 'Пара вопросов',
    questions: [{ key: 'ask-1', question: 'Для кого пост?', suggested: null }],
    canDecideForPerson: true,
    channel: null,
    afterConsent: true,
  };
  const adaptRun = (payload) => ({
    runId: 'run-adapt-1',
    threadId: 'thread-a-1',
    resourceId: RESOURCE_A,
    toolCalls: [{ toolCallId: 'call-1', toolName: 'piece_adapt', requiresApproval: false, suspendPayload: payload }],
  });
  const answer = (card, resumeData) => ({
    threadId: 'thread-a-1',
    runId: 'run-adapt-1',
    toolCallId: 'call-1',
    cardId: CARD(card),
    resumeData,
  });

  test('F3: two tabs — after «Да» in one, the other tab’s stale «Нет» never answers the interview', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    context.mastra.runs.push(adaptRun(consent));
    // Both tabs show the consent card; tab A says «Да».
    await chat(context, answer(consent, { consentGiven: true }));
    // The same call now waits on the interview.
    context.mastra.runs[0] = adaptRun(interview);
    // Tab B, still on the consent card, says «Нет»: not this card's answer.
    await expect(chat(context, answer(consent, { consentGiven: false }))).rejects.toEqual(
      expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' })
    );
    // Even with the new card's id, a consent answer is not an interview answer.
    await expect(
      chat(context, { ...answer(consent, { consentGiven: false }), cardId: CARD(interview) })
    ).rejects.toEqual(expect.objectContaining({ status: 400, code: 'AGENT_BAD_REQUEST' }));
    expect(context.handleChatStream).toHaveBeenCalledTimes(1);
    expect(context.admissions).toHaveLength(1);
    // A reload shows the interview — its id, no server-only key — and it is answerable.
    const history = await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    expect(history.pending).toEqual([
      expect.objectContaining({
        toolCallId: 'call-1',
        suspendPayload: expect.objectContaining({ kind: 'interview', cardId: CARD(interview) }),
      }),
    ]);
    expect(history.pending[0].suspendPayload).not.toHaveProperty('afterConsent');
    await chat(context, answer(interview, { decideForPerson: true }));
    expect(context.handleChatStream).toHaveBeenCalledTimes(2);
    // Answered, the interview is closed for good; the consent was already.
    expect((await context.controller.getThread(ORG, USER_A, 'thread-a-1')).pending).toEqual([]);
  });

  test('F3: two answers on the same card at once — one runs, the other is refused and billed nothing', async () => {
    const context = setup({ hang: true });
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    context.mastra.runs.push(adaptRun(consent));
    const first = new FakeResponse();
    const running = context.controller.chat(ORG, USER_A, answer(consent, { consentGiven: true }), first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(chat(context, answer(consent, { consentGiven: true }))).rejects.toEqual(
      expect.objectContaining({ status: 409, code: 'AGENT_RUN_NOT_PENDING' })
    );
    first.emit('close');
    await running;
    expect(context.handleChatStream).toHaveBeenCalledTimes(1);
    expect(context.admissions).toHaveLength(1);
  });

  test('F4: «Да» is bound to the text the card first showed, not to the text at the answer', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    const args = { pieceId: 'p1', adaptationId: 'a1' };
    context.mastra.runs.push({
      runId: 'run-publish-1',
      threadId: 'thread-a-1',
      resourceId: RESOURCE_A,
      toolCalls: [{ toolCallId: 'call-1', toolName: 'plan_publish_now', args, requiresApproval: true }],
    });
    // The card is drawn (a reload) with the first text …
    await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    // … the text is edited elsewhere, and a second reload draws the new one.
    context.mastra.content.text = 'Спам со ссылкой';
    await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    await chat(context, {
      threadId: 'thread-a-1',
      messages: [
        {
          id: 'msg-assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-plan_publish_now',
              toolCallId: 'call-1',
              state: 'approval-responded',
              approval: { id: 'run-publish-1::call-1', approved: true },
            },
          ],
        },
      ],
    });
    const granted = String(
      context.handleChatStream.mock.calls[0][0].params.requestContext.get('cf.approvals')
    ).split(',');
    // The call itself, and the call bound to the first text — the hook
    // recomputes the text when the call runs and refuses the spam.
    expect(granted).toEqual([
      fingerprintOf('plan_publish_now', args),
      approvalContentFingerprint('plan_publish_now', args, 'digest:Первый текст'),
    ]);
  });
});

describe('kcxz.32: an earlier card, an open proposal', () => {
  test('N1: «Нет» on an approval card further up — its stored message, whole — runs the stored call once', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    pendingApproval(context.mastra);
    // What the screen sends for a card that is not the last message: the
    // message the card is in, as the chat holds it — its text, an earlier
    // finished call, and the answered card.
    const earlier = {
      threadId: 'thread-a-1',
      messages: [
        {
          id: 'msg-assistant-earlier',
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            { type: 'text', text: 'Удаляю?' },
            {
              type: 'tool-piece_list',
              toolCallId: 'call-0',
              state: 'output-available',
              input: {},
              output: { ok: true, summary: {} },
            },
            {
              type: 'tool-piece_delete',
              toolCallId: 'call-1',
              state: 'approval-responded',
              input: { pieceId: 'p1' },
              approval: { id: 'run-approve-1::call-1', approved: false, requestReason: 'Удалить cnt-01' },
            },
          ],
        },
      ],
    };
    const res = await chat(context, earlier);
    expect(res.statusCode).toBe(200);
    const [{ params }] = context.handleChatStream.mock.calls[0];
    // Only the verified answer goes to Mastra, with the stored arguments.
    expect(params.messages).toEqual([
      {
        id: 'msg-assistant-earlier',
        role: 'assistant',
        parts: [
          {
            type: 'tool-piece_delete',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: { pieceId: 'p1' },
            // What «Нет» did, in the server's words (W3 walk P3-K); the fact
            // only, since Mastra stores it with the tool result (review F9).
            approval: { id: 'run-approve-1::call-1', approved: false, reason: DECLINED_STORED },
          },
        ],
      },
    ]);
    // What to say about it is a system note of this request, not stored.
    const noted = params.prepareStep({ stepNumber: 0, systemMessages: [], messageList: {} });
    expect(noted.systemMessages).toEqual([{ role: 'system', content: DECLINED_ON_CARD }]);
    expect(noted.toolChoice).toBeUndefined();
    // «Нет» grants nothing and keeps the ordinary cap.
    expect(params.requestContext.get('cf.approvals')).toBe('');
    expect(params.requestContext.get('cf.paidLimit')).toBe(1);
    expect(context.admissions).toHaveLength(1);
    // The same answer again (a second tab): no longer pending, billed nothing.
    await expect(chat(context, earlier)).rejects.toMatchObject({ code: 'AGENT_RUN_NOT_PENDING' });
    expect(context.handleChatStream).toHaveBeenCalledTimes(1);
    expect(context.admissions).toHaveLength(1);
  });

  const proposalRun = (target) => ({
    runId: 'run-rewrite-1',
    threadId: 'thread-a-1',
    resourceId: RESOURCE_A,
    toolCalls: [
      {
        toolCallId: 'call-3',
        toolName: 'adaptation_rewrite',
        requiresApproval: false,
        suspendPayload: {
          kind: 'selection',
          question: 'Вот что предлагаем поправить.',
          answerKey: 'changeIds',
          options: [{ id: 'w1', label: '«a» → «b»', selected: true }],
          canDecideForPerson: true,
          token: 'signed',
          verdict: 'review',
          target,
        },
      },
    ],
  });

  test('N2: a message names the texts whose card of proposed changes waits; the card answered is not one', async () => {
    const context = setup();
    await threadOf(context, 'thread-a-1', RESOURCE_A);
    context.mastra.runs.push(proposalRun('adaptation:a1'));
    await chat(context, { threadId: 'thread-a-1', messages: [userMessage('Спасибо, посмотрю правку')] });
    const [message] = context.handleChatStream.mock.calls[0];
    expect(JSON.parse(message.params.requestContext.get('cf.openProposals'))).toEqual(['adaptation:a1']);
    // The screen never sees the target: server-only, like the token.
    const history = await context.controller.getThread(ORG, USER_A, 'thread-a-1');
    expect(history.pending).toHaveLength(1);
    expect(history.pending[0].suspendPayload).not.toHaveProperty('target');
    expect(history.pending[0].suspendPayload).not.toHaveProperty('token');

    const run = proposalRun('adaptation:a1');
    await chat(context, {
      threadId: 'thread-a-1',
      runId: 'run-rewrite-1',
      toolCallId: 'call-3',
      cardId: CARD(run.toolCalls[0].suspendPayload),
      resumeData: { changeIds: ['w1'] },
    });
    const [resume] = context.handleChatStream.mock.calls[1];
    expect(JSON.parse(resume.params.requestContext.get('cf.openProposals'))).toEqual([]);
  });

  test('N2: a new thread has nothing open', async () => {
    const context = setup();
    await chat(context, { messages: [userMessage('Перепиши пост')] });
    const [{ params }] = context.handleChatStream.mock.calls[0];
    expect(params.requestContext.get('cf.openProposals')).toBe('[]');
  });
});

describe('A3: /agent/chat is throttled per person', () => {
  const { AgentChatThrottleGuard, agentChatTracker, AGENT_CHAT_THROTTLE } = loadTypeScriptModule(
    'apps/backend/src/api/routes/agent-chat.throttle.ts'
  );
  const storages = [];
  let warning;
  beforeEach(() => {
    warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => {
    warning.mockRestore();
    while (storages.length) storages.pop().onApplicationShutdown();
  });

  const guardWith = async () => {
    const storage = new ThrottlerStorageService();
    storages.push(storage);
    const guard = new AgentChatThrottleGuard(
      { throttlers: [{ ttl: 3_600_000, limit: 90 }] },
      storage,
      new Reflector()
    );
    await guard.onModuleInit();
    return guard;
  };
  const handler = function chat() {};
  class AgentController {}
  const executionFor = (user) => ({
    getClass: () => AgentController,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/agent/chat', org: { id: 'org-1' }, user, ip: '10.0.0.1', headers: {} }),
      getResponse: () => ({ header: () => undefined }),
    }),
  });

  test('the bucket belongs to the person inside the workspace', () => {
    expect(agentChatTracker({ org: { id: 'org-1' }, user: { id: 'u-1' } })).toBe('agent-chat:org-1:u-1');
    expect(agentChatTracker({ org: { id: 'org-1' }, user: { id: 'u-2' } })).not.toBe(
      agentChatTracker({ org: { id: 'org-1' }, user: { id: 'u-1' } })
    );
  });

  test('twenty a minute, then 429 ai_rate_limited — and a colleague is not affected', async () => {
    const guard = await guardWith();
    for (let index = 0; index < AGENT_CHAT_THROTTLE.limit; index += 1) {
      await expect(guard.canActivate(executionFor({ id: 'u-1' }))).resolves.toBe(true);
    }
    await expect(guard.canActivate(executionFor({ id: 'u-1', language: 'ru' }))).rejects.toMatchObject({
      status: 429,
      response: { code: 'ai_rate_limited' },
    });
    await expect(guard.canActivate(executionFor({ id: 'u-2' }))).resolves.toBe(true);
    expect(AGENT_CHAT_THROTTLE).toEqual({ limit: 20, ttl: 60_000 });
  });

  test('the chat door carries the guard; the reads do not', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '..', 'apps/backend/src/api/routes/agent.controller.ts'),
      'utf8'
    );
    const guarded = source.split('@UseGuards(AgentChatThrottleGuard)');
    expect(guarded).toHaveLength(2);
    expect(guarded[1].trimStart()).toMatch(/^async chat\(/);
  });
});
