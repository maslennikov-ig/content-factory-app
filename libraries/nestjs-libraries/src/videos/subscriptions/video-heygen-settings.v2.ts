import { z } from 'zod';
import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SourceArtifactRefSchemaV1 } from '../../content-intelligence/social-factory/contracts/source-artifact.v1';

// Keep schemas importable by video-brief without a circular schema initializer.
const videoErrorV1 = (code: string, status = 400): never => {throw new HttpException({code}, status);};
// Same canonical bytes as subscriptionHash; importing its registry would re-enter video-brief.
const subscriptionHash = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
};

/** Separate from V1: a new request must opt into this reviewed settings contract. */
export const HEYGEN_SETTINGS_KIND_V2 = 'heygen-personal-avatar/v2' as const;
/** Retained authenticated tools/list, 7 November 2026; checked again before send. */
export const HEYGEN_SETTINGS_TOOL_SCHEMAS_V2 = {
  get_current_user: 'aa062cb3306408324a08e89c315b11ef294c8951c3fcb0de564c8824e9c3ca35',
  create_video_from_avatar: '2015c7812357ed599e78df072aed1137df6532e5fa7683322f357bceb84fb55a',
  get_video: 'cbfd3cc767e998afa98e3f4cd22d0c815710d39a9fd56a52455bf112432b7ecb',
} as const;
export const HEYGEN_SETTINGS_SCHEMA_V2 = subscriptionHash(HEYGEN_SETTINGS_TOOL_SCHEMAS_V2);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const locale = z.string().min(2).max(60).refine(value => {
  try { return Intl.getCanonicalLocales(value)[0] === value; } catch { return false; }
});
const unit = z.number().finite().min(0).max(1);
const engineType = z.enum(['avatar_iii', 'avatar_iv', 'avatar_v']);
const resolution = z.enum(['720p', '1080p', '4k']);
// New V2 recipes use the product's bounded five-minute preparation route.
// The historical V1 short pilot retains its separate 100-word parser.
const speech = z.string().min(1).max(12000).refine(value => value.trim().length > 0 &&
  value.trim().split(/\s+/u).length <= 1000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));
const title = z.string().min(1).max(120).refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value));
// This rejects clearly non-English operational copy; it does not translate text.
const direction = z.string().min(1).max(500).refine(value => value.trim().length > 0 &&
  !/[\u0000-\u001f\u007f]/u.test(value) && [...value.matchAll(/\p{Letter}/gu)].every(letter => /\p{Script=Latin}/u.test(letter[0])));

export const HeygenVoiceEngineSettingsSchemaV2 = z.discriminatedUnion('engine_type', [
  z.object({engine_type: z.literal('elevenlabs'), model: z.enum(['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_v3', 'eleven_v4']).optional(),
    similarity_boost: unit.optional(), stability: unit.optional(), style: unit.optional(), use_speaker_boost: z.boolean().optional()}).strict(),
  // Retired/deprecated s1 is deliberately unavailable for new recipes.
  z.object({engine_type: z.literal('fish'), model: z.enum(['s2-pro', 's2.1-pro']).optional(), stability: unit.optional(), similarity: unit.optional()}).strict(),
  z.object({engine_type: z.literal('starfish')}).strict(),
  z.object({engine_type: z.literal('heygen_voice')}).strict(),
  z.object({engine_type: z.literal('orca')}).strict(),
]);
export const HeygenVoiceBaselineSchemaV2 = z.object({locale: locale.optional(), speed: z.number().finite().min(0.5).max(1.5).optional(),
  pitch: z.number().finite().min(-50).max(50).optional(), volume: unit.optional(), engineSettings: HeygenVoiceEngineSettingsSchemaV2.optional()}).strict();
