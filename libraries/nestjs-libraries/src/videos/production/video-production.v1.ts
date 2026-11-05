import { createHash } from 'node:crypto';
import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import type { VideoPayerV1, VideoPreparedRequestV1, VideoProviderIdV1, VideoSettingsV1 } from '../video-provider.v1';
import type { CompositionSceneV1 } from '../providers/composition/composition-provider.v1';

const token = z.string().min(1).max(120).regex(/^[A-Za-z0-9_:.\-]+$/);
const cue = z.object({startSeconds:z.number().nonnegative(),endSeconds:z.number().positive(),text:z.string().min(1).max(1000)}).strict();
const scene = z.object({
  id:z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),generationAttempt:z.number().int().nonnegative().default(0), kind:z.enum(['presenter','image','video','generated_clip']), durationSeconds:z.number().positive().max(600),
  script:z.string().max(5000), title:z.string().max(500).optional(),
  mediaId:z.string().uuid().optional(),audioMediaId:z.string().uuid().optional(),
  avatarId:token.optional(),voiceId:token.optional(),engine:z.enum(['avatar_iii','avatar_iv']).optional(),
  prompt:z.string().min(1).max(12000).optional(), clipSettings:z.record(z.unknown()).optional(),
  referenceMediaIds:z.array(z.string().uuid()).max(1).default([]),
  captionCues:z.array(cue).max(500).optional(),
  /** User-attested manual provenance; generated clips derive this from their saved request. */
  sourceCaptions:z.enum(['burned','none']).default('none'),
}).strict();
export const ProductionManifestSchemaV1 = z.object({
  version:z.literal(1),pieceId:z.string().uuid(),pieceRevision:z.string().min(1).max(200),
  title:z.string().min(1).max(500),locale:z.string().min(2).max(80),
  aspectRatio:z.enum(['16:9','9:16','1:1']),resolution:z.literal('1080p'),
  durationSeconds:z.number().positive().max(600),audio:z.boolean(),captions:z.boolean(),
  scenes:z.array(scene).min(1).max(50),
}).strict();
export type VideoProductionManifestV1 = z.infer<typeof ProductionManifestSchemaV1>;
export type VideoProductionSceneV1 = VideoProductionManifestV1['scenes'][number];
export const canonicalVideoValueV1 = (value:any):any => Array.isArray(value)?value.map(canonicalVideoValueV1):value&&typeof value==='object'
  ? Object.fromEntries(Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>[key,canonicalVideoValueV1(value[key])])):value;
