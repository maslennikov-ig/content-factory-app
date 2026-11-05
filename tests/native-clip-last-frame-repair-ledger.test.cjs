'use strict';
const {nativeFixture,codeOf}=require('./helpers/hgg-native-pilot-fixture.cjs');
const {SocialFactoryError}=require('./helpers/native-clip-production.fixture.cjs');
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const receipt=(id,prompt)=>({results:[{id,type:'image',model:'synthetic-image',status:'queued',params:{prompt}}]});
const done=id=>({jobs:[{index:0,job_id:id,status:'completed',type:'image',model:'synthetic-image',result_url:`https://result.invalid/${id}`}],summary:{total:1,completed:1,failed:0,active:0,errors:0},all_terminal:true,timed_out:false});
const asset=(r,slot)=>({slot,ownedMediaId:r.ownedMediaId,byteSha256:r.byteSha256,providerMediaId:r.providerMediaId,connectionId:r.connectionId,accountGeneration:r.accountGeneration});

test('actual HGG ledger keeps the rejected pair reserved under cap 18 when admitting a distinct last-frame repair',()=>nativeFixture(async f=>{
  f.parent.authorization={...f.parent.authorization,pilotLimit:'18',stageLimit:'18'};
  f.script('higgsfield','generate_image',
    {cost:{credits:1.5,credits_exact:1.5}},receipt(uuid(21),'English first frame direction'),
    {cost:{credits:1.5,credits_exact:1.5}},receipt(uuid(22),'English last frame direction'),
    {cost:{credits:1.5,credits_exact:1.5}},
    {cost:{credits:1.5,credits_exact:1.5}},receipt(uuid(23),'Correct the last frame typography to match the preserved first frame'));
  f.script('higgsfield','jobs_wait',done(uuid(21)),done(uuid(22)),done(uuid(23)));
  const finish=async id=>{for(let i=0;i<8;i++)await f.jobs.runStep('org',id);expect(f.rows.videoSubscriptionJob.find(j=>j.id===id)).toMatchObject({state:'completed'});};
  const first=await f.service.quote('org','actor',f.prepare());
  await f.service.admit('org','actor',first.preflightId,first.approvalHash);await finish(f.rows.videoSubscriptionJob[0].id);
  const firstReceipt=await f.service.frameReceipt('org','actor',first.preflightId);
  const lastPlan=f.prepare('last');lastPlan.input.references=[asset(firstReceipt,'first')];lastPlan.references=[firstReceipt];
  const last=await f.service.quote('org','actor',lastPlan);
  await f.service.admit('org','actor',last.preflightId,last.approvalHash);await finish(f.rows.videoSubscriptionJob[1].id);
  const old=JSON.stringify(f.rows.videoSubscriptionJob),oldMedia=JSON.stringify(f.rows.media);
  const originalQuotes=()=>f.rows.videoAccessPreflight.filter(q=>[first.preflightId,last.preflightId].includes(q.id));
  const oldQuotes=JSON.stringify(originalQuotes());
  const repairPlan={...lastPlan,intentId:'selective-repair-last-child',input:{...lastPlan.input,prompt:'Correct the last frame typography to match the preserved first frame'}};
  const previous=f.rows.videoSubscriptionJob[1],assertParent=f.parents.assertCurrentPilot.bind(f.parents);
  let approved=false,scope;
  // Only the server's current parent assertion supplies this authority. The
  // preparation DTO remains unchanged; real B producer bindings are tested separately.
  f.parents.assertCurrentPilot=async(tx,expected)=>{
    const assertion=await assertParent(tx,expected);
    if(expected.input.prompt!==repairPlan.input.prompt)return assertion;
    scope={version:1,repairId:'guarded-repair',intentId:repairPlan.intentId,previousJobId:previous.id,previousPreflightId:previous.preflightId,
      previousRequestHash:previous.request.requestHash,requestHash:expected.requestHash,authorizationId:assertion.authorization.id,bindingDigest:'a'.repeat(64)};
    if(expected.action!=='quote'&&!approved)throw new SocialFactoryError('CLIP_REPAIR_APPROVAL_REQUIRED');
    return {...assertion,lastFrameRepair:scope};
  };
  const repair=await f.service.quote('org','actor',repairPlan);
  expect(repair.blockers).toEqual(['VIDEO_PILOT_REPAIR_APPROVAL_REQUIRED']);expect(repair.canSubmit).toBe(false);expect(repair.approvalHash).toMatch(/^[a-f0-9]{64}$/);
  expect(repair).toMatchObject({ownerLimit:{pilotLimit:'18',reserved:'3',remaining:'15',actualChargeUnknown:true},quote:{amount:'1.5'}});
  let unapproved;try{await f.service.admit('org','actor',repair.preflightId,repair.approvalHash);}catch(e){unapproved=e;}
  expect(unapproved).toBeInstanceOf(SocialFactoryError);expect(unapproved.code).toBe('CLIP_REPAIR_APPROVAL_REQUIRED');expect(f.rows.videoSubscriptionJob).toHaveLength(2);
  const originalRepairPreflight=f.rows.videoAccessPreflight.find(q=>q.id===repair.preflightId),priorQuote=JSON.stringify({quote:originalRepairPreflight.quote,request:originalRepairPreflight.request,rawQuote:originalRepairPreflight.snapshot.rawQuote});
  f.advance(600001);
  expect((await f.service.read('org','actor',repair.preflightId)).blockers).toContain('VIDEO_PREFLIGHT_STALE');
  const refreshed=await f.service.quote('org','actor',repairPlan);
  expect(refreshed.preflightId).toBe(repair.preflightId);expect(refreshed.quote.amount).toBe(repair.quote.amount);expect(refreshed.approvalHash).not.toBe(repair.approvalHash);
  const refreshedPreflight=f.rows.videoAccessPreflight.find(q=>q.id===repair.preflightId);
  expect(refreshedPreflight.snapshot.priorQuotes).toHaveLength(1);expect(JSON.stringify(refreshedPreflight.snapshot.priorQuotes[0])).toBe(priorQuote);
  expect(f.rows.videoRouteIntent.filter(i=>i.intentId===repairPlan.intentId)).toHaveLength(1);
  approved=true;
  let forged;try{await f.service.quote('org','actor',{...repairPlan,lastFrameRepair:scope});}catch(e){forged=e;}
  expect(codeOf(forged)).toBe('VIDEO_PILOT_REQUEST_INVALID');
  const ready=await f.service.read('org','actor',repair.preflightId);expect(ready.canSubmit).toBe(true);expect(ready.approvalHash).toBe(refreshed.approvalHash);
  let stale;try{await f.service.admit('org','actor',repair.preflightId,repair.approvalHash);}catch(e){stale=e;}
  expect(codeOf(stale)).toBe('VIDEO_PREFLIGHT_STALE');expect(f.rows.videoSubscriptionJob).toHaveLength(2);
  await Promise.all([f.service.admit('org','actor',repair.preflightId,refreshed.approvalHash),f.service.admit('org','actor',repair.preflightId,refreshed.approvalHash)]);
  const reload=await f.service.getByIntent('org','actor',repairPlan.intentId);
  expect(reload).toMatchObject({ownerLimit:{reserved:'4.5',remaining:'13.5',pilotLimit:'18',actualChargeUnknown:true}});
  expect(f.rows.videoSubscriptionJob).toHaveLength(3);
  expect(JSON.stringify(f.rows.videoSubscriptionJob.slice(0,2))).toBe(old);
  expect(JSON.stringify(f.rows.media)).toBe(oldMedia);expect(JSON.stringify(originalQuotes())).toBe(oldQuotes);
  await finish(f.rows.videoSubscriptionJob[2].id);
  const repairedJob=f.rows.videoSubscriptionJob[2],policy=require('./helpers/load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-policy.v1.ts');
  const {Prisma}=require('@prisma/client');
  for(const [excludeJobId,changed] of [
    [undefined,{}],['foreign-job',{}],[previous.id,{}],
    [repairedJob.id,{requestHash:'0'.repeat(64)}],[repairedJob.id,{bindingDigest:'0'.repeat(64)}],
    [repairedJob.id,{previousJobId:f.rows.videoSubscriptionJob[0].id}],
    [repairedJob.id,{intentId:'another-repair'}],[repairedJob.id,{authorizationId:'another-budget'}],
  ]){
    let mismatch;try{await f.db.transaction(tx=>policy.hggPilotFinancialV1(tx,'org','actor',f.connection,repairedJob.request,f.parent.authorization,new Prisma.Decimal('1.5'),f.runtime.now(),excludeJobId,{...scope,...changed}));}catch(e){mismatch=e;}
    expect(codeOf(mismatch)).toBe('VIDEO_PILOT_REPAIR_BINDING_CHANGED');
  }
  for(const mutate of [
    old=>{old.connectionId='another-connection';},old=>{old.generation=2;},
    old=>{old.request.workspace.bindingHash='0'.repeat(64);},
    old=>{old.request.compiled.input.source.sourceContentDigest='0'.repeat(64);},
    old=>{old.snapshot.authorization.id='another-authorization';},
  ]){
    let mismatch;try{await f.db.transaction(tx=>{
      mutate(f.rows.videoSubscriptionJob.find(j=>j.id===scope.previousJobId));
      return policy.hggPilotFinancialV1(tx,'org','actor',f.connection,repairedJob.request,f.parent.authorization,new Prisma.Decimal('1.5'),f.runtime.now(),repairedJob.id,scope);
    });}catch(e){mismatch=e;}
    expect(codeOf(mismatch)).toBe('VIDEO_PILOT_REPAIR_BINDING_CHANGED');
  }
  f.script('higgsfield','generate_image',{cost:{credits:1.5,credits_exact:1.5}});
  const second=await f.service.quote('org','actor',{...repairPlan,intentId:'unbound-second-repair'});
  expect(second.canSubmit).toBe(false);expect(second.blockers).toContain('VIDEO_PILOT_REPAIR_BINDING_CHANGED');
  const lastReceipt=await f.service.frameReceipt('org','actor',repair.preflightId);
  f.parent.vision=true;
  const clip={...f.prepare(),intentId:'fresh-clip-after-repair',input:{version:1,kind:'video',resolution:'720p',source:f.source,prompt:'English cinematic camera move',frames:[asset(firstReceipt,'first'),asset(lastReceipt,'last')]},references:[firstReceipt,lastReceipt]};
  f.script('higgsfield','generate_video',{cost:{credits:14,credits_exact:14}});
  const q=await f.service.quote('org','actor',clip);expect(q.canSubmit).toBe(false);expect(q.blockers).toContain('VIDEO_PILOT_BUDGET_EXCEEDED');
  let error;try{await f.service.admit('org','actor',q.preflightId,'forged');}catch(e){error=e;}
  expect(codeOf(error)).toBe('VIDEO_PILOT_BUDGET_EXCEEDED');
  expect(f.rows.videoSubscriptionJob).toHaveLength(3);
  expect(f.rows.videoSubscriptionJob.every(j=>j.actualCost===null&&j.submitAttempts===1)).toBe(true);
  expect(f.state.toolCalls.filter(c=>c.args.params?.get_cost===false)).toHaveLength(3);
}));
