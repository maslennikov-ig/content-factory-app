const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {create}=require('./helpers/video-domain-v1.fixture.cjs');
const DB=process.env.CF_VIDEO_DATABASE_URL;
const lib='libraries/nestjs-libraries/src/';
const fakeClass=class{};
const markers={
 '../video-job.service':{VideoJobService:fakeClass},'../video-credentials.service':{VideoCredentialsService:fakeClass},
 '../video-media.v1':{VideoMediaV1:fakeClass},'../providers/heygen.provider':{HeygenProviderV1:fakeClass},
 '../providers/higgsfield.provider':{HiggsfieldProviderV1:fakeClass},
};
const {VideoProductionRepository}=loadTypeScriptModule(lib+'database/prisma/video-production/video-production.repository.ts');
const {VideoProductionService}=loadTypeScriptModule(lib+'videos/production/video-production.service.ts',markers);
const domain=loadTypeScriptModule(lib+'videos/production/video-production.v1.ts');
const {videoSourceRevisionV1}=loadTypeScriptModule(lib+'videos/video-brief.v1.ts');
const {VideoCompositionProviderV1}=loadTypeScriptModule(lib+'videos/video-composition.provider.v1.ts');
const {HeygenStudioCompositionProviderV1}=loadTypeScriptModule(lib+'videos/providers/composition/heygen-studio.provider.v1.ts');
const {HyperframesCompositionProviderV1}=loadTypeScriptModule(lib+'videos/providers/composition/hyperframes.provider.v1.ts');
const {HeygenProviderV1}=loadTypeScriptModule(lib+'videos/providers/heygen.provider.ts');
const {HiggsfieldProviderV1}=loadTypeScriptModule(lib+'videos/providers/higgsfield.provider.ts');

async function fixture(options={}){
 const f=await create(options.client??DB,options);const repo=new VideoProductionRepository(f.db);const studio=new HeygenStudioCompositionProviderV1();const hf=new HyperframesCompositionProviderV1();
 f.service.composition=new VideoCompositionProviderV1(studio,hf);
 const starts=[];const p=new VideoProductionService(repo,f.repository,f.credentials,new HeygenProviderV1(),new HiggsfieldProviderV1(),studio,hf,f.service,f.service.media, {start:async(...a)=>starts.push(a)});
 const piece=await f.db.contentPiece.findUnique({where:{id:f.pieceId}});
 const manifest={version:1,pieceId:f.pieceId,pieceRevision:videoSourceRevisionV1(piece),title:'Exact source video',locale:'ru',aspectRatio:'16:9',resolution:'1080p',durationSeconds:30,audio:true,captions:false,
 scenes:[{id:'opening',kind:'presenter',durationSeconds:15,script:'Цена не составляет 2,5 рубля.',avatarId:'fixture_avatar',voiceId:'fixture_voice_ru',engine:'avatar_iii'},
 {id:'closing',kind:'presenter',durationSeconds:15,script:'Дата запуска 22 октября.',avatarId:'fixture_avatar',voiceId:'fixture_voice_ru',engine:'avatar_iii'}]};
 return {...f,p,repo,manifest,starts,async revision(m=manifest,parentId){return p.createRevision(f.org.id,f.user.id,{manifest:m,intentId:randomUUID(),...(parentId?{parentId}:{})});},
 async approve(row,budget=10){const ready=await p.preflight(f.org.id,f.user.id,row.id,{maxTotalUsd:budget});assert.deepEqual(ready.approval.blockers,[]);return p.approveAndLaunch(f.org.id,f.user.id,row.id,{approvalId:ready.approval.id,digest:ready.digest});}};
}

test('manifest rejects duplicate scenes, bad timing, unsupported final resolution before any generation',()=>{
 const base={version:1,pieceId:randomUUID(),pieceRevision:'rev',title:'Title',locale:'en',aspectRatio:'16:9',resolution:'1080p',durationSeconds:10,audio:false,captions:false,scenes:[{id:'a',kind:'video',durationSeconds:10,script:'',mediaId:randomUUID()}]};
 assert.equal(domain.parseProductionManifestV1(base).scenes.length,1);
 for(const bad of [{...base,scenes:[base.scenes[0],base.scenes[0]],durationSeconds:20},{...base,durationSeconds:12},{...base,resolution:'720p'}])assert.throws(()=>domain.parseProductionManifestV1(bad));
});

