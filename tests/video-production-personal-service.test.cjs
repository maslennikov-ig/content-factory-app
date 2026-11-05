'use strict';
const {randomUUID}=require('node:crypto');
const {Prisma}=require('@prisma/client');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const root='libraries/nestjs-libraries/src/videos/production/';
const token=class{};
const {VideoProductionPersonalServiceV2}=loadTypeScriptModule(root+'video-production.personal.service.v2.ts',{
 '../../database/prisma/video-production/video-production.repository':{VideoProductionRepository:token},
 '../../database/prisma/video-generation/video-generation.repository':{VideoGenerationRepository:token},
 '../video-access.service':{VideoAccessService:token},'../video-media.v1':{VideoMediaV1:token},
});
const {VideoProductionService}=loadTypeScriptModule(root+'video-production.service.ts',{
 './video-production.personal.service.v2':{VideoProductionPersonalServiceV2},
 '../../database/prisma/video-production/video-production.repository':{VideoProductionRepository:token},
 '../../database/prisma/video-generation/video-generation.repository':{VideoGenerationRepository:token,VIDEO_PENDING_V1:[]},
 '../video-job.service':{VideoJobService:token},'../video-credentials.service':{VideoCredentialsService:token},
 '../video-media.v1':{VideoMediaV1:token},'../providers/heygen.provider':{HeygenProviderV1:token},'../providers/higgsfield.provider':{HiggsfieldProviderV1:token},
});
const {videoSourceRevisionV1,validateVideoGroundingV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/video-brief.v1.ts');
const copy=value=>structuredClone(value);
const fail=code=>{throw Object.assign(new Error(code),{code});};

function fixture(){
 const connections={heygen:randomUUID(),higgsfield:randomUUID()};
 const piece={id:randomUUID(),title:'Approved source',body:'Exact source facts.',brief:{},language:'ru',updatedAt:new Date('2026-11-03T12:00:00Z')};
 const manifest={version:1,pieceId:piece.id,pieceRevision:videoSourceRevisionV1(piece),title:'Two approved scenes',locale:'ru',aspectRatio:'16:9',resolution:'1080p',durationSeconds:30,audio:true,captions:true,
  scenes:[{id:'first',kind:'presenter',durationSeconds:15,script:'Первая согласованная реплика.',avatarId:'owned-avatar',voiceId:'owned-voice',engine:'avatar_iii'},
   {id:'second',kind:'presenter',durationSeconds:15,script:'Вторая согласованная реплика.',avatarId:'owned-avatar',voiceId:'owned-voice',engine:'avatar_iii'}]};
 const funding={kind:'personal_subscription',connections,finalProvider:'higgsfield'};
 const limits={creditLimits:[{connectionId:connections.heygen,unit:'heygen_credit',maxCredits:'30'},{connectionId:connections.higgsfield,unit:'higgsfield_credit',maxCredits:'10'}]};
 const state={rows:new Map(),jobs:new Map(),media:new Map(),finalReady:true,revoked:false,generation:1,quotes:[],dispatch:[],api:0,finalFreezes:0};
 const repo={
  read:async(org,id)=>{const row=state.rows.get(id);return row?.organizationId===org?copy(row):null;},
  list:async(org)=>[...state.rows.values()].filter(row=>row.organizationId===org).map(copy),
  create:async input=>{const parent=state.rows.get(input.parentId);const row={...copy(input),id:randomUUID(),productionId:parent?.productionId??randomUUID(),revision:parent?parent.revision+1:1,parentId:input.parentId??null,state:'draft',approval:null,stoppedAt:null,createdAt:new Date('2026-11-03'),updatedAt:new Date('2026-11-03')};state.rows.set(row.id,row);return copy(row);},
  savePersonalPreflight:async(row,approval)=>{const saved=state.rows.get(row.id);saved.state='preflight';saved.approval=copy(approval);},
  approvePersonal:async(row,approval,creates)=>{const saved=state.rows.get(row.id);if(saved.state==='approved')return copy(saved);saved.state='approved';saved.approval={...copy(approval),acceptedAt:new Date().toISOString()};
   for(const job of creates)state.jobs.set(job.id,{id:job.id,intentId:job.intentId,organizationId:row.organizationId,actorId:row.userId,pieceId:row.manifest.pieceId,connectionId:job.preparation.connectionId,
    walletDigest:job.preparation.walletDigest,provider:job.preparation.provider,unit:job.preparation.unit,generation:job.preparation.accountGeneration,state:job.state,snapshot:copy(job.snapshot),
    request:copy(job.preparation.request),reserved:new Prisma.Decimal(job.preparation.perJob),actualCost:null,costCertainty:'unknown',resultMediaId:null});return copy(saved);},
  personalJobByIntent:async(org,intent)=>[...state.jobs.values()].find(job=>job.organizationId===org&&job.intentId===intent)??null,
  unresolvedPersonalScene:async(org,actor,productionId,sceneId)=>[...state.rows.values()].some(row=>row.organizationId===org&&row.userId===actor&&row.productionId===productionId&&row.approval?.acceptedAt&&row.approval.scenes.some(scene=>scene.sceneId===sceneId&&scene.jobId&&!['completed','failed','canceled'].includes(state.jobs.get(scene.jobId)?.state))),
  subscriptionJob:async(org,id)=>{const row=state.jobs.get(id);return row?.organizationId===org?row:null;},
  finalPersonalJob:async(row,job)=>{const old=state.jobs.get(job.id);if(old.state!=='awaiting_assets')return old;state.finalFreezes++;old.state='accepted';old.request=copy(job.preparation.request);old.snapshot=copy(job.snapshot);return old;},
  recordPersonalFinalPreparationError:async(org,id,jobId,code)=>{const job=state.jobs.get(jobId);if(job?.state!=='awaiting_assets')return false;job.errorCode=code;state.rows.get(id).state='needs_attention';return true;},
  resumePersonalFinal:async(org,actor,id,approvalId,digest)=>{scoped(org,actor);const row=state.rows.get(id),final=state.jobs.get(row.approval.final.jobId);if(row.approval.id!==approvalId||row.digest!==digest||row.stoppedAt||final.state!=='awaiting_assets'||final.receipt||final.submitAttempts)fail('VIDEO_PRODUCTION_APPROVAL_STALE');row.state='approved';final.errorCode=null;return copy(row);},
  setState:async(org,id,value)=>{if(state.rows.get(id)?.organizationId===org)state.rows.get(id).state=value;},
  resume:async(org,id)=>{if(state.rows.get(id)?.organizationId===org)state.rows.get(id).state='approved';},
  stopPersonal:async(org,actor,id)=>{const row=state.rows.get(id);if(row.organizationId!==org||row.userId!==actor)fail('VIDEO_ACCESS_DENIED');row.state='stopped';row.stoppedAt=new Date();},
 };
 const scoped=(org,actor)=>{if(org!=='org'||actor!=='actor')fail('VIDEO_ACCESS_DENIED');if(state.revoked)fail('VIDEO_REAUTH_REQUIRED');};
 const connection=id=>{const provider=id===connections.heygen?'heygen':id===connections.higgsfield?'higgsfield':fail('VIDEO_REAUTH_REQUIRED');return {id,provider,generation:state.generation,walletDigest:`verified-wallet-${provider}`,unit:`${provider}_credit`,perJob:new Prisma.Decimal(10),perMonth:new Prisma.Decimal(100)};};
 const access={repository:{member:async(org,actor)=>scoped(org,actor)},connections:{token:async(org,actor,id,generation)=>{scoped(org,actor);const row=connection(id);if(generation!==undefined&&generation!==row.generation)fail('VIDEO_CONNECTION_CHANGED');return {connection:row,assertUsable:async()=>scoped(org,actor)};}},
  personalReadiness:async(org,actor,id)=>{scoped(org,actor);const row=connection(id);return {connectionId:id,provider:row.provider,accountGeneration:row.generation,walletVerified:true,unit:row.unit,schema:{digest:'a'.repeat(64),reviewed:true,observedToolNames:[]},operations:['presenter','generated_clip','narration','captions','final_composition'].map(kind=>({kind,ready:kind!=='final_composition'||state.finalReady,blockers:kind==='final_composition'&&!state.finalReady?['VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE:final_composition']:[]}))};},
  preparePersonalOperation:async(org,actor,input)=>{scoped(org,actor);state.quotes.push(copy(input));if(input.production?.stage==='ready_assets'&&state.finalQuoteError)fail(state.finalQuoteError);const row=connection(input.connectionId);if(input.settings)validateVideoGroundingV1(input.brief,input.settings);return {connectionId:input.connectionId,provider:row.provider,accountGeneration:row.generation,operation:input.operation,request:{tool:input.operation==='final_composition'?'fixture_reviewed_fixed_composition':'fixture_reviewed_generation',args:{operation:input.operation,production:input.production??null,settings:input.settings??null},schemaDigest:'a'.repeat(64),quote:{amount:'2',unit:row.unit,source:'local_provider_fixture',asOf:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z',upperBound:'3'}}};},
  subscriptions:{dispatch:async job=>{if(job.state==='awaiting_assets')fail('DEFERRED_FINAL_DISPATCHED');state.dispatch.push(job.id);},view:async job=>({id:job.id,state:job.state,result:job.resultMediaId?state.media.get(job.resultMediaId):null}),
   action:async(org,actor,id,action)=>{scoped(org,actor);const job=await repo.subscriptionJob(org,id);if(!job)fail('VIDEO_JOB_NOT_FOUND');if(action!=='retry-save'||job.state!=='save_failed')fail('VIDEO_SAVE_RETRY_UNAVAILABLE');job.state='saving';}},
  action:async()=>{state.api++;fail('MIXED_FACADE_MUST_NOT_BE_USED');},
 };
 const generations={piece:async(org,id)=>org==='org'&&id===piece.id?piece:null,references:async(org,ids)=>org==='org'?ids.map(id=>state.media.get(id)).filter(Boolean):[],media:async(org,id)=>org==='org'?state.media.get(id)??null:null};
 const media={inspectOwnedVideo:async(path)=>({source:'mp4_bytes',width:1920,height:1080,durationSeconds:path.includes('final')?30:15,sha256:'b'.repeat(64)})};
 const make=()=>new VideoProductionPersonalServiceV2(repo,generations,access,media);
 const p=make();
 const forbidden=new Proxy({},{get:()=>()=>{state.api++;fail('API_FALLBACK_FORBIDDEN');}});
 const main=new VideoProductionService(repo,generations,forbidden,forbidden,forbidden,forbidden,forbidden,forbidden,media,{start:async()=>{}},p);
 const create=(extra={})=>main.createRevision('org','actor',{manifest,funding,intentId:randomUUID(),...extra});
 const approve=async row=>{const ready=await p.preflight('org','actor',row.id,limits);expect(ready.approval.blockers).toEqual([]);return p.approveAndLaunch('org','actor',row.id,{approvalId:ready.approval.id,digest:ready.digest});};
 const complete=job=>{job.state='completed';job.resultMediaId=randomUUID();job.providerResult={captionsBurned:true};state.media.set(job.resultMediaId,{id:job.resultMediaId,type:'video',name:'Owned.mp4',path:job.intentId.includes('final')?'/owned-final.mp4':'/owned-scene.mp4'});};
 return {state,repo,p,main,make,piece,manifest,funding,limits,connections,create,approve,complete};
}

test('personal draft retains funding without accounts; USD API entry cannot preflight it',async()=>{
 const f=fixture(),row=await f.create({funding:{kind:'personal_subscription',connections:{}}});
 expect(row.funding).toEqual({kind:'personal_subscription',apiFallback:false});expect(row.manifest.funding.connections).toEqual({});
 await expect(f.main.preflight('org','actor',row.id,{maxTotalUsd:20})).rejects.toMatchObject({response:{code:'VIDEO_PRODUCTION_PERSONAL_CREDIT_LIMITS_REQUIRED'}});
 expect(f.state.api).toBe(0);expect(f.state.jobs.size).toBe(0);
});

test('unsupported final operation retains the project and blocks before scene quotes or any spending',async()=>{
 const f=fixture();f.state.finalReady=false;const row=await f.create();const checked=await f.p.preflight('org','actor',row.id,f.limits);
 expect(checked.approval.blockers).toContain('VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE:final_composition');expect(f.state.quotes).toEqual([]);
 await expect(f.p.approveAndLaunch('org','actor',row.id,{approvalId:checked.approval.id,digest:checked.digest})).rejects.toMatchObject({response:{code:'VIDEO_PRODUCTION_PREFLIGHT_BLOCKED'}});
 expect(f.state.rows.has(row.id)).toBe(true);expect(f.state.jobs.size).toBe(0);expect(f.state.dispatch).toEqual([]);expect(f.state.api).toBe(0);
});

test('personal scenes and deferred final use native credit reservations; final never dispatches early',async()=>{
 const f=fixture(),row=await f.create(),approved=await f.approve(row),saved=f.state.rows.get(row.id),final=f.state.jobs.get(saved.approval.final.jobId);
 expect(approved.cost.kind).toBe('personal_subscription');expect(JSON.stringify(approved.approval)).not.toMatch(/maxTotalUsd|reservedUsd|estimatesUsd/);
 expect(f.state.quotes[0].operation).toBe('final_composition');expect(final.state).toBe('awaiting_assets');expect(final.unit).toBe('higgsfield_credit');
 expect(f.state.dispatch).toHaveLength(2);expect(f.state.dispatch).not.toContain(final.id);
 const paused=await f.make().runStep('org',row.id);expect(paused.state).toBe('preparing_scenes');expect(f.state.finalFreezes).toBe(0);
 for(const plan of saved.approval.scenes)f.complete(f.state.jobs.get(plan.jobId));
 await f.make().runStep('org',row.id);expect(f.state.finalFreezes).toBe(1);expect(final.state).toBe('accepted');expect(f.state.dispatch).toContain(final.id);
 const descriptor=f.state.quotes.at(-1).production;expect(descriptor.stage).toBe('ready_assets');expect(descriptor.resolvedScenes.map(one=>one.sceneId)).toEqual(['first','second']);
 f.complete(final);expect(await f.make().runStep('org',row.id)).toEqual({state:'completed',done:true});
 const result=await f.main.get('org',row.id,'actor');expect(result.result.metadataStatus).toBe('measured');expect(result.result.durationSeconds).toBe(30);expect(f.state.api).toBe(0);
});

test('actor, revoked account generation and source changes cannot launch a saved approval',async()=>{
 for(const condition of ['actor','generation','revoked','source']){
  const f=fixture(),row=await f.create(),checked=await f.p.preflight('org','actor',row.id,f.limits);
  if(condition==='generation')f.state.generation++;
  if(condition==='revoked')f.state.revoked=true;
  if(condition==='source')f.piece.body='Changed authoritative source';
  await expect(f.p.approveAndLaunch('org',condition==='actor'?'foreign-actor':'actor',row.id,{approvalId:checked.approval.id,digest:checked.digest})).rejects.toBeDefined();
  expect(f.state.jobs.size).toBe(0);expect(f.state.api).toBe(0);
 }
});

test('selective child revision inherits personal funding and reuses only its unchanged completed scene',async()=>{
 const f=fixture(),row=await f.create();await f.approve(row);const original=f.state.rows.get(row.id);
 for(const plan of original.approval.scenes)f.complete(f.state.jobs.get(plan.jobId));
 const next=copy(f.manifest);next.scenes[1].script='Новая согласованная вторая реплика.';next.scenes[1].generationAttempt=1;
 const child=await f.main.createRevision('org','actor',{parentId:row.id,manifest:next,intentId:randomUUID()});expect(child.manifest.funding).toEqual(f.funding);
 const checked=await f.p.preflight('org','actor',child.id,f.limits);expect(checked.approval.scenes.map(one=>one.reused)).toEqual([true,false]);
 expect(checked.approval.scenes[0].jobId).toBe(original.approval.scenes[0].jobId);expect(f.state.api).toBe(0);
});

test('unknown scene outcome blocks revision launch and retry-save stays strictly subscription-owned',async()=>{
 const f=fixture(),row=await f.create();await f.approve(row);const saved=f.state.rows.get(row.id),scene=f.state.jobs.get(saved.approval.scenes[0].jobId);
 scene.state='submission_unknown';scene.receipt={id:'accepted-but-lost-response'};
 const child=await f.create({parentId:row.id});const checked=await f.p.preflight('org','actor',child.id,f.limits);
 expect(checked.approval.blockers).toContain('VIDEO_SCENE_RECONCILIATION_REQUIRED:first');expect(scene.receipt).toEqual({id:'accepted-but-lost-response'});
 const final=f.state.jobs.get(saved.approval.final.jobId);final.state='save_failed';await f.p.retrySave('org','actor',row.id,final.id);expect(final.state).toBe('saving');
 f.state.jobs.delete(final.id);await expect(f.p.retrySave('org','actor',row.id,final.id)).rejects.toMatchObject({code:'VIDEO_JOB_NOT_FOUND'});expect(f.state.api).toBe(0);
});

test('narrated images retain their source and block before scenes while the subscription importer lacks audio results',async()=>{
 const f=fixture(),image=randomUUID();f.state.media.set(image,{id:image,type:'image',path:'https://example.com/owned.png',fileSize:100,updatedAt:new Date('2026-11-03')});
 const manifest=copy(f.manifest);manifest.scenes=[{id:'image',kind:'image',mediaId:image,voiceId:'owned-voice',script:'Согласованная реплика.',durationSeconds:30}];
 const row=await f.create({manifest}),checked=await f.p.preflight('org','actor',row.id,f.limits);
 expect(checked.approval.blockers).toContain('VIDEO_PERSONAL_NARRATION_AUDIO_RESULT_UNAVAILABLE:image');
 expect(f.state.quotes.map(one=>one.operation)).toEqual(['final_composition']);
 expect(checked.manifest.scenes[0].mediaId).toBe(image);expect(f.state.jobs.size).toBe(0);expect(f.state.api).toBe(0);
});

test('final quote failure is visible and explicit same-approval continuation retains every job and reservation',async()=>{
 const f=fixture(),row=await f.create();await f.approve(row);const saved=f.state.rows.get(row.id),final=f.state.jobs.get(saved.approval.final.jobId);
 for(const plan of saved.approval.scenes)f.complete(f.state.jobs.get(plan.jobId));
 const ids=[...f.state.jobs.keys()],originalRequest=copy(final.request);f.state.finalQuoteError='VIDEO_PRICE_UNAVAILABLE';
 expect(await f.make().runStep('org',row.id)).toEqual({state:'needs_attention:VIDEO_PRICE_UNAVAILABLE',done:true});
 expect(final.errorCode).toBe('VIDEO_PRICE_UNAVAILABLE');expect(final.state).toBe('awaiting_assets');expect(final.request).toEqual(originalRequest);expect(f.state.dispatch).not.toContain(final.id);
 delete f.state.finalQuoteError;
 await f.main.approveAndLaunch('org','actor',row.id,{approvalId:saved.approval.id,digest:saved.digest});
 expect(f.state.rows.get(row.id).state).toBe('approved');expect(final.errorCode).toBeNull();
 await f.make().runStep('org',row.id);expect(final.state).toBe('accepted');expect(f.state.finalFreezes).toBe(1);
 expect([...f.state.jobs.keys()]).toEqual(ids);expect(final.reserved.toFixed()).toBe('10');expect(f.state.api).toBe(0);
});

test('owned video scenes use measured duration in final preparation instead of the requested hold duration',async()=>{
 const f=fixture(),video=randomUUID();f.state.media.set(video,{id:video,type:'video',path:'https://example.com/owned.mp4',fileSize:100,updatedAt:new Date('2026-11-03')});
 const manifest=copy(f.manifest);manifest.audio=false;manifest.captions=false;manifest.scenes=[{id:'owned',kind:'video',mediaId:video,script:'',durationSeconds:30}];
 const row=await f.create({manifest});await f.approve(row);await f.make().runStep('org',row.id);
 expect(f.state.quotes.at(-1).production.resolvedScenes).toEqual([{sceneId:'owned',mediaId:video,durationSeconds:15,sourceCaptions:'none'}]);expect(f.state.api).toBe(0);
});

test('changing script or generation attempt cannot hide an earlier uncertain scene submission',async()=>{
 const f=fixture(),row=await f.create();await f.approve(row);const saved=f.state.rows.get(row.id),first=f.state.jobs.get(saved.approval.scenes[0].jobId);
 first.state='submission_unknown';first.receipt={id:'uncertain-earlier-receipt'};f.complete(f.state.jobs.get(saved.approval.scenes[1].jobId));
 const next=copy(f.manifest);next.scenes[0].script='Новая реплика.';next.scenes[0].generationAttempt=5;
 const child=await f.create({parentId:row.id,manifest:next}),before=f.state.jobs.size,quoteCount=f.state.quotes.length;
 const checked=await f.p.preflight('org','actor',child.id,f.limits);
 expect(checked.approval.blockers).toContain('VIDEO_SCENE_RECONCILIATION_REQUIRED:first');
 expect(f.state.quotes.slice(quoteCount).map(one=>one.operation)).toEqual(['final_composition']);
 expect(first.receipt).toEqual({id:'uncertain-earlier-receipt'});expect(f.state.jobs.size).toBe(before);expect(f.state.api).toBe(0);
});
