'use strict';
const {setup,THREAD,domain,visionBinding}=require('./helpers/native-clip-production.fixture.cjs');
const {copy}=require('./helpers/source-artifact.fixture.cjs');
const {IDENTITY,loadRegistry,servicesFrom,requestContextFor,executeTool,permissionsService}=require('./helpers/agent-capabilities.cjs');
const {validateToolInput}=require('@mastra/core/tools');
const {toStandardSchema}=require('@mastra/core/schema');
const registry=loadRegistry();
test('registered fenced review recovery requires an authored request in the owned native chat',async()=>{
  const f=await blocked(),cap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_recover_vision_fenced_v1');expect(cap).toBeDefined();
  const identity={...IDENTITY,organizationId:f.ids.org,userId:f.ids.actor,role:'ADMIN'},ctx=requestContextFor(registry,identity),{MASTRA_RESOURCE_ID_KEY,MASTRA_THREAD_ID_KEY}=require('@mastra/core/request-context');
  ctx.set(MASTRA_RESOURCE_ID_KEY,`${f.ids.org}:${f.ids.actor}`);ctx.set(MASTRA_THREAD_ID_KEY,THREAD);
  const run=jest.spyOn(f.service,'recoverVisionFencedV1').mockResolvedValue({pilotId:f.pilotId,pieceId:'piece',threadId:THREAD});
  const tool=registry.buildCapabilityTool(cap,{services:servicesFrom({NativeClipProductionServiceV1:f.service}),language:'en',entrance:'chat'});
  await executeTool(tool,{pilotId:f.pilotId},{requestContext:ctx,toolCallId:'recovery-no-request'});expect(run).not.toHaveBeenCalled();
  ctx.set('cf.originalAuthorRequest',JSON.stringify(request));await executeTool(tool,{pilotId:f.pilotId},{requestContext:ctx,toolCallId:'recovery-authored'});
  expect(run).toHaveBeenCalledWith(f.ids.org,f.ids.actor,THREAD,request,{pilotId:f.pilotId});
});
const request={messageId:'actual-last-repair',text:'Refine only the last frame. Match the first frame typography exactly; preserve the accepted scenario.'};
async function blocked(){
  const f=await setup(),review=f.vision.review;
  f.vision.review=async()=>{const v=await review();v.state='needs_input';v.blocker='CLIP_VISION_BLOCKED';v.result.verdict='blocked';v.result.findings=[{category:'continuity',detail:'Last frame typography is heavier than the first.'}];v.raw=JSON.stringify(v.result);return v;};
  await f.prepare();const q=await f.service.budgetQuestion(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget','ru');
  await f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget',q,{answer:'18'});
  const a=(await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.executionApproval;
  await f.service.launch(f.ids.org,f.ids.actor,THREAD,{pilotId:f.pilotId,preflightId:a.preflightId,approvalHash:a.approvalHash});
  await f.settle('first_frame');await f.settle('last_frame');f.vision.review=review;
  const oldIntent=f.parent().payload.production.stagePlans.last_frame.intentId,quote=f.hgg.quote,admit=f.hgg.admit;
  f.hgg.quote=async(org,actor,plan)=>{
    const value=await quote(org,actor,plan);
    if(plan.input.kind==='image_frame' && plan.input.slot==='last' && plan.intentId!==oldIntent){
      const row=f.stages.get(plan.intentId);row.public.preflightId='preflight-last-repair';return f.hgg.read(org,actor,row.public.preflightId);
    }return value;
  };
  f.hgg.admit=async(org,actor,id,hash)=>{await admit(org,actor,id,hash);const row=[...f.stages.values()].find(r=>r.public.preflightId===id);if(id==='preflight-last-repair')row.public.jobId='job-last-repair';return f.hgg.read(org,actor,id);};
  f.finishRepair=async()=>{
    const r=f.parent().payload.production.lastFrameRepair,row=f.stages.get(r.plan.intentId),id='owned-repaired-last',path='https://owned.invalid/repaired-last.png';
    row.public.state='saved';row.public.result={ownedMediaId:id,path,mime:'image/png',width:1152,height:2048,byteSha256:domain.digest('repaired-last')};
    f.tables.media.set(id,{id,organizationId:f.ids.org,path,type:'image',deletedAt:null,updatedAt:new Date('2026-01-01T00:00:00Z')});
    const event={eventId:row.public.jobId,jobId:row.public.jobId,organizationId:f.ids.org,actorId:f.ids.actor,pilotId:f.pilotId,stage:'last_frame'};
    await f.service.onStageSettled(event);return event;
  };return f;
}
const prepare=f=>f.service.prepareLastFrameRepair(f.ids.org,f.ids.actor,THREAD,request,{pilotId:f.pilotId});
async function launch(f){const r=(await prepare(f)).production.lastFrameRepair;const input={pilotId:f.pilotId,repairId:r.id,preflightId:r.preflightId,approvalHash:r.approvalHash};await f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input);return input;}
test('repair preparation retains the exact first/source/scenario/old last and requires a new scoped approval',async()=>{
  const f=await blocked(),before=copy(f.parent().payload),jobs=copy([...f.stages.values()]);
  const view=await f.service.prepareLastFrameRepair(f.ids.org,f.ids.actor,THREAD,request,{pilotId:f.pilotId});
  expect(f.parent().payload.production.firstFrame).toEqual(before.production.firstFrame);
  expect(f.parent().payload.source).toEqual(before.source);expect(f.parent().payload.stages).toEqual(before.stages);
  const repair=f.parent().payload.production.lastFrameRepair;
  expect(repair.previous.framePair).toEqual(before.production.framePair);expect(repair.previous.vision).toEqual(before.production.vision);
  expect(repair.plan.intentId).not.toBe(before.production.stagePlans.last_frame.intentId);
  expect(repair.plan.input.references).toEqual([before.production.firstFrame.asset]);
  expect(f.parent().payload.production.authorization).toEqual(before.production.authorization);
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
  for(const row of jobs)expect([...f.stages.values()].find(r=>r.plan.intentId===row.plan.intentId)).toEqual(row);
  expect(view.production.lastFrameRepair).toMatchObject({canApprove:true,approved:false});
  expect(view.production.stages.find(stage=>stage.stage==='last_frame')).toMatchObject({preflightId:'preflight-last-repair',state:'awaiting_approval',result:null});
  const stage=f.stages.get(repair.plan.intentId),assertion=await f.service.assertCurrentPilot(f.db,f.expected(stage,'quote'));
  expect(assertion.lastFrameRepair).toMatchObject({version:1,repairId:repair.id,intentId:repair.plan.intentId,previousJobId:repair.previous.snapshot.jobId,
    previousRequestHash:repair.previous.snapshot.bindingHash,authorizationId:before.production.authorization.value.id,bindingDigest:repair.bindingDigest});
});
test('duplicate prepare/launch/events and reload retain one repair purchase and one fresh pair review',async()=>{
  const f=await blocked(),old=copy(f.parent().payload.production),events=copy(old.settledEvents),history=copy([...f.stages.values()]);
  await Promise.all([prepare(f),prepare(f)]);expect(f.stages.size).toBe(3);
  const v=(await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.lastFrameRepair;
  const input={pilotId:f.pilotId,repairId:v.id,preflightId:v.preflightId,approvalHash:v.approvalHash};
  await Promise.all([f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input),f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input)]);
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
  const service=f.service;
  f.service=new service.constructor(service.repository,service.sources,f.hgg,service.parents,f.vision);
  f.service.onModuleInit();
  const fresh=await f.finishRepair();await f.service.onStageSettled(fresh);
  await f.service.onStageSettled({eventId:old.stageSnapshots.last_frame.jobId,jobId:old.stageSnapshots.last_frame.jobId,organizationId:f.ids.org,actorId:f.ids.actor,pilotId:f.pilotId,stage:'last_frame'});
  expect(f.calls.filter(c=>c==='vision:two-image-bytes')).toHaveLength(2);
  expect(f.calls.filter(c=>c==='admit:clip')).toHaveLength(1);
  const prod=f.parent().payload.production;
  expect(prod.firstFrame).toEqual(old.firstFrame);expect(prod.authorization).toEqual(old.authorization);
  expect(prod.framePair.assets[0]).toEqual(old.firstFrame.asset);expect(prod.framePair.assets[1].ownedMediaId).toBe('owned-repaired-last');
  expect(prod.lastFrameRepair.previous.vision).toEqual(old.vision);expect(prod.lastFrameRepair.previous.plan).toEqual(old.stagePlans.last_frame);
  expect(prod.settledEvents).toEqual(events);
  for(const row of history)expect(f.stages.get(row.plan.intentId)).toEqual(row);
  const count=f.calls.length;await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId);await f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input);expect(f.calls).toHaveLength(count);
  expect(visionBinding.clipVisionPublicV1(f.parent().payload,prod,true)).toMatchObject({current:true,verdict:'accept'});
});
test.each(['stale-quote','old-approval','foreign-actor','source-drift','first-drift','account-drift','stop'])('%s cannot purchase a replacement',async kind=>{
  const f=await blocked(),view=await prepare(f),r=view.production.lastFrameRepair;
  const input={pilotId:f.pilotId,repairId:r.id,preflightId:r.preflightId,approvalHash:r.approvalHash};
  if(kind==='stale-quote')f.stages.get(f.parent().payload.production.lastFrameRepair.plan.intentId).public.quote.localAdmissionExpiresAt='2000-01-01T00:00:00Z';
  if(kind==='old-approval')Object.assign(input,f.parent().payload.production.authorization.executionApproval);
  if(kind==='source-drift')f.editPost('Changed after repair quote.');
  if(kind==='first-drift')f.parent().payload.production.firstFrame.asset.byteSha256='0'.repeat(64);
  if(kind==='account-drift')f.parent().payload.production.accountGeneration+=1;
  if(kind==='stop')await f.service.stop(f.ids.org,f.ids.actor,THREAD,f.pilotId,'actual-stop');
  await expect(f.service.launchLastFrameRepair(f.ids.org,kind==='foreign-actor'?f.ids.otherActor:f.ids.actor,THREAD,input)).rejects.toBeDefined();
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);expect(f.stages.size).toBe(3);
});