test('immutable revision, same-intent replay, actor/tenant denial and source invalidation', {skip:!DB}, async()=>{
 const f=await fixture();try{
  const intentId=randomUUID();const value={manifest:f.manifest,intentId};const row=await f.p.createRevision(f.org.id,f.user.id,value);
  assert.equal((await f.p.createRevision(f.org.id,f.user.id,value)).id,row.id);
  await assert.rejects(f.p.createRevision(f.org.id,f.user.id,{...value,manifest:{...f.manifest,title:'different'}}),e=>e.getResponse().code==='VIDEO_PRODUCTION_INTENT_MISMATCH');
  await assert.rejects(f.p.get(f.otherOrg.id,row.id));
  await assert.rejects(f.p.preflight(f.org.id,f.otherUser.id,row.id,{maxTotalUsd:10}));
  await f.db.contentPiece.update({where:{id:f.pieceId},data:{body:'Edited source'}});
  await assert.rejects(f.p.preflight(f.org.id,f.user.id,row.id,{maxTotalUsd:10}),e=>e.getResponse().code==='VIDEO_SOURCE_CHANGED');
 }finally{await f.close();}
});

test('approval atomically reserves scenes plus final in existing ledger; replay does not duplicate', {skip:!DB},async()=>{
 const f=await fixture();try{
  const row=await f.revision();const approved=await f.approve(row);
  assert.deepEqual(approved.cost.unknownJobIds,[]);assert.equal(approved.cost.reservedJobIds.length,3);
  const jobs=await f.db.videoGenerationJob.findMany({where:{organizationId:f.org.id}});
  assert.equal(jobs.length,3);assert.equal(jobs.filter(j=>j.state==='awaiting_assets').length,1);
  assert.equal(jobs.reduce((n,j)=>n+Number(j.reservedUsd),0),6);assert.ok(jobs.every(j=>j.productionRevisionId===row.id&&j.draftId===''));
  await f.p.approveAndLaunch(f.org.id,f.user.id,row.id,{approvalId:approved.approval.id,digest:approved.digest});
  assert.equal(await f.db.videoGenerationJob.count({where:{organizationId:f.org.id}}),3);
  assert.equal((await f.service.list(f.org.id)).length,0);assert.equal((await f.service.get(f.org.id,jobs[0].id)).draftId,null);
 }finally{await f.close();}
});

test('concurrent production approvals cannot overspend one provider budget', {skip:!DB},async()=>{
 const f=await fixture({monthlyBudgetUsd:8});try{
  const a=await f.revision();const b=await f.revision({...f.manifest,title:'Other production'});
  const ready=await Promise.all([a,b].map(r=>f.p.preflight(f.org.id,f.user.id,r.id,{maxTotalUsd:10})));
  const outcomes=await Promise.allSettled(ready.map(r=>f.p.approveAndLaunch(f.org.id,f.user.id,r.id,{approvalId:r.approval.id,digest:r.digest})));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(await f.db.videoGenerationJob.count({where:{organizationId:f.org.id}}),3);
 }finally{await f.close();}
});

test('unknown old charges stay reserved across month rollover and block admission', {skip:!DB},async()=>{
 const f=await fixture({monthlyBudgetUsd:8});try{
  const row=await f.revision();await f.approve(row);
  const old=new Date();old.setUTCMonth(old.getUTCMonth()-2);
  await f.db.videoGenerationJob.updateMany({where:{organizationId:f.org.id},data:{createdAt:old,state:'uncertain',submitAttempts:1}});
  const next=await f.revision({...f.manifest,title:'New month'});const ready=await f.p.preflight(f.org.id,f.user.id,next.id,{maxTotalUsd:10});
  await assert.rejects(f.p.approveAndLaunch(f.org.id,f.user.id,next.id,{approvalId:ready.approval.id,digest:ready.digest}),e=>e.getResponse().code==='VIDEO_MONTHLY_BUDGET_EXHAUSTED');
 }finally{await f.close();}
});

