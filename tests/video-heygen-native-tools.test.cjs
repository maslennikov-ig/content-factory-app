const {randomUUID} = require('node:crypto');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const helper = require('./helpers/agent-capabilities.cjs');
const {RequestContext, MASTRA_THREAD_ID_KEY} = require('@mastra/core/request-context');
const ROOT = 'libraries/nestjs-libraries/src/videos/subscriptions/';
const fakeProofs = {human: jest.fn(value => value), native: jest.fn((scope, value) => ({...scope, ...value})), original: jest.fn(value => value), style: jest.fn(value => value)};
const facadeModule = load(`${ROOT}video-heygen-style-voice.service.v1.ts`, {
  './video-heygen-style.service.v1': {HeygenStyleServiceV1: class {}},
  './video-heygen-voice-setup.service.v1': {HeygenVoiceSetupServiceV1: class {}},
  './video-heygen-creative-adapter.v1': {HeygenCreativeAdapterV1: class {}, heygenCreativeHumanDecisionProofV1: fakeProofs.human,
    heygenCreativeNativeApprovalProofV1: fakeProofs.native, heygenCreativeOriginalRecordingProofV1: fakeProofs.original,
    heygenCreativeStyleApprovalProofV1: fakeProofs.style},
});
const mocks = {'../../../videos/subscriptions/video-heygen-style-voice.service.v1': facadeModule};
const caps = helper.loadCapabilityModule('catalogue/video-heygen-style-voice.capabilities.v1.ts', {mocks});
test('all style and voice declarations satisfy the native startup input contract', () => {
  const {assertCapabilityInput} = helper.loadCapabilityModule('capability.input-guards.ts');
  for (const capability of caps.HEYGEN_STYLE_VOICE_CAPABILITIES_V1) expect(() => assertCapabilityInput(capability)).not.toThrow();
});
const context = helper.loadCapabilityModule('capability.context.ts');
const {approvalFingerprint} = helper.loadCapabilityModule('approval-fingerprint.ts');
const {toolNameOf} = helper.loadCapabilityModule('capability.types.ts');
const identity = {organizationId: 'workspace-a', userId: 'person-a', organizationCreatedAt: '2026-01-01T00:00:00Z', role: 'EDITOR', language: 'ru', timeZone: 'Europe/Moscow'};
const OP = randomUUID(), SETUP = randomUUID(), MEDIA = randomUUID(), CONNECTION = randomUUID(), PROFILE = randomUUID();
const HASH = 'a'.repeat(64), ACCOUNT = 'b'.repeat(64);
const {subscriptionHash} = load(`${ROOT}video-provider-registry.ts`);
const styleInput = {operationId: OP, expectedRevision: 1, requestHash: HASH};
const voiceInput = {setupId: SETUP, operationId: OP, requestHash: HASH};
const intakeInput = {setupId: SETUP, connectionId: CONNECTION, intent: 'narrator', audition: {text: 'Здравствуйте, это мой голос.', locale: 'ru-RU'}};
const selectionInput = {setupId: SETUP, expectedRevision: 1, decision: 'reject_all'};
const styleView = (extra = {}) => ({version: 1, operationId: OP, revision: 1, name: 'Business studio look', connectionId: CONNECTION, requestHash: HASH,
  profileId: PROFILE, profileRevision: 1, profileDigest: HASH, groupId: 'group-a', baseLookId: 'base-a', referenceMediaIds: [],
  prompt: 'Preserve the same person. Use a navy suit and a neutral studio background.', aspectRatio: '9:16', state: 'prepared', blockers: [],
  attempted: false, actualCost: null, resultKind: 'image', completedCount: 0, failedCount: 0, children: [], ...extra});
