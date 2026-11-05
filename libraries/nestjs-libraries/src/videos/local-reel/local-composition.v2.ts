import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import { z } from 'zod';

export const LOCAL_COMPOSITION_ENGINE_V2 = 'local-composition/2.1' as const;
export const LOCAL_COMPOSITION_LIMITS_V2 = Object.freeze({maxScenes: 150, maxSeconds: 600,
  maxAssetBytes: 1024 * 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 * 1024, maxOutputBytes: 512 * 1024 * 1024,
  fps: 30, maxVideoBitrate: 6_000_000, maxThreads: 2, timeoutMs: 1_800_000, heartbeatMs: 15_000});
export const LOCAL_COMPOSITION_AUDIO_POLICY_V2 = Object.freeze({id: 'fixed_gains/v1' as const,
  narrationGain: 1 as const, musicGain: 0.15 as const, sourceWithNarrationGain: 0.25 as const, offsetSeconds: 0 as const});
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(200);
const localPath = z.string().max(4096).refine(isAbsolute, 'LOCAL_COMPOSITION_SERVER_PATH_REQUIRED');
const seconds = z.number().finite().positive().max(600);
export const LocalCompositionOwnedReferenceV2Schema = z.object({organizationId: id, mediaId: id, absolutePath: localPath, sha256: sha,
  bytes: z.number().int().positive().max(LOCAL_COMPOSITION_LIMITS_V2.maxAssetBytes)}).strict();
const asset = LocalCompositionOwnedReferenceV2Schema;
export type LocalCompositionOwnedReferenceV2 = z.infer<typeof asset>;
export const LocalCompositionVideoFactsV2Schema = z.object({source: z.literal('mp4_bytes'), sha256: sha,
  width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
  durationSeconds: seconds, videoTrackId: z.number().int().positive(), audio: z.boolean(),
  rotationDegrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])}).strict();
export const LocalCompositionAudioReferenceV2Schema = asset.extend({mimeType: z.enum(['audio/wav', 'audio/mpeg', 'audio/mp4'])}).strict();
export const LocalCompositionAudioFactsV2Schema = z.object({source: z.literal('local_audio_probe'), sha256: sha,
  durationSeconds: seconds, sampleRate: z.number().int().min(8000).max(96000), channels: z.number().int().min(1).max(2)}).strict();
export const LocalCompositionAudioAssetV2Schema = LocalCompositionAudioReferenceV2Schema.extend({metadata: LocalCompositionAudioFactsV2Schema}).strict();
const sourceCaption = z.object({kind: z.enum(['provider_confirmed', 'authored_timed_cues', 'retained_scene_lineage']),
  mediaSha256: sha, evidenceSha256: sha, sourceJobIds: z.array(id).min(1).max(50)}).strict();
const scene = z.object({id, durationSeconds: seconds, video: asset.extend({metadata: LocalCompositionVideoFactsV2Schema}).strict(),
  sourceAudio: z.enum(['retain_source', 'silent']), sourceCaptions: sourceCaption.optional()}).strict();
export const LocalCompositionCueV2Schema = z.object({startSeconds: z.number().finite().nonnegative().max(600), endSeconds: seconds,
  text: z.string().min(1).max(400), role: z.enum(['screen_title', 'speech_caption'])}).strict();
export const LocalCompositionAlignmentV2Schema = z.object({kind: z.literal('server_evidence'), evidenceId: id, evidenceSha256: sha,
  audioSha256: sha, transcriptSha256: sha, cuesSha256: sha}).strict();
export const LocalCompositionTimedTextV2Schema = z.object({origin: z.enum(['authored_timed_text', 'owned_subtitle_file']),
  cues: z.array(LocalCompositionCueV2Schema).min(1).max(2000), cuesSha256: sha, sourceMediaId: id.optional(),
  sourceAssetSha256: sha.optional(),
  alignment: LocalCompositionAlignmentV2Schema.optional()}).strict();
export const LocalCompositionScreenTitlesV2Schema = z.object({origin: z.literal('authored_timed_text'),
  cues: z.array(LocalCompositionCueV2Schema.refine(c => c.role === 'screen_title', 'LOCAL_COMPOSITION_TITLE_ROLE_REQUIRED')).min(1).max(2000), cuesSha256: sha}).strict();
export const LocalCompositionCaptionReferenceV2Schema = asset.extend({mimeType: z.enum(['text/vtt', 'application/x-subrip']),
  bytes: z.number().int().positive().max(2 * 1024 * 1024)}).strict();
