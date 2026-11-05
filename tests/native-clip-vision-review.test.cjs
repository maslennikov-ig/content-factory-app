'use strict';
// Installed OpenAI SDK serialization + real metered fetch/AiUsage + real source/CAS;
// only HTTP/owned image storage and Prisma persistence are synthetic.
const {AsyncLocalStorage}=require('node:async_hooks');
const {createHash}=require('node:crypto');
const sharp=require('sharp');
const {createOpenAI}=require('@ai-sdk/openai');
const {setup,THREAD,REQUEST,domain,binding,visionBinding,SocialFactoryRepository,token}=require('./helpers/native-clip-production.fixture.cjs');
const {loadTypeScriptModule,base}=require('./helpers/source-artifact.fixture.cjs');
const chain=require('./helpers/ai-text-chain.cjs');
const acting=loadTypeScriptModule(base+'user/acting.user.ts');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let frameBytes;
beforeAll(async()=>{frameBytes={first_frame:await sharp({create:{width:144,height:256,channels:3,background:'#aa7711'}}).png().toBuffer(),last_frame:await sharp({create:{width:144,height:256,channels:3,background:'#1177aa'}}).png().toBuffer()};});
async function visionFixture(options={}){
  const active=new AsyncLocalStorage(),http=[],usageRows=[],imagesRead=[];
  const config={usageMode:'workspace_key',provider:'openrouter',apiKey:'synthetic-never-sent',textModel:'openai/gpt-6.1-terra',textChain:{flex:true,fallbackModel:'',fallbackDisabled:true,maxRetries:0},modelRouting:{advancedModel:'openai/gpt-6.1-terra',advancedFlex:true},...options.config};
  const configModule={loadAiConfig:async()=>config,requireActiveAiConfig:async()=>{if(!active.getStore())throw Error('No admission');return config;},getActiveAiConfig:org=>active.getStore()?.org===org?config:undefined,getActiveAiOrganizationId:()=>active.getStore()?.org,withActiveAiConfig:(org,next,run)=>active.run({org,config:next},run),setAiProviderSettingReader(){},setInstanceAiDefaultsReader(){},INSTANCE_AI_DEFAULTS_ID:'instance',AiProviderNotConfigured:class extends Error{}};
  const {AiUsageService}=loadTypeScriptModule(base+'openai/ai.usage.service.ts',{'@contentfactory/nestjs-libraries/database/prisma/prisma.service':{PrismaService:token},'@contentfactory/nestjs-libraries/openai/ai.provider.config':configModule,'@contentfactory/nestjs-libraries/openai/ai.text-chain':chain,'@contentfactory/nestjs-libraries/user/acting.user':acting});
  const usage=new AiUsageService({aiUsageRecord:{create:async({data})=>{const row={id:'vision-usage-'+usageRows.length,...structuredClone(data)};usageRows.push(row);return row;},update:async({where,data})=>Object.assign(usageRows.find(r=>r.id===where.id),structuredClone(data)),deleteMany:async()=>({count:0})}});
  let current;
  const sdk=createOpenAI({apiKey:'synthetic-never-sent',baseURL:'https://synthetic.invalid/v1',fetch:chain.createTextChainFetch({...config,profile:'interactive',singleModelAttempt:true},async(url,init)=>{
    const body=JSON.parse(init.body),user=body.messages.find(m=>m.role==='user'),input=JSON.parse(user.content.find(p=>p.type==='text').text);
    const images=user.content.filter(p=>p.type==='image_url').map(p=>p.image_url.url);
    expect(images).toHaveLength(2);expect(images.every(v=>v.startsWith('data:image/png;base64,'))).toBe(true);
    expect(images.map(url=>sha(Buffer.from(url.split(',')[1],'base64')))).toEqual([sha(frameBytes.first_frame),sha(frameBytes.last_frame)]);
    expect(current.parent().payload.production.vision).toMatchObject({state:'running',inputDigest:input.inputDigest});
    http.push({body,input,imageDigests:images.map(url=>sha(Buffer.from(url.split(',')[1],'base64')))});
    if(options.onHttp)await options.onHttp(current);
    if(options.lostResponse)throw Error('Synthetic network loss after request');
    const verdict={inputDigest:input.inputDigest,sourceContentDigest:input.sourceContentDigest,scenarioDigest:input.scenarioDigest,acceptedTextReviewDigest:input.acceptedTextReviewDigest,frameDigests:input.frames.map(({slot,byteSha256})=>({slot,byteSha256})),verdict:'accept',findings:[],...options.verdict};
    return new Response(JSON.stringify({id:'vision-reply',object:'chat.completion',created:1767225600,...(options.actualModel===null?{}:{model:options.actualModel??'openai/gpt-6.1-terra'}),choices:[{index:0,message:{role:'assistant',content:typeof options.raw==='function'?options.raw(verdict):options.raw??JSON.stringify(verdict)},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:20,total_tokens:40,cost:0.02}}),{status:200,headers:{'content-type':'application/json'}});
  })});
  const {NativeClipVisionReviewServiceV1}=loadTypeScriptModule(base+'content-intelligence/social-factory/native-clip-vision-review.service.v1.ts',{
    '../../openai/ai.usage.service':{AiUsageService},'../../openai/ai.provider.config':configModule,'../../openai/ai.text-chain':chain,'../../user/acting.user':acting,
    '../../openai/ai.clients':{getMastraAgentModelEntries:async(org,role,selected)=>({provider:'openrouter',primaryModel:selected.modelId,entries:[{enabled:true,maxRetries:0,model:sdk.chat(selected.modelId)}]})},
    '../../database/prisma/media/media.service':{MediaService:token},'./social-factory.repository':{SocialFactoryRepository},'./source-artifact.service':{SourceArtifactServiceV1:token},'./campaign/domain':domain,'./native-clip-production.binding.v1':binding,'./native-clip-vision.binding.v1':visionBinding,
    './editorial/assets/editorial-assets.v1':{readEditorialOwnedImage:async path=>{imagesRead.push(path);const value=path.includes('first_frame')?frameBytes.first_frame:frameBytes.last_frame;return options.wrongBytes?frameBytes.first_frame:value;}},
  });
  current=await setup({frameBytes,visionFactory:({repository,sources,fixture})=>new NativeClipVisionReviewServiceV1(repository,sources,{mediaInWorkspace:async(org,ids)=>[...fixture.tables.media.values()].filter(r=>r.organizationId===org&&!r.deletedAt&&ids.includes(r.id))},usage)});
  await current.prepare();const q=await current.service.budgetQuestion(current.ids.org,current.ids.actor,THREAD,current.pilotId,'actual-budget-tool','ru');await current.service.answerBudget(current.ids.org,current.ids.actor,THREAD,current.pilotId,'actual-budget-tool',q,{answer:'10'});
  const v=(await current.service.open(current.ids.org,current.ids.actor,THREAD,current.pilotId)).production.executionApproval;
  await current.service.launch(current.ids.org,current.ids.actor,THREAD,{pilotId:current.pilotId,preflightId:v.preflightId,approvalHash:v.approvalHash});await current.settle('first_frame');
  return {...current,http,usageRows,imagesRead,config};
}
test('Terra receives both actual ordered PNG byte payloads through the installed SDK; raw/model/cost are retained before final clip admission',async()=>{
  const f=await visionFixture();await f.settle('last_frame');
  const saved=f.parent().payload.production.vision;expect(saved.state).toBe('reviewed');expect(JSON.parse(saved.raw)).toEqual(saved.result);expect(saved.audit).toMatchObject({actualModel:'openai/gpt-6.1-terra',modelProvenance:'provider_response',inputDigest:saved.inputDigest});
  expect(f.http).toHaveLength(1);expect(f.usageRows).toHaveLength(1);expect(f.usageRows[0]).toMatchObject({status:'succeeded',userId:f.ids.actor,costUsd:0.02});expect(f.calls).toContain('admit:clip');
  const count=f.http.length;await f.vision.review(f.ids.org,f.ids.actor,f.pilotId);await f.service.open(f.ids.org,f.ids.actor,THREAD,f.pilotId);expect(f.http).toHaveLength(count);
});
test('a complete JSON-fenced verdict passes the same model and binding guards without another call',async()=>{
  const f=await visionFixture({raw:verdict=>'```json\n'+JSON.stringify(verdict)+'\n```'});await f.settle('last_frame');
  const vision=f.parent().payload.production.vision;expect(vision.state).toBe('reviewed');expect(vision.raw.startsWith('```json\n')).toBe(true);
  expect(vision.result.verdict).toBe('accept');expect(f.http).toHaveLength(1);expect(f.usageRows[0].status).toBe('succeeded');
});
async function failedFencedFixture(){
  const f=await visionFixture({raw:verdict=>'```json\n'+JSON.stringify(verdict)+'\n```'}),apply=f.vision.apply.bind(f.vision);
  f.vision.apply=async()=>{throw Error('Synthetic historical parser failure');};await f.settle('last_frame');f.vision.apply=apply;
  f.usageRows[0].status='failed';return f;
}
test('explicit same-response recovery preserves failed usage and raw without another SDK call or quote',async()=>{
  const f=await failedFencedFixture(),before=structuredClone(f.parent().payload.production.vision),calls=[...f.calls];
  expect(before).toMatchObject({state:'needs_input',blocker:'CLIP_VISION_OPERATION_UNCERTAIN'});
  const result=await f.service.recoverVisionFencedV1(f.ids.org,f.ids.actor,THREAD,{messageId:'recovery-message',text:'Recover the saved review'}, {pilotId:f.pilotId});
  const saved=f.parent().payload.production.vision;expect(result.production.visionReview.state).toBe('reviewed');expect(saved.raw).toBe(before.raw);expect(saved.audit).toEqual(before.audit);
  expect(saved.recoveryV1).toEqual({priorState:'needs_input',priorBlocker:'CLIP_VISION_OPERATION_UNCERTAIN',rawSha256:sha(Buffer.from(before.raw)),requestMessageId:'recovery-message',validation:'fenced_json_bound_v1'});
  expect(f.usageRows[0].status).toBe('failed');expect(f.http).toHaveLength(1);expect(f.calls).toEqual(calls);
  await f.service.recoverVisionFencedV1(f.ids.org,f.ids.actor,THREAD,{messageId:'recovery-message',text:'Recover the saved review'}, {pilotId:f.pilotId});
  expect(f.parent().payload.production.vision).toEqual(saved);expect(f.http).toHaveLength(1);expect(f.calls).toEqual(calls);
});
test.each(['source','frame','stop'])('replaying recovery after %s changes fails current validation',async change=>{
  const f=await failedFencedFixture(),request={messageId:'recovery-message',text:'Recover the saved review'},input={pilotId:f.pilotId};
  await f.service.recoverVisionFencedV1(f.ids.org,f.ids.actor,THREAD,request,input);
  if(change==='source')await f.editPost('Changed after recovery');
  if(change==='frame')f.parent().payload.production.framePair.assets[1].byteSha256='0'.repeat(64);
  if(change==='stop')await f.service.stop(f.ids.org,f.ids.actor,THREAD,f.pilotId,'stop-request');
  await expect(f.service.recoverVisionFencedV1(f.ids.org,f.ids.actor,THREAD,request,input)).rejects.toBeDefined();expect(f.http).toHaveLength(1);
});
test('recovering the saved replacement review reconciles only its vision blocker without quote or job',async()=>{
  const options={verdict:{verdict:'blocked',findings:[{category:'public_text',detail:'Correct the title.'}]}},f=await visionFixture(options);
  await f.settle('last_frame');const oldIntent=f.parent().payload.production.stagePlans.last_frame.intentId,quote=f.hgg.quote,admit=f.hgg.admit;
  f.hgg.quote=async(org,actor,plan)=>{const value=await quote(org,actor,plan);if(plan.intentId!==oldIntent && plan.input.kind==='image_frame' && plan.input.slot==='last'){const row=f.stages.get(plan.intentId);row.public.preflightId='repair-preflight';return f.hgg.read(org,actor,'repair-preflight');}return value;};
  f.hgg.admit=async(org,actor,id,hash)=>{await admit(org,actor,id,hash);const row=[...f.stages.values()].find(r=>r.public.preflightId===id);if(id==='repair-preflight')row.public.jobId='repair-job';return f.hgg.read(org,actor,id);};
  const request={messageId:'repair-request',text:'Correct the final title.'},view=await f.service.prepareLastFrameRepair(f.ids.org,f.ids.actor,THREAD,request,{pilotId:f.pilotId}),repair=view.production.lastFrameRepair;
  await f.service.launchLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{pilotId:f.pilotId,repairId:repair.id,preflightId:repair.preflightId,approvalHash:repair.approvalHash});
  const row=f.stages.get(f.parent().payload.production.lastFrameRepair.plan.intentId),id='owned-repaired-last',path='https://owned.invalid/last_frame-repaired.png';
  row.public.state='saved';row.public.result={ownedMediaId:id,path,mime:'image/png',width:144,height:256,byteSha256:sha(frameBytes.last_frame)};
  f.tables.media.set(id,{id,organizationId:f.ids.org,path,type:'image',deletedAt:null,updatedAt:new Date('2026-01-01T00:00:00Z')});
  delete options.verdict;options.raw=verdict=>'```json\n'+JSON.stringify(verdict)+'\n```';const apply=f.vision.apply.bind(f.vision);f.vision.apply=async()=>{throw Error('historical parse failure');};
  await f.service.onStageSettled({eventId:'repair-job',jobId:'repair-job',organizationId:f.ids.org,actorId:f.ids.actor,pilotId:f.pilotId,stage:'last_frame'});f.vision.apply=apply;
  const p=f.parent().payload.production;expect(p.lastFrameRepair.state).toBe('blocked');expect(p.blockers).toContain('CLIP_VISION_OPERATION_UNCERTAIN');
  p.blockers.push('UNRELATED');const old=structuredClone(p.lastFrameRepair.previous),calls=[...f.calls],http=f.http.length;
  const recovered=await f.service.recoverVisionFencedV1(f.ids.org,f.ids.actor,THREAD,{messageId:'recovery-message',text:'Recover saved review'}, {pilotId:f.pilotId});
  expect(recovered.production.lastFrameRepair).toMatchObject({state:'reviewed',current:true});expect(recovered.production.visionReview).toMatchObject({state:'reviewed',current:true,verdict:'accept'});
  expect(f.parent().payload.production.blockers).toEqual(['UNRELATED']);expect(f.parent().payload.production.lastFrameRepair.previous).toEqual(old);expect(f.calls).toEqual(calls);expect(f.http).toHaveLength(http);
});
test.each(['context','frame','model','digest','audit','source'])('same-response recovery rejects changed %s without mutating evidence',async change=>{
  const f=await failedFencedFixture(),p=f.parent().payload,v=p.production.vision;
  if(change==='context')p.production.contextDigest='0'.repeat(64);
  if(change==='frame')p.production.framePair.assets[1].byteSha256='0'.repeat(64);
  if(change==='model')v.audit.actualModel='other/model';
  if(change==='digest')v.inputDigest='0'.repeat(64);
  if(change==='audit')delete v.audit;
  if(change==='source')await f.editPost('Changed source');
  const before=structuredClone(v),calls=[...f.calls];
  await expect(f.service.recoverVisionFencedV1(f.ids.org,f.ids.actor,THREAD,{messageId:'recovery-message',text:'Recover the saved review'}, {pilotId:f.pilotId})).rejects.toBeDefined();
  expect(f.parent().payload.production.vision).toEqual(before);expect(f.http).toHaveLength(1);expect(f.calls).toEqual(calls);
});
test.each([{raw:'{malformed'},{actualModel:'openai/gpt-6.1-sol'},{verdict:{frameDigests:[{slot:'first',byteSha256:'0'.repeat(64)},{slot:'last',byteSha256:'1'.repeat(64)}]}}])('captured invalid/nonindependent/mismatched result cannot admit a clip or buy another vision call (%j)',async options=>{
  const f=await visionFixture(options);await f.settle('last_frame');const saved=structuredClone(f.parent().payload.production.vision);expect(saved.state).toBe('needs_input');expect(saved.raw).toBeDefined();expect(f.calls).not.toContain('admit:clip');
  await f.vision.review(f.ids.org,f.ids.actor,f.pilotId);expect(f.http).toHaveLength(1);expect(f.parent().payload.production.vision).toEqual(saved);
});
test('source edit during inference preserves actual purchased raw but stops the clip',async()=>{
  const f=await visionFixture({onHttp:f=>f.editPost('Changed during actual image review.')});await f.settle('last_frame');
  expect(f.parent().payload.production.vision).toMatchObject({state:'needs_input',blocker:'SOURCE_ARTIFACT_STALE'});expect(f.parent().payload.production.vision.raw).toBeDefined();expect(f.calls).not.toContain('admit:clip');expect(f.http).toHaveLength(1);
});
test('lost vision response remains uncertain with no replacement call or clip',async()=>{
  const f=await visionFixture({lostResponse:true});await f.settle('last_frame');expect(f.parent().payload.production.vision.state).toBe('uncertain');expect(f.calls).not.toContain('admit:clip');
  await f.vision.review(f.ids.org,f.ids.actor,f.pilotId);expect(f.http).toHaveLength(1);expect(f.usageRows[0].costUsd).toBeNull();
});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
test.each([false,true])('late same-operation paid reply survives expiry/recovery, with guarded application after stop=%s',async stopped=>{
  const entered=deferred(),release=deferred(),f=await visionFixture({onHttp:async()=>{entered.resolve();await release.promise;}});
  const original=f.settle('last_frame');await entered.promise;f.parent().payload.production.vision.leaseUntil='2001-01-01T00:00:00Z';
  expect((await f.vision.review(f.ids.org,f.ids.actor,f.pilotId)).state).toBe('uncertain');
  const last=[...f.stages.values()].find(r=>r.stage==='last_frame'),event={eventId:last.public.jobId,organizationId:f.ids.org,actorId:f.ids.actor,pilotId:f.pilotId,stage:'last_frame',jobId:last.public.jobId};
  await f.service.onStageSettled(event);expect(f.parent().payload.production.settledEvents.find(v=>v.eventId===event.eventId).state).toBe('applied');
  if(stopped)await f.service.stop(f.ids.org,f.ids.actor,THREAD,f.pilotId,'actual-stop-request');
  release.resolve();await original;const saved=f.parent().payload.production.vision;
  expect(saved.raw).toBeDefined();expect(saved.audit).toMatchObject({actualModel:'openai/gpt-6.1-terra',modelProvenance:'provider_response'});expect(saved.state).toBe(stopped?'needs_input':'reviewed');
  expect(f.http).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:clip')).toHaveLength(stopped?0:1);
  await f.vision.review(f.ids.org,f.ids.actor,f.pilotId);expect(f.http).toHaveLength(1);
});
test('explicit saved-parent continuation applies captured late raw behind an applied event once, without another model or quote for existing jobs',async()=>{
  const f=await visionFixture(),captured=deferred(),release=deferred(),apply=f.vision.apply.bind(f.vision);let applications=0;
  f.vision.apply=async(...args)=>{if(applications++===0){captured.resolve();await release.promise;}return apply(...args);};
  const original=f.settle('last_frame');await captured.promise;const prod=f.parent().payload.production;
  expect(prod.vision.state).toBe('captured');const raw=prod.vision.raw;prod.settledEvents.find(v=>v.stage==='last_frame').state='applied';
  await f.service.prepare(f.ids.org,f.ids.actor,THREAD,REQUEST,{pilotId:f.pilotId});
  expect(f.parent().payload.production.vision.state).toBe('reviewed');expect(f.parent().payload.production.vision.raw).toBe(raw);expect(f.http).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:clip')).toHaveLength(1);
  release.resolve();await original;expect(f.calls.filter(v=>v==='admit:clip')).toHaveLength(1);expect(f.http).toHaveLength(1);
});


