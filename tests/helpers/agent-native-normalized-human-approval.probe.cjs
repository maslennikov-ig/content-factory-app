'use strict';
const assert = require('node:assert/strict');
const {fixture, identity, org, user, resourceId, human, Response, until} = require('./agent-native-stale-suspension.probe.cjs');
const {loadTypeScriptModule} = require('./load-ts-module.cjs');
const {heygenPersonProfileDecisionContextSchemaV1} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-person-profile.v1.ts');
const {HeygenChatControlsServiceV1} = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-chat-controls.service.v1.ts', {
  '../../content-intelligence/social-factory/autonomy/editorial-decision.service': {EditorialDecisionService: class {}},
});

(async () => {
  process.env.NODE_ENV = 'test'; delete process.env.REDIS_URL;
  let externalRequests = 0, parent, finished = false;
  global.fetch = async () => {externalRequests++; throw new Error('External call forbidden in normalized human approval probe.');};
  const saved = [];
  const profiles = {saveHumanConfirmed: async (organizationId, actorId, profile, decision) => {
    const {catalog, previewMediaBindings = [], ...context} = decision;
    assert.deepEqual(previewMediaBindings, []);
    assert.equal(heygenPersonProfileDecisionContextSchemaV1.safeParse(context).success, true,
      'The actual domain decision schema must accept the native call mapping.');
    saved.push({organizationId, actorId, profile, decision});
    return {profileId: profile.profileId, revision: 1, generationAuthorized: false};
  }};
  const controls = new HeygenChatControlsServiceV1(profiles, {connections: {runtime: {now: () => new Date('2026-01-01T00:00:00Z')}}}, {}, {}, {});
  controls.observed = async () => ({accountDigest: 'a'.repeat(64), accountGeneration: 1,
    catalog: {avatars: [{id: 'look_one', groupId: 'group_one', name: 'Owned studio look'}], voices: [{id: 'voice_one', name: 'Approved original voice'}]}});
  const profile = {profileId: '11111111-1111-4111-8111-111111111111', expectedRevision: 0,
    connectionId: '22222222-2222-4222-8222-222222222222', displayName: 'Approved presenter', aliases: [], preferredForName: false,
    groupIds: ['group_one'], preferredGroupId: 'group_one', sourceLooks: [{groupId: 'group_one', lookId: 'look_one', roles: ['style_base', 'appearance']}],
    preferredSourceLookId: 'look_one', defaultAppearanceLookId: 'look_one',
    defaultVoice: {voiceId: 'voice_one', baseline: {locale: 'ru-RU', speed: 1, pitch: 0, volume: 1}}};
  const proposal = await controls.proposeProfile(identity.organizationId, identity.userId, profile);
  const raw = {profile: {...profile, editorialPersonaId: null, defaultAnimationReferenceLookId: null,
    sourceLooks: profile.sourceLooks.map(look => ({...look, previewMediaId: null})),
    defaultVoice: {...profile.defaultVoice, engine: null, baseline: {...profile.defaultVoice.baseline, engineSettings: null}}},
    selectionDigest: proposal.selectionDigest};
  const rawBefore = JSON.stringify(raw);
  const f = await fixture({serviceOverrides: {HeygenChatControlsServiceV1: controls},
    script: async (_args, number) => number === 1 ? [{type: 'tool-call', toolCallId: 'native-profile-with-null-optionals',
      toolName: 'video_person_profile_save', input: JSON.stringify(raw)}]
      : [{type: 'text-start', id: 'done'}, {type: 'text-delta', id: 'done', delta: 'The profile operation has finished.'}, {type: 'text-end', id: 'done'}]});
  const threadId = 'normalized-human-profile-approval';
  try {
    await f.memory.createThread({threadId, resourceId, title: 'Native nullable human approval'});
    parent = f.handler.chat(org, user, {threadId, messages: [human('profile-human', 'Save this exact approved presenter and voice profile.')]}, new Response())
      .finally(() => {finished = true;});
    void parent.catch(() => undefined);
    await until(async () => (await f.handler.getThread(org, user, threadId)).pending.some(call => call.toolCallId === 'native-profile-with-null-optionals'), 'saved raw-null profile approval');
    const pending = (await f.handler.getThread(org, user, threadId)).pending.find(call => call.toolCallId === 'native-profile-with-null-optionals');
    assert.ok(pending.summary);
    const stored = (await f.agent.listSuspendedRuns({threadId, resourceId})).runs.find(run => run.runId === pending.runId)
      .toolCalls.find(call => call.toolCallId === pending.toolCallId);
    assert.equal(stored.args.profile.defaultVoice.engine, null);
    assert.equal(saved.length, 0, 'No profile is saved before the real card approval.');
    const answer = new Response();
    await f.handler.chat(org, user, {threadId, messages: [{id: 'exact-human-profile-approval', role: 'assistant', parts: [{
      type: 'tool-video_person_profile_save', toolCallId: pending.toolCallId, state: 'approval-responded',
      approval: {id: `${pending.runId}::${pending.toolCallId}`, approved: true},
    }]}]}, answer);
    await parent;
    assert.equal(saved.length, 1, 'Transport success must reach the real capability human guard and save the exact profile once.');
    assert.deepEqual(saved[0].profile, profile);
    assert.equal(saved[0].organizationId, identity.organizationId);
    assert.equal(saved[0].actorId, identity.userId);
    assert.equal(saved[0].decision.source, 'confirmed_chat_action');
    assert.match(saved[0].decision.decisionId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(saved[0].decision.accountDigest, 'a'.repeat(64));
    assert.equal(JSON.stringify(raw), rawBefore);
    assert.equal((await f.handler.getThread(org, user, threadId)).pending.length, 0);
    assert.equal(externalRequests, 0);
    console.log(JSON.stringify({schema: 'native-normalized-human-approval/1', savedExactlyOnce: true, rawOptionalNulls: true,
      normalizedProfileExact: true, identityAndAccountBound: true, humanGuardRetained: true, externalRequests, paidCalls: 0}));
  } finally {
    if (parent && !finished) await f.handler.stopThread(org, user, threadId).catch(() => undefined);
    await f.close(); await parent?.catch(() => undefined);
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