const voiceView = (extra = {}) => ({setupId: SETUP, revision: 1, intent: 'narrator', candidates: [], operations: [], blockers: [], generationAuthorized: false, ...extra});
const scope = {organizationId: identity.organizationId, actorId: identity.userId, connectionId: CONNECTION, subjectDigest: ACCOUNT, accountGeneration: 3, setupId: SETUP};
function fixture() {
  let style = styleView();
  const styles = {prepare: jest.fn(async () => style), read: jest.fn(async () => style), recover: jest.fn(async () => style),
    selectOwnedPreview: jest.fn(async () => style), profiles: {read: jest.fn(async () => ({displayName: 'Илья', observations: {looks: [{lookId: 'base-a', groupId: 'group-a', name: 'Исходный образ в самолёте'}]}}))},
    submit: jest.fn(async (_org, _actor, _id, authorize) => {await authorize({organizationId: identity.organizationId, actorId: identity.userId,
      operationId: OP, connectionId: CONNECTION, accountDigest: ACCOUNT, accountGeneration: 3, requestHash: HASH, args: {avatarId: 'base-a', avatarGroupId: 'group-a'}}); return style;})};
  const proposed = {input: intakeInput, scope, approvedDigest: HASH, review: {setupId: SETUP, intent: 'narrator', audition: intakeInput.audition, generationAuthorized: false}};
  const voices = {proposeIntake: jest.fn(async () => proposed), intake: jest.fn(async () => voiceView()), read: jest.fn(async () => voiceView()),
    prepareAuditions: jest.fn(async () => voiceView()), prepareClone: jest.fn(async () => voiceView()), recover: jest.fn(async () => voiceView()),
    operationApproval: jest.fn(async () => ({scope, approvedDigest: HASH, operation: {requestHash: HASH, operationId: OP, arguments: {private_asset: 'not-a-review-field'}},
      review: {setupId: SETUP, operationId: OP, operation: 'create_speech', candidateName: 'Голос Ильи', audition: intakeInput.audition, allowedAttempts: 1, cost: null, costStatus: 'unknown', generationAuthorized: false}})),
    execute: jest.fn(async () => voiceView({operations: [{operationId: OP, state: 'prepared'}]})),
    proposeSelection: jest.fn(async () => ({scope, approvedDigest: HASH, review: {setupId: SETUP, decision: 'reject_all', candidateCount: 2, generationAuthorized: false}})),
    selectHumanConfirmed: jest.fn(async () => voiceView({selection: {decision: 'reject_all'}}))};
  const creative = {styleAdapter: {}, voiceAdapter: {}, authorizeStyle: jest.fn(async (_context, proof) => proof), registerOriginalRecording: jest.fn()};
  const facade = new facadeModule.HeygenStyleVoiceServiceV1(styles, voices, creative);
  const service = jest.fn(() => facade);
  const ctx = { ...identity, entrance: 'chat', requestContext: new RequestContext(), nativeToolCallId: 'tool-call-a', service};
  ctx.requestContext.set(MASTRA_THREAD_ID_KEY, 'owned-native-thread');
  const approve = (cap, input) => context.grantApproval(ctx.requestContext, approvalFingerprint(toolNameOf(cap.id), input));
  return {styles, voices, creative, facade, ctx, approve, proposed, setStyle: value => {style = value;}};
}
beforeEach(() => jest.clearAllMocks());