test('new configured Flash vision review retains the accepted Sol/Terra scenario and paid frames', async () => {
  const f=await visionFixture({config:{roleModels:{draft:'google/gemini-4-argon',agent:'google/gemini-4-argon',review:'google/gemini-3.8-flash'}},actualModel:'google/gemini-3.8-flash'});
  const savedText=structuredClone({policy:f.parent().payload.policy,stages:f.parent().payload.stages,source:f.parent().payload.source});
  await f.settle('last_frame');
  const p=f.parent().payload,vision=p.production.vision;
  expect(vision.state).toBe('reviewed');expect(vision.selectedProvider).toBe('openrouter');expect(vision.selectedModel).toBe('google/gemini-3.8-flash');
  expect(vision.audit).toMatchObject({selectedModel:'google/gemini-3.8-flash',actualModel:'google/gemini-3.8-flash',modelProvenance:'provider_response'});
  expect({policy:p.policy,stages:p.stages,source:p.source}).toEqual(savedText);
  expect(f.http).toHaveLength(1);expect(f.http[0].body.model).toBe('google/gemini-3.8-flash');
  expect(f.calls.filter(v=>v==='admit:first_frame')).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:last_frame')).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:clip')).toHaveLength(1);
});

test.each([null,'openai/gpt-6.1-terra','google/gemini-4-argon'])('a new Flash selection refuses actual-model mismatch %s without admitting clip', async actualModel => {
  const f=await visionFixture({config:{roleModels:{review:'google/gemini-3.8-flash'}},actualModel});await f.settle('last_frame');
  expect(f.parent().payload.production.vision.state).toBe('needs_input');expect(f.calls).not.toContain('admit:clip');expect(f.http).toHaveLength(1);
});


