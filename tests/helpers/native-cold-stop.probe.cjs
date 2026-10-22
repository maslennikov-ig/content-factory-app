'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { z } = require('zod');
const { Mastra } = require('@mastra/core/mastra');
const { Agent } = require('@mastra/core/agent');
const { AgentController } = require('@mastra/core/agent-controller');
const {
  createDurableAgent,
  DurableStepIds,
} = require('@mastra/core/agent/durable');
const { createTool } = require('@mastra/core/tools');
const { PostgresStore } = require('@mastra/pg');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');

const connectionString =
  process.env.CF_TEST_PG_URL ||
  'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
assert.ok(
  ['localhost', '127.0.0.1', '::1'].includes(new URL(connectionString).hostname)
);
const threadId = 'cold-stop-thread';
const resourceId = 'cold-stop-owner';
const runId = 'cold-stop-run';
const usage = {
  inputTokens: { total: 1, noCache: 1 },
  outputTokens: { total: 1, text: 1 },
};

async function runtime(schemaName, auditPath, kind) {
  const audit = (event) =>
    fs.appendFileSync(
      auditPath,
      JSON.stringify({ event, pid: process.pid }) + '\n'
    );
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
  const tool = createTool({
    id: 'fixture',
    description: 'Disposable local suspended tool',
    inputSchema: z.object({}),
    outputSchema: z.object({ done: z.boolean() }),
    requireApproval: kind === 'approval',
    ...(kind === 'question'
      ? {
          suspendSchema: z.object({ question: z.string() }),
          resumeSchema: z.object({ answer: z.string() }),
        }
      : {}),
    execute: async (_input, context) => {
      if (kind === 'question' && !context.agent.resumeData)
        return context.agent.suspend({ question: 'Local question?' });
      audit('domain');
      return { done: true };
    },
  });
  const model = new MockLanguageModelV3({
    doStream: async () => {
      audit('provider');
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'tool-call',
            toolCallId: 'call-fixture',
            toolName: 'fixture',
            input: '{}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          },
        ]),
      };
    },
  });
  const agent = createDurableAgent({
    agent: new Agent({
      id: 'cold-stop',
      name: 'Local cold Stop proof',
      instructions: 'Use fixture once.',
      memory,
      model,
      tools: { fixture: tool },
    }),
    cleanupTimeoutMs: 0,
  });
  const controller = new AgentController({
    id: 'cold-stop',
    agent,
    storage,
    memory,
    modes: [{ id: 'default', name: 'Default', default: true }],
    defaultModeId: 'default',
  });
  const mastra = new Mastra({
    logger: false,
    storage,
    agents: { 'cold-stop': agent },
    agentControllers: { 'cold-stop': controller },
    recovery: { durableAgents: 'auto' },
  });
  if (!(await memory.getThreadById({ threadId })))
    await memory.createThread({ threadId, resourceId });
  return {
    storage,
    memory,
    agent,
    controller,
    mastra,
    close: async () => {
      await mastra.shutdown();
      await storage.close();
    },
  };
}

async function child(schemaName, auditPath, kind) {
  const f = await runtime(schemaName, auditPath, kind);
  const stream = await f.agent.stream('Ask before a local write.', {
    runId,
    memory: { thread: threadId, resource: resourceId },
    closeOnSuspend: true,
  });
  const reader = stream.fullStream.getReader();
  const chunks = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }
  reader.releaseLock();
  assert.equal(
    (await f.agent.listSuspendedRuns({ threadId, resourceId })).runs.length,
    1,
    JSON.stringify({ kind, chunks })
  );
  process.send({ ready: true, pid: process.pid });
  await new Promise(() => {});
}

