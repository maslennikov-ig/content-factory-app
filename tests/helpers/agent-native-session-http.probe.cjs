'use strict';

// Real installed Mastra Session, durable Agent, controller, memory and HTTP
// handlers. Only the model and domain service are synthetic; no paid calls.
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { z } = require('zod');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { createDurableAgent } = require('@mastra/core/agent/durable');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

const fixture = path.join(__dirname, 'agent-conductor.probe.cjs');
const fixtureModule = new Module(fixture, module);
fixtureModule.filename = fixture;
fixtureModule.paths = Module._nodeModulePaths(__dirname);
const prefix = fs.readFileSync(fixture, 'utf8').split('(async () => {\n  const report')[0];
fixtureModule._compile(prefix + '\nmodule.exports = { scripted, IDENTITY };', fixture);
const { scripted, IDENTITY } = fixtureModule.exports;
const CONDUCTOR = 'libraries/nestjs-libraries/src/chat/conductor';
const lifecycle = loadTypeScriptModule(`${CONDUCTOR}/agent-turn-lifecycle.ts`);
const noOp = () => () => undefined;
const mocks = {
  './agent-turn-lifecycle': lifecycle,
  '../conductor/agent-turn-lifecycle': lifecycle,
  '@contentfactory/nestjs-libraries/chat/conductor/agent-turn-lifecycle': lifecycle,
  '@nestjs/swagger': { ApiTags: noOp },
  '@contentfactory/backend/services/auth/permissions/permissions.ability': { CheckPolicies: noOp },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class': { AuthorizationActions: { Create: 'create' }, Sections: { AI: 'ai' } },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
};
const conductor = loadCapabilityModule('../conductor/index.ts', { mocks: {
  './agent-turn-lifecycle': lifecycle, '../conductor/agent-turn-lifecycle': lifecycle,
} });
const { pieceRename } = loadCapabilityModule('catalogue/piece.capabilities.ts');
const { AgentThreadsService } = loadTypeScriptModule(`${CONDUCTOR}/agent-threads.service.ts`, mocks);
const { AgentController: HttpController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', mocks);
const { inProcessRunClaimStore } = loadTypeScriptModule(`${CONDUCTOR}/agent-run-claims.ts`);
const ORG = { id: IDENTITY.organizationId, createdAt: '2026-01-01T00:00:00Z', users: [{ role: 'EDITOR' }] };
const USER = { id: IDENTITY.userId, language: 'ru' };
const resourceId = conductor.conductorResourceId(ORG.id, USER.id);

class Response extends EventEmitter {
  headersSent = false; writableEnded = false; headers = {}; chunks = [];
  status() { return this; }
  setHeader(name, value) { this.headers[name] = value; }
  flushHeaders() { this.headersSent = true; }
  write(chunk) { this.chunks.push(chunk); return true; }
  end() { this.writableEnded = true; }
  parts() { return this.chunks.flatMap(chunk => chunk.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))); }
}
const until = async (predicate, name) => {
  const deadline = Date.now() + 8_000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${name}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

const providerRequests = new WeakMap();
async function providerModel(first) {
  const chain = require('./ai-text-chain.cjs');
  let requests = 0;
  const attemptsByModel = new Map();
  const calls = [];
  const config = { usageMode: 'workspace_key', provider: 'openrouter', apiKey: 'synthetic-v2-key', textModel: 'synthetic-v2', roleModels: {},
    search: { enabled: false, provider: 'tavily', apiKey: '', topic: 'general', depth: 'advanced' },
    textChain: { fallbackModel: '', fallbackModels: [], fallbackDisabled: true, flex: false, maxRetries: 0 } };
  const clients = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.clients.ts', {
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': { requireActiveAiConfig: async () => config, getActiveAiRole: () => 'agent' },
    '@contentfactory/nestjs-libraries/openai/ai.text-chain': { ...chain,
      createTextChainFetch: (source, _fetch, options) => chain.createTextChainFetch(source, async (_url, init) => {
        const requestNumber = requests++;
        const tool = requestNumber === 0;
        const request = JSON.parse(init.body);
        const modelAttempt = attemptsByModel.get(request.model) ?? 0;
        attemptsByModel.set(request.model, modelAttempt + 1);
        calls.push(request);
        if (first[0] === 'payment') {
          return new global.Response(JSON.stringify({ error: {
            code: 402, message: 'Provider balance or key limit is insufficient. private-payment-detail',
          } }), { status: 402, headers: { 'content-type': 'application/json' } });
        }
        if (first[0] === 'terminal-tripwire' && request.model === 'synthetic-terminal-primary' && modelAttempt === 0) {
          return new global.Response(JSON.stringify({ error: { code: 401, message: 'invalid_api_key' } }),
            { status: 401, headers: { 'content-type': 'application/json' } });
        }
        const model = request.model;
        const chunk = (delta, finish_reason = null) => ({ id: 'provider-v2-response', object: 'chat.completion.chunk', created: 1700000000, model,
          choices: [{ index: 0, delta, finish_reason }], ...(finish_reason ? { usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } } : {}) });
        const frames = tool ? [
          chunk({ role: 'assistant' }),
          chunk({ tool_calls: [{ index: 0, id: 'provider-v2-call', type: 'function', function: { name: first[1], arguments: '' } }] }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(first[2]) } }] }),
          chunk({}, 'tool_calls'),
        ] : [chunk({ role: 'assistant', content: 'Нативная задача завершена.' }), chunk({}, 'stop')];
        return new global.Response(new ReadableStream({ async start(controller) {
          for (const frame of frames) {
            await new Promise(resolve => setTimeout(resolve, 40));
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`));
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } }), { headers: { 'content-type': 'text/event-stream' } });
      }, options),
    },
  });
  const provider = await clients.getMastraAiSdkProvider('synthetic-v2-org');
  const modelIds = first[0] === 'terminal-tripwire'
    ? ['synthetic-terminal-primary', 'synthetic-terminal-backup'] : ['synthetic-v2'];
  const models = modelIds.map(modelId => provider.chat(modelId));
  for (const model of models) {
    assert.equal(model.specificationVersion, 'v2', 'Exercise the actual installed OpenAI provider V2 bridge.');
    providerRequests.set(model, calls);
  }
  return modelIds.length === 1 ? models[0] : models.map(model => ({ model, maxRetries: 0 }));
}

async function scenario(kind) {
  const mode = kind.startsWith('provider-') ? kind.slice('provider-'.length) : kind;
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  let writes = 0;
  const capability = {
    id: 'test.confirm', group: 'content', door: pieceRename.door, label: { ru: 'Изменить', en: 'Change' }, description: 'A confirmed domain change.',
    risk: 'confirm', input: z.object({ value: z.string() }), untrusted: [],
    describeApproval: async () => 'Изменить тестовую запись.',
    run: async () => { writes++; return { saved: true }; }, summarize: () => ({ saved: true }),
  };
  const first = mode === 'payment' ? ['payment'] : mode === 'terminal-tripwire' ? ['terminal-tripwire']
    : mode === 'skill' ? ['tool', 'skill', { name: 'content' }] : mode === 'approval'
    ? ['tool', 'test_confirm', { value: 'confirmed' }]
    : ['tool', 'ask_user', { question: 'Что выбрать?', options: [{ label: 'Первое' }, { label: 'Второе' }] }];
  const model = kind.startsWith('provider-') ? await providerModel(first) : scripted([[first], [['text', 'Нативная задача завершена.']]]).model;
  const agent = conductor.buildConductorAgent({ services: () => ({}), gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => model, memory, capabilities: [capability], snapshot: async () => ({}) });
  const durable = createDurableAgent({ agent, cleanupTimeoutMs: 1_000 });
  const nativeController = conductor.buildConductorController(durable, { storage, memory });
  const mastra = new Mastra({ storage, agents: { 'content-factory': durable }, agentControllers: { 'content-factory': nativeController } });
  await nativeController.init();
  const threadId = `native-http-${kind}`;
  await memory.createThread({ threadId, resourceId, title: 'Native HTTP' });
  const service = {
    mastra: async () => mastra, conductor: async () => durable,
    describeApproval: async () => 'Изменить тестовую запись.',
    sessionFor: async (_identity, id, options) => nativeController.createSession({ id: `${resourceId}:${id}`, ownerId: USER.id,
      resourceId, scope: id, threadId: id, createInitialThread: false, requestContext: options?.requestContext }),
  };
  let admissions = 0;
  const finished = [];
  const usage = { beginAiOperation: async () => { admissions++; return { run: work => work(), finish: async value => finished.push(value) }; } };
  const threads = new AgentThreadsService(service, inProcessRunClaimStore());
  const handler = new HttpController(service, threads, usage);
  const firstResponse = new Response();
  const firstTask = handler.chat(ORG, USER, { threadId, messages: [{ id: 'human-message', role: 'user', parts: [{ type: 'text', text: 'Выполни задачу.' }] }] }, firstResponse);
  if (mode === 'payment') {
    await firstTask;
    const saved = await handler.getThread(ORG, USER, threadId);
    const wire = firstResponse.parts();
    assert.deepEqual(wire.filter(part => part.type === 'error').map(part => part.errorText), ['AI_PROVIDER_PAYMENT_REQUIRED']);
    assert.equal(JSON.stringify(wire).includes('private-payment-detail'), false);
    assert.equal(saved.pending.length, 0);
    assert.equal(saved.execution.state, 'settled');
    assert.equal(saved.execution.outcome, 'failed');
    assert.equal(writes, 0);
    assert.equal(admissions, 1);
    assert.deepEqual(finished, [false]);
    assert.equal(providerRequests.get(model).length, 1, 'A terminal provider payment refusal must not retry or fall back.');
    await mastra.shutdown();
    return { kind, admissions, writes, errorCode: 'AI_PROVIDER_PAYMENT_REQUIRED', providerCalls: 1, outcome: 'failed', safeWire: true };
  }
  if (mode === 'terminal-tripwire') {
    await firstTask;
    const saved = await handler.getThread(ORG, USER, threadId);
    const parts = firstResponse.parts();
    const tripwires = parts.filter(part => part.type === 'data-tripwire');
    const finish = parts.find(part => part.type === 'finish');
    const text = parts.filter(part => part.type === 'text-delta').map(part => part.delta).join('');
    const modelCalls = (providerRequests.get(model[0].model) ?? [])
      .filter(call => ['synthetic-terminal-primary', 'synthetic-terminal-backup'].includes(call.model));
    assert.equal(saved.execution.state, 'settled');
    assert.equal(text, '', 'A terminal native tripwire must not persist an empty response as a successful answer.');
    assert.equal(finish?.finishReason, 'other');
    assert.equal(tripwires.some(part => part.data?.metadata?.terminalModelError === true), true,
      'A real native input-processor tripwire must carry the terminal model marker to the HTTP UI stream.');
    assert.equal(saved.execution.outcome, 'failed');
    assert.deepEqual(finished, [false]);
    assert.equal(modelCalls.some(call => call.model === 'synthetic-terminal-primary'), true);
    assert.equal(modelCalls.some(call => call.model === 'synthetic-terminal-backup'), false,
      'A terminal model error must stop before trying the backup model.');
    await mastra.shutdown();
    return { kind, outcome: saved.execution.outcome, finishReason: finish.finishReason,
      terminalMarker: tripwires.some(part => part.data?.metadata?.terminalModelError === true),
      textEmpty: text === '' };
  }
  if (mode === 'skill') {
    await firstTask;
    const saved = await handler.getThread(ORG, USER, threadId);
    assert.equal(saved.pending.length, 0, 'An allowed built-in must not park the native Session.');
    assert.equal(saved.execution.state, 'settled');
    assert.equal(firstResponse.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Нативная задача завершена.');
    assert.equal(firstResponse.parts().some(part => part.type === 'data-native-input-wait'), false);
    await mastra.shutdown();
    return { kind, admissions, writes, humanHistory: true, replay: true, answer: 'Нативная задача завершена.' };
  }
  let ownerSettled = false;
  void firstTask.then(() => { ownerSettled = true; });
  await until(() => firstResponse.writableEnded, `${kind} card and HTTP detach`);
  assert.equal(ownerSettled, false, 'The original task retains its admission while a native gate is parked.');
  assert.equal(admissions, 1);
  assert.deepEqual(finished, []);
  assert.equal(writes, 0);
  const history = await handler.getThread(ORG, USER, threadId);
  const pending = history.pending[0];
  assert.ok(pending, JSON.stringify(firstResponse.parts()));
  assert.ok(firstResponse.parts().some(part => part.type === 'data-native-input-wait'));
  const call = pending;
  const answer = mode === 'approval'
    ? { threadId, messages: [{ id: 'approval-answer', role: 'assistant', parts: [{ type: 'tool-test_confirm', toolCallId: call.toolCallId,
      state: 'approval-responded', input: { value: 'confirmed' }, approval: { id: `${pending.runId}::${call.toolCallId}`, approved: true } }] }] }
    : { threadId, runId: pending.runId, toolCallId: call.toolCallId, cardId: pending.suspendPayload?.cardId, resumeData: { answer: 'Первое' } };
  const secondResponse = new Response();
  await handler.chat(ORG, USER, answer, secondResponse);
  await firstTask;
  assert.equal(admissions, 1, 'A parked native response must not acquire another admission.');
  assert.deepEqual(finished, [true]);
  assert.equal(writes, mode === 'approval' ? 1 : 0);
  const final = await handler.getThread(ORG, USER, threadId);
  assert.equal(final.execution.state, 'settled');
  assert.ok(final.messages.some(message => message.id === 'human-message' && message.role === 'user'));
  const text = secondResponse.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join('');
  assert.equal(text, 'Нативная задача завершена.');
  const peer = new HttpController(service, new AgentThreadsService(service, inProcessRunClaimStore()), usage);
  const replay = new Response();
  await peer.observeThread(ORG, USER, threadId, replay);
  assert.ok(replay.parts().some(part => part.type === 'start'), 'A fresh handler consumes native replay without an ActiveTurns buffer.');
  assert.equal(replay.parts().find(part => part.type === 'start').messageId, firstResponse.parts().find(part => part.type === 'start').messageId,
    'Native replay keeps the assistant message identity instead of appending a duplicate response.');
  assert.equal(replay.parts().filter(part => part.type === 'text-delta').map(part => part.delta).join(''), 'Нативная задача завершена.', 'Resolved approval history must not close a fresh observer early.');
  await assert.rejects(peer.getThread(ORG, { ...USER, id: 'foreign' }, threadId), error => error.getStatus() === 403);
  if (kind === 'approval') {
    const queued = [];
    service.queueNativeInput = async input => { queued.push(input); return { workflowRunId: 'native-queued-workflow', childRunId: 'native-queued-child', requestId: input.requestId, duplicate: false }; };
    const instruction = id => ({ id, role: 'user', parts: [{ type: 'text', text: 'Следующее поручение' }] });
    const accepted = await handler.signalThread(ORG, USER, threadId, { kind: 'queue', message: instruction('queued-human') });
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.durability, 'native');
    assert.equal(accepted.workflowRunId, 'native-queued-workflow');
    assert.equal(queued[0].signal.id, 'queued-human');
    assert.equal(queued[0].identity.userId, USER.id);
    assert.notEqual(queued[0].requestId, (await threads.readNativeRun(IDENTITY, threadId)).logicalRequestId);
    const saved = await handler.getThread(ORG, USER, threadId);
    assert.ok(saved.signalReceipts.some(receipt => receipt.id === 'queued-human'));
    service.queueNativeInput = async input => { queued.push(input); throw Object.assign(new Error('Uncertain native acknowledgement.'), {
      code: 'QUEUED_INPUT_ACCEPTANCE_UNCERTAIN', receipt: { workflowRunId: 'unknown-workflow', childRunId: 'unknown-child', requestId: input.requestId },
    }); };
    const uncertain = await handler.signalThread(ORG, USER, threadId, { kind: 'follow-up', message: instruction('unknown-human') });
    assert.equal(uncertain.accepted, 'unknown');
    assert.equal(uncertain.id, 'unknown-human');
    assert.equal(queued.length, 2, 'Uncertain native admission must not enqueue an alternate input.');
    service.queueNativeInput = async input => ({ workflowRunId: 'accepted-workflow', childRunId: 'accepted-child', requestId: input.requestId, duplicate: false });
    const originalReceipt = threads.rememberSignalReceipt;
    threads.rememberSignalReceipt = async () => { throw new Error('UI projection store unavailable.'); };
    const projected = await handler.signalThread(ORG, USER, threadId, { kind: 'queue', message: instruction('accepted-human') });
    assert.equal(projected.accepted, true, 'A UI projection fault cannot reverse authoritative native admission.');
    threads.rememberSignalReceipt = originalReceipt;
    await assert.rejects(handler.signalThread(ORG, { ...USER, id: 'foreign' }, threadId, { kind: 'queue', message: instruction('foreign') }), error => error.getStatus() === 403);
  }
  await mastra.shutdown();
  return { kind, admissions, writes, humanHistory: true, replay: true, answer: text };
}

module.exports = { Response, HttpController, AgentThreadsService, until, mocks, providerModel, providerRequests };

if (require.main === module) (async () => {
  const result = [];
  for (const kind of ['provider-terminal-tripwire', 'approval', 'question', 'provider-skill', 'provider-approval', 'provider-payment']) result.push(await scenario(kind));
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; });
