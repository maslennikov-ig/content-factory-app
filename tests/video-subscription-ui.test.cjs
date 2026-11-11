const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const ui=()=>loadTypeScriptModule('apps/frontend/src/components/videos/video-ui.v2.ts');
const draft={id:'draft',version:3};
const access={kind:'subscription',connectionId:'personal'};
const approval=()=>({id:'approval',preflightId:'approval',draftId:'draft',version:3,access,quote:{amount:'0.125',unit:'higgsfield_credit',expiresAt:'2040-01-01T00:00:00Z'},expiresAt:'2040-01-01T00:00:00Z'});
test.each(['en-US','ru-RU'])('unknown price is approvable only for the explicit bounded personal HeyGen snapshot in %s',locale=>{
  const {videoApprovalCurrentV2}=ui();
  const value={...approval(),access:{kind:'subscription',connectionId:'owned'},unknownPrice:true,billing:'personal_subscription',maximumJobs:1,
    settings:{provider:'heygen',engine:'avatar_iv',resolution:'720p',aspectRatio:'9:16',locale},
    quote:{amount:null,unit:'heygen_credit',source:'unavailable',upperBound:null,expiresAt:'2040-01-01T00:00:00Z'},
    remaining:'200',selection:{avatar:'My avatar',voice:'My voice'}};
  const now=Date.parse('2030-01-01T00:00:00Z');
  expect(videoApprovalCurrentV2(value,now)).toBe(true);
  for(const changed of [{unknownPrice:false},{billing:'api'},{maximumJobs:2},{remaining:'0'},
    {quote:{...value.quote,unit:'USD'}},{settings:{...value.settings,resolution:'4k'}},{settings:{...value.settings,locale:'fr-FR'}}])
    expect(videoApprovalCurrentV2({...value,...changed},now)).toBe(false);
});
test('launch requires the exact saved draft/access, a current known unit amount, and no unsaved edits',()=>{
  const {videoCanLaunchV2,videoApprovalCurrentV2}=ui();const a=approval();expect(videoCanLaunchV2(draft,a,access,false)).toBe(true);
  for(const candidate of [null,{kind:'api',payer:'included'},{kind:'subscription',connectionId:'colleague'},{kind:'manual',provider:'higgsfield'}])expect(videoCanLaunchV2(draft,a,candidate,false)).toBe(false);
  expect(videoCanLaunchV2(draft,a,access,true)).toBe(false);expect(videoCanLaunchV2({...draft,version:4},a,access,false)).toBe(false);
  expect(videoApprovalCurrentV2({...a,quote:{...a.quote,amount:null}})).toBe(false);
  expect(videoApprovalCurrentV2({...a,quote:{...a.quote,expiresAt:'2020-01-01T00:00:00Z'}})).toBe(false);
});
test('private local intent keys isolate actors and workspaces; manual export preserves exact script/options',()=>{
  const {videoPendingKeyV2,videoManualTextV2,VIDEO_PROVIDER_SITES_V2}=ui();
  expect(new Set([videoPendingKeyV2('a','person1','draft'),videoPendingKeyV2('a','person2','draft'),videoPendingKeyV2('b','person1','draft')]).size).toBe(3);
  const script='Масса 12,5 кг. Продукт не содержит сахар.';
  const text=videoManualTextV2({prompt:'Камера неподвижна',script,facts:[],avoidImplications:[],referenceMediaIds:[],scriptPolicy:'exact'},{locale:'ru',engine:'avatar_iii'});
  expect(text).toContain(script);expect(text).toContain('avatar_iii');
  for(const site of Object.values(VIDEO_PROVIDER_SITES_V2)){const url=new URL(site);expect(url.search).toBe('');expect(url.protocol).toBe('https:');}
});
test('owned facade download is authenticated and never reads a remote provider URL',async()=>{
  const {downloadOwnedVideoV2}=ui();const request=jest.fn(async()=>new Response('{}',{status:403}));
  await expect(downloadOwnedVideoV2(request,'owned-id','file.mp4')).rejects.toThrow('VIDEO_DOWNLOAD_FAILED');expect(request).toHaveBeenCalledWith('/media/video-v2/jobs/owned-id/download');
});
test('personal presenter engines use only accepted III/IV from the selected look, preserving raw metadata and API choices',()=>{
  const {videoPresenterEngineOptionsV2}=ui();
  const assets={avatars:[{id:'look-a',engines:['avatar_v','avatar_iv','avatar_iii']},{id:'look-b',engines:['avatar_v','avatar_iii']}],engines:['avatar_iv','avatar_iii']};
  const before=structuredClone(assets);
  expect(videoPresenterEngineOptionsV2('subscription',assets,'look-a')).toEqual(['avatar_iv','avatar_iii']);
  expect(videoPresenterEngineOptionsV2('subscription',assets,'look-b')).toEqual(['avatar_iii']);
  for(const selected of [undefined,'missing'])expect(videoPresenterEngineOptionsV2('subscription',assets,selected)).toEqual([]);
  expect(videoPresenterEngineOptionsV2('api',assets,'look-a')).toEqual(['avatar_v','avatar_iv','avatar_iii']);
  expect(videoPresenterEngineOptionsV2('api',assets,'missing')).toEqual(assets.engines);
  expect(assets).toEqual(before);
});
