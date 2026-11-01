'use strict';
const assert = require('node:assert/strict');
const { fixture, identity, org, user, resourceId, human, Response, until } = require('./agent-native-stale-suspension.probe.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { buildConductorContext } = loadCapabilityModule('../conductor/conductor.context.ts');

async function repeated() {
  const f = await fixture({ questionCount: 2 });
  try {
    const threadId = 'native-repeated-question-policy';
    await f.memory.createThread({ threadId, resourceId, title: 'Native repeated question' });
    const firstResponse = new Response(), secondResponse = new Response(), finalResponse = new Response();
    const parent = f.handler.chat(org, user, { threadId, messages: [human('question-policy-human', 'Ask twice before finishing.')] }, firstResponse);
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.some(p => p.kind === 'question'), 'first question');
    const first = (await f.handler.getThread(org, user, threadId)).pending[0];
    const continuation = f.handler.chat(org, user, { threadId, runId: first.runId, toolCallId: first.toolCallId, cardId: first.suspendPayload.cardId, resumeData: { answer: 'First' } }, secondResponse);
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.some(p => p.kind === 'question' && p.toolCallId !== first.toolCallId), 'next question');
    const second = (await f.handler.getThread(org, user, threadId)).pending[0];
    await f.handler.chat(org, user, { threadId, runId: second.runId, toolCallId: second.toolCallId, cardId: second.suspendPayload.cardId, resumeData: { answer: 'Second' } }, finalResponse);
    await Promise.all([parent, continuation]);
    const final = await f.handler.getThread(org, user, threadId);
    const approvals = [firstResponse, secondResponse, finalResponse].flatMap(r => r.parts()).filter(p => p.type === 'data-tool-call-approval');
    assert.equal(approvals.length, 0, 'Native questions must suspend for an answer without an intermediate permission gate.');
    assert.equal(final.pending.length, 0);
    assert.equal(final.execution.outcome, 'completed');
    assert.deepEqual(f.admissions.map(x => x.finishes), [[true]]);
    assert.equal(f.modelCalls.length, 3);
    const outputs = final.messages.flatMap(m => m.parts || []).filter(p => p.type === 'tool-ask_user').map(p => p.output?.content);
    assert.equal(outputs.length, 2);
    assert.ok(outputs[0].includes('First') && outputs[1].includes('Second'));
    return { questions: 2, permissionHops: approvals.length, admissions: 1, modelCalls: f.modelCalls.length, outcome: final.execution.outcome, answersPreserved: true };
  } finally { await f.close(); }
}

async function explicitRules() {
  const f = await fixture();
  try {
    const threadId = 'native-question-explicit-policy';
    await f.memory.createThread({ threadId, resourceId, title: 'Explicit native permissions' });
    const session = await f.service.sessionFor(identity, threadId);
    const tools = async () => session.machinery.buildToolsets(await session.machinery.buildRequestContext(buildConductorContext({ identity, threadId })));
    const allow = await tools();
    const native = allow.controller?.ask_user;
    assert.ok(native, 'Controller must compose the exported native question tool.');
    const context = await session.machinery.buildRequestContext(buildConductorContext({ identity, threadId }));
    const args = { question: 'Choose', options: [{ label: 'First' }] };
    const verdict = (tool, ctx) => tool.requireApproval(args, { requestContext: Object.fromEntries(ctx.entries()) });
    assert.equal(await verdict(native, context), false);
    assert.equal(await native.requireApproval(args, {}), true, 'Missing native policy remains closed.');
    await session.permissions.setForCategory({ category: 'read', policy: 'ask' });
    assert.equal(await verdict((await tools()).controller.ask_user, await session.machinery.buildRequestContext(buildConductorContext({ identity, threadId }))), true);
    await session.permissions.setForTool({ toolName: 'ask_user', policy: 'allow' });
    assert.equal(await verdict((await tools()).controller.ask_user, await session.machinery.buildRequestContext(buildConductorContext({ identity, threadId }))), false);
    await session.permissions.setForTool({ toolName: 'ask_user', policy: 'ask' });
    assert.equal(await verdict((await tools()).controller.ask_user, await session.machinery.buildRequestContext(buildConductorContext({ identity, threadId }))), true);
    await session.permissions.setForTool({ toolName: 'ask_user', policy: 'deny' });
    const denied = await tools();
    assert.ok(!Object.values(denied).some(group => group.ask_user), 'Native tool denial removes the tool from all toolsets.');
    assert.equal(f.modelCalls.length, 0);
    return { defaultAllow: true, categoryAsk: true, toolOverride: true, toolAsk: true, toolDeny: true, unknownClosed: true };
  } finally { await f.close(); }
}

(async () => {
  delete process.env.REDIS_URL;
  process.env.NODE_ENV = 'test';
  process.env.MASTRA_DATABASE_URL = 'memory:question-permission';
  let externalRequests = 0;
  global.fetch = async () => { externalRequests++; throw new Error('No provider HTTP in native question proof'); };
  const questions = await repeated(), permissions = await explicitRules();
  assert.equal(externalRequests, 0);
  console.log(JSON.stringify({ questions, permissions, externalRequests }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