async function proof(kind, directory) {
  const schemaName = `cf_native_stop_${process.pid}_${kind}`;
  const auditPath = path.join(directory, `${kind}.jsonl`);
  const worker = fork(__filename, ['child', schemaName, auditPath, kind], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let diagnostic = '';
  worker.stdout.on('data', (chunk) => {
    diagnostic += String(chunk);
  });
  worker.stderr.on('data', (chunk) => {
    diagnostic += String(chunk);
  });
  const exited = new Promise((resolve) =>
    worker.once('exit', (code, signal) => resolve({ code, signal }))
  );
  let f;
  const timer = setTimeout(() => worker.kill('SIGKILL'), 15_000);
  try {
    const ready = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('exit', () => reject(new Error(diagnostic)));
    });
    assert.equal(ready.ready, true);
    worker.kill('SIGKILL');
    assert.equal((await exited).signal, 'SIGKILL');
    clearTimeout(timer);
    f = await runtime(schemaName, auditPath, kind);
    const workflows = await f.storage.getStore('workflows');
    const input = { workflowName: DurableStepIds.AGENTIC_LOOP, runId };
    assert.equal(
      (await workflows.loadWorkflowSnapshot(input)).status,
      'suspended'
    );
    const owner = await workflows.getRunOwnership({ runId });
    assert.notEqual(owner?.live, true);
    const before = fs.readFileSync(auditPath, 'utf8');
    const abortFoundLiveRun = f.agent.abortRunStream(runId);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      (await f.agent.listSuspendedRuns({ threadId, resourceId })).runs.length,
      1,
      'PubSub abort alone must reproduce the cold suspended-run gap.'
    );
    const workflow = f.agent.getWorkflow();
    await (await workflow.createRun({ runId })).cancel();
    assert.equal(
      (await workflows.loadWorkflowSnapshot(input)).status,
      'canceled'
    );
    assert.equal(
      (await f.agent.listSuspendedRuns({ threadId, resourceId })).runs.length,
      0
    );
    await assert.rejects(
      f.agent.resume(runId, { toolCallId: 'call-fixture', approved: true }),
      (error) => error.id === 'AGENT_RESUME_RUN_NOT_SUSPENDED'
    );
    assert.equal(
      fs.readFileSync(auditPath, 'utf8'),
      before,
      'Cold cancellation/resume refusal must never invoke provider or domain work.'
    );
    const innerBeforeRelease = (
      await workflows.loadWorkflowSnapshot({
        workflowName: DurableStepIds.AGENTIC_EXECUTION,
        runId,
      })
    )?.status;
    const session = await f.mastra
      .getAgentController('cold-stop')
      .createSession({ id: 'cold-stopper', threadId, resourceId });
    await session.machinery.releaseSuspendedRun(runId);
    assert.equal(await workflows.loadWorkflowSnapshot(input), null);
    assert.equal(
      await workflows.loadWorkflowSnapshot({
        workflowName: DurableStepIds.AGENTIC_EXECUTION,
        runId,
      }),
      null
    );
    assert.equal(
      (await f.agent.listSuspendedRuns({ threadId, resourceId })).runs.length,
      0
    );
    assert.equal(fs.readFileSync(auditPath, 'utf8'), before);
    return {
      kind,
      killedPid: ready.pid,
      freshPid: process.pid,
      abortFoundLiveRun,
      nativeCanceled: true,
      pendingAfterCancel: 0,
      resumeRefused: true,
      innerBeforeRelease,
      releaseRemovesBothSnapshots: true,
      additionalProviderCalls: 0,
      domainWrites: 0,
    };
  } finally {
    clearTimeout(timer);
    if (worker.exitCode === null && worker.signalCode === null)
      worker.kill('SIGKILL');
    await exited;
    if (!f) f = await runtime(schemaName, auditPath, kind);
    await f.storage.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
    await f.close();
  }
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-native-stop-'));
  try {
    console.log(
      JSON.stringify({
        results: [
          await proof('approval', directory),
          await proof('question', directory),
        ],
      })
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === 'child')
  child(...process.argv.slice(3)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
else
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