async function existingProfile() {
  const profileContract = load(`${ROOT}video-heygen-person-profile.v1.ts`);
  const {decodeHeygenOwnedCatalogV1} = load(`${ROOT}video-heygen-owned-catalog.v1.ts`);
  const {HeygenPersonProfileServiceV1} = load(`${ROOT}video-heygen-person-profile.service.v1.ts`, {
    '../../content-intelligence/social-factory/social-factory.repository': {SocialFactoryRepository: class {}}, './video-connection.service': {VideoConnectionService: class {}},
  });
  const rows = new Map(); let serial = Promise.resolve();
  const key = (org, kind, id) => JSON.stringify([org, kind, id]);
  const store = {
    read: async (org, kind, id) => structuredClone(rows.get(key(org, kind, id)) ?? null),
    put: async input => {
      const k = key(input.organizationId, input.kind, input.id), prior = rows.get(k);
      if ((prior?.revision ?? 0) !== input.expectedRevision) throw new Error('CAS conflict');
      if (prior && input.kind === 'decision') throw new Error('immutable decision');
      const row = {...input, revision: input.expectedRevision + 1, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, invalidatedAt: null, expiresAt: null};
      rows.set(k, structuredClone(row)); return structuredClone(row);
    },
    transact: work => {const run = serial.then(() => work(store)); serial = run.catch(() => {}); return run;},
  };
  const connection = {ownerId: identity.userId, provider: 'heygen', state: 'connected', walletDigest: ACCOUNT, generation: 3};
  const connections = {repository: {member: async (org, actor) => {if (org !== identity.organizationId || actor !== identity.userId) throw new Error('not member');},
    connection: async () => connection, db: {media: {findFirst: async () => ({id: MEDIA})}}}};
  const profiles = new HeygenPersonProfileServiceV1(store, connections);
  const catalog = decodeHeygenOwnedCatalogV1({groups: [{id: 'group-a', name: 'Ilya', status: 'completed', type: 'digital_twin', consent_status: 'accepted'}],
    looks: [{id: 'base-a', group_id: 'group-a', name: 'Original airplane', status: 'completed', avatar_type: 'digital_twin', supported_api_engines: ['avatar_iv']},
      {id: 'motion-a', group_id: 'group-a', name: 'Original motion', status: 'completed', avatar_type: 'digital_twin', supported_api_engines: ['avatar_v']}],
    voices: [{voice_id: 'old-voice', name: 'Original voice', language: 'Russian', type: 'private'}, {voice_id: 'selected-voice', name: 'Selected actual voice', language: 'Russian', type: 'private'}]}, {includeIdentityMetadata: true}).catalog;
  const input = {profileId: PROFILE, expectedRevision: 0, connectionId: CONNECTION, displayName: 'Илья', aliases: ['Ilya'], preferredForName: true,
    groupIds: ['group-a'], preferredGroupId: 'group-a', sourceLooks: [{groupId: 'group-a', lookId: 'base-a', roles: ['style_base', 'appearance'], previewMediaId: MEDIA},
      {groupId: 'group-a', lookId: 'motion-a', roles: ['appearance', 'animation_reference']}], preferredSourceLookId: 'base-a', defaultAppearanceLookId: 'base-a', defaultAnimationReferenceLookId: 'motion-a',
    defaultVoice: {voiceId: 'old-voice', engine: 'starfish', baseline: {locale: 'ru-RU', speed: 1}}};
  const observed = {catalog, accountDigest: ACCOUNT, accountGeneration: 3};
  const original = await profiles.saveHumanConfirmed(identity.organizationId, identity.userId, input, {...observed, decisionId: randomUUID(), source: 'confirmed_chat_action',
    observedAt: new Date().toISOString(), approvedDigest: profileContract.heygenPersonProfileApprovalDigestV1(identity.organizationId, identity.userId, input, ACCOUNT),
    previewMediaBindings: [{groupId: 'group-a', lookId: 'base-a', mediaId: MEDIA}]});
  return {profiles, original, input, observed};
}

test('protected native identity/voice/spending calls reject forged expert or confirmed flags before proof minting', async () => {
  const f = fixture();
  for (const [cap, input] of [[caps.videoHeygenStyleSubmit, styleInput], [caps.videoHeygenVoiceExecute, voiceInput], [caps.videoHeygenVoiceIntake, intakeInput], [caps.videoHeygenVoiceSelect, selectionInput]]) {
    await expect(cap.run({...f.ctx, confirmed: true, expertApproved: true}, input)).rejects.toMatchObject({code: 'VIDEO_HUMAN_DECISION_REQUIRED'});
    f.approve(cap, {...input, forged: true});
    await expect(cap.run(f.ctx, input)).rejects.toMatchObject({code: 'VIDEO_HUMAN_DECISION_REQUIRED'});
    expect(cap.input.safeParse({...input, proof: {humanApproved: true}, accountDigest: ACCOUNT}).success).toBe(false);
  }
  expect(f.ctx.service).not.toHaveBeenCalled(); expect(fakeProofs.human).not.toHaveBeenCalled(); expect(fakeProofs.native).not.toHaveBeenCalled(); expect(f.styles.submit).not.toHaveBeenCalled();
});

