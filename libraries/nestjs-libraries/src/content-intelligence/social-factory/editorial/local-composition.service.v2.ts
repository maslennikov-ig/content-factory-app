import {Inject,Injectable,Optional} from '@nestjs/common';
import {resolve,extname} from 'node:path';
import {MediaService} from '../../../database/prisma/media/media.service';
import {LOCAL_COMPOSITION_ENGINE_V2,LocalCompositionInputV2Schema,LocalCompositionResultV2Schema,localCompositionDigestV2,localCompositionRenderKeyV2,
 type LocalCompositionInputV2,type LocalCompositionResultV2,type LocalCompositionPortV2,type LocalCompositionOptionsV2} from '../../../videos/local-reel/local-composition.v2';
import {VideoProductionLocalManifestV3Schema,type VideoProductionLocalManifestV3} from '../../../videos/production/video-production.local.v3';
import {createLocalCompositionUploadIntentV2,uploadLocalCompositionV2,type LocalCompositionUploadIntentV2,type LocalCompositionUploadStageV2} from '../../../upload/local-composition-upload.v2';
import type {ResolvedSourceArtifactV1} from '../contracts/source-artifact.v1';
import type {EditorialMaterialV1,ProductionAssetV1} from '../contracts/social-factory.v1';
import {localCompositionOwnedReferenceV2} from './local-composition-assets.v2';
import {localCompositionEvidenceV2,localCompositionMaterialDigestV2} from './local-composition-evidence.v2';
import type {LocalCompositionRendererV2 as LocalCompositionRendererClassV2} from '../../../videos/local-reel/local-composition-renderer.v2';

export const CAMPAIGN_LOCAL_COMPOSITION_PORT_V2=Symbol('CAMPAIGN_LOCAL_COMPOSITION_PORT_V2');
export type LocalCompositionCheckpointV2={input?:LocalCompositionInputV2;rendered?:LocalCompositionResultV2;uploadIntent?:LocalCompositionUploadIntentV2;uploadStage?:LocalCompositionUploadStageV2;
 uploaded?:{name:string;path:string;bytes:number};asset?:ProductionAssetV1};
export type LocalCompositionProvenanceV2={captions?:Record<string,NonNullable<LocalCompositionInputV2['scenes'][number]['sourceCaptions']>>};
const equal=(a:unknown,b:unknown)=>a===undefined||b===undefined?a===b:localCompositionDigestV2(a)===localCompositionDigestV2(b);
const requireValue=(value:unknown,code:string):void=>{if(!value)throw new Error('LOCAL_COMPOSITION_'+code);};
const allIds=(m:VideoProductionLocalManifestV3)=>[...new Set([...m.scenes.map(s=>s.mediaId),m.narration?.mediaId,m.music?.mediaId,m.brand?.mediaId,m.timedText?.origin==='owned_subtitle_file'?m.timedText.mediaId:undefined].filter((id):id is string=>!!id))];
const audioMime=(path:string)=>extname(path).toLowerCase()==='.mp3'?'audio/mpeg' as const:extname(path).toLowerCase()==='.wav'?'audio/wav' as const:'audio/mp4' as const;
const settingsDigest=(m:VideoProductionLocalManifestV3)=>localCompositionDigestV2({settings:m.settings,narration:m.narration,music:m.music,timedText:m.timedText,screenTitles:m.screenTitles,brand:m.brand});

