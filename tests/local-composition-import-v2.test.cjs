const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const c=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/local-reel/local-composition.v2.ts');
const {CampaignLocalCompositionServiceV2}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/local-composition.service.v2.ts',{
 '@nestjs/common':{Injectable:()=>x=>x,Inject:()=>()=>{},Optional:()=>()=>{}},
 '../../../database/prisma/media/media.service':{MediaService:class{}},
});
const sha=x=>createHash('sha256').update(x).digest('hex');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(tmpdir(),'cf-local-import-v2-')),uploads=path.join(root,'uploads');
 await fs.mkdir(path.join(uploads,'2026/01/02'),{recursive:true});t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const previous={};for(const [k,v]of Object.entries({STORAGE_PROVIDER:'local',UPLOAD_DIRECTORY:uploads,FRONTEND_URL:'http://127.0.0.1:9988'})){previous[k]=process.env[k];process.env[k]=v;}
 t.after(()=>{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const source={organizationId:'org',actorId:'actor',ref:{version:1,kind:'piece',pieceId:'piece',revision:sha('rev')},contentDigest:sha('source'),text:'Full speech',locale:'en-US'};
 const manifest={version:3,kind:'local_owned_composition',source:{pieceId:'piece',revision:source.ref.revision,textSha256:source.contentDigest},title:'Final',locale:'en-US',funding:{kind:'local_compute',scope:'final_only'},
  settings:{width:1920,height:1080,fps:30,fit:'contain_pad',transition:'hard_cut',captions:'authored_timed_text'},scenes:[{id:'clip',mediaId:'clip-media',durationSeconds:5,sourceAudio:'retain_source'}],
  timedText:{origin:'authored_timed_text',cues:[{startSeconds:0,endSeconds:5,text:'Full speech',role:'speech_caption'}]},screenTitles:[{startSeconds:0,endSeconds:2,text:'Title',role:'screen_title'}]};
 const mediaPath='2026/01/02/'+sha('input')+'.mp4',inputBytes=Buffer.from('owned-input'),output=path.join(root,'result.mp4'),outputBytes=Buffer.from('verified-output');
 await fs.writeFile(path.join(uploads,mediaPath),inputBytes);await fs.writeFile(output,outputBytes);
 const rows=[{id:'clip-media',path:process.env.FRONTEND_URL+'/uploads/'+mediaPath}];let saved=0,renders=0,checkpoint={},tamper=false;
 const facts=(digest,width=720,height=1280)=>({source:'mp4_bytes',sha256:digest,width,height,durationSeconds:5,videoTrackId:1,audio:true,rotationDegrees:0});
 const port={inspectVideo:async a=>facts(a.sha256,...(a.mediaId==='final'?[1920,1080]:[])),render:async input=>{
  renders++;const titles=input.screenTitles?.cues??[],cues=[...input.timedText.cues,...titles];
  const result={version:2,engineVersion:c.LOCAL_COMPOSITION_ENGINE_V2,organizationId:'org',productionRevisionId:'local-revision',manifestDigest:input.manifestDigest,approvedSettingsDigest:input.approvedSettingsDigest,source:input.source,settings:input.settings,
   renderKey:c.localCompositionRenderKeyV2(input,sha('toolchain')),toolchainDigest:sha('toolchain'),absolutePath:output,sha256:sha(outputBytes),bytes:outputBytes.length,metadata:facts(sha(outputBytes),1920,1080),
   scenes:[{id:'clip',sceneKey:sha('scene'),mediaId:'clip-media',sourceSha256:input.scenes[0].video.sha256,startFrame:0,frameCount:150,sourceDurationSeconds:5,sourceAudioRetained:true,upscaled:true,reused:false}],
   audio:{sourceAudioRetained:true,mixPolicy:'fixed_gains/v1',speechAlignment:'unverified'},captions:{kind:'authored_timed_text',sourceJobIds:[],speechAlignment:'unverified'},
   textRendering:{physicalBurn:true,cuesSha256:c.localCompositionDigestV2(cues),cueCount:cues.length,screenTitleCount:titles.length,speechCaptionCount:1,...(titles.length?{screenTitlesSha256:c.localCompositionDigestV2(titles)}:{}),speechCaptionsSha256:c.localCompositionDigestV2(input.timedText.cues),...(input.timedText.origin==='owned_subtitle_file'?{captionSource:{mediaId:input.timedText.sourceMediaId,sha256:input.timedText.sourceAssetSha256,originalCuesSha256:input.timedText.cuesSha256}}:{})},screenCopy:{kind:titles.length?'authored_timed_text':'not_authored_by_compositor',speech:false},reused:false};
  if(tamper)result.approvedSettingsDigest=sha('foreign');return result;
 },inspectCaptions:async(asset,_duration,role)=>{const cues=[{startSeconds:0,endSeconds:5,text:'Full speech',role}];return {origin:'owned_subtitle_file',sourceMediaId:asset.mediaId,sourceAssetSha256:asset.sha256,cues,cuesSha256:c.localCompositionDigestV2(cues)};},withPinnedResult:async(result,consume)=>{const fd=await fs.open(output,'r');try{return await consume(fd,async()=>{});}finally{await fd.close();}}};
 const media={mediaInWorkspace:async(_org,ids)=>rows.filter(r=>ids.includes(r.id)),saveLocalCompositionV2:async(_org,name,url,label,bytes)=>{saved++;let row=rows.find(r=>r.path===url);if(!row){row={id:'final',name,path:url,type:'video',fileSize:bytes};rows.push(row);}return row;}};
 const service=new CampaignLocalCompositionServiceV2(media,port),material={version:1,title:'Final',format:'long_video',sourceArtifact:source.ref,assets:[{id:'cover',mediaId:'cover',kind:'image',role:'cover'}],settings:{keep:true},evidence:[],script:'Full speech'};
 const run=()=>service.produce('org',source,material,manifest,checkpoint,async x=>{checkpoint=structuredClone(x);},{assertCurrent:async()=>{}},'local-revision');
 return {run,source,manifest,material,rows,output,get checkpoint(){return checkpoint;},get renders(){return renders;},get saved(){return saved;},tamper(){tamper=true;},ownedCaptions:async()=>{const relative='2026/01/02/'+sha('captions')+'.vtt';await fs.writeFile(path.join(uploads,relative),'WEBVTT\n\n00:00.000 --> 00:05.000\nFull speech\n');rows.push({id:'captions-media',path:process.env.FRONTEND_URL+'/uploads/'+relative});manifest.timedText={origin:'owned_subtitle_file',mediaId:'captions-media',role:'speech_caption'};}};
}
test('imports exact physical captions/titles with measured video, preserving cover and independent unverified alignment',async t=>{
 const f=await fixture(t),result=await f.run();assert.equal(f.saved,1);assert.equal(f.renders,1);
 assert.equal(result.assets[0].mediaId,'cover');const video=result.assets.find(x=>x.kind==='video');assert.equal(video.mediaId,'final');
 assert.equal(video.videoEvidence.localComposition.version,2);assert.equal(video.provenance.jobId,undefined);assert.deepEqual(video.videoEvidence.captions.sourceJobIds,[]);
 assert.equal(video.videoEvidence.localComposition.speechAlignment,'unverified');assert.equal(result.settings.keep,true);
 await fs.unlink(f.output);await f.run();assert.equal(f.renders,1);assert.equal(f.saved,1);
});
test('consumer rejects a schema-valid result belonging to different approved settings before importing anything',async t=>{
 const f=await fixture(t);f.tamper();await assert.rejects(f.run(),/RESULT_BINDING/);assert.equal(f.saved,0);assert.equal(f.checkpoint.uploadIntent,undefined);
});
test('caption-only C receipt imports without claiming an authored screen title',async t=>{
 const f=await fixture(t);delete f.manifest.screenTitles;const material=await f.run();
 assert.equal(f.saved,1);const proof=material.assets.find(a=>a.kind==='video').videoEvidence.localComposition;
 assert.equal(proof.textRendering.screenTitleCount,0);assert.equal(proof.textRendering.speechCaptionCount,1);assert.equal(proof.textRendering.physicalBurn,true);
});
test('owned VTT-only caption receipt retains the actual file lineage without authored titles',async t=>{
 const f=await fixture(t);delete f.manifest.screenTitles;await f.ownedCaptions();const material=await f.run();
 const proof=material.assets.find(a=>a.kind==='video').videoEvidence.localComposition;assert.equal(proof.textRendering.captionSource.mediaId,'captions-media');assert.match(proof.textRendering.captionSource.sha256,/^[a-f0-9]{64}$/);assert.equal(proof.textRendering.screenTitleCount,0);
});

const {MediaRepository}=loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts',{
 '@contentfactory/nestjs-libraries/database/prisma/prisma.service':{PrismaRepository:class{}},
 '@contentfactory/nestjs-libraries/database/prisma/serializable.transaction':{serializableWithRetry:async(db,work)=>work(db)},
});
test('real Media registration records video type/size and an exact retry returns the same row',async()=>{
 let row,creates=0;const repo=new MediaRepository({model:{media:{findFirst:async({where})=>{assert.equal(where.organizationId,'org');return row;},create:async({data})=>{creates++;row={id:'registered',...data};return row;}}}});
 const first=await repo.saveLocalCompositionV2('org','owned.mp4','/owned.mp4','Final.mp4',1234),replay=await repo.saveLocalCompositionV2('org','owned.mp4','/owned.mp4','Final.mp4',1234);
 assert.equal(first.type,'video');assert.equal(first.fileSize,1234);assert.equal(first.id,replay.id);assert.equal(creates,1);
 row.type='image';await assert.rejects(repo.saveLocalCompositionV2('org','owned.mp4','/owned.mp4','Final.mp4',1234),/MEDIA_MISMATCH/);assert.equal(row.type,'image');
});
