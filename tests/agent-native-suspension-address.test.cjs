'use strict';
const {loadWithMocks} = require('./helpers/load-ts-with-mocks.cjs');
const {streamNativeSession} = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-session-stream.ts', {
  '@mastra/ai-sdk': {toAISdkStream: () => {throw new Error('No response may start before suspension validation');}},
  '@mastra/core/agent/durable': {AGENT_STREAM_TOPIC: runId => runId},
  './native-run-observer': {},
  './conductor.model-task': {},
});

test.each(['foreign-resource', 'approval'])('a missing native mirror cannot acknowledge a %s suspension', async kind => {
  const register = jest.fn();
  const acknowledge = jest.fn();
  const resume = jest.fn();
  const session = {suspensions: {has: () => false, register}, resumeToolCall: resume};
  const agent = {listSuspendedRuns: async () => ({total: 1, runs: [{
    runId: 'owned-run', threadId: 'owned-thread', resourceId: kind === 'foreign-resource' ? 'foreign-resource' : 'owned-resource',
    toolCalls: [{toolCallId: 'owned-call', toolName: 'piece_adapt', requiresApproval: kind === 'approval'}],
  }]})};
  await expect(streamNativeSession({session, agent, threadId: 'owned-thread', resourceId: 'owned-resource', requestContext: {},
    resume: {runId: 'owned-run', toolCallId: 'owned-call', resumeData: {decideForPerson: true}},
    onRunId: acknowledge, onError: () => 'AGENT_RUN_NOT_PENDING',
  })).rejects.toMatchObject({code: 'AGENT_RUN_NOT_PENDING'});
  expect(register).not.toHaveBeenCalled();
  expect(resume).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
});
