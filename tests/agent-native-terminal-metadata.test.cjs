'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { mocks } = require('./helpers/agent-native-session-http.probe.cjs');
const { AgentThreadsService } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts', {
  ...mocks, '@mastra/core/agent/durable': { isDurableAgent: agent => agent.native === true },
});

const identity = { organizationId: 'terminal-org', userId: 'terminal-user' };
const resourceId = 'terminal-org:terminal-user';
async function fixture({ change, pointer = true, atomic = true } = {}) {
  let row = { id: 'terminal-thread', resourceId, metadata: { retained: 'owner history',
    ...(pointer ? { assistantNativeRun: { runId: 'run-one', logicalRequestId: 'request-one', state: 'running', response: {runId: 'run-one', messageId: 'saved-tail'} } } : {}) } };
  let beforeAtomic, atomicCalls = 0, ordinaryWrites = 0;
  const memory = {
    getThreadById: async () => structuredClone(row),
    updateThread: async input => { ordinaryWrites++; row.metadata = {...row.metadata, ...input.metadata}; return structuredClone(row); },
  };
  const store = atomic ? { updateThreadMetadata: async input => {
    atomicCalls++;
    change?.(row);
    beforeAtomic = structuredClone(row);
    const patch = input.update(structuredClone(row));
    if (patch) row.metadata = {...row.metadata, ...patch};
    return structuredClone(row);
  } } : {};
  const threads = new AgentThreadsService({ conductor: async () => ({native: true, getMemory: async () => memory}),
    mastra: async () => ({getStorage: () => ({getStore: async () => store})}) }, {get: async () => null, set: async () => 'OK'});
  const release = jest.fn(async () => {});
  const turn = await threads.startTurn(identity, row.id, 'request-one', release);
  return {turn, release, row: () => row, beforeAtomic: () => beforeAtomic, atomicCalls: () => atomicCalls, ordinaryWrites: () => ordinaryWrites};
}

test('native terminal merge preserves concurrent Stop and its saved response while retaining the completed outcome', async () => {
  const f = await fixture({ change: row => {
    row.metadata.assistantExecution.stopRequested = true;
    row.metadata.assistantNativeRun.state = 'stopped';
    row.metadata.concurrent = 'current';
  } });
  await expect(f.turn.finish('completed')).resolves.toBe('completed');
  expect(f.row().metadata).toMatchObject({retained: 'owner history', concurrent: 'current',
    assistantExecution: {requestId: 'request-one', state: 'settled', outcome: 'completed', stopRequested: true},
    assistantNativeRun: {runId: 'run-one', logicalRequestId: 'request-one', state: 'stopped', response: {messageId: 'saved-tail'}}});
  expect(f.atomicCalls()).toBe(1); expect(f.ordinaryWrites()).toBe(1); expect(f.release).toHaveBeenCalledTimes(1);
});

test.each(['request', 'run', 'logical-request', 'resource', 'thread'])('native terminal merge refuses a changed %s and preserves its metadata', async kind => {
  const f = await fixture({ change: row => {
    if (kind === 'request') row.metadata.assistantExecution.requestId = 'new-request';
    if (kind === 'run') row.metadata.assistantNativeRun.runId = 'new-run';
    if (kind === 'logical-request') row.metadata.assistantNativeRun.logicalRequestId = 'new-request';
    if (kind === 'resource') row.resourceId = 'foreign-org:foreign-user';
    if (kind === 'thread') row.id = 'another-thread';
    row.metadata.concurrent = 'must remain';
  } });
  await expect(f.turn.finish('completed')).rejects.toThrow('Native task changed');
  expect(f.row()).toEqual(f.beforeAtomic());
});

test('an unstarted native task can settle failed without inventing a native run', async () => {
  const f = await fixture({pointer: false});
  await expect(f.turn.finish('failed')).resolves.toBe('failed');
  expect(f.row().metadata.assistantExecution).toEqual({requestId: 'request-one', state: 'settled', outcome: 'failed'});
  expect(f.row().metadata).not.toHaveProperty('assistantNativeRun');
});

test('native terminal persistence requires atomic storage instead of falling back to an ordinary write', async () => {
  const f = await fixture({atomic: false});
  await expect(f.turn.finish('completed')).rejects.toThrow('Native task settlement storage is unavailable');
  expect(f.row().metadata.assistantExecution.state).toBe('running');
  expect(f.ordinaryWrites()).toBe(1);
});
