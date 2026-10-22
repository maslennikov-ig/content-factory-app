'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadCapabilityModule, requestContextFor } = require('./helpers/agent-capabilities.cjs');
const root = 'libraries/nestjs-libraries/src/chat/conductor/';
const task = loadTypeScriptModule(`${root}conductor.model-task.ts`);
const { streamNativeSession } = loadTypeScriptModule(`${root}native-session-stream.ts`, {
  '@mastra/ai-sdk': {
    toAISdkStream: () => new ReadableStream({ start(controller) { controller.close(); } }),
  },
  '@mastra/core/agent/durable': { AGENT_STREAM_TOPIC: id => id },
  './native-run-observer': {
    observeConductorRun: async () => ({ output: {}, detach() {} }),
  },
});

const context = () => {
  const values = new Map();
  return { get: key => values.get(key), set: (key, value) => values.set(key, value) };
};

test('the actual current task is redacted before Session preflight, refreshed for the next turn and isolated per context', async () => {
  const requestContext = context();
  const other = context();
  task.seedConductorModelTask(other, 'Another person’s task');
  const seen = [];
  const session = {
    sendSignal(_signal, options) {
      // Native Session resolves its dynamic agent before the input processors.
      seen.push(task.readConductorModelTask(options.requestContext));
      return { accepted: Promise.resolve({ runId: 'native-run', action: 'wake' }) };
    },
    subscribe: () => () => {},
  };
  const submit = async text => {
    const stream = await streamNativeSession({
      session, agent: {}, threadId: 'thread', resourceId: 'owner', requestContext,
      message: { id: 'message', parts: [{ type: 'text', text }] },
      onRunId: async () => {}, onError: () => 'error',
    });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {}
  };
  await submit('Разбери противоречивые данные. Ключ sk-or-v1-0123456789abcdefghijklmnop');
  await submit('Спасибо');
  expect(seen).toEqual(['Разбери противоречивые данные. Ключ', 'Спасибо']);
  expect(task.readConductorModelTask(other)).toBe('Another person’s task');
});

test('a missing task in an old checkpoint abstains; a textless new turn clears stale routing input', () => {
  const requestContext = context();
  expect(task.readConductorModelTask(requestContext)).toBeUndefined();
  task.seedConductorModelTask(requestContext, 'Previous task');
  task.seedConductorModelTask(requestContext, undefined);
  expect(task.readConductorModelTask(requestContext)).toBeUndefined();
});

test('goal review receives authenticated task context without replacing the parent fallback chain', async () => {
  const autonomy = loadCapabilityModule('../conductor/conductor.autonomy.ts');
  const requestContext = requestContextFor(loadCapabilityModule('capability.context.ts'));
  requestContext.set('mastra__resourceId', 'org-1:user-1');
  requestContext.set('mastra__threadId', 'thread');
  requestContext.set('cf.nativeTextModels', ['base', 'fallback']);
  task.seedConductorModelTask(requestContext, 'Compare the evidence.');
  let judgeContext;
  const config = autonomy.buildConductorGoalConfig({
    capabilities: [], services: () => {}, gate: { check: async () => ({ allowed: true }) },
    judgeModel: async (_identity, context) => {
      judgeContext = context;
      context.set('cf.nativeTextModels', ['review-selected']);
      return { modelId: 'review-selected' };
    },
  });
  await config.judge({ requestContext });
  expect(judgeContext).not.toBe(requestContext);
  expect(task.readConductorModelTask(judgeContext)).toBe('Compare the evidence.');
  expect(requestContext.get('cf.nativeTextModels')).toEqual(['base', 'fallback']);
});
