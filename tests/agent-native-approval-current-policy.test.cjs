'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

let source;
const { streamNativeSession } = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-session-stream.ts', {
  '@mastra/ai-sdk': { toAISdkStream: output => output },
  '@mastra/core/agent/durable': { AGENT_STREAM_TOPIC: runId => runId },
  './native-run-observer': { observeConductorRun: async () => ({ output: new ReadableStream({ start(controller) { source = controller; } }), detach() {} }) },
  './conductor.model-task': {},
});

const address = { threadId: 'thread', resourceId: 'org:user', runId: 'run' };
const run = async ({ armed, policy, savedAddress = address, approved = true }) => {
  const session = {
    approval: { isArmed: () => armed },
    resolveToolApproval: jest.fn(() => policy),
    respondToToolApproval: jest.fn(async () => {}),
    respondToPersistedToolApproval: jest.fn(async () => {}),
    subscribe: () => () => {},
  };
  const acknowledge = jest.fn(async () => {});
  const agent = {
    listSuspendedRuns: async () => ({ total: 1, runs: [{ ...savedAddress,
      toolCalls: [{ toolCallId: 'call', toolName: 'some_tool', requiresApproval: true }] }] }),
    pubsub: { getHistory: async () => [] },
  };
  const start = () => streamNativeSession({ session, agent, ...address, requestContext: new Map(),
    approvals: { runId: address.runId, answers: [{ toolCallId: 'call', approved }] },
    onRunId: acknowledge, onError: () => 'ERROR' });
  return { session, acknowledge, start };
};

test.each([true, false])('a current deny overrides stale approval for armed=%s', async armed => {
  const f = await run({ armed, policy: 'deny' });
  const stream = await f.start();
  await new Promise(resolve => setImmediate(resolve));
  const response = armed ? f.session.respondToToolApproval : f.session.respondToPersistedToolApproval;
  expect(response).toHaveBeenCalledTimes(1);
  expect(response.mock.calls[0][0]).toMatchObject(armed ? { decision: 'decline' } : { approved: false });
  source.close();
  await stream.cancel();
});

test.each([true, false])('an allowed approval follows its owned native path for armed=%s', async armed => {
  const f = await run({ armed, policy: 'allow' });
  const stream = await f.start();
  await new Promise(resolve => setImmediate(resolve));
  const response = armed ? f.session.respondToToolApproval : f.session.respondToPersistedToolApproval;
  expect(response.mock.calls[0][0]).toMatchObject(armed ? { decision: 'approve' } : { approved: true });
  source.close();
  await stream.cancel();
});

test('a deny installed after snapshot validation still wins at dispatch', async () => {
  const f = await run({ armed: true, policy: 'allow' });
  f.acknowledge.mockImplementation(async () => f.session.resolveToolApproval.mockReturnValue('deny'));
  const stream = await f.start();
  await new Promise(resolve => setImmediate(resolve));
  expect(f.session.respondToToolApproval.mock.calls[0][0]).toMatchObject({ decision: 'decline' });
  source.close();
  await stream.cancel();
});

test('a foreign saved run is refused before acknowledging an approval', async () => {
  const f = await run({ armed: false, policy: 'allow', savedAddress: { ...address, resourceId: 'other:user' } });
  await expect(f.start()).rejects.toMatchObject({ code: 'AGENT_RUN_NOT_PENDING' });
  expect(f.acknowledge).not.toHaveBeenCalled();
  expect(f.session.respondToPersistedToolApproval).not.toHaveBeenCalled();
});
