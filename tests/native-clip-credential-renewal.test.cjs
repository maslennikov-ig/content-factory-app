'use strict';
const {setup,THREAD,domain,denied}=require('./helpers/native-clip-production.fixture.cjs');
const {copy}=require('./helpers/source-artifact.fixture.cjs');
const request={messageId:'authored-same-grant-renewal',text:'Renew only the existing pilot grant; keep all source, frames and budget. No quote or generation.'};
async function prepared(){
 const f=await setup(),review=f.vision.review;
 f.vision.review=async()=>{const v=await review();v.state='needs_input';v.blocker='CLIP_VISION_BLOCKED';v.result.verdict='blocked';v.result.findings=[{category:'continuity',detail:'Last typography differs.'}];v.raw=JSON.stringify(v.result);return v;};
 await f.prepare();const q=await f.service.budgetQuestion(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget','en');
 await f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget',q,{answer:'18'});
 const a=(await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.executionApproval;
 await f.service.launch(f.ids.org,f.ids.actor,THREAD,{pilotId:f.pilotId,preflightId:a.preflightId,approvalHash:a.approvalHash});
 await f.settle('first_frame');await f.settle('last_frame');f.vision.review=review;
 await f.service.prepareLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{messageId:'saved-repair',text:'Correct only last typography; retain first.'},{pilotId:f.pilotId});
 const repair=f.parent().payload.production.lastFrameRepair;f.stages.get(repair.plan.intentId).public.preflightId='preflight-credential-repair';repair.snapshot=await f.hgg.getByIntent(f.ids.org,f.ids.actor,repair.plan.intentId);
 f.renewCalls=0;f.readCalls=0;
 const envelope=input=>({version:2,renewalId:input.renewalId,pilotId:f.pilotId,originContextDigest:input.originContextDigest,connectionId:input.connectionId,
  accountGeneration:input.accountGeneration,originWorkspaceBindingHash:input.originWorkspace.bindingHash,retainedReferencesDigest:domain.digest(input.references),
  currentWorkspace:{...copy(input.originWorkspace),tokenVersion:2,bindingHash:domain.digest('current-epoch-workspace')},executionBindingHash:domain.digest('provider-issued-execution-binding')});
 f.hgg.renewCredentialBindingV2=async(org,actor,input)=>{f.renewCalls++;await f.service.assertCredentialRenewalV2(f.db,{...input,organizationId:org,actorId:actor});f.completedEnvelope=envelope(input);return copy(f.completedEnvelope);};
 f.hgg.readCredentialBindingV2=async(org,actor,input)=>{f.readCalls++;await f.service.assertCredentialRenewalV2(f.db,{...input,organizationId:org,actorId:actor});return copy(f.completedEnvelope??null);};
 f.renew=(r=request,thread=THREAD)=>f.service.renewCredentialsV2(f.ids.org,f.ids.actor,thread,r,{pilotId:f.pilotId});
 return f;
}
test('same-grant renewal preserves original content/frames/repair/budget, performs no quote/job, and duplicate request never rotates twice',async()=>{
 const f=await prepared(),before=copy(f.parent().payload),calls=copy(f.calls),jobs=copy([...f.stages.values()]);
 await f.renew();await f.renew();
 const p=copy(f.parent().payload),prod=p.production;
 expect(prod.executionCredentialsV2).toEqual(f.completedEnvelope);
 expect(prod.credentialRenewalsV2).toHaveLength(1);expect(prod.credentialRenewalsV2[0].state).toBe('completed');
 delete prod.executionCredentialsV2;delete prod.credentialRenewalsV2;expect(p).toEqual(before);
 expect(f.renewCalls).toBe(1);expect(f.readCalls).toBe(0);expect(f.calls).toEqual(calls);expect([...f.stages.values()]).toEqual(jobs);
});
test('lost completed renewal reply is adopted only by read, without a second refresh',async()=>{
 const f=await prepared(),renew=f.hgg.renewCredentialBindingV2;
 f.hgg.renewCredentialBindingV2=async(...args)=>{await renew(...args);throw Error('reply lost after provider commit');};
 await expect(f.renew()).rejects.toThrow('reply lost');
 expect(f.parent().payload.production.credentialRenewalsV2[0].state).toBe('pending');
 await f.renew({messageId:'read-existing-completed',text:'Read the already completed renewal only.'});
 expect(f.renewCalls).toBe(1);expect(f.readCalls).toBe(1);expect(f.parent().payload.production.executionCredentialsV2).toEqual(f.completedEnvelope);
});
test('unknown renewal remains pending across new authored requests and cannot authorize a retry',async()=>{
 const f=await prepared();f.hgg.renewCredentialBindingV2=async()=>{f.renewCalls++;throw Error('unknown upstream outcome');};
 await expect(f.renew()).rejects.toThrow('unknown upstream');
 await denied(f.renew({messageId:'new-authored-observe',text:'Read existing outcome.'}),'CLIP_CREDENTIAL_RENEWAL_UNCONFIRMED');
 const repair=f.parent().payload.production.lastFrameRepair;
 await denied(f.service.refreshLastFrameRepairQuote(f.ids.org,f.ids.actor,THREAD,{messageId:'quote-before-confirmed-renewal',text:'Refresh price.'},{pilotId:f.pilotId,repairId:repair.id}),'CLIP_CREDENTIAL_RENEWAL_PENDING');
 expect(f.renewCalls).toBe(1);expect(f.readCalls).toBe(1);expect(f.parent().payload.production.executionCredentialsV2).toBeUndefined();
});
test('foreign chat and already submitted repair refuse before provider renewal',async()=>{
 const f=await prepared();await denied(f.renew(request,'foreign-thread'),'CLIP_PREPRODUCTION_ACCESS_DENIED');
 f.parent().payload.production.lastFrameRepair.snapshot.jobId='unknown-existing-job';
 await denied(f.renew(),'CLIP_CREDENTIAL_RENEWAL_UNAVAILABLE');expect(f.renewCalls).toBe(0);
});
test('forged or changed workspace envelope cannot bind the native parent',async()=>{
 const f=await prepared(),renew=f.hgg.renewCredentialBindingV2;
 f.hgg.renewCredentialBindingV2=async(...args)=>({...await renew(...args),currentWorkspace:{...f.completedEnvelope.currentWorkspace,workspaceId:'foreign-private-workspace'}});
 await denied(f.renew(),'CLIP_EXECUTION_CREDENTIALS_CHANGED');expect(f.parent().payload.production.executionCredentialsV2).toBeUndefined();
});
test('deleted original owned image refuses renewal before a credential result can be recorded',async()=>{
 const f=await prepared();f.tables.media.delete(f.parent().payload.production.firstFrame.asset.ownedMediaId);
 await denied(f.renew(),'CLIP_FRAME_BYTES_CHANGED');expect(f.completedEnvelope).toBeUndefined();
 expect(f.parent().payload.production.executionCredentialsV2).toBeUndefined();
});
test('renewal parent assertion requires exact journal/revision/request/original ordered references',async()=>{
 const f=await prepared();await f.renew();const input=f.parent().payload.production.credentialRenewalsV2[0].input;
 for(const patch of [{requestMessageId:'not-the-author'},{parentRevision:input.parentRevision+100},{references:[...input.references].reverse()},{originContextDigest:domain.digest('foreign')},{accountGeneration:2}])
  await denied(f.service.assertCredentialRenewalV2(f.db,{...input,...patch,organizationId:f.ids.org,actorId:f.ids.actor}),'CLIP_CREDENTIAL_RENEWAL_CHANGED');
});
test('renewed last frame advances to a reviewed mixed pair and clip while original first, context, scenario and budget remain pinned',async()=>{
 const f=await prepared(),before=copy(f.parent().payload),prod=before.production,quote=f.hgg.quote,frame=f.hgg.frameReceipt,admit=f.hgg.admit;
 await f.renew();const r=f.parent().payload.production.lastFrameRepair,stage=f.stages.get(r.plan.intentId),oldHash=r.snapshot.approvalHash;
 await denied(f.service.refreshLastFrameRepairQuote(f.ids.org,f.ids.actor,THREAD,request,{pilotId:f.pilotId,repairId:r.id}),'CLIP_NEW_QUOTE_REFRESH_REQUEST_REQUIRED');
 stage.public.quote.localAdmissionExpiresAt='2020-01-01T00:00:00.000Z';r.snapshot.quote.localAdmissionExpiresAt=stage.public.quote.localAdmissionExpiresAt;
 const oldPriceRequest={messageId:'retained-failed-price-request',text:'Earlier explicit price request.'};
 r.quoteRefreshes=[{version:1,id:domain.identity('clip_repair_quote_refresh',r.id,oldPriceRequest.messageId),request:oldPriceRequest,repairBindingDigest:r.bindingDigest,previousSnapshot:copy(r.snapshot),state:'failed',errorCode:'VIDEO_REAUTH_REQUIRED'}];r.state='blocked';const oldFailedPrice=copy(r.quoteRefreshes[0]);
 const quotes=[];
 f.hgg.quoteWithCredentialsV2=async(org,actor,plan,credentials)=>{
  expect(credentials).toEqual(f.completedEnvelope);quotes.push(plan.input.kind==='video'?'clip':'last_frame');
  if(plan.intentId===r.plan.intentId)stage.public.quote={...stage.public.quote,localAdmissionExpiresAt:'2100-01-01T00:00:00.000Z'};
  const value=await quote(org,actor,plan),saved=f.stages.get(plan.intentId);
  await f.service.assertCurrentPilotWithCredentialsV2(f.db,{...f.expected(saved,'quote'),executionCredentials:credentials});
  return value;
 };
 f.hgg.frameReceiptWithCredentialsV2=async(org,actor,id,credentials)=>{
  expect(credentials).toEqual(f.completedEnvelope);const value=await frame(org,actor,id);
  return {...value,workspaceBindingHash:credentials.currentWorkspace.bindingHash};
 };
 f.hgg.admit=async(org,actor,id,hash)=>{await admit(org,actor,id,hash);if(id===stage.public.preflightId)stage.public.jobId='job-renewed-last';return f.hgg.read(org,actor,id);};
 const view=await f.service.refreshLastFrameRepairQuote(f.ids.org,f.ids.actor,THREAD,{messageId:'separate-fresh-quote-request',text:'Refresh only the same existing repair price.'},{pilotId:f.pilotId,repairId:r.id});
 const fresh=view.production.lastFrameRepair;
 expect(fresh.approvalHash).not.toBe(oldHash);
 await denied(f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{pilotId:f.pilotId,repairId:r.id,preflightId:fresh.preflightId,approvalHash:oldHash}),'CLIP_REPAIR_APPROVAL_CHANGED');
 expect(stage.public.jobId).toBeUndefined();
 await f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{pilotId:f.pilotId,repairId:r.id,preflightId:fresh.preflightId,approvalHash:fresh.approvalHash});
 stage.public.state='saved';stage.public.result={ownedMediaId:'renewed-last',byteSha256:domain.digest('new-repaired-last-bytes'),path:'https://owned.invalid/renewed-last.png',mime:'image/png',width:1152,height:2048};
 f.tables.media.set('renewed-last',{id:'renewed-last',organizationId:f.ids.org,path:stage.public.result.path,type:'image',deletedAt:null,updatedAt:new Date('2026-01-01T00:00:00Z')});
 await f.service.onStageSettled({organizationId:f.ids.org,actorId:f.ids.actor,pilotId:f.pilotId,stage:'last_frame',jobId:stage.public.jobId,eventId:stage.public.jobId});
 const current=f.parent().payload.production;
 expect(current.lastFrameRepair.state).toBe('reviewed');expect(quotes).toEqual(['last_frame','clip']);
 expect(current.lastFrameRepair.quoteRefreshes[0]).toEqual(oldFailedPrice);expect(current.lastFrameRepair.quoteRefreshes[1]).toMatchObject({priorRefreshId:oldFailedPrice.id,executionBindingHash:f.completedEnvelope.executionBindingHash,state:'completed'});
 expect(current.firstFrame).toEqual(prod.firstFrame);expect(current.framePair.receipts[0]).toEqual(prod.firstFrame.receipt);
 expect(current.framePair.receipts[1].workspaceBindingHash).toBe(f.completedEnvelope.currentWorkspace.bindingHash);
 expect(current.stagePlans.clip.references).toEqual(current.framePair.receipts);
 expect(current.contextDigest).toBe(prod.contextDigest);expect(current.workspace).toEqual(prod.workspace);expect(current.authorization).toEqual(prod.authorization);
 expect(current.lastFrameRepair.previous).toEqual(prod.lastFrameRepair.previous);expect(current.lastFrameRepair.plan).toEqual(prod.lastFrameRepair.plan);
 expect(f.parent().payload.stages).toEqual(before.stages);expect(current.vision.result.verdict).toBe('accept');expect(f.calls.filter(x=>x==='admit:clip')).toHaveLength(1);
 // Feed the actual native mixed-pair output to C's actual reference validator.
 // This covers call/data stitching; C's isolated DB fixture owns transaction proof.
 const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs'),modules=require('./helpers/video-subscription-provider-fixture.cjs').loadSubscriptionModules();
 const contract=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-stage.v1.ts',modules.mocks);
 const policy=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-policy.v1.ts',{...modules.mocks,'./video-hgg-pilot-stage.v1':contract});
 const jobs=Object.fromEntries(current.framePair.receipts.map((receipt,index)=>[receipt.jobId,{id:receipt.jobId,state:'completed',connectionId:current.connectionId,generation:current.accountGeneration,resultMediaId:receipt.ownedMediaId,
  request:{kind:'hgg-pilot-stage/v1',stage:index?'last_frame':'first_frame',workspace:current.workspace,compiled:{input:{source:current.stagePlans.clip.input.source}},...(index?{executionCredentials:f.completedEnvelope}:{})},
  storedFile:{path:current.framePair.paths[index],byteSha256:receipt.byteSha256},receipt:{kind:'image',profile:'hgg_pilot_job_v1',jobId:receipt.providerJobId}}]));
 const tx={videoSubscriptionJob:{findFirst:async({where})=>{expect(where.organizationId).toBe(f.ids.org);expect(where.actorId).toBe(f.ids.actor);return jobs[where.id];}},media:f.db.media};
 const cstage={stage:'clip',workspace:current.workspace,executionCredentials:f.completedEnvelope,references:current.stagePlans.clip.references,compiled:{input:current.stagePlans.clip.input}};
 await expect(policy.hggPilotReferencesV1(tx,f.ids.org,f.ids.actor,cstage,true)).resolves.toBe(true);
 jobs[current.framePair.receipts[1].jobId].request.executionCredentials={...f.completedEnvelope,executionBindingHash:domain.digest('foreign-execution')};
 await expect(policy.hggPilotReferencesV1(tx,f.ids.org,f.ids.actor,cstage,true)).rejects.toMatchObject({response:{code:'VIDEO_PILOT_REFERENCE_INVALID'}});
 const clip=f.stages.get(current.stagePlans.clip.intentId);
 await denied(f.service.assertCurrentPilotWithCredentialsV2(f.db,{...f.expected(clip,'quote'),executionCredentials:{...f.completedEnvelope,executionBindingHash:domain.digest('forged-current-epoch')}}),'CLIP_EXECUTION_CREDENTIALS_CHANGED');
});