test('stop wins against leased-but-unsubmitted action and submitting CAS cannot resurrect it', {skip:!DB},async()=>{
 const f=await fixture();try{
  const row=await f.revision();const approved=await f.approve(row);const jobId=approved.approval.scenes[0].jobId;const owner=randomUUID();
  assert.equal(await f.repository.claim(f.org.id,jobId,owner),true);
  await f.p.stop(f.org.id,f.user.id,row.id);
  await assert.rejects(f.repository.write(f.org.id,jobId,owner,{state:'submitting',submitAttempts:1}));
  assert.equal((await f.repository.job(f.org.id,jobId)).state,'canceled');
  assert.equal((await f.p.runStep(f.org.id,row.id)).done,true);assert.equal(f.transport.submits.length,0);
  assert.equal((await f.repository.job(f.org.id,approved.approval.finalJobId)).state,'canceled');
 }finally{await f.close();}
});

test('selective scene revision reuses completed unchanged job and creates only changed scene plus new final', {skip:!DB},async()=>{
 const f=await fixture();try{
  const row=await f.revision();const first=await f.approve(row);
  for(const scene of first.approval.scenes)await f.runToTerminal(scene.jobId);
  const nextManifest=structuredClone(f.manifest);nextManifest.scenes[1].script='Дата запуска — 23 октября.';
  const next=await f.revision(nextManifest,row.id);const approved=await f.approve(next);
  assert.equal(approved.approval.scenes[0].jobId,first.approval.scenes[0].jobId);assert.equal(approved.approval.scenes[0].reused,true);
  assert.notEqual(approved.approval.scenes[1].jobId,first.approval.scenes[1].jobId);
  assert.equal(await f.db.videoGenerationJob.count({where:{organizationId:f.org.id}}),5);assert.equal(f.transport.submits.length,2);
 }finally{await f.close();}
});

test('uncertain scene becomes actionable attention and is never regenerated', {skip:!DB},async()=>{
 const f=await fixture();try{
  const row=await f.revision();const first=await f.approve(row);const id=first.approval.scenes[0].jobId;
  await f.db.videoGenerationJob.update({where:{id},data:{state:'uncertain',submitAttempts:1}});
  const status=await f.p.runStep(f.org.id,row.id);assert.equal(status.done,true);assert.equal(status.state,'needs_attention:uncertain');
  assert.equal((await f.p.get(f.org.id,row.id)).state,'needs_attention');assert.equal(f.transport.submits.length,0);
  const revision=await f.revision({...f.manifest,title:'Revision'},row.id);const preflight=await f.p.preflight(f.org.id,f.user.id,revision.id,{maxTotalUsd:10});
  assert.ok(preflight.approval.blockers.includes('VIDEO_SCENE_RECONCILIATION_REQUIRED:opening'));
 }finally{await f.close();}
});

async function installCompositionTransport(f,{captioned=false,seconds=60}={}){
 const previous=globalThis.fetch;let submits=0;
 globalThis.fetch=async(value,init={})=>{
  const u=new URL(String(value));
  if(u.pathname==='/v3/hyperframes/renders'&&init.method==='POST'){
   submits++;return new Response(JSON.stringify({data:{render_id:'render_'+submits}}));
  }
  if(u.pathname.startsWith('/v3/hyperframes/renders/'))return new Response(JSON.stringify({data:{render_id:u.pathname.split('/').at(-1),status:'completed',format:'mp4',video_url:'https://example.com/composed.mp4',duration:480,resolution:'1080p'}}));
  if(u.href==='https://example.com/composed.mp4'){
   f.transport.downloads.push({url:u.href});
   if(f.transport.downloadFailures>0){f.transport.downloadFailures--;return new Response(null,{status:503});}
   return new Response(f.mp4,{headers:{'content-type':'video/mp4','content-length':String(f.mp4.length)}});
  }
  const response=await previous(value,init);
  if(/^\/v3\/videos\/[^/]+$/.test(u.pathname)&&init.method!=='POST'){
   const result=await response.json();if(result.data?.status==='completed'){result.data.duration=seconds;if(captioned)result.data.captioned_video_url=result.data.video_url;}
   return new Response(JSON.stringify(result));
  }
  return response;
 };
 return {get submits(){return submits;}};
}
async function finishProduction(f,id,limit=60){
 for(let i=0;i<limit;i++){const step=await f.p.runStep(f.org.id,id);if(step.done)return f.p.get(f.org.id,id);}
 throw new Error('Production did not finish within bounded fixture steps');
}

