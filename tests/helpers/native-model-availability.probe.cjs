'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { Agent } = require('@mastra/core/agent');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { RequestContext } = require('@mastra/core/request-context');
const { Memory } = require('@mastra/memory');
const { PostgresStore } = require('@mastra/pg');
const { createTool } = require('@mastra/core/tools');
const { z } = require('zod');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const {
  createNativeModelAvailabilityWorkflow,
  NativeModelAvailability,
  queueNativeModelAvailabilityContinuation,
} = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/native-model-availability.ts'
);

const usage = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 5, text: 5 },
};

const response = (parts, modelId, finishReason = 'stop') => ({
  stream: convertArrayToReadableStream([
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: 'availability-response',
      modelId,
      timestamp: new Date(0),
    },
    ...parts,
    {
      type: 'finish',
      finishReason: { unified: finishReason, raw: finishReason },
      usage,
    },
  ]),
});

async function runMemoryProbe(options = {}) {
  const storage = new InMemoryStore({ id: 'native-availability-probe' });
  const memory = new Memory({
    storage,
    options: { generateTitle: false, semanticRecall: false },
  });
  const workflow = createNativeModelAvailabilityWorkflow();
  const runId = 'availability-probe-run';
  const attempts = [];
  const waits = [];
  const signals = [];
  let writes = 0;
  let restored = false;
  let availability;
  let durable;
  let active;
  let partialSeen = false;
  let queuedRunId;
  const processor = {
    id: 'availability-probe-processor',
    async processInputStep(args) {
      active = {
        modelId: args.model.modelId,
        stepNumber: args.stepNumber,
        abortSignal: args.abortSignal,
      };
      await availability.beforeAttempt({
        runId,
        stepNumber: args.stepNumber,
        abortSignal: args.abortSignal,
      });
      return {};
    },
    async processAPIError(args) {
      if (active.abortSignal?.aborted || args.error?.statusCode !== 503) return;
      if (active.modelId !== 'fallback-2') return;
      await availability.wait({
        runId,
        stepNumber: args.stepNumber,
        abortSignal: active.abortSignal,
        delayMs: 150,
      });
      restored = waits.length >= (options.restoreAfterCycles ?? 1);
      if (options.steer) {
        return queueNativeModelAvailabilityContinuation(durable, {
          runId,
          stepNumber: args.stepNumber,
          abortSignal: active.abortSignal,
          resourceId: 'availability-resource',
          threadId: 'availability-thread',
          onQueued: (nextRunId) => {
            queuedRunId = nextRunId;
            signals.push({ action: 'deliver', runId: nextRunId });
          },
        });
      }
      const sent = durable.sendSignal(
        {
          type: 'reactive',
          transient: true,
          contents:
            'Provider cooldown elapsed. Continue the current task with its completed tool results.',
        },
        { runId, ifActive: { behavior: 'deliver' } }
      );
      signals.push(await sent.accepted);
      return { retry: true };
    },
  };
  const models = ['primary', 'fallback-1', 'fallback-2'].map((modelId) => ({
    maxRetries: 0,
    model: new MockLanguageModelV3({
      modelId,
      async doStream(args) {
        attempts.push({
          modelId,
          hasToolResult: JSON.stringify(args.prompt).includes('write-accepted'),
        });
        if (writes === 0) {
          return response(
            [
              {
                type: 'tool-call',
                toolCallId: 'availability-write-1',
                toolName: 'save',
                input: '{}',
              },
            ],
            modelId,
            'tool-calls'
          );
        }
        if (restored && modelId === 'primary') {
          return response(
            [
              { type: 'text-start', id: 'answer' },
              {
                type: 'text-delta',
                id: 'answer',
                delta: 'Recovered using the primary model.',
              },
              { type: 'text-end', id: 'answer' },
            ],
            modelId
          );
        }
        if (options.partial && !partialSeen && modelId === 'primary') {
          partialSeen = true;
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'partial' },
              {
                type: 'text-delta',
                id: 'partial',
                delta: 'Incomplete provider output. ',
              },
              {
                type: 'error',
                error: Object.assign(new Error('Primary interrupted'), {
                  statusCode: 503,
                }),
              },
            ]),
          };
        }
        throw Object.assign(new Error(`${modelId} unavailable`), {
          statusCode: 503,
        });
      },
    }),
  }));
  const agent = new Agent({
    id: 'availability-probe-agent',
    name: 'Availability probe',
    instructions: 'Use save once, then answer.',
    model: models,
    durable: true,
    memory,
    tools: {
      save: createTool({
        id: 'save',
        description: 'Save once.',
        inputSchema: z.object({}),
        outputSchema: z.object({ result: z.string() }),
        execute: async () => {
          writes++;
          return { result: 'write-accepted' };
        },
      }),
    },
    inputProcessors: [processor],
    errorProcessors: [processor],
    defaultOptions: {
      maxSteps: options.restoreAfterCycles ? 2 : 12,
      maxProcessorRetries: 6,
    },
  });
  const mastra = new Mastra({
    agents: { agent },
    workflows: { availability: workflow },
    storage,
    recovery: { durableAgents: 'auto', workflows: 'auto' },
  });
  availability = new NativeModelAvailability(mastra, workflow, (state) => {
    waits.push(state);
  });
  durable = mastra.getAgent('agent');
  const threadChunks = [];
  let subscription;
  let continuation;
  if (options.steer) {
    subscription = await durable.subscribeToThread({
      resourceId: 'availability-resource',
      threadId: 'availability-thread',
    });
    continuation = (async () => {
      for await (const chunk of subscription.stream) {
        threadChunks.push(chunk);
        if (chunk.runId === queuedRunId && chunk.type === 'finish') return;
      }
    })();
  }
  const stream = await durable.stream('Save a result and answer.', {
    runId,
    memory: {
      resource: 'availability-resource',
      thread: 'availability-thread',
    },
    requestContext: new RequestContext([['cf.nativeRunId', runId]]),
  });
  const chunks = [];
  const reader = stream.fullStream.getReader();
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
  }
  await durable.runRegistry.get(runId)?.workflowExecution;
  if (continuation) {
    let timer;
    try {
      await Promise.race([
        continuation,
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error('Queued native continuation did not finish.')),
            8_000
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      subscription.unsubscribe();
    }
  }
  const text = (options.steer ? threadChunks : chunks)
    .filter((part) => part.type === 'text-delta')
    .map((part) => part.payload.text)
    .join('');
  const states = await availability.states(runId);
  stream.cleanup();
  await mastra.shutdown();
  if (options.partial)
    return {
      diagnostic: options.steer
        ? 'partial-native-continuation'
        : 'partial-output',
      attempts,
      writes,
      waits: waits.length,
      signals,
      text,
      states,
      queuedRunId,
      threadChunkSummary: threadChunks.map((chunk) => ({
        type: chunk.type,
        runId: chunk.runId,
      })),
      errors: chunks.filter((part) => part.type === 'error'),
    };
  assert.equal(writes, 1);
  assert.equal(waits.length, options.restoreAfterCycles ?? 1);
  if (!options.partial)
    assert.equal(text, 'Recovered using the primary model.');
  if (!options.partial)
    assert.deepEqual(
      attempts.map((attempt) => attempt.modelId),
      [
        'primary',
        ...Array.from({ length: options.restoreAfterCycles ?? 1 }, () => [
          'primary',
          'fallback-1',
          'fallback-2',
        ]).flat(),
        'primary',
      ]
    );
  assert.equal(
    attempts.slice(1).every((attempt) => attempt.hasToolResult),
    true
  );
  assert.equal(states[0].status, 'success');
  return { attempts, writes, waits: waits.length, signals, text, states };
}

