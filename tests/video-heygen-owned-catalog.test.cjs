const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/videos/';
const catalog = loadTypeScriptModule(`${ROOT}subscriptions/video-heygen-owned-catalog.v1.ts`);
const {videoSourceRevisionV1} = loadTypeScriptModule(`${ROOT}video-brief.v1.ts`);
const fail = code => error => error?.getResponse?.()?.code === code;
const privateRows = () => ({
  groups: [{id:'owned_group', name:'Свой аватар', consent_status:null, status:'completed'}],
  looks: [{id:'owned_look', group_id:'owned_group', name:'Мой образ', status:'completed', supported_api_engines:['avatar_iv']}],
  voices: [{voice_id:'owned_voice', name:'Мой голос', type:'private', language:'Russian', available_engines:['orca']}],
});
test('observed HeyGen items envelope retains private names/language and unknown consent without qualifying render', () => {
  const rows = privateRows();
  const decoded = Object.fromEntries(Object.entries(rows).map(([kind, items]) => [kind, catalog.heygenCatalogPageV1({items, has_more:false}).data]));
  const output = catalog.decodeHeygenOwnedCatalogV1(decoded);
  expect(output.catalog).toMatchObject({scope:'authenticated_private_account', readOnly:true, renderQualified:false});
  expect(output.catalog.avatars).toEqual([{id:'owned_look', name:'Мой образ', ownership:'owned', state:'unverified', selectableForDraft:true, engines:['avatar_iv'], locales:[], groupId:'owned_group',avatarType:null,groupType:null,consentStatus:null}]);
  expect(output.catalog.voices[0]).toMatchObject({name:'Мой голос', language:'Russian', locales:['ru'], engines:[]});
  expect(output.avatars).toEqual([]);
  expect(output.voices).toHaveLength(1);
  expect(JSON.stringify(output)).not.toContain('orca');
});
test('catalog rejects ambiguous duplicates, incomplete envelopes and excludes public/foreign group substitutions', () => {
  const rows = privateRows();
  expect(() => catalog.decodeHeygenOwnedCatalogV1({...rows, looks:[...rows.looks, {...rows.looks[0], ownership:'public'}]})).toThrow();
  for (const raw of [{items:[],data:[],has_more:false},{items:[],has_more:true},{items:[]},{items:[],has_more:false,error:{code:'denied'}}])
    expect(() => catalog.heygenCatalogPageV1(raw)).toThrow();
  expect(catalog.decodeHeygenOwnedCatalogV1({...rows, groups:[{...rows.groups[0], ownership:'public'}]}).catalog.avatars).toEqual([]);
  expect(catalog.decodeHeygenOwnedCatalogV1({...rows, voices:[{...rows.voices[0],type:'public'}]}).catalog.voices).toEqual([]);
  const unnamed = catalog.decodeHeygenOwnedCatalogV1({...rows, voices:[{...rows.voices[0],name:null}]}).catalog.voices[0];
  expect(unnamed.name).not.toBe(unnamed.id);
});
test.each(['failed','error','training','pending','processing'])('null consent cannot hide %s in either the look or its group',status=>{
  for(const kind of ['groups','looks']){
    const rows=privateRows();rows[kind][0].status=status;
    const avatar=catalog.decodeHeygenOwnedCatalogV1(rows).catalog.avatars[0];
    expect(avatar.state).toBe(['failed','error'].includes(status)?'failed':'training');
    expect(avatar.selectableForDraft).toBe(false);
  }
});
test('observed null group status and null consent retain a completed private look for a saved proposal only',()=>{
  const rows=privateRows();rows.groups[0].status=null;
  const output=catalog.decodeHeygenOwnedCatalogV1(rows);
  expect(output.catalog.avatars[0]).toMatchObject({state:'unverified',selectableForDraft:true});
  expect(output.catalog.renderQualified).toBe(false);expect(output.avatars).toEqual([]);
});