test('eight-minute presenter production freezes actual ordered scenes, submits final once and saves owned playable fixture', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  const transport=await installCompositionTransport(f,{captioned:true});
  const manifest={...f.manifest,captions:true,durationSeconds:480,scenes:Array.from({length:8},(_,i)=>({...f.manifest.scenes[0],id:'scene_'+i,durationSeconds:60,script:'Сцена '+i+'. Цена не составляет 2,5 рубля.'}))};
  const row=await f.revision(manifest);await f.approve(row,30);
  const complete=await finishProduction(f,row.id);assert.equal(complete.state,'completed');assert.ok(complete.result?.id);
  assert.equal(transport.submits,1);assert.equal(f.transport.submits.length,8);
  const final=await f.repository.job(f.org.id,complete.approval.finalJobId);const request=final.request.composition;
  assert.equal(request.input.durationSeconds,480);assert.deepEqual(request.input.scenes.map(s=>s.id),manifest.scenes.map(s=>s.id));
  assert.ok(request.input.scenes.every(s=>s.sourceCaptions==='burned'&&s.retainSourceAudio));
  assert.equal(request.input.approvedScript,manifest.scenes.map(s=>s.script).join('\n\n'));
  assert.equal(final.costUsd,null);assert.equal(complete.cost.unknownJobIds.length,9);
  const download=await f.service.download(f.org.id,final.id);assert.deepEqual(download.bytes,f.mp4);
  // The MP4 is a short CC0 fixture: synthetic 480s status is engineering evidence, never a real long-video pilot.
 }finally{await f.close();}
});

test('faceless owned narration composes without presenter calls and failed saving retries the same render', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  const transport=await installCompositionTransport(f);
  const media=await f.db.media.create({data:{organizationId:f.org.id,name:'owned.mp4',type:'video',path:'https://owned-video.example/uploads/owned.mp4'}});
  const manifest={...f.manifest,locale:'en',durationSeconds:480,scenes:[{id:'faceless',kind:'video',durationSeconds:480,script:'The amount is not 2.5.',mediaId:media.id}]};
  const row=await f.revision(manifest);const first=await f.approve(row);
  f.transport.downloadFailures=1;
  const failed=await finishProduction(f,row.id);assert.equal(failed.state,'needs_attention');assert.equal(transport.submits,1);assert.equal(f.transport.submits.length,0);
  assert.equal((await f.repository.job(f.org.id,first.approval.finalJobId)).state,'save_failed');
  await f.p.retrySave(f.org.id,f.user.id,row.id,first.approval.finalJobId);
  const complete=await finishProduction(f,row.id);assert.equal(complete.state,'completed');assert.equal(transport.submits,1);assert.ok(complete.result?.id);
 }finally{await f.close();}
});

test('source changed after production approval prevents the claimed job from submitting', {skip:!DB},async()=>{
 const f=await fixture();try{
  const row=await f.revision();const first=await f.approve(row);
  await f.db.contentPiece.update({where:{id:f.pieceId},data:{body:'Different current source'}});
  await f.service.runStep(f.org.id,first.approval.scenes[0].jobId);
  const job=await f.repository.job(f.org.id,first.approval.scenes[0].jobId);
  assert.equal(job.state,'failed');assert.equal(Number(job.costUsd),0);assert.equal(f.transport.submits.length,0);
 }finally{await f.close();}
});