/** A server-owned descriptor and immutable C receipt become one real owned Media asset. No provider job is created. */
@Injectable()
export class CampaignLocalCompositionServiceV2{
 constructor(private readonly media:MediaService,@Optional() @Inject(CAMPAIGN_LOCAL_COMPOSITION_PORT_V2) private readonly injected?:LocalCompositionPortV2){}
 private renderer(root:string):LocalCompositionPortV2{
  if(this.injected)return this.injected;
  const ffmpeg=process.env.CF_LOCAL_COMPOSITION_FFMPEG||process.env.CF_LOCAL_REEL_FFMPEG||'/usr/bin/ffmpeg',ffprobe=process.env.CF_LOCAL_COMPOSITION_FFPROBE||'/usr/bin/ffprobe';
  const Renderer=require('../../../videos/local-reel/local-composition-renderer.v2').LocalCompositionRendererV2 as typeof LocalCompositionRendererClassV2;
  return new Renderer({cacheRoot:resolve(process.env.CF_LOCAL_COMPOSITION_CACHE_ROOT||'/tmp/content-factory-local-composition-v2'),allowedAssetRoots:[root],ffmpegExecutable:ffmpeg,ffprobeExecutable:ffprobe,fontFile:process.env.CF_LOCAL_COMPOSITION_FONT_FILE||'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'});
 }
 private assertInput(input:LocalCompositionInputV2,manifest:VideoProductionLocalManifestV3,org:string,id:string){
  requireValue(input.organizationId===org&&input.productionRevisionId===id&&input.manifestDigest===localCompositionDigestV2(manifest)&&input.approvedSettingsDigest===settingsDigest(manifest)&&equal(input.source,manifest.source)&&equal(input.settings,manifest.settings),'CHECKPOINT_BINDING');
  requireValue(equal(input.scenes.map(s=>({id:s.id,mediaId:s.video.mediaId,durationSeconds:s.durationSeconds,sourceAudio:s.sourceAudio})),manifest.scenes),'CHECKPOINT_BINDING');
  requireValue(input.narration?.asset.mediaId===manifest.narration?.mediaId&&input.narration?.mode===manifest.narration?.mode&&input.music?.asset.mediaId===manifest.music?.mediaId&&input.brand?.asset.mediaId===manifest.brand?.mediaId,'CHECKPOINT_BINDING');
  requireValue(equal(input.screenTitles?.cues,manifest.screenTitles)&&input.timedText?.origin===manifest.timedText?.origin&&
   (manifest.timedText?.origin==='authored_timed_text'?equal(input.timedText?.cues,manifest.timedText.cues):manifest.timedText?.origin==='owned_subtitle_file'?input.timedText?.sourceMediaId===manifest.timedText.mediaId:true),'CHECKPOINT_BINDING');
 }
 private assertResult(result:LocalCompositionResultV2,input:LocalCompositionInputV2){
  requireValue(result.organizationId===input.organizationId&&result.productionRevisionId===input.productionRevisionId&&result.manifestDigest===input.manifestDigest&&result.approvedSettingsDigest===input.approvedSettingsDigest&&
   equal(result.source,input.source)&&equal(result.settings,input.settings)&&result.renderKey===localCompositionRenderKeyV2(input,result.toolchainDigest),'RESULT_BINDING');
  requireValue(result.scenes.length===input.scenes.length&&result.scenes.every((s,i)=>{const selected=input.scenes[i];return s.id===selected.id&&s.mediaId===selected.video.mediaId&&s.sourceSha256===selected.video.sha256&&s.frameCount===Math.round(selected.durationSeconds*30)&&s.sourceDurationSeconds===selected.video.metadata.durationSeconds&&s.sourceAudioRetained===(selected.sourceAudio==='retain_source'&&selected.video.metadata.audio&&input.narration?.mode!=='replace');}),'RESULT_BINDING');
  const retained=input.narration?.mode!=='replace'&&input.scenes.some(s=>s.sourceAudio==='retain_source'&&s.video.metadata.audio);
  requireValue(result.audio.sourceAudioRetained===retained&&result.metadata.audio===!!(retained||input.narration||input.music),'RESULT_BINDING');
  for(const kind of ['narration','music'] as const){const selected=input[kind],actual=result.audio[kind];requireValue(!!selected===!!actual&&(!selected||actual?.mediaId===selected.asset.mediaId&&actual.sha256===selected.asset.sha256&&equal(actual.metadata,selected.asset.metadata)&&actual.gain===selected.gain&&actual.offsetSeconds===selected.offsetSeconds),'RESULT_BINDING');}
  requireValue(result.audio.narration?.mode===input.narration?.mode,'RESULT_BINDING');
  const cues=[...(input.timedText?.cues??[]),...(input.screenTitles?.cues??[])],speech=cues.filter(c=>c.role==='speech_caption'),titles=cues.filter(c=>c.role==='screen_title');
  requireValue(result.textRendering.cueCount===cues.length&&result.textRendering.screenTitleCount===titles.length&&result.textRendering.speechCaptionCount===speech.length&&result.textRendering.physicalBurn===(cues.length>0)&&
   result.textRendering.cuesSha256===(cues.length?localCompositionDigestV2(cues):undefined)&&result.textRendering.screenTitlesSha256===(titles.length?localCompositionDigestV2(titles):undefined)&&result.textRendering.speechCaptionsSha256===(speech.length?localCompositionDigestV2(speech):undefined)&&equal(result.textRendering.alignment,input.timedText?.alignment),'RESULT_BINDING');
  requireValue(result.captions.kind===(input.settings.captions==='retain_source'?'retained_source':input.settings.captions==='authored_timed_text'?'authored_timed_text':'none'),'RESULT_BINDING');
  requireValue(result.screenCopy.kind===(titles.length?'authored_timed_text':'not_authored_by_compositor'),'RESULT_BINDING');
  const expectedJobs=[...new Set(input.settings.captions==='retain_source'?input.scenes.flatMap(s=>s.sourceCaptions?.sourceJobIds??[]):[])].sort();
  requireValue(equal([...result.captions.sourceJobIds].sort(),expectedJobs),'RESULT_BINDING');
  const captionSource=input.timedText?.origin==='owned_subtitle_file'?{mediaId:input.timedText.sourceMediaId,sha256:input.timedText.sourceAssetSha256,originalCuesSha256:input.timedText.cuesSha256}:undefined;
  requireValue(equal(result.textRendering.captionSource,captionSource)&&equal(result.brand,input.brand?{mediaId:input.brand.asset.mediaId,sha256:input.brand.asset.sha256,position:input.brand.position,physicallyRendered:true}:undefined),'RESULT_BINDING');
 }
 async produce(org:string,source:ResolvedSourceArtifactV1,material:EditorialMaterialV1,raw:VideoProductionLocalManifestV3,checkpoint:LocalCompositionCheckpointV2,
  onCheckpoint:(value:LocalCompositionCheckpointV2)=>Promise<void>,options:LocalCompositionOptionsV2,id:string,provenance:LocalCompositionProvenanceV2={}){
  const manifest=VideoProductionLocalManifestV3Schema.parse(raw),root=resolve(process.env.UPLOAD_DIRECTORY||'/');
  requireValue(root!=='/'&&(process.env.STORAGE_PROVIDER||'local')==='local'&&process.env.FRONTEND_URL,'LOCAL_STORAGE_REQUIRED');
  requireValue(source.organizationId===org&&equal(manifest.source,{pieceId:source.ref.pieceId,revision:source.ref.revision,textSha256:source.contentDigest,...(source.ref.kind==='adaptation'?{adaptationId:source.ref.adaptationId}:{})})&&equal(material.sourceArtifact,source.ref),'SOURCE_BINDING');
  requireValue(!manifest.timedText?.alignmentEvidenceId,'ALIGNMENT_EVIDENCE_UNAVAILABLE');
  const current=async()=>{if(options.signal?.aborted)throw new Error('LOCAL_COMPOSITION_ABORTED');await options.assertCurrent?.();};
  await current();const ids=allIds(manifest),rows=await this.media.mediaInWorkspace(org,ids);
  requireValue(rows.length===ids.length,'MEDIA_UNAVAILABLE');const byId=new Map(rows.map(r=>[r.id,r]));
  const port=this.renderer(root);let state=structuredClone(checkpoint);
  const save=async()=>{await current();await onCheckpoint(structuredClone(state));};
  if(!state.input){
   const references=new Map<string,Awaited<ReturnType<typeof localCompositionOwnedReferenceV2>>>();
   const asset=async(mediaId:string)=>{if(!references.has(mediaId))references.set(mediaId,await localCompositionOwnedReferenceV2(org,byId.get(mediaId)!,root,process.env.FRONTEND_URL!,options));return references.get(mediaId)!;};
   const scenes:LocalCompositionInputV2['scenes']=[];
   for(const scene of manifest.scenes){const reference=await asset(scene.mediaId),metadata=await port.inspectVideo(reference,options);scenes.push({id:scene.id,durationSeconds:scene.durationSeconds,sourceAudio:scene.sourceAudio,video:{...reference,metadata},...(provenance.captions?.[scene.mediaId]?{sourceCaptions:provenance.captions[scene.mediaId]}:{})});}
   const audio=async(mediaId:string)=>{const reference=await asset(mediaId),full={...reference,mimeType:audioMime(reference.absolutePath)};return {...full,metadata:await port.inspectAudio(full,options)};};
   const duration=scenes.reduce((sum,s)=>sum+Math.round(s.durationSeconds*30),0)/30;
   let timedText:LocalCompositionInputV2['timedText'];
   if(manifest.timedText?.origin==='authored_timed_text')timedText={origin:'authored_timed_text',cues:manifest.timedText.cues,cuesSha256:localCompositionDigestV2(manifest.timedText.cues)};
   else if(manifest.timedText){const reference=await asset(manifest.timedText.mediaId),mimeType=extname(reference.absolutePath).toLowerCase()==='.vtt'?'text/vtt' as const:'application/x-subrip' as const;timedText=await port.inspectCaptions({...reference,mimeType},duration,manifest.timedText.role,options);}
   let brand:LocalCompositionInputV2['brand'];if(manifest.brand){const reference=await asset(manifest.brand.mediaId),mimeType=extname(reference.absolutePath).toLowerCase()==='.png'?'image/png' as const:'image/jpeg' as const;const value={...reference,mimeType};brand={asset:value,metadata:await port.inspectBrand(value,options),position:'top_right'};}
   state.input=LocalCompositionInputV2Schema.parse({version:2,engineVersion:LOCAL_COMPOSITION_ENGINE_V2,organizationId:org,productionRevisionId:id,manifestDigest:localCompositionDigestV2(manifest),
    approvedSettingsDigest:settingsDigest(manifest),source:manifest.source,settings:manifest.settings,scenes,
    ...(manifest.narration?{narration:{mode:manifest.narration.mode,gain:manifest.narration.gain,offsetSeconds:manifest.narration.offsetSeconds,asset:await audio(manifest.narration.mediaId)}}:{}),
    ...(manifest.music?{music:{gain:manifest.music.gain,offsetSeconds:manifest.music.offsetSeconds,fit:manifest.music.fit,asset:await audio(manifest.music.mediaId)}}:{}),timedText,brand,
    ...(manifest.screenTitles?{screenTitles:{origin:'authored_timed_text',cues:manifest.screenTitles,cuesSha256:localCompositionDigestV2(manifest.screenTitles)}}:{})});
   await save();
  }
  const input=LocalCompositionInputV2Schema.parse(state.input);this.assertInput(input,manifest,org,id);
  if(checkpoint.input){
   const expected=[...input.scenes.map(s=>s.video),input.narration?.asset,input.music?.asset,input.brand?.asset,
    ...(input.timedText?.sourceMediaId?[{mediaId:input.timedText.sourceMediaId,sha256:input.timedText.sourceAssetSha256}]:[])].filter((a):a is NonNullable<typeof a>=>!!a);
   const checked=new Map<string,string>();
   for(const selected of expected){if(!checked.has(selected.mediaId)){const live=await localCompositionOwnedReferenceV2(org,byId.get(selected.mediaId)!,root,process.env.FRONTEND_URL!,options);checked.set(selected.mediaId,live.sha256);}requireValue(checked.get(selected.mediaId)===selected.sha256,'INPUT_MEDIA_CHANGED');}
  }
  if(!state.rendered){state.rendered=LocalCompositionResultV2Schema.parse(await port.render(input,options));this.assertResult(state.rendered,input);await save();}
  const result=LocalCompositionResultV2Schema.parse(state.rendered);this.assertResult(result,input);await current();
  if(!state.asset){
   const binding={organizationId:org,operationId:id,renderKey:result.renderKey,contentSha256:result.sha256};
   if(!state.uploadIntent){state.uploadIntent=createLocalCompositionUploadIntentV2(binding);await save();}
   const uploaded=await port.withPinnedResult(result,async(file,assertUnchanged)=>uploadLocalCompositionV2(root,{file,assertUnchanged,bytes:result.bytes,sha256:result.sha256},state.uploadIntent!,binding,state.uploadStage,{assertCurrent:current,onStage:async stage=>{state.uploadStage=stage;await save();}}),options);
   const stored={name:uploaded.name,path:process.env.FRONTEND_URL+'/uploads/'+uploaded.path,bytes:uploaded.bytes};
   requireValue(!state.uploaded||equal(state.uploaded,stored),'UPLOAD_CHECKPOINT_MISMATCH');state.uploaded=stored;await save();await current();
   const media=await this.media.saveLocalCompositionV2(org,stored.name,stored.path,manifest.title+'.mp4',stored.bytes);
   const screenOnly=!manifest.narration&&manifest.scenes.every(s=>s.sourceAudio==='silent')&&result.textRendering.physicalBurn&&!!material.scenes?.length&&material.scenes.every(s=>!s.spokenText?.trim()&&!!s.screenText?.trim())&&
    result.textRendering.screenTitlesSha256===localCompositionDigestV2(material.scenes.map(s=>({startSeconds:s.startSeconds,endSeconds:s.endSeconds,text:s.screenText!.trim(),role:'screen_title'})));
   state.asset={id:media.id,mediaId:media.id,kind:'video',role:'final',mimeType:'video/mp4',url:media.path,width:result.metadata.width,height:result.metadata.height,durationSeconds:result.metadata.durationSeconds,
    provenance:{provider:'local-composition.v2',revision:source.ref.revision,sourceIds:material.evidence.flatMap(e=>e.sourceId?[e.sourceId]:[])},
    videoEvidence:{metadata:{source:'mp4_bytes',sha256:result.sha256},captions:{burned:'unverified',sourceJobIds:[]},localComposition:{version:2,engineVersion:LOCAL_COMPOSITION_ENGINE_V2,renderKey:result.renderKey,manifestDigest:result.manifestDigest,approvedSettingsDigest:result.approvedSettingsDigest,
     sourceArtifact:source.ref,textSha256:source.contentDigest,materialDigest:localCompositionMaterialDigestV2(material),outputSha256:result.sha256,speechAlignment:'unverified',screenOnly,captions:result.captions,textRendering:result.textRendering}}};
   await save();
  }
  const evidence=localCompositionEvidenceV2(material,state.asset);
  requireValue(state.asset.id===state.asset.mediaId&&state.asset.kind==='video'&&state.asset.role==='final'&&state.asset.mimeType==='video/mp4'&&
   state.asset.width===result.metadata.width&&state.asset.height===result.metadata.height&&state.asset.durationSeconds===result.metadata.durationSeconds&&evidence?.renderKey===result.renderKey&&
   evidence.manifestDigest===result.manifestDigest&&evidence.approvedSettingsDigest===result.approvedSettingsDigest&&equal(evidence.captions,result.captions)&&equal(evidence.textRendering,result.textRendering),'ASSET_CHECKPOINT_BINDING');
  const owned=await this.media.mediaInWorkspace(org,[state.asset.mediaId]);requireValue(owned.length===1&&owned[0].path===state.asset.url,'MEDIA_UNAVAILABLE');
  const finalRef=await localCompositionOwnedReferenceV2(org,owned[0],root,process.env.FRONTEND_URL!,options),measured=await port.inspectVideo(finalRef,options);
  requireValue(finalRef.sha256===result.sha256&&finalRef.bytes===result.bytes&&equal(measured,result.metadata),'MEASURED_RESULT_MISMATCH');
  await current();const ready=structuredClone(material);ready.assets=[...ready.assets.filter(a=>a.kind!=='video'&&a.kind!=='subtitle'),state.asset];
  ready.settings.localComposition={version:2,renderKey:result.renderKey,manifestDigest:result.manifestDigest,sourceProductionRevisionId:manifest.sourceProductionRevisionId??null,scenes:JSON.parse(JSON.stringify(result.scenes)),speechAlignment:'unverified'};
  return ready;
 }
}