export const LocalCompositionBrandReferenceV2Schema = asset.extend({mimeType: z.enum(['image/png', 'image/jpeg']),
  bytes: z.number().int().positive().max(20 * 1024 * 1024)}).strict();
export const LocalCompositionRasterFactsV2Schema = z.object({source: z.literal('owned_raster_probe'), sha256: sha,
  width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192), format: z.enum(['png', 'jpeg'])}).strict();
export const LocalCompositionSettingsV2Schema = z.object({width: z.union([z.literal(1080), z.literal(1920)]),
  height: z.union([z.literal(1080), z.literal(1920)]), fps: z.literal(30), fit: z.literal('contain_pad'),
  transition: z.literal('hard_cut'), captions: z.enum(['none', 'retain_source', 'authored_timed_text'])}).strict()
  .refine(s => !(s.width === 1920 && s.height === 1920), 'LOCAL_COMPOSITION_OUTPUT_PRESET_INVALID');
const source = z.object({pieceId: id, revision: sha, textSha256: sha, adaptationId: id.optional()}).strict();

/** Internal port only. A caller resolves owned rows and approval before constructing this value. */
export const LocalCompositionInputV2Schema = z.object({version: z.literal(2), engineVersion: z.literal(LOCAL_COMPOSITION_ENGINE_V2),
  organizationId: id, productionRevisionId: id, manifestDigest: sha, approvedSettingsDigest: sha, source,
  settings: LocalCompositionSettingsV2Schema,
  scenes: z.array(scene).min(1).max(LOCAL_COMPOSITION_LIMITS_V2.maxScenes),
  narration: z.object({asset: LocalCompositionAudioAssetV2Schema, mode: z.enum(['replace', 'mix']),
    gain: z.literal(1), offsetSeconds: z.literal(0)}).strict().optional(),
  timedText: LocalCompositionTimedTextV2Schema.optional(),
  screenTitles: LocalCompositionScreenTitlesV2Schema.optional(),
  brand: z.object({asset: LocalCompositionBrandReferenceV2Schema, metadata: LocalCompositionRasterFactsV2Schema, position: z.literal('top_right')}).strict().optional(),
  music: z.object({asset: LocalCompositionAudioAssetV2Schema, fit: z.literal('trim_to_edit'),
    gain: z.literal(0.15), offsetSeconds: z.literal(0)}).strict().optional(),
}).strict().superRefine((input, ctx) => {
  const assets = [...input.scenes.map(s => s.video), ...(input.narration ? [input.narration.asset] : []), ...(input.music ? [input.music.asset] : []), ...(input.brand ? [input.brand.asset] : [])];
  const fail = (message: string) => ctx.addIssue({code: z.ZodIssueCode.custom, message});
  if (assets.some(a => a.organizationId !== input.organizationId)) fail('LOCAL_COMPOSITION_FOREIGN_ASSET');
  if (assets.reduce((sum, a) => sum + a.bytes, 0) > LOCAL_COMPOSITION_LIMITS_V2.maxTotalBytes) fail('LOCAL_COMPOSITION_ASSET_LIMIT');
  if (new Set(input.scenes.map(s => s.id)).size !== input.scenes.length) fail('LOCAL_COMPOSITION_DUPLICATE_SCENE');
  if (input.scenes.reduce((sum, s) => sum + Math.round(s.durationSeconds * 30), 0) > 600 * 30) fail('LOCAL_COMPOSITION_DURATION_LIMIT');
  for (const s of input.scenes) {
    if (s.video.metadata.width * s.video.metadata.height > 40_000_000 || Math.round(s.durationSeconds * 30) < 1 || s.durationSeconds > s.video.metadata.durationSeconds + 1 / 30) fail('LOCAL_COMPOSITION_SOURCE_LIMIT');
    if (s.video.sha256 !== s.video.metadata.sha256) fail('LOCAL_COMPOSITION_ASSET_DIGEST_MISMATCH');
    if (s.sourceCaptions && s.sourceCaptions.mediaSha256 !== s.video.sha256) fail('LOCAL_COMPOSITION_CAPTION_DIGEST_MISMATCH');
    if (input.settings.captions === 'retain_source' && !s.sourceCaptions) fail('LOCAL_COMPOSITION_CAPTIONS_UNVERIFIED');
  }
  const duration = input.scenes.reduce((sum, s) => sum + Math.round(s.durationSeconds * 30), 0) / 30;
  for (const a of [input.narration?.asset, input.music?.asset].filter(Boolean)) {
    if (a!.sha256 !== a!.metadata.sha256) fail('LOCAL_COMPOSITION_ASSET_DIGEST_MISMATCH');
  }
  if (input.narration && input.narration.asset.metadata.durationSeconds > duration + 1 / 30) fail('LOCAL_COMPOSITION_NARRATION_EXCEEDS_EDIT');
  if (input.brand && (input.brand.asset.sha256 !== input.brand.metadata.sha256 || input.brand.metadata.width * input.brand.metadata.height > 40_000_000)) fail('LOCAL_COMPOSITION_BRAND_MISMATCH');
  if (input.timedText) {
    if (Buffer.byteLength(JSON.stringify(input.timedText.cues), 'utf8') > 2 * 1024 * 1024) fail('LOCAL_COMPOSITION_CUES_LIMIT');
    if (input.timedText.origin === 'owned_subtitle_file' && (!input.timedText.sourceMediaId || !input.timedText.sourceAssetSha256)) fail('LOCAL_COMPOSITION_CAPTION_SOURCE_REQUIRED');
    if (input.timedText.cuesSha256 !== localCompositionDigestV2(input.timedText.cues)) fail('LOCAL_COMPOSITION_CUES_DIGEST_MISMATCH');
    for (const cue of input.timedText.cues) {
      if (cue.endSeconds - cue.startSeconds < 1 / 30 || cue.endSeconds > duration + 1 / 30 || cue.text.trim() !== cue.text || !cue.text.trim() || /[\u0000-\u0008\u000b-\u001f]/.test(cue.text)) fail('LOCAL_COMPOSITION_CUES_INVALID');
    }
    for (const role of ['screen_title', 'speech_caption']) {
      let end = 0;
      for (const cue of input.timedText.cues.filter(c => c.role === role)) {
        if (cue.startSeconds < end) fail('LOCAL_COMPOSITION_CUES_OVERLAP');
        end = cue.endSeconds;
      }
    }
    const proof = input.timedText.alignment, spoken = input.timedText.cues.filter(c => c.role === 'speech_caption');
    if (proof && (!spoken.length || proof.cuesSha256 !== localCompositionDigestV2(spoken) || input.narration && proof.audioSha256 !== input.narration.asset.sha256)) fail('LOCAL_COMPOSITION_ALIGNMENT_BINDING_MISMATCH');
  }
  if (input.screenTitles && input.screenTitles.cuesSha256 !== localCompositionDigestV2(input.screenTitles.cues)) fail('LOCAL_COMPOSITION_CUES_DIGEST_MISMATCH');
  const allCues = [...(input.timedText?.cues ?? []), ...(input.screenTitles?.cues ?? [])];
  if (allCues.length > 2000 || Buffer.byteLength(JSON.stringify(allCues), 'utf8') > 2 * 1024 * 1024) fail('LOCAL_COMPOSITION_CUES_LIMIT');
  for (const role of ['screen_title', 'speech_caption']) {
    let end = 0;
    for (const cue of allCues.filter(c => c.role === role).sort((a, b) => a.startSeconds - b.startSeconds)) {
      if (cue.startSeconds < end || cue.endSeconds - cue.startSeconds < 1 / 30 || cue.endSeconds > duration + 1 / 30 || !cue.text.trim() || /[\u0000-\u0008\u000b-\u001f]/.test(cue.text)) fail('LOCAL_COMPOSITION_CUES_INVALID');
      end = cue.endSeconds;
    }
  }
  if (input.settings.captions === 'authored_timed_text' && !input.timedText?.cues.some(c => c.role === 'speech_caption')) fail('LOCAL_COMPOSITION_CUES_REQUIRED');
  if (input.settings.captions !== 'authored_timed_text' && input.timedText?.cues.some(c => c.role === 'speech_caption')) fail('LOCAL_COMPOSITION_CAPTION_MODE_MISMATCH');
  // Replacing/mixing spoken audio invalidates retained speech/caption correspondence.
  if (input.narration && input.settings.captions === 'retain_source') fail('LOCAL_COMPOSITION_NEW_AUDIO_CAPTIONS_UNVERIFIED');
});
export type LocalCompositionInputV2 = z.infer<typeof LocalCompositionInputV2Schema>;
export type LocalCompositionAudioAssetV2 = z.infer<typeof LocalCompositionAudioAssetV2Schema>;
export type LocalCompositionAudioReferenceV2 = z.infer<typeof LocalCompositionAudioReferenceV2Schema>;
export type LocalCompositionAudioFactsV2 = z.infer<typeof LocalCompositionAudioFactsV2Schema>;

