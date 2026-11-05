'use strict';

// Real Session/HTTP/MastraService with isolated Memory and a controlled SDK
// model. A delayed subscriber is the failure injection; no live API is used.
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { InMemoryStore } = require('@mastra/core/storage');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { RequestContext } = require('@mastra/core/request-context');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { Response, AgentThreadsService, until, mocks } = require('./agent-native-session-http.probe.cjs');
const registry = loadCapabilityModule('capability.registry.ts');
const execution = loadCapabilityModule('../conductor/conductor.execution.ts');
const claims = loadCapabilityModule('../conductor/agent-run-claims.ts');
const { CONDUCTOR_REQUEST_ID_KEY } = loadCapabilityModule('../conductor/conductor.context.ts');
const identity = { organizationId: 'stale-org', userId: 'stale-user', role: 'ADMIN', organizationCreatedAt: '2026-01-01T00:00:00Z', language: 'ru' };
const org = { id: identity.organizationId, createdAt: identity.organizationCreatedAt, users: [{ role: 'ADMIN' }] };
const user = { id: identity.userId, language: 'ru' };
const resourceId = 'stale-org:stale-user';
const human = (id, text) => ({ id, role: 'user', parts: [{ type: 'text', text }] });
const trace = value => { if (process.env.CF_STALE_PROBE_DEBUG) console.error(value); };
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };

async function fixture({ questionCount = 1, script, membershipRole = 'ADMIN', membershipActive = true, storage: sharedStorage, serviceOverrides = {} } = {}) {
  const storage = sharedStorage ?? new InMemoryStore();
  await storage.init();
  const modelCalls = [];
  const model = new MockLanguageModelV3({ modelId: 'native-stale-free', doStream: async args => {
    modelCalls.push(JSON.stringify(args.prompt));
    const parts = script ? await script(args, modelCalls.length) : modelCalls.length <= questionCount
      ? [{ type: 'tool-call', toolCallId: modelCalls.length === 1 ? 'delayed-question' : `repeat-question-${modelCalls.length}`, toolName: 'ask_user', input: JSON.stringify({ question: 'Pick a direction', options: [{ label: 'First' }, { label: 'Second' }] }) }]
      : [{ type: 'text-start', id: 'reply' }, { type: 'text-delta', id: 'reply', delta: 'Native task finished.' }, { type: 'text-end', id: 'reply' }];
    const tool = parts.some(part => part.type === 'tool-call');
    return { stream: convertArrayToReadableStream([{ type: 'stream-start', warnings: [] }, ...parts,
      { type: 'finish', finishReason: { unified: tool ? 'tool-calls' : 'stop', raw: tool ? 'tool_calls' : 'stop' }, usage }]) };
  } });
  const PrismaService = class PrismaService {};
  const clients = { getRoutedMastraModelEntries: async () => ({ entries: [{ model, maxRetries: 0 }], policy: { maxRetries: 0 } }),
    getMastraAiSdkProvider: async () => ({ chat: () => model }), getModelForRole: async () => model.modelId,
    getClassifyDecisionModel: async () => { throw new Error('Unexpected classifier.'); }, getMastraVoice: async () => { throw new Error('Unexpected voice.'); } };
  const { MastraService } = loadCapabilityModule('../mastra.service.ts', { mocks: {
    '@mastra/core/evals': require('@mastra/core/evals'),
    '@mastra/core/agent/durable': { ...require('@mastra/core/agent/durable'),
      createDurableAgent: options => require('@mastra/core/agent/durable').createDurableAgent({ ...options, cleanupTimeoutMs: 1_000 }) },
    '@contentfactory/nestjs-libraries/chat/mastra.store': { pStore: storage, closeMastraStore: async () => {} },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: undefined },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaService },
    '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
    '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry': registry,
    '../capabilities/capability.registry': registry,
    './conductor.execution': execution, './conductor/conductor.execution': execution,
    '../capabilities/catalogue/overview.capabilities': { readWorkspaceSnapshot: async () => ({ channels: [] }) },
    '@contentfactory/nestjs-libraries/chat/capabilities/door-policy': { DoorPolicyGate: class { async check() { return { allowed: true, policies: [] }; } } },
  } });
  const admissions = [];
  const aiUsage = { prepareModelExecution: async (_org, _operation, factory) => factory(), beginAiOperation: async () => {
    const entry = { finishes: [], checkpoints: 0 }; admissions.push(entry); return { run: work => work(),
      checkpoint: async () => { entry.checkpoints++; return true; }, finish: async completed => entry.finishes.push(completed) };
  } };
  const service = new MastraService({ get: token => token === PrismaService ? { userOrganization: { findUnique: async () => ({ role: membershipRole, disabled: false,
    user: { activated: membershipActive, blockedAt: null }, organization: { createdAt: new Date(identity.organizationCreatedAt) } }) } } : serviceOverrides[token.name] ?? {} }, aiUsage);
  const mastra = await service.mastra(), agent = await service.conductor(), memory = await agent.getMemory();
  const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
    ...mocks, '@contentfactory/nestjs-libraries/chat/conductor/conductor.execution': execution,
  });
  const threads = new AgentThreadsService(service, claims.inProcessRunClaimStore());
  const handler = new AgentController(service, threads, aiUsage);
  return { storage, service, MastraService, mastra, agent, memory, threads, handler, admissions, modelCalls, model,
    close: async () => { await service.onApplicationShutdown(); await storage.close(); } };
}