export const videoProductionDigestV1 = (value:unknown) => createHash('sha256').update(JSON.stringify(canonicalVideoValueV1(value))).digest('hex');
export function parseProductionManifestV1(value:unknown):VideoProductionManifestV1 {
  const parsed=ProductionManifestSchemaV1.safeParse(value);
  if(!parsed.success) return videoErrorV1('VIDEO_PRODUCTION_INPUT_INVALID');
  const m=parsed.data;
  try { new Intl.Locale(m.locale); } catch { return videoErrorV1('VIDEO_INVALID_LOCALE'); }
  if(m.captions&&(!m.audio||!m.scenes.some(s=>s.script.trim())))return videoErrorV1('VIDEO_CAPTIONS_REQUIRE_SPEECH');
  if(new Set(m.scenes.map(s=>s.id)).size!==m.scenes.length) return videoErrorV1('VIDEO_SCENE_ID_DUPLICATE');
  if(Math.abs(m.scenes.reduce((sum,s)=>sum+s.durationSeconds,0)-m.durationSeconds)>0.01) return videoErrorV1('VIDEO_PRODUCTION_DURATION_MISMATCH');
  for(const s of m.scenes){
    if(s.kind==='presenter'&&(!s.script.trim()||!s.avatarId||!s.voiceId||!s.engine||s.mediaId||s.audioMediaId||s.prompt||s.clipSettings)) return videoErrorV1('VIDEO_PRESENTER_SCENE_INVALID');
    if((s.kind==='image'||s.kind==='video')&&(!s.mediaId||s.avatarId||s.engine||s.prompt||s.clipSettings)) return videoErrorV1('VIDEO_MEDIA_SCENE_INVALID');
    if(s.kind==='generated_clip'&&(!s.prompt||!s.clipSettings||s.mediaId||s.script.trim()||s.avatarId||s.voiceId||s.engine||s.audioMediaId)) return videoErrorV1('VIDEO_CLIP_SCENE_INVALID');
    if(s.kind!=='generated_clip'&&s.referenceMediaIds.length) return videoErrorV1('VIDEO_SCENE_REFERENCE_INVALID');
    if(s.audioMediaId&&!s.script.trim())return videoErrorV1('VIDEO_NARRATION_TRANSCRIPT_REQUIRED');
    if(s.kind==='image'&&s.sourceCaptions==='burned')return videoErrorV1('VIDEO_IMAGE_CAPTIONS_REQUIRE_TIMED_CUES');
    if(m.captions&&s.captionCues?.length&&s.captionCues.map(c=>c.text).join(' ').replace(/\s+/g,' ').trim()!==s.script.replace(/\s+/g,' ').trim())return videoErrorV1('VIDEO_CAPTIONS_TRANSCRIPT_MISMATCH');
    if(s.script.trim()&&!m.audio) return videoErrorV1('VIDEO_SPEECH_REQUIRES_AUDIO');
    if(!m.captions&&s.captionCues?.length)return videoErrorV1('VIDEO_CAPTIONS_DISABLED');
    if(s.captionCues?.some(c=>c.endSeconds<=c.startSeconds||c.endSeconds>s.durationSeconds)) return videoErrorV1('VIDEO_CAPTION_TIMING_INVALID');
    if(s.captionCues?.some((c,i)=>i>0&&c.startSeconds<s.captionCues![i-1].endSeconds)) return videoErrorV1('VIDEO_CAPTION_TIMING_INVALID');
    if(s.kind==='image'&&s.script.trim()&&!s.audioMediaId&&!s.voiceId) return videoErrorV1('VIDEO_NARRATION_VOICE_REQUIRED');
    if(s.kind==='video'&&s.script.trim()&&!s.audioMediaId&&s.voiceId) return videoErrorV1('VIDEO_VIDEO_NARRATION_REQUIRES_IMAGE_OR_OWNED_AUDIO');
    if(m.captions&&s.script.trim()&&['image','video'].includes(s.kind)&&!s.voiceId&&s.sourceCaptions!=='burned'&&!s.captionCues?.length) return videoErrorV1('VIDEO_CAPTIONS_REQUIRED');
  }
  return m;
}
export function productionSceneKeyV1(productionId:string,m:VideoProductionManifestV1,s:VideoProductionSceneV1,assetIdentities:unknown) {
  return videoProductionDigestV1({version:1,productionId,scene:s,locale:m.locale,aspectRatio:m.aspectRatio,resolution:m.resolution,audio:m.audio,captions:m.captions,assetIdentities});
}
export interface VideoProductionScenePlanV1 {
  sceneId:string; key:string; kind:'asset'|'generation'; mediaId?:string; audioMediaId?:string;
  jobId?:string; reused:boolean; provider?:VideoProviderIdV1; model?:string;
  payer?:VideoPayerV1; credentialReference?:string; request?:VideoPreparedRequestV1;
  settings?:VideoSettingsV1; reservedUsd?:number; monthlyBudgetUsd?:number; captionsBurned:boolean;
}
export interface VideoProductionApprovalV1 {
  version:1; id:string; actorId:string; manifestDigest:string; expiresAt:string;
  scenes:VideoProductionScenePlanV1[];
  final:{provider:'heygen';model:'hyperframes';payer:VideoPayerV1;credentialReference:string;estimate:VideoPreparedRequestV1['estimate'];reservedUsd:number;monthlyBudgetUsd:number};
  maxTotalUsd:number; estimatesUsd:number|null; blockers:string[];
  acceptedAt?:string; finalJobId?:string;
}
export interface VideoProductionRevisionV1 {
  id:string; organizationId:string;userId:string;productionId:string;revision:number;parentId:string|null;intentId:string;
  manifest:VideoProductionManifestV1;digest:string;approval:VideoProductionApprovalV1|null;
  state:string;stoppedAt:Date|null;createdAt:Date;updatedAt:Date;
}
export function compositionSourceV1(scene:VideoProductionSceneV1,mediaUrl:string,audioUrl?:string):CompositionSceneV1 {
  return {id:scene.id,kind:scene.kind==='image'?'image':'video',durationSeconds:scene.durationSeconds,script:scene.script,
    mediaUrl,...(audioUrl?{audioUrl}:{}),...(scene.title?{title:scene.title}:{}),
    ...(scene.captionCues?{captionCues:scene.captionCues.map(c=>({startSeconds:c.startSeconds!,endSeconds:c.endSeconds!,text:c.text!}))}:{}),
    ...(scene.kind!=='image'&&!audioUrl?{retainSourceAudio:true}:{}),
  };
}
