import { localSceneTextDigestV1,projectLocalReelScenesV1 } from './local-reel-scenes.v1';
export {localSceneTextDigestV1} from './local-reel-scenes.v1';
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { MediaService } from '../../../database/prisma/media/media.service';
import { LocalStorage, createLocalReelUploadIntentV1, assertLocalReelUploadIntentV1, type LocalReelUploadIntentV1 } from '../../../upload/local.storage';
import { LocalReelRendererV1 } from '../../../videos/local-reel/local-reel-renderer.v1';
import type { LocalReelInputV1, LocalReelResultV1 } from '../../../videos/local-reel/local-reel.v1';
import { measureMp4VideoV1 } from '../../../videos/production/video-production-result.v1';
import type { ResolvedSourceArtifactV1 } from '../contracts/source-artifact.v1';
import type { EditorialMaterialV1, ProductionAssetV1 } from '../contracts/social-factory.v1';

const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export type LocalReelCheckpointV1={rendered?:LocalReelResultV1;uploadIntent?:LocalReelUploadIntentV1;uploaded?:{name:string;path:string};asset?:ProductionAssetV1};

/** Local-only composition and existing media import. All paths are server configuration or owned rows. */
@Injectable()
export class CampaignLocalReelServiceV1 {
 constructor(private readonly media:MediaService){}
 async produce(org:string,source:ResolvedSourceArtifactV1,rawMaterial:EditorialMaterialV1,imageMediaIds:(string|null)[],
  checkpoint:LocalReelCheckpointV1,onCheckpoint:(value:LocalReelCheckpointV1)=>Promise<void>,assertCurrent:()=>Promise<void>,operationId:string){
  const material=projectLocalReelScenesV1(rawMaterial);
  if(source.organizationId!==org||source.ref.revision!==material.sourceArtifact?.revision||material.format!=='reel'||!material.scenes?.length)
   throw new Error('LOCAL_REEL_SOURCE_REQUIRED');
  await assertCurrent();
  const root=process.env.UPLOAD_DIRECTORY?await realpath(resolve(process.env.UPLOAD_DIRECTORY)):undefined;
  if(!root||(process.env.STORAGE_PROVIDER||'local')!=='local')throw new Error('LOCAL_REEL_LOCAL_STORAGE_REQUIRED');
  let state=structuredClone(checkpoint);
  if(!state.rendered){
   if(!process.env.CF_LOCAL_REEL_CHROME||!process.env.CF_LOCAL_REEL_FFMPEG)throw new Error('LOCAL_REEL_SERVER_CONFIG_REQUIRED');
   const ids=[...new Set(imageMediaIds.filter((id):id is string=>!!id))];
   const rows=ids.length?await this.media.mediaInWorkspace(org,ids):[];
   if(rows.length!==ids.length)throw new Error('LOCAL_REEL_IMAGE_UNAVAILABLE');
   const images=new Map<string,{assetId:string;absolutePath:string;sha256:string}>();
   for(const row of rows){
    const url=new URL(row.path),base=new URL(process.env.FRONTEND_URL!);
    if(url.origin!==base.origin||!/^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]+\.(?:png|jpe?g)$/i.test(url.pathname))throw new Error('LOCAL_REEL_IMAGE_UNAVAILABLE');
    const path=await realpath(resolve(root,url.pathname.slice('/uploads/'.length)));
    if(!path.startsWith(root+sep)||(await stat(path)).size>20*1024*1024)throw new Error('LOCAL_REEL_IMAGE_UNAVAILABLE');
    images.set(row.id,{assetId:row.id,absolutePath:path,sha256:sha(await readFile(path))});
   }
   const input:LocalReelInputV1={organizationId:org,title:material.title,locale:source.locale,
    source:{pieceId:source.ref.pieceId,revision:source.ref.revision,textSha256:source.contentDigest,...(source.ref.kind==='adaptation'?{adaptationId:source.ref.adaptationId}:{})},
    scenes:material.scenes.map((scene,index)=>({id:`scene-${scene.index}`,durationSeconds:scene.endSeconds-scene.startSeconds,
     ...(index===0?{title:material.hook}:{}),text:scene.screenText,...(imageMediaIds[index]?{image:images.get(imageMediaIds[index]!)}:{})}))};
   const renderer=new LocalReelRendererV1({cacheRoot:resolve(process.env.CF_LOCAL_REEL_CACHE_ROOT||'/tmp/content-factory-local-reel'),allowedAssetRoots:[root],
    chromiumExecutable:process.env.CF_LOCAL_REEL_CHROME,ffmpegExecutable:process.env.CF_LOCAL_REEL_FFMPEG,playwrightModule:require.resolve('playwright')});
   state.rendered=await renderer.render(input);await onCheckpoint(state);
  }
  const result=state.rendered;
  const expectedSource={pieceId:source.ref.pieceId,revision:source.ref.revision,textSha256:source.contentDigest,...(source.ref.kind==='adaptation'?{adaptationId:source.ref.adaptationId}:{})};
  if(result.version!==1||result.source?.pieceId!==expectedSource.pieceId||result.source?.revision!==expectedSource.revision||result.source?.textSha256!==expectedSource.textSha256||
   result.source?.adaptationId!==('adaptationId' in expectedSource?expectedSource.adaptationId:undefined)||result.captions?.source!=='authored_on_screen'||result.captions.speech!==false)
   throw new Error('LOCAL_REEL_CHECKPOINT_SOURCE_MISMATCH');
  if(result.sceneResults?.length!==material.scenes.length||result.sceneResults.some((rendered,index)=>{
   const scene=material.scenes![index];
   return rendered.id!==`scene-${scene.index}`||!Number.isFinite(rendered.startSeconds)||!Number.isFinite(rendered.durationSeconds)||rendered.imageAssetId!==(imageMediaIds[index]??undefined)||Math.abs(rendered.startSeconds-scene.startSeconds)>0.00001||Math.abs(rendered.durationSeconds-(scene.endSeconds-scene.startSeconds))>0.00001||
    rendered.renderedText?.text!==scene.screenText||rendered.renderedText?.title!==(index===0?material.hook:'')||rendered.renderedText?.captions?.length!==0;
  }))throw new Error('LOCAL_REEL_CHECKPOINT_SCENES_MISMATCH');
  await assertCurrent();
  const binding={organizationId:org,operationId,renderKey:result.renderKey,contentSha256:result.sha256};
  if(state.uploadIntent){
   assertLocalReelUploadIntentV1(state.uploadIntent,binding);
   if(state.uploaded && (state.uploaded.name!==state.uploadIntent.target.split('/').pop() ||
     state.uploaded.path!==process.env.FRONTEND_URL+'/uploads/'+state.uploadIntent.target))throw new Error('LOCAL_REEL_UPLOAD_INTENT_INVALID');
  }
  let buffer:Buffer|undefined;
  if(!state.asset){
   if((await stat(result.absolutePath)).size>100*1024*1024)throw new Error('LOCAL_REEL_FILE_TOO_LARGE');
   buffer=await readFile(result.absolutePath);const metadata=measureMp4VideoV1(buffer);
   if(sha(buffer)!==result.sha256||metadata.sha256!==result.sha256||metadata.audio||metadata.width!==1080||metadata.height!==1920||metadata.durationSeconds>90)
    throw new Error('LOCAL_REEL_MEASURED_RESULT_INVALID');
   if(['source','sha256','width','height','durationSeconds','videoTrackId','audio','rotationDegrees'].some(key=>metadata[key as keyof typeof metadata]!==result.metadata?.[key as keyof typeof metadata]))throw new Error('LOCAL_REEL_MEASURED_RESULT_INVALID');
  }
  if(!state.uploaded || state.uploadIntent && !state.asset){
   if(!buffer)throw new Error('LOCAL_REEL_CHECKPOINT_INVALID');
   if(!state.uploadIntent){state.uploadIntent=createLocalReelUploadIntentV1(binding);await onCheckpoint(state);}
   const file=await new LocalStorage(root).uploadLocalReel(buffer,state.uploadIntent,binding,assertCurrent);
   if(!state.uploaded){state.uploaded={name:file.originalname,path:file.path};await onCheckpoint(state);}
  }
  await assertCurrent();
  if(!state.asset){
   const saved=await this.media.saveMultipartFile(org,state.uploaded.name,state.uploaded.path,`${material.title}.mp4`);
   state.asset={id:saved.id,mediaId:saved.id,kind:'video',role:'final',mimeType:'video/mp4',url:saved.path,
    width:result.metadata.width,height:result.metadata.height,durationSeconds:result.metadata.durationSeconds,
    provenance:{provider:'local-reel.v1',jobId:result.renderKey,revision:source.ref.revision,sourceIds:material.evidence.flatMap(e=>e.sourceId?[e.sourceId]:[])},
    videoEvidence:{metadata:{source:'mp4_bytes',sha256:result.sha256},captions:{burned:'unverified',sourceJobIds:[]},
     localSilent:{version:1,renderKey:result.renderKey,sourceArtifact:source.ref,textSha256:source.contentDigest,sceneTextDigest:localSceneTextDigestV1(material),speech:false}}};
   await onCheckpoint(state);
  }
  const live=await this.media.mediaInWorkspace(org,[state.asset.mediaId]);
  if(live.length!==1||live[0].path!==state.asset.url)throw new Error('LOCAL_REEL_MEDIA_UNAVAILABLE');
  await assertCurrent();
  const ready=structuredClone(material);ready.assets=[...ready.assets.filter(a=>a.kind!=='video'&&a.kind!=='subtitle'),state.asset];
  ready.settings.localReel={version:1,renderKey:result.renderKey,silent:true,speech:false,scriptKind:'on_screen_text',captionSource:'authored_on_screen',sourceArtifact:JSON.parse(JSON.stringify(source.ref)),
   scenes:result.sceneResults.map(s=>({id:s.id,contentSha256:s.contentSha256,reused:s.reused,startSeconds:s.startSeconds,durationSeconds:s.durationSeconds,frames:s.frames.map(f=>({sha256:f.sha256,startSeconds:f.startSeconds,endSeconds:f.endSeconds}))}))};
  return ready;
 }
}