const pgUrl =
  process.env.CF_TEST_PG_URL ||
  'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';

async function createPgRuntime(schemaName, runId, options = {}) {
  const storage = new PostgresStore({
    id: `availability-${runId}`,
    connectionString: pgUrl,
    schemaName,
  });
  await storage.init();
  const memory = new Memory({
    storage,
    options: { generateTitle: false, semanticRecall: false },
  });
  const workflow = createNativeModelAvailabilityWorkflow();
  let availability;
  let durable;
  let active;
  let restored = options.restored;
  let partialSent = false;
  let queuedRunId;
  const observedChunks = [];
  let subscription;
  let continuation;
  const processor = {
    id: 'availability-probe-processor',
    async processInputStep(args) {
      active = {
        modelId: args.model.modelId,
        stepNumber: args.stepNumber,
        abortSignal: args.abortSignal,
      };
      await availability.beforeAttempt({
        runId,
        stepNumber: args.stepNumber,
        abortSignal: args.abortSignal,
      });
      return {};
    },
    async processAPIError(args) {
      if (
        active.abortSignal?.aborted ||
        args.error?.statusCode !== 503 ||
        active.modelId !== 'fallback-2'
      )
        return;
      await availability.wait({
        runId,
        stepNumber: args.stepNumber,
        abortSignal: active.abortSignal,
        delayMs: options.delayMs ?? 2_000,
      });
      if (active.abortSignal?.aborted) return;
      if (options.partialSteer) {
        restored = true;
        const decision = await queueNativeModelAvailabilityContinuation(
          durable,
          {
            runId,
            stepNumber: args.stepNumber,
            abortSignal: active.abortSignal,
            resourceId: `availability-resource-${runId}`,
            threadId: `availability-thread-${runId}`,
            onQueued: (nextRunId) => {
              queuedRunId = nextRunId;
            },
          }
        );
        if (options.stopQueued)
          durable.abortThreadStream({
            resourceId: `availability-resource-${runId}`,
            threadId: `availability-thread-${runId}`,
            clearPendingSignals: true,
          });
        return decision;
      }
      const sent = durable.sendSignal(
        {
          type: 'reactive',
          transient: true,
          contents:
            'Continue the current task using its completed tool results.',
        },
        { runId, ifActive: { behavior: 'deliver' } }
      );
      assert.equal((await sent.accepted).action, 'deliver');
      return { retry: true };
    },
  };
  const models = ['primary', 'fallback-1', 'fallback-2'].map((modelId) => ({
    maxRetries: 0,
    model: new MockLanguageModelV3({
      modelId,
      async doStream(args) {
        const hasToolResult = JSON.stringify(args.prompt).includes(
          'write-accepted'
        );
        await storage.db.none(
          `INSERT INTO "${schemaName}".availability_attempts (parent_run, model, has_tool_result, at_ms) VALUES ($1, $2, $3, $4)`,
          [runId, modelId, hasToolResult, Date.now()]
        );
        if (!hasToolResult)
          return response(
            [
              {
                type: 'tool-call',
                toolCallId: 'availability-write-1',
                toolName: 'save',
                input: '{}',
              },
            ],
            modelId,
            'tool-calls'
          );
        if (restored && modelId === 'primary')
          return response(
            [
              { type: 'text-start', id: 'answer' },
              {
                type: 'text-delta',
                id: 'answer',
                delta: 'Recovered using the primary model.',
              },
              { type: 'text-end', id: 'answer' },
            ],
            modelId
          );
        if (options.partialSteer && !partialSent && modelId === 'primary') {
          partialSent = true;
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'partial' },
              {
                type: 'text-delta',
                id: 'partial',
                delta: 'Incomplete provider output. ',
              },
              {
                type: 'error',
                error: Object.assign(new Error('Primary interrupted'), {
                  statusCode: 503,
                }),
              },
            ]),
          };
        }
        throw Object.assign(new Error(`${modelId} unavailable`), {
          statusCode: 503,
        });
      },
    }),
  }));
  const agent = new Agent({
    id: 'availability-probe-agent',
    name: 'Availability probe',
    instructions: 'Use save once, then answer.',
    model: models,
    durable: true,
    memory,
    tools: {
      save: createTool({
        id: 'save',
        description: 'Save once.',
        inputSchema: z.object({}),
        outputSchema: z.object({ result: z.string() }),
        execute: async () => {
          await storage.db.none(
            `INSERT INTO "${schemaName}".availability_writes (parent_run) VALUES ($1)`,
            [runId]
          );
          return { result: 'write-accepted' };
        },
      }),
    },
    inputProcessors: [processor],
    errorProcessors: [processor],
    defaultOptions: { maxSteps: 12, maxProcessorRetries: 6 },
  });
  const mastra = new Mastra({
    agents: { agent },
    workflows: { availability: workflow },
    storage,
    recovery: { durableAgents: 'auto', workflows: 'auto' },
  });
  availability = new NativeModelAvailability(
    mastra,
    workflow,
    options.onWaiting
  );
  durable = mastra.getAgent('agent');
  if (options.partialSteer && !options.stopQueued) {
    subscription = await durable.subscribeToThread({
      resourceId: `availability-resource-${runId}`,
      threadId: `availability-thread-${runId}`,
    });
    continuation = (async () => {
      for await (const chunk of subscription.stream) {
        observedChunks.push(chunk);
        if (
          queuedRunId &&
          chunk.runId === queuedRunId &&
          chunk.type === 'finish'
        )
          return;
      }
    })();
  }
  const drain = async (stream) => {
    const reader = stream.fullStream.getReader();
    const chunks = [];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value);
    }
    await durable.runRegistry.get(runId)?.workflowExecution;
    stream.cleanup();
    return chunks;
  };
  return {
    storage,
    mastra,
    durable,
    availability,
    workflow,
    drain,
    observedChunks,
    queuedRunId: () => queuedRunId,
    async start() {
      const chunks = await drain(
        await durable.stream('Save a result and answer.', {
          runId,
          memory: {
            resource: `availability-resource-${runId}`,
            thread: `availability-thread-${runId}`,
          },
          requestContext: new RequestContext([['cf.nativeRunId', runId]]),
        })
      );
      if (continuation) {
        let timer;
        try {
          await Promise.race([
            continuation,
            new Promise((_resolve, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error('Postgres native continuation did not finish.')
                  ),
                8_000
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
          subscription.unsubscribe();
        }
      }
      return chunks;
    },
  };
}

async function runPgChild(schemaName, runId) {
  const runtime = await createPgRuntime(schemaName, runId, {
    onWaiting: async (state) => {
      process.send({ kind: 'waiting', state });
    },
  });
  await runtime.start();
  await runtime.mastra.shutdown();
}

async function runPgProbe() {
  const schemaName = `cf_availability_${Date.now()}_${process.pid}`;
  const runId = 'availability-crash-recovery';
  const setup = new PostgresStore({
    id: 'availability-setup',
    connectionString: pgUrl,
    schemaName,
  });
  await setup.init();
  await setup.db.none(
    `CREATE TABLE "${schemaName}".availability_writes (id SERIAL PRIMARY KEY, parent_run TEXT NOT NULL)`
  );
  await setup.db.none(
    `CREATE TABLE "${schemaName}".availability_attempts (id SERIAL PRIMARY KEY, parent_run TEXT NOT NULL, model TEXT NOT NULL, has_tool_result BOOLEAN NOT NULL, at_ms DOUBLE PRECISION NOT NULL)`
  );
  let child;
  const runtimes = [];
  try {
    child = fork(__filename, ['--pg-child', schemaName, runId], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, CF_TEST_PG_URL: pgUrl },
    });
    let childErrors = '';
    child.stderr.on('data', (data) => {
      childErrors += data;
    });
    const waiting = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Outage child did not wait: ${childErrors}`)),
        20_000
      );
      child.on('message', (message) => {
        if (message.kind === 'waiting') {
          clearTimeout(timeout);
          resolve(message.state);
        }
      });
      child.once('exit', (code) => {
        if (code) {
          clearTimeout(timeout);
          reject(new Error(`Outage child exited ${code}: ${childErrors}`));
        }
      });
    });
    const workflowStore = await setup.getStore('workflows');
    const savedWait = await workflowStore.getWorkflowRunById({
      runId: waiting.waitRunId,
      workflowName: 'content-factory-model-availability-v1',
    });
    const waitSnapshot =
      typeof savedWait.snapshot === 'string'
        ? JSON.parse(savedWait.snapshot)
        : savedWait.snapshot;
    assert.equal(waitSnapshot.status, 'waiting');
    assert.equal(waitSnapshot.context.input.retryAt, waiting.retryAt);
    const exitPromise = once(child, 'exit');
    child.kill('SIGKILL');
    const [exitCode, signal] = await exitPromise;

    const runtime = await createPgRuntime(schemaName, runId, {
      restored: true,
    });
    runtimes.push(runtime);
    const checkpoint = await runtime.durable.listActiveRuns({});
    assert.equal(
      checkpoint.runs.some((run) => run.runId === runId),
      true
    );
    const coldWaits = await runtime.availability.states(runId);
    assert.equal(coldWaits[0].status, 'waiting');
    const chunks = await runtime.drain(
      await runtime.durable.recover(runId, { force: true })
    );
    const text = chunks
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.payload.text)
      .join('');
    const attempts = await setup.db.any(
      `SELECT model, has_tool_result, at_ms FROM "${schemaName}".availability_attempts WHERE parent_run=$1 ORDER BY id`,
      [runId]
    );
    const writes = await setup.db.one(
      `SELECT count(*)::int AS count FROM "${schemaName}".availability_writes WHERE parent_run=$1`,
      [runId]
    );
    assert.equal(writes.count, 1);
    assert.equal(text, 'Recovered using the primary model.');
    assert.deepEqual(
      attempts.map((attempt) => attempt.model),
      ['primary', 'primary', 'fallback-1', 'fallback-2', 'primary']
    );
    assert.equal(
      attempts.slice(1).every((attempt) => attempt.has_tool_result),
      true
    );
    assert.ok(
      attempts.at(-1).at_ms >= Date.parse(waiting.retryAt) - 30,
      'cold recovery must honor the persisted deadline'
    );

    let reportWaiting;
    const stopWaiting = new Promise((resolve) => {
      reportWaiting = resolve;
    });
    const stopRuntime = await createPgRuntime(schemaName, 'availability-stop', {
      delayMs: 2_000,
      onWaiting: reportWaiting,
    });
    runtimes.push(stopRuntime);
    const execution = stopRuntime.start();
    const stopState = await stopWaiting;
    const beforeStop = await setup.db.one(
      `SELECT count(*)::int AS count FROM "${schemaName}".availability_attempts WHERE parent_run=$1`,
      ['availability-stop']
    );
    stopRuntime.durable.abortRunStream('availability-stop');
    await stopRuntime.availability.cancel('availability-stop');
    await execution;
    const afterStop = await setup.db.one(
      `SELECT count(*)::int AS count FROM "${schemaName}".availability_attempts WHERE parent_run=$1`,
      ['availability-stop']
    );
    assert.equal(afterStop.count, beforeStop.count);
    const stopStates = await stopRuntime.availability.states(
      'availability-stop'
    );
    assert.equal(stopStates[0].status, 'canceled');
    const coldStop = new NativeModelAvailability(
      stopRuntime.mastra,
      stopRuntime.workflow
    );
    await assert.rejects(
      coldStop.beforeAttempt({
        runId: 'availability-stop',
        stepNumber: stopState.stepNumber,
      }),
      { name: 'AbortError' }
    );
    const afterColdStop = await setup.db.one(
      `SELECT count(*)::int AS count FROM "${schemaName}".availability_attempts WHERE parent_run=$1`,
      ['availability-stop']
    );
    assert.equal(afterColdStop.count, beforeStop.count);

    const partialRuntime = await createPgRuntime(
      schemaName,
      'availability-partial',
      { partialSteer: true, delayMs: 150 }
    );
    runtimes.push(partialRuntime);
    const partialInitialChunks = await partialRuntime.start();
    const partialAttempts = await setup.db.any(
      `SELECT model, has_tool_result FROM "${schemaName}".availability_attempts WHERE parent_run=$1 ORDER BY id`,
      ['availability-partial']
    );
    const partialWrites = await setup.db.one(
      `SELECT count(*)::int AS count FROM "${schemaName}".availability_writes WHERE parent_run=$1`,
      ['availability-partial']
    );
    const partialFinalText = partialRuntime.observedChunks
      .filter(
        (part) =>
          part.runId === partialRuntime.queuedRunId() &&
          part.type === 'text-delta'
      )
      .map((part) => part.payload.text)
      .join('');
    assert.equal(partialWrites.count, 1);
    assert.equal(
      partialInitialChunks.some((part) => part.type === 'error'),
      false
    );
    assert.equal(
      partialInitialChunks.some((part) => part.type === 'abort'),
      true
    );
    assert.equal(partialFinalText, 'Recovered using the primary model.');
    assert.deepEqual(
      partialAttempts.map((attempt) => attempt.model),
      ['primary', 'primary', 'fallback-1', 'fallback-2', 'primary']
    );
    assert.equal(
      partialAttempts.slice(1).every((attempt) => attempt.has_tool_result),
      true
    );

    const stopQueuedRuntime = await createPgRuntime(
      schemaName,
      'availability-stop-queued',
      { partialSteer: true, stopQueued: true, delayMs: 150 }
    );
    runtimes.push(stopQueuedRuntime);
    await stopQueuedRuntime.start();
    const queuedStopAttempts = await setup.db.any(
      `SELECT model FROM "${schemaName}".availability_attempts WHERE parent_run=$1 ORDER BY id`,
      ['availability-stop-queued']
    );
    assert.deepEqual(
      queuedStopAttempts.map((attempt) => attempt.model),
      ['primary', 'primary', 'fallback-1', 'fallback-2']
    );

    return {
      crash: {
        exitCode,
        signal,
        waitWasDurable: true,
        deadline: waiting.retryAt,
        attempts,
        writes: writes.count,
        text,
      },
      stop: {
        beforeAttempts: beforeStop.count,
        afterAttempts: afterColdStop.count,
        status: stopStates[0].status,
        coldAttemptRejected: true,
      },
      partial: {
        attempts: partialAttempts,
        writes: partialWrites.count,
        oldRunAborted: true,
        finalText: partialFinalText,
        internalRunChanged:
          partialRuntime.queuedRunId() !== 'availability-partial',
        clientErrorChunks: 0,
      },
      stopQueued: {
        attempts: queuedStopAttempts.length,
        continuationCanceled: true,
      },
    };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    for (const runtime of runtimes) {
      await runtime.mastra.shutdown();
      await runtime.storage.close();
    }
    await setup.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
    await setup.close();
  }
}

async function main() {
  if (process.argv[2] === '--pg-child')
    return runPgChild(process.argv[3], process.argv[4]);
  if (process.argv[2] === '--memory-partial')
    return runMemoryProbe({ partial: true });
  if (process.argv[2] === '--memory-steer')
    return runMemoryProbe({ partial: true, steer: true });
  if (process.argv[2] === '--memory-only') return runMemoryProbe();
  return {
    memory: await runMemoryProbe(),
    repeated: await runMemoryProbe({ restoreAfterCycles: 4 }),
    postgres: await runPgProbe(),
  };
}

main()
  .then((report) => {
    if (report) console.log(JSON.stringify(report));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
