'use strict';
const assert = require('node:assert/strict');
const { fixture, identity: memoryIdentity, org: memoryOrg, user: memoryUser, Response, until } = require('./agent-native-stale-suspension.probe.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { buildConductorContext } = loadCapabilityModule('../conductor/conductor.context.ts');
const { resolveGoalStore, readObjective } = require('@mastra/core/tools');
const realStorage = process.env.CF_CONTEXT_REAL_STORAGE === '1';
const native = realStorage ? require('./mastra-service-native-integration.probe.cjs') : null;
const identity = native?.IDENTITY ?? memoryIdentity;
const org = native ? { id: identity.organizationId, createdAt: identity.organizationCreatedAt, users: [{ role: identity.role }] } : memoryOrg;
const user = native ? { id: identity.userId, language: 'ru' } : memoryUser;
const resourceId = identity.organizationId + ':' + identity.userId;
const text = [{ type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Approved work finished.' }, { type: 'text-end', id: 'done' }];
const clone = value => JSON.parse(JSON.stringify(value));
async function create(script, access) {
  if (!realStorage) {
    const f = await fixture({ script, membershipRole: access === 'downgraded' ? 'USER' : 'ADMIN', membershipActive: access !== 'revoked' });
    f.mastra.addGateway({ id: 'native-context-free', name: 'Controlled cold model',
      handlesModel: id => id.startsWith('mock-provider/'),
      fetchProviders: async () => ({ 'mock-provider': { name: 'Controlled', gateway: 'native-context-free', apiKeyEnvVar: [], models: [f.model.modelId] } }),
      buildUrl: () => undefined, getApiKey: async () => 'synthetic', resolveLanguageModel: () => f.model });
    return f;
  }
  const { MockLanguageModelV3 } = require('ai/test'), { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
  const calls = [];
  const runtime = await native.createRuntime({ fixtureMode: 'approval', membershipRole: access === 'downgraded' ? 'USER' : undefined, active: access !== 'revoked', modelFactory: modelId => new MockLanguageModelV3({ modelId, doStream: async args => {
    calls.push(args.prompt); const parts = await script(args, calls.length), tool = parts.some(p => p.type === 'tool-call');
    return { stream: convertArrayToReadableStream([{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason: { unified: tool ? 'tool-calls' : 'stop', raw: tool ? 'tool_calls' : 'stop' }, usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } } }]) };
  } }) });
  const { AgentThreadsService, HttpController } = require('./agent-native-session-http.probe.cjs');
  const { inProcessRunClaimStore } = loadCapabilityModule('../conductor/agent-run-claims.ts');
  const close = runtime.close.bind(runtime);
  return { ...runtime, modelCalls: calls, handler: new HttpController(runtime.service, new AgentThreadsService(runtime.service, inProcessRunClaimStore()), runtime.aiUsage), close: () => close({ drop: true }) };
}
async function scenario(policy, decision, access) {
  const threadId = `remote-context-${policy}-${decision ?? 'auto'}`, target = 'objective-call';
  const original = await create(async (_args, call) => call === 1 ? [{ type: 'tool-call', toolCallId: target, toolName: 'set_objective', input: JSON.stringify({ action: 'clear' }) }] : text);
  let copied;
  try {
    await original.memory.createThread({ threadId, resourceId, title: 'Controlled native approval' });
    const topic = 'agent.thread-stream.' + encodeURIComponent(resourceId + '\0' + threadId), events = [];
    const pubsub = original.agent.getPubSub();
    const record = event => { events.push(clone(event)); };
    await pubsub.subscribe(topic, record);
    const originalResponse = new Response();
    const parent = original.handler.chat(org, user, { threadId, messages: [{ id: 'original-instruction', role: 'user', parts: [{ type: 'text', text: 'Set the controlled objective after permission.' }] }] }, originalResponse);
    parent.catch(() => {});
    await until(async () => (await original.handler.getThread(org, user, threadId)).pending.some(p => p.kind === 'approval'), 'original approval');
    await until(() => events.some(e => e.type === 'run-suspended'), 'native suspension event');
    // Copy a real parked HTTP turn, never a snapshot left behind by a failed
    // fixture admission. The usage checkpoint is part of the actual interface.
    await until(() => originalResponse.parts().some(p => p.type === 'data-native-input-wait') || originalResponse.parts().some(p => p.type === 'error'), 'original HTTP input wait');
    assert.deepEqual(originalResponse.parts().filter(p => p.type === 'error'), []);
    if (!realStorage) assert.ok(original.admissions[0].checkpoints > 0);
    await pubsub.unsubscribe(topic, record);
    const thread = clone(await original.memory.getThreadById({ threadId }));
    assert.equal(thread.metadata.assistantExecution.state, 'running');
    assert.ok(['running', 'waiting'].includes(thread.metadata.assistantNativeRun.state));
    const messages = clone((await (await original.storage.getStore('memory')).listMessages({ threadId, resourceId, page: 0, perPage: 1000 })).messages);
    const runs = clone((await (await original.storage.getStore('workflows')).listWorkflowRuns({ page: 0, perPage: 1000 })).runs);
    copied = await create(async () => text, access);
    await copied.memory.createThread({ threadId, resourceId, title: thread.title, metadata: thread.metadata });
    await (await copied.storage.getStore('memory')).saveMessages({ messages: messages.map(m => ({ ...m, createdAt: new Date(m.createdAt) })) });
    const workflows = await copied.storage.getStore('workflows');
    for (const run of runs) await workflows.persistWorkflowSnapshot({ workflowName: run.workflowName, runId: run.runId, resourceId: run.resourceId, snapshot: run.snapshot });
    const session = await copied.service.sessionFor(identity, threadId);
    await session.permissions.setForTool({ toolName: 'set_objective', policy });
    const errors = [], gates = [], ends = [];
    session.subscribe(e => { if (e.type === 'error') errors.push(e.error?.message); if (e.type === 'tool_approval_required') gates.push(e.toolCallId); if (e.type === 'agent_end') ends.push(e.reason); });
    const context = buildConductorContext({ identity, threadId, requestId: thread.metadata.assistantNativeRun.logicalRequestId });
    await copied.service.sessionFor(identity, threadId, { bindThread: true, requestContext: context });
    const goalStore = await resolveGoalStore(copied.mastra);
    let writes = 0;
    const deleteState = goalStore.deleteState.bind(goalStore);
    goalStore.deleteState = async args => { if (args.threadId === threadId) writes++; return deleteState(args); };
    assert.equal(writes, 0);
    for (const e of events) await copied.agent.getPubSub().publish(topic, e);
    if (access === 'revoked') {
      await until(() => errors.length > 0, 'revoked membership refusal');
      assert.ok(errors.every(error => error.includes('Workspace access is no longer available')));
      assert.equal(writes, 0);
      assert.equal(copied.modelCalls.length, 0);
      const pending = await copied.agent.listSuspendedRuns({ threadId, resourceId });
      assert.equal(pending.runs[0].toolCalls[0].requiresApproval, true);
      return { policy, decision: null, access, explicitGate: false, persistedEffect: false, modelCalls: 0, replayDuplicatedEffect: false };
    }
    // A policy change to allow does not decide an older parked approval.
    // A current deny remains authoritative and rejects that call natively.
    if (policy !== 'deny') {
      await until(() => session.approval.isArmed() || errors.length, 'remote approval armed');
      assert.deepEqual(errors, []);
      assert.equal(session.approval.isArmed({ toolCallId: target }), true);
      assert.equal(copied.modelCalls.length, 0);
      assert.ok(!await readObjective(goalStore, threadId));
      const answer = await session.respondToToolApproval({ toolCallId: target, decision });
      assert.equal(answer.accepted, true);
    }
    await until(async () => {
      const pending = await copied.agent.listSuspendedRuns({ threadId, resourceId });
      return errors.length || (pending.total === 0 && copied.modelCalls.length > 0 && ends.includes('complete'));
    }, 'remote continuation');
    assert.deepEqual(errors, []);
    const pending = await copied.agent.listSuspendedRuns({ threadId, resourceId });
    assert.equal(pending.total, 0);
    assert.equal(copied.modelCalls.length, 1);
    const expectedWrite = access !== 'downgraded' && policy !== 'deny' && decision === 'approve';
    assert.equal(writes, expectedWrite ? 1 : 0);
    for (const e of events) await copied.agent.getPubSub().publish(topic, e);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(writes, expectedWrite ? 1 : 0);
    assert.ok(errors.every(error => error.includes('could not find a suspended run') || error === 'Native run context is outside this session or unavailable.'), JSON.stringify(errors));
    assert.equal(copied.modelCalls.length, 1);
    return { policy, decision: decision ?? null, access: access ?? null, explicitGate: gates.length > 0, persistedEffect: expectedWrite, modelCalls: 1, replayDuplicatedEffect: false };
  } finally { if (copied) await copied.close(); await original.close(); }
}
async function main() {
  if (!realStorage) { delete process.env.REDIS_URL; process.env.MASTRA_DATABASE_URL = 'memory:native-remote-context'; }
  process.env.NODE_ENV = 'test'; let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw Error('No external HTTP in native context proof'); };
  const reports = [];
  for (const [policy, decision, access] of [['ask','approve'], ['ask','decline'], ['deny'], ['allow','approve'], ['allow','approve','downgraded'], ['allow','approve','revoked']]) reports.push(await scenario(policy, decision, access));
  assert.equal(externalRequests, 0);
  console.log(JSON.stringify({ reports, realStorage, externalRequests }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
