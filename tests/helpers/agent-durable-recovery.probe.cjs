'use strict';

require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { z } = require('zod');
const { Mastra } = require('@mastra/core/mastra');
const { isDurableAgent, ExecutionFence } = require('@mastra/core/agent/durable');
const { isRunFenceConflictError, InMemoryStore } = require('@mastra/core/storage');
const { Memory } = require('@mastra/memory');
const { PostgresStore } = require('@mastra/pg');
const { handleChatStream } = require('@mastra/ai-sdk');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

const CONDUCTOR = 'libraries/nestjs-libraries/src/chat/conductor';
let connectionString =
  process.env.CF_TEST_PG_URL ||
  'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';

function isTcpPortReachable(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(500);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function acquireTestPostgres() {
  const parsed = new URL(connectionString);
  const host = parsed.hostname || '127.0.0.1';
  const port = Number(parsed.port || 5432);
  if (await isTcpPortReachable(host, port)) {
    return { url: connectionString, cleanup: async () => undefined };
  }
  const containerName = `cf-on0i-durable-pg-${process.pid}-${Date.now()}`;
  const run = spawnSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      '--env',
      'POSTGRES_DB=postgres',
      'postgres:17-alpine',
    ],
    { encoding: 'utf8', timeout: 60_000 }
  );
  if (run.status !== 0) {
    throw new Error(`Failed to start disposable PostgreSQL: ${run.stderr || run.stdout}`);
  }
  const portRes = spawnSync('docker', ['port', containerName, '5432/tcp'], {
    encoding: 'utf8',
  });
  const mappedPort = Number(
    (portRes.stdout || '').trim().split('\n')[0].split(':').pop()
  );
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const logs = spawnSync('docker', ['logs', containerName], { encoding: 'utf8' });
    const initialized = `${logs.stdout || ''}${logs.stderr || ''}`.includes(
      'PostgreSQL init process complete; ready for start up.'
    );
    const check =
      initialized &&
      (await isTcpPortReachable('127.0.0.1', mappedPort)) &&
      spawnSync(
        'docker',
        [
          'exec',
          containerName,
          'psql',
          '-h',
          '127.0.0.1',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-c',
          'SELECT 1',
        ],
        { encoding: 'utf8' }
      ).status === 0;
    if (check) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) {
    spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
    throw new Error('Disposable PostgreSQL did not become ready');
  }
  const url = `postgresql://postgres:postgres@127.0.0.1:${mappedPort}/postgres`;
  return {
    url,
    cleanup: async () => {
      spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
    },
  };
}

const noOp = () => () => undefined;
const ORG = { id: 'org-1', createdAt: '2026-01-01T00:00:00Z', users: [{ role: 'EDITOR' }] };
const USER = { id: 'user-1', language: 'ru' };
const identity = {
  organizationId: ORG.id,
  organizationCreatedAt: ORG.createdAt,
  userId: USER.id,
  role: 'EDITOR',
  language: 'ru',
  timeZone: 'UTC',
};
const resourceId = 'org-1:user-1';
const usage = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 5, text: 5 },
};