test('save failure pauses untouched scenes across native recovery, then save retry resumes the complete production', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  const transport=await installCompositionTransport(f,{seconds:15.5});
  const m={...f.manifest,durationSeconds:45,scenes:[...f.manifest.scenes,{...f.manifest.scenes[1],id:'third',script:'Третья сцена.'}]};
  const row=await f.revision(m);const approved=await f.approve(row);const first=approved.approval.scenes[0].jobId;
  await f.service.runStep(f.org.id,first);await f.service.runStep(f.org.id,first);
  f.transport.downloadFailures=1;await f.service.runStep(f.org.id,first);
  assert.equal((await f.repository.job(f.org.id,first)).state,'save_failed');
  assert.equal((await f.p.runStep(f.org.id,row.id)).state,'needs_attention:save_failed');
  const {VideoExecutionRecoveryV1}=loadTypeScriptModule(lib+'videos/video-execution.v1.ts',{'./video-job.service':{VideoJobService:f.service.constructor}});
  const native=new VideoExecutionRecoveryV1(f.service,{start:async(org,id)=>f.service.runStep(org,id)});
  const pending=await f.service.recoverPending();assert.ok(pending.every(j=>!approved.approval.scenes.slice(1).some(s=>s.jobId===j.id)));
  await native.recover();
  for(const scene of approved.approval.scenes.slice(1)){
   const untouched=await f.repository.job(f.org.id,scene.jobId);assert.equal(untouched.state,'accepted');assert.equal(untouched.submitAttempts,0);assert.equal(untouched.costUsd,null);
  }
  assert.equal(f.transport.submits.length,1);
  await f.p.retrySave(f.org.id,f.user.id,row.id,first);
  const complete=await finishProduction(f,row.id);
  assert.equal(complete.state,'completed');assert.equal(f.transport.submits.length,3);assert.equal(transport.submits,1);
 }finally{await f.close();}
});

test('disabled captions with cues are refused before generated-scene spend', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  const media=await f.db.media.create({data:{organizationId:f.org.id,name:'captioned.mp4',type:'video',path:'https://owned-video.example/clip.mp4'}});
  const m={...f.manifest,captions:false,scenes:[f.manifest.scenes[0],{id:'owned',kind:'video',durationSeconds:15,script:'Existing words',mediaId:media.id,sourceCaptions:'burned',captionCues:[{startSeconds:0,endSeconds:15,text:'Existing words'}]}]};
  await assert.rejects(f.revision(m),e=>e.getResponse().code==='VIDEO_CAPTIONS_DISABLED');
  assert.equal(f.transport.submits.length,0);assert.equal(await f.db.videoGenerationJob.count({where:{organizationId:f.org.id}}),0);
 }finally{await f.close();}
});

test('pause arriving after admission but before submitting leaves the untouched job recoverably accepted', {skip:!DB},async()=>{
 const f=await fixture();try{
  const row=await f.revision();const approved=await f.approve(row);const id=approved.approval.scenes[0].jobId;
  const write=f.repository.write.bind(f.repository);let raced=false;
  f.repository.write=async(...args)=>{
   if(!raced&&args[3].state==='submitting'){raced=true;await f.db.videoProductionRevision.update({where:{id:row.id},data:{state:'needs_attention'}});}
   return write(...args);
  };
  await f.service.runStep(f.org.id,id);
  const paused=await f.repository.job(f.org.id,id);assert.equal(paused.state,'accepted');assert.equal(paused.submitAttempts,0);assert.equal(paused.costUsd,null);assert.equal(paused.errorCode,'VIDEO_PRODUCTION_PAUSED');
  assert.equal(f.transport.submits.length,0);
  await f.repo.resume(f.org.id,row.id);await f.runToTerminal(id);assert.equal(f.transport.submits.length,1);
 }finally{await f.close();}
});

test('final preparation failure persists its actionable code on the unsubmitted final job', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  const row=await f.revision();const approved=await f.approve(row);
  for(const scene of approved.approval.scenes)await f.runToTerminal(scene.jobId);
  const first=await f.repository.job(f.org.id,approved.approval.scenes[0].jobId);
  await f.db.videoGenerationJob.update({where:{id:first.id},data:{providerResult:{state:'succeeded',url:'https://example.com/result.mp4'}}});
  const result=await f.p.runStep(f.org.id,row.id);assert.equal(result.state,'needs_attention:VIDEO_SCENE_ACTUAL_DURATION_UNKNOWN');
  const view=await f.p.get(f.org.id,row.id);const final=view.jobs.find(j=>j.id===approved.approval.finalJobId);
  assert.equal(final.errorCode,'VIDEO_SCENE_ACTUAL_DURATION_UNKNOWN');assert.equal(final.costCertainty,'reserved');assert.equal(f.transport.submits.length,2);
 }finally{await f.close();}
});

