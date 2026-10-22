'use strict';

require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { z } = require('zod');
const { PostgresStore } = require('@mastra/pg');
const { Mastra } = require('@mastra/core/mastra');
const { Agent } = require('@mastra/core/agent');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadCapabilityModule, IDENTITY } = require('./agent-capabilities.cjs');
let connectionString = process.env.CF_TEST_PG_URL || 'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(connectionString).hostname)) {
  throw new Error('R4 probes require a local disposable PostgreSQL target');
}
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

const identity = { ...IDENTITY, language: 'ru', timeZone: 'UTC' };
const usage = { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 5, text: 5 } };
const threadOf = (mode) => `r4-${mode}`;
const makeContext = (threadId, runId) => {
  const context = loadCapabilityModule('../conductor/conductor.context.ts').buildConductorContext({ identity, threadId });
  context.set('mastra__durableExecutions', { [runId]: {} });
  return context;
};
function capability(store, schemaName, mode, onRun) {
  return {
    id: 'piece.create', group: 'content', risk: 'write', door: {},
    label: { ru: 'Создать', en: 'Create' }, description: 'Disposable transactional domain write',
    input: z.object({ title: z.string() }), untrusted: [],
    run: async () => {
      if (mode === 'before-domain') await onRun(mode);
      await store.db.none(`INSERT INTO "${schemaName}".operation_audit(mode) VALUES ($1)`, [mode]);
      if (mode === 'after-domain') await onRun(mode);
      return { id: `piece-${mode}` };
    },
    summarize: (result) => ({ pieceId: result.id }),
  };
}
const buildTools = (cap) => loadCapabilityModule('mastra.adapter.ts').buildMastraCapabilityTools([cap], {
  services: () => ({}), language: 'ru',
});
async function child(schemaName, mode) {
  const storage = new PostgresStore({ id: `r4-child-${mode}`, connectionString, schemaName });
  await storage.init();
  const memory = new Memory({ storage, options: { generateTitle: false, semanticRecall: false } });
  let native;
  const barrier = async (stage) => {
    process.send({ stage, native });
    await new Promise(() => {});
  };
  const state = await storage.getStore('threadState');
  const save = state.setState.bind(state);
  state.setState = async (args) => {
    if (mode === 'receipt-failure' && args.value?.state !== 'pending') throw new Error('injected receipt and run-guard outage');
    await save(args);
    if (mode === 'after-receipt' && args.value?.state === 'committed') await barrier(mode);
  };
  const workflows = await storage.getStore('workflows');
  const claim = workflows.claimRunOwnership.bind(workflows);
  workflows.claimRunOwnership = async (args) => {
    const result = await claim(args);
    if (mode === 'after-claim' && args.runId.startsWith('assistant-operation:')) await barrier(mode);
    return result;
  };
  const tools = buildTools(capability(storage, schemaName, mode, barrier));
  const execute = tools.piece_create.execute.bind(tools.piece_create);
  tools.piece_create.execute = async (input, context) => {
    native = {
      runId: context.runId, threadId: context.agent?.threadId, toolCallId: context.agent?.toolCallId,
      nativeStorage: !!context.mastra?.getStorage(), nativeMemory: !!context.memory?.storage,
      durableExecutions: Object.keys(context.requestContext?.get('mastra__durableExecutions') || {}).length,
    };
    const result = await execute(input, context);
    if (mode === 'receipt-failure') {
      assert.equal(result?.code, 'CAPABILITY_OUTCOME_UNCERTAIN');
      await barrier(mode);
    }
    return result;
  };
  const model = new MockLanguageModelV3({ doStream: async () => ({
    stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      { type: 'response-metadata', id: 'r4-model', modelId: 'mock', timestamp: new Date(0) },
      { type: 'tool-call', toolCallId: `call-${mode}`, toolName: 'piece_create', input: JSON.stringify({ title: mode }) },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
    ]),
  }) });
  const agent = new Agent({ id: 'r4-probe', name: 'R4 probe', instructions: 'Run the supplied test tool.',
    durable: { cleanupTimeoutMs: 250 }, model, tools, memory });
  const mastra = new Mastra({ storage, agents: { 'r4-probe': agent }, recovery: { durableAgents: 'auto' } });
  const out = await mastra.getAgentById('r4-probe').stream('Execute', {
    runId: `run-${mode}`, memory: { thread: threadOf(mode), resource: `${identity.organizationId}:${identity.userId}` },
    requestContext: makeContext(threadOf(mode), `run-${mode}`), maxSteps: 2,
  });
  const reader = out.fullStream.getReader();
  while (!(await reader.read()).done) { /* the parent kills this process at the selected boundary */ }
  throw new Error(`Crash barrier was not reached: ${mode}`);
}
async function killAtBarrier(schemaName, mode) {
  const worker = spawn(process.execPath, [__filename, '--child', schemaName, mode], {
    env: { ...process.env, CF_TEST_PG_URL: connectionString }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '', native;
  worker.stderr.on('data', (part) => { stderr += String(part); });
  const timeout = setTimeout(() => worker.kill('SIGKILL'), 20_000);
  worker.on('message', (message) => {
    if (message.stage === mode) { native = message.native; worker.kill('SIGKILL'); }
  });
  try {
    const stopped = await new Promise((resolve, reject) => {
      worker.on('error', reject);
      worker.on('close', (code, signal) => resolve({ code, signal }));
    });
    assert.equal(stopped.signal, 'SIGKILL', stderr);
    assert.ok(native, `native execution did not reach ${mode}: ${stderr}`);
    assert.equal(native.nativeStorage, true);
    assert.ok(native.durableExecutions > 0);
    return native;
  } finally { clearTimeout(timeout); }
}
async function main() {
  if (process.argv[2] === '--child') return child(process.argv[3], process.argv[4]);
  const pg = await acquireTestPostgres();
  connectionString = pg.url;
  const schemaName = `cf_r4_${process.pid}_${Date.now()}`;
  const storage = new PostgresStore({ id: schemaName, connectionString, schemaName });
  await storage.init();
  await storage.db.none(`CREATE TABLE "${schemaName}".operation_audit (id SERIAL PRIMARY KEY, mode TEXT NOT NULL)`);
  const report = {};
  try {
    for (const mode of ['after-claim', 'before-domain', 'after-domain', 'after-receipt', 'receipt-failure']) {
      const native = await killAtBarrier(schemaName, mode);
      // A fresh adapter, memory, composite, and DB pool models the restarted service.
      const fresh = new PostgresStore({ id: `r4-restart-${mode}`, connectionString, schemaName });
      await fresh.init();
      try {
        const memory = new Memory({ storage: fresh, options: { generateTitle: false, semanticRecall: false } });
        const mastra = new Mastra({ storage: fresh });
        const scope = { organizationId: identity.organizationId, runId: native.runId, threadId: native.threadId,
          toolName: 'piece_create', toolCallId: native.toolCallId };
        const type = loadCapabilityModule('../conductor/agent-operation-receipts.ts').agentOperationStateType(scope);
        const workflows = await fresh.getStore('workflows');
        const owner = await workflows.getRunOwnership({ runId: type });
        assert.ok(owner);
        await workflows.releaseRunOwnership(owner);
        // Releasing an operation lease must not turn its identity into permission to rerun.
        const unclaimed = await workflows.claimRunOwnership({ runId: type, ownerId: 'second-driver', leaseMs: 10, expectedGeneration: 0 });
        assert.equal(unclaimed.acquired, false);
        let alternateBlockedWithoutGuard = false;
        if (mode === 'receipt-failure') {
          const receipts = loadCapabilityModule('../conductor/agent-operation-receipts.ts');
          assert.equal(await receipts.readAgentOperationRunGuard({ ...scope, storage: fresh }), null);
          // Even retention of the released operation lease cannot erase the
          // independent pre-effect witness and pending native state.
          await new Promise((resolve) => setTimeout(resolve, 5));
          await workflows.prune({ runOwnership: { maxAge: 1 } });
          assert.equal(await workflows.getRunOwnership({ runId: type }), null);
          const alternative = await buildTools(capability(fresh, schemaName, mode, async () => {})).piece_create.execute({ title: mode }, {
            runId: native.runId, memory, mastra, requestContext: makeContext(native.threadId, native.runId),
            agent: { threadId: native.threadId, toolCallId: 'new-id-before-guard-was-restored' },
          });
          assert.equal(alternative?.code, 'CAPABILITY_OUTCOME_UNCERTAIN');
          alternateBlockedWithoutGuard = true;
        }
        const before = await fresh.db.one(`SELECT count(*)::int AS count FROM "${schemaName}".operation_audit WHERE mode = $1`, [mode]);
        const result = await buildTools(capability(fresh, schemaName, mode, async () => {})).piece_create.execute({ title: mode }, {
          runId: native.runId, memory, mastra, requestContext: makeContext(native.threadId, native.runId),
          agent: { threadId: native.threadId, toolCallId: native.toolCallId },
        });
        const after = await fresh.db.one(`SELECT count(*)::int AS count FROM "${schemaName}".operation_audit WHERE mode = $1`, [mode]);
        assert.equal(after.count, before.count);
        const expected = mode === 'after-claim' || mode === 'before-domain' ? 0 : 1;
        assert.equal(after.count, expected);
        if (mode === 'after-receipt') {
          assert.partialDeepStrictEqual(result, { ok: true, summary: { pieceId: 'piece-after-receipt' } });
        } else assert.equal(result?.code, 'CAPABILITY_OUTCOME_UNCERTAIN');
        if (['before-domain', 'after-domain', 'receipt-failure'].includes(mode)) {
          const alternative = await buildTools(capability(fresh, schemaName, mode, async () => {})).piece_create.execute({ title: mode }, {
            runId: native.runId, memory, mastra, requestContext: makeContext(native.threadId, native.runId),
            agent: { threadId: native.threadId, toolCallId: 'alternative-after-restart' },
          });
          assert.equal(alternative?.code, 'CAPABILITY_OUTCOME_UNCERTAIN');
        }
        let recovered = false;
        if (mode === 'after-domain' || mode === 'after-receipt') {
          const calls = [];
          const tools = buildTools(capability(fresh, schemaName, mode, async () => {}));
          const execute = tools.piece_create.execute.bind(tools.piece_create);
          tools.piece_create.execute = async (input, context) => {
            calls.push(context.agent?.toolCallId);
            return execute(input, context);
          };
          const model = new MockLanguageModelV3({ doStream: async () => ({ stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'response-metadata', id: 'r4-recovered', modelId: 'mock', timestamp: new Date(0) },
            { type: 'text-start', id: 'recovered-text' },
            { type: 'text-delta', id: 'recovered-text', delta: 'Outcome checked.' },
            { type: 'text-end', id: 'recovered-text' },
            { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
          ]) }) });
          const agent = new Agent({ id: 'r4-probe', name: 'R4 probe', instructions: 'Check the outcome.',
            durable: { cleanupTimeoutMs: 250 }, model, tools, memory });
          const restarted = new Mastra({ storage: fresh, agents: { 'r4-probe': agent }, recovery: { durableAgents: 'auto' } });
          // The public bulk recovery API delegates to recover() and waits for
          // workflow settlement, including the final receipt and lease writes.
          const parentOwner = await workflows.getRunOwnership({ runId: native.runId });
          assert.ok(parentOwner);
          // SIGKILL has proved this owner is dead. Releasing only its owned
          // local test lease lets the public bulk API recover immediately.
          await workflows.releaseRunOwnership(parentOwner);
          const recovery = await restarted.getAgentById('r4-probe').recoverActiveRuns({ runId: native.runId });
          assert.equal(recovery.succeeded, 1);
          assert.equal(recovery.failed, 0);
          assert.deepEqual(calls, [native.toolCallId]);
          const afterRecovery = await fresh.db.one(`SELECT count(*)::int AS count FROM "${schemaName}".operation_audit WHERE mode = $1`, [mode]);
          assert.equal(afterRecovery.count, 1);
          recovered = true;
          await restarted.shutdown();
        }
        report[mode] = { signal: 'SIGKILL', nativeStorage: native.nativeStorage, domainWrites: after.count,
          recovered, alternateBlockedWithoutGuard, result };
      } finally { await fresh.close(); }
    }
    console.log(JSON.stringify(report));
  } finally {
    await storage.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
    await storage.close();
    await pg.cleanup();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