test('real exact native fingerprint and owned thread mint bound action, while missing thread and changed arguments refuse', async () => {
  const f = fixture(); f.approve(caps.videoHeygenStyleSubmit, styleInput);
  f.ctx.requestContext.set(MASTRA_THREAD_ID_KEY, '');
  await expect(caps.videoHeygenStyleSubmit.run(f.ctx, styleInput)).rejects.toMatchObject({code: 'VIDEO_CHAT_CONTEXT_REQUIRED'});
  f.ctx.requestContext.set(MASTRA_THREAD_ID_KEY, 'owned-native-thread');
  await expect(caps.videoHeygenStyleSubmit.run(f.ctx, {...styleInput, requestHash: 'c'.repeat(64)})).rejects.toMatchObject({code: 'VIDEO_HUMAN_DECISION_REQUIRED'});
  const output = await caps.videoHeygenStyleSubmit.run(f.ctx, styleInput);
  expect(output.artifact).toEqual({kind: 'heygen_style_operation', id: OP, name: 'Business studio look', reopenTool: 'video.heygen_style_status'});
  expect(f.creative.authorizeStyle.mock.calls[0][1]).toMatchObject({organizationId: identity.organizationId, actorId: identity.userId, operationId: OP,
    requestHash: HASH, accountDigest: ACCOUNT, funding: 'personal_subscription', scopeId: approvalFingerprint(toolNameOf(caps.videoHeygenStyleSubmit.id), styleInput)});
  expect(f.styles.submit).toHaveBeenCalledTimes(1);
});

test('MCP requires actual confirmation-code context; native chat never accepts its confirmed flag', async () => {
  const f = fixture();
  await expect(caps.videoHeygenStyleSubmit.run({...f.ctx, entrance: 'mcp'}, styleInput)).rejects.toMatchObject({name: 'ConfirmationNeeded'});
  expect(f.styles.submit).not.toHaveBeenCalled();
  await caps.videoHeygenStyleSubmit.run({...f.ctx, entrance: 'mcp', confirmed: true}, styleInput);
  expect(f.styles.submit).toHaveBeenCalledTimes(1);
  expect(caps.videoHeygenStyleSubmit.mcpConfirm).toBe('ask'); expect(caps.videoHeygenVoiceIntake.mcpConfirm).toBe('ask');
});

test('real source, English prompt and unknown debit are shown on paid card; reviews expose no private proposal scope', async () => {
  const f = fixture();
  const line = await caps.videoHeygenStyleSubmit.describeApproval(f.ctx, styleInput);
  expect(line).toContain('Исходный образ в самолёте'); expect(line).toContain(styleView().prompt); expect(line).toContain('точная стоимость неизвестна'); expect(line).toContain('изображение');
  const voice = await caps.videoHeygenVoiceExecute.describeApproval(f.ctx, voiceInput);
  expect(voice).toContain('Здравствуйте, это мой голос.'); expect(voice).toContain('ru-RU'); expect(voice).toContain('одна попытка');
  const review = await caps.videoHeygenVoiceExecute.approvalContent(f.ctx, voiceInput);
  expect(JSON.stringify(review)).not.toMatch(/subjectDigest|accountGeneration|private_asset|scope|approvedDigest/);
  expect(review.requestHash).toBe(HASH);
});