class FakeResponse extends EventEmitter {
  headersSent = false;
  writableEnded = false;
  headers = {};
  chunks = [];
  status() {
    return this;
  }
  setHeader(name, value) {
    this.headers[name] = value;
  }
  flushHeaders() {
    this.headersSent = true;
  }
  write(chunk) {
    this.chunks.push(String(chunk));
    return true;
  }
  end() {
    this.writableEnded = true;
  }
  parts() {
    return this.chunks
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map((line) => JSON.parse(line.slice(6)));
  }
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function loadConductorStack() {
  const lifecycle = loadCapabilityModule('../conductor/agent-turn-lifecycle.ts');
  const claims = loadCapabilityModule('../conductor/agent-run-claims.ts');
  const adapter = loadCapabilityModule('mastra.adapter.ts', {
    mocks: { '../conductor/agent-turn-lifecycle': lifecycle },
  });
  const admission = loadCapabilityModule('capability.admission.ts');
  const { pieceRename } = loadCapabilityModule('catalogue/piece.capabilities.ts');
  const conductorAgent = loadCapabilityModule('../conductor/conductor.agent.ts', {
    mocks: {
      '../capabilities/mastra.adapter': adapter,
      '../capabilities/capability.admission': admission,
    },
  });
  const mocks = {
    '@mastra/ai-sdk': { handleChatStream },
    '@mastra/ai-sdk/ui': {
      toAISdkMessages: (messages) =>
        messages.map((message) => ({ id: message.id, role: message.role, parts: message.parts })),
    },
    '@mastra/memory': { Memory },
    '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
    '@nestjs/swagger': { ApiTags: noOp },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': { CheckPolicies: noOp },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
      AuthorizationActions: { Create: 'create' },
      Sections: { AI: 'ai' },
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
    '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
    './agent-turn-lifecycle': lifecycle,
    './agent-run-claims': claims,
  };
  const { AgentThreadsService } = loadCapabilityModule('../conductor/agent-threads.service.ts', { mocks });
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks,
    '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service': { AgentThreadsService },
  });
  return {
    lifecycle,
    claims,
    adapter,
    admission,
    conductorAgent,
    AgentThreadsService,
    AgentController,
    sampleDoor: pieceRename.door,
  };
}

/**
 * A11: Observer disconnect detaches SSE without killing the durable run;
 * GET /agent/threads/:id reports running -> settled, and GET /agent/threads/:id/observe
 * streams the buffered + live parts to completion.
 */
async function verifyObserverDisconnectAndReconnect() {
  const stack = loadConductorStack();
  const storage = new InMemoryStore();
  const memory = new Memory({
    storage,
    options: { generateTitle: false, semanticRecall: false },
  });
  const toolStarted = deferred();
  const releaseTool = deferred();
  let toolExecutions = 0;

  const capability = {
    id: 'piece.create',
    group: 'content',
    door: stack.sampleDoor,
    risk: 'write',
    label: { ru: 'Создать заготовку', en: 'Create piece' },
    description: 'Creates a piece in the background.',
    input: z.object({ title: z.string() }),
    untrusted: [],
    run: async (_ctx, input) => {
      toolExecutions += 1;
      toolStarted.resolve();
      await releaseTool.promise;
      return { id: 'p-101', title: input.title };
    },
    summarize: (out) => ({ pieceId: out.id, title: out.title }),
  };

  let step = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => {
      step += 1;
      if (step === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'response-metadata', id: 'id-0', modelId: 'mock', timestamp: new Date(0) },
            {
              type: 'tool-call',
              toolCallId: 'call-bg-1',
              toolName: 'piece_create',
              input: JSON.stringify({ title: 'Осенний дайджест' }),
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage,
            },
          ]),
        };
      }
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'response-metadata', id: 'id-1', modelId: 'mock', timestamp: new Date(0) },
          { type: 'text-start', id: 'txt-1' },
          { type: 'text-delta', id: 'txt-1', delta: 'Фоновая задача завершена.' },
          { type: 'text-end', id: 'txt-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });

  const agent = stack.conductorAgent.buildConductorAgent({
    services: () => ({}),
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => model,
    memory,
    capabilities: [capability],
    snapshot: async () => ({ channels: [] }),
  });
  const controllerInstance = stack.conductorAgent.buildConductorController(agent, {
    storage,
    memory,
  });
  const mastra = new Mastra({
    storage,
    agents: { [stack.conductorAgent.CONDUCTOR_AGENT_ID || 'content-factory']: agent },
    agentControllers: { [stack.conductorAgent.CONDUCTOR_AGENT_ID || 'content-factory']: controllerInstance },
    recovery: { workflows: 'auto', durableAgents: 'auto' },
  });
  const durable = mastra.getAgentById('content-factory');
  assert.equal(isDurableAgent(durable), true);

  const mastraService = {
    mastra: async () => mastra,
    conductor: async () => durable,
    controller: async () => {
      await controllerInstance.initStorage();
      return controllerInstance;
    },
    sessionFor: async () => undefined,
    toolTitle: () => 'Создать заготовку',
  };
  const finishedAdmissions = [];
  const aiUsage = {
    beginAiOperation: async () => ({
      run: (fn) => fn(),
      finish: async (ok) => {
        finishedAdmissions.push(ok);
      },
    }),
  };
  const threads = new stack.AgentThreadsService(mastraService, stack.claims.inProcessRunClaimStore());
  const controller = new stack.AgentController(mastraService, threads, aiUsage);

  const threadId = 'thread-a11-bg';
  const res1 = new FakeResponse();
  const chatPromise = controller.chat(
    ORG,
    USER,
    {
      threadId,
      messages: [{ id: 'msg-a11-1', role: 'user', parts: [{ type: 'text', text: 'Создай заготовку' }] }],
    },
    res1
  );

  await toolStarted.promise;
  // Disconnect initial HTTP observer while tool is still running!
  res1.emit('close');

  const midHistory = await controller.getThread(ORG, USER, threadId);
  assert.equal(midHistory.execution?.state, 'running');

  // Reconnect a second observer to the live turn before releasing the tool.
  const res2 = new FakeResponse();
  const observePromise = controller.observeThread(ORG, USER, threadId, res2);
  releaseTool.resolve();

  await Promise.all([chatPromise, observePromise]);

  const finalHistory = await controller.getThread(ORG, USER, threadId);
  assert.equal(finalHistory.execution?.state, 'settled');
  assert.equal(finalHistory.execution?.outcome, 'completed');
  assert.equal(toolExecutions, 1);
  assert.deepEqual(finishedAdmissions, [true]);

  const observedText = res2
    .parts()
    .filter((p) => p.type === 'text-delta')
    .map((p) => p.delta)
    .join('');
  assert.equal(observedText, 'Фоновая задача завершена.');

  return {
    midState: midHistory.execution?.state,
    finalOutcome: finalHistory.execution?.outcome,
    toolExecutions,
    observedText,
    messageCount: finalHistory.messages.length,
  };
}