export type LocalCompositionRasterFactsV2 = z.infer<typeof LocalCompositionRasterFactsV2Schema>;
export type LocalCompositionBrandReferenceV2 = z.infer<typeof LocalCompositionBrandReferenceV2Schema>;
export type LocalCompositionTimedTextV2 = z.infer<typeof LocalCompositionTimedTextV2Schema>;
export type LocalCompositionCaptionReferenceV2 = z.infer<typeof LocalCompositionCaptionReferenceV2Schema>;
const lineage = z.object({id, sceneKey: sha, mediaId: id, sourceSha256: sha, startFrame: z.number().int().nonnegative(),
  frameCount: z.number().int().positive(), sourceDurationSeconds: seconds, sourceAudioRetained: z.boolean(),
  upscaled: z.boolean(), reused: z.boolean()}).strict();
const mixedTrack = z.object({mediaId: id, sha256: sha, metadata: LocalCompositionAudioFactsV2Schema,
  gain: z.number().finite().nonnegative().max(1), offsetSeconds: z.literal(0)}).strict();
/** Renderer emits a private file receipt. Media import and current-revision/CAS checks belong to its caller. */
export const LocalCompositionResultV2Schema = z.object({version: z.literal(2), engineVersion: z.literal(LOCAL_COMPOSITION_ENGINE_V2),
  organizationId: id, productionRevisionId: id, manifestDigest: sha, approvedSettingsDigest: sha, source,
  settings: LocalCompositionSettingsV2Schema, renderKey: sha, toolchainDigest: sha, absolutePath: localPath, sha256: sha,
  bytes: z.number().int().positive().max(LOCAL_COMPOSITION_LIMITS_V2.maxOutputBytes), metadata: LocalCompositionVideoFactsV2Schema,
  scenes: z.array(lineage).min(1).max(150),
  audio: z.object({sourceAudioRetained: z.boolean(), narration: mixedTrack.extend({mode: z.enum(['replace', 'mix'])}).optional(), music: mixedTrack.optional(),
    mixPolicy: z.literal('fixed_gains/v1'), speechAlignment: z.literal('unverified')}).strict(),
  captions: z.object({kind: z.enum(['none', 'retained_source', 'authored_timed_text']), evidenceSha256: sha.optional(),
    sourceJobIds: z.array(id).max(1000), speechAlignment: z.literal('unverified')}).strict(),
  textRendering: z.object({physicalBurn: z.boolean(), cuesSha256: sha.optional(), cueCount: z.number().int().nonnegative().max(2000),
    screenTitleCount: z.number().int().nonnegative().max(2000), speechCaptionCount: z.number().int().nonnegative().max(2000),
    screenTitlesSha256: sha.optional(), speechCaptionsSha256: sha.optional(), captionSource: z.object({mediaId: id, sha256: sha, originalCuesSha256: sha}).strict().optional(),
    alignment: LocalCompositionAlignmentV2Schema.optional()}).strict(),
  screenCopy: z.object({kind: z.enum(['not_authored_by_compositor', 'authored_timed_text']), speech: z.literal(false)}).strict(),
  brand: z.object({mediaId: id, sha256: sha, position: z.literal('top_right'), physicallyRendered: z.literal(true)}).strict().optional(),
  reused: z.boolean(),
}).strict().superRefine((result, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: z.ZodIssueCode.custom, message});
  if (result.sha256 !== result.metadata.sha256 || result.metadata.width !== result.settings.width || result.metadata.height !== result.settings.height || result.metadata.rotationDegrees !== 0) fail('LOCAL_COMPOSITION_RESULT_MISMATCH');
  let at = 0;
  for (const s of result.scenes) {if (s.startFrame !== at) fail('LOCAL_COMPOSITION_TIMELINE_MISMATCH'); at += s.frameCount;}
  if (at > 18000 || Math.abs(result.metadata.durationSeconds - at / 30) > 1 / 30 + 0.001) fail('LOCAL_COMPOSITION_TIMELINE_MISMATCH');
  if (result.captions.kind === 'retained_source' && (!result.captions.evidenceSha256 || !result.captions.sourceJobIds.length)) fail('LOCAL_COMPOSITION_CAPTIONS_UNVERIFIED');
  if (result.captions.kind === 'authored_timed_text' && (!result.textRendering.physicalBurn || !result.textRendering.cuesSha256 || !result.textRendering.speechCaptionCount)) fail('LOCAL_COMPOSITION_CUES_NOT_RENDERED');
  if (result.textRendering.physicalBurn !== (result.textRendering.cueCount > 0) || result.textRendering.cueCount !== result.textRendering.screenTitleCount + result.textRendering.speechCaptionCount || result.textRendering.physicalBurn && !result.textRendering.cuesSha256) fail('LOCAL_COMPOSITION_TEXT_RENDER_MISMATCH');
  if (result.textRendering.screenTitleCount > 0 && !result.textRendering.screenTitlesSha256 || result.textRendering.speechCaptionCount > 0 && !result.textRendering.speechCaptionsSha256) fail('LOCAL_COMPOSITION_TEXT_RENDER_MISMATCH');
  if (result.textRendering.alignment && (result.textRendering.alignment.cuesSha256 !== result.textRendering.speechCaptionsSha256 || result.audio.narration && result.textRendering.alignment.audioSha256 !== result.audio.narration.sha256)) fail('LOCAL_COMPOSITION_ALIGNMENT_BINDING_MISMATCH');
  if ((result.screenCopy.kind === 'authored_timed_text') !== (result.textRendering.screenTitleCount > 0)) fail('LOCAL_COMPOSITION_TEXT_RENDER_MISMATCH');
  if (result.captions.kind === 'none' && (result.captions.evidenceSha256 || result.captions.sourceJobIds.length)) fail('LOCAL_COMPOSITION_CAPTION_EVIDENCE_UNEXPECTED');
  if (result.audio.narration && result.captions.kind === 'retained_source') fail('LOCAL_COMPOSITION_NEW_AUDIO_CAPTIONS_UNVERIFIED');
  if ((result.audio.sourceAudioRetained || result.audio.narration || result.audio.music) && !result.metadata.audio) fail('LOCAL_COMPOSITION_AUDIO_RESULT_MISMATCH');
  if (result.audio.narration && (result.audio.narration.gain !== 1 || result.audio.narration.sha256 !== result.audio.narration.metadata.sha256) ||
    result.audio.music && (result.audio.music.gain !== 0.15 || result.audio.music.sha256 !== result.audio.music.metadata.sha256)) fail('LOCAL_COMPOSITION_AUDIO_RESULT_MISMATCH');
});
export type LocalCompositionResultV2 = z.infer<typeof LocalCompositionResultV2Schema>;
/** Server callbacks/options never enter a model schema, persisted input or render digest. */
export interface LocalCompositionProgressV2 {stage: 'inspect' | 'scene' | 'compose' | 'verify' | 'ready'; sceneId?: string; completedScenes: number; totalScenes: number; renderKey?: string}
export interface LocalCompositionOptionsV2 { signal?: AbortSignal; assertCurrent?: () => Promise<void>;
  onProgress?: (progress: LocalCompositionProgressV2) => Promise<void> }