export type HeygenVoiceBaselineV2 = z.infer<typeof HeygenVoiceBaselineSchemaV2>;
export const HeygenVoiceSettingsSchemaV2 = HeygenVoiceBaselineSchemaV2.extend({locale});
const background = z.discriminatedUnion('type', [
  z.object({type: z.literal('color'), value: z.string().regex(/^#[a-fA-F0-9]{6}$/)}).strict(),
  // Owned provider assets only. Arbitrary provider-fetch URLs are not admitted.
  z.object({type: z.literal('image'), assetId: id, mediaId: id, contentDigest: digest}).strict(),
]);
export const HeygenVideoSettingsSchemaV2 = z.object({
  version: z.literal(2), sourceLookId: id, sourceGroupId: id, appearanceLookId: id, groupId: id,
  animationReferenceLookId: id.optional(), voiceId: id.optional(), sourceMode: z.enum(['text', 'audio_asset']), audioAssetId: id.optional(),
  engine: z.discriminatedUnion('type', [z.object({type: z.literal('avatar_iii')}).strict(), z.object({type: z.literal('avatar_iv')}).strict(),
    z.object({type: z.literal('avatar_v'), moreBlinking: z.boolean().optional()}).strict()]),
  voiceSettings: HeygenVoiceSettingsSchemaV2.optional(), brandGlossaryId: id.optional(),
  motionPrompt: direction.optional(), expressiveness: z.enum(['low', 'medium', 'high']).optional(),
  background: background.optional(), removeBackground: z.boolean().optional(), fit: z.enum(['contain', 'cover']).optional(),
  resolution, aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '5:4', 'auto']), outputFormat: z.literal('mp4'),
  durationSeconds: z.number().finite().min(2).max(300), captions: z.enum(['none', 'sidecar', 'burned']), title: title.optional(),
}).strict();
export type HeygenVideoSettingsV2 = z.infer<typeof HeygenVideoSettingsSchemaV2>;
export const HeygenRecipeBindingSchemaV2 = z.object({profileId: id, profileRevision: z.number().int().positive(), profileDigest: digest,
  connectionId: id, subjectDigest: digest, accountGeneration: z.number().int().positive(),
  appearanceLineage: z.object({operationId: id, operationRevision: z.number().int().positive(), requestHash: digest,
    mediaId: id, lineageDigest: digest}).strict().optional(),
  sourcePin: z.object({pieceId: id, sourceRevision: digest, sourceArtifact: SourceArtifactRefSchemaV1.optional()}).strict(),
}).strict();
export type HeygenRecipeBindingV2 = z.infer<typeof HeygenRecipeBindingSchemaV2>;
export const HeygenVideoProposalSchemaV2 = z.object({binding: HeygenRecipeBindingSchemaV2, settings: HeygenVideoSettingsSchemaV2}).strict();
export type HeygenVideoProposalV2 = z.infer<typeof HeygenVideoProposalSchemaV2>;

const observation = z.object({lookId: id, groupId: id, ready: z.boolean(), owned: z.boolean(),
  consentState: z.enum(['accepted', 'not_applicable', 'pending', 'rejected', 'unknown'])}).strict();
const appearanceObservation = observation.extend({avatarType: z.enum(['photo_avatar', 'digital_twin', 'studio_avatar']), engines: z.array(engineType).max(3),
  // True only after the complete group population proves there is no candidate
  // the provider could select implicitly. Missing metadata remains unknown.
  photoOnlyAnimation: z.boolean().optional(),
  matting: z.enum(['supported', 'unsupported', 'unknown']).optional()}).strict();
/** Server observations, never a chat/tool DTO. Entitlement is independent of schema support. */
export const HeygenSettingsQualificationSchemaV2 = z.object({schemaDigest: digest, connectionId: id, subjectDigest: digest, accountGeneration: z.number().int().positive(),
  resolutions: z.array(resolution).max(3), source: observation, appearance: appearanceObservation,
  animationReference: appearanceObservation.optional(), voice: z.object({voiceId: id, ready: z.boolean(), owned: z.boolean(), locales: z.array(z.string().max(60)).max(100),
    engineTypes: z.array(z.string().max(60)).max(20).optional(), models: z.array(z.string().max(60)).max(30).optional(), noAutomaticFallback: z.boolean().optional()}).strict().optional(),
  ownedBackgroundAssetIds: z.array(id).max(100).optional(), ownedAudioAssetIds: z.array(id).max(100).optional(), ownedGlossaryIds: z.array(id).max(100).optional(),
}).strict();
export type HeygenSettingsQualificationV2 = z.infer<typeof HeygenSettingsQualificationSchemaV2>;

const wireEngine = z.discriminatedUnion('type', [z.object({type: z.literal('avatar_iii')}).strict(), z.object({type: z.literal('avatar_iv')}).strict(),
  z.object({type: z.literal('avatar_v'), reference_look_id: id.optional(), more_blinking: z.boolean().optional()}).strict()]);
const wireVoice = HeygenVoiceSettingsSchemaV2.omit({engineSettings: true}).extend({engine_settings: HeygenVoiceEngineSettingsSchemaV2.optional()}).strict();
const wireBackground = z.discriminatedUnion('type', [z.object({type: z.literal('color'), value: z.string().regex(/^#[a-fA-F0-9]{6}$/)}).strict(),
  z.object({type: z.literal('image'), asset_id: id}).strict()]);
const wire = z.object({avatarId: id, script: speech.optional(), voiceId: id.optional(), audioAssetId: id.optional(), voiceSettings: wireVoice.optional(),
  engine: wireEngine, resolution, aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '5:4', 'auto']), outputFormat: z.literal('mp4'),
  background: wireBackground.optional(), removeBackground: z.boolean().optional(), fit: z.enum(['contain', 'cover']).optional(),
  motionPrompt: direction.optional(), expressiveness: z.enum(['low', 'medium', 'high']).optional(), brandGlossaryId: id.optional(),
  caption: z.object({file_format: z.literal('srt'), style: z.literal('default').optional()}).strict().optional(), title: title.optional(),
}).strict();
export type HeygenAvatarWireArgsV2 = z.infer<typeof wire>;
export type HeygenSettingsLimitationV2 = 'account_binding' | 'source_look' | 'appearance_look' | 'avatar_engine' | 'resolution' | 'animation_reference' |
  'voice' | 'voice_engine' | 'voice_model' | 'voice_fallback' | 'background_asset' | 'matting' | 'motion' | 'expressiveness' | 'audio_asset' | 'glossary' | 'speech_markup';
const remedies: Record<HeygenSettingsLimitationV2, string> = {
  account_binding: 'Refresh this connected account and prepare a new review.', source_look: 'Select a ready owned source look from the approved profile.',
  appearance_look: 'Select a ready owned appearance look with valid consent.', avatar_engine: 'Choose an engine supported by the selected look.',
  resolution: 'Choose a resolution qualified for this connected subscription and look.', animation_reference: 'Select a ready digital-twin reference in the appearance group with valid consent.',
  voice: 'Select the approved owned voice with a qualified output locale.', voice_engine: 'Choose an engine observed on this voice, or keep its approved default.',
  voice_model: 'Choose a model qualified for this voice and selected engine.', voice_fallback: 'Qualify this engine in the output language without automatic voice-engine substitution.',
  background_asset: 'Upload and select an owned background image through the qualified asset route.', matting: 'Use a look with confirmed trained background removal, or keep its background.',
  motion: 'Use qualified Avatar V motion, or prepare an Avatar IV scene with the exact owned audio measured at ten seconds or less.',
  expressiveness: 'Use expressiveness only with an Avatar IV photo look.', audio_asset: 'Select a qualified owned original audio asset and omit text/voice tuning.',
  glossary: 'Select an existing owned glossary with an approved per-video scope.', speech_markup: 'Resolve the speech-control notation as ordinary spoken text before preparing a new request.',
};
function unavailable(setting: HeygenSettingsLimitationV2): never {
  throw new HttpException({code: 'VIDEO_HEYGEN_SETTING_UNAVAILABLE', setting, remedy: remedies[setting]}, 409);
}
const usable = (look: z.infer<typeof observation>) => look.owned && look.ready && ['accepted', 'not_applicable'].includes(look.consentState);
const hasSpeechMarkup = (value: string) => /<\/?(?:speak|break|prosody|phoneme|say-as|voice|audio|emphasis|sub|lang|p)\b[^>]*>/iu.test(value) ||
  /\[(?:pause|long pause|short pause|warm|excited|sad|happy|angry|whisper|whispering|laugh|laughing|sigh|sighing|calm|serious)\]/iu.test(value);

/** Pure preparation only; all qualification values must come from current server reads. */
export function heygenAvatarArgsV2(rawSettings: unknown, exactSpeech: string | null, rawQualification: unknown): HeygenAvatarWireArgsV2 {
  const parsed = HeygenVideoSettingsSchemaV2.safeParse(rawSettings), qualified = HeygenSettingsQualificationSchemaV2.safeParse(rawQualification);
  if (!parsed.success) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  if (!qualified.success || qualified.data.schemaDigest !== HEYGEN_SETTINGS_SCHEMA_V2) return videoErrorV1('VIDEO_SCHEMA_CHANGED', 409);
  const s = parsed.data, q = qualified.data, look = q.appearance, engine = s.engine.type;
  if (s.sourceLookId !== q.source.lookId || s.sourceGroupId !== q.source.groupId || !usable(q.source)) return unavailable('source_look');
  if (s.appearanceLookId !== look.lookId || s.groupId !== look.groupId || !usable(look)) return unavailable('appearance_look');
  if (!look.engines.includes(engine)) return unavailable('avatar_engine');
  if (!q.resolutions.includes(s.resolution) || s.resolution === '4k' && (engine !== 'avatar_iii' || look.avatarType === 'photo_avatar')) return unavailable('resolution');
  if (s.animationReferenceLookId) {
    const ref = q.animationReference;
    if (engine !== 'avatar_v' || !ref || ref.lookId !== s.animationReferenceLookId || ref.groupId !== s.groupId || ref.avatarType !== 'digital_twin' || !usable(ref)) return unavailable('animation_reference');
  }
  // V also supports image-only photos. Never let an unknown server default
  // choose another motion reference; absence must be positively observed.
  if (engine === 'avatar_v' && look.avatarType === 'photo_avatar' && !s.animationReferenceLookId && look.photoOnlyAnimation !== true) return unavailable('animation_reference');
  if (s.expressiveness !== undefined && (engine !== 'avatar_iv' || look.avatarType !== 'photo_avatar')) return unavailable('expressiveness');
  // A single-clip target has no duration proof. Only the separate scene preparation
  // can bind measured Avatar IV audio. Frozen readers retain their original mapping.
  if (s.motionPrompt && (engine !== 'avatar_v' ||
    engine === 'avatar_v' && look.avatarType === 'photo_avatar' && !s.animationReferenceLookId)) return unavailable('motion');
  if (s.removeBackground === true && look.matting !== 'supported') return unavailable('matting');
  if (s.background?.type === 'image' && !q.ownedBackgroundAssetIds?.includes(s.background.assetId)) return unavailable('background_asset');
  let spoken: string | undefined;
  if (s.sourceMode === 'text') {
    if (!speech.safeParse(exactSpeech).success) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
    spoken = exactSpeech!;
    if (hasSpeechMarkup(spoken)) return unavailable('speech_markup');
    // Catalog language/accent labels describe the asset, not inference eligibility.
    // A Russian label must not disallow a requested English script (or conversely).
    if (s.audioAssetId || !s.voiceId || !s.voiceSettings || !q.voice || !q.voice.owned || !q.voice.ready || q.voice.voiceId !== s.voiceId) return unavailable('voice');
    const e = s.voiceSettings.engineSettings;
    if (e && !q.voice.engineTypes?.includes(e.engine_type)) return unavailable('voice_engine');
    if (e && 'model' in e && e.model && !q.voice.models?.includes(e.model)) return unavailable('voice_model');
    if (e && ['heygen_voice', 'orca'].includes(e.engine_type) && q.voice.noAutomaticFallback !== true) return unavailable('voice_fallback');
    if (s.brandGlossaryId && !q.ownedGlossaryIds?.includes(s.brandGlossaryId)) return unavailable('glossary');
  } else if (exactSpeech !== null || !s.audioAssetId || !q.ownedAudioAssetIds?.includes(s.audioAssetId) || s.voiceId || s.voiceSettings || s.brandGlossaryId) return unavailable('audio_asset');
  return mapHeygenSettingsV2(s, exactSpeech);
}

/** Deterministic mapping only. Admission must qualify resources before using it. */
function mapHeygenSettingsV2(s: HeygenVideoSettingsV2, exactSpeech: string | null): HeygenAvatarWireArgsV2 {
  const spoken = exactSpeech === null ? undefined : exactSpeech, engine = s.engine.type;
  const {engineSettings, ...ordinaryVoice} = s.voiceSettings ?? {};
  return heygenAvatarWireArgsV2({avatarId: s.appearanceLookId,
    ...(spoken !== undefined ? {script: spoken, voiceId: s.voiceId, voiceSettings: {...ordinaryVoice, ...(engineSettings ? {engine_settings: engineSettings} : {})}} : {audioAssetId: s.audioAssetId}),
    engine: {type: engine, ...(engine === 'avatar_v' ? {...(s.animationReferenceLookId ? {reference_look_id: s.animationReferenceLookId} : {}),
      ...(s.engine.type === 'avatar_v' && s.engine.moreBlinking !== undefined ? {more_blinking: s.engine.moreBlinking} : {})} : {})},
    resolution: s.resolution, aspectRatio: s.aspectRatio, outputFormat: s.outputFormat,
    ...(s.background ? {background: s.background.type === 'color' ? s.background : {type: 'image', asset_id: s.background.assetId}} : {}),
    ...(s.removeBackground !== undefined ? {removeBackground: s.removeBackground} : {}), ...(s.fit ? {fit: s.fit} : {}),
    ...(s.motionPrompt ? {motionPrompt: s.motionPrompt} : {}), ...(s.expressiveness ? {expressiveness: s.expressiveness} : {}),
    ...(s.brandGlossaryId ? {brandGlossaryId: s.brandGlossaryId} : {}), ...(s.captions !== 'none' ? {caption: {file_format: 'srt', ...(s.captions === 'burned' ? {style: 'default'} : {})}} : {}),
    ...(s.title ? {title: s.title} : {}),
  });
}

/** Frozen reader: never translates, injects speech notation, or supplies defaults. */
export function heygenAvatarWireArgsV2(raw: unknown): HeygenAvatarWireArgsV2 {
  const p = wire.safeParse(raw);
  if (!p.success) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  const v = p.data, textMode = v.script !== undefined;
  if (textMode ? !v.voiceId || !v.voiceSettings || v.audioAssetId !== undefined : !v.audioAssetId || v.voiceId !== undefined || v.voiceSettings !== undefined || v.brandGlossaryId !== undefined)
    return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  if (v.engine.type !== 'avatar_iv' && v.expressiveness !== undefined || v.engine.type === 'avatar_iii' && v.motionPrompt !== undefined)
    return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  return v;
}
const recipe = z.object({kind: z.literal(HEYGEN_SETTINGS_KIND_V2), binding: HeygenRecipeBindingSchemaV2, settings: HeygenVideoSettingsSchemaV2,
  speech: speech.nullable(), args: wire, schemaDigest: digest, recipeHash: digest}).strict();
export type HeygenVideoRecipeV2 = z.infer<typeof recipe>;
export const heygenVideoRecipeHashV2 = ({recipeHash, ...value}: Omit<HeygenVideoRecipeV2, 'recipeHash'> & {recipeHash?: string}) => subscriptionHash(value);

export function heygenVideoRecipeV2(rawBinding: unknown, rawSettings: unknown, exactSpeech: string | null, rawQualification: unknown): HeygenVideoRecipeV2 {
  const binding = HeygenRecipeBindingSchemaV2.safeParse(rawBinding), q = HeygenSettingsQualificationSchemaV2.safeParse(rawQualification);
  if (!binding.success || !q.success) return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  if (binding.data.connectionId !== q.data.connectionId || binding.data.subjectDigest !== q.data.subjectDigest || binding.data.accountGeneration !== q.data.accountGeneration ||
    binding.data.sourcePin.sourceArtifact && binding.data.sourcePin.sourceArtifact.pieceId !== binding.data.sourcePin.pieceId) return unavailable('account_binding');
  const args = heygenAvatarArgsV2(rawSettings, exactSpeech, q.data), settings = HeygenVideoSettingsSchemaV2.parse(rawSettings);
  const frozen = {kind: HEYGEN_SETTINGS_KIND_V2, binding: binding.data, settings, speech: exactSpeech, args, schemaDigest: HEYGEN_SETTINGS_SCHEMA_V2};
  return {...frozen, recipeHash: heygenVideoRecipeHashV2(frozen)};
}

/** Verify saved mapping without requalifying or editing old bytes during recovery. */
export function parseHeygenVideoRecipeV2(raw: unknown): HeygenVideoRecipeV2 {
  const parsed = recipe.safeParse(raw);
  if (!parsed.success || parsed.data.schemaDigest !== HEYGEN_SETTINGS_SCHEMA_V2 || parsed.data.recipeHash !== heygenVideoRecipeHashV2(parsed.data)) return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  const r = parsed.data;
  if (r.binding.sourcePin.sourceArtifact && r.binding.sourcePin.sourceArtifact.pieceId !== r.binding.sourcePin.pieceId ||
    (r.settings.sourceMode === 'text') !== (r.speech !== null) ||
    subscriptionHash(mapHeygenSettingsV2(r.settings, r.speech)) !== subscriptionHash(r.args) || subscriptionHash(raw) !== subscriptionHash(r)) return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  return r;
}