test.each(['ru','en'])('registered native repair validates input and requires its own current content-bound Yes (%s)',async language=>{
  const f=await blocked(),services=servicesFrom({NativeClipProductionServiceV1:f.service});
  const identity={...IDENTITY,organizationId:f.ids.org,userId:f.ids.actor,language,interfaceLanguage:language,role:'ADMIN'};
  const makeContext=(role='ADMIN')=>{
    const ctx=requestContextFor(registry,{...identity,role});
    const {MASTRA_RESOURCE_ID_KEY,MASTRA_THREAD_ID_KEY}=require('@mastra/core/request-context');
    ctx.set(MASTRA_RESOURCE_ID_KEY,`${f.ids.org}:${f.ids.actor}`);ctx.set(MASTRA_THREAD_ID_KEY,THREAD);
    ctx.set('cf.originalAuthorRequest',JSON.stringify(request));return ctx;
  };
  const prepareCap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_prepare_last_frame_repair');
  const launchCap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch_last_frame_repair');
  const build=cap=>registry.buildCapabilityTool(cap,{services,language,entrance:'chat'});
  for(const input of [{pilotId:f.pilotId,approved:true},{pilotId:f.pilotId,repairInstruction:'model supplied authority'}]){
    expect(validateToolInput(toStandardSchema(prepareCap.input),input).error).toBeDefined();
  }
  const prepared=await executeTool(build(prepareCap),{pilotId:f.pilotId},{requestContext:makeContext(),toolCallId:'native-prepare-repair'});
  expect(prepared.output.ok).toBe(true);
  const r=prepared.output.summary.untrustedData.value.production.lastFrameRepair;
  expect(r).toMatchObject({current:true,canApprove:true,approved:false});
  expect(prepared.output.summary.untrustedData.value.production.stages.find(s=>s.stage==='last_frame').blockers).toEqual(['VIDEO_PILOT_REPAIR_APPROVAL_REQUIRED']);
  const input={pilotId:f.pilotId,repairId:r.id,preflightId:r.preflightId,approvalHash:r.approvalHash};
  expect(validateToolInput(toStandardSchema(launchCap.input),input).error).toBeUndefined();
  expect(validateToolInput(toStandardSchema(launchCap.input),{...input,pilotLimit:'100'}).error).toBeDefined();
  const toolName=registry.toolNameOf(launchCap.id),hooks=registry.createCapabilityHooks([launchCap],new registry.DoorPolicyGate(permissionsService()),services);
  const hook=ctx=>hooks.beforeToolCall({toolName,input,context:{requestContext:ctx,toolCallId:'native-launch-repair'}});
  const description=await registry.describeApprovalCall([launchCap],services,identity,toolName,input);
  expect(description).toContain(language==='ru'?'Первый кадр и сценарий сохраняются':'Keep the first frame and scenario');
  expect(description).toContain('18');
  const content=await registry.approvalContentDigest([launchCap],services,identity,toolName,input);
  const whole=f.parent().payload.production.authorization.executionApproval;
  const oldContext=makeContext();
  registry.grantApproval(oldContext,registry.approvalFingerprint('video_pilot_launch',whole));
  expect((await hook(oldContext)).output.code).toBe('APPROVAL_MISMATCH');
  // Native No never grants a fingerprint. Re-reading the pending call cannot execute it.
  expect((await hook(makeContext())).output.code).toBe('APPROVAL_MISMATCH');
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
  const approved=makeContext();
  registry.grantApproval(approved,registry.approvalFingerprint(toolName,input));
  registry.grantApproval(approved,registry.approvalContentFingerprint(toolName,input,content));
  const reader=makeContext('USER');
  registry.grantApproval(reader,registry.approvalFingerprint(toolName,input));
  registry.grantApproval(reader,registry.approvalContentFingerprint(toolName,input,content));
  expect((await hook(reader)).output.code).toBe('PERMISSION_DENIED');
  await expect(hook(approved)).resolves.toBeUndefined();
  const launched=await executeTool(build(launchCap),input,{requestContext:approved,toolCallId:'native-launch-repair'});
  expect(launched.output.ok).toBe(true);expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
  expect(f.parent().payload.production.lastFrameRepair.request).toEqual(request);
  expect(f.parent().payload.production.lastFrameRepair.approval.approvalHash).not.toBe(whole.approvalHash);
});

