'use strict';
const assert = require('node:assert/strict');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const { providerModel, providerRequests, Response, AgentThreadsService, mocks } = require('./agent-native-session-http.probe.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

(async () => {
  const model = await providerModel(['tool', 'skill', { name: 'content' }]);
  const runtime = await createRuntime({ modelFactory: () => model });
  runtime.mastra.addGateway({ id: 'v2-fixture', name: 'Synthetic V2 provider',
    handlesModel: id => id.includes('synthetic-v2'),
    fetchProviders: async () => ({ openai: { name: 'Synthetic OpenAI V2', gateway: 'v2-fixture', apiKeyEnvVar: [], models: ['synthetic-v2'] } }),
    buildUrl: () => undefined, getApiKey: async () => 'synthetic-v2', resolveLanguageModel: () => model,
  });
  let execution;
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': { ...runtime.executionModule, createConductorExecution: options => {
      execution = runtime.executionModule.createConductorExecution(options); return execution;
    } },
  });
  const threads = new AgentThreadsService(runtime.service, runtime.redis);
  const events = [];
  runtime.controller.onSessionCreated(session => session.subscribe(event => events.push({ type: event.type, result: event.result, finishReason: event.finishReason, ...(event.error ? { error: String(event.error.stack || event.error) } : {}) })));
  const handler = new AgentController(runtime.service, threads, { beginAiOperation: async () => ({ run: work => work(), finish: async () => undefined }) });
  const threadId = `${runtime.schemaName}-v2`;
  const response = new Response();
  let deadlineTimer;
  try {
    await Promise.race([
      handler.chat({ id: IDENTITY.organizationId, createdAt: IDENTITY.organizationCreatedAt, users: [{ role: 'EDITOR' }] },
        { id: IDENTITY.userId, language: 'ru' }, { threadId, messages: [{ id: 'human-v2', role: 'user', parts: [{ type: 'text', text: 'Read the content skill.' }] }] }, response),
      new Promise((_resolve, reject) => { deadlineTimer = setTimeout(async () => {
        const session = await runtime.service.sessionFor(IDENTITY, threadId, { bindThread: true });
        reject(new Error(JSON.stringify({ events, native: { running: session.run.isRunning(), active: session.stream.isActive() }, parts: response.parts() })));
      }, 8_000); deadlineTimer.unref(); }),
    ]);
    assert.equal(response.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Нативная задача завершена.', JSON.stringify({ execution: execution?.snapshot(), requests: providerRequests.get(model)?.length, events, parts: response.parts() }));
    assert.equal(response.parts().some(part => part.type === 'data-native-input-wait'), false);
    assert.ok(events.some(event => event.type === 'tool_end' && typeof event.result === 'string' && event.result.includes('A «заготовка» is the core text')),
      'Verify native skill instructions actually executed, rather than a hidden tool-not-found output.');
    assert.equal(providerRequests.get(model).length, 2);
    assert.equal((await runtime.agent.listSuspendedRuns({ threadId, resourceId: `${IDENTITY.organizationId}:${IDENTITY.userId}` })).runs.length, 0);
    console.log(JSON.stringify({ providerV2: true, postgres: true, redis: true, actualService: true, executionScopeAligned: true,
      allowedSkillCompleted: true, assistantFinalText: true, noPending: true, requests: 2 }));
  } finally { clearTimeout(deadlineTimer); await runtime.close({ drop: true }); }
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