async function scenario(delayed) {
  const f = await fixture();
  const threadId = delayed ? 'native-late-suspension' : 'native-on-time-suspension';
  let releaseDelayed;
  let held = false;
  try {
    await f.memory.createThread({ threadId, resourceId, title: 'Native stale suspension' });
    if (delayed) {
      const subscribe = f.agent.subscribeToThread.bind(f.agent);
      f.agent.subscribeToThread = async (...args) => {
        const subscription = await subscribe(...args);
        const stream = { async *[Symbol.asyncIterator]() {
          for await (const chunk of subscription.stream) {
            if (!held && chunk.type === 'tool-call-suspended') { held = true; await new Promise(resolve => { releaseDelayed = resolve; }); }
            yield chunk;
          }
        } };
        return new Proxy(subscription, { get: (target, key) => key === 'stream' ? stream : Reflect.get(target, key) });
      };
    }
    trace({ delayed, step: 'send-parent' });
    const parent = f.handler.chat(org, user, { threadId, messages: [human('first-human', 'Ask before choosing.')] }, new Response());
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.length > 0, 'saved native question');
    trace({ delayed, step: 'pending' });
    const beforeAnswer = await f.handler.getThread(org, user, threadId);
    const call = beforeAnswer.pending[0];
    const session = await f.service.sessionFor(identity, threadId);
    // A real parked gate must remain answerable, not be erased by rebinding.
    await assert.rejects(() => f.handler.chat(org, user, { threadId, messages: [human('blocked-human', 'Do not replace the pending question.')] }, new Response()), error => error.getStatus() === 409);
    trace({ delayed, step: 'blocked-new-task' });
    const reply = new Response();
    await f.handler.chat(org, user, { threadId, runId: call.runId, toolCallId: call.toolCallId, cardId: call.suspendPayload?.cardId, resumeData: { answer: 'First' } }, reply);
    trace({ delayed, step: 'answer-returned' });
    await parent;
    trace({ delayed, step: 'parent-finished' });
    const completed = await f.handler.getThread(org, user, threadId);
    assert.equal(completed.pending.length, 0);
    assert.equal(completed.execution.outcome, 'completed');
    if (delayed) { releaseDelayed(); await until(() => session.suspensions.hasPending(), 'late native mirror'); }
    const staleBeforeSend = session.suspensions.hasPending();
    assert.equal(staleBeforeSend, delayed);
    trace({ delayed, step: 'mirror-checked' });
    const savedBefore = JSON.stringify((await f.memory.recall({ threadId, resourceId })).messages);
    // Binding alone must not rewrite historical answers or synthesize decline.
    await f.service.bindNativeTaskSession(identity, threadId, new RequestContext([[CONDUCTOR_REQUEST_ID_KEY, 'next-task']]));
    assert.equal(JSON.stringify((await f.memory.recall({ threadId, resourceId })).messages), savedBefore);
    trace({ delayed, step: 'rebound' });
    const next = new Response();
    await f.handler.chat(org, user, { threadId, messages: [human('follow-up-human', 'Continue with my next instruction.')] }, next);
    trace({ delayed, step: 'next-finished' });
    const final = await f.handler.getThread(org, user, threadId);
    assert.equal(final.execution.outcome, 'completed');
    assert.equal(final.pending.length, 0);
    assert.ok(final.messages.some(message => message.role === 'user' && message.id === 'follow-up-human'));
    assert.equal(session.suspensions.hasPending(), false);
    assert.deepEqual(f.admissions.map(entry => entry.finishes), [[true], [true]]);
    assert.equal(f.modelCalls.length, 3);
    assert.ok(f.modelCalls.at(-1).includes('Continue with my next instruction.'));
    assert.equal(next.parts().some(part => part.type === 'error'), false);
    return { delayed, staleBeforeSend, finalOutcome: final.execution.outcome, newMessageSaved: true, originalHistoryUnchanged: true,
      modelTransportCalls: f.modelCalls.length, admissions: f.admissions.length, actualNativeResume: true };
  } finally { releaseDelayed?.(); await f.close(); }
}