test('an apparently reviewed replacement cannot advance with the old-pair review binding',async()=>{
  const f=await blocked();await launch(f);
  f.vision.review=async()=>{const p=f.parent().payload,old=copy(p.production.lastFrameRepair.previous.vision);old.state='reviewed';old.result.verdict='accept';old.result.findings=[];delete old.blocker;p.production.vision=old;return old;};
  await f.finishRepair();expect(f.calls).not.toContain('quote:clip');expect(f.calls).not.toContain('admit:clip');
  expect(f.parent().payload.production.lastFrameRepair.state).toBe('blocked');
});
test('a rejected or uncertain new vision stops without another last frame or any clip',async()=>{
  for(const state of ['needs_input','uncertain']){
    const f=await blocked();await launch(f);f.vision.review=async()=>{const p=f.parent().payload,prod=p.production;f.calls.push('repair-vision');prod.vision={...copy(prod.lastFrameRepair.previous.vision),state,inputDigest:domain.digest(visionBinding.clipVisionInputV1(p,prod)),frames:prod.framePair.assets.map(a=>({slot:a.slot,ownedMediaId:a.ownedMediaId,byteSha256:a.byteSha256})),blocker:state==='uncertain'?'CLIP_VISION_OPERATION_UNCERTAIN':'CLIP_VISION_BLOCKED'};return prod.vision;};
    const event=await f.finishRepair();await f.service.onStageSettled(event);expect(f.calls.filter(c=>c==='repair-vision')).toHaveLength(1);expect(f.calls).not.toContain('admit:clip');
    expect(f.parent().payload.production.lastFrameRepair.state).toBe('blocked');await expect(f.service.prepareLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{messageId:'another-request',text:request.text},{pilotId:f.pilotId})).rejects.toBeDefined();
  }
});
test('unknown submit keeps the same intent/job and Stop retains recoverable paid output',async()=>{
  const f=await blocked(),v=(await prepare(f)).production.lastFrameRepair,input={pilotId:f.pilotId,repairId:v.id,preflightId:v.preflightId,approvalHash:v.approvalHash},admit=f.hgg.admit;
  f.hgg.admit=async(...args)=>{await admit(...args);throw Error('Unknown submitted response');};
  await expect(f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input)).rejects.toThrow('Unknown submitted response');
  await f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input);expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
  await f.service.stop(f.ids.org,f.ids.actor,THREAD,f.pilotId,'owner-stop');await f.finishRepair();expect(f.parent().payload.production.lastFrameRepair.snapshot.state).toBe('saved');expect(f.calls).not.toContain('admit:clip');
  expect(f.parent().payload.production.firstFrame.asset.ownedMediaId).toBe('owned-first_frame');expect(f.parent().payload.production.lastFrameRepair.previous.snapshot.state).toBe('saved');
});

