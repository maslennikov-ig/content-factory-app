const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const ROOT='libraries/nestjs-libraries/src/videos/subscriptions/';
const {assertHeygenApprovedVoiceBaselineV2:assertBaseline}=load(`${ROOT}video-heygen-settings-admission.v2.ts`);
const settings=load(`${ROOT}video-heygen-settings.v2.ts`);
const profile=(extra={})=>({version:1,profileId:'person_one',profileRevision:2,profileDigest:'a'.repeat(64),connectionId:'connection_one',
  groupId:'group_one',baseLookId:'base_one',appearanceLookId:'appearance_one',voiceId:'voice_one',renderQualified:false,generationAuthorized:false,...extra});
const proposal=(engineSettings)=>({version:2,sourceLookId:'base_one',sourceGroupId:'group_one',appearanceLookId:'appearance_one',groupId:'group_one',
  sourceMode:'text',voiceId:'voice_one',voiceSettings:{locale:'ru-RU',speed:1,...(engineSettings?{engineSettings}:{})},engine:{type:'avatar_iv'},
  resolution:'720p',aspectRatio:'9:16',outputFormat:'mp4',durationSeconds:30,captions:'burned'});
const qualification=(voice={})=>({schemaDigest:settings.HEYGEN_SETTINGS_SCHEMA_V2,connectionId:'connection_one',subjectDigest:'b'.repeat(64),accountGeneration:3,
  resolutions:['720p'],source:{lookId:'base_one',groupId:'group_one',ready:true,owned:true,consentState:'accepted'},
  appearance:{lookId:'appearance_one',groupId:'group_one',ready:true,owned:true,consentState:'accepted',avatarType:'digital_twin',engines:['avatar_iv']},
  voice:{voiceId:'voice_one',owned:true,ready:true,locales:['ru'],...voice}});
const refused=(run)=>{
  try{run();throw new Error('Expected approved voice refusal');}catch(error){
    expect(error.getResponse()).toMatchObject({code:'VIDEO_HEYGEN_SETTING_UNAVAILABLE',setting:'voice_engine',remedy:expect.stringContaining('human-selected')});
  }
};
const exactSpeech='В таблице [А] указано 25%. Не пропустите встречу.';

test('a human-selected Starfish engine cannot disappear into the provider default; explicit qualified engine reaches the wire',()=>{
  const saved=profile({voiceEngine:'starfish',voiceBaseline:{locale:'ru-RU',speed:1}});
  refused(()=>assertBaseline(saved,proposal()));
  refused(()=>assertBaseline(saved,proposal({engine_type:'heygen_voice'})));
  const selected=proposal({engine_type:'starfish'});
  expect(()=>assertBaseline(saved,selected)).not.toThrow();
  expect(settings.heygenAvatarArgsV2(selected,exactSpeech,qualification({engineTypes:['starfish']}))).toMatchObject({
    script:exactSpeech,voiceId:'voice_one',voiceSettings:{locale:'ru-RU',engine_settings:{engine_type:'starfish'}}});
});

test('the selected ElevenLabs engine/model is preserved even when the engine is stored in the baseline only',()=>{
  const saved=profile({voiceBaseline:{engineSettings:{engine_type:'elevenlabs',model:'eleven_v3'}}});
  for(const changed of [undefined,{engine_type:'elevenlabs'},{engine_type:'elevenlabs',model:'eleven_v4'},{engine_type:'starfish'}])
    refused(()=>assertBaseline(saved,proposal(changed)));
  const selected=proposal({engine_type:'elevenlabs',model:'eleven_v3'}),snapshot=JSON.stringify(saved);
  expect(()=>assertBaseline(saved,selected)).not.toThrow();
  expect(settings.heygenAvatarArgsV2(selected,exactSpeech,qualification({engineTypes:['elevenlabs'],models:['eleven_v3']})).voiceSettings.engine_settings)
    .toEqual({engine_type:'elevenlabs',model:'eleven_v3'});
  expect(JSON.stringify(saved)).toBe(snapshot);
});

test('retaining the approved engine does not invent eligibility or silently submit an unqualified alternate',()=>{
  const saved=profile({voiceEngine:'starfish'}),selected=proposal({engine_type:'starfish'});
  assertBaseline(saved,selected);
  expect(()=>settings.heygenAvatarArgsV2(selected,exactSpeech,qualification())).toThrow();
  expect(()=>settings.heygenAvatarArgsV2(selected,exactSpeech,qualification({engineTypes:['elevenlabs']}))).toThrow();
  refused(()=>assertBaseline(saved,{...selected,voiceId:'substituted_voice'}));
});

test('ordinary delivery overrides keep the same approved engine/model; profiles without an explicit engine retain their default semantics',()=>{
  const saved=profile({voiceEngine:'elevenlabs',voiceBaseline:{speed:1,pitch:0,engineSettings:{engine_type:'elevenlabs',model:'eleven_v3'}}});
  const ordinary={...proposal({engine_type:'elevenlabs',model:'eleven_v3'}),voiceSettings:{locale:'en-US',speed:1.2,pitch:2,volume:0.8,
    engineSettings:{engine_type:'elevenlabs',model:'eleven_v3',stability:0.4}}};
  expect(()=>assertBaseline(saved,ordinary)).not.toThrow();
  const implicit=proposal();
  expect(()=>assertBaseline(profile(),implicit)).not.toThrow();
  refused(()=>assertBaseline(profile(),proposal({engine_type:'starfish'})));
  expect(settings.heygenAvatarArgsV2(implicit,exactSpeech,qualification()).voiceSettings).not.toHaveProperty('engine_settings');
});