test('facade rejects deserialized human actions, absent adapter and stale immutable request before effects', async () => {
  const f = fixture(), action = facadeModule.heygenStyleVoiceHumanActionV1({organizationId: identity.organizationId, actorId: identity.userId,
    source: 'confirmed_chat_action', toolId: 'video.heygen_style_submit', input: styleInput, approvalFingerprint: 'exact-human-fingerprint', threadId: 'owned-native-thread'});
  await expect(f.facade.styleSubmit(identity.organizationId, identity.userId, styleInput, {...action})).rejects.toMatchObject({response: {code: 'VIDEO_HUMAN_DECISION_REQUIRED'}});
  const absent = new facadeModule.HeygenStyleVoiceServiceV1(f.styles, f.voices);
  await expect(absent.voiceStatus(identity.organizationId, identity.userId, SETUP)).rejects.toMatchObject({response: {code: 'VIDEO_CREATIVE_ADAPTER_UNAVAILABLE'}});
  await expect(caps.videoHeygenVoiceStatus.run({...f.ctx, service: () => absent}, {setupId: SETUP})).rejects.toMatchObject({code: 'VIDEO_CREATIVE_ADAPTER_UNAVAILABLE'});
  await expect(absent.styleSubmit(identity.organizationId, identity.userId, styleInput, action)).rejects.toMatchObject({response: {code: 'VIDEO_CREATIVE_ADAPTER_UNAVAILABLE'}});
  f.setStyle(styleView({revision: 2}));
  await expect(f.facade.styleSubmit(identity.organizationId, identity.userId, styleInput, action)).rejects.toMatchObject({response: {code: 'VIDEO_STYLE_OPERATION_CHANGED'}});
  expect(f.styles.submit).not.toHaveBeenCalled();
});

test('human voice intent/selection proofs are minted only after confirmation; original declaration binds actual source bytes', async () => {
  const f = fixture(), input = {...intakeInput, originalMediaId: MEDIA}; f.approve(caps.videoHeygenVoiceIntake, input);
  const original = {mediaId: MEDIA, contentDigest: HASH, label: 'Original recording', playable: true, mimeType: 'audio/mpeg'};
  f.proposed.original = original;
  await caps.videoHeygenVoiceIntake.run(f.ctx, input);
  expect(f.creative.registerOriginalRecording.mock.calls[0]).toEqual([scope, MEDIA, expect.objectContaining({mediaId: MEDIA, contentDigest: HASH,
    accountGeneration: 3, subjectDigest: ACCOUNT, approvedDigest: HASH})]);
  expect(f.voices.intake.mock.calls[0][4]).toMatchObject({organizationId: identity.organizationId, actorId: identity.userId, approvedDigest: HASH, source: 'confirmed_chat_action'});
  f.approve(caps.videoHeygenVoiceSelect, selectionInput); const selected = await caps.videoHeygenVoiceSelect.run(f.ctx, selectionInput);
  expect(selected.selection.decision).toBe('reject_all'); expect(f.voices.selectHumanConfirmed).toHaveBeenCalledTimes(1);
  expect(fakeProofs.human).toHaveBeenCalledTimes(2);
});

test('Media cards contain only actual saved images/playable audio; operation/setup UUIDs remain labelled artifacts', async () => {
  const prepared = styleView(); expect(caps.videoHeygenStylePrepare.cardOf(prepared)).toBeNull();
  const saved = styleView({children: [{lookId: 'child-a', state: 'saved', mediaId: MEDIA, mimeType: 'image/png'}, {lookId: 'child-b', state: 'queued', mediaId: OP, mimeType: 'image/png'}]});
  expect(caps.videoHeygenStyleStatus.cardOf(saved)).toEqual({kind: 'media', id: 'library', mediaId: MEDIA, mediaIds: [MEDIA]});
  const voice = voiceView({candidates: [{candidateId: OP, state: 'ready', audio: {mediaId: MEDIA, mimeType: 'audio/mpeg', playable: true}},
    {candidateId: randomUUID(), state: 'prepared', audio: {mediaId: SETUP, mimeType: 'audio/mpeg', playable: true}}]});
  expect(caps.videoHeygenVoiceStatus.cardOf(voice).mediaIds).toEqual([MEDIA]);
  expect(caps.videoHeygenVoiceStatus.cardOf(voiceView({operations: [{operationId: OP, state: 'completed'}]}))).toBeNull();
  const f = fixture(); const output = await caps.videoHeygenVoiceStatus.run(f.ctx, {setupId: SETUP});
  expect(output.artifact).toEqual({kind: 'heygen_voice_setup', id: SETUP, name: 'Voice setup', reopenTool: 'video.heygen_voice_status'});
});

