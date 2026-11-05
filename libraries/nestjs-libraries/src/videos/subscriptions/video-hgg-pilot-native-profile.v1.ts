import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { decodeHggReadV1 } from './video-hgg-qualification-read.v1';
import { HGG_PILOT_EVIDENCE_V1 } from './video-hgg-pilot-evidence.v1';
import { HggPilotQuoteInputSchemaV1,type HggPilotQuoteInputV1,type HggPilotQuoteOwnerV1,type HggPilotQuoteRequestV1,type HggPilotQuoteAssetV1 } from './video-hgg-pilot-quote.v1';
import { z } from 'zod';
export interface HggPilotNativeModelsV1 {schemaDigest:string;image:Record<string,any>;video:Record<string,any>}
/** Exact selected product names, actual returned IDs. No alias, web/API or other model fallback. */
export function hggPilotNativeModelsV1(imageRaw:Record<string,unknown>,videoRaw:Record<string,unknown>):HggPilotNativeModelsV1 {
 const imageList=z.object({items:z.array(z.record(z.unknown())).max(100),has_more:z.boolean().optional()}).passthrough().safeParse(imageRaw);
 if(!imageList.success || imageRaw.error)return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID',409);
 const image={...imageList.data,items:imageList.data.items.map(row=>decodeHggReadV1({kind:'image_model',modelId:row.id as string},row))} as any,video=decodeHggReadV1({kind:'video_catalogue'},videoRaw) as any;
 if(image.has_more || video.has_more)return videoErrorV1('VIDEO_PILOT_MODEL_DISCOVERY_INCOMPLETE',409);
 const select=(rows:any[],name:string,provider:string)=>{const matches=rows.filter(m=>m.name===name&&m.provider_name===provider);if(matches.length!==1)return videoErrorV1('VIDEO_PILOT_MODEL_CHOICE_REQUIRED',409);return matches[0];};
 const i=select(image.items,'GPT Image 2.5','OpenAI'),v=select(video.items,'Kling 4.0','Kling');
 const options=(m:any,key:string,required:string[])=>{const p=m.parameters.filter((p:any)=>p.name===key);return p.length===1&&p[0].type==='string'&&Array.isArray(p[0].options)&&required.every(x=>p[0].options.includes(x));};
 const roles=(m:any)=>m.medias.flatMap((x:any)=>x.roles||[]);const duration=v.parameters.filter((p:any)=>p.name==='duration');
 if(!i.aspect_ratios.includes('9:16') || !v.aspect_ratios.includes('9:16') || !roles(i).includes('image_references') || !['start_image','end_image'].every(r=>roles(v).includes(r)))return videoErrorV1('VIDEO_PILOT_MODEL_PROFILE_CHANGED',409);
 if(!options(i,'variant',['flare']) || !options(i,'quality',['high']) || !options(i,'resolution',['1k']) || !options(v,'mode',['image-to-video']) || !options(v,'resolution',['720p']) || duration.length!==1 || duration[0].type!=='number' || !Number.isFinite(duration[0].min) || !Number.isFinite(duration[0].max) || !(duration[0].min<=5&&duration[0].max>=5))return videoErrorV1('VIDEO_PILOT_MODEL_PROFILE_CHANGED',409);
 return {schemaDigest:HGG_PILOT_EVIDENCE_V1.schemaDigest,image:i,video:v};
}
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function hggPilotNativeCompileV1(input:HggPilotQuoteInputV1,owner:HggPilotQuoteOwnerV1,models:HggPilotNativeModelsV1):HggPilotQuoteRequestV1 {
 const parsed=HggPilotQuoteInputSchemaV1.safeParse(input);if(!parsed.success || models.schemaDigest!==HGG_PILOT_EVIDENCE_V1.schemaDigest)return videoErrorV1('VIDEO_PILOT_REQUEST_INVALID',409);
 const value=parsed.data,selected=models[value.kind==='video'?'video':'image'];
 if(value.kind==='image_frame')for(const [key,setting] of Object.entries(value.settings)){
  const parameter=selected.parameters.filter((p:any)=>p.name===key);
  if(parameter.length!==1||!Array.isArray(parameter[0].options)||!parameter[0].options.includes(setting))return videoErrorV1('VIDEO_PILOT_MODEL_PROFILE_CHANGED',409);
 }
 if(value.kind==='video' && !selected.parameters.find((p:any)=>p.name==='resolution')?.options?.includes(value.resolution??'1080p'))return videoErrorV1('VIDEO_PILOT_MODEL_PROFILE_CHANGED',409);
 const assets=(value.kind==='video'?value.frames:value.references) as HggPilotQuoteAssetV1[];
 if(assets.some(a=>a.connectionId!==owner.connectionId||a.accountGeneration!==owner.accountGeneration) || value.kind==='image_frame'&&value.slot==='first'&&assets.length)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);
 const params={model:selected.id as string,prompt:value.prompt,count:1,aspect_ratio:'9:16',...(value.kind==='video'?{mode:'image-to-video',resolution:value.resolution??'1080p',duration:5}:value.settings),
  ...(assets.length?{medias:assets.map(a=>({role:value.kind==='video'?a.slot==='first'?'start_image':'end_image':'image_references',value:a.providerMediaId}))}:{}),get_cost:true as const};
 const tool=value.kind==='video'?'generate_video' as const:'generate_image' as const;
 const modelBindingHash=subscriptionHash({modelId:selected.id,metadataDigest:subscriptionHash(selected),schemaDigest:models.schemaDigest});
 const settingsHash=subscriptionHash(value.kind==='video'?{mode:'image-to-video',resolution:value.resolution??'1080p',duration:5,aspect_ratio:'9:16',count:1}:{...value.settings,aspect_ratio:'9:16',count:1});
 const inputOrderDigest=subscriptionHash(assets);
 const requestHash=subscriptionHash({profile:'hgg_pilot_native_cost_v1',owner,input:value,tool,params,modelBindingHash,settingsHash,inputOrderDigest});
 return freeze({profile:'hgg_pilot_cost_v1',tool,arguments:{params},input:value,accountGeneration:owner.accountGeneration,modelBindingHash,settingsHash,inputOrderDigest,requestHash,schemaDigest:HGG_PILOT_EVIDENCE_V1.schemaDigest});
}
