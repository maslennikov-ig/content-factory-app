import { z } from 'zod';
import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  HeygenRecipeBindingSchemaV2, HeygenVideoSettingsSchemaV2, HeygenSettingsQualificationSchemaV2,
  heygenVideoRecipeV2, type HeygenRecipeBindingV2, type HeygenVideoSettingsV2,
} from './video-heygen-settings.v2';

/** A new preparation contract; deliberately has no transport, persistence or dispatch entry point. */
export const HEYGEN_PERFORMANCE_SCENE_KIND_V1 = 'heygen-personal-performance-scenes/v1' as const;
/** Authenticated OAuth tools/list on 8 November 2026. Existence is not entitlement. */
export const HEYGEN_PERFORMANCE_SCENE_TOOL_SCHEMAS_V1 = {
  get_current_user: 'aa062cb3306408324a08e89c315b11ef294c8951c3fcb0de564c8824e9c3ca35',
  create_video_from_studio: '2f55bec1d7120f7c5e00c837a4c8ebec5959684e17c904c169706be554dfd59c',
  get_video: 'cbfd3cc767e998afa98e3f4cd22d0c815710d39a9fd56a52455bf112432b7ecb',
} as const;
export function heygenPerformanceSceneHashV1(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const direction = z.string().min(1).max(300).refine(value => value.trim().length > 0 &&
  !/[\u0000-\u001f\u007f]/u.test(value) && [...value.matchAll(/\p{Letter}/gu)].every(letter => /\p{Script=Latin}/u.test(letter[0])));
const exactText = z.string().min(1).max(12000).refine(value => value.trim().length > 0 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));
export const HeygenPerformanceScenePlanSchemaV1 = z.object({
  version: z.literal(1), binding: HeygenRecipeBindingSchemaV2, settings: HeygenVideoSettingsSchemaV2,
  exactSpeech: exactText,
  scenes: z.array(z.object({
    sceneId: id, semanticBeatId: id, start: z.number().int().nonnegative(), end: z.number().int().positive(), exactText,
    gazeDirection: direction.optional(), facialDirection: direction.optional(),
    principalGesture: z.object({cueId: id, direction}).strict().optional(),
    audioProofDigest: digest.optional(),
  }).strict()).min(1).max(50),
}).strict();
export type HeygenPerformanceScenePlanV1 = z.infer<typeof HeygenPerformanceScenePlanSchemaV1>;
/** Server-owned evidence for an existing asset, never a duration typed into a draft. */
export const HeygenPerformanceSceneAudioProofSchemaV1 = z.object({
  audioAssetId: id, mediaId: id, contentDigest: digest, speechDigest: digest, voiceDigest: digest,
  connectionId: id, subjectDigest: digest, accountGeneration: z.number().int().positive(),
  durationSeconds: z.number().finite().positive().max(300), measurement: z.literal('decoded_owned_audio'),
  exactTranscriptVerified: z.literal(true), originalVoiceVerified: z.literal(true),
}).strict();
export type HeygenPerformanceSceneAudioProofV1 = z.infer<typeof HeygenPerformanceSceneAudioProofSchemaV1>;
/** These observations must be produced by the server, never accepted from UI/chat arguments. */
export const HeygenPerformanceSceneQualificationSchemaV1 = z.object({
  settings: HeygenSettingsQualificationSchemaV2,
  route: z.object({
    kind: z.literal('heygen-personal-studio-mcp/v1'), connectionId: id, subjectDigest: digest,
    accountGeneration: z.number().int().positive(),
    toolSchemas: z.object({get_current_user: digest, create_video_from_studio: digest, get_video: digest}).strict().partial(),
    entitlement: z.enum(['unverified', 'available', 'unavailable']), entitlementEvidenceDigest: digest.optional(),
    resultContract: z.enum(['unverified', 'single_video_owned_mp4_v1']), resultContractEvidenceDigest: digest.optional(),
    attemptContract: z.enum(['unverified', 'one_create_no_automatic_retry_v1']), attemptContractEvidenceDigest: digest.optional(),
  }).strict(),
  measuredAudio: z.array(HeygenPerformanceSceneAudioProofSchemaV1).max(50).default([]),
}).strict();
export type HeygenPerformanceSceneQualificationV1 = z.infer<typeof HeygenPerformanceSceneQualificationSchemaV1>;
const limitations = {
  account_binding: 'Refresh and qualify this exact connected subscription before preparing another review.',
  studio_schema: 'Inspect the current OAuth Studio and status schemas; do not substitute an API-key payer.',
  studio_entitlement: 'Obtain positive Studio access evidence for this subscription; tools/list alone is insufficient.',
  studio_result: 'Qualify the Studio receipt, status, subtitle and owned MP4 ingestion contract before admission.',
  studio_attempt: 'Add versioned durable one-create attempt accounting and uncertain-receipt recovery before admission.',
  source_settings: 'Resolve the selected look, engine, voice or output qualification before scene preparation.',
  text_baseline: 'Use the approved exact speech and original voice baseline; select audio through measured scene proofs.',
  global_motion: 'Bind each motion direction to its exact scene; a global direction must not loop through all scenes.',
  studio_fit: 'Remove the fit override explicitly or qualify an equivalent framing route; Studio has no scene fit field.',
  scene_motion: 'Select a motion-compatible look and engine; Avatar V photo motion needs a qualified pinned reference.',
  scene_audio: 'Select a current owned measured audio asset bound to this exact speech, voice and account.',
  iv_duration: 'For Avatar IV custom motion, use the exact owned audio asset measured at ten seconds or less; a target or earlier TTS timing is insufficient.',
  accent_duration: 'Measure the existing scene audio before qualifying the intentional-accent budget.',
  accent_budget: 'Reduce intentional accents to at most two per minute, with at most one in a short video.',
} as const;
type LimitationCode = keyof typeof limitations;
const limitationSchema = z.object({code: z.enum(Object.keys(limitations) as [LimitationCode, ...LimitationCode[]]),
  remedy: z.string(), sceneId: id.optional()}).strict();
