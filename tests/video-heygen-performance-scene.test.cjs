const {loadTypeScriptModule: load} = require('./helpers/load-ts-module.cjs');
const scene = load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-performance-scene.v1.ts');
const settings = load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-settings.v2.ts');
const hash = scene.heygenPerformanceSceneHashV1;
const digest = c => c.repeat(64);
const binding = () => ({profileId:'person_one',profileRevision:2,profileDigest:digest('a'),connectionId:'connection_one',
  subjectDigest:digest('b'),accountGeneration:3,sourcePin:{pieceId:'piece_one',sourceRevision:digest('c')}});
const baseline = () => ({version:2,sourceLookId:'source_one',sourceGroupId:'group_one',appearanceLookId:'appearance_one',groupId:'group_one',
  sourceMode:'text',voiceId:'voice_one',voiceSettings:{locale:'ru-RU',speed:1,pitch:0,volume:1},engine:{type:'avatar_iv'},
  expressiveness:'low',resolution:'1080p',aspectRatio:'9:16',outputFormat:'mp4',durationSeconds:73,captions:'none'});
const look = lookId => ({lookId,groupId:'group_one',ready:true,owned:true,consentState:'accepted'});
// Synthetic complete observations exercise the pure contract, not current account access.
const qualification = (qualified = true) => ({settings:{schemaDigest:settings.HEYGEN_SETTINGS_SCHEMA_V2,...bindingFields(),resolutions:['720p','1080p'],
  source:look('source_one'),appearance:{...look('appearance_one'),avatarType:'photo_avatar',engines:['avatar_iv','avatar_v']},
  voice:{voiceId:'voice_one',owned:true,ready:true,locales:['ru']}},
  route:{kind:'heygen-personal-studio-mcp/v1',...bindingFields(),toolSchemas:{...scene.HEYGEN_PERFORMANCE_SCENE_TOOL_SCHEMAS_V1},
    entitlement:qualified?'available':'unverified',resultContract:qualified?'single_video_owned_mp4_v1':'unverified',
    attemptContract:qualified?'one_create_no_automatic_retry_v1':'unverified',
    ...(qualified?{entitlementEvidenceDigest:digest('d'),resultContractEvidenceDigest:digest('e'),attemptContractEvidenceDigest:digest('f')}:{})},measuredAudio:[]});
function bindingFields(){return {connectionId:'connection_one',subjectDigest:digest('b'),accountGeneration:3};}
const plan = (texts=['Привет!\n','Приходите на встречу.']) => {
  let start=0;
  return {version:1,binding:binding(),settings:baseline(),exactSpeech:texts.join(''),scenes:texts.map((text,index)=>{
    const item={sceneId:`scene_${index}`,semanticBeatId:`beat_${index}`,start,end:start+text.length,exactText:text};start=item.end;return item;
  })};
};
function addAudio(p,q,index,durationSeconds=8){
  const part=p.scenes[index],proof={audioAssetId:`audio_${index}`,mediaId:`media_${index}`,contentDigest:digest('1'),
    speechDigest:hash(part.exactText),voiceDigest:scene.heygenPerformanceVoiceDigestV1(p.binding,p.settings),...bindingFields(),durationSeconds,
    measurement:'decoded_owned_audio',exactTranscriptVerified:true,originalVoiceVerified:true};
  q.measuredAudio.push(proof);q.settings.ownedAudioAssetIds=[...(q.settings.ownedAudioAssetIds||[]),proof.audioAssetId];
  part.audioProofDigest=hash(proof);return proof;
}
const codes = prepared => prepared.limitations.map(v=>v.code);
const invalid = run => expect(run).toThrow(expect.objectContaining({response:{code:'VIDEO_HEYGEN_SCENE_PLAN_INVALID'}}));

test('current tools existence without positive account, owned result and attempt evidence is limited and has no count or executable args',()=>{
  const p=plan(),q=qualification(false),before=structuredClone({p,q});
  const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
  expect(prepared).toMatchObject({status:'limited',operationCount:null,dispatchAuthorized:false,cost:'unknown',timing:'scene_level_no_frame_guarantee'});
  expect(codes(prepared)).toEqual(['studio_entitlement','studio_result','studio_attempt']);
  expect(prepared).not.toHaveProperty('args');expect({p,q}).toEqual(before);
});

test('a structurally qualified composed preparation is one future create operation, preserves exact Russian, voice and identity, and stays unauthorized',()=>{
  const p=plan(['В таблице [А] 25%: 2 < 3.\n','Точный текст — без тегов.']),q=qualification();
  const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
  expect(prepared).toMatchObject({status:'qualified_for_review',operationCount:1,dispatchAuthorized:false,cost:'unknown',limitations:[]});
  expect(prepared.args.scenes.map(s=>s.input.script).join('')).toBe(p.exactSpeech);
  for(const s of prepared.args.scenes)expect(s.input).toMatchObject({type:'avatar',avatar_id:'appearance_one',voice_id:'voice_one',
    voice_settings:p.settings.voiceSettings,engine:{type:'avatar_iv'},expressiveness:'low'});
  expect(prepared.speechDigest).toBe(hash(p.exactSpeech));expect(prepared.scenePlanDigest).toBe(hash(p.scenes));
  expect(scene.parseHeygenPerformanceScenesV1(JSON.parse(JSON.stringify(prepared)))).toEqual(prepared);
});

