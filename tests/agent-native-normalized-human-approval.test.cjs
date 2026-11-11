'use strict';
const path = require('node:path');
const {runProbeProcess} = require('./helpers/native-probe-process.cjs');
const {validateToolInput} = require('@mastra/core/tools');
const {toStandardSchema} = require('@mastra/core/schema');
const {loadRegistry, requestContextFor, servicesFrom, IDENTITY} = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
const capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === 'video.person_profile_save');
const toolName = registry.toolNameOf(capability.id);
const rawProfile = () => ({selectionDigest: 'a'.repeat(64), profile: {
  profileId: '11111111-1111-4111-8111-111111111111', expectedRevision: 0,
  connectionId: '22222222-2222-4222-8222-222222222222', displayName: 'Approved presenter', aliases: [], preferredForName: false,
  editorialPersonaId: null, groupIds: ['group_one'], preferredGroupId: 'group_one',
  sourceLooks: [{groupId: 'group_one', lookId: 'look_one', roles: ['style_base', 'appearance'], previewMediaId: null}],
  preferredSourceLookId: 'look_one', defaultAppearanceLookId: 'look_one', defaultAnimationReferenceLookId: null,
  defaultVoice: {voiceId: 'voice_one', engine: null, baseline: {locale: 'ru-RU', speed: 1, pitch: 0, volume: 1, engineSettings: null}},
}});
const normalized = raw => validateToolInput(toStandardSchema(capability.input), raw).data;
const services = servicesFrom({HeygenChatControlsServiceV1: {proposeProfile: async (_org, _actor, profile) => ({
  profile, selectionDigest: 'a'.repeat(64), name: profile.displayName, voice: {name: profile.defaultVoice.voiceId},
  looks: profile.sourceLooks.map(look => ({name: look.lookId})),
})}});
const gate = {check: async () => ({allowed: true, policies: []})};
const hooks = registry.createCapabilityHooks([capability], gate, services);
const call = (input, requestContext) => ({toolName, input, context: {requestContext, toolCallId: 'exact-native-profile-call'}});
async function approved(raw) {
  const context = requestContextFor(registry, {...IDENTITY, role: 'ADMIN'});
  registry.grantApproval(context, registry.approvalFingerprint(toolName, raw));
  const digest = await registry.approvalContentDigest([capability], services, IDENTITY, toolName, raw);
  registry.grantApproval(context, registry.approvalContentFingerprint(toolName, raw, digest));
  return context;
}

test('actual native raw-null profile approval passes the human guard and saves the normalized profile once', () => {
  const output = runProbeProcess(path.join(__dirname, 'helpers/agent-native-normalized-human-approval.probe.cjs'), [], {timeout: 60_000});
  const line = output.split('\n').find(value => value.startsWith('{"schema":"native-normalized-human-approval/1"'));
  expect(JSON.parse(line)).toMatchObject({savedExactlyOnce: true, rawOptionalNulls: true, normalizedProfileExact: true,
    identityAndAccountBound: true, humanGuardRetained: true, externalRequests: 0, paidCalls: 0});
}, 65_000);

test('normalized execution proof is derived only after exact admission and both representations are spent together', async () => {
  const raw = rawProfile(), parsed = normalized(raw), context = await approved(raw);
  expect(registry.hasApproval(context, registry.approvalFingerprint(toolName, parsed))).toBe(false);
  await expect(hooks.beforeToolCall(call(raw, context))).resolves.toBeUndefined();
  expect(registry.hasApproval(context, registry.approvalFingerprint(toolName, parsed))).toBe(true);
  await hooks.afterToolCall({...call(raw, context), output: {ok: true}});
  for (const input of [raw, parsed]) expect(registry.hasApproval(context, registry.approvalFingerprint(toolName, input))).toBe(false);
  expect((await hooks.beforeToolCall(call(parsed, context))).output.code).toBe('APPROVAL_MISMATCH');
});

test.each(['voice', 'person', 'account'])('changing the approved %s cannot derive a normalized human proof', async field => {
  const raw = rawProfile(), changed = JSON.parse(JSON.stringify(raw)), context = await approved(raw);
  if (field === 'voice') changed.profile.defaultVoice.voiceId = 'different_voice';
  if (field === 'person') changed.profile.displayName = 'Different person';
  if (field === 'account') changed.profile.connectionId = '33333333-3333-4333-8333-333333333333';
  expect(validateToolInput(toStandardSchema(capability.input), changed).error).toBeUndefined();
  expect((await hooks.beforeToolCall(call(changed, context))).output.code).toBe('APPROVAL_MISMATCH');
  expect(registry.hasApproval(context, registry.approvalFingerprint(toolName, normalized(changed)))).toBe(false);
});

test.each(['funding', 'organizationId', 'actorId'])('unknown authority field %s remains invalid even beside an exact raw approval', async key => {
  const raw = {...rawProfile(), [key]: 'foreign-authority'}, context = await approved(raw);
  expect(validateToolInput(toStandardSchema(capability.input), raw).error).toBeDefined();
  expect((await hooks.beforeToolCall(call(raw, context))).output.code).toBe('CAPABILITY_INPUT_INVALID');
});

test('a current door denial grants no normalized human authority', async () => {
  const raw = rawProfile(), context = await approved(raw);
  const denied = registry.createCapabilityHooks([capability], {check: async () => ({allowed: false, refused: 'Edit Posts'})}, services);
  expect((await denied.beforeToolCall(call(raw, context))).output.code).toBe('PERMISSION_DENIED');
  expect(registry.hasApproval(context, registry.approvalFingerprint(toolName, normalized(raw)))).toBe(false);
});

test('historical normalized approvals retain their exact admission and single-use behavior', async () => {
  const input = normalized(rawProfile()), context = await approved(input);
  await expect(hooks.beforeToolCall(call(input, context))).resolves.toBeUndefined();
  await hooks.afterToolCall({...call(input, context), output: {ok: true}});
  expect((await hooks.beforeToolCall(call(input, context))).output.code).toBe('APPROVAL_MISMATCH');
});