async function refusals() {
  const f = await fixture();
  const result = [];
  try {
    for (const kind of ['pending', 'active', 'partial', 'queued', 'unknown', 'same-owner', 'approval', 'new-mirror', 'pointer-change', 'foreign-thread', 'read-error']) {
      const threadId = 'refusal-thread', runId = 'completed-run';
      const metadata = { assistantNativeRun: { runId, state: kind === 'unknown' ? 'running' : 'settled', logicalRequestId: 'finished-request' } };
      let reads = 0, deleted = 0, detached = 0;
      const session = { thread: { getById: async () => { reads++; return { resourceId: kind === 'foreign-thread' ? 'foreign:resource' : resourceId,
        metadata: kind === 'pointer-change' && reads > 1 ? { assistantNativeRun: { ...metadata.assistantNativeRun, runId: 'successor' } } : metadata }; },
        detachFromCurrent: () => { detached++; }, getId: () => threadId, ensureCurrentSubscription: async () => {} },
        approval: { isArmed: () => kind === 'approval' }, suspensions: { hasPending: () => true, deleteForRun: () => { deleted++; } },
        run: { getRunId: () => kind === 'new-mirror' ? 'another-run' : runId } };
      const fake = { sessionFor: async () => session, nativeTaskScopes: new Map(kind === 'queued' ? [[`${resourceId}:${threadId}`, {}]] : []),
        conductor: async () => ({ listSuspendedRuns: async () => { if (kind === 'read-error') throw new Error('Native state unavailable');
          return { total: ['pending', 'partial'].includes(kind) ? 1 : 0, runs: kind === 'pending' ? [{ runId }] : [] }; },
          listActiveRuns: async () => ({ total: kind === 'active' ? 1 : 0, runs: kind === 'active' ? [{ runId }] : [] }) }) };
      await assert.rejects(() => f.MastraService.prototype.bindNativeTaskSession.call(fake, identity, threadId,
        new RequestContext([[CONDUCTOR_REQUEST_ID_KEY, kind === 'same-owner' ? 'finished-request' : 'new-request']])));
      assert.equal(deleted, 0, `${kind}: preserve genuine/unknown gate`);
      assert.equal(detached, 0, `${kind}: no abort, detach, answer or history mutation`);
      result.push(kind);
    }
    return result;
  } finally { await f.close(); }
}

module.exports = { fixture, identity, org, user, resourceId, human, Response, until };

if (require.main === module) (async () => {
  delete process.env.REDIS_URL;
  process.env.NODE_ENV = 'test';
  process.env.MASTRA_DATABASE_URL = 'memory:native-stale-suspension';
  let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw new Error('External HTTP blocked in native suspension probe.'); };
  const normal = await scenario(false), delayed = await scenario(true), protectedCases = await refusals();
  assert.equal(externalRequests, 0);
  console.log(JSON.stringify({ normal, delayed, protectedCases, externalRequests }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
