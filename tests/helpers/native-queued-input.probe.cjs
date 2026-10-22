'use strict';

require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { z } = require('zod');
const { PostgresStore } = require('@mastra/pg');
const { Mastra } = require('@mastra/core/mastra');
const { Agent } = require('@mastra/core/agent');
const { AgentController } = require('@mastra/core/agent-controller');
const { AGENT_STREAM_TOPIC, createDurableAgent } = require('@mastra/core/agent/durable');
const { createTool } = require('@mastra/core/tools');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadCapabilityModule, IDENTITY } = require('./agent-capabilities.cjs');
const native = loadCapabilityModule('../conductor/native-queued-input.ts');
const { buildConductorContext } = loadCapabilityModule(
  '../conductor/conductor.context.ts'
);
const connectionString =
  process.env.CF_TEST_PG_URL ||
  'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
assert.ok(
  ['127.0.0.1', 'localhost', '::1'].includes(
    new URL(connectionString).hostname
  ),
  'Only disposable local PostgreSQL is allowed'
);
const identity = { ...IDENTITY, language: 'ru', timeZone: 'UTC' };
const resourceId = `${identity.organizationId}:${identity.userId}`;
const usage = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 5, text: 5 },
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function testWaitUntil(check) {
  for (let n = 0; n < 300; n++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Native test boundary did not settle');
}
const signalInput = (mode, number = 1) => ({
  identity,
  resourceId,
  threadId: `r5-${mode}`,
  requestId: `request-${mode}-${number}`,
  previousRunId: `main-${mode}`,
  signal: {
    id: `human-${mode}-${number}`,
    contents: `Original queued words ${number}: \"Ёжик\"\nsecond line`,
    createdAt: '2026-10-01T00:00:00.000Z',
    author: { id: identity.userId, name: 'Local probe' },
  },
});
const barrier = async (stage, extra = {}) => {
  process.send({ stage, ...extra });
  await new Promise(() => {});
};

async function runtime(schemaName, mode, childProcess = false) {
  const storage = new PostgresStore({
    id: `${schemaName}-${process.pid}`,
    connectionString,
    schemaName,
  });
  await storage.init();
  const memory = new Memory({
    storage,
    options: { generateTitle: false, semanticRecall: false },
  });
  const mainStarted = deferred();
  const writeStarted = deferred();
  const releaseWrite = deferred();
  const hold = createTool({
    id: 'hold',
    description: 'Hold the original read-only turn',
    requireApproval: () => false,
    inputSchema: z.object({}),
    outputSchema: z.object({ done: z.boolean() }),
    execute: async () => {
      mainStarted.resolve();
      if (childProcess && mode !== 'gap') await new Promise(() => {});
      return { done: true };
    },
  });
  const write = loadCapabilityModule(
    'mastra.adapter.ts'
  ).buildMastraCapabilityTools(
    [
      {
        id: 'piece.create',
        group: 'content',
        risk: mode === 'approval' ? 'confirm' : 'write',
        door: {},
        label: { ru: 'Создать', en: 'Create' },
        description: 'One disposable local transaction',
        input: z.object({ requestId: z.string() }),
        untrusted: [],
        describeApproval: async () =>
          'Run the one disposable local test write.',
        run: async (_context, { requestId }) => {
          if (mode === 'live-observer') {
            writeStarted.resolve();
            await releaseWrite.promise;
          }
          await storage.db.none(
            `INSERT INTO "${schemaName}".queue_audit(kind, request_id) VALUES ('write', $1)`,
            [requestId]
          );
          return { done: true };
        },
        summarize: () => ({ done: true }),
      },
    ],
    { services: () => ({}), language: 'ru' }
  ).piece_create;
  const model = ({ requestContext }) => {
    const requestId = requestContext.get('cf.executionId');
    return new MockLanguageModelV3({
      doStream: async (options) => {
        await storage.db.none(
          `INSERT INTO "${schemaName}".queue_audit(kind, request_id) VALUES ('model', $1)`,
          [requestId]
        );
        const done = options.prompt.at(-1)?.role === 'tool';
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'response-metadata',
              id: `response-${requestId}`,
              modelId: 'mock',
              timestamp: new Date(0),
            },
            ...(done
              ? [
                  { type: 'text-start', id: 'done' },
                  {
                    type: 'text-delta',
                    id: 'done',
                    delta: `complete:${requestId}`,
                  },
                  { type: 'text-end', id: 'done' },
                  {
                    type: 'finish',
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage,
                  },
                ]
              : [
                  {
                    type: 'tool-call',
                    toolName:
                      requestId === `parent-${mode}` ? 'hold' : 'piece_create',
                    toolCallId: `call-${requestId}`,
                    input: JSON.stringify(
                      requestId === `parent-${mode}` ? {} : { requestId }
                    ),
                  },
                  {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                    usage,
                  },
                ]),
          ]),
        };
      },
    });
  };
  const backing = new Agent({
    id: 'r5-probe',
    name: 'Native queue probe',
    instructions: 'Use the supplied tools.',
    model,
    memory,
    tools: { hold, piece_create: write },
  });
  const agent = createDurableAgent({
    agent: backing,
    cleanupTimeoutMs: 0,
    shouldPersistSnapshot: () => true,
  });
  let session, mastra;
  const contextFor = (requestId) =>
    buildConductorContext({
      identity,
      threadId: `r5-${mode}`,
      requestId,
      trackExecution: true,
    });
  const workflow = native.createNativeQueuedInputWorkflow({
    resolveRuntime: async (input) => {
      const requestContext = contextFor(input.requestId);
      await session.thread.ensureCurrentSubscription(requestContext);
      return {
        agent,
        requestContext,
        streamOptions: await session.machinery.buildStreamOptions({
          requestContext,
          threadId: input.threadId,
        }),
        run: async (work) => {
          await storage.db.none(
            `INSERT INTO "${schemaName}".queue_audit(kind, request_id) VALUES ('admission', $1)`,
            [input.requestId]
          );
          return work();
        },
      };
    },
  });
  const controller = new AgentController({
    id: 'r5-probe',
    agent,
    storage,
    memory,
    modes: [{ id: 'assistant', name: 'Assistant', default: true }],
    defaultModeId: 'assistant',
  });
  mastra = new Mastra({
    logger: false,
    storage,
    agents: { 'r5-probe': agent },
    agentControllers: { 'r5-probe': controller },
    workflows: { nativeQueuedInput: workflow },
    recovery: { durableAgents: 'auto' },
  });
  const host = mastra.getAgentController('r5-probe');
  await host.initStorage();
  session = await host.createSession({
    id: `r5-session-${mode}`,
    resourceId,
    threadId: `r5-${mode}`,
  });
  if (!(await memory.getThreadById({ threadId: `r5-${mode}` })))
    await memory.createThread({ threadId: `r5-${mode}`, resourceId });
  return {
    storage,
    memory,
    agent,
    workflow,
    mastra,
    session,
    contextFor,
    mainStarted,
    writeStarted,
    releaseWrite,
    close: async () => {
      await mastra.shutdown();
      await storage.close();
    },
  };
}