test('strict exact-span bindings reject omissions, overlaps, reordered text, target edits inside speech and identity overrides',()=>{
  for(const edit of [p=>p.scenes[0].start=1,p=>p.scenes[1].start--,p=>p.scenes[0].exactText='Здравствуйте!\n',
    p=>p.scenes.pop(),p=>p.scenes.reverse(),p=>p.scenes[1].avatarId='another_person',p=>p.scenes[1].voiceId='another_voice',
    p=>p.scenes[1].sceneId=p.scenes[0].sceneId,p=>p.unreviewed=true]){
    const p=plan();edit(p);invalid(()=>scene.prepareHeygenPerformanceScenesV1(p,qualification()));
  }
  invalid(()=>scene.prepareHeygenPerformanceScenesV1(plan(['При','ходите.']),qualification()));
  invalid(()=>scene.prepareHeygenPerformanceScenesV1(plan(['Letter','𝒜.']),qualification()));
  invalid(()=>scene.prepareHeygenPerformanceScenesV1(plan(['Кафе','\u0301!']),qualification()));
  invalid(()=>scene.prepareHeygenPerformanceScenesV1(plan(['Привет \uD83D','\uDE03 всем.']),qualification()));
});

test('one principal gesture belongs to a semantic beat; duplicate cues and multiple gestures in one beat cannot hide behind physical cuts',()=>{
  for(const repeated of ['beat','cue']){
    const p=plan(),q=qualification();
    for(let i=0;i<2;i++){p.scenes[i].principalGesture={cueId:repeated==='cue'?'same_cue':`cue_${i}`,direction:'Give a small welcoming wave.'};addAudio(p,q,i,8);}
    if(repeated==='beat')p.scenes[1].semanticBeatId=p.scenes[0].semanticBeatId;
    invalid(()=>scene.prepareHeygenPerformanceScenesV1(p,q));
  }
  const p=plan();p.scenes[0].principalGesture=[{cueId:'one',direction:'Wave.'},{cueId:'two',direction:'Clap.'}];
  invalid(()=>scene.prepareHeygenPerformanceScenesV1(p,qualification()));
});

test('setting a long script target to ten seconds never proves IV custom scene duration or the accent budget',()=>{
  const p=plan(['Слово '.repeat(139)]),q=qualification();p.settings.durationSeconds=10;
  p.scenes[0].principalGesture={cueId:'invite',direction:'Raise the right hand in a small welcoming gesture.'};
  const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
  expect(codes(prepared)).toEqual(['iv_duration','accent_duration']);expect(prepared.operationCount).toBeNull();expect(prepared).not.toHaveProperty('args');
  expect(prepared.accentBudget).toEqual({intentionalAccents:1,durationBasis:null,durationSeconds:null,maximumAccents:null});
});

test('measured duration qualifies only the very same owned audio consumed in a short IV scene, with original voice bound in metadata',()=>{
  const p=plan(),q=qualification();p.scenes[0].gazeDirection='Maintain relaxed eye contact with the camera.';
  p.scenes[0].principalGesture={cueId:'thanks',direction:'Place the right hand over the heart.'};
  addAudio(p,q,0,8.5);addAudio(p,q,1,60);
  const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
  expect(prepared.status).toBe('qualified_for_review');expect(prepared.accentBudget).toEqual({intentionalAccents:1,durationBasis:'measured_audio',durationSeconds:68.5,maximumAccents:2});
  const input=prepared.args.scenes[0].input;
  expect(input.audio_asset_id).toBe('audio_0');expect(input).not.toHaveProperty('script');expect(input).not.toHaveProperty('voice_id');expect(input).not.toHaveProperty('voice_settings');
  expect(input.motion_prompt).toContain('Maintain relaxed eye contact');expect(input.motion_prompt).toContain('Perform this gesture once:');
  expect(input.motion_prompt).toContain('Return to a relaxed resting pose.');
  expect(prepared.plan.exactSpeech).toBe(p.exactSpeech);
});

test('long measured IV motion refuses regardless of short target; gaze and face directions use the same motion restriction',()=>{
  for(const field of ['gazeDirection','facialDirection']){
    const p=plan(['Точная речь.']),q=qualification();p.settings.durationSeconds=2;p.scenes[0][field]='Keep a calm expression and steady camera gaze.';
    addAudio(p,q,0,10.001);const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
    expect(codes(prepared)).toContain('iv_duration');expect(prepared.operationCount).toBeNull();
  }
});