test.each([
  ['accepted','digital_twin','accepted','required'],
  ['pending','digital_twin','pending','required'],
  ['rejected','digital_twin','rejected','required'],
  [null,'photo','not_applicable','not_required'],
  [null,'prompt','not_applicable','not_required'],
  [null,undefined,'unknown','unknown'],
  [undefined,undefined,'unknown','unknown'],
  ['new_unreviewed_status','unrecognized','unknown','unknown'],
])('owned avatar group read keeps consent %s/type %s separate from generation readiness',(status,type,state,requirement)=>{
  const input=privateRows();input.looks[0].avatar_type='photo_avatar';
  const selected=catalog.selectHeygenOwnedAvatarV1(input,{avatarId:'owned_look'});
  const raw={data:{id:'owned_group',name:'My identity',...(status!==undefined?{consent_status:status}:{}),...(type?{type}:{}),preview_image_url:'https://private.example/image',consent_url:'https://private.example/secret',history:['PRIVATE_PROVIDER_HISTORY']}};
  const result=catalog.decodeHeygenOwnedAvatarGroupV1(selected,raw);
  expect(result).toMatchObject({avatarId:'owned_look',groupId:'owned_group',name:'Мой образ',avatarType:'photo_avatar',consentStatus:status===undefined||status==='new_unreviewed_status'?'unknown':status,consentState:state,consentRequirement:requirement,readOnly:true,renderQualified:false});
  expect(JSON.stringify(result)).not.toMatch(/private\.example|PRIVATE_PROVIDER_HISTORY/);
  const assets=catalog.decodeHeygenOwnedCatalogV1(input);
  expect(assets.catalog.avatars[0]).toMatchObject({groupId:'owned_group',avatarType:'photo_avatar',consentStatus:null,state:'unverified'});
  expect(assets.catalog.renderQualified).toBe(false);
});
test('owned group consent read refuses foreign/private mismatch and cannot infer photo group origin from a photo look',()=>{
  const input=privateRows();input.looks[0].avatar_type='photo_avatar';
  const owned=catalog.selectHeygenOwnedAvatarV1(input,{avatarId:'owned_look'});
  expect(catalog.decodeHeygenOwnedAvatarGroupV1(owned,{id:'owned_group',consent_status:null})).toMatchObject({avatarType:'photo_avatar',groupType:null,consentState:'unknown'});
  expect(catalog.decodeHeygenOwnedAvatarGroupV1({...owned,group:{...owned.group,type:'photo'}},{id:'owned_group',type:'new_type',consent_status:null})).toMatchObject({groupType:null,consentState:'unknown'});
  for(const selected of [{avatarId:'foreign_look'},{avatarId:'owned_look',groupId:'foreign_group'}])expect(()=>catalog.selectHeygenOwnedAvatarV1(input,selected)).toThrow();
  expect(()=>catalog.selectHeygenOwnedAvatarV1({...input,groups:[{...input.groups[0],ownership:'foreign'}]},{avatarId:'owned_look'})).toThrow();
  for(const detail of [{id:'foreign_group'},{id:'owned_group',ownership:'public'},{id:'owned_group',is_public:true}])expect(()=>catalog.decodeHeygenOwnedAvatarGroupV1(owned,detail)).toThrow();
});

