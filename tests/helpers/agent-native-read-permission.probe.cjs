'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { RequestContext, MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } = require('@mastra/core/request-context');
const { createRuntime, IDENTITY } = require('./mastra-service-native-integration.probe.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } };
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-native-read-permission-'));
const auditPath = path.join(temporary, 'audit.jsonl');
const cases = [
 { id: 'reads', tools: [
  { name: 'readConversationHistory', input: {} },
  { name: 'schedule_followup_list', input: {} },
  { name: 'set_objective', input: { action: 'get' } },
 ] },
 { id: 'objective-set', tools: [{ name: 'set_objective', input: { action: 'set', text: 'This mutation still requires approval.' } }], gate: true },
 { id: 'objective-default', tools: [{ name: 'set_objective', input: { text: 'The default action is a mutation.' } }], gate: true },
 { id: 'objective-clear', tools: [{ name: 'set_objective', input: { action: 'clear' } }], gate: true },
 { id: 'domain-write', tools: [{ name: 'fixture_persist', input: {} }], gate: true },
 { id: 'notification-list-marks-seen', tools: [{ name: 'notification_inbox', input: { action: 'list' } }], gate: true },
];
async function main() {
 let active;
 const runtime = await createRuntime({ fixtureMode: 'approval', auditPath, modelFactory: modelId => new MockLanguageModelV3({ modelId,
  async doStream(args) {
   const current = active;
   assert(current, 'Only an owned controlled case may execute a fixture model');
   current.outputs.push(...args.prompt.filter(message => message.role === 'tool'));
   const spec = current.tools[current.calls++];
   if (spec) {
    assert(args.tools.some(tool => tool.name === spec.name), `${spec.name} must be registered on the actual native Agent`);
    return { stream: convertArrayToReadableStream([
     { type: 'stream-start', warnings: [] },
     { type: 'tool-call', toolCallId: `${current.id}-${current.calls}`, toolName: spec.name, input: JSON.stringify(spec.input) },
     { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
    ]) };
   }
   return { stream: convertArrayToReadableStream([
    { type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: 'Owned native reads completed.' }, { type: 'text-end', id: 'answer' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
   ]) };
  },
 }) });
 const reports = [];
 try {
  const { service, memory, contextModule, executionModule } = runtime;
  await memory.createThread({ threadId: 'foreign-read-permission', resourceId: 'org-service:other-user', title: 'Foreign private thread' });
  await memory.saveMessages({ messages: [{ id: 'foreign-sentinel', threadId: 'foreign-read-permission', resourceId: 'org-service:other-user', role: 'user', createdAt: new Date('2026-01-01T00:00:00Z'), content: { format: 2, parts: [{ type: 'text', text: 'FOREIGN_HISTORY_SENTINEL' }] } }] });
  for (const spec of cases) {
   active = { ...spec, calls: 0, outputs: [] };
   const current = active;
   const threadId = `native-read-permission-${spec.id}`;
   const requestId = `native-read-request-${spec.id}`;
   await memory.createThread({ threadId, resourceId: 'org-service:user-service', title: 'Controlled native permission case' });
   await memory.saveMessages({ messages: [{ id: `own-${spec.id}`, threadId, resourceId: 'org-service:user-service', role: 'user', createdAt: new Date('2026-01-01T00:00:00Z'), content: { format: 2, parts: [{ type: 'text', text: 'OWNER_HISTORY_SENTINEL' }] } }] });
   const context = contextModule.buildConductorContext({ identity: IDENTITY, threadId, requestId });
   const execution = new executionModule.ConductorExecution({ requestId, native: true });
   const admission = await runtime.aiUsage.beginAiOperation(IDENTITY.organizationId, 'agent', 'agent');
   let session, done = false, failure;
   await admission.run(() => execution.run(async () => {
    session = await service.bindNativeTaskSession(IDENTITY, threadId, context);
    void session.sendMessage({ content: 'Execute the controlled case.', requestContext: context }).then(() => { done = true; }, error => { done = true; failure = error; });
   }));
   for (let i = 0; i < 200 && !done && !session.approval.isArmed(); i++) await pause(25);
   const armed = session.approval.isArmed();
   const callCount = current.calls;
   const toolOutput = JSON.stringify(current.outputs);
   if (armed || !done) {
    const pointer = (await memory.getThreadById({ threadId })).metadata.assistantNativeRun;
    if (pointer?.runId) await service.cancelModelAvailability(pointer.runId, threadId);
    await session.abort();
    for (let i = 0; i < 80 && !done; i++) await pause(25);
    assert(done, 'A canceled owned fixture must finish before another case starts');
   }
   reports.push({ id: spec.id, calls: callCount, gateArmed: armed, ownerHistory: toolOutput.includes('OWNER_HISTORY_SENTINEL'), foreignHistory: toolOutput.includes('FOREIGN_HISTORY_SENTINEL') });
   assert.equal(armed, !!spec.gate, `${spec.id}: only declared reads bypass the native global approval gate`);
   if (!spec.gate) {
    assert.equal(failure, undefined);
    assert.equal(callCount, 4);
    assert.equal(reports.at(-1).ownerHistory, true);
    assert.equal(reports.at(-1).foreignHistory, false);
    assert(toolOutput.includes('schedule_followup_list') && toolOutput.includes('set_objective'));
    const memoryTools = memory.listTools();
    assert.equal(memoryTools.readConversationHistory.mcp.annotations.readOnlyHint, true);
    assert.equal(memoryTools.updateWorkingMemory.requireApproval, false, 'Working-memory mutation keeps its original non-authoritative boolean; Session still gates it');
    assert.equal(session.resolveToolApproval('updateWorkingMemory', threadId), 'ask');
    const before = reports.length;
    const foreignContext = contextModule.buildConductorContext({ identity: IDENTITY, threadId: 'foreign-read-permission', requestId: 'foreign-read-proof' });
    foreignContext.set(MASTRA_THREAD_ID_KEY, 'foreign-read-permission');
    foreignContext.set(MASTRA_RESOURCE_ID_KEY, 'org-service:user-service');
    for (const requestContext of [foreignContext, new RequestContext()]) {
     const result = await memoryTools.readConversationHistory.execute({}, { requestContext });
     assert.equal(result.ok, false); assert.equal(result.code, 'AGENT_NOT_YOURS');
    }
    assert.equal(reports.length, before);
    const registered = await runtime.agent.listTools({ requestContext: context });
    assert.equal(registered.schedule_followup_list.mcp.annotations.readOnlyHint, true);
    assert.equal(registered.set_objective.mcp.annotations.readOnlyHint, false, 'Mixed get/set tool must not claim to be wholly read-only');
   } else assert.equal(callCount, 1);
  }
  const events = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  assert.equal(events.filter(event => event.type === 'write').length, 0, 'No gated domain effect may execute');
  return { reports, ownerRefusals: 2, domainWrites: 0, externalProviderCalls: 0 };
 } finally {
  await runtime.close({ drop: true });
  fs.rmSync(temporary, { recursive: true, force: true });
 }
}
main().then(report => { console.log(JSON.stringify(report)); process.exit(0); }).catch(error => { console.error(error); process.exit(1); });
