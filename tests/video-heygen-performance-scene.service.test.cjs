const {HttpException}=require('@nestjs/common');
const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const prefix='libraries/nestjs-libraries/src/videos/subscriptions/';
const {HEYGEN_SETTINGS_SCHEMA_V2}=load(`${prefix}video-heygen-settings.v2.ts`);
const {compileHeygenPerformanceV1,resolveHeygenPerformanceV1}=load(`${prefix}video-heygen-performance.v1.ts`);
const assertDraft=jest.fn();
const downloadPreview=jest.fn();
const inspectPreview=jest.fn();
const {HeygenPerformanceSceneServiceV1}=load(`${prefix}video-heygen-performance-scene.service.v1.ts`,{
  './video-heygen-performance.service.v1':{HeygenPerformanceServiceV1:class {}},
  './video-heygen-performance-record.v1':{assertHeygenPerformanceDraftV1:assertDraft},
  '../video-media.v1':{downloadVideoAssetV1:downloadPreview,inspectCreativeImageBytesV1:inspectPreview},
});

const digest=char=>char.repeat(64);
const request={draftId:'20000000-0000-4000-8000-000000000000',version:3,expectedRevision:2};
const exactSpeech='Здравствуйте.\n\n'+ 'Точная фраза для приглашения. '.repeat(25);
const look=lookId=>({lookId,groupId:'group_one',ready:true,owned:true,consentState:'accepted'});
const failure=(code,secret)=>new HttpException({code,secret},409);
function fixture(engine='avatar_iv'){
  const account={connectionId:'connection_one',subjectDigest:digest('a'),accountGeneration:1};
  const binding={...account,profileId:'profile_one',profileRevision:1,profileDigest:digest('b'),
    sourcePin:{pieceId:'piece_one',sourceRevision:digest('c')}};
  const inner={version:2,sourceLookId:'source_one',sourceGroupId:'group_one',appearanceLookId:'appearance_one',groupId:'group_one',
    sourceMode:'text',voiceId:'voice_one',voiceSettings:{locale:'ru-RU',speed:1},engine:{type:engine},
    resolution:'720p',aspectRatio:'9:16',outputFormat:'mp4',durationSeconds:10,captions:'none'};
  const qualification={...account,schemaDigest:HEYGEN_SETTINGS_SCHEMA_V2,resolutions:['720p'],source:look('source_one'),
    appearance:{...look('appearance_one'),avatarType:'photo_avatar',engines:['avatar_iv','avatar_v']},
    voice:{voiceId:'voice_one',owned:true,ready:true,locales:['ru']}};
  if(engine==='avatar_v'){
    inner.animationReferenceLookId='reference_one';
    qualification.animationReference={...look('reference_one'),avatarType:'digital_twin',engines:['avatar_v']};
  }
  const values=resolveHeygenPerformanceV1({proposed:{context:'invitation'}}).values;
  const view={draftVersion:3,revision:2,values,wishResolution:null,effectiveSettings:null};
  const draft={id:request.draftId,version:3,brief:{scriptPolicy:'exact',script:exactSpeech}};
  const context={draft,binding,inner,qualification,guard:jest.fn(),inspectSceneTools:jest.fn().mockResolvedValue([])};
  const controls={access:{api:{assertCurrentSource:jest.fn()}},profiles:{store:{}},performanceContext:jest.fn().mockResolvedValue(context)};
  const performance={read:jest.fn().mockResolvedValue(view),controls};
  const service=new HeygenPerformanceSceneServiceV1(performance);
  const prepare=(raw=request)=>service.prepare('org','actor',raw);
  return {prepare,view,context,performance,controls,service};
}

beforeEach(()=>{
  assertDraft.mockReset();
  downloadPreview.mockReset();
  inspectPreview.mockReset();
});

test('an IV monologue returns bounded creative directions and a frontal remedy without unsafe motion, identity leakage or an operation count',async()=>{
  const f=fixture();
  const result=await f.prepare();
  expect(result).toMatchObject({route:'studio',status:'limited',operationCount:null,dispatchAuthorized:false,cost:'unknown',
    timing:'scene_level_no_frame_guarantee',generated:false,submitted:false,scenes:[{
      start:0,end:exactSpeech.length,gazeDirection:expect.stringMatching(/camera/),principalGesture:{cueId:'presenter_accent'},
    }]});
  expect(result.limitations.map(item=>item.code)).toEqual(['frontal_look','avatar_v_reference','studio_schema','studio_entitlement',
    'studio_result','studio_attempt','iv_duration','accent_duration']);
  expect(JSON.stringify(result)).not.toMatch(/voice_one|source_one|connection_one|Точная фраза|motion_prompt/);
  expect(f.controls.performanceContext).toHaveBeenCalledWith('org','actor',request.draftId,3,{scenePreparation:true});
  expect(f.context.inspectSceneTools).toHaveBeenCalledTimes(1);
  expect(f.context.draft.brief.script).toBe(exactSpeech);
  expect((await f.prepare()).preparationDigest).toBe(result.preparationDigest);
});