/**
 * A13: Explicit Stop cancels the active durable turn, settles as interrupted,
 * and rejects late callbacks without writing.
 */
async function verifyExplicitStopAndLateRejection() {
  const stack = loadConductorStack();
  const storage = new InMemoryStore();
  const memory = new Memory({
    storage,
    options: { generateTitle: false, semanticRecall: false },
  });
  const toolStarted = deferred();
  const releaseTool = deferred();
  let committedWrites = 0;
  let lateCallRejected = false;

  const capability = {
    id: 'piece.create',
    group: 'content',
    door: stack.sampleDoor,
    risk: 'write',
    label: { ru: 'Создать заготовку', en: 'Create piece' },
    description: 'Creates a piece.',
    input: z.object({ title: z.string() }),
    untrusted: [],
    run: async (ctx, input) => {
      toolStarted.resolve(ctx);
      await releaseTool.promise;
      if (ctx.abortSignal?.aborted) {
        throw new Error('Aborted by Stop.');
      }
      committedWrites += 1;
      return { id: 'p-stop', title: input.title };
    },
    summarize: (out) => ({ pieceId: out.id }),
  };

  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: 'id-0', modelId: 'mock', timestamp: new Date(0) },
        {
          type: 'tool-call',
          toolCallId: 'call-stop-1',
          toolName: 'piece_create',
          input: JSON.stringify({ title: 'Отменённый черновик' }),
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
        },
      ]),
    }),
  });

  const agent = stack.conductorAgent.buildConductorAgent({
    services: () => ({}),
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => model,
    memory,
    capabilities: [capability],
    snapshot: async () => ({ channels: [] }),
  });
  const mastra = new Mastra({
    storage,
    agents: { 'content-factory': agent },
    recovery: { workflows: 'auto', durableAgents: 'auto' },
  });
  const durable = mastra.getAgentById('content-factory');

  const mastraService = {
    mastra: async () => mastra,
    conductor: async () => durable,
    sessionFor: async () => undefined,
    toolTitle: () => 'Создать заготовку',
  };
  const finishedAdmissions = [];
  const aiUsage = {
    beginAiOperation: async () => ({
      run: (fn) => fn(),
      finish: async (ok) => {
        finishedAdmissions.push(ok);
      },
    }),
  };
  const threads = new stack.AgentThreadsService(mastraService, stack.claims.inProcessRunClaimStore());
  const controller = new stack.AgentController(mastraService, threads, aiUsage);

  const threadId = 'thread-a13-stop';
  const res = new FakeResponse();
  const chatPromise = controller.chat(
    ORG,
    USER,
    {
      threadId,
      messages: [{ id: 'm-stop', role: 'user', parts: [{ type: 'text', text: 'Останови меня' }] }],
    },
    res
  );

  await toolStarted.promise;
  const stopResult = await controller.stopThread(ORG, USER, threadId);
  assert.equal(stopResult.stopped, true);
  releaseTool.resolve();
  await chatPromise;

  // Attempt a late tool execution with the stopped requestId: must be rejected!
  const { buildConductorContext } = loadTypeScriptModule(`${CONDUCTOR}/conductor.context.ts`);
  const lateContext = buildConductorContext({
    identity,
    threadId,
    requestId: stopResult.requestId,
    trackExecution: true,
  });
  await assert.rejects(
    stack.lifecycle.trackAgentTurnWork(lateContext, async () => {
      committedWrites += 1;
    }),
    /request has stopped/
  );
  lateCallRejected = true;

  const finalHistory = await controller.getThread(ORG, USER, threadId);
  assert.equal(finalHistory.execution?.state, 'settled');
  assert.equal(finalHistory.execution?.outcome, 'interrupted');
  assert.equal(committedWrites, 0);
  assert.deepEqual(finishedAdmissions, [false]);

  return {
    stopped: stopResult.stopped,
    finalOutcome: finalHistory.execution?.outcome,
    committedWrites,
    lateCallRejected,
  };
}

