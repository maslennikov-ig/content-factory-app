'use strict';
const assert = require('node:assert/strict');
const { fixture, org, user, identity, resourceId, human, Response, until } = require('./agent-native-stale-suspension.probe.cjs');
let externalRequests = 0;
global.fetch = async () => { externalRequests++; throw new Error('EXTERNAL_PROVIDER_FORBIDDEN'); };
let postCreates = 0;
const campaign = { id: 'fixture-campaign', mode: 'collaborative', state: 'active', itemIds: [] };
(async () => {
  const f = await fixture({ serviceOverrides: { SocialFactoryService: {
    create: async (_org, input) => { assert.equal(input.allocations[0].format, 'post'); postCreates++; return campaign; },
    detail: async () => ({campaign, items: []}),
  } }, script: async (args, call) => {
    if (call === 1) return [{ type: 'tool-call', toolCallId: 'audience-question', toolName: 'ask_user',
      input: JSON.stringify({ question: 'Кто читатель?', questionPurpose: 'fact', canDecideForPerson: false }) }];
    assert.ok(JSON.stringify(args.prompt).includes('Руководители'));
    if (call === 2) return [{ type: 'tool-call', toolCallId: 'create-selected-post', toolName: 'campaign_create', input: JSON.stringify({
      requestId: 'author-original', name: 'Synthetic post', timeZone: 'Europe/Moscow', startsAt: '2026-11-10', endsAt: '2026-11-11',
      allocations: [{channelId: 'owned-channel', platform: 'telegram', format: 'post', count: 1}],
    }) }];
    return [{ type: 'text-start', id: 'done' }, { type: 'text-delta', id: 'done', delta: 'Сохранено.' }, { type: 'text-end', id: 'done' }];
  } });
  const threadId = 'native-material-format';
  try {
    await f.memory.createThread({ threadId, resourceId, title: 'Synthetic material format' });
    const first = f.handler.chat(org, user, { threadId, messages: [human('author-original',
      'Подготовь черновик, а после согласования сделай пост-приглашение для Telegram.')] }, new Response());
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.length === 1, 'one factual question');
    const pending = (await f.handler.getThread(org, user, threadId)).pending[0];
    await f.handler.chat(org, user, { threadId, runId: pending.runId, toolCallId: pending.toolCallId,
      cardId: pending.suspendPayload.cardId, resumeData: {answer: 'Руководители'} }, new Response());
    await first;
    const done = await f.handler.getThread(org, user, threadId);
    assert.equal(done.execution.outcome, 'completed'); assert.equal(postCreates, 1);
    const admissions = f.admissions.length, calls = f.modelCalls.length;
    await assert.rejects(() => f.handler.chat(org, user, { threadId, continueFromRequestId: 'outdated-request',
      messages: [human('stale-continue', 'Продолжи.')] }, new Response()), error => error.getStatus?.() === 409);
    assert.equal(f.admissions.length, admissions); assert.equal(f.modelCalls.length, calls);
    assert.deepEqual((await f.threads.readNativeRun(identity, threadId)).continuationMaterialContext.materialFormats, ['post']);
    console.log(JSON.stringify({postCreates, modelCalls: calls, factualAnswerPreserved: true, staleBeforeAdmission: true, externalRequests}));
  } finally { await f.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