test('save-only recovery of the existing repair job can complete without buying another image',async()=>{
  const f=await blocked();await launch(f);
  const row=f.stages.get(f.parent().payload.production.lastFrameRepair.plan.intentId);
  row.public.state='save_failed';row.public.recoveryActions=['retry_save'];
  await f.service.onStageSettled({eventId:row.public.jobId,jobId:row.public.jobId,organizationId:f.ids.org,actorId:f.ids.actor,pilotId:f.pilotId,stage:'last_frame'});
  expect(f.parent().payload.production.lastFrameRepair.state).toBe('blocked');
  f.hgg.recover=async(org,actor,id,action)=>{expect(id).toBe('preflight-last-repair');expect(action).toBe('retry_save');row.public.state='saving';return f.hgg.read(org,actor,id);};
  await f.service.recover(f.ids.org,f.ids.actor,THREAD,f.pilotId,'last_frame','retry_save');await f.finishRepair();
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
  expect(f.parent().payload.production.lastFrameRepair.state).toBe('reviewed');
});

test('explicit repair continuation applies a captured review after reload without a new review call',async()=>{
  const f=await blocked();await launch(f);const review=f.vision.review;
  f.vision.review=async()=>{const value=await review();value.state='captured';return value;};
  await f.finishRepair();expect(f.calls).not.toContain('admit:clip');
  expect(f.parent().payload.production.lastFrameRepair.state).toBe('vision_pending');
  f.vision.review=async()=>{f.parent().payload.production.vision.state='reviewed';return f.parent().payload.production.vision;};
  const before=f.calls.filter(c=>c==='vision:two-image-bytes').length;
  await prepare(f);await prepare(f);
  expect(f.calls.filter(c=>c==='vision:two-image-bytes')).toHaveLength(before);
  expect(f.calls.filter(c=>c==='admit:clip')).toHaveLength(1);expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
});