/**
 * Child worker mode for A12: starts a durable run against PostgresStore,
 * executes step 1 (writing to the Postgres audit table and persisting the
 * committed tool receipt), persists the running workflow checkpoint, and
 * exits abruptly with code 99 before step 2 completes.
 */
async function runCrashWorker(schemaName, threadId) {
  const stack = loadConductorStack();
  const store = new PostgresStore({
    id: `crash-worker-${schemaName}`,
    connectionString,
    schemaName,
  });
  await store.init();
  const memory = new Memory({
    storage: store,
    options: { generateTitle: false, semanticRecall: false },
  });

  await memory.createThread({
    threadId,
    resourceId,
    title: 'Crash recovery thread',
    metadata: {
      assistantExecution: { requestId: 'req-crash-1', state: 'running' },
    },
  });

  const capability1 = {
    id: 'piece.create',
    group: 'content',
    door: stack.sampleDoor,
    risk: 'write',
    label: { ru: 'Создать заготовку', en: 'Create piece' },
    description: 'Step 1 write.',
    input: z.object({ title: z.string() }),
    untrusted: [],
    run: async (_ctx, input) => {
      await store.db.none(
        `INSERT INTO "${schemaName}".durable_audit_log (step_name, payload) VALUES ($1, $2)`,
        ['piece.create', input.title]
      );
      return { id: 'p-crash-1', title: input.title };
    },
    summarize: (out) => ({ pieceId: out.id, title: out.title }),
  };

  const capability2 = {
    id: 'piece.update',
    group: 'content',
    door: stack.sampleDoor,
    risk: 'write',
    label: { ru: 'Обновить заготовку', en: 'Update piece' },
    description: 'Step 2 write.',
    input: z.object({ pieceId: z.string() }),
    untrusted: [],
    run: async (_ctx, input) => {
      await store.db.none(
        `INSERT INTO "${schemaName}".durable_audit_log (step_name, payload) VALUES ($1, $2)`,
        ['piece.update', input.pieceId]
      );
      return { id: input.pieceId, updated: true };
    },
    summarize: (out) => ({ pieceId: out.id, updated: out.updated }),
  };

  let step = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => {
      step += 1;
      if (step === 1) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'response-metadata', id: 'id-0', modelId: 'mock', timestamp: new Date(0) },
            {
              type: 'tool-call',
              toolCallId: 'tc-crash-1',
              toolName: 'piece_create',
              input: JSON.stringify({ title: 'Восстановленный материал' }),
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage,
            },
          ]),
        };
      }
      // Step 2: simulate sudden process crash right after the running snapshot is saved!
      await new Promise((r) => setTimeout(r, 60));
      process.exit(99);
    },
  });

  const agent = stack.conductorAgent.buildConductorAgent({
    services: () => ({}),
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => model,
    memory,
    capabilities: [capability1, capability2],
    snapshot: async () => ({ channels: [] }),
  });
  const mastra = new Mastra({
    storage: store,
    agents: { 'content-factory': agent },
    recovery: { workflows: 'auto', durableAgents: 'auto' },
  });
  const durable = mastra.getAgentById('content-factory');
  const { buildConductorContext } = loadTypeScriptModule(`${CONDUCTOR}/conductor.context.ts`);
  const requestContext = buildConductorContext({
    identity,
    threadId,
    requestId: 'req-crash-1',
    trackExecution: true,
  });

  const out = await durable.stream('Создай и обнови заготовку', {
    runId: 'run-crash-1',
    memory: { thread: threadId, resource: resourceId },
    requestContext,
  });
  const reader = out.fullStream.getReader();
  while (!(await reader.read()).done) {
    /* crashes in step 2 */
  }
}