test('stale, unowned, different voice, speech or account audio proof cannot be used for an IV duration workaround',()=>{
  for(const change of [proof=>proof.speechDigest=digest('9'),proof=>proof.voiceDigest=digest('9'),proof=>proof.accountGeneration++,
    proof=>proof.subjectDigest=digest('9'),proof=>proof.connectionId='other_connection']){
    const p=plan(['Точная речь.']),q=qualification();p.scenes[0].gazeDirection='Look at the camera.';const proof=addAudio(p,q,0);change(proof);p.scenes[0].audioProofDigest=hash(proof);
    expect(codes(scene.prepareHeygenPerformanceScenesV1(p,q))).toEqual(['scene_audio','iv_duration']);
  }
  for(const change of [(p,q)=>q.settings.ownedAudioAssetIds=[],(p,q)=>q.measuredAudio[0].contentDigest=digest('9'),
    p=>p.settings.voiceSettings.speed=1.1,p=>p.binding.profileRevision++]){
    const p=plan(['Точная речь.']),q=qualification();p.scenes[0].gazeDirection='Look at the camera.';addAudio(p,q,0);change(p,q);
    expect(codes(scene.prepareHeygenPerformanceScenesV1(p,q))).toContain('scene_audio');
  }
});

test('natural accent budget allows zero, one in a short video and two in one minute, without treating the target as proof',()=>{
  for(const [count,durations,expected] of [[0,[8],true],[1,[8],true],[2,[8,52],true],[2,[8,8],false],[3,[8,8,44],false]]){
    const p=plan(durations.map((_,i)=>`Фраза ${i}. `)),q=qualification();
    durations.forEach((duration,i)=>{addAudio(p,q,i,duration);if(i<count)p.scenes[i].principalGesture={cueId:`cue_${i}`,direction:'Give a small welcoming wave.'};});
    const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
    expect(codes(prepared).includes('accent_budget')).toBe(!expected);
  }
});

test('source, engine, account, schema and unsupported fit are limitations rather than a silent provider or payer change',()=>{
  for(const [change,code] of [[(p,q)=>q.settings.appearance.ready=false,'source_settings'],[(p,q)=>q.route.connectionId='another_connection','account_binding'],
    [(p,q)=>q.route.toolSchemas.get_video=digest('9'),'studio_schema'],[p=>p.settings.fit='contain','studio_fit'],[p=>p.settings.motionPrompt='Look at the camera.','global_motion'],
    [(p,q)=>delete q.route.entitlementEvidenceDigest,'studio_entitlement']]){
    const p=plan(),q=qualification();change(p,q);const prepared=scene.prepareHeygenPerformanceScenesV1(p,q);
    expect(codes(prepared)).toContain(code);expect(prepared.operationCount).toBeNull();expect(prepared).not.toHaveProperty('args');
  }
  const p=plan(['Точная речь.']),q=qualification();p.settings.engine={type:'avatar_v'};delete p.settings.expressiveness;
  p.scenes[0].gazeDirection='Look at the camera.';
  expect(codes(scene.prepareHeygenPerformanceScenesV1(p,q))).toEqual(['source_settings','scene_motion']);
  q.settings.animationReference={...look('reference_one'),avatarType:'digital_twin',engines:['avatar_v']};p.settings.animationReferenceLookId='reference_one';
  expect(scene.prepareHeygenPerformanceScenesV1(p,q).args.scenes[0].input.engine).toEqual({type:'avatar_v',reference_look_id:'reference_one'});
});

test('operational copy remains English and never becomes speech markup or extra speech',()=>{
  const p=plan(['Привет!']),q=qualification();p.scenes[0].gazeDirection='Смотри в камеру.';
  invalid(()=>scene.prepareHeygenPerformanceScenesV1(p,q));
  delete p.scenes[0].gazeDirection;p.exactSpeech=p.scenes[0].exactText='Hello [warm].';p.scenes[0].end=p.exactSpeech.length;
  expect(codes(scene.prepareHeygenPerformanceScenesV1(p,q))).toContain('source_settings');
});

test('saved readers reject altered wire args even after rehashing, retain exact historical preparation and never perform a dispatch',()=>{
  const prepared=scene.prepareHeygenPerformanceScenesV1(plan(),qualification());
  for(const edit of [v=>v.args.scenes[0].input.voice_id='changed_voice',v=>v.args.scenes.reverse(),v=>v.operationCount=2,v=>v.dispatchAuthorized=true,
    v=>v.status='limited',v=>v.extra='not_reviewed']){
    const changed=structuredClone(prepared);edit(changed);const {preparationDigest,...payload}=changed;changed.preparationDigest=hash(payload);
    invalid(()=>scene.parseHeygenPerformanceScenesV1(changed));
  }
  const first=scene.parseHeygenPerformanceScenesV1(prepared),second=scene.parseHeygenPerformanceScenesV1(first);
  expect(second).toEqual(prepared);expect(second.dispatchAuthorized).toBe(false);
  const changed=plan();changed.settings.durationSeconds=72;
  expect(scene.prepareHeygenPerformanceScenesV1(changed,qualification()).preparationDigest).not.toBe(prepared.preparationDigest);
});