const refreshRequest={messageId:'actual-price-refresh-user',text:'Refresh the expired price for this same last-frame correction. Keep the original instruction and ask me to approve the new price.'};
test('repair interface dictionaries prefer the trusted full locale, support regional variants and fall back without changing content locale',async()=>{
  const cap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch_last_frame_repair');
  const service=()=>({lastFrameRepairApproval:async()=>({quote:{amount:'1.5'},ownerLimit:{remaining:'15',pilotLimit:'18'}})});
  for(const [language,interfaceLanguage,expected] of [['en','ru','Первый кадр и сценарий сохраняются'],['ru','en','Keep the first frame and scenario'],['ru','fr','Keep the first frame and scenario']]){
    expect(await cap.describeApproval({...IDENTITY,language,interfaceLanguage,service},{})).toContain(expected);
  }
  const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
  const {clipProductionWordsFor}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.clip-production.copy.ts');
  for(const locale of ['ru','ru-RU','ru_RU'])expect(clipProductionWordsFor(locale).repair).toBe('Исправление конечного кадра');
  for(const locale of ['en','en-GB','fr','ja',undefined])expect(clipProductionWordsFor(locale).repair).toBe('Last-frame correction');
});
afterEach(()=>jest.restoreAllMocks());
async function expiredRepair(){
  const clock=jest.spyOn(Date,'now').mockReturnValue(Date.parse('2030-01-01T00:00:00Z'));
  const f=await blocked();await prepare(f);
  const r=f.parent().payload.production.lastFrameRepair,row=f.stages.get(r.plan.intentId);
  row.public.quote={...row.public.quote,capturedAt:'2030-01-01T00:00:00.000Z',localAdmissionExpiresAt:'2030-01-01T00:10:00.000Z'};
  r.snapshot=await f.hgg.read(f.ids.org,f.ids.actor,row.public.preflightId);
  const old=copy(r.snapshot),plan=copy(r.plan),original=copy(f.parent().payload.production);
  const oldApprovalContent=await f.service.lastFrameRepairApproval(f.ids.org,f.ids.actor,{pilotId:f.pilotId,repairId:r.id,preflightId:old.preflightId,approvalHash:old.approvalHash});
  clock.mockReturnValue(Date.parse('2030-01-01T00:10:01Z'));
  const quote=f.hgg.quote;
  f.hgg.quote=async(org,actor,input)=>{
    if(input.intentId===r.plan.intentId && Date.parse(row.public.quote.localAdmissionExpiresAt)<=Date.now()){
      f.calls.push('quote-refresh:last_frame');row.public.state='quote_pending';if(f.beforeRefresh)await f.beforeRefresh();
      row.public.quote={...row.public.quote,capturedAt:new Date(Date.now()).toISOString(),localAdmissionExpiresAt:new Date(Date.now()+600000).toISOString()};
      row.public.state='awaiting_approval';
    }
    return quote(org,actor,input);
  };
  const input={pilotId:f.pilotId,repairId:r.id};
  return Object.assign(f,{refreshInput:input,oldRepairQuote:old,oldRepairPlan:plan,oldProduction:original,oldApprovalContent,clock,
    refresh:(author=refreshRequest)=>f.service.refreshLastFrameRepairQuote(f.ids.org,f.ids.actor,THREAD,author,input)});
}

test('expired repair quote refresh preserves the same attempt and history, changes same-price hash and grants no execution consent',async()=>{
  const f=await expiredRepair();await prepare(f);expect(f.calls).not.toContain('quote-refresh:last_frame');
  const v=await f.refresh(),r=f.parent().payload.production.lastFrameRepair,view=v.production.lastFrameRepair;
  expect(r.request).toEqual(request);expect(r.plan).toEqual(f.oldRepairPlan);expect(r.id).toBe(f.refreshInput.repairId);
  expect(r.quoteRefreshes).toHaveLength(1);expect(r.quoteRefreshes[0]).toMatchObject({version:1,request:refreshRequest,state:'completed'});
  expect(r.quoteRefreshes[0].previousSnapshot).toEqual(f.oldRepairQuote);
  for(const key of ['firstFrame','authorization','framePair','vision'])expect(f.parent().payload.production[key]).toEqual(f.oldProduction[key]);
  expect(view).toMatchObject({approved:false,canApprove:true,preflightId:f.oldRepairQuote.preflightId,quote:{amount:f.oldRepairQuote.quote.amount}});
  expect(view.approvalHash).not.toBe(f.oldRepairQuote.approvalHash);
  await expect(f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{...f.refreshInput,preflightId:f.oldRepairQuote.preflightId,approvalHash:f.oldRepairQuote.approvalHash})).rejects.toMatchObject({code:'CLIP_REPAIR_APPROVAL_CHANGED'});
  const fresh={...f.refreshInput,preflightId:view.preflightId,approvalHash:view.approvalHash};
  expect(await f.service.lastFrameRepairApproval(f.ids.org,f.ids.actor,fresh)).toMatchObject({quoteRefreshId:r.quoteRefreshes[0].id,requestMessageId:request.messageId});
  await f.refresh();expect(f.calls.filter(c=>c==='quote-refresh:last_frame')).toHaveLength(1);
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);expect(r.approval).toBeUndefined();
});