const fs=require('node:fs');
const path=require('node:path');
const results=loadTypeScriptModule(lib+'videos/production/video-production-result.v1.ts');
const realMp4=fs.readFileSync(path.join(__dirname,'fixtures/video-v1/flower.mp4'));
const realSrt=fs.readFileSync(path.join(__dirname,'fixtures/video-v1/confirmed-captions.srt'));

test('actual MP4 headers expose measured dimensions/duration and display rotation, with no request estimates',()=>{
 const metadata=results.measureMp4VideoV1(realMp4);
 assert.equal(metadata.width,960);assert.equal(metadata.height,540);assert.equal(metadata.durationSeconds,5.055);assert.equal(metadata.source,'mp4_bytes');assert.match(metadata.sha256,/^[a-f0-9]{64}$/);
 const rotated=Buffer.from(realMp4);const header=rotated.indexOf(Buffer.from('tkhd'))+4;assert.ok(header>4);
 for(const [i,value]of [0,65536,0,-65536,0,0,0,0,1073741824].entries())rotated.writeInt32BE(value,header+40+i*4);
 const portrait=results.measureMp4VideoV1(rotated);assert.equal(portrait.width,540);assert.equal(portrait.height,960);assert.equal(portrait.rotationDegrees,90);
 assert.throws(()=>results.measureMp4VideoV1(realMp4.subarray(0,200)),/VIDEO_METADATA_UNAVAILABLE/);
 const unsupported=Buffer.from(realMp4);unsupported.writeInt32BE(1234,header+40);
 assert.throws(()=>results.measureMp4VideoV1(unsupported),/VIDEO_METADATA_UNAVAILABLE/);
});

test('actual subtitle sidecar is parsed and bounded against the measured MP4, never the target duration',()=>{
 const actual=results.inspectSubtitleFileV1(realSrt,5.055);assert.equal(actual.mimeType,'application/x-subrip');assert.equal(actual.cueCount,2);assert.match(actual.sha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>results.inspectSubtitleFileV1(realSrt,1),/VIDEO_SUBTITLES_INVALID/);
 assert.throws(()=>results.inspectSubtitleFileV1(Buffer.from('<html>Not subtitles</html>'),480),/VIDEO_SUBTITLES_INVALID/);
 assert.throws(()=>results.inspectSubtitleFileV1(Buffer.from('1\n00:99:00,000 --> 01:40:00,000\nFact'),86400),/VIDEO_SUBTITLES_INVALID/);
});

test('production result measures the owned file, backfills old results and imports one real provider sidecar idempotently', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  await installCompositionTransport(f);const row=await f.revision();const approved=await f.approve(row);await finishProduction(f,row.id);
  const job=await f.repository.job(f.org.id,approved.approval.finalJobId);const stored={...job.storedFile};delete stored.metadata;delete stored.resultEvidence;
  await f.db.videoGenerationJob.update({where:{id:job.id},data:{model:'heygen-studio',storedFile:stored,providerResult:{state:'succeeded',duration:480,captionsBurned:true,subtitleUrl:'https://example.com/captions.srt'}}});
  const previous=globalThis.fetch;let sidecarReads=0;
  globalThis.fetch=async(url,init)=>String(url)==='https://example.com/captions.srt'?(sidecarReads++,new Response(realSrt,{headers:{'content-type':'application/x-subrip'}})):previous(url,init);
  const complete=await f.p.get(f.org.id,row.id);assert.equal(complete.result.metadataStatus,'measured');assert.equal(complete.result.width,960);assert.equal(complete.result.height,540);assert.equal(complete.result.durationSeconds,5.055);assert.notEqual(complete.result.durationSeconds,complete.manifest.durationSeconds);
  assert.equal(complete.result.captions.burned,'provider_confirmed');assert.equal(complete.result.subtitles.length,1);
  const subtitle=complete.result.subtitles[0];assert.equal(subtitle.mimeType,'application/x-subrip');assert.equal(subtitle.cueCount,2);assert.equal(subtitle.source,'provider_subtitle_file');
  assert.equal((await f.db.media.findFirst({where:{organizationId:f.org.id,id:subtitle.mediaId}})).type,'subtitle');
  const savedPath=path.join(f.uploadDirectory,new URL(subtitle.path).pathname.slice('/uploads/'.length));assert.deepEqual(fs.readFileSync(savedPath),realSrt);
  const second=await f.p.get(f.org.id,row.id);assert.equal(second.result.subtitles[0].mediaId,subtitle.mediaId);assert.equal(sidecarReads,1);
  assert.equal(await f.db.media.count({where:{organizationId:f.org.id,type:'subtitle'}}),1);
  await assert.rejects(f.p.get(f.otherOrg.id,row.id));
  await f.db.media.update({where:{id:subtitle.mediaId},data:{deletedAt:new Date()}});
  assert.deepEqual((await f.p.get(f.org.id,row.id)).result.subtitles,[]);
 }finally{await f.close();}
});

