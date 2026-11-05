'use strict';
// Real HTTP controller, durable Mastra Session and registered capability;
// isolated native memory, real clip parent service, synthetic HGG/inference only.
const assert = require('node:assert/strict');
const {fixture,org,user,resourceId,human,Response,until} = require('./agent-native-stale-suspension.probe.cjs');
const {setup,THREAD} = require('./native-clip-production.fixture.cjs');
(async()=>{
  delete process.env.REDIS_URL; process.env.NODE_ENV='test'; process.env.MASTRA_DATABASE_URL='memory:clip-review-approval';
  let externalRequests=0; global.fetch=async()=>{externalRequests++;throw Error('External HTTP forbidden');};
  const clip=await setup({executionMode:'review'});await clip.prepare();
  const q=await clip.service.budgetQuestion(clip.ids.org,clip.ids.actor,THREAD,clip.pilotId,'human-budget','ru');
  await clip.service.answerBudget(clip.ids.org,clip.ids.actor,THREAD,clip.pilotId,'human-budget',q,{answer:'10'});
  const script=(await clip.service.open(clip.ids.org,clip.ids.actor,THREAD,clip.pilotId)).production.executionApproval;
  await clip.service.launch(clip.ids.org,clip.ids.actor,THREAD,{pilotId:clip.pilotId,preflightId:script.preflightId,approvalHash:script.approvalHash});
  await clip.settle('first_frame');await clip.settle('last_frame');
  const refs=(await clip.service.open(clip.ids.org,clip.ids.actor,THREAD,clip.pilotId)).production.executionV2.referenceApproval;
  const input={pilotId:clip.pilotId,referenceDigest:refs.referenceDigest};let launches=0,contextReads=0;
  // Map this probe's isolated native identity to the independently owned source fixture.
  const check=(o,a)=>{assert.equal(o,org.id);assert.equal(a,user.id);};
  const f=await fixture({serviceOverrides:{
    PieceService:{detail:async(o,pieceId)=>{assert.equal(o,org.id);assert.equal(pieceId,clip.ids.piece);return {piece:{id:pieceId,title:'Owned source'},core:{text:clip.parent().payload.source.text},adaptations:[]};}},
    SourceArtifactServiceV1:{resolve:async(o,a)=>{check(o,a);return clip.parent().payload.source;}},
    NativeClipPreproductionServiceV1:{open:async(o,a,t,pilotId)=>{check(o,a);assert.equal(t,THREAD);assert.equal(pilotId,clip.pilotId);contextReads++;return {state:'reviewed',sourceCurrent:true,...await clip.service.open(clip.ids.org,clip.ids.actor,THREAD,pilotId)};}},
    NativeClipProductionServiceV1:{
    referenceApprovalV2:async(o,a,raw)=>{check(o,a);return clip.service.referenceApprovalV2(clip.ids.org,clip.ids.actor,raw);},
    launchReviewedClipV2:async(o,a,t,raw)=>{check(o,a);assert.equal(t,THREAD);launches++;return clip.service.launchReviewedClipV2(clip.ids.org,clip.ids.actor,THREAD,raw);},
  }},script:async(_args,n)=>n%2===1
    ? [{type:'tool-call',toolCallId:`pair-call-${n}`,toolName:'video_pilot_launch_reviewed_clip_v2',input:JSON.stringify(input)}]
    : [{type:'text-start',id:'reply'},{type:'text-delta',id:'reply',delta:'Saved native decision.'},{type:'text-end',id:'reply'}]});
  try{
    await f.memory.createThread({threadId:THREAD,resourceId,title:'Review both actual frames'});
    for(const approved of [false,true]){
      const running=f.handler.chat(org,user,{threadId:THREAD,workContext:{version:'assistant-work-context/v1',kind:'piece',id:clip.ids.piece,clipPilotId:clip.pilotId},messages:[human(`owner-${approved}`,'Show the exact pair and ask before one video.')]},new Response());
      await until(async()=> (await f.handler.getThread(org,user,THREAD)).pending.length>0,'real pair approval suspension');
      const pending=(await f.handler.getThread(org,user,THREAD)).pending[0];
      assert.equal(pending.kind,'approval');assert.equal(pending.toolName,'video_pilot_launch_reviewed_clip_v2');assert.deepEqual(pending.args,input);
      assert.equal(launches,0);assert.equal(clip.calls.includes('quote:clip'),false);assert.equal(clip.calls.includes('admit:clip'),false);
      await assert.rejects(()=>f.handler.chat(org,user,{threadId:THREAD,runId:pending.runId,toolCallId:pending.toolCallId,resumeData:{answer:'Yes',decideForPerson:true}},new Response()));
      assert.equal(launches,0);
      await f.handler.chat(org,user,{threadId:THREAD,messages:[{id:`decision-${approved}`,role:'assistant',parts:[{
        type:'tool-video_pilot_launch_reviewed_clip_v2',toolCallId:pending.toolCallId,state:'approval-responded',input,
        approval:{id:`${pending.runId}::${pending.toolCallId}`,approved},
      }]}]},new Response());await running;
      if(!approved){assert.equal(launches,0);assert.equal(clip.parent().payload.production.executionV2.referencesApproval,undefined);}
    }
    assert.equal(launches,1);assert.deepEqual(clip.calls.filter(c=>c.startsWith('admit:')),['admit:first_frame','admit:last_frame','admit:clip']);
    assert.equal(externalRequests,0);assert.ok(contextReads>=4,'Exact selected pilot must be revalidated across native suspension/restore.');
    console.log(JSON.stringify({realNativePending:true,declinePreservesPair:true,creativeAnswerRefused:true,approvedOnce:true,externalRequests,controlledModelCalls:f.modelCalls.length,selectedPilotRestored:true,contextReads}));
  }finally{await f.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