/**
 * A12 & A14: Real child-process crash/restart recovery on PostgreSQL with zero
 * duplicate writes, plus two-driver ExecutionFence / run-fencing contention.
 */
async function verifyPostgresCrashRecoveryAndFencing() {
  const pgHandle = await acquireTestPostgres();
  connectionString = pgHandle.url;
  const stack = loadConductorStack();
  const schemaName = `cf_on0i_durable_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const store = new PostgresStore({
    id: `parent-${schemaName}`,
    connectionString,
    schemaName,
  });
  await store.init();
  await store.db.none(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".durable_audit_log (
      id SERIAL PRIMARY KEY,
      step_name TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `);

  try {
    const threadId = 'thread-a12-crash';
    // 1. Spawn child worker that crashes with exit code 99 after step 1 commits.
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [__filename, '--worker-crash', schemaName, threadId],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, CF_TEST_PG_URL: connectionString },
        }
      );
      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += String(d);
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== 99) {
          reject(new Error(`Expected crash exit code 99, got ${code}: ${stderr}`));
        } else {
          resolve(code);
        }
      });
    });
    assert.equal(exitCode, 99);

    const rowsAfterCrash = await store.db.manyOrNone(
      `SELECT step_name, payload FROM "${schemaName}".durable_audit_log ORDER BY id ASC`
    );
    assert.equal(rowsAfterCrash.length, 1);
    assert.equal(rowsAfterCrash[0].step_name, 'piece.create');

    // 2. Boot a second server instance against the same PostgreSQL schema.
    const memory2 = new Memory({
      storage: store,
      options: { generateTitle: false, semanticRecall: false },
    });
    const capability1 = {
      id: 'piece.create',
      group: 'content',
      door: stack.sampleDoor,
      risk: 'write',
      label: { ru: 'Создать заготовку', en: 'Create piece' },
      description: 'Step 1 write.',
      input: z.object({ title: z.string() }),
      untrusted: [],
      run: async (_ctx, input) => {
        await store.db.none(
          `INSERT INTO "${schemaName}".durable_audit_log (step_name, payload) VALUES ($1, $2)`,
          ['piece.create', input.title]
        );
        return { id: 'p-crash-1', title: input.title };
      },
      summarize: (out) => ({ pieceId: out.id, title: out.title }),
    };
    const capability2 = {
      id: 'piece.update',
      group: 'content',
      door: stack.sampleDoor,
      risk: 'write',
      label: { ru: 'Обновить заготовку', en: 'Update piece' },
      description: 'Step 2 write.',
      input: z.object({ pieceId: z.string() }),
      untrusted: [],
      run: async (_ctx, input) => {
        await store.db.none(
          `INSERT INTO "${schemaName}".durable_audit_log (step_name, payload) VALUES ($1, $2)`,
          ['piece.update', input.pieceId]
        );
        return { id: input.pieceId, updated: true };
      },
      summarize: (out) => ({ pieceId: out.id, updated: out.updated }),
    };

    let recoveredModelStep = 0;
    const model2 = new MockLanguageModelV3({
      doStream: async () => {
        recoveredModelStep += 1;
        if (recoveredModelStep === 1) {
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              { type: 'response-metadata', id: 'id-r1', modelId: 'mock', timestamp: new Date(0) },
              {
                type: 'tool-call',
                toolCallId: 'tc-crash-2',
                toolName: 'piece_update',
                input: JSON.stringify({ pieceId: 'p-crash-1' }),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
              },
            ]),
          };
        }
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'response-metadata', id: 'id-r2', modelId: 'mock', timestamp: new Date(0) },
            { type: 'text-start', id: 'txt-r' },
            { type: 'text-delta', id: 'txt-r', delta: 'Восстановление успешно завершено.' },
            { type: 'text-end', id: 'txt-r' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
        };
      },
    });

    const agent2 = stack.conductorAgent.buildConductorAgent({
      services: () => ({}),
      gate: { check: async () => ({ allowed: true, policies: [] }) },
      model: async () => model2,
      memory: memory2,
      capabilities: [capability1, capability2],
      snapshot: async () => ({ channels: [] }),
    });
    const mastra2 = new Mastra({
      storage: store,
      agents: { 'content-factory': agent2 },
      recovery: { workflows: 'auto', durableAgents: 'auto' },
    });

    // Also verify that even if step 1 ('tc-crash-1') is re-invoked directly against
    // the recovered thread, the committed operation receipt in Postgres prevents
    // a duplicate domain write!
    const { buildConductorContext } = loadTypeScriptModule(`${CONDUCTOR}/conductor.context.ts`);
    const replayCtx = buildConductorContext({
      identity,
      threadId,
      requestId: 'req-crash-1',
      trackExecution: true,
    });
    replayCtx.set('mastra__durableExecutions', { 'run-crash-1': {} });
    const tools2 = stack.adapter.buildMastraCapabilityTools([capability1, capability2], {
      language: 'ru',
      services: () => ({}),
      gate: { check: async () => ({ allowed: true, policies: [] }) },
    });
    const replayedStep1 = await tools2.piece_create.execute(
      { title: 'Восстановленный материал' },
      {
        runId: 'run-crash-1',
        memory: memory2,
        requestContext: replayCtx,
        agent: {
          toolCallId: 'tc-crash-1',
          threadId,
          resourceId,
        },
      }
    );
    assert.equal(replayedStep1.ok, true);

    // Recover the orphaned run via MastraService.recoverDurableRuns({ force: true }).
    const { MastraService } = loadCapabilityModule('../mastra.service.ts', {
      mocks: {
        '@contentfactory/nestjs-libraries/chat/mastra.store': { pStore: store },
        './mastra.store': { pStore: store },
        '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
        '@contentfactory/nestjs-libraries/openai/ai.clients': {
          getAiSdkProvider: async () => ({}),
          getModelForRole: async () => 'mock',
        },
      },
    });
    const serviceInstance = new MastraService({ get: () => ({}) }, {});
    serviceInstance.instance = mastra2;
    const recoverySummary = await serviceInstance.recoverDurableRuns({
      threadId,
      resourceId,
      force: true,
    });
    assert.equal(recoverySummary.succeeded, 1);
    assert.equal(recoverySummary.failed, 0);

    const rowsAfterRecovery = await store.db.manyOrNone(
      `SELECT step_name, payload FROM "${schemaName}".durable_audit_log ORDER BY id ASC`
    );
    // Step 1 ran ONCE (in the crashed worker, and was skipped on replay), and
    // Step 2 ran ONCE (in the recovered worker)!
    assert.deepEqual(rowsAfterRecovery, [
      { step_name: 'piece.create', payload: 'Восстановленный материал' },
      { step_name: 'piece.update', payload: 'p-crash-1' },
    ]);

    const threadAfterRecovery = await memory2.getThreadById({ threadId });
    assert.deepEqual(threadAfterRecovery.metadata.assistantExecution, {
      requestId: 'req-crash-1',
      state: 'settled',
      outcome: 'completed',
    });
    const recalledAfterRecovery = await memory2.recall({
      threadId,
      resourceId,
      perPage: false,
    });
    assert.ok(recalledAfterRecovery.messages.some((m) => m.role === 'assistant'));

    // 3. A14: Two-driver run-fencing contention on PostgreSQL.
    const workflowsStore = await store.getStore('workflows');
    const memoryStore = await store.getStore('memory');
    const fencedRunId = 'run-fence-contention-1';
    const claimA = await workflowsStore.claimRunOwnership({
      runId: fencedRunId,
      ownerId: 'driver-a',
      leaseMs: 60_000,
      force: false,
    });
    assert.equal(claimA.acquired, true);
    const fenceA = {
      runId: fencedRunId,
      generation: claimA.record.generation,
      ownerId: claimA.record.ownerId,
    };
    assert.equal(await memoryStore.raiseRunFence(fenceA), true);

    // Non-forced second driver cannot acquire the active lease.
    const claimBNonForced = await workflowsStore.claimRunOwnership({
      runId: fencedRunId,
      ownerId: 'driver-b',
      leaseMs: 60_000,
      force: false,
    });
    assert.equal(claimBNonForced.acquired, false);

    // Forced takeover by driver B bumps the generation and fences out driver A's writes!
    const claimBForced = await workflowsStore.claimRunOwnership({
      runId: fencedRunId,
      ownerId: 'driver-b',
      leaseMs: 60_000,
      force: true,
    });
    assert.equal(claimBForced.acquired, true);
    assert.ok(claimBForced.record.generation > fenceA.generation);
    const fenceB = {
      runId: fencedRunId,
      generation: claimBForced.record.generation,
      ownerId: claimBForced.record.ownerId,
    };
    assert.equal(await memoryStore.raiseRunFence(fenceB), true);
    // Stale driver A cannot lower the memory fence once driver B raised it.
    assert.equal(await memoryStore.raiseRunFence(fenceA), false);

    let staleDriverWriteRejected = false;
    try {
      await memoryStore.updateThread({
        id: threadId,
        title: 'Stale driver write must fail',
        fence: fenceA,
      });
    } catch (error) {
      staleDriverWriteRejected = isRunFenceConflictError(error);
    }
    assert.equal(staleDriverWriteRejected, true);

    // Driver B's fenced write succeeds cleanly.
    await memoryStore.updateThread({
      id: threadId,
      title: 'Fenced driver B title',
      fence: fenceB,
    });
    await memoryStore.retireRunFence(fenceB);
    await workflowsStore.releaseRunOwnership(fenceB);
    await workflowsStore.releaseRunOwnership(fenceA);

    return {
      exitCode,
      rowsAfterCrash: rowsAfterCrash.length,
      rowsAfterRecovery,
      settledExecution: threadAfterRecovery.metadata.assistantExecution,
      fencing: {
        claimAAcquired: claimA.acquired,
        claimBNonForcedAcquired: claimBNonForced.acquired,
        claimBForcedAcquired: claimBForced.acquired,
        staleDriverWriteRejected,
      },
    };
  } finally {
    await store.db.none(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
    await store.close().catch(() => undefined);
    await pgHandle.cleanup().catch(() => undefined);
  }
}

async function main() {
  if (process.argv[2] === '--worker-crash') {
    await runCrashWorker(process.argv[3], process.argv[4]);
    return;
  }
  const a11 = await verifyObserverDisconnectAndReconnect();
  const a13 = await verifyExplicitStopAndLateRejection();
  const a12AndA14 = await verifyPostgresCrashRecoveryAndFencing();
  process.stdout.write(JSON.stringify({ a11, a13, a12AndA14 }));
}

main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error));
  process.exitCode = 1;
});