const build = () => {
  const mocks = {};
  for (const [path,name] of [
    ['./video-job.service','VideoJobService'],
    ['../database/prisma/video-generation/video-generation.repository','VideoGenerationRepository'],
    ['../database/prisma/video-subscription/video-subscription.repository','VideoSubscriptionRepository'],
    ['./subscriptions/video-connection.service','VideoConnectionService'],
    ['./subscriptions/video-subscription-job.service','VideoSubscriptionJobService'],
    ['./video-media.v1','VideoMediaV1'],
  ]) mocks[path] = {[name]:class {}};
  const {VideoAccessService} = loadTypeScriptModule(`${ROOT}video-access.service.ts`, mocks);
  const piece = {id:'11111111-1111-4111-8111-111111111111', title:'Саммит в Дубае',body:'Саммит в Дубае 12 ноября: 12 команд. Спикеры пока неизвестны.',brief:{},language:'ru',updatedAt:new Date('2030-01-01T00:00:00Z')};
  const script = '  Саммит в Дубае 12 ноября: 12 команд.\nСпикеры пока неизвестны.  ';
  let draft = {id:'22222222-2222-4222-8222-222222222222',pieceId:piece.id,organizationId:'org',userId:'owner',version:1,pieceRevision:videoSourceRevisionV1(piece),
    settings:{provider:'higgsfield',model:'fixture-clip',mode:'clip',locale:'ru',duration:15,aspectRatio:'9:16',audio:false,captions:true},
    brief:{intent:'Приглашение',audience:'Участники',keyMessage:piece.title,visualIntent:'',sourceLocale:'ru',outputLocale:'ru',prompt:'Саммит',script,scriptPolicy:'exact',
      facts:[{text:piece.body,sourceId:'https://official.example/dubai-summit',policy:'must_include'}],avoidImplications:['Не выдумывать имена спикеров'],referenceMediaIds:[]}};
  const original = structuredClone(draft);
  const apiRepository = {draft:jest.fn(async()=>draft),piece:jest.fn(async()=>piece),editDraft:jest.fn(async(org,id,version,brief,settings)=>{
    if (version !== draft.version) throw new Error('CAS');
    draft = {...draft,version:version+1,brief,settings}; return draft;
  })};
  const api = {assertCurrentSource:jest.fn(async()=>{}),preflight:jest.fn(),launch:jest.fn()};
  const provider = {readOwnedCatalog:jest.fn(async()=>catalog.decodeHeygenOwnedCatalogV1(privateRows())),prepare:jest.fn(),submit:jest.fn()};
  const connections = {token:jest.fn(async()=>({connection:{provider:'heygen',generation:3,state:'discovery_required',walletDigest:'unverified:fixture'},token:'fixture',assertUsable:async()=>{}})),
    connectable:jest.fn(async()=>({provider:'heygen',enabled:false,schemaDigests:[],ownedAssetReadProfile:'heygen_private_catalog_v1'}))};
  const service = new VideoAccessService({},apiRepository,api,connections,{heygen:provider},{});
  const input = {draftId:draft.id,version:1,connectionId:'33333333-3333-4333-8333-333333333333',avatarId:'owned_look',voiceId:'owned_voice',engine:'avatar_iv',durationSeconds:15};
  return {service,apiRepository,api,provider,connections,input,original,get draft(){return draft;},piece};
};
test('same saved draft becomes an exact-script speaking proposal without editing the parent, quote, AI or render',async()=>{
  const f=build(); const beforePiece=structuredClone(f.piece);
  const result=await f.service.presenterPreview('org','owner',f.input);
  expect(result.id).toBe(f.original.id);expect(result.version).toBe(2);
  expect(result.brief).toEqual(f.original.brief);expect(result.preview.script).toBe(f.original.brief.script);
  expect(result.preview.script).toContain('Спикеры пока неизвестны.');expect(f.piece).toEqual(beforePiece);
  expect(result.selection).toEqual({avatar:'Мой образ',voice:'Мой голос',locale:'ru',voiceCatalogLocales:['ru'],catalogLanguageMatches:true});
  expect(result.preview).toMatchObject({kind:'script_review',generated:false,submitted:false,renderReady:false,price:null});
  expect(result.preview.blockers).toContain('VIDEO_AVATAR_CONSENT_UNVERIFIED');
  expect(result.settings).toMatchObject({provider:'heygen',mode:'presenter',avatarId:'owned_look',voiceId:'owned_voice',audio:true});
  expect(f.api.preflight).not.toHaveBeenCalled();expect(f.api.launch).not.toHaveBeenCalled();expect(f.provider.prepare).not.toHaveBeenCalled();expect(f.provider.submit).not.toHaveBeenCalled();
  await expect(f.service.presenterPreview('org','owner',f.input)).rejects.toMatchObject({response:{code:'VIDEO_DRAFT_CHANGED'}});
  const replay=await f.service.presenterPreview('org','owner',{...f.input,version:2});
  expect(replay.version).toBe(2);expect(f.apiRepository.editDraft).toHaveBeenCalledTimes(1);
});
test('English proposal preserves the selected owned Russian-tagged voice without claiming synthesis verification',async()=>{
  const f=build();
  f.draft.settings.locale='en-US';f.draft.brief.outputLocale='en-US';
  f.draft.brief.script='Dubai summit on 12 November: 12 teams. Speakers are not yet confirmed.';
  const result=await f.service.presenterPreview('org','owner',f.input);
  expect(result.settings).toMatchObject({locale:'en-US',voiceId:'owned_voice'});
  expect(result.selection).toMatchObject({voice:'Мой голос',voiceCatalogLocales:['ru'],catalogLanguageMatches:false});
  expect(result.preview).toMatchObject({generated:false,renderReady:false,price:null,script:f.draft.brief.script});
  expect(f.provider.submit).not.toHaveBeenCalled();
});
test('observed six private unverified looks and forty voices are catalog_only, never missing avatars or generation ready',async()=>{
  const f=build();const rows=privateRows();rows.groups[0].status=null;
  rows.looks=Array.from({length:6},(_,index)=>({...rows.looks[0],id:`private_look_${index}`}));
  rows.voices=Array.from({length:40},(_,index)=>({...rows.voices[0],voice_id:`private_voice_${index}`}));
  f.provider.readOwnedCatalog.mockResolvedValue(catalog.decodeHeygenOwnedCatalogV1(rows));
  const assets=await f.service.assets('org','owner',f.input.connectionId);
  expect(assets.status).toBe('catalog_only');expect(assets.blockers).toEqual([]);
  expect(assets.catalog.avatars).toHaveLength(6);expect(assets.catalog.voices).toHaveLength(40);
  expect(assets.catalog.avatars.every(avatar=>avatar.selectableForDraft&&avatar.state==='unverified')).toBe(true);
  expect(assets.catalog.renderQualified).toBe(false);expect(assets.avatars).toEqual([]);
  f.service.subscriptions.mcp={discover:jest.fn(async()=>({digest:'synthetic-read-only',reviewed:false,inventory:catalog.HEYGEN_OWNED_CATALOG_READS_V1.map(read=>({name:read.tool})),tools:[]}))};
  const readiness=await f.service.personalReadiness('org','owner',f.input.connectionId);
  expect(readiness.walletVerified).toBe(false);expect(readiness.operations.every(operation=>operation.ready===false)).toBe(true);
  expect(readiness.operations.find(operation=>operation.kind==='presenter').blockers).toContain('VIDEO_PRICE_UNAVAILABLE');
  expect(f.provider.prepare).not.toHaveBeenCalled();expect(f.provider.submit).not.toHaveBeenCalled();
});
test('foreign actor, stale draft/source, unsupported locale and arbitrary asset cannot change a speaking proposal',async()=>{
  const cases=[['VIDEO_ACCESS_DENIED',f=>({actor:'foreign'})],['VIDEO_DRAFT_CHANGED',f=>({input:{version:2}})],
    ['VIDEO_SOURCE_CHANGED',f=>{f.piece.body='Changed';return {};}],
    ['VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE',f=>({input:{voiceId:'foreign_voice'}})],
    ['VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE',f=>{f.draft.settings.locale='ja';return {};}],
    ['VIDEO_EXACT_SCRIPT_REQUIRED',f=>{f.draft.brief.scriptPolicy='adaptable';return {};}]];
  for(const [code,change] of cases){const f=build();const altered=change(f);await expect(f.service.presenterPreview('org',altered.actor??'owner',{...f.input,...altered.input})).rejects.toMatchObject({response:{code}});expect(f.apiRepository.editDraft).not.toHaveBeenCalled();expect(f.provider.submit).not.toHaveBeenCalled();}
});
test('native card keeps its chosen personal connection through saved artifact references and video refreshes',()=>{
  const ui=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const server=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/work-context.ts');
  const ref={kind:'media',id:'library',videoDraftId:'draft-1',pieceId:'piece-1',videoPersonalConnectionId:'connection-1'};
  const artifact={...ref,title:null,code:null,data:{...ref}};
  expect(ui.artifactRefOf(artifact)).toEqual(ref);
  expect(server.parseAgentWorkspacePatch({artifacts:[ref],activeArtifact:ref}).activeArtifact).toEqual(ref);
  expect(()=>server.parseAgentWorkspacePatch({artifacts:[{...ref,kind:'piece'}]})).toThrow();
  const workspace=ui.readAgentWorkspace({version:'assistant-workspace/v1',workContext:null,artifacts:[ref],activeArtifact:ref});
  expect(workspace.activeArtifact.videoPersonalConnectionId).toBe('connection-1');
  const messages=[{id:'assistant-1',role:'assistant',parts:[{type:'tool-video_presenter_preview',state:'output-available',toolCallId:'preview-1',input:{draftId:'draft-1'},output:{ok:true,card:ref}}]}];
  expect(ui.videoTouchesOf(messages)[0].artifact.data.videoPersonalConnectionId).toBe('connection-1');
});
test('route-only catalog for a personal draft never resolves an API credential or reads public API assets',async()=>{
  const mocks={
    '../openai/ai.clients':{},'../openai/ai.provider.config':{},
  };
  for(const [path,name] of [
    ['../database/prisma/video-generation/video-generation.repository','VideoGenerationRepository'],
    ['../openai/ai.usage.service','AiUsageService'],['./video-credentials.service','VideoCredentialsService'],
    ['./providers/higgsfield.provider','HiggsfieldProviderV1'],['./providers/heygen.provider','HeygenProviderV1'],
    ['./video-media.v1','VideoMediaV1'],['./video-composition.provider.v1','VideoCompositionProviderV1'],
    ['../content-intelligence/social-factory/source-artifact.service','SourceArtifactServiceV1'],
  ])mocks[path]={[name]:class {}};
  const {VideoJobService}=loadTypeScriptModule(`${ROOT}video-job.service.ts`,mocks);
  const credentials={getSettings:jest.fn(async()=>({effective:{heygen:{available:true}}})),resolve:jest.fn(async()=>({payer:'workspace_key'}))};
  const heygen={routes:[{model:'heygen-avatar'}],listAssets:jest.fn(async()=>({avatars:[{id:'synthetic-public'}],voices:[]}))};
  const service=new VideoJobService({},credentials,{}, {routes:[]},heygen,{},{});
  const safe=await service.catalog('org',{includeAssets:false});
  expect(safe.routes).toEqual(heygen.routes);expect(safe.assets).toBeUndefined();
  expect(credentials.resolve).not.toHaveBeenCalled();expect(heygen.listAssets).not.toHaveBeenCalled();
  await service.catalog('org');
  expect(credentials.resolve).toHaveBeenCalledTimes(1);expect(heygen.listAssets).toHaveBeenCalledTimes(1);
});
