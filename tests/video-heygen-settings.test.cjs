const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const {createProviderFixture} = require('./helpers/video-subscription-provider-fixture.cjs');
const path = 'libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-settings.v2.ts';
const settings = load(path);
const native = load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-avatar-native.v1.ts');
const {subscriptionHash} = load('libraries/nestjs-libraries/src/videos/subscriptions/video-provider-registry.ts');
const {videoErrorV1} = load('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
const digest = char => char.repeat(64);
const binding = () => ({profileId:'person_one',profileRevision:2,profileDigest:digest('a'),connectionId:'connection_one',subjectDigest:digest('b'),accountGeneration:3,
  sourcePin:{pieceId:'piece_one',sourceRevision:digest('c')}});
const input = () => ({version:2,sourceLookId:'source_one',sourceGroupId:'group_one',appearanceLookId:'appearance_one',groupId:'group_one',
  sourceMode:'text',voiceId:'voice_one',voiceSettings:{locale:'ru-RU',speed:1.1,pitch:0,volume:0.9},engine:{type:'avatar_iv'},
  resolution:'720p',aspectRatio:'9:16',outputFormat:'mp4',durationSeconds:35,captions:'burned'});
const speech = 'Привет, я Илья.\nНе пропустите [MegaCampus] 20 ноября. 25% — это не обещание.';
const observation = (lookId,groupId='group_one') => ({lookId,groupId,ready:true,owned:true,consentState:'accepted'});
const qualification = () => ({schemaDigest:settings.HEYGEN_SETTINGS_SCHEMA_V2,connectionId:'connection_one',subjectDigest:digest('b'),accountGeneration:3,
  resolutions:['720p'],source:observation('source_one'),appearance:{...observation('appearance_one'),avatarType:'digital_twin',engines:['avatar_iii','avatar_iv','avatar_v']},
  voice:{voiceId:'voice_one',ready:true,owned:true,locales:['ru']}});
const error = (run,setting) => {
  try {run();throw new Error('Expected settings refusal');} catch(e) {
    expect(e.getResponse()).toMatchObject({code:'VIDEO_HEYGEN_SETTING_UNAVAILABLE',setting,remedy:expect.any(String)});
    expect(JSON.stringify(e.getResponse())).not.toContain('appearance_one');
  }
};

test('versioned recipe preserves exact Russian speech, literal brackets, role IDs and all ordinary mapped settings', () => {
  const s={...input(),background:{type:'color',value:'#112233'},fit:'contain',title:'Приглашение'};
  const original=structuredClone(s),q=qualification(),frozen=settings.heygenVideoRecipeV2(binding(),s,speech,q);
  expect(frozen.args).toEqual({avatarId:'appearance_one',voiceId:'voice_one',script:speech,engine:{type:'avatar_iv'},resolution:'720p',aspectRatio:'9:16',outputFormat:'mp4',
    voiceSettings:{locale:'ru-RU',speed:1.1,pitch:0,volume:0.9},background:{type:'color',value:'#112233'},fit:'contain',caption:{file_format:'srt',style:'default'},title:'Приглашение'});
  expect(frozen.settings.sourceLookId).toBe('source_one');
  expect(settings.parseHeygenVideoRecipeV2(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
  expect(frozen.recipeHash).toBe(subscriptionHash(Object.fromEntries(Object.entries(frozen).filter(([k])=>k!=='recipeHash'))));
  expect(s).toEqual(original);expect(q).toEqual(qualification());
  expect(settings.heygenAvatarArgsV2({...s,captions:'sidecar'},speech,q).caption).toEqual({file_format:'srt'});
  expect(settings.heygenAvatarArgsV2({...s,captions:'none'},speech,q)).not.toHaveProperty('caption');
});

test('source, profile, connection, speech and ordinary settings are immutable approval inputs', () => {
  const base=settings.heygenVideoRecipeV2(binding(),input(),speech,qualification());
  const cases=[
    [ {...binding(),profileRevision:3},input(),speech,qualification() ],
    [ {...binding(),profileDigest:digest('d')},input(),speech,qualification() ],
    [ {...binding(),sourcePin:{pieceId:'piece_one',sourceRevision:digest('d')}},input(),speech,qualification() ],
    [ {...binding(),accountGeneration:4},input(),speech,{...qualification(),accountGeneration:4} ],
    [ {...binding(),connectionId:'connection_two'},input(),speech,{...qualification(),connectionId:'connection_two'} ],
    [ binding(),{...input(),sourceLookId:'source_two'},speech,{...qualification(),source:observation('source_two')} ],
    [ binding(),{...input(),voiceSettings:{locale:'en-US',speed:1.2}},'Do not miss November 20.',qualification() ],
  ];
  for(const args of cases) expect(settings.heygenVideoRecipeV2(...args).recipeHash).not.toBe(base.recipeHash);
  error(()=>settings.heygenVideoRecipeV2({...binding(),accountGeneration:4},input(),speech,qualification()),'account_binding');
  const corrupted=structuredClone(base);corrupted.args.voiceSettings.speed=1.5;
  corrupted.recipeHash=settings.heygenVideoRecipeHashV2(corrupted);
  expect(()=>settings.parseHeygenVideoRecipeV2(corrupted)).toThrow();
  expect(()=>settings.parseHeygenVideoRecipeV2({...base,unreviewed:true})).toThrow();
});

test('unsupported ownership, consent, engines, resolution and mattings refuse before mapping', () => {
  for(const [q,field] of [
    [{...qualification(),source:{...observation('source_one'),owned:false}},'source_look'],
    [{...qualification(),appearance:{...qualification().appearance,consentState:'pending'}},'appearance_look'],
    [{...qualification(),appearance:{...qualification().appearance,engines:['avatar_iii']}},'avatar_engine'],
    [{...qualification(),resolutions:[]},'resolution'],
  ]) error(()=>settings.heygenAvatarArgsV2(input(),speech,q),field);
  error(()=>settings.heygenAvatarArgsV2({...input(),removeBackground:true},speech,qualification()),'matting');
  expect(settings.heygenAvatarArgsV2({...input(),removeBackground:true},speech,{...qualification(),appearance:{...qualification().appearance,matting:'supported'}}).removeBackground).toBe(true);
  error(()=>settings.heygenAvatarArgsV2({...input(),resolution:'4k'},speech,{...qualification(),resolutions:['4k']}),'resolution');
  expect(settings.heygenAvatarArgsV2({...input(),engine:{type:'avatar_iii'},resolution:'4k'},speech,{...qualification(),resolutions:['4k']}).resolution).toBe('4k');
  error(()=>settings.heygenAvatarArgsV2({...input(),engine:{type:'avatar_iii'},resolution:'4k'},speech,{...qualification(),resolutions:['4k'],appearance:{...qualification().appearance,avatarType:'photo_avatar'}}),'resolution');
});

test('V animation reference is distinct from source and appearance and checks type, group, readiness and consent', () => {
  const s={...input(),engine:{type:'avatar_v',moreBlinking:true},animationReferenceLookId:'motion_one',motionPrompt:'Use calm, restrained hand gestures.'};
  const q={...qualification(),appearance:{...qualification().appearance,avatarType:'photo_avatar'},animationReference:{...observation('motion_one'),avatarType:'digital_twin',engines:['avatar_v']}};
  expect(settings.heygenAvatarArgsV2(s,speech,q)).toMatchObject({avatarId:'appearance_one',engine:{type:'avatar_v',reference_look_id:'motion_one',more_blinking:true},motionPrompt:s.motionPrompt});
  for(const changed of [{groupId:'other_group'},{avatarType:'photo_avatar'},{ready:false},{owned:false},{consentState:'unknown'}])
    error(()=>settings.heygenAvatarArgsV2(s,speech,{...q,animationReference:{...q.animationReference,...changed}}),'animation_reference');
  error(()=>settings.heygenAvatarArgsV2({...s,animationReferenceLookId:undefined},speech,q),'animation_reference');
  error(()=>settings.heygenAvatarArgsV2({...s,expressiveness:'high'},speech,q),'expressiveness');
  error(()=>settings.heygenAvatarArgsV2({...s,engine:{type:'avatar_iv'}},speech,q),'animation_reference');
});

test('V photo-only animation requires a complete server observation and rejects unsupported custom motion', () => {
  const s={...input(),engine:{type:'avatar_v',moreBlinking:true}};
  const q={...qualification(),appearance:{...qualification().appearance,avatarType:'photo_avatar',photoOnlyAnimation:true}};
  expect(settings.heygenAvatarArgsV2(s,speech,q).engine).toEqual({type:'avatar_v',more_blinking:true});
  expect(settings.parseHeygenVideoRecipeV2(settings.heygenVideoRecipeV2(binding(),s,speech,q)).args.engine.type).toBe('avatar_v');
  error(()=>settings.heygenAvatarArgsV2({...s,motionPrompt:'Use a welcoming gesture.'},speech,q),'motion');
  for(const photoOnlyAnimation of [undefined,false])
    error(()=>settings.heygenAvatarArgsV2(s,speech,{...q,appearance:{...q.appearance,photoOnlyAnimation}}),'animation_reference');
});

test('new recipes support a longer exact script and canonical locales while the historical short route stays frozen', () => {
  const longSpeech=Array.from({length:139},(_,i)=>`слово${i}`).join(' ');
  const s={...input(),durationSeconds:73,voiceSettings:{locale:'de-DE',speed:1},resolution:'1080p'};
  const q={...qualification(),resolutions:['720p','1080p']};
  expect(settings.heygenAvatarArgsV2(s,longSpeech,q)).toMatchObject({script:longSpeech,resolution:'1080p',voiceSettings:{locale:'de-DE'}});
  expect(()=>native.heygenAvatarArgsV1({avatarId:'appearance_one',voiceId:'voice_one',script:longSpeech,locale:'ru-RU',resolution:'720p',aspectRatio:'9:16',engine:'avatar_iv',captions:false})).toThrow();
  expect(()=>settings.heygenAvatarArgsV2({...s,voiceSettings:{locale:'not_a_locale'}},speech,q)).toThrow();
  expect(()=>settings.heygenAvatarArgsV2(s,'word '.repeat(1001),q)).toThrow();
});

test('single-clip IV motion requires a separate measured scene route, even with a short target', () => {
  const q={...qualification(),appearance:{...qualification().appearance,avatarType:'photo_avatar'}};
  const s={...input(),durationSeconds:10,motionPrompt:'Use a small welcoming gesture.',expressiveness:'medium'};
  error(()=>settings.heygenAvatarArgsV2(s,'Слово '.repeat(139),q),'motion');
  error(()=>settings.heygenAvatarArgsV2(s,speech,q),'motion');
  error(()=>settings.heygenAvatarArgsV2({...s,durationSeconds:11},speech,q),'motion');
  const baseline=settings.heygenVideoRecipeV2(binding(),{...s,motionPrompt:undefined},speech,q);
  expect(baseline.args).toMatchObject({script:speech,expressiveness:'medium'});
  expect(baseline.args).not.toHaveProperty('motionPrompt');
  const historical={...baseline,settings:s,args:{...baseline.args,motionPrompt:s.motionPrompt}};
  historical.recipeHash=settings.heygenVideoRecipeHashV2(historical);
  expect(settings.parseHeygenVideoRecipeV2(historical)).toEqual(historical);
  error(()=>settings.heygenAvatarArgsV2(s,speech,qualification()),'expressiveness');
  error(()=>settings.heygenAvatarArgsV2({...s,expressiveness:undefined,engine:{type:'avatar_iii'}},speech,q),'motion');
  expect(()=>settings.heygenAvatarArgsV2({...s,motionPrompt:'Говори уверенно.'},speech,q)).toThrow();
  for(const script of ['Hello [warm], join us.','<speak>Hello</speak>','Hello <break time="1s"/> again.'])
    error(()=>settings.heygenAvatarArgsV2(input(),script,qualification()),'speech_markup');
  expect(settings.heygenAvatarArgsV2(input(),'В таблице [А] указано 25%, а 2 < 3.',qualification()).script).toBe('В таблице [А] указано 25%, а 2 < 3.');
});

test('voice-engine and model controls require selected-voice evidence; catalog language is metadata only', () => {
  const s={...input(),voiceSettings:{locale:'en-US',speed:0.9,pitch:-2,volume:0.8,engineSettings:{engine_type:'elevenlabs',model:'eleven_v3',stability:0.3,similarity_boost:0.8,style:0.2,use_speaker_boost:true}}};
  error(()=>settings.heygenAvatarArgsV2(s,'Exact English speech.',qualification()),'voice_engine');
  const q={...qualification(),voice:{...qualification().voice,engineTypes:['elevenlabs'],models:['eleven_v3']}};
  expect(settings.heygenAvatarArgsV2(s,'Exact English speech.',q).voiceSettings).toEqual({locale:'en-US',speed:0.9,pitch:-2,volume:0.8,engine_settings:s.voiceSettings.engineSettings});
  error(()=>settings.heygenAvatarArgsV2(s,'Exact English speech.',{...q,voice:{...q.voice,models:[]}}),'voice_model');
  const fallback={...input(),voiceSettings:{locale:'ru-RU',engineSettings:{engine_type:'heygen_voice'}}};
  error(()=>settings.heygenAvatarArgsV2(fallback,speech,{...q,voice:{...q.voice,engineTypes:['heygen_voice']}}),'voice_fallback');
  expect(settings.heygenAvatarArgsV2({...input(),voiceSettings:{locale:'en-US'}},'English requested.',qualification()).voiceSettings.locale).toBe('en-US');
  for(const change of [{speed:1.6},{pitch:51},{volume:1.1},{engineSettings:{engine_type:'fish',model:'s1'}},{emotion:'warm'},{ssml:true}])
    expect(()=>settings.heygenAvatarArgsV2({...input(),voiceSettings:{...input().voiceSettings,...change}},speech,qualification())).toThrow();
});

test('only scoped owned assets/glossaries are mapped and recorded audio never silently becomes TTS', () => {
  const s={...input(),background:{type:'image',assetId:'background_one',mediaId:'media_one',contentDigest:digest('d')},brandGlossaryId:'glossary_one'};
  error(()=>settings.heygenAvatarArgsV2(s,speech,qualification()),'background_asset');
  const q={...qualification(),ownedBackgroundAssetIds:['background_one'],ownedGlossaryIds:['glossary_one']};
  expect(settings.heygenAvatarArgsV2(s,speech,q)).toMatchObject({background:{type:'image',asset_id:'background_one'},brandGlossaryId:'glossary_one'});
  error(()=>settings.heygenAvatarArgsV2(s,speech,{...q,ownedGlossaryIds:[]}),'glossary');
  const audio={...input(),sourceMode:'audio_asset',audioAssetId:'original_audio',voiceId:undefined,voiceSettings:undefined};
  error(()=>settings.heygenAvatarArgsV2(audio,null,qualification()),'audio_asset');
  const args=settings.heygenAvatarArgsV2(audio,null,{...qualification(),ownedAudioAssetIds:['original_audio']});
  expect(args.audioAssetId).toBe('original_audio');expect(args).not.toHaveProperty('script');expect(args).not.toHaveProperty('voiceSettings');
  error(()=>settings.heygenAvatarArgsV2(audio,'Please substitute TTS.',{...qualification(),ownedAudioAssetIds:['original_audio']}),'audio_asset');
  for(const changed of [{audioUrl:'https://unowned.example/audio.wav'},{background:{type:'image',url:'https://unowned.example/img.png'}},{callbackUrl:'https://example.test/'},{engine:{type:'avatar_v',gaze:'camera'}},{outputFormat:'webm'},{providerArguments:{arbitrary:true}}])
    expect(()=>settings.heygenAvatarArgsV2({...input(),...changed},speech,qualification())).toThrow();
});

const syntheticTools=['get_current_user','create_video_from_avatar','get_video'].map(name=>({name,inputSchema:{type:'object',properties:{}}}));
const syntheticPins=Object.fromEntries(syntheticTools.map(tool=>[tool.name,subscriptionHash(tool)]));
async function withFixture(run) {
  // Protocol fixtures prove the transport boundary, not real provider eligibility.
  const f=await createProviderFixture({moduleMocks:{'./video-heygen-settings.v2':{...settings,HEYGEN_SETTINGS_TOOL_SCHEMAS_V2:syntheticPins}}});
  f.state.tools.heygen=structuredClone(syntheticTools);
  const def={...f.runtime.definition('heygen'),enabled:false,identityEndpoint:undefined,schemaDigests:[],ownedAssetReadProfile:'heygen_private_catalog_v1'};
  try {await run(f,def,f.issueTokens('heygen').access_token);} finally {await f.close();}
}
const creates=f=>f.state.toolCalls.filter(call=>call.name==='create_video_from_avatar');
test('V2 dispatch checks current selected schema and records the one raw response before guard failure',async()=>{
  await withFixture(async(f,def,token)=>{
    f.script('heygen','create_video_from_avatar',{id:'result_once'});
    let captured;const events=[];
    await expect(f.mcp.renderHeygenAvatarV2(def,token,settings.heygenAvatarArgsV2(input(),speech,qualification()),async()=>{if(captured)videoErrorV1('VIDEO_REAUTH_REQUIRED',409);},{
      beforeDispatch:async()=>{expect(creates(f)).toHaveLength(0);events.push('dispatch');},afterResponse:async raw=>{captured=raw;events.push('receipt');},
    })).rejects.toMatchObject({response:{code:'VIDEO_REAUTH_REQUIRED'}});
    expect(events).toEqual(['dispatch','receipt']);expect(creates(f)).toHaveLength(1);
    expect(creates(f)[0].args.script).toBe(speech);expect(native.decodeHeygenAvatarReceiptV1(captured)).toEqual({id:'result_once'});
    expect(f.state.quotes).toHaveLength(0);
  });
  for(const change of [tools=>tools[1].inputSchema.properties.changed={type:'string'},tools=>tools.push(structuredClone(tools[0]))]) await withFixture(async(f,def,token)=>{
    change(f.state.tools.heygen);
    await expect(f.mcp.renderHeygenAvatarV2(def,token,settings.heygenAvatarArgsV2(input(),speech,qualification()),async()=>{},{beforeDispatch:async()=>{},afterResponse:async()=>{}}))
      .rejects.toMatchObject({response:{code:'VIDEO_SCHEMA_CHANGED'}});
    expect(creates(f)).toHaveLength(0);
  });
});
test('lost V2 mutation response is one create; refusal to persist or admit never resubmits',async()=>{
  for(const response of ['lost','malformed']) await withFixture(async(f,def,token)=>{
    f.script('heygen','create_video_from_avatar',response);
    const beforeDispatch=jest.fn(async()=>{}),afterResponse=jest.fn(async()=>{});
    await expect(f.mcp.renderHeygenAvatarV2(def,token,settings.heygenAvatarArgsV2(input(),speech,qualification()),async()=>{},{beforeDispatch,afterResponse})).rejects.toThrow();
    expect(creates(f)).toHaveLength(1);expect(beforeDispatch).toHaveBeenCalledTimes(1);expect(afterResponse).toHaveBeenCalledTimes(response==='lost'?0:1);
  });
  await withFixture(async(f,def,token)=>{
    await expect(f.mcp.renderHeygenAvatarV2(def,token,settings.heygenAvatarArgsV2(input(),speech,qualification()),async()=>{},{beforeDispatch:async()=>{throw new Error('admission refused');},afterResponse:async()=>{}})).rejects.toThrow();
    expect(creates(f)).toHaveLength(0);
  });
});

test('V1 frozen parser stays unchanged, including historical author bytes and its narrow field profile',()=>{
  const old=native.heygenAvatarArgsV1({avatarId:'old_look',voiceId:'old_voice',script:'[warm] Historical frozen text.',locale:'en-US',resolution:'720p',aspectRatio:'9:16',engine:'avatar_iv',captions:true});
  const bytes=JSON.stringify(old);
  expect(JSON.stringify(native.heygenAvatarWireArgsV1(JSON.parse(bytes)))).toBe(bytes);
  expect(()=>native.heygenAvatarWireArgsV1({...old,voiceSettings:{locale:'en-US',speed:1.1}})).toThrow();
  expect(settings.HEYGEN_SETTINGS_KIND_V2).not.toBe(native.HEYGEN_AVATAR_NATIVE_KIND_V1);
});