test('exact new paid operations receive content digests and saved edits change them; unrelated paid tools are not promoted', async () => {
  const f = fixture(), summary = helper.loadCapabilityModule('approval-summary.ts');
  for (const [cap, input] of [[caps.videoHeygenStyleSubmit, styleInput], [caps.videoHeygenVoiceExecute, voiceInput]]) {
    expect(cap.risk).toBe('paid'); expect(cap.asksInWebChat).toBe(true);
    const before = await summary.approvalContentDigest([cap], f.ctx.service, identity, toolNameOf(cap.id), input);
    expect(before).toMatch(/^[a-f0-9]{64}$/);
    if (cap === caps.videoHeygenStyleSubmit) f.setStyle(styleView({prompt: 'Preserve the person. Use a different outfit.'}));
    else f.voices.operationApproval.mockImplementationOnce(async () => ({scope, operation: {requestHash: HASH}, review: {candidateName: 'Changed real voice'}}));
    const after = await summary.approvalContentDigest([cap], f.ctx.service, identity, toolNameOf(cap.id), input); expect(after).not.toBe(before);
    const unrelated = {...cap, id: 'video.unreviewed_other_paid'};
    expect(await summary.approvalContentDigest([unrelated], f.ctx.service, identity, toolNameOf(unrelated.id), input)).toBeNull();
  }
});

test('all new screen doors require editor Create and status/recovery reads prohibit caching', () => {
  const {doorsWithPolicies} = require('./helpers/backend-doors.cjs');
  const doors = doorsWithPolicies({all: true}).filter(door => door.file.endsWith('/video-heygen-style-voice.controller.v1.ts'));
  expect(doors).toHaveLength(13);
  for (const door of doors) expect(door.policies).toEqual([['Create', 'EDITOR']]);
  const source = require('node:fs').readFileSync('apps/backend/src/api/routes/video-heygen-style-voice.controller.v1.ts', 'utf8');
  expect(source.match(/@Header\('Cache-Control', 'private, no-store'\)/g)).toHaveLength(4);
  expect(caps.HEYGEN_STYLE_VOICE_CAPABILITIES_V1).toHaveLength(13);
});

test('registry accepts only the two exact new paid approval tools and still rejects unrelated paid promotion', () => {
  const registry = helper.loadCapabilityModule('capability.registry.ts', {mocks});
  expect(() => registry.assertCapabilityRegistry(caps.HEYGEN_STYLE_VOICE_CAPABILITIES_V1)).not.toThrow();
  expect(() => registry.assertCapabilityRegistry([{...caps.videoHeygenStyleSubmit, id: 'video.other_unreviewed_paid'}])).toThrow(/only a write capability/);
});

test('same-size source or candidate content changes alter human review digests while raw account stays private', async () => {
  const f = fixture(), summary = helper.loadCapabilityModule('approval-summary.ts');
  const cap = caps.videoHeygenVoiceIntake;
  const before = await summary.approvalContentDigest([cap], f.ctx.service, identity, toolNameOf(cap.id), intakeInput);
  f.proposed.approvedDigest = 'c'.repeat(64);
  const after = await summary.approvalContentDigest([cap], f.ctx.service, identity, toolNameOf(cap.id), intakeInput);
  expect(after).not.toBe(before);
  expect(JSON.stringify(await cap.approvalContent(f.ctx, intakeInput))).not.toMatch(/subjectDigest|accountGeneration|approvedDigest/);
});

