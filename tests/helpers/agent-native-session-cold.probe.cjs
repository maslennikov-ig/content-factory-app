'use strict';

const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { Response, HttpController, AgentThreadsService, until } = require('./agent-native-session-http.probe.cjs');
const ORG = { id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };

async function child(phase, kind, schemaName, auditPath, loggerMode) {
  const runtime = await createRuntime({ schemaName, auditPath, mode: kind, fixtureMode: kind });
  const threadId = `${schemaName}-${kind}`;
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  let admissions = 0;
  const admissionFinishes = [];
  const usage = { beginAiOperation: async () => { admissions++; return { run: work => work(), checkpoint: async () => true, finish: async completed => { admissionFinishes.push(completed); } }; } };
  const handler = new HttpController(runtime.service, threads, usage);
  const diagnostics = [];
  const throwHttpLogger = phase === 'resume' && loggerMode === 'throw-http-logger';
  handler.logger.log = raw => {
    const entry = JSON.parse(raw);
    if (entry.event === 'agent_task_execution') {
      diagnostics.push(entry);
      if (throwHttpLogger) throw new Error('HTTP_LOG_SINK_FAILURE_CANARY');
    }
  };
  if (phase === 'start') {
    const response = new Response();
    void handler.chat(ORG, USER, { threadId, messages: [{ id: 'cold-human', role: 'user', parts: [{ type: 'text', text: 'Ask before continuing.' }] }] }, response)
      .catch(error => { console.error(error); process.exit(1); });
    await until(() => response.writableEnded, 'native card before crash');
    assert.equal(response.parts().some(part => part.type === 'error'), false, 'Cold recovery must start from a valid human wait, not a broken billing fixture.');
    const history = await handler.getThread(ORG, USER, threadId);
    assert.ok(history.pending[0]);
    assert.equal(admissions, 1);
    process.send({ phase: 'ready', threadId, runId: history.pending[0].runId });
    return;
  }
  try {
    const before = await handler.getThread(ORG, USER, threadId);
    const pending = before.pending[0];
    assert.ok(pending, 'The real native suspension survives process death.');
    // The former app claim is deliberately still held in the shared Redis.
    const oldClaim = await runtime.redis.get(`agent-run-claim:thread:${IDENTITY.organizationId}:${IDENTITY.userId}:${threadId}`);
    assert.ok(oldClaim, 'Cold resume is tested while the former 600 second app lease is still present.');
    const answer = kind === 'approval'
      ? { threadId, messages: [{ id: 'cold-approval', role: 'assistant', parts: [{ type: 'tool-fixture_persist', toolCallId: pending.toolCallId,
        state: 'approval-responded', input: {}, approval: { id: `${pending.runId}::${pending.toolCallId}`, approved: true } }] }] }
      : { threadId, runId: pending.runId, toolCallId: pending.toolCallId, cardId: pending.suspendPayload?.cardId, resumeData: { answer: 'Proceed.' } };
    const response = new Response();
    await handler.chat(ORG, USER, answer, response);
    const after = await handler.getThread(ORG, USER, threadId);
    assert.equal(after.pending.length, 0);
    assert.equal(after.execution.state, 'settled');
    assert.equal(after.execution.outcome, 'completed');
    assert.deepEqual(admissionFinishes, [true], 'The committed task still finishes its admission exactly once.');
    assert.equal(response.writableEnded, true, 'The owning HTTP response closes after its terminal diagnostic.');
    assert.ok(response.chunks.join('').endsWith('data: [DONE]\n\n'), 'The final SSE terminator survives a failing log sink.');
    assert.equal(response.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Service native answer.');
    assert.equal(diagnostics.length, 1, 'Only the actual owning HTTP turn records its outcome.');
    const diagnostic = diagnostics[0];
    assert.equal(diagnostic.origin, 'http-owner');
    assert.equal(diagnostic.inputMode, kind === 'approval' ? 'approval' : 'resume');
    assert.equal(diagnostic.nativeRunId, pending.runId);
    assert.equal(diagnostic.requestId, after.execution.requestId);
    assert.equal(diagnostic.requestedOutcome, 'completed');
    assert.equal(diagnostic.settledOutcome, 'completed');
    assert.equal(diagnostic.failed, false);
    assert.equal(diagnostic.interrupted, false);
    assert.deepEqual(diagnostic.failureReasons, []);
    const serialised = JSON.stringify(diagnostic);
    for (const privateText of ['Ask before continuing.', 'Proceed.', 'Service native answer.', process.env.CF_TEST_PG_URL || 'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db']) {
      assert.equal(serialised.includes(privateText), false, 'No conversation text, result or connection URL enters the diagnostic.');
    }
    const events = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.filter(event => event.type === 'tool').length, 1);
    const result = { kind, oldLeasePresent: true, resumedWithoutWaiting: true, domainCalls: 1, settled: true, terminalDiagnostic: true,
      ...(throwHttpLogger ? { httpLogFailureIsolated: true, admissionFinishedOnce: true, streamEnded: true } : {}) };
    process.send({ phase: 'complete', result });
  } finally { await runtime.close({ drop: true }); }
  process.exit(0);
}

const spawnPhase = (phase, kind, schemaName, auditPath, loggerMode) => {
  const processChild = fork(__filename, ['child', phase, kind, schemaName, auditPath, loggerMode], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  processChild.stdout.on('data', chunk => { output += chunk; });
  processChild.stderr.on('data', chunk => { output += chunk; });
  let accepted;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { processChild.kill('SIGKILL'); reject(new Error(`Cold ${phase} timed out: ${output}`)); }, 30_000);
    processChild.on('message', message => {
      if (message.phase === 'ready' || message.phase === 'complete') {
        accepted = message;
        if (phase === 'start') { clearTimeout(timer); resolve(message); }
      }
    });
    processChild.once('exit', code => {
      clearTimeout(timer);
      if (phase === 'resume' && code === 0 && accepted) resolve(accepted);
      else if (!accepted) reject(new Error(`Cold ${phase} failed (${code}): ${output}`));
    });
  });
  return { processChild, result };
};

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-native-cold-'));
  const reports = [];
  const loggerMode = process.argv.includes('--throw-http-logger') ? 'throw-http-logger' : 'normal';
  try {
    for (const kind of loggerMode === 'throw-http-logger' ? ['approval'] : ['approval', 'question']) {
      const schemaName = `cf_native_cold_${process.pid}_${kind}`;
      const audit = path.join(directory, `${kind}.jsonl`);
      const start = spawnPhase('start', kind, schemaName, audit, loggerMode);
      await start.result;
      const exited = new Promise(resolve => start.processChild.once('exit', resolve));
      start.processChild.kill('SIGKILL');
      await exited;
      const resumed = spawnPhase('resume', kind, schemaName, audit, loggerMode);
      reports.push((await resumed.result).result);
    }
    console.log(JSON.stringify(reports));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[2] === 'child') child(...process.argv.slice(3)).catch(error => { console.error(error); process.exit(1); });
else main().catch(error => { console.error(error); process.exit(1); });