test('exact timed render cues become a real owned WebVTT, while request-only caption flags stay unverified', {skip:!DB},async()=>{
 const f=await fixture({frontendUrl:'https://owned-video.example'});try{
  await installCompositionTransport(f);
  const image=await f.db.media.create({data:{organizationId:f.org.id,name:'image.png',type:'image',path:'https://owned-video.example/image.png'}});
  const audio=await f.db.media.create({data:{organizationId:f.org.id,name:'narration.mp3',type:'audio',path:'https://owned-video.example/audio.mp3'}});
  const m={...f.manifest,durationSeconds:5.055,captions:true,scenes:[{id:'timed',kind:'image',durationSeconds:5.055,script:'One confirmed fact. A second confirmed fact.',mediaId:image.id,audioMediaId:audio.id,captionCues:[{startSeconds:0,endSeconds:1.5,text:'One confirmed fact.'},{startSeconds:1.5,endSeconds:4.5,text:'A second confirmed fact.'}]}]};
  const row=await f.revision(m);await f.approve(row);const complete=await finishProduction(f,row.id);
  assert.equal(complete.result.captions.burned,'authored_timed_cues');assert.equal(complete.result.subtitles.length,1);assert.equal(complete.result.subtitles[0].mimeType,'text/vtt');
  const mediaPath=path.join(f.uploadDirectory,new URL(complete.result.subtitles[0].path).pathname.slice('/uploads/'.length));
  const vtt=fs.readFileSync(mediaPath);assert.equal(results.inspectSubtitleFileV1(vtt,5.055).cueCount,2);
  const measured=results.measureMp4VideoV1(realMp4);
  const fake={id:'fake',model:'hyperframes',providerResult:{state:'succeeded',captionsBurned:true},request:{composition:{input:{captions:true,durationSeconds:480,scenes:m.scenes}}}};
  assert.equal(results.productionCaptionPlanV1(fake,[],measured).evidence.burned,'unverified');
  fake.request.composition.input.durationSeconds=5.055;fake.request.composition.input.scenes=[{id:'retained',durationSeconds:5.055,script:'One confirmed fact.',sourceCaptions:'burned',retainSourceAudio:true}];
  assert.equal(results.productionCaptionPlanV1(fake,[],measured).evidence.burned,'unverified');
 }finally{await f.close();}
});