test('actual human voice selection updates only existing profile voice defaults and is reused by the next frozen recipe', async () => {
  const f = fixture(), p = await existingProfile(); f.styles.profiles = p.profiles;
  const selected = voiceView({connectionId: CONNECTION, profileId: PROFILE, selection: {decisionId: randomUUID(), decision: 'select'}});
  const choice = {setupId: SETUP, connectionId: CONNECTION, profileId: PROFILE, decisionId: selected.selection.decisionId,
    profileTarget: {profileId: PROFILE, priorVoiceHash: subscriptionHash(p.original.defaultVoice)},
    decisionSource: 'confirmed_chat_action', selectedAt: new Date().toISOString(), sourceMode: 'text', voiceId: 'selected-voice', engine: 'elevenlabs',
    baseline: {locale: 'ru-RU', speed: 1.1, engineSettings: {engine_type: 'elevenlabs', model: 'eleven_multilingual_v2'}}};
  f.voices.selectedVoice = jest.fn(async () => choice); f.voices.selectHumanConfirmed.mockResolvedValue(selected); f.voices.read.mockResolvedValue(selected);
  f.creative.readProfileCatalog = jest.fn(async () => p.observed);
  f.voices.proposeSelection.mockResolvedValue({scope, approvedDigest: HASH, review: {setupId: SETUP, profileId: PROFILE, decision: 'select', candidate: {name: 'Selected actual voice', origin: 'approved_existing'}}});
  const input = {...selectionInput, decision: 'select', candidateId: randomUUID(), candidateRevision: 2}; f.approve(caps.videoHeygenVoiceSelect, input);
  expect(await caps.videoHeygenVoiceSelect.describeApproval(f.ctx, input)).toContain('для будущих роликов ведущего «Илья»');
  const result = await caps.videoHeygenVoiceSelect.run(f.ctx, input);
  expect(result.profileApplication).toMatchObject({state: 'applied', profileId: PROFILE, profileRevision: 2});
  const current = await p.profiles.read(identity.organizationId, identity.userId, PROFILE);
  for (const field of ['displayName', 'aliases', 'preferredForName', 'groupIds', 'preferredGroupId', 'sourceLooks', 'preferredSourceLookId', 'defaultAppearanceLookId', 'defaultAnimationReferenceLookId'])
    expect(current[field]).toEqual(p.original[field]);
  expect(current.defaultVoice).toEqual({voiceId: 'selected-voice', engine: 'elevenlabs', baseline: choice.baseline});
  expect(await p.profiles.freeze(identity.organizationId, identity.userId, {connectionId: CONNECTION, profileId: PROFILE})).toMatchObject({
    baseLookId: 'base-a', appearanceLookId: 'base-a', animationReferenceLookId: 'motion-a', voiceId: 'selected-voice', voiceEngine: 'elevenlabs', voiceBaseline: choice.baseline});
  const retry = await f.facade.applySelectedVoice(identity.organizationId, identity.userId, SETUP);
  expect(retry.profileApplication.profileRevision).toBe(2); expect(f.voices.selectHumanConfirmed).toHaveBeenCalledTimes(1); expect(f.voices.execute).not.toHaveBeenCalled();
});

test('profile CAS refusal retains actual human selection and local apply retry needs no new choice or voice effect', async () => {
  const f = fixture(), p = await existingProfile(); f.styles.profiles = p.profiles;
  const selected = voiceView({connectionId: CONNECTION, profileId: PROFILE, selection: {decisionId: randomUUID(), decision: 'select'}});
  f.voices.selectHumanConfirmed.mockResolvedValue(selected); f.voices.read.mockResolvedValue(selected);
  f.voices.selectedVoice = jest.fn(async () => ({connectionId: CONNECTION, profileId: PROFILE, decisionId: selected.selection.decisionId,
    profileTarget: {profileId: PROFILE, priorVoiceHash: subscriptionHash(p.original.defaultVoice)},
    decisionSource: 'confirmed_chat_action', selectedAt: new Date().toISOString(), sourceMode: 'text', voiceId: 'selected-voice', engine: 'starfish', baseline: {locale: 'ru-RU', speed: 1}}));
  f.creative.readProfileCatalog = jest.fn(async () => p.observed);
  const save = p.profiles.saveHumanConfirmed.bind(p.profiles);
  p.profiles.saveHumanConfirmed = jest.fn().mockRejectedValueOnce(Object.assign(new Error(), {getResponse: () => ({code: 'VIDEO_PROFILE_CHANGED'})})).mockImplementation(save);
  const input = {...selectionInput, decision: 'select', candidateId: randomUUID(), candidateRevision: 2}; f.approve(caps.videoHeygenVoiceSelect, input);
  const pending = await caps.videoHeygenVoiceSelect.run(f.ctx, input);
  expect(pending.selection).toEqual(selected.selection); expect(pending.profileApplication).toMatchObject({state: 'pending', blocker: 'VIDEO_PROFILE_CHANGED', retryTool: 'video.heygen_voice_apply_selected'});
  const applied = await caps.videoHeygenVoiceApplySelected.run(f.ctx, {setupId: SETUP}); expect(applied.profileApplication.state).toBe('applied');
  expect(f.voices.selectHumanConfirmed).toHaveBeenCalledTimes(1); expect(f.voices.prepareAuditions).not.toHaveBeenCalled(); expect(f.voices.execute).not.toHaveBeenCalled();
});

