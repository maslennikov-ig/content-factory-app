const {randomUUID}=require('node:crypto');
const {create}=require('./helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const LIB='libraries/nestjs-libraries/src/';
const DB=process.env.CF_VIDEO_DATABASE_URL;
const integration=DB?test:test.skip;
jest.setTimeout(45000);
const SCRIPT='Приглашаю вас на встречу. Поговорим о развитии бизнеса и новых идеях. Буду рад вас видеть.';
async function fixture(){
 const f=await create(DB);
 try{
  const connection=await f.connect('heygen',{limits:false}),definition=f.provider.runtime.definition.bind(f.provider.runtime);
  f.provider.runtime.definition=name=>name==='heygen'?{...definition(name),enabled:false,identityEndpoint:undefined,schemaDigests:[],ownedAssetReadProfile:'heygen_private_catalog_v1'}:definition(name);
  await f.db.videoSubscriptionConnection.update({where:{id:connection.connectionId},data:{state:'discovery_required',walletDigest:`unverified:${randomUUID()}`}});
  const catalog={scope:'authenticated_private_account',readOnly:true,renderQualified:false,
   avatars:[{id:'owned_look',name:'Studio',ownership:'owned',state:'available',selectableForDraft:true,groupId:'owned_group',avatarType:'photo_avatar',engines:['avatar_iv'],locales:[]}],
   voices:[{id:'owned_voice',name:'Approved original',ownership:'owned',state:'available',selectableForDraft:true,engines:[],locales:['ru']}]} ;
  const account={subjectDigest:'a'.repeat(64),billingType:'subscription',plan:'creator',remaining:'200',resetAt:null};
  const mcp=f.provider.mcp;
  mcp.readHeygenAccountV1=async(_d,_t,g)=>{await g();return structuredClone(account);};
  mcp.readHeygenOwnedCatalog=async(_d,_t,g)=>{await g();return {catalog:structuredClone(catalog),avatars:[],voices:[]};};
  mcp.readHeygenOwnedAvatarGroup=async(_d,_t,input,g)=>{await g();return {...input,consentState:'accepted',looksCount:1};};
  const sends=[];mcp.renderHeygenAvatarV2=async()=>{sends.push('unexpected');throw Error('No provider send allowed in this fixture');};
  const {SocialFactoryRepository}=load(`${LIB}content-intelligence/social-factory/social-factory.repository.ts`);
  const store=new SocialFactoryRepository({model:f.db},{model:f.db});
  const {HeygenPersonProfileServiceV1}=load(`${LIB}videos/subscriptions/video-heygen-person-profile.service.v1.ts`);
  const profiles=new HeygenPersonProfileServiceV1(store,f.connections);f.access.heygenProfiles=profiles;f.subscriptions.heygenProfiles=profiles;
  const {HeygenChatControlsServiceV1}=load(`${LIB}videos/subscriptions/video-heygen-chat-controls.service.v1.ts`,{'../../content-intelligence/social-factory/autonomy/editorial-decision.service':{EditorialDecisionService:class{}}});
  const controls=new HeygenChatControlsServiceV1(profiles,f.access,{},{});
  const {HeygenPerformanceServiceV1}=load(`${LIB}videos/subscriptions/video-heygen-performance.service.v1.ts`);
  const performance=new HeygenPerformanceServiceV1(controls);
  const profileInput={profileId:randomUUID(),expectedRevision:0,connectionId:connection.connectionId,displayName:'Owned presenter',aliases:[],preferredForName:false,
   groupIds:['owned_group'],preferredGroupId:'owned_group',sourceLooks:[{groupId:'owned_group',lookId:'owned_look',roles:['style_base','appearance']}],
   preferredSourceLookId:'owned_look',defaultAppearanceLookId:'owned_look',defaultVoice:{voiceId:'owned_voice',baseline:{speed:1}}};
  const proposal=await controls.proposeProfile(f.org.id,f.user.id,profileInput);
  const profile=await controls.saveProfile(f.org.id,f.user.id,{profile:profileInput,selectionDigest:proposal.selectionDigest},'authenticated_screen_action');
  await f.db.contentPiece.update({where:{id:f.pieceId},data:{body:SCRIPT,title:'Invitation',language:'ru-RU',brief:{brief:{inputKind:'thought',facts:[{statement:SCRIPT,evidenceId:'authored',origin:'person',verified:true}]}}}});
  const raw=await f.service.prepare(f.org.id,f.user.id,{pieceId:f.pieceId,settings:{...f.presenterSettings,avatarId:'owned_look',voiceId:'owned_voice',locale:'ru-RU',duration:60},prepareWithAi:false,scriptPolicy:'exact',intent:'Keep speech exact.'});
  const draft=await controls.prepareSettings(f.org.id,f.user.id,{draftId:raw.id,version:raw.version,connectionId:connection.connectionId,profileId:profile.profileId,overrides:{expressiveness:'high'}});
  const apply=(d,revision,changes,source='assistant',extra={})=>performance.apply(f.org.id,f.user.id,{draftId:d.id,version:d.version,expectedRevision:revision,changes,...extra},source);
  const preflight=d=>f.access.preflight(f.org.id,f.user.id,{draftId:d.id,version:d.version,access:{kind:'subscription',connectionId:connection.connectionId}});
  return Object.assign(f,{store,profiles,controls,performance,profile,profileInput,draft,apply,preflightPerformance:preflight,sends,catalog,connectionId:connection.connectionId});
 }catch(e){await f.close();throw e;}
}
integration('shared performance saves low contextual defaults and exact draft atomically, with actual settings separate from unavailable intent',async()=>{
 const f=await fixture();try{
  expect(await f.performance.read(f.org.id,f.user.id,f.draft.id)).toMatchObject({revision:0,applied:false});
  const result=await f.apply(f.draft,0,{context:'invitation'});
  expect(result).toMatchObject({revision:1,draftVersion:f.draft.version+1,applied:false,values:{context:'invitation',facialIntensity:'low'},effectiveSettings:{expressiveness:'low',motionPrompt:null}});
  expect(result.limitations).toEqual(expect.arrayContaining([expect.objectContaining({code:'motion_long_iv_unavailable'})]));
  expect(result.draft.brief.script).toBe(SCRIPT);expect(result.draft.settings.heygenV2.settings.voiceId).toBe('owned_voice');
  expect((await f.performance.read(f.org.id,f.user.id,f.draft.id)).values).toEqual(result.values);
  const approval=await f.preflightPerformance(result.draft);expect(approval.draftId).toBe(f.draft.id);
  expect((await f.controls.resolveProfile(f.org.id,f.user.id,{connectionId:f.connectionId,profileId:f.profile.profileId})).defaultVoice.baseline.speed).toBe(1);
  expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('manual edits persist against model proposals; only an explicit manual release re-enables automatic selection',async()=>{
 const f=await fixture();try{
  const one=await f.apply(f.draft,0,{context:'invitation',facialIntensity:'low'},'manual');
  const two=await f.apply(one.draft,1,{context:'promotion',facialIntensity:'high',delivery:'energetic'});
  expect(two.values.context).toBe('invitation');expect(two.values.facialIntensity).toBe('low');
  expect(two.lockedFields).toEqual(expect.arrayContaining(['context','facialIntensity']));
  await expect(f.apply(two.draft,2,{},'assistant',{releaseFields:['facialIntensity']})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_MANUAL_REQUIRED'}});
  const three=await f.apply(two.draft,2,{},'manual',{releaseFields:['facialIntensity']});
  expect(three.lockedFields).not.toContain('facialIntensity');expect(three.values.facialIntensity).toBe('medium');expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('unavailable user-locked gaze is retained but cannot pass actual preflight',async()=>{
 const f=await fixture();try{
  const result=await f.apply(f.draft,0,{gaze:'camera'},'manual');
  expect(result.applied).toBe(false);expect(result.lockedFields).toContain('gaze');
  await expect(f.preflightPerformance(result.draft)).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_CUE_UNAVAILABLE'}});
  expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('qualified Avatar V can carry camera gaze and restrained expression in one request, with a single contextual accent',async()=>{
 const f=await fixture();try{
  const look=f.catalog.avatars[0];
  look.avatarType='digital_twin';look.engines=['avatar_iv','avatar_v'];
  const d=await f.controls.prepareSettings(f.org.id,f.user.id,{draftId:f.draft.id,version:f.draft.version,connectionId:f.connectionId,
    profileId:f.profile.profileId,overrides:{engine:{type:'avatar_v'}}});
  const result=await f.apply(d,0,{context:'thanks',gaze:'camera',facialIntensity:'low',gestures:'sparse'},'manual');
  expect(result.applied).toBe(true);
  expect(result.effectiveSettings.expressiveness).toBeNull();
  const approval=await f.preflightPerformance(result.draft);
  const row=await f.db.videoAccessPreflight.findUnique({where:{id:approval.id}});
  expect(row.request.args).toMatchObject({script:SCRIPT,voiceId:'owned_voice',engine:{type:'avatar_v'}});
  expect(row.request.args.motionPrompt).toMatch(/relaxed gaze toward the camera.*understated expression.*one hand over your heart once.*return it to rest/i);
  expect(row.request.args).not.toHaveProperty('expressiveness');
  expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('foreign actor and stale draft/plan revisions fail without rewriting settings or creating a plan',async()=>{
 const f=await fixture();try{
  await expect(f.performance.apply(f.org.id,f.otherUser.id,{draftId:f.draft.id,version:f.draft.version,expectedRevision:0,changes:{}},'manual')).rejects.toThrow();
  await expect(f.apply(f.draft,9,{context:'thanks'})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_CHANGED'}});
  expect((await f.access.apiRepository.draft(f.org.id,f.draft.id)).version).toBe(f.draft.version);
  expect((await f.performance.read(f.org.id,f.user.id,f.draft.id)).revision).toBe(0);
 }finally{await f.close();}
});
integration('two concurrent saves have one complete CAS winner and one refusal, never a split draft/record',async()=>{
 const f=await fixture();try{
  const results=await Promise.allSettled([f.apply(f.draft,0,{context:'invitation'}),f.apply(f.draft,0,{context:'serious'})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const saved=await f.performance.read(f.org.id,f.user.id,f.draft.id),draft=await f.access.apiRepository.draft(f.org.id,f.draft.id);
  expect(saved.revision).toBe(1);expect(saved.draftVersion).toBe(draft.version);expect(draft.version).toBe(f.draft.version+1);
  expect(draft.settings.heygenV2.settings.expressiveness).toBe(saved.values.facialIntensity);
  expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('later ordinary draft edits invalidate the performance review at actual preflight',async()=>{
 const f=await fixture();try{
  const one=await f.apply(f.draft,0,{context:'invitation'});
  const edited=await f.controls.prepareSettings(f.org.id,f.user.id,{draftId:one.draft.id,version:one.draft.version,connectionId:f.connectionId,profileId:f.profile.profileId,overrides:{voiceSettings:{speed:1.1}}});
  expect((await f.performance.read(f.org.id,f.user.id,f.draft.id)).limitations).toEqual(expect.arrayContaining([expect.objectContaining({code:'draft_changed'})]));
  await expect(f.preflightPerformance(edited)).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_PLAN_STALE'}});
 }finally{await f.close();}
});
integration('future preference is an explicit separate save and does not rewrite identity, voice or the draft',async()=>{
 const f=await fixture();try{
  const one=await f.apply(f.draft,0,{facialIntensity:'low'},'manual');
  const p=await f.performance.savePreference(f.org.id,f.user.id,{draftId:one.draft.id,version:one.draft.version,expectedRevision:1});
  expect(p.preferenceSaved).toBe(true);expect((await f.access.apiRepository.draft(f.org.id,f.draft.id)).version).toBe(one.draft.version);
  expect((await f.profiles.read(f.org.id,f.user.id,f.profile.profileId,{catalog:{},accountDigest:'a'.repeat(64),accountGeneration:1})).revision).toBe(f.profile.revision);
  expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('feedback saves exact fragment without generating or altering a saved plan, and refuses stale fragments',async()=>{
 const f=await fixture();try{
  const one=await f.apply(f.draft,0,{context:'invitation'});
  const input={draftId:one.draft.id,version:one.draft.version,expectedRevision:1,text:'Слишком активная мимика',fragment:{start:0,end:10,exactText:SCRIPT.slice(0,10)}};
  expect((await f.performance.feedback(f.org.id,f.user.id,input)).feedbackSaved).toBe(true);
  await expect(f.performance.feedback(f.org.id,f.user.id,{...input,fragment:{...input.fragment,exactText:'Другой текст'}})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_FRAGMENT_CHANGED'}});
  expect((await f.performance.read(f.org.id,f.user.id,f.draft.id)).revision).toBe(1);expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('a model can resolve a retained user wish into typed controls without injecting wish bytes into provider motion',async()=>{
 const f=await fixture();try{
  const manual=await f.apply(f.draft,0,{wish:'Без гипермимики'},'manual');
  expect(manual.limitations.some(x=>x.code==='uncompiled_wish')).toBe(true);
  const resolved=await f.apply(manual.draft,1,{facialIntensity:'low'},'assistant',{wishResolution:{wishDigest:manual.wishDigest,fields:['facialIntensity'],rationale:'The user requests restrained facial acting, represented by low expressiveness.'}});
  expect(resolved.values.wish).toBe('Без гипермимики');expect(resolved.lockedFields).toContain('wish');
  expect(resolved.limitations.some(x=>x.code==='uncompiled_wish')).toBe(false);
  expect(resolved.draft.settings.heygenV2.settings.motionPrompt).toBeUndefined();
  await f.preflightPerformance(resolved.draft);expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration.each(['preference','feedback'])('a concurrent draft edit cannot commit stale %s',async(kind)=>{
 const f=await fixture();try{
  const one=await f.apply(f.draft,0,{context:'invitation'}),original=f.store.transactVideoDraft.bind(f.store);
  f.store.transactVideoDraft=async work=>{await f.db.videoPromptDraft.update({where:{id:one.draft.id},data:{version:{increment:1}}});return original(work);};
  const input={draftId:one.draft.id,version:one.draft.version,expectedRevision:1};
  await expect(kind==='preference'?f.performance.savePreference(f.org.id,f.user.id,input):f.performance.feedback(f.org.id,f.user.id,{...input,text:'Looks away'})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_CHANGED'}});
  expect(await f.db.socialFactoryRecord.count({where:{organizationId:f.org.id,kind:kind==='preference'?'heygen_performance_preference':'heygen_performance_feedback'}})).toBe(0);
 }finally{await f.close();}
});

async function savedRender(f, draft, {duration = 65.516, owner = f.user.id} = {}) {
 const id=randomUUID(), path=`/uploads/fixture-${id}.mp4`;
 const media=await f.db.media.create({data:{organizationId:f.org.id,name:'Fixture completed MP4',path,type:'video'}});
 return f.db.videoSubscriptionJob.create({data:{id,organizationId:f.org.id,actorId:owner,pieceId:draft.pieceId,
  pieceRevision:draft.pieceRevision??draft.settings.heygenV2.binding.sourcePin.sourceRevision,
  draftId:draft.id,draftVersion:draft.version,preflightId:randomUUID(),intentId:randomUUID(),connectionId:f.connectionId,walletDigest:'fixture',
  generation:1,provider:'heygen',unit:'heygen_credit',snapshot:{brief:draft.brief,settings:draft.settings},
  request:{kind:'heygen-personal-avatar-request/v2',recipe:{fixture:true}},quote:{},state:'completed',reserved:0,period:'fixture',
  receipt:{id:'fixture-provider-receipt'},resultMediaId:media.id,
  storedFile:{path,metadata:duration === null ? {source:'provider_reported',durationSeconds:90} : {source:'mp4_bytes',durationSeconds:duration}}}});
}

integration('actual observation survives reload with an owned historical receipt and drafts a correction without a new job',async()=>{
 const f=await fixture();try{
  const before=await f.apply(f.draft,0,{gaze:'natural'},'manual');
  const job=await savedRender(f,before.draft);
  const next=await f.apply(before.draft,1,{context:'invitation',facialIntensity:'medium'});
  const current={draftId:next.draft.id,version:next.draft.version,expectedRevision:next.revision};
  const input={...current,text:'At 00:09–00:16 the expression feels too strong.',render:{jobId:job.id,startMs:9000,endMs:16000},
   fragment:{start:0,end:11,exactText:SCRIPT.slice(0,11)}};
  const [a,b]=await Promise.all([f.performance.feedback(f.org.id,f.user.id,input),f.performance.feedback(f.org.id,f.user.id,input)]);
  expect(a.feedbackSaved).toBe(true);expect(b.feedbackId).toBe(a.feedbackId);
  const read=await f.performance.feedbackRead(f.org.id,f.user.id,current.draftId,job.id);
  expect(read).toEqual({draftId:current.draftId,draftVersion:current.version,revision:current.expectedRevision,
   target:{kind:'render',draftVersion:before.draft.version,jobId:job.id,durationMs:65516},observations:[{id:a.feedbackId,
    draftVersion:before.draft.version,text:input.text,createdAt:expect.any(String),fragment:input.fragment,render:input.render}]});
  const stored=await f.store.read(f.org.id,'heygen_performance_feedback',a.feedbackId);
  expect(stored.payload).toMatchObject({draftVersion:before.draft.version,planDigest:null,scriptDigest:expect.stringMatching(/^[a-f0-9]{64}$/),
   render:{mediaId:job.resultMediaId,receiptDigest:expect.stringMatching(/^[a-f0-9]{64}$/),requestDigest:expect.stringMatching(/^[a-f0-9]{64}$/)}});
  const proposal=await f.performance.proposeFeedbackCorrection(f.org.id,f.user.id,{...current,feedbackId:a.feedbackId,changes:{facialIntensity:'low',gaze:'camera'}});
  expect(proposal).toMatchObject({feedbackId:a.feedbackId,draftVersion:current.version,changes:{facialIntensity:'low'},lockedFields:['gaze'],generated:false,submitted:false});
  expect((await f.access.apiRepository.draft(f.org.id,current.draftId)).version).toBe(current.version);
  await expect(f.apply(next.draft,next.revision,{gaze:'camera'},'manual',{feedbackId:a.feedbackId})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_CORRECTION_UNAVAILABLE'}});
  const revised=await f.apply(next.draft,next.revision,proposal.changes,'manual',{feedbackId:a.feedbackId});
  expect(revised).toMatchObject({draftVersion:current.version+1,values:{gaze:'natural',facialIntensity:'low'},generated:false,submitted:false});
  expect(revised.draft.brief.script).toBe(SCRIPT);expect(revised.draft.settings.heygenV2.settings.voiceId).toBe('owned_voice');
  expect((await f.performance.feedbackRead(f.org.id,f.user.id,current.draftId,job.id)).observations).toEqual(read.observations);
  expect(await f.db.videoSubscriptionJob.count({where:{organizationId:f.org.id}})).toBe(1);expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});

integration('rejects substituted receipts and fabricated time ranges; whole-video feedback can still be authored',async()=>{
 const f=await fixture();try{
  const job=await savedRender(f,f.draft), unmeasured=await savedRender(f,f.draft,{duration:null}), foreign=await savedRender(f,f.draft,{owner:f.otherUser.id});
  const input={draftId:f.draft.id,version:f.draft.version,expectedRevision:0,text:'My actual observation.'};
  const save=render=>f.performance.feedback(f.org.id,f.user.id,{...input,render});
  await expect(save({jobId:foreign.id})).rejects.toMatchObject({response:{code:'VIDEO_JOB_NOT_FOUND'}});
  await expect(f.performance.feedbackRead(f.org.id,f.otherUser.id,f.draft.id,job.id)).rejects.toMatchObject({response:{code:'VIDEO_DRAFT_NOT_FOUND'}});
  await expect(f.performance.feedbackRead(f.otherOrg.id,f.user.id,f.draft.id,job.id)).rejects.toMatchObject({response:{code:'VIDEO_DRAFT_NOT_FOUND'}});
  for(const range of [{startMs:8000},{startMs:8000,endMs:1000},{startMs:8000,endMs:70000}])
   await expect(save({jobId:job.id,...range})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_TIME_RANGE_INVALID'}});
  await expect(save({jobId:unmeasured.id,startMs:0,endMs:1000})).rejects.toMatchObject({response:{code:'VIDEO_PERFORMANCE_DURATION_UNAVAILABLE'}});
  await f.db.media.update({where:{id:job.resultMediaId},data:{deletedAt:new Date()}});
  await expect(save({jobId:job.id})).rejects.toMatchObject({response:{code:'VIDEO_JOB_NOT_FOUND'}});
  const one=await save({jobId:unmeasured.id});
  expect(await f.performance.feedbackRead(f.org.id,f.user.id,f.draft.id,unmeasured.id)).toMatchObject({
   target:{kind:'render',durationMs:null},observations:[{id:one.feedbackId,render:{jobId:unmeasured.id}}]});
  expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});

integration('a saved derived appearance keeps its real lineage while reusing the original approved person and voice',async()=>{
 const f=await fixture();try{
  const {subscriptionHash}=load(`${LIB}videos/subscriptions/video-provider-registry.ts`);
  const settings=structuredClone(f.draft.settings),binding=settings.heygenV2.binding;
  const profile=await f.profiles.freeze(f.org.id,f.user.id,{connectionId:f.connectionId,profileId:f.profile.profileId,expectedRevision:f.profile.revision,expectedDigest:f.profile.digest},
   {accountDigest:'a'.repeat(64),accountGeneration:binding.accountGeneration});
  const image=await f.db.media.create({data:{organizationId:f.org.id,name:'Owned style fixture',path:'/uploads/owned-style-fixture.png',fileSize:1,type:'image'}});
  const operationId=randomUUID(),requestHash='b'.repeat(64),lookId='owned_derived_look';
  const row=await f.store.put({organizationId:f.org.id,kind:'heygen_style_operation',id:operationId,expectedRevision:0,parentId:`heygen-style:actor:${f.user.id}`,
   payload:{context:{actorId:f.user.id,organizationId:f.org.id,profile},requestHash,children:[{lookId,groupId:'owned_group',state:'saved',image:{mediaId:image.id}}]}});
  const lineage={...profile,appearanceLookId:lookId,operationId,operationRevision:row.revision,requestHash,mediaId:image.id};
  binding.appearanceLineage={operationId,operationRevision:row.revision,requestHash,mediaId:image.id,
   lineageDigest:subscriptionHash({kind:'heygen-style-appearance/v1',organizationId:f.org.id,actorId:f.user.id,lineage})};
  settings.avatarId=lookId;settings.heygenV2.settings.appearanceLookId=lookId;
  f.catalog.avatars.push({...f.catalog.avatars[0],id:lookId,name:'Owned derived studio'});
  const styled=await f.access.apiRepository.editDraft(f.org.id,f.draft.id,f.draft.version,f.draft.brief,settings);
  const result=await f.apply(styled,0,{context:'invitation'});
  expect(result.draft.settings.heygenV2.settings.appearanceLookId).toBe(lookId);
  expect(result.draft.settings.heygenV2.settings.voiceId).toBe('owned_voice');
  expect(result.draft.settings.heygenV2.binding.appearanceLineage).toEqual(binding.appearanceLineage);expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('delivery preparation cannot adopt a different owned voice under the original human profile binding',async()=>{
 const f=await fixture();try{
  f.catalog.voices.push({...f.catalog.voices[0],id:'other_owned_voice'});
  const settings=structuredClone(f.draft.settings);settings.voiceId='other_owned_voice';settings.heygenV2.settings.voiceId='other_owned_voice';
  const tampered=await f.access.apiRepository.editDraft(f.org.id,f.draft.id,f.draft.version,f.draft.brief,settings);
  await expect(f.apply(tampered,0,{context:'invitation'})).rejects.toMatchObject({response:{code:'VIDEO_HEYGEN_SETTING_UNAVAILABLE',setting:'voice_engine'}});
  expect((await f.performance.read(f.org.id,f.user.id,f.draft.id)).revision).toBe(0);expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
integration('an explicitly saved presenter preference retains manual restraint on a new draft while context remains automatic',async()=>{
 const f=await fixture();try{
  const one=await f.apply(f.draft,0,{context:'invitation',facialIntensity:'low'},'manual');
  await f.performance.savePreference(f.org.id,f.user.id,{draftId:one.draft.id,version:one.draft.version,expectedRevision:1});
  const next=await f.access.apiRepository.createDraft({organizationId:f.org.id,userId:f.user.id,pieceId:one.draft.pieceId,pieceRevision:one.draft.pieceRevision,brief:one.draft.brief,settings:one.draft.settings});
  const inherited=await f.performance.read(f.org.id,f.user.id,next.id);
  expect(inherited.revision).toBe(0);expect(inherited.lockedFields).toContain('facialIntensity');expect(inherited.lockedFields).not.toContain('context');
  const result=await f.apply(next,0,{context:'promotion',delivery:'energetic',facialIntensity:'high'});
  expect(result.values.context).toBe('promotion');expect(result.values.facialIntensity).toBe('low');expect(f.sends).toHaveLength(0);
 }finally{await f.close();}
});
