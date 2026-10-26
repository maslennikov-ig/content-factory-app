'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

test('the same native tool approval can become a question after the approval wait was already delivered', async () => {
  let source, listener, approved = false, suspended = false;
  const ui = new ReadableStream({ start(controller) { source = controller; } });
  const { streamNativeSession } = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-session-stream.ts', {
    '@mastra/ai-sdk': { toAISdkStream: output => output },
    './native-run-observer': { observeConductorRun: async () => ({ output: ui, detach() {} }) },
    './conductor.model-task': { seedConductorModelTask() {} },
  });
  const stream = await streamNativeSession({
    session: {
      sendSignal: () => ({ accepted: Promise.resolve({ runId: 'run', action: 'start' }) }),
      subscribe: fn => { listener = fn; return () => {}; },
      approval: { isArmed: () => !approved },
      suspensions: { has: () => suspended },
    }, agent: {}, threadId: 'thread', resourceId: 'resource', requestContext: { get() {} },
    message: { id: 'user-message', parts: [{ type: 'text', text: 'Ask for the missing choice.' }] },
    onRunId: async () => {}, onError: () => 'ERROR',
  });
  const reader = stream.getReader();
  source.enqueue({ type: 'data-tool-call-approval', data: { runId: 'run', toolCallId: 'call' } });
  expect((await reader.read()).value.type).toBe('data-tool-call-approval');
  expect((await reader.read()).value.type).toBe('data-native-input-wait');
  approved = true; suspended = true;
  // Native Session has already persisted the question. The durable replay is
  // still parked behind its earlier approval segment: no new card chunk yet.
  listener({ type: 'tool_suspended', threadId: 'thread', resourceId: 'resource', runId: 'run', toolCallId: 'call' });
  listener({ type: 'tool_suspended', threadId: 'thread', resourceId: 'resource', runId: 'run', toolCallId: 'call' });
  source.enqueue({ type: 'sentinel' });
  expect((await reader.read()).value).toMatchObject({ type: 'data-native-input-wait', data: { runId: 'run', toolCallId: 'call' } });
  expect((await reader.read()).value.type).toBe('sentinel');
  await reader.cancel();
});