test('concurrent quote refresh is one CAS claim; pending price blocks competing refresh and stale launch',async()=>{
  const f=await expiredRepair();let release,entered;
  const atQuote=new Promise(resolve=>{entered=resolve;});f.beforeRefresh=async()=>{entered();await new Promise(resolve=>{release=resolve;});};
  const first=f.refresh();await atQuote;
  const repeated=await f.refresh();expect(repeated.production.lastFrameRepair.canApprove).toBe(false);
  await expect(f.refresh({...refreshRequest,messageId:'competing-refresh'})).rejects.toMatchObject({code:'CLIP_REPAIR_QUOTE_REFRESH_PENDING'});
  await expect(f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{...f.refreshInput,preflightId:f.oldRepairQuote.preflightId,approvalHash:f.oldRepairQuote.approvalHash})).rejects.toBeDefined();
  release();await first;expect(f.parent().payload.production.lastFrameRepair.quoteRefreshes).toHaveLength(1);
  expect(f.calls.filter(c=>c==='quote-refresh:last_frame')).toHaveLength(1);expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
});

test.each(['unexpired','approved','job','unknown','source-drift','first-drift','same-author-request','stop'])('quote refresh refuses %s without a quote or new generation',async kind=>{
  const f=await expiredRepair(),r=f.parent().payload.production.lastFrameRepair,row=f.stages.get(r.plan.intentId);
  if(kind==='unexpired')f.clock.mockReturnValue(Date.parse('2030-01-01T00:01:00Z'));
  if(kind==='approved'){r.approval={preflightId:f.oldRepairQuote.preflightId,approvalHash:f.oldRepairQuote.approvalHash};r.state='approved';}
  if(kind==='job'){row.public.jobId='already-accepted-job';row.public.state='accepted';}
  if(kind==='unknown')row.public.state='submission_unknown';
  if(kind==='source-drift')f.editPost('Source changed after the saved repair.');
  if(kind==='first-drift')f.parent().payload.production.firstFrame.asset.byteSha256='0'.repeat(64);
  if(kind==='stop')await f.service.stop(f.ids.org,f.ids.actor,THREAD,f.pilotId,'actual-stop');
  await expect(f.refresh(kind==='same-author-request'?request:refreshRequest)).rejects.toBeDefined();
  expect(f.calls).not.toContain('quote-refresh:last_frame');expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);expect(r.quoteRefreshes).toBeUndefined();
});

test.each(['ru','en'])('registered native quote refresh uses a new authored request and demands a fresh content-bound approval (%s)',async language=>{
  const f=await expiredRepair(),identity={...IDENTITY,organizationId:f.ids.org,userId:f.ids.actor,role:'ADMIN',language,interfaceLanguage:language};
  const services=servicesFrom({NativeClipProductionServiceV1:f.service}),ctx=requestContextFor(registry,identity);
  const {MASTRA_RESOURCE_ID_KEY,MASTRA_THREAD_ID_KEY}=require('@mastra/core/request-context');ctx.set(MASTRA_RESOURCE_ID_KEY,`${f.ids.org}:${f.ids.actor}`);ctx.set(MASTRA_THREAD_ID_KEY,THREAD);ctx.set('cf.originalAuthorRequest',JSON.stringify(refreshRequest));
  const cap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_refresh_last_frame_repair_quote');
  expect(cap.risk).toBe('write');expect(validateToolInput(toStandardSchema(cap.input),{...f.refreshInput,prompt:'replace the original instruction'}).error).toBeDefined();
  const launchCap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch_last_frame_repair'),toolName=registry.toolNameOf(launchCap.id);
  const oldInput={...f.refreshInput,preflightId:f.oldRepairQuote.preflightId,approvalHash:f.oldRepairQuote.approvalHash};
  const output=await executeTool(registry.buildCapabilityTool(cap,{services,language,entrance:'chat'}),f.refreshInput,{requestContext:ctx,toolCallId:'native-refresh-quote'});
  expect(output.output.ok).toBe(true);const r=output.output.summary.untrustedData.value.production.lastFrameRepair;
  const input={...f.refreshInput,preflightId:r.preflightId,approvalHash:r.approvalHash};
  const hooks=registry.createCapabilityHooks([launchCap],new registry.DoorPolicyGate(permissionsService()),services);
  const hook=()=>hooks.beforeToolCall({toolName,input,context:{requestContext:ctx,toolCallId:'native-new-quote-consent'}});
  registry.grantApproval(ctx,registry.approvalFingerprint(toolName,oldInput));expect((await hook()).output.code).toBe('APPROVAL_MISMATCH');
  const digest=await registry.approvalContentDigest([launchCap],services,identity,toolName,input);
  const oldDigest=registry.approvalFingerprint(`content:${toolName}`,{content:f.oldApprovalContent});
  expect(digest).not.toBe(oldDigest);
  registry.grantApproval(ctx,registry.approvalFingerprint(toolName,input));registry.grantApproval(ctx,registry.approvalContentFingerprint(toolName,input,oldDigest));
  expect((await hook()).output.code).toBe('APPROVAL_CONTENT_CHANGED');
  registry.grantApproval(ctx,registry.approvalContentFingerprint(toolName,input,digest));
  await expect(hook()).resolves.toBeUndefined();
  const launched=await executeTool(registry.buildCapabilityTool(launchCap,{services,language,entrance:'chat'}),input,{requestContext:ctx,toolCallId:'native-new-quote-consent'});
  expect(launched.output.ok).toBe(true);expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
  expect(f.parent().payload.production.lastFrameRepair.request).toEqual(request);
});