test('validated caption storage uses the configured object store with a fixed safe type and no generic upload bypass',async()=>{
 const keys=['STORAGE_PROVIDER','CLOUDFLARE_BUCKETNAME','CLOUDFLARE_BUCKET_URL','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_ACCESS_KEY','CLOUDFLARE_SECRET_ACCESS_KEY','CLOUDFLARE_REGION'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const calls=[];
 try{
  Object.assign(process.env,{STORAGE_PROVIDER:'cloudflare',CLOUDFLARE_BUCKETNAME:'fixture',CLOUDFLARE_BUCKET_URL:'https://owned.example',CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_ACCESS_KEY:'fixture',CLOUDFLARE_SECRET_ACCESS_KEY:'fixture',CLOUDFLARE_REGION:'auto'});
  class Client{async send(command,options){calls.push({command,options});}destroy(){}}
  class Command{constructor(input){this.input=input;}}
  const storage=loadTypeScriptModule(lib+'videos/production/video-subtitle.storage.v1.ts',{'@aws-sdk/client-s3':{S3Client:Client,PutObjectCommand:Command}});
  const result=await storage.storeOwnedVideoSubtitleV1(realSrt,5.055,'provider_subtitle_file');
  assert.equal(result.mimeType,'application/x-subrip');assert.match(result.path,/^https:\/\/owned\.example\/[a-f0-9]{32}\.srt$/);
  assert.equal(calls.length,1);assert.equal(calls[0].command.input.ContentType,'application/x-subrip');assert.match(calls[0].command.input.ContentDisposition,/^attachment;/);assert.deepEqual(calls[0].command.input.Body,realSrt);assert.ok(calls[0].options.abortSignal instanceof AbortSignal);
  await assert.rejects(storage.storeOwnedVideoSubtitleV1(Buffer.from('<script>source text</script>'),480,'provider_subtitle_file'));
  assert.equal(calls.length,1);
 }finally{for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});

test('all production writes carry their trusted organization scope into real PostgreSQL predicates', {skip:!DB},async()=>{
 const {PrismaClient}=require('@prisma/client');
 const db=new PrismaClient({datasources:{db:{url:DB}},log:[{emit:'event',level:'query'}]});
 const queries=[];db.$on('query',event=>queries.push(event.query));
 let f;
 try{
  // The same real client executes the operations and records PostgreSQL SQL; no repository mocks.
  f=await fixture({frontendUrl:'https://owned-video.example',client:db});
 }catch(error){await db.$disconnect();throw error;}
 try{
  await installCompositionTransport(f);
  const row=await f.revision();const approved=await f.approve(row);const original=await f.repo.read(f.org.id,row.id);
  const sceneId=approved.approval.scenes[0].jobId;const owner=randomUUID();
  assert.equal(await f.repository.claim(f.org.id,sceneId,owner),true);
  await assert.rejects(f.repository.write(f.otherOrg.id,sceneId,owner,{state:'submitting'}));
  await assert.rejects(f.repository.write(f.otherOrg.id,sceneId,owner,{errorCode:'FOREIGN_WRITE'}));
  assert.equal((await f.repository.job(f.org.id,sceneId)).state,'accepted');
  await f.repository.release(f.org.id,sceneId,owner);
  const forged={...original,organizationId:f.otherOrg.id};
  await assert.rejects(f.repo.approve(forged,original.approval,[],{}));
  await assert.rejects(f.repo.finalJob(forged,{id:approved.approval.finalJobId}));
  await assert.rejects(f.repo.stop(f.otherOrg.id,row.id));
  const complete=await finishProduction(f,row.id);
  const finalId=complete.approval.finalJobId;const final=await f.repository.job(f.org.id,finalId);
  assert.equal(await f.repo.claimResultEvidence(f.org.id,finalId,final.resultMediaId,owner),true);
  await assert.rejects(f.repo.saveResultEvidence(f.otherOrg.id,finalId,final.resultMediaId,owner,final.storedFile.metadata,final.storedFile.resultEvidence.captions));
  await f.repo.saveResultEvidence(f.org.id,finalId,final.resultMediaId,owner,final.storedFile.metadata,final.storedFile.resultEvidence.captions);
  await f.repository.release(f.org.id,finalId,owner);
  await f.repo.stop(f.org.id,row.id);
  const writes=queries.filter(sql=>/UPDATE "public"\."(?:VideoGenerationJob|VideoProductionRevision)"/.test(sql));
  assert.ok(writes.length>10,'Expected actual approve/submit/final/evidence/stop writes.');
  for(const sql of writes){
   const where=sql.slice(sql.indexOf(' WHERE '));
   assert.match(where,/"organizationId"/,'A real write lost its organization predicate: '+sql);
  }
  assert.equal(await db.videoGenerationJob.count({where:{organizationId:f.otherOrg.id}}),0);
 }finally{await f.close();await db.$disconnect();}
});
