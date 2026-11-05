'use strict';
const {setup,THREAD,REQUEST}=require('./helpers/native-clip-production.fixture.cjs');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {IDENTITY,loadRegistry,servicesFrom,requestContextFor,executeTool}=require('./helpers/agent-capabilities.cjs');
const registry=loadRegistry(),{readQuestion}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
async function native(f,id,input,options={}){
  const ctx=requestContextFor(registry,{...IDENTITY,organizationId:f.ids.org,userId:f.ids.actor});const {MASTRA_RESOURCE_ID_KEY,MASTRA_THREAD_ID_KEY}=require('@mastra/core/request-context');
  ctx.set(MASTRA_RESOURCE_ID_KEY,`${f.ids.org}:${f.ids.actor}`);ctx.set(MASTRA_THREAD_ID_KEY,THREAD);ctx.set('cf.originalAuthorRequest',JSON.stringify(f.request??REQUEST));
  const capability=registry.CAPABILITY_CATALOGUE.find(c=>c.id===id),tool=registry.buildCapabilityTool(capability,{services:servicesFrom({NativeClipProductionServiceV1:f.service}),language:'ru',entrance:'chat'});
  return executeTool(tool,input,{requestContext:ctx,toolCallId:'actual-native-budget-tool',...options});
}
const value=r=>{expect(r.output.ok).toBe(true);return r.output.summary.untrustedData.value;};
test('registered review-mode path requires two distinct native human confirmations, never creative delegation',async()=>{
  const f=await setup({executionMode:'new_default'});
  value(await native(f,'video.pilot_prepare',{pilotId:f.pilotId}));
  const asked=await native(f,'video.pilot_budget',{pilotId:f.pilotId});
  const budget=value(await native(f,'video.pilot_budget',{pilotId:f.pilotId},{suspendPayload:asked.suspended[0],resumeData:{answer:'10'}}));
  const first=budget.production.executionApproval;
  await native(f,'video.pilot_launch',{pilotId:f.pilotId,preflightId:first.preflightId,approvalHash:first.approvalHash});
  await f.settle('first_frame');await f.settle('last_frame');
  expect(f.calls).not.toContain('admit:clip');expect(f.calls).not.toContain('quote:clip');
  const refs=(await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.executionV2.referenceApproval;
  const input={pilotId:f.pilotId,referenceDigest:refs.referenceDigest};
  const capability=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch_reviewed_clip_v2');
  const tool=registry.buildCapabilityTool(capability,{services:servicesFrom({NativeClipProductionServiceV1:f.service}),language:'ru',entrance:'chat'});
  expect(capability.risk).toBe('confirm');expect(capability.resumeSchema).toBeUndefined();expect(capability.suspendSchema).toBeUndefined();
  const yolo={requestContext:{get:()=>({getState:()=>({permissionRules:{categories:{write:'allow',confirm:'allow'},tools:{video_pilot_launch_reviewed_clip_v2:'allow'}}})})}};
  expect(tool.requireApproval(input,yolo)).toBe(true);
  for(const injected of [{...input,decideForPerson:true},{...input,answer:'Да'},{...input,approved:true}])expect(capability.input.safeParse(injected).success).toBe(false);
  expect(registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch').risk).toBe('confirm');
  value(await native(f,'video.pilot_launch_reviewed_clip_v2',input));
  expect(f.calls.filter(c=>c.startsWith('admit:'))).toEqual(['admit:first_frame','admit:last_frame','admit:clip']);
});
test('review-mode script approval retains delegated cap provenance, its estimate basis and known first quote',async()=>{
  const f=await setup({executionMode:'review',budgetMode:'delegated_quote_bound'});
  const prepared=value(await native(f,'video.pilot_prepare_delegated',{pilotId:f.pilotId}));
  const approval=prepared.production.executionApproval,input={pilotId:f.pilotId,preflightId:approval.preflightId,approvalHash:approval.approvalHash};
  const cap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch');
  const services=servicesFrom({NativeClipProductionServiceV1:f.service});
  const content=await cap.approvalContent({organizationId:f.ids.org,userId:f.ids.actor,service:services},input);
  expect(content).toMatchObject({executionMode:'review',firstQuote:{amount:'1'},authorization:{limitSource:'owner_delegated_necessary_one_pilot',capBasis:{lastFrameTerm:'estimate',bufferPercent:25}}});
  const line=await cap.describeApproval({organizationId:f.ids.org,userId:f.ids.actor,language:'ru',service:services},input);
  expect(line).toContain('первая цена 1');expect(line).toContain('ориентировочно 1');expect(line).toContain('не введённая владельцем сумма');expect(line).toContain('Видео НЕ разрешено');
});
test('registered native pilot uses actual nondelegable human resume and one server-bound whole-pilot approval',async()=>{
  const f=await setup(),prepared=value(await native(f,'video.pilot_prepare',{pilotId:f.pilotId}));expect(prepared.production.authorization.state).toBe('missing');
  const asked=await native(f,'video.pilot_budget',{pilotId:f.pilotId});expect(asked.output).toBeUndefined();expect(asked.suspended).toHaveLength(1);
  const card=asked.suspended[0],shown=readQuestion('video_pilot_budget',card,null);expect(shown).toMatchObject({kind:'choice',answerKey:'answer',canDecideForPerson:false,options:[]});expect(card.questionPurpose).toBe('fact');
  const cap=registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_budget');expect(cap.input.safeParse({pilotId:f.pilotId,answer:'100'}).success).toBe(false);for(const answer of [{decideForPerson:true},{answer:'Infinity'},{answer:'0'}])expect(cap.resumeSchema.safeParse(answer).success).toBe(false);
  const budget=value(await native(f,'video.pilot_budget',{pilotId:f.pilotId},{suspendPayload:card,resumeData:{answer:'10'}}));expect(budget.production.authorization).toMatchObject({state:'authorized',pilotLimit:'10',executionApproved:false});
  const preview=budget.production.executionApproval,input={pilotId:f.pilotId,preflightId:preview.preflightId,approvalHash:preview.approvalHash};expect(preview.canApprove).toBe(true);
  expect(registry.CAPABILITY_CATALOGUE.find(c=>c.id==='video.pilot_launch').risk).toBe('confirm');expect(value(await native(f,'video.pilot_launch',input)).production.executionApproval.approved).toBe(true);
  expect(f.calls.filter(v=>v.startsWith('admit:'))).toEqual(['admit:first_frame']);expect(f.parent().payload.production.authorization.toolCallId).toBe('actual-native-budget-tool');expect(f.parent().payload.production.request).toEqual(REQUEST);
});
test('actual delegated native request proposes finite current 1k/720 quote-bound cap, asks no amount and still needs one whole-pilot approval',async()=>{
  const request={messageId:'actual-delegated-request',text:'Prepare this one pilot with 1k images and 720p video; use the credits necessary for this one pilot.'};
  const f=await setup({request,budgetMode:'delegated_quote_bound'}),prepared=value(await native(f,'video.pilot_prepare_delegated',{pilotId:f.pilotId}));
  expect(f.calls).toEqual(['workspace','quote:first_frame','quote:clip_planning']);expect(f.calls.some(v=>v.startsWith('admit:'))).toBe(false);
  expect(prepared.production.settings).toMatchObject({image:{resolution:'1k'},video:{resolution:'720p',durationSeconds:5,aspectRatio:'9:16'}});
  expect(prepared.production.authorization).toMatchObject({state:'authorized',pilotLimit:'8',limitSource:'owner_delegated_necessary_one_pilot',executionApproved:false,capBasis:{firstFrameQuotedCredits:'1',estimatedLastFrameCredits:'1',clipPlanningQuotedCredits:'4.2',lastFrameTerm:'estimate',bufferPercent:25}});
  const saved=f.parent().payload.production;expect(saved.request).toEqual(request);expect(saved.authorization).toMatchObject({source:'delegated_quote_bound',rawOwnerInstruction:request.text,requestMessageId:request.messageId});
  for(const key of ['ownerAnswer','cardId','toolCallId'])expect(saved.authorization).not.toHaveProperty(key);expect(saved.budgetQuestion).toBeUndefined();expect(saved.stagePlans.clip).toBeUndefined();expect(saved.clipPlanningPlan.input).toMatchObject({resolution:'720p',frames:[]});expect(saved.clipPlanningPlan.references).toEqual([]);
  const notAsked=await native(f,'video.pilot_budget',{pilotId:f.pilotId});expect(notAsked.suspended).toEqual([]);expect(value(notAsked).production.authorization.pilotLimit).toBe('8');
  const planning=[...f.stages.values()].find(r=>r.planningOnly);await expect(f.hgg.admit(f.ids.org,f.ids.actor,planning.public.preflightId,'a'.repeat(64))).rejects.toMatchObject({code:'CLIP_PLANNING_QUOTE_CANNOT_SUBMIT'});
  await expect(f.service.assertCurrentPilot(f.db,f.expected(planning,'submit','a'.repeat(64)))).rejects.toMatchObject({code:'CLIP_PLANNING_QUOTE_CANNOT_SUBMIT'});
  const preview=prepared.production.executionApproval;expect(preview.canApprove).toBe(true);await native(f,'video.pilot_launch',{pilotId:f.pilotId,preflightId:preview.preflightId,approvalHash:preview.approvalHash});
  await f.settle('first_frame');await f.settle('last_frame');await f.settle('clip');
  expect(f.calls.filter(v=>v.startsWith('admit:'))).toEqual(['admit:first_frame','admit:last_frame','admit:clip']);expect(f.parent().payload.production.authorization.value.pilotLimit).toBe('8');
  expect((await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.stages.map(s=>s.stage)).toEqual(['first_frame','last_frame','clip']);
});
test('delegated cap never silently grows when a fresh price changes and historical settings cannot become its source basis',async()=>{
  const request={messageId:'actual-delegated-request',text:'Spend the credits necessary for this one low-resolution pilot.'},f=await setup({request,budgetMode:'delegated_quote_bound'});await f.prepare();
  const original=structuredClone(f.parent().payload.production.authorization),first=[...f.stages.values()].find(r=>r.stage==='first_frame');first.public.quote.amount='100';
  await f.prepare();expect(f.parent().payload.production.authorization).toEqual(original);
  f.parent().payload.production.clipPlanningPlan.input.resolution='1080p';
  expect((await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId)).production.authorization.state).toBe('stale');expect(f.calls.some(v=>v.startsWith('admit:'))).toBe(false);
});