export interface LocalCompositionConfigV2 {
  cacheRoot: string;
  allowedAssetRoots: readonly string[];
  ffmpegExecutable: string;
  ffprobeExecutable: string;
  fontFile?: string;
}
export interface LocalCompositionPortV2 {
  inspectVideo(asset: LocalCompositionOwnedReferenceV2, options?: LocalCompositionOptionsV2): Promise<z.infer<typeof LocalCompositionVideoFactsV2Schema>>;
  inspectBrand(asset: LocalCompositionBrandReferenceV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionRasterFactsV2>;
  verifyResult(result: LocalCompositionResultV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionResultV2>;
  withPinnedResult<T>(result: LocalCompositionResultV2, consume: (file: FileHandle, assertUnchanged: () => Promise<void>) => Promise<T>, options?: LocalCompositionOptionsV2): Promise<T>;
  inspectCaptions(asset: LocalCompositionCaptionReferenceV2, durationSeconds: number, role: 'speech_caption' | 'screen_title', options?: LocalCompositionOptionsV2): Promise<LocalCompositionTimedTextV2>;
  inspectAudio(asset: LocalCompositionAudioReferenceV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionAudioFactsV2>;
  render(input: LocalCompositionInputV2, options?: LocalCompositionOptionsV2): Promise<LocalCompositionResultV2>;
}

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : value;
export const localCompositionDigestV2 = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const localCompositionRenderKeyV2 = (input: LocalCompositionInputV2, toolchainDigest: string) => {
  sha.parse(toolchainDigest);
  return localCompositionDigestV2({input: LocalCompositionInputV2Schema.parse(input), toolchainDigest});
};
