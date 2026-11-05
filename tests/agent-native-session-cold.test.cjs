'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('actual native Session HTTP answers survive SIGKILL with PostgreSQL/Redis and the old app lease still held', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-cold.probe.cjs')], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 75_000 });
  const report = JSON.parse(output.trim().split('\n').at(-1));
  expect(report).toEqual([
    { kind: 'approval', oldLeasePresent: true, resumedWithoutWaiting: true, domainCalls: 1, settled: true, terminalDiagnostic: true },
    { kind: 'question', oldLeasePresent: true, resumedWithoutWaiting: true, domainCalls: 1, settled: true, terminalDiagnostic: true },
  ]);
}, 80_000);

test('a throwing HTTP outcome logger preserves the committed cold turn, admission finish and SSE end', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'agent-native-session-cold.probe.cjs'), '--throw-http-logger'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 45_000 });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual([
    { kind: 'approval', oldLeasePresent: true, resumedWithoutWaiting: true, domainCalls: 1, settled: true,
      terminalDiagnostic: true, httpLogFailureIsolated: true, admissionFinishedOnce: true, streamEnded: true },
  ]);
}, 50_000);

const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');
const { MastraService } = loadCapabilityModule('../mastra.service.ts', { mocks: {
  '@contentfactory/nestjs-libraries/chat/mastra.store': { pStore: {}, closeMastraStore: async () => {} },
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: undefined },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {},
} });

function reconciliation({ stopped = false, failWrite = false, failLog = false } = {}) {
  const marker = { requestId: 'owned-request', state: 'running', ...(stopped ? { stopRequested: true } : {}) };
  const pointer = { runId: 'owned-run', logicalRequestId: 'owned-request', state: 'running',
    continuationIdentity: { secret: 'PRIVATE_CONTEXT_CANARY' }, response: { text: 'PRIVATE_RESPONSE_CANARY' } };
  const updateThread = jest.fn(async () => { if (failWrite) throw Error('PRIVATE_STORAGE_ERROR_CANARY'); });
  const info = jest.fn(() => { if (failLog) throw Error('PRIVATE_LOG_ERROR_CANARY'); });
  const service = { conductor: async () => ({ getMemory: () => ({
    getThreadById: async () => ({ metadata: { assistantExecution: marker, assistantNativeRun: pointer } }), updateThread,
  }) }), instance: { getLogger: () => ({ info }) } };
  return { run: (outcome, runId = 'owned-run') => MastraService.prototype.reconcileNativeRun.call(service, 'owned-thread', runId, outcome), updateThread, info };
}

test.each(['completed', 'failed', 'waiting'])('native reconciliation identifies its successful %s write without private context', async outcome => {
  const f = reconciliation();
  await f.run(outcome);
  expect(f.updateThread).toHaveBeenCalledTimes(1);
  expect(f.info).toHaveBeenCalledWith('agent_native_execution_outcome', {
    origin: 'native-reconcile', threadId: 'owned-thread', runId: 'owned-run', requestId: 'owned-request',
    requestedOutcome: outcome, effectiveOutcome: outcome, stopRequested: false,
  });
  expect(JSON.stringify(f.info.mock.calls)).not.toContain('PRIVATE_');
});

test('native reconciliation preserves the explicit Stop outcome and refuses a foreign run without logging a write', async () => {
  const f = reconciliation({ stopped: true });
  await f.run('completed', 'foreign-run');
  expect(f.updateThread).not.toHaveBeenCalled();
  expect(f.info).not.toHaveBeenCalled();
  await f.run('completed');
  expect(f.updateThread.mock.calls[0][0].metadata.assistantExecution.outcome).toBe('interrupted');
  expect(f.info.mock.calls[0][1]).toMatchObject({ requestedOutcome: 'completed', effectiveOutcome: 'interrupted', stopRequested: true });
});

test('diagnostics do not report an uncommitted write or turn a logging error into execution failure', async () => {
  const refused = reconciliation({ failWrite: true });
  await expect(refused.run('completed')).rejects.toThrow('PRIVATE_STORAGE_ERROR_CANARY');
  expect(refused.info).not.toHaveBeenCalled();
  const loggerFailure = reconciliation({ failLog: true });
  await expect(loggerFailure.run('completed')).resolves.toBeUndefined();
  expect(loggerFailure.updateThread).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(loggerFailure.info.mock.calls)).not.toContain('PRIVATE_');
});