test.each(['pending','failed'])('new authored request adopts the SAME saved quote after a lost parent checkpoint (%s)',async state=>{
  const f=await expiredRepair(),quote=f.hgg.quote;
  f.hgg.quote=async(...args)=>{await quote(...args);throw Error('Response lost after local preflight saved');};
  await expect(f.refresh()).rejects.toThrow('Response lost');
  const r=f.parent().payload.production.lastFrameRepair,refresh=r.quoteRefreshes[0];
  expect(refresh.state).toBe('failed');
  if(state==='pending'){refresh.state='pending';r.state='preparing';}
  const captured=await f.hgg.getByIntent(f.ids.org,f.ids.actor,r.plan.intentId);
  const service=f.service;f.service=new service.constructor(service.repository,service.sources,f.hgg,service.parents,f.vision);f.service.onModuleInit();
  const recovered=await f.refresh({...refreshRequest,messageId:'actual-new-recovery-user'});
  expect(recovered.production.lastFrameRepair).toMatchObject({approved:false,canApprove:true,preflightId:captured.preflightId,approvalHash:captured.approvalHash});
  const current=f.parent().payload.production.lastFrameRepair,adopted=current.quoteRefreshes[0];
  expect(adopted.previousSnapshot).toEqual(f.oldRepairQuote);expect(adopted.recoveryRequests).toEqual([{...refreshRequest,messageId:'actual-new-recovery-user'}]);
  expect(current.quoteRefreshes).toHaveLength(1);expect(current.plan).toEqual(f.oldRepairPlan);expect(current.request).toEqual(request);
  expect(f.calls.filter(c=>c==='quote-refresh:last_frame')).toHaveLength(1);expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
  f.clock.mockReturnValue(Date.parse(captured.quote.localAdmissionExpiresAt)+1);
  await expect(f.refresh({...refreshRequest,messageId:'actual-new-recovery-user'})).resolves.toBeDefined();
  expect(f.calls.filter(c=>c==='quote-refresh:last_frame')).toHaveLength(1);
  expect(f.parent().payload.production.lastFrameRepair.quoteRefreshes).toHaveLength(1);
});

test('concurrent recovery may adopt a captured quote before original caller finishes without duplicate quote or journal',async()=>{
  const f=await expiredRepair(),quote=f.hgg.quote;let release,entered;
  const saved=new Promise(resolve=>{entered=resolve;});
  f.hgg.quote=async(...args)=>{const value=await quote(...args);entered();await new Promise(resolve=>{release=resolve;});return value;};
  const original=f.refresh();await saved;
  const recovered=await f.refresh({...refreshRequest,messageId:'new-recovery-during-response'});expect(recovered.production.lastFrameRepair.canApprove).toBe(true);
  release();await expect(original).resolves.toBeDefined();
  expect(f.parent().payload.production.lastFrameRepair.quoteRefreshes).toHaveLength(1);expect(f.calls.filter(c=>c==='quote-refresh:last_frame')).toHaveLength(1);
});

test('unknown refresh result stays blocked and does not create execution consent',async()=>{
  const f=await expiredRepair(),quote=f.hgg.quote;
  f.hgg.quote=async(...args)=>({...await quote(...args),approvalHash:null});
  await expect(f.refresh()).rejects.toMatchObject({code:'CLIP_REPAIR_QUOTE_REFRESH_UNCONFIRMED'});
  const view=await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId);
  expect(view.production.lastFrameRepair).toMatchObject({state:'blocked',canApprove:false,approved:false});
  expect(f.parent().payload.production.lastFrameRepair.quoteRefreshes[0]).toMatchObject({state:'failed',previousSnapshot:f.oldRepairQuote});
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
});