test('a Flash-rejected pair can prepare the same scoped last-frame repair without rewriting legacy text or first frame', async () => {
  const f=await visionFixture({config:{roleModels:{review:'google/gemini-3.8-flash'}},actualModel:'google/gemini-3.8-flash',verdict:{verdict:'blocked',findings:[{category:'public_text',detail:'Correct the last-frame title.'}]}});
  await f.settle('last_frame');
  const p=f.parent().payload,before=structuredClone({policy:p.policy,stages:p.stages,firstFrame:p.production.firstFrame});
  expect(p.production.vision.selectedModel).toBe('google/gemini-3.8-flash');
  const out=await f.service.prepareLastFrameRepair(f.ids.org,f.ids.actor,THREAD,{messageId:'new-flash-repair-request',text:'Correct only the rejected final frame within the existing cap.'},{pilotId:f.pilotId});
  expect(out.production.lastFrameRepair.current).toBe(true);
  const changed=f.parent().payload;expect({policy:changed.policy,stages:changed.stages,firstFrame:changed.production.firstFrame}).toEqual(before);
  expect(f.http).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:first_frame')).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:last_frame')).toHaveLength(1);
});


test('a new vision response remains bound to its captured selection when settings change during inference', async () => {
  let f;f=await visionFixture({config:{roleModels:{review:'google/gemini-3.8-flash'}},actualModel:'google/gemini-3.8-flash',onHttp:()=>{f.config.roleModels.review='custom/later-review-setting';}});
  await f.settle('last_frame');
  const vision=f.parent().payload.production.vision;
  expect(vision.state).toBe('reviewed');expect(vision.selectedModel).toBe('google/gemini-3.8-flash');expect(vision.audit.actualModel).toBe(vision.selectedModel);
  expect(f.http).toHaveLength(1);expect(f.calls.filter(v=>v==='admit:clip')).toHaveLength(1);
});