test('a ready explicitly pinned V reference still requires current matching applied settings and regular admission',async()=>{
  const f=fixture('avatar_v');
  expect(await f.prepare()).toMatchObject({status:'limited',route:'single_clip_avatar_v',operationCount:null,
    limitations:[{code:'apply_delivery'}]});
  const {inner,qualification}=f.context;
  const motionPrompt=compileHeygenPerformanceV1(f.view.values,inner,qualification).overrides.motionPrompt;
  inner.motionPrompt=motionPrompt;
  f.view.effectiveSettings={motionPrompt};
  expect(await f.prepare()).toMatchObject({status:'single_clip_available',route:'single_clip_avatar_v',operationCount:1,
    dispatchAuthorized:false,limitations:[]});
  expect(f.context.inspectSceneTools).not.toHaveBeenCalled();
  expect(assertDraft).toHaveBeenCalledWith(f.controls.profiles.store,'org','actor',f.context.draft);
  assertDraft.mockRejectedValueOnce(failure('VIDEO_PERFORMANCE_CUE_UNAVAILABLE'));
  expect(await f.prepare()).toMatchObject({status:'limited',operationCount:null,limitations:[{code:'required_cue'}]});
});

test.each([{ready:false},{owned:false},{consentState:'pending'},{groupId:'different_group'},{lookId:'other_ref'}])(
  'an unqualified V reference never silently substitutes or gives single-clip availability (%o)',async change=>{
    const f=fixture('avatar_v');
    Object.assign(f.context.qualification.animationReference,change);
    const result=await f.prepare();
    expect(result).toMatchObject({route:'studio',status:'limited',operationCount:null});
    expect(result.limitations).toContainEqual(expect.objectContaining({code:'avatar_v_reference'}));
    expect(f.context.inner.animationReferenceLookId).toBe('reference_one');
  });

