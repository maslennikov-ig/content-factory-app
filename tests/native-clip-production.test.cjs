'use strict';
const {setup,THREAD,denied}=require('./helpers/native-clip-production.fixture.cjs');
const {copy}=require('./helpers/source-artifact.fixture.cjs');
async function authorize(f){await f.prepare();const q=await f.service.budgetQuestion(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool','ru');await f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool',q,{answer:'10'});const v=(await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.executionApproval;return {pilotId:f.pilotId,preflightId:v.preflightId,approvalHash:v.approvalHash};}
test('one actual budget fact and one whole-pilot approval advance first -> last -> actual pair review -> clip despite own progress revisions',async()=>{
  const f=await setup(), before=copy(f.parent().payload.stages);await f.prepare();
  expect(f.calls).toEqual(['workspace','quote:first_frame']);
  const question=await f.service.budgetQuestion(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool','ru');
  expect(question).toMatchObject({questionPurpose:'fact',canDecideForPerson:false});
  await f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool',question,{answer:'10'});
  const ready=await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId);expect(ready.production.executionApproval).toMatchObject({current:true,canApprove:true,approved:false});
  const launch={pilotId:f.pilotId,preflightId:ready.production.executionApproval.preflightId,approvalHash:ready.production.executionApproval.approvalHash};
  await f.service.launch(f.ids.org,f.ids.actor,THREAD,launch);await f.service.launch(f.ids.org,f.ids.actor,THREAD,launch);
  const first=await f.settle('first_frame');await f.service.onStageSettled(first);await f.settle('last_frame');await f.settle('clip');
  expect(f.calls.filter(v=>v.startsWith('admit:'))).toEqual(['admit:first_frame','admit:last_frame','admit:clip']);
  expect(f.calls.filter(v=>v.startsWith('vision:'))).toEqual(['vision:two-image-bytes']);
  const plans=f.parent().payload.production.stagePlans;expect(plans.last_frame.input.references[0].ownedMediaId).toBe('owned-first_frame');expect(plans.clip.input.frames.map(a=>a.slot)).toEqual(['first','last']);
  expect(f.parent().revision).toBeGreaterThan(plans.first_frame.input.source.parentRevision);
  expect(f.parent().payload.stages).toEqual(before);expect(f.tables.videoPromptDraft.size).toBe(0);
  const count=f.calls.length;await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId);expect(f.calls).toHaveLength(count);
});
test('agent-supplied number, delegation, stale card/tool and edited source cannot authorize the pilot',async()=>{
  const f=await setup();await f.prepare();const q=await f.service.budgetQuestion(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool','en');
  for(const answer of [{answer:'Infinity'},{answer:'0'},{answer:'-1'},{decideForPerson:true},{answer:'10',authorized:true}])await expect(f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool',q,answer)).rejects.toBeDefined();
  await denied(f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'other-tool',q,{answer:'10'}),'CLIP_BUDGET_ANSWER_BINDING_INVALID');
  f.editPost('Source changed after the budget was asked.');await denied(f.service.answerBudget(f.ids.org,f.ids.actor,THREAD,f.pilotId,'budget-tool',q,{answer:'10'}),'SOURCE_ARTIFACT_STALE');
  expect(f.parent().payload.production.authorization).toBeUndefined();expect(f.calls.filter(v=>v.startsWith('admit:'))).toHaveLength(0);
});
test('native preparation needs a separate actual authored request and uses no private connection/workspace/model input',async()=>{
  const f=await setup();await denied(f.service.prepare(f.ids.org,f.ids.actor,THREAD,f.parent().payload.request,{pilotId:f.pilotId}),'CLIP_NEW_PRODUCTION_REQUEST_REQUIRED');expect(f.calls).toHaveLength(0);
  const discover=f.hgg.discoverWorkspace;f.hgg.discoverWorkspace=async(...args)=>{expect(f.parent().payload.production.connectionId).toBeUndefined();expect(f.parent().payload.production.accountGeneration).toBeUndefined();expect(f.parent().payload.production.workspace).toBeUndefined();return discover(...args);};
  await expect(f.service.prepare(f.ids.org,f.ids.actor,THREAD,{messageId:'new',text:'Prepare'},{pilotId:f.pilotId,connectionId:'injected'})).rejects.toBeDefined();
  await f.prepare();const request=copy(f.parent().payload.production.request),calls=copy(f.calls);await f.prepare();expect(f.calls).toEqual(calls);expect(f.parent().payload.production.request).toEqual(request);
});
test('same-transaction submit guard rejects changed owned frame bytes/path, budget, actor and stop while retaining paid rows',async()=>{
  const f=await setup(), launch=await authorize(f);await f.service.launch(f.ids.org,f.ids.actor,THREAD,launch);await f.settle('first_frame');
  const row=[...f.stages.values()].find(r=>r.stage==='last_frame'), expected=f.expected(row,'submit','a'.repeat(64));await f.service.assertCurrentPilot(f.db,expected);
  const saved=copy(f.parent().payload.production.firstFrame);f.parent().payload.production.firstFrame={...saved,asset:{...saved.asset,byteSha256:'0'.repeat(64)}};await denied(f.service.assertCurrentPilot(f.db,expected),'CLIP_FRAME_BYTES_CHANGED');f.parent().payload.production.firstFrame=saved;
  const media=f.tables.media.get('owned-first_frame'),path=media.path;media.path+='-changed';await denied(f.service.assertCurrentPilot(f.db,expected),'CLIP_FRAME_BYTES_CHANGED');media.path=path;
  await denied(f.service.assertCurrentPilot(f.db,{...expected,actorId:f.ids.otherActor}),'CLIP_PREPRODUCTION_ACCESS_DENIED');
  f.parent().payload.production.authorization.value.pilotLimit='1000';await denied(f.service.assertCurrentPilot(f.db,expected),'CLIP_PILOT_BUDGET_STALE');f.parent().payload.production.authorization.value.pilotLimit='10';
  await f.service.stop(f.ids.org,f.ids.actor,THREAD,f.pilotId,'actual-stop-request');await denied(f.service.assertCurrentPilot(f.db,expected),'CLIP_PILOT_STOPPED');await f.settle('last_frame');
  expect(f.calls).not.toContain('vision:two-image-bytes');expect(f.calls).not.toContain('admit:clip');expect(f.stages.size).toBe(2);
});
test('later source edit preserves already paid replay/result but prevents the next stage',async()=>{
  const f=await setup(), launch=await authorize(f);await f.service.launch(f.ids.org,f.ids.actor,THREAD,launch);f.editPost('New source after first submission.');
  await f.service.launch(f.ids.org,f.ids.actor,THREAD,launch);await f.settle('first_frame');expect(f.calls.filter(v=>v.startsWith('admit:'))).toEqual(['admit:first_frame']);
  const view=await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId);expect(view.production.authorization.state).toBe('stale');expect(view.production.stages[0].result.ownedMediaId).toBe('owned-first_frame');expect(f.parent().payload.production.blockers).toEqual(['SOURCE_ARTIFACT_STALE']);
});