const inputSchema = HeygenPerformanceScenePlanSchemaV1;
const invalid = (): never => { throw new HttpException({code: 'VIDEO_HEYGEN_SCENE_PLAN_INVALID'}, 409); };

/** Exact speech bytes, approved voice settings and profile revision all invalidate an audio proof. */
export const heygenPerformanceVoiceDigestV1 = (binding: HeygenRecipeBindingV2, settings: HeygenVideoSettingsV2) =>
  heygenPerformanceSceneHashV1({profileId: binding.profileId, profileRevision: binding.profileRevision,
    profileDigest: binding.profileDigest, voiceId: settings.voiceId, voiceSettings: settings.voiceSettings, brandGlossaryId: settings.brandGlossaryId});
const voiceWire = z.object({locale: z.string(), speed: z.number().optional(), pitch: z.number().optional(), volume: z.number().optional(),
  engine_settings: z.record(z.unknown()).optional()}).strict();
const sceneInputWire = z.object({type: z.literal('avatar'), avatar_id: id,
  script: exactText.optional(), voice_id: id.optional(), voice_settings: voiceWire.optional(), audio_asset_id: id.optional(),
  engine: z.record(z.unknown()), motion_prompt: z.string().max(1000).optional(),
  expressiveness: z.enum(['low', 'medium', 'high']).optional(), background: z.record(z.unknown()).optional(), remove_background: z.boolean().optional(),
}).strict();
const argsSchema = z.object({scenes: z.array(z.object({type: z.literal('avatar_video'), input: sceneInputWire}).strict()).min(1).max(50),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '5:4', 'auto']), resolution: z.enum(['720p', '1080p', '4k']),
  title: z.string().optional(), brandGlossaryId: id.optional(), caption: z.object({file_format: z.literal('srt'), style: z.literal('default').optional()}).strict().optional(),
}).strict();
const outputSchema = z.object({kind: z.literal(HEYGEN_PERFORMANCE_SCENE_KIND_V1), plan: inputSchema,
  qualification: HeygenPerformanceSceneQualificationSchemaV1, speechDigest: digest, scenePlanDigest: digest,
  status: z.enum(['qualified_for_review', 'limited']), operationCount: z.literal(1).nullable(),
  cost: z.literal('unknown'), dispatchAuthorized: z.literal(false), timing: z.literal('scene_level_no_frame_guarantee'),
  accentBudget: z.object({intentionalAccents: z.number().int().nonnegative(), durationBasis: z.literal('measured_audio').nullable(),
    durationSeconds: z.number().positive().nullable(), maximumAccents: z.number().int().positive().nullable()}).strict(),
  limitations: z.array(limitationSchema), args: argsSchema.optional(), preparationDigest: digest,
}).strict();
export type HeygenPerformanceScenePreparationV1 = z.infer<typeof outputSchema>;

