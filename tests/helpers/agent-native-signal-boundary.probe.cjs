'use strict';

require('reflect-metadata');
const assert = require('node:assert/strict');
const { Mastra } = require('@mastra/core/mastra');
const { InMemoryStore } = require('@mastra/core/storage');
const { createDurableAgent } = require('@mastra/core/agent/durable');
const { MockLanguageModelV3 } = require('ai/test');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { Response, HttpController, AgentThreadsService, until, mocks } = require('./agent-native-session-http.probe.cjs');
const conductor = loadCapabilityModule('../conductor/index.ts', { mocks });
const { inProcessRunClaimStore } = loadCapabilityModule('../conductor/agent-run-claims.ts');
const identity = { organizationId: 'org-boundary', userId: 'user-boundary', role: 'EDITOR', language: 'ru', timeZone: 'UTC', organizationCreatedAt: '2026-01-01T00:00:00.000Z' };
const ORG = { id: identity.organizationId, createdAt: identity.organizationCreatedAt, users: [{ role: identity.role }] };
const USER = { id: identity.userId, language: identity.language };
const threadId = 'thread-boundary';
const resourceId = `${identity.organizationId}:${identity.userId}`;
const human = (id, text) => ({ id, role: 'user', parts: [{ type: 'text', text }] });

(async () => {
  const storage = new InMemoryStore();
  const memory = conductor.createConductorMemory(storage);
  let releaseFirst;
  const firstFinish = new Promise(resolve => { releaseFirst = resolve; });
  const prompts = [];
  const model = new MockLanguageModelV3({ modelId: 'boundary-model', doStream: async args => {
    prompts.push(JSON.stringify(args.prompt));
    const number = prompts.length;
    return { stream: new ReadableStream({ async start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: `text-${number}` });
      controller.enqueue({ type: 'text-delta', id: `text-${number}`, delta: `Native answer ${number}.${number === 1 ? ' Safe final text.'.repeat(40) : ''}` });
      if (number === 1) await firstFinish;
      controller.enqueue({ type: 'text-end', id: `text-${number}` });
      controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 2, noCache: 2 }, outputTokens: { total: 2, text: 2 } } });
      controller.close();
    } }) };
  } });
  const bare = conductor.buildConductorAgent({ model: async () => model, memory, capabilities: [],
    services: () => ({}), gate: { check: async () => ({ allowed: true, policies: [] }) }, snapshot: async () => ({}) });
  const agent = createDurableAgent({ agent: bare, cleanupTimeoutMs: 1000 });
  const controller = conductor.buildConductorController(agent, { storage, memory });
  const mastra = new Mastra({ storage, agents: { 'content-factory': agent }, agentControllers: { 'content-factory': controller } });
  await controller.init();
  await memory.createThread({ threadId, resourceId });
  const resolvedSelections = [];
  const service = { mastra: async () => mastra, conductor: async () => agent,
    resolveWorkContext: async (_identity, context) => {
      assert.equal(_identity.organizationId, identity.organizationId);
      if (context.id === 'outside-piece') throw Object.assign(new Error('Selected object belongs to another workspace.'), { name: 'PermissionDenied' });
      resolvedSelections.push(context);
      return { context, data: {}, truncated: false };
    },
    sessionFor: async (_identity, id, options) => controller.createSession({ id: `${resourceId}:${id}`, ownerId: USER.id,
      resourceId, scope: id, threadId: id, createInitialThread: false, requestContext: options?.requestContext }),
  };
  let admissions = 0;
  const handler = new HttpController(service, new AgentThreadsService(service, inProcessRunClaimStore()), {
    beginAiOperation: async () => { admissions++; return { run: work => work(), finish: async () => undefined }; },
  });
  try {
    const firstResponse = new Response();
    const firstTask = handler.chat(ORG, USER, { threadId, messages: [human('initial-human', 'Initial request.')] }, firstResponse);
    await until(() => firstResponse.parts().some(part => part.type === 'text-delta'), 'first final text before native finish');
    await assert.rejects(() => handler.signalThread(ORG, USER, threadId, { kind: 'deliver',
      workContext: { version: 'assistant-work-context/v1', kind: 'piece', id: 'outside-piece' },
      message: human('foreign-selection-human', 'Do not deliver an unauthorized target.') }), { name: 'PermissionDenied' });
    assert.equal(prompts.length, 1, 'A refused selected object starts no model work.');
    const selected = { version: 'assistant-work-context/v1', kind: 'piece', id: 'selected-boundary-piece' };
    const active = await handler.signalThread(ORG, USER, threadId, { kind: 'deliver', workContext: selected,
      message: human('boundary-human', 'Boundary instruction must execute.') });
    assert.equal(active.action, 'deliver');
    releaseFirst();
    await firstTask;
    assert.equal(prompts.length, 2, 'Acknowledged delivery before native finish must be consumed by another model step.');
    assert.match(prompts[1], /Boundary instruction must execute/);
    assert.deepEqual(resolvedSelections, [selected], 'The authenticated signal resolves its exact selected object.');
    assert.match(prompts[1], /selected-boundary-piece/, 'Native signal attributes carry the selected object into the next model step.');
    assert.equal(admissions, 1, 'Active delivery retains its original admitted task.');
    const idleMessage = human('idle-human', 'Idle instruction must start a fresh turn.');
    const idle = await handler.signalThread(ORG, USER, threadId, { kind: 'deliver', message: idleMessage });
    assert.equal(idle.accepted, false);
    assert.equal(idle.code, 'AGENT_SIGNAL_IDLE');
    assert.equal(idle.id, idleMessage.id);
    assert.equal(prompts.length, 2, 'A positive idle verdict starts no model work.');
    assert.equal((await handler.getThread(ORG, USER, threadId)).messages.some(message => message.id === idleMessage.id), false,
      'Discarded input was not quietly persisted as an unexecuted instruction.');
    const nextResponse = new Response();
    await handler.chat(ORG, USER, { threadId, messages: [idleMessage] }, nextResponse);
    const final = await handler.getThread(ORG, USER, threadId);
    assert.equal(final.messages.filter(message => message.id === idleMessage.id).length, 1);
    assert.equal(final.execution.outcome, 'completed');
    assert.equal(prompts.length, 3);
    assert.equal(admissions, 2);
    console.log(JSON.stringify({ activeAction: active.action, boundaryProviderCalls: 2, idleVerdict: idle.code, totalAdmissions: admissions, totalProviderCalls: prompts.length }));
  } finally { releaseFirst(); await mastra.shutdown(); }
})().catch(error => { console.error(error); process.exit(1); });
