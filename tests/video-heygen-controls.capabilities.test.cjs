const {z} = require('zod');
const {randomUUID} = require('node:crypto');
const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/';
const {approvalFingerprint} = load(`${ROOT}chat/capabilities/approval-fingerprint.ts`);
const {MASTRA_THREAD_ID_KEY} = require('@mastra/core/request-context');
const facade = load(`${ROOT}videos/subscriptions/video-heygen-chat-controls.service.v1.ts`, {
  '../video-access.service': {VideoAccessService: class {}},
  '../../content-intelligence/social-factory/autonomy/editorial-decision.service': {EditorialDecisionService: class {}},
});
const caps = load(`${ROOT}chat/capabilities/catalogue/video-heygen-controls.capabilities.v2.ts`, {
  '@contentfactory/backend/api/routes/video-access.controller': {VideoAccessController: class {}},
  '@contentfactory/backend/api/routes/video-heygen-controls.controller.v2': {VideoHeygenControlsControllerV2: class {}},
  '../../../videos/subscriptions/video-heygen-chat-controls.service.v1': facade,
});
test('every registered profile/settings/scope input passes the native startup contract without rewriting approvals', () => {
  const {assertCapabilityInput} = load(`${ROOT}chat/capabilities/capability.input-guards.ts`);
  for (const capability of caps.HEYGEN_CHAT_CONTROLS_CAPABILITIES_V2) expect(() => assertCapabilityInput(capability)).not.toThrow();
});
function context(values = {}, service = {}) {
  const map = new Map(Object.entries(values));
  return {organizationId: 'org', userId: 'actor', language: 'ru', entrance: 'chat', nativeToolCallId: randomUUID(),
    requestContext: {get: key => map.get(key), set: (key, value) => map.set(key, value)}, service: () => service};
}
test('profile identity and voice cannot be saved by an executor/expert or a forged resume in either chat mode', async () => {
  const input = {profile: {}, selectionDigest: 'a'.repeat(64)}, saveProfile = jest.fn();
  for (const mode of ['collaborative', 'autopilot']) {
    const ctx = {...context({'cf.chatMode': mode}, {saveProfile}), confirmed: true, resumeData: {approved: true, origin: 'expert'}};
    expect(() => caps.videoPersonProfileSave.run(ctx, input)).toThrow();
  }
  expect(saveProfile).not.toHaveBeenCalled();
  expect(caps.videoPersonProfileSave.input.safeParse({...input, humanApproved: true}).success).toBe(false);
});
test('only exact native human arguments enter the profile-save boundary; changing the voice invalidates that approval', async () => {
  const input = {profile: {defaultVoice: {voiceId: 'selected'}}, selectionDigest: 'a'.repeat(64)};
  const saveProfile = jest.fn(async () => ({profileId: 'saved'}));
  const ctx = context({'cf.approvals': approvalFingerprint('video_person_profile_save', input)}, {saveProfile});
  await expect(caps.videoPersonProfileSave.run(ctx, input)).resolves.toEqual({profileId: 'saved'});
  expect(saveProfile).toHaveBeenCalledWith('org', 'actor', input, 'confirmed_chat_action', ctx.nativeToolCallId);
  expect(() => caps.videoPersonProfileSave.run(ctx, {...input, profile: {defaultVoice: {voiceId: 'substitute'}}})).toThrow();
  expect(saveProfile).toHaveBeenCalledTimes(1);
});
test('a mode preference and model-selected thread never supply standalone spending authority', async () => {
  const input = {scopeId: randomUUID(), preflightId: randomUUID()}, launchScoped = jest.fn(async () => ({id: 'job'}));
  expect(() => caps.videoHeygenScopedLaunch.run(context({'cf.chatMode': 'collaborative', [MASTRA_THREAD_ID_KEY]: 'owned'}, {launchScoped}), input)).toThrow();
  expect(() => caps.videoHeygenScopedLaunch.run(context({'cf.chatMode': 'autopilot'}, {launchScoped}), input)).toThrow();
  expect(launchScoped).not.toHaveBeenCalled();
  await caps.videoHeygenScopedLaunch.run(context({'cf.chatMode': 'autopilot', [MASTRA_THREAD_ID_KEY]: 'owned'}, {launchScoped}), input);
  expect(launchScoped).toHaveBeenCalledWith('org', 'actor', 'owned', input.scopeId, input.preflightId);
  expect(caps.videoHeygenScopedLaunch.input.safeParse({...input, threadId: 'foreign', bypassApproval: true}).success).toBe(false);
});
test('bounded scope confirmation exposes actual presenter/source and honest unknown video and expert debit', async () => {
  const input = {maxJobs: 2, maxExpertCalls: 1, expiresAt: '2040-01-01T00:00:00Z'};
  const previewScope = jest.fn(async () => ({source: {title: 'Саммит'}, presenter: 'Илья', voice: 'Выбранный голос'}));
  const text = await caps.videoHeygenScope.describeApproval(context({}, {previewScope}), input);
  expect(text).toContain('Саммит'); expect(text).toContain('Илья'); expect(text).toContain('Выбранный голос');
  expect(text).toMatch(/стоимость|цена/); expect(text).toContain('неизвестна'); expect(text).toContain('не предел списания');
  expect(caps.videoHeygenScope.input.safeParse({id: randomUUID(), unknownDebitAcknowledged: false}).success).toBe(false);
});
test('an authored quote alone cannot turn model changes into a manual lock release',async()=>{
 const apply=jest.fn(async()=>({draftId:'saved'}));
 const input={draftId:randomUUID(),version:2,expectedRevision:1,changes:{facialIntensity:'high'},releaseFields:['gaze'],requestMessageId:'authored',quote:'Keep it calm'};
 const ctx={...context({}, {apply}),resolveAuthorRequest:async()=>({messageId:'authored',text:'Keep it calm'})};
 await expect(async()=>caps.videoPerformanceUserEditV1.run(ctx,input)).rejects.toThrow();expect(apply).not.toHaveBeenCalled();
 const approved={...ctx,requestContext:{get:key=>key==='cf.approvals'?approvalFingerprint('video_performance_user_edit_v1',input):undefined}};
 await caps.videoPerformanceUserEditV1.run(approved,input);expect(apply).toHaveBeenCalledWith('org','actor',expect.objectContaining({releaseFields:['gaze']}),'manual');
 await expect(caps.videoPerformanceUserEditV1.run(approved,{...input,changes:{facialIntensity:'low'}})).rejects.toThrow();
});
test('automatic performance proposals cannot claim manual releases or speech tags',()=>{
 const input={draftId:randomUUID(),version:2,expectedRevision:0,changes:{context:'invitation'}};
 expect(caps.videoPerformanceSettingsV1.input.safeParse(input).success).toBe(true);
 expect(caps.videoPerformanceSettingsV1.input.safeParse({...input,releaseFields:['gaze']}).success).toBe(false);
 expect(caps.videoPerformanceSettingsV1.input.safeParse({...input,source:'manual'}).success).toBe(false);
});
test('chat feedback records exact authored text rather than fabricated creative observations',async()=>{
 const feedback=jest.fn();const ctx={...context({}, {feedback}),resolveAuthorRequest:async()=>({messageId:'authored',text:'Too expressive here'})};
 const input={draftId:randomUUID(),version:2,expectedRevision:1,requestMessageId:'authored',quote:'Too expressive here',text:'Perfect quality'};
 await expect(caps.videoPerformanceFeedbackV1.run(ctx,input)).rejects.toThrow();expect(feedback).not.toHaveBeenCalled();
 await caps.videoPerformanceFeedbackV1.run(ctx,{...input,text:input.quote});expect(feedback).toHaveBeenCalledTimes(1);
});