/** Pure qualification only. A qualified review never grants spending authority. */
export function prepareHeygenPerformanceScenesV1(rawPlan: unknown, rawQualification: unknown): HeygenPerformanceScenePreparationV1 {
  const p = inputSchema.safeParse(rawPlan), observation = HeygenPerformanceSceneQualificationSchemaV1.safeParse(rawQualification);
  if (!p.success || !observation.success) return invalid();
  const plan = p.data, qualification = observation.data, s = plan.settings, q = qualification.settings, r = qualification.route, b = plan.binding;
  const seenScenes = new Set<string>(), seenCues = new Set<string>(), accentedBeats = new Set<string>();
  const validBoundary = (index: number) => index === 0 || index === plan.exactSpeech.length ||
    !(/[\p{Letter}\p{Number}\p{Mark}]$/u.test(plan.exactSpeech.slice(0, index)) && /^[\p{Letter}\p{Number}\p{Mark}]/u.test(plan.exactSpeech.slice(index))) &&
    !(/[\uD800-\uDBFF]/u.test(plan.exactSpeech[index - 1]) && /[\uDC00-\uDFFF]/u.test(plan.exactSpeech[index]));
  let offset = 0;
  for (const scene of plan.scenes) {
    if (seenScenes.has(scene.sceneId) || scene.start !== offset || scene.end <= scene.start || !validBoundary(scene.end) ||
      plan.exactSpeech.slice(scene.start, scene.end) !== scene.exactText) return invalid();
    seenScenes.add(scene.sceneId); offset = scene.end;
    if (scene.principalGesture) {
      if (seenCues.has(scene.principalGesture.cueId) || accentedBeats.has(scene.semanticBeatId)) return invalid();
      seenCues.add(scene.principalGesture.cueId); accentedBeats.add(scene.semanticBeatId);
    }
  }
  if (offset !== plan.exactSpeech.length || plan.scenes.map(scene => scene.exactText).join('') !== plan.exactSpeech) return invalid();
  const found: z.infer<typeof limitationSchema>[] = [];
  const add = (code: LimitationCode, sceneId?: string) => {
    if (!found.some(v => v.code === code && v.sceneId === sceneId)) found.push({code, remedy: limitations[code], ...(sceneId ? {sceneId} : {})});
  };
  if ([q, r].some(v => v.connectionId !== b.connectionId || v.subjectDigest !== b.subjectDigest || v.accountGeneration !== b.accountGeneration)) add('account_binding');
  if (heygenPerformanceSceneHashV1(r.toolSchemas) !== heygenPerformanceSceneHashV1(HEYGEN_PERFORMANCE_SCENE_TOOL_SCHEMAS_V1)) add('studio_schema');
  if (r.entitlement !== 'available' || !r.entitlementEvidenceDigest) add('studio_entitlement');
  if (r.resultContract !== 'single_video_owned_mp4_v1' || !r.resultContractEvidenceDigest) add('studio_result');
  if (r.attemptContract !== 'one_create_no_automatic_retry_v1' || !r.attemptContractEvidenceDigest) add('studio_attempt');
  if (s.sourceMode !== 'text' || !s.voiceId || !s.voiceSettings) add('text_baseline');
  if (s.motionPrompt) add('global_motion');
  if (s.fit) add('studio_fit');
  let baseline: ReturnType<typeof heygenVideoRecipeV2> | undefined;
  try { baseline = heygenVideoRecipeV2(b, {...s, motionPrompt: undefined}, plan.exactSpeech, q); }
  catch { add('source_settings'); }
  const proofs = new Map<string, HeygenPerformanceSceneAudioProofV1>();
  for (const proof of qualification.measuredAudio) {
    const key = heygenPerformanceSceneHashV1(proof);
    if (proofs.has(key)) return invalid();
    proofs.set(key, proof);
  }
  const voiceDigest = heygenPerformanceVoiceDigestV1(b, s);
  let totalMeasured = 0, allMeasured = true;
  const sceneArgs = plan.scenes.map(scene => {
    let audio = scene.audioProofDigest ? proofs.get(scene.audioProofDigest) : undefined;
    if (audio && (audio.connectionId !== b.connectionId || audio.subjectDigest !== b.subjectDigest || audio.accountGeneration !== b.accountGeneration ||
      audio.speechDigest !== heygenPerformanceSceneHashV1(scene.exactText) || audio.voiceDigest !== voiceDigest || !q.ownedAudioAssetIds?.includes(audio.audioAssetId))) audio = undefined;
    if (scene.audioProofDigest && !audio) add('scene_audio', scene.sceneId);
    if (audio) totalMeasured += audio.durationSeconds; else allMeasured = false;
    const gesture = scene.principalGesture ? `Perform this gesture once: ${scene.principalGesture.direction} Return to a relaxed resting pose.` : undefined;
    const motion = [scene.gazeDirection, scene.facialDirection, gesture].filter(Boolean).join(' ');
    if (motion && (s.engine.type === 'avatar_iii' || s.engine.type === 'avatar_iv' && q.appearance.avatarType !== 'photo_avatar' ||
      s.engine.type === 'avatar_v' && q.appearance.avatarType === 'photo_avatar' && !s.animationReferenceLookId)) add('scene_motion', scene.sceneId);
    if (motion && s.engine.type === 'avatar_iv' && (!audio || audio.durationSeconds > 10)) add('iv_duration', scene.sceneId);
    const v = baseline?.args;
    const input = {type: 'avatar' as const, avatar_id: s.appearanceLookId, engine: v?.engine ?? s.engine,
      ...(audio ? {audio_asset_id: audio.audioAssetId} : {script: scene.exactText, voice_id: s.voiceId,
        ...(v?.voiceSettings ? {voice_settings: v.voiceSettings} : {})}),
      ...(motion ? {motion_prompt: motion} : {}), ...(s.expressiveness ? {expressiveness: s.expressiveness} : {}),
      ...(s.background ? {background: s.background.type === 'color' ? {type: 'color', color: s.background.value} :
        {type: 'image', source: {type: 'asset_id', asset_id: s.background.assetId}}} : {}),
      ...(s.removeBackground !== undefined ? {remove_background: s.removeBackground} : {})};
    return {type: 'avatar_video' as const, input};
  });
  const intentionalAccents = seenCues.size;
  const maximumAccents = allMeasured ? Math.max(1, Math.floor(totalMeasured / 30)) : null;
  if (intentionalAccents && !allMeasured) add('accent_duration');
  if (maximumAccents !== null && intentionalAccents > maximumAccents) add('accent_budget');
  const qualified = found.length === 0;
  const frozen = {kind: HEYGEN_PERFORMANCE_SCENE_KIND_V1, plan, qualification,
    speechDigest: heygenPerformanceSceneHashV1(plan.exactSpeech), scenePlanDigest: heygenPerformanceSceneHashV1(plan.scenes),
    status: qualified ? 'qualified_for_review' as const : 'limited' as const, operationCount: qualified ? 1 as const : null,
    cost: 'unknown' as const, dispatchAuthorized: false as const, timing: 'scene_level_no_frame_guarantee' as const,
    accentBudget: {intentionalAccents, durationBasis: allMeasured ? 'measured_audio' as const : null,
      durationSeconds: allMeasured ? totalMeasured : null, maximumAccents}, limitations: found,
    ...(qualified ? {args: argsSchema.parse({scenes: sceneArgs, aspectRatio: s.aspectRatio, resolution: s.resolution,
      ...(s.title ? {title: s.title} : {}), ...(s.brandGlossaryId ? {brandGlossaryId: s.brandGlossaryId} : {}),
      ...(baseline?.args.caption ? {caption: baseline.args.caption} : {})})} : {})};
  return outputSchema.parse({...frozen, preparationDigest: heygenPerformanceSceneHashV1(frozen)});
}

/** Strict saved reader: changing wire args and recalculating the digest cannot bypass qualification. */
export function parseHeygenPerformanceScenesV1(raw: unknown): HeygenPerformanceScenePreparationV1 {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) return invalid();
  const rebuilt = prepareHeygenPerformanceScenesV1(parsed.data.plan, parsed.data.qualification);
  if (heygenPerformanceSceneHashV1(rebuilt) !== heygenPerformanceSceneHashV1(raw)) return invalid();
  return parsed.data;
}