async function child(schemaName, mode, part) {
  const f = await runtime(schemaName, mode, true);
  const input = signalInput(mode, part === 'second' ? 2 : 1);
  if (mode === 'approval') delete input.previousRunId;
  if (mode === 'gap') {
    delete input.previousRunId;
    const state = await f.storage.getStore('threadState');
    const save = state.setState.bind(state);
    state.setState = async (args) => {
      if (args.value?.state === 'completed') {
        const ids = native.nativeQueuedInputIds(input);
        const workflows = await f.storage.getStore('workflows');
        // Test-only barrier: FINISH can precede the native workflow's lease
        // settlement. Kill in the exact terminal-child / wrapper-receipt gap.
        for (let n = 0; n < 100; n++) {
          if (
            !(await workflows.getRunOwnership({ runId: ids.childRunId }))?.live
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(
          (await workflows.getRunOwnership({ runId: ids.childRunId }))?.live,
          false
        );
        await barrier('gap', { ids });
      }
      return save(args);
    };
  } else if (part !== 'second' && mode !== 'approval') {
    const out = await f.agent.stream('Hold original turn', {
      requestContext: f.contextFor(`parent-${mode}`),
      runId: `main-${mode}`,
      memory: { thread: input.threadId, resource: resourceId },
      maxSteps: 3,
    });
    void (async () => {
      for await (const _chunk of out.fullStream) {
        /* keep native execution live */
      }
    })();
    await f.mainStarted.promise;
  }
  if (mode === 'raw') {
    const result = f.agent.queueSignal(
      { type: 'user', ...input.signal },
      {
        resourceId,
        threadId: input.threadId,
        ifIdle: {
          streamOptions: await f.session.machinery.buildStreamOptions({
            requestContext: f.contextFor(input.requestId),
          }),
        },
      }
    );
    const accepted = await result.accepted;
    await barrier('accepted', { accepted, signalId: result.signal.id });
  }
  if (mode === 'persist') {
    const result = f.agent.sendSignal(
      { type: 'user', ...input.signal },
      {
        resourceId,
        threadId: input.threadId,
        ifActive: { behavior: 'persist' },
        ifIdle: {
          behavior: 'persist',
          streamOptions: { requestContext: f.contextFor(input.requestId) },
        },
      }
    );
    assert.equal((await result.accepted).action, 'persist');
    assert.ok(result.persisted);
    await result.persisted;
    await barrier('accepted', { signalId: result.signal.id });
  }
  const queued = await native.enqueueNativeQueuedInput({
    host: f.mastra,
    workflow: f.workflow,
    input,
  });
  if (mode === 'approval') {
    await testWaitUntil(
      async () =>
        f.session.approval.isArmed({ toolCallId: `call-${input.requestId}` }) &&
        (
          await f.agent.listSuspendedRuns({
            threadId: input.threadId,
            resourceId,
          })
        ).runs.some((run) => run.runId === queued.childRunId)
    );
  }
  if (mode === 'stop-before')
    await native.stopNativeQueuedInput({
      host: f.mastra,
      workflow: f.workflow,
      ...queued,
      threadId: input.threadId,
      agent: f.agent,
    });
  if (mode !== 'gap') await barrier('accepted', { ids: queued });
  await new Promise(() => {});
}

async function startChild(schemaName, mode, part) {
  const worker = spawn(
    process.execPath,
    [__filename, '--child', schemaName, mode, part || 'first'],
    {
      env: { ...process.env, CF_TEST_PG_URL: connectionString },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );
  let stderr = '';
  worker.stderr.on('data', (data) => {
    stderr += String(data);
  });
  worker.stdout.on('data', (data) => {
    stderr += String(data);
  });
  const stopped = new Promise((resolve) =>
    worker.once('close', (code, signal) => resolve({ code, signal }))
  );
  const timer = setTimeout(() => worker.kill('SIGKILL'), 25_000);
  const message = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('close', () =>
      reject(new Error(`Child did not reach acceptance: ${stderr}`))
    );
  });
  return {
    message,
    kill: async () => {
      worker.kill('SIGKILL');
      const result = await stopped;
      clearTimeout(timer);
      assert.equal(result.signal, 'SIGKILL', stderr);
    },
  };
}

async function admissionFaults(schemaName) {
  const report = {};
  for (const kind of ['read', 'claim', 'dispatch', 'lost-tail-ack']) {
    const mode = `fault-${kind}`;
    const f = await runtime(schemaName, mode);
    const input = signalInput(mode);
    const ids = native.nativeQueuedInputIds(input);
    const workflows = await f.storage.getStore('workflows');
    const memoryStore = await f.storage.getStore('memory');
    const originals = {
      read: workflows.getWorkflowRunById,
      claim: workflows.claimRunOwnership,
      dispatch: workflows.persistWorkflowSnapshot,
      tail: memoryStore.updateThreadMetadata,
    };
    try {
      if (kind === 'read')
        workflows.getWorkflowRunById = async () => {
          throw new Error('injected native read outage');
        };
      if (kind === 'claim')
        workflows.claimRunOwnership = async () => {
          throw new Error('injected native claim outage');
        };
      if (kind === 'dispatch')
        workflows.persistWorkflowSnapshot = async (args) => {
          if (
            args.workflowName === native.NATIVE_QUEUED_INPUT_WORKFLOW_ID &&
            args.snapshot.context?.input?.signal
          )
            throw new Error('injected durable dispatch outage');
          return originals.dispatch.call(workflows, args);
        };
      if (kind === 'lost-tail-ack')
        memoryStore.updateThreadMetadata = async (args) => {
          await originals.tail.call(memoryStore, args);
          throw new Error(
            'injected lost acknowledgement after native fenced tail commit'
          );
        };
      let error;
      try {
        await native.enqueueNativeQueuedInput({
          host: f.mastra,
          workflow: f.workflow,
          input,
        });
      } catch (caught) {
        error = caught;
      }
      assert.ok(error, `${kind} falsely returned accepted`);
      workflows.getWorkflowRunById = originals.read;
      workflows.claimRunOwnership = originals.claim;
      workflows.persistWorkflowSnapshot = originals.dispatch;
      memoryStore.updateThreadMetadata = originals.tail;
      if (kind === 'lost-tail-ack') {
        assert.equal(error.code, 'QUEUED_INPUT_ACCEPTANCE_UNCERTAIN');
        assert.equal(error.receipt.workflowRunId, ids.workflowRunId);
        const replay = await native.enqueueNativeQueuedInput({
          host: f.mastra,
          workflow: f.workflow,
          input: {
            ...input,
            requestId: 'new-http-retry-must-not-replace-original',
          },
        });
        assert.equal(replay.duplicate, true);
        assert.equal(replay.requestId, input.requestId);
        await assert.rejects(
          native.enqueueNativeQueuedInput({
            host: f.mastra,
            workflow: f.workflow,
            input: {
              ...input,
              signal: {
                ...input.signal,
                contents: 'different words under the same human id',
              },
            },
          }),
          /different input/
        );
      }
      const writes = await f.storage.db.one(
        `SELECT count(*)::int AS count FROM "${schemaName}".queue_audit WHERE request_id=$1`,
        [input.requestId]
      );
      assert.equal(writes.count, 0);
      report[kind] = {
        accepted: false,
        modelOrDomainCalls: 0,
        code: error.code || 'unavailable',
        originalRequestPreserved: kind === 'lost-tail-ack',
      };
    } finally {
      workflows.getWorkflowRunById = originals.read;
      workflows.claimRunOwnership = originals.claim;
      workflows.persistWorkflowSnapshot = originals.dispatch;
      memoryStore.updateThreadMetadata = originals.tail;
      const current = await f.workflow.getWorkflowRunById(ids.workflowRunId);
      if (current)
        await native.stopNativeQueuedInput({
          host: f.mastra,
          workflow: f.workflow,
          ...ids,
          threadId: input.threadId,
          agent: f.agent,
        });
      await f.close();
    }
  }
  return report;
}

async function liveObserverProof(schemaName) {
  const f = await runtime(schemaName, 'live-observer');
  const input = signalInput('live-observer');
  delete input.previousRunId;
  try {
    const ids = await native.enqueueNativeQueuedInput({
      host: f.mastra,
      workflow: f.workflow,
      input,
    });
    await f.writeStarted.promise;
    const attached = deferred();
    const pubsub = f.agent.pubsub;
    const subscribe = pubsub.subscribeWithReplay.bind(pubsub);
    let subscriptions = 0;
    pubsub.subscribeWithReplay = async (...args) => {
      await subscribe(...args);
      if (args[0] === AGENT_STREAM_TOPIC(ids.childRunId)) {
        subscriptions++;
        attached.resolve();
      }
    };
    const replay = (
      await f.workflow.createRun({ runId: ids.workflowRunId })
    ).restart();
    let timer;
    try {
      // Observe the real public subscription rather than a particular wrapper
      // method. The isolated native view subscribes directly through PubSub.
      await Promise.race([
        attached.promise,
        replay.then(() => {
          throw new Error('Native replay settled before its observer attached');
        }),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(
            `Native live observer did not subscribe in ${schemaName}`
          )), 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      pubsub.subscribeWithReplay = subscribe;
    }
    f.releaseWrite.resolve();
    await replay;
    assert.equal(subscriptions, 1, 'The live workflow replay must attach one native observer.');
    const audits = await f.storage.db.any(
      `SELECT kind, count(*)::int AS count FROM "${schemaName}".queue_audit WHERE request_id=$1 GROUP BY kind`,
      [input.requestId]
    );
    const counts = Object.fromEntries(
      audits.map((row) => [row.kind, row.count])
    );
    assert.equal(counts.admission, 1);
    assert.equal(counts.write, 1);
    assert.equal(
      (await f.workflow.getWorkflowRunById(ids.workflowRunId)).status,
      'success'
    );
    return {
      admissions: counts.admission,
      domainWrites: counts.write,
      observerOnly: true,
    };
  } finally {
    f.releaseWrite.resolve();
    await f.close();
  }
}

async function stopRaceChild(schemaName) {
  const f = await runtime(schemaName, 'stop-race');
  const input = signalInput('stop-race');
  delete input.previousRunId;
  const ids = native.nativeQueuedInputIds(input);
  const state = await f.storage.getStore('threadState');
  const save = state.setState.bind(state);
  const released = deferred();
  process.once('message', () => released.resolve());
  state.setState = async (args) => {
    if (args.value?.state === 'started') {
      process.send({ stage: 'before-start-intent', pid: process.pid, ids });
      await released.promise;
    }
    return save(args);
  };
  try {
    const run = await f.workflow.createRun({
      runId: ids.workflowRunId,
      resourceId,
    });
    await run.start({ inputData: { ...input, childRunId: ids.childRunId } });
    const audits = await f.storage.db.any(
      `SELECT kind, count(*)::int AS count FROM "${schemaName}".queue_audit WHERE request_id=$1 GROUP BY kind`,
      [input.requestId]
    );
    process.send({
      stage: 'finished',
      counts: Object.fromEntries(audits.map((row) => [row.kind, row.count])),
      disposition: await native.readNativeQueuedInputDisposition(
        f.mastra,
        input.threadId,
        ids.childRunId
      ),
    });
  } finally {
    await f.close();
    process.disconnect();
  }
}

async function stopRaceProof(schemaName) {
  const worker = spawn(
    process.execPath,
    [__filename, '--stop-race-child', schemaName],
    {
      env: { ...process.env, CF_TEST_PG_URL: connectionString },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );
  let diagnostic = '';
  worker.stdout.on('data', (value) => {
    diagnostic += String(value);
  });
  worker.stderr.on('data', (value) => {
    diagnostic += String(value);
  });
  const stopped = new Promise((resolve) =>
    worker.once('close', (code, signal) => resolve({ code, signal }))
  );
  const nextMessage = () =>
    new Promise((resolve, reject) => {
      const onMessage = (value) => {
        cleanup();
        resolve(value);
      };
      const onClose = () => {
        cleanup();
        reject(new Error(`Stop barrier worker exited early: ${diagnostic}`));
      };
      const cleanup = () => {
        worker.off('message', onMessage);
        worker.off('close', onClose);
      };
      worker.once('message', onMessage);
      worker.once('close', onClose);
    });
  let f;
  try {
    const boundary = await nextMessage();
    assert.equal(boundary.stage, 'before-start-intent');
    assert.notEqual(boundary.pid, process.pid);
    f = await runtime(schemaName, 'stop-race');
    const input = signalInput('stop-race');
    await native.stopNativeQueuedInput({
      host: f.mastra,
      workflow: f.workflow,
      threadId: input.threadId,
      ...boundary.ids,
      agent: f.agent,
    });
    assert.equal(
      (
        await native.readNativeQueuedInputDisposition(
          f.mastra,
          input.threadId,
          boundary.ids.childRunId
        )
      ).state,
      'stopped'
    );
    const finished = nextMessage();
    worker.send({ resume: true });
    const result = await finished;
    assert.equal(result.stage, 'finished');
    assert.equal(
      result.disposition.state,
      'stopped',
      'A late start-intent write must never erase acknowledged Stop.'
    );
    assert.equal(
      result.counts.model || 0,
      0,
      'No provider work may start after acknowledged Stop.'
    );
    assert.equal(
      result.counts.write || 0,
      0,
      'No domain write may start after acknowledged Stop.'
    );
    assert.equal(result.counts.admission || 0, 0);
    assert.deepEqual(await stopped, { code: 0, signal: null }, diagnostic);
    // A fresh host must read the same durable Stop after the original worker exits.
    await f.close();
    f = await runtime(schemaName, 'stop-race');
    assert.equal(
      (
        await native.readNativeQueuedInputDisposition(
          f.mastra,
          input.threadId,
          boundary.ids.childRunId
        )
      ).state,
      'stopped'
    );
    const state = await f.storage.getStore('threadState');
    const readState = state.getState.bind(state);
    state.getState = async (args) => {
      if (args.type.startsWith('queued-input-stop:'))
        throw new Error('injected Stop witness read failure');
      return readState(args);
    };
    await assert.rejects(
      native.readNativeQueuedInputDisposition(
        f.mastra,
        input.threadId,
        boundary.ids.childRunId
      ),
      /Stop witness read failure/
    );
    state.getState = readState;
    const writeState = state.setState.bind(state);
    state.setState = async (args) => {
      if (args.type.startsWith('queued-input-stop:'))
        throw new Error('injected Stop witness write failure');
      return writeState(args);
    };
    const otherIds = native.nativeQueuedInputIds({
      ...input,
      signal: { ...input.signal, id: 'stop-write-outage' },
    });
    await assert.rejects(
      native.stopNativeQueuedInput({
        host: f.mastra,
        workflow: f.workflow,
        threadId: input.threadId,
        ...otherIds,
        agent: f.agent,
      }),
      /Stop witness write failure/
    );
    state.setState = writeState;
    return {
      distinctProcesses: true,
      stopBeforeStartIntentCommit: true,
      coldStopRetained: true,
      stopReadFailureRefused: true,
      stopWriteFailureRefused: true,
      admissions: 0,
      providerCalls: 0,
      domainWrites: 0,
    };
  } finally {
    if (worker.exitCode === null && worker.signalCode === null)
      worker.kill('SIGKILL');
    await stopped;
    await f?.close();
  }
}

async function main() {
  if (process.argv[2] === '--child')
    return child(process.argv[3], process.argv[4], process.argv[5]);
  if (process.argv[2] === '--stop-race-child')
    return stopRaceChild(process.argv[3]);
  const schemaName = `cf_r5_${process.pid}_${Date.now()}`;
  const watchdog = setTimeout(() => {
    console.error(`Native queue probe timed out in ${schemaName}`);
    process.exit(1);
  }, 60_000);
  const owner = new PostgresStore({
    id: schemaName,
    connectionString,
    schemaName,
  });
  await owner.init();
  await owner.db.none(
    `CREATE TABLE "${schemaName}".queue_audit (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, request_id TEXT NOT NULL)`
  );
  const report = {};
  try {
    if (process.argv[2] === '--stop-race') {
      console.log(
        JSON.stringify({ stopRace: await stopRaceProof(schemaName) })
      );
      return;
    }
    if (process.argv[2] === '--live-observer') {
      console.log(JSON.stringify({ liveObserver: await liveObserverProof(schemaName) }));
      return;
    }
    for (const mode of [
      'raw',
      'persist',
      'fifo',
      'gap',
      'stop-before',
      'stop-after',
      'approval',
    ]) {
      console.error(`R5 ${schemaName}: ${mode}`);
      const first = await startChild(schemaName, mode);
      if (mode === 'fifo') {
        const second = await startChild(schemaName, mode, 'second');
        await second.kill();
      }
      await first.kill();
      const f = await runtime(schemaName, mode);
      try {
        const input = signalInput(mode);
        const ids = native.nativeQueuedInputIds(input);
        const memoryStore = await f.storage.getStore('memory');
        const saved = await memoryStore.listMessagesById({
          messageIds: [input.signal.id],
        });
        const before = await f.storage.db.one(
          `SELECT count(*)::int AS count FROM "${schemaName}".queue_audit WHERE kind='write' AND request_id LIKE $1`,
          [`request-${mode}-%`]
        );
        if (mode === 'raw' || mode === 'persist') {
          assert.equal(saved.messages.length, mode === 'persist' ? 1 : 0);
          if (mode === 'persist') {
            assert.equal(
              saved.messages[0].content.parts[0].text,
              input.signal.contents
            );
            assert.equal(
              saved.messages[0].content.metadata.signal.author.id,
              identity.userId
            );
          }
          assert.equal(before.count, 0);
          report[mode] = {
            signal: 'SIGKILL',
            savedHumanMessages: saved.messages.length,
            domainWrites: 0,
          };
          continue;
        }
        const snapshot = await (
          await f.storage.getStore('workflows')
        ).loadWorkflowSnapshot({
          workflowName: native.NATIVE_QUEUED_INPUT_WORKFLOW_ID,
          runId: ids.workflowRunId,
        });
        assert.equal(
          snapshot.context.input.signal.contents,
          input.signal.contents
        );
        assert.equal(snapshot.context.input.requestId, input.requestId);
        assert.equal(snapshot.context.input.signal.author.id, identity.userId);
        if (mode === 'fifo') {
          const second = native.nativeQueuedInputIds(signalInput(mode, 2));
          const secondSnapshot = await (
            await f.storage.getStore('workflows')
          ).loadWorkflowSnapshot({
            workflowName: native.NATIVE_QUEUED_INPUT_WORKFLOW_ID,
            runId: second.workflowRunId,
          });
          assert.equal(
            secondSnapshot.context.input.previousRunId,
            ids.childRunId
          );
          assert.equal(
            secondSnapshot.context.input.previousWorkflowRunId,
            ids.workflowRunId
          );
        }
        if (mode === 'stop-after')
          await native.stopNativeQueuedInput({
            host: f.mastra,
            workflow: f.workflow,
            ...ids,
            threadId: input.threadId,
            agent: f.agent,
          });
        const workflows = await f.storage.getStore('workflows');
        const oldOwner = await workflows.getRunOwnership({
          runId: `main-${mode}`,
        });
        if (oldOwner) await workflows.releaseRunOwnership(oldOwner); // the test has proven its child process dead
        if (mode === 'fifo') {
          await f.session.thread.ensureCurrentSubscription(
            f.contextFor(input.requestId)
          );
          f.recovery = await Promise.all([
            f.workflow.restartAllActiveWorkflowRuns(),
            f.agent.recoverActiveRuns({ runId: `main-${mode}` }),
          ]);
        } else if (mode === 'approval') {
          const toolCallId = `call-${input.requestId}`;
          assert.equal(
            await f.session.hasPersistedToolApproval(toolCallId),
            true
          );
          await f.session.thread.ensureCurrentSubscription(
            f.contextFor(input.requestId)
          );
          await Promise.all([
            f.workflow.restartAllActiveWorkflowRuns(),
            f.session.respondToPersistedToolApproval({
              toolCallId,
              approved: true,
              requestContext: f.contextFor(input.requestId),
            }),
          ]);
        } else await f.workflow.restartAllActiveWorkflowRuns();
        const after = await f.storage.db.one(
          `SELECT count(*)::int AS count FROM "${schemaName}".queue_audit WHERE kind='write' AND request_id LIKE $1`,
          [`request-${mode}-%`]
        );
        const status = (await f.workflow.getWorkflowRunById(ids.workflowRunId))
          .status;
        if (mode === 'fifo') {
          assert.equal(
            after.count,
            2,
            JSON.stringify({
              status,
              recovery: f.recovery,
              first: await f.workflow.getWorkflowRunById(ids.workflowRunId),
              second: await f.workflow.getWorkflowRunById(
                native.nativeQueuedInputIds(signalInput(mode, 2)).workflowRunId
              ),
              audits: await f.storage.db.any(
                `SELECT kind, request_id FROM "${schemaName}".queue_audit ORDER BY id`
              ),
            })
          );
          const writes = await f.storage.db.any(
            `SELECT request_id FROM "${schemaName}".queue_audit WHERE kind='write' AND request_id LIKE $1 ORDER BY id`,
            [`request-${mode}-%`]
          );
          assert.deepEqual(
            writes.map((r) => r.request_id),
            [`request-${mode}-1`, `request-${mode}-2`]
          );
          assert.equal(status, 'success');
          const messages = await memoryStore.listMessagesById({
            messageIds: [input.signal.id, signalInput(mode, 2).signal.id],
          });
          assert.equal(messages.messages.length, 2);
        } else if (mode === 'approval') {
          assert.equal(before.count, 0);
          assert.equal(after.count, 1);
          assert.equal(status, 'success');
        } else if (mode === 'gap') {
          assert.equal(before.count, 1);
          assert.equal(after.count, 1);
          assert.equal(status, 'suspended');
        } else {
          assert.equal(after.count, 0);
          assert.equal(status, 'canceled');
          assert.equal(
            (
              await native.readNativeQueuedInputDisposition(
                f.mastra,
                input.threadId,
                ids.childRunId
              )
            ).state,
            'stopped'
          );
        }
        report[mode] = {
          signal: 'SIGKILL',
          wordsPreserved: true,
          domainWrites: after.count,
          status,
          childRunId: ids.childRunId,
        };
        const admitted = await f.storage.db.one(
          `SELECT count(*)::int AS count FROM "${schemaName}".queue_audit WHERE kind='admission' AND request_id LIKE $1`,
          [`request-${mode}-%`]
        );
        assert.equal(
          admitted.count,
          mode === 'fifo' ? 2 : mode.startsWith('stop-') ? 0 : 1
        );
        report[mode].admissions = admitted.count;
      } finally {
        await f.close();
      }
    }
    console.error(`R5 ${schemaName}: admission-faults`);
    report.faults = await admissionFaults(schemaName);
    console.error(`R5 ${schemaName}: live-observer`);
    report.liveObserver = await liveObserverProof(schemaName);
    console.log(JSON.stringify(report));
  } finally {
    await owner.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
    await owner.close();
    clearTimeout(watchdog);
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