test.each(['before-claim','saved-but-expired'])('new USER can recover an orphan whose C preflight is positively quoted and expired (%s)',async kind=>{
  const f=await expiredRepair(),quote=f.hgg.quote;
  f.hgg.quote=async(...args)=>{if(kind==='saved-but-expired')await quote(...args);throw Error('Parent response interrupted');};
  await expect(f.refresh()).rejects.toThrow('Parent response interrupted');
  if(kind==='saved-but-expired')f.clock.mockReturnValue(Date.now()+600001);
  f.hgg.quote=quote;
  const view=await f.refresh({...refreshRequest,messageId:'new-user-after-orphan-expiry'});
  const r=f.parent().payload.production.lastFrameRepair;
  expect(view.production.lastFrameRepair.canApprove).toBe(true);expect(r.quoteRefreshes).toHaveLength(2);
  expect(r.quoteRefreshes[0]).toMatchObject({state:'failed',supersededBy:r.quoteRefreshes[1].id,previousSnapshot:f.oldRepairQuote});
  expect(r.quoteRefreshes[1]).toMatchObject({state:'completed',request:{messageId:'new-user-after-orphan-expiry'}});
  expect(r.plan).toEqual(f.oldRepairPlan);expect(r.request).toEqual(request);expect(f.stages.size).toBe(3);
  expect(f.calls.filter(c=>c==='quote-refresh:last_frame')).toHaveLength(kind==='saved-but-expired'?2:1);
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
});

test.each(['quote_pending','quote_failed'])('an interrupted %s C price operation cannot be reissued by a new USER',async state=>{
  const f=await expiredRepair(),r=f.parent().payload.production.lastFrameRepair,row=f.stages.get(r.plan.intentId);
  f.hgg.quote=async()=>{throw Error('Interrupted before price operation');};await expect(f.refresh()).rejects.toThrow('Interrupted');
  row.public.state=state;row.public.errorCode=state==='quote_failed'?'VIDEO_PRICE_UNAVAILABLE':null;
  await expect(f.refresh({...refreshRequest,messageId:'new-price-request-during-uncertainty'})).rejects.toMatchObject({code:'CLIP_REPAIR_QUOTE_REFRESH_UNCONFIRMED'});
  expect(f.calls).not.toContain('quote-refresh:last_frame');expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(1);
  expect(f.parent().payload.production.lastFrameRepair.quoteRefreshes).toHaveLength(1);
});

test('a paused old approval write cannot overwrite a completed fresh quote refresh',async()=>{
  const f=await expiredRepair(),input={pilotId:f.pilotId,repairId:f.refreshInput.repairId,preflightId:f.oldRepairQuote.preflightId,approvalHash:f.oldRepairQuote.approvalHash};
  f.clock.mockReturnValue(Date.parse('2030-01-01T00:05:00Z'));
  const original=f.service.lastFrameRepairApproval.bind(f.service);let release,arrived;
  const held=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{arrived=resolve;});
  f.service.lastFrameRepairApproval=async(...args)=>{const value=await original(...args);arrived();await held;return value;};
  const paused=f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,input);await ready;
  f.clock.mockReturnValue(Date.parse('2030-01-01T00:10:01Z'));await f.refresh();release();
  await expect(paused).rejects.toBeDefined();
  expect(f.parent().payload.production.lastFrameRepair.approval).toBeUndefined();
  const fresh=(await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.lastFrameRepair;
  expect(fresh.canApprove).toBe(true);f.service.lastFrameRepairApproval=original;
  await f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{pilotId:f.pilotId,repairId:fresh.id,preflightId:fresh.preflightId,approvalHash:fresh.approvalHash});
  expect(f.calls.filter(c=>c==='admit:last_frame')).toHaveLength(2);
});

test('a delayed initial repair prepare cannot overwrite the refreshed snapshot and journal',async()=>{
  const clock=jest.spyOn(Date,'now').mockReturnValue(Date.parse('2030-01-01T00:00:00Z')),f=await blocked(),quote=f.hgg.quote;
  let release,arrived,first=true;
  const held=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{arrived=resolve;});
  f.hgg.quote=async(...args)=>{
    let value=await quote(...args);const repair=f.parent().payload.production.lastFrameRepair;
    if(repair && args[2].intentId===repair.plan.intentId){
      const row=f.stages.get(repair.plan.intentId);
      row.public.quote={...row.public.quote,capturedAt:new Date(Date.now()).toISOString(),localAdmissionExpiresAt:new Date(Date.now()+600000).toISOString()};
      value=await f.hgg.read(f.ids.org,f.ids.actor,row.public.preflightId);
      if(first){first=false;arrived();await held;}
    }return value;
  };
  const paused=prepare(f);await ready;await prepare(f);
  clock.mockReturnValue(Date.parse('2030-01-01T00:10:01Z'));
  const r=f.parent().payload.production.lastFrameRepair;
  await f.service.refreshLastFrameRepairQuote(f.ids.org,f.ids.actor,THREAD,refreshRequest,{pilotId:f.pilotId,repairId:r.id});
  const refreshed=copy(f.parent().payload.production.lastFrameRepair);release();await paused;
  expect(f.parent().payload.production.lastFrameRepair.snapshot).toEqual(refreshed.snapshot);
  expect(f.parent().payload.production.lastFrameRepair.quoteRefreshes).toEqual(refreshed.quoteRefreshes);
});