test('the service rejects stale or widened inputs and rechecks the draft after provider discovery',async()=>{
  const f=fixture();
  await expect(f.prepare({...request,motionPrompt:'Override the whole clip.'})).rejects.toMatchObject({status:400});
  await expect(f.prepare({...request,version:2})).rejects.toMatchObject({response:{code:'VIDEO_DRAFT_CHANGED'}});
  await expect(f.prepare({...request,expectedRevision:1})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_CHANGED'}});
  expect(f.controls.performanceContext).not.toHaveBeenCalled();
  f.performance.read.mockResolvedValueOnce(f.view).mockResolvedValueOnce({...f.view,revision:3});
  await expect(f.prepare()).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_CHANGED'}});
  expect(f.context.guard).toHaveBeenCalledTimes(1);
});

test('unknown Studio schema stays limited and access revocation aborts preparation',async()=>{
  const f=fixture();
  f.context.inspectSceneTools.mockRejectedValueOnce(failure('VIDEO_MCP_UNAVAILABLE','private provider detail'));
  const result=await f.prepare();
  expect(result.limitations).toContainEqual(expect.objectContaining({code:'studio_schema'}));
  expect(JSON.stringify(result)).not.toContain('private provider detail');
  f.context.inspectSceneTools.mockRejectedValueOnce(failure('VIDEO_REAUTH_REQUIRED'));
  await expect(f.prepare()).rejects.toMatchObject({response:{code:'VIDEO_REAUTH_REQUIRED'}});
});

const previewRequest={draftId:request.draftId,version:request.version,lookId:'candidate_one'};
const privateUrl='https://files2.heygen.ai/synthetic.webp?Signature=private';
function previewFixture(){
  const f=fixture();
  const {draft,binding,inner}=f.context;
  draft.userId='actor';
  draft.settings={provider:'heygen',model:'heygen-avatar',mode:'presenter',avatarId:inner.appearanceLookId,voiceId:inner.voiceId,
    engine:inner.engine.type,duration:inner.durationSeconds,resolution:inner.resolution,aspectRatio:inner.aspectRatio,
    locale:inner.voiceSettings.locale,audio:true,captions:false,heygenV2:{binding,settings:inner}};
  const look={id:previewRequest.lookId,groupId:inner.groupId,ownership:'owned',selectableForDraft:true};
  const group={avatarId:look.id,groupId:look.groupId,consentState:'accepted'};
  const detail={id:look.id,group_id:look.groupId,status:'completed',preview_image_url:privateUrl};
  const provider={nativeAccount:jest.fn().mockResolvedValue({subjectDigest:binding.subjectDigest}),
    readOwnedCatalog:jest.fn().mockResolvedValue({catalog:{avatars:[look]}}),readOwnedAvatarGroup:jest.fn().mockResolvedValue(group),
    mcp:{readHeygenCreativeV1:jest.fn().mockResolvedValue({data:detail})}};
  const connection={generation:binding.accountGeneration,provider:'heygen'};
  const guard=jest.fn();
  const def={provider:'heygen'};
  Object.assign(f.controls.access,{repository:{member:jest.fn()},apiRepository:{draft:jest.fn().mockResolvedValue(draft)},
    connections:{token:jest.fn().mockResolvedValue({token:'account-token',connection,assertUsable:guard}),connectable:jest.fn().mockResolvedValue(def)},
    subscriptions:{heygen:provider}});
  const profile={revision:binding.profileRevision,digest:binding.profileDigest};
  f.controls.profiles.resolve=jest.fn().mockResolvedValue(profile);
  const bytes=Buffer.from('decoded by fixture');
  downloadPreview.mockResolvedValue(bytes);
  inspectPreview.mockResolvedValue({mimeType:'image/webp'});
  const read=(raw=previewRequest)=>f.service.readOwnedLookPreview('org','actor',raw);
  return {...f,read,provider,look,group,detail,def,guard,bytes,draft,profile};
}

test('an exact current same-group candidate uses scoped read and serves only bounded, decoded bytes',async()=>{
  const f=previewFixture();
  expect(await f.read()).toEqual({bytes:f.bytes,contentType:'image/webp'});
  expect(f.controls.access.repository.member).toHaveBeenCalledWith('org','actor');
  expect(f.controls.access.connections.token).toHaveBeenCalledWith('org','actor','connection_one',1,'discovery',{allowRefresh:false});
  expect(f.controls.profiles.resolve).toHaveBeenCalledTimes(2);
  expect(f.controls.profiles.resolve.mock.calls[0][2]).toEqual({connectionId:'connection_one',profileId:'profile_one',groupId:'group_one'});
  expect(f.provider.mcp.readHeygenCreativeV1).toHaveBeenCalledWith(f.def,'account-token',{
    tool:'get_avatar_look',arguments:{lookId:previewRequest.lookId},
  },f.guard);
  expect(downloadPreview).toHaveBeenCalledWith(privateUrl,5*1024*1024,12000,'https://files2.heygen.ai');
  expect(inspectPreview).toHaveBeenCalledWith(f.bytes);
});

test('foreign draft, unowned look and missing consent stop before exact provider detail',async()=>{
  const f=previewFixture();
  f.draft.userId='other';
  await expect(f.read()).rejects.toMatchObject({response:{code:'VIDEO_DRAFT_NOT_FOUND'}});
  expect(f.provider.nativeAccount).not.toHaveBeenCalled();
  f.draft.userId='actor';
  f.look.groupId='other_group';
  await expect(f.read()).rejects.toMatchObject({response:{code:'VIDEO_PROFILE_PREVIEW_UNAVAILABLE'}});
  expect(f.provider.readOwnedAvatarGroup).not.toHaveBeenCalled();
  f.look.groupId='group_one';
  f.group.consentState='pending';
  await expect(f.read()).rejects.toMatchObject({response:{code:'VIDEO_PROFILE_PREVIEW_UNAVAILABLE'}});
  expect(f.provider.mcp.readHeygenCreativeV1).not.toHaveBeenCalled();
});

test.each([{id:'wrong_look'},{group_id:'wrong_group'},{status:'training'},
  {preview_image_url:'https://files2.heygen.ai.example/a.webp'},
  {preview_image_url:'https://files2.heygen.ai@127.0.0.1/a.webp'},
  {preview_image_url:'https://user:password@files2.heygen.ai/a.webp'}])(
  'mismatched details and non-allowlisted preview URLs do not initiate a download (%o)',async change=>{
    const f=previewFixture();
    Object.assign(f.detail,change);
    await expect(f.read()).rejects.toMatchObject({response:{code:'VIDEO_PROFILE_PREVIEW_UNAVAILABLE'}});
    expect(downloadPreview).not.toHaveBeenCalled();
  });

test('preview bytes are withheld when the profile changes and image failures hide private URLs',async()=>{
  const f=previewFixture();
  f.controls.profiles.resolve.mockResolvedValueOnce(f.profile).mockResolvedValueOnce({...f.profile,revision:99});
  await expect(f.read()).rejects.toMatchObject({response:{code:'VIDEO_PROFILE_CHANGED'}});
  downloadPreview.mockRejectedValueOnce(new Error(privateUrl));
  await expect(f.read()).rejects.toMatchObject({response:{code:'VIDEO_PROFILE_PREVIEW_UNAVAILABLE'}});
  await expect(f.read({...previewRequest,url:privateUrl})).rejects.toMatchObject({status:400});
});