test('direct recorded speech never becomes a cloned voice or silently replaces an existing profile voice', async () => {
  const f = fixture(), p = await existingProfile(); f.styles.profiles = p.profiles;
  f.voices.read.mockResolvedValue(voiceView({connectionId: CONNECTION, profileId: PROFILE, selection: {decision: 'select'}}));
  f.voices.selectedVoice = jest.fn(async () => ({sourceMode: 'audio_asset', originalMediaId: MEDIA, contentDigest: HASH}));
  const result = await f.facade.applySelectedVoice(identity.organizationId, identity.userId, SETUP);
  expect(result.profileApplication.state).toBe('recorded_audio_retained');
  expect((await p.profiles.read(identity.organizationId, identity.userId, PROFILE)).defaultVoice).toEqual(p.original.defaultVoice);
  expect(f.creative.readProfileCatalog).toBeUndefined();
});

test('retrying an older saved choice cannot overwrite a newer human profile voice/default edit', async () => {
  const f = fixture(), p = await existingProfile(); f.styles.profiles = p.profiles;
  f.voices.read.mockResolvedValue(voiceView({connectionId: CONNECTION, profileId: PROFILE, selection: {decision: 'select'}}));
  f.voices.selectedVoice = jest.fn(async () => ({connectionId: CONNECTION, profileId: PROFILE, decisionId: randomUUID(), decisionSource: 'confirmed_chat_action', selectedAt: new Date().toISOString(),
    sourceMode: 'text', voiceId: 'selected-voice', engine: 'starfish', baseline: {locale: 'ru-RU', speed: 1}, profileTarget: {profileId: PROFILE, priorVoiceHash: subscriptionHash(p.original.defaultVoice)}}));
  f.creative.readProfileCatalog = jest.fn(async () => p.observed);
  const edited = {...p.input, expectedRevision: 1, defaultVoice: {...p.input.defaultVoice, baseline: {locale: 'ru-RU', speed: 1.2}}};
  const {heygenPersonProfileApprovalDigestV1} = load(`${ROOT}video-heygen-person-profile.v1.ts`);
  await p.profiles.saveHumanConfirmed(identity.organizationId, identity.userId, edited, {...p.observed, decisionId: randomUUID(), source: 'authenticated_screen_action',
    approvedDigest: heygenPersonProfileApprovalDigestV1(identity.organizationId, identity.userId, edited, ACCOUNT), observedAt: new Date().toISOString(),
    previewMediaBindings: [{groupId: 'group-a', lookId: 'base-a', mediaId: MEDIA}]});
  const result = await f.facade.applySelectedVoice(identity.organizationId, identity.userId, SETUP);
  expect(result.profileApplication).toMatchObject({state: 'pending', blocker: 'VIDEO_PROFILE_VOICE_CHANGED'});
  const current = await p.profiles.read(identity.organizationId, identity.userId, PROFILE);
  expect(current.revision).toBe(2); expect(current.defaultVoice).toEqual(edited.defaultVoice);
  expect(f.voices.execute).not.toHaveBeenCalled(); expect(f.voices.selectHumanConfirmed).not.toHaveBeenCalled();
});
