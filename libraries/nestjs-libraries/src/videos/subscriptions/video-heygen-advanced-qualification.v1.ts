import { z } from 'zod';
import { HttpException } from '@nestjs/common';

/** Authenticated input schemas observed on 8 November 2026. These hashes cover
 * tool names/input schemas, not response contracts, ownership or entitlement.
 */
export const HEYGEN_ADVANCED_TOOL_SCHEMAS_V1 = {
  list_voices: '33609d80f0faeba86cd5493386b8124e97a6a3e2e1e172770c5387e0f6625b4c',
  get_voice: '4568f8b6e4709df689d096daa548f3c9aef56a971bb7474c20f9d0d9095226b8',
  list_assets: '78e44f526278e71be83b17396a22ebf71f9ffde7b669a4899559ff517c9aae1c',
  get_asset: 'dde22393cc34797e7937adaa646153678e8de11fa141bb5bce1424a815def52b',
  list_brand_glossaries: 'c203a0a634dacadc94edd7e9ff833171b1ad0674b880a5262b9009bc4ffac4ab',
  get_brand_glossary: '01f4b7db94e8c36479974f19029467691a1718070bf5355238c506d32f7595e2',
  list_avatar_looks: 'be567c8bb59f8a292ca71d04a169269087d2d6db0daa18e1c331c8af3e9cee34',
  get_avatar_look: '32ea80d50c90e57bddd5d883f738098723c133d1f5270d0ebaf541a9244896c7',
} as const;
/** 9 November inventory. The fixed private read uses the same explicit
 * type/limit/token; the retired optional engine/language/gender filters were unused.
 */
export const HEYGEN_PRIVATE_VOICE_LIST_SCHEMA_V2 = '003b38174b6059d6756f420832d1488b808945aa303e4c8af66904bac3c910dd';

export type HeygenAdvancedLimitationV1 = {
  setting: 'voice_engine' | 'voice_model' | 'voice_fallback' | 'background_asset' | 'audio_asset' | 'matting';
  reason: 'voice_engine_mapping_unobserved' | 'voice_model_compatibility_unobserved' | 'voice_fallback_unverified' |
    'local_media_asset_binding_unverified' | 'asset_type_unsupported' | 'trained_matting_not_observed';
  remedy: string;
};

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const shortText = z.string().min(1).max(320).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
const engine = z.string().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/);
const object = z.object({}).passthrough();
const invalid = (): never => {throw new HttpException({code: 'VIDEO_HEYGEN_ADVANCED_RESPONSE_INVALID'}, 409);};
const unavailable = (): never => {throw new HttpException({code: 'VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE'}, 409);};
const parse = <T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> => {
  const result = schema.safeParse(raw);
  if (!result.success) return invalid();
  return result.data;
};
/** Decoders accept the direct value returned by the existing guarded MCP client.
 * No response text, URLs or provider errors are copied into application output.
 */
const observed = (raw: unknown) => {
  const value = parse(object, raw);
  if (value.error != null || value.isError === true || value.success === false) return invalid();
  return value;
};
const assetType = z.enum(['audio', 'image']);
export const HEYGEN_BACKGROUND_ASSET_ORIGIN_V1 = 'https://resource2.heygen.ai';
export type HeygenBackgroundAssetReferenceV1 = {assetId: string; url: string; name: string};

/** Detail follows the exact owned image selection. Do not expose the private
 * URL outside the server's bounded downloader.
 */
export function decodeHeygenBackgroundAssetReferenceV1(assetId: string, raw: unknown): HeygenBackgroundAssetReferenceV1 {
  const detail = observed(raw);
  try {
    const url = new URL(typeof detail.url === 'string' ? detail.url : '');
    if (url.origin !== HEYGEN_BACKGROUND_ASSET_ORIGIN_V1 || url.username || url.password || url.hash) throw new Error();
    return {assetId, url: url.href, name: safeName(detail.name, 'HeyGen background')};
  } catch {
    throw new HttpException({code: 'VIDEO_HEYGEN_BACKGROUND_DOWNLOAD_UNAVAILABLE', setting: 'background_asset', reason: 'provider_image_download_unavailable',
      remedy: 'Choose an owned image whose HeyGen details provide a supported download.'}, 409);
  }
}
const advancedInput = z.object({
  subjectDigest: z.string().regex(/^[a-f0-9]{64}$/),
  browse: z.literal(true).optional(),
  voiceId: id.optional(),
  appearance: z.object({lookId: id, groupId: id}).strict().optional(),
  includeGlossaries: z.boolean().optional(),
  includeAssets: z.boolean().optional(),
  glossaryId: id.optional(),
  backgroundAssetId: id.optional(),
  audioAssetId: id.optional(),
}).strict().refine(value => !value.browse || !value.glossaryId && !value.backgroundAssetId && !value.audioAssetId);
export type HeygenAdvancedOptionsInputV1 = z.infer<typeof advancedInput>;
export const parseHeygenAdvancedOptionsInputV1 = (raw: unknown): HeygenAdvancedOptionsInputV1 => {
  const result = advancedInput.safeParse(raw);
  return result.success ? result.data : unavailable();
};

export function decodeHeygenAdvancedPageV1(raw: unknown, limit: number) {
  return parse(z.object({items: z.array(object).max(limit), has_more: z.boolean(),
    next_token: z.string().min(1).max(2000).nullable().optional()}).passthrough()
    .refine(value => !value.has_more || !!value.next_token), observed(raw));
}
const rows = (raw: readonly unknown[], key: string): Record<string, unknown>[] => {
  const values = parse(z.array(object).max(300), raw);
  const ids = values.map(value => parse(id, value[key]));
  if (new Set(ids).size !== ids.length) return invalid();
  return values;
};
const reviewedEngines = new Set(['elevenlabs', 'fish', 'starfish', 'heygen_voice', 'orca']);
const conflictsWithPrivateOwnership = (value: Record<string, unknown>) => value.is_public === true ||
  ['ownership', 'type'].some(key => ['public', 'community', 'shared', 'foreign'].includes(String(value[key])));
const safeName = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() &&
  !/https?:\/\/|\bbearer\s/i.test(value) ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : fallback;

export function selectHeygenAdvancedPrivateVoiceV1(privateVoiceRows: readonly unknown[], voiceId: string, currentPrivateList = false) {
  const listed = rows(privateVoiceRows, 'voice_id').find(value => value.voice_id === voiceId);
  if (!listed || conflictsWithPrivateOwnership(listed)) return unavailable();
  observed(listed);
  if (currentPrivateList && listed.type === undefined) {
    // The reviewed newer schema's explicit private filter carries the scope.
    // Its rows identify the voice's mode/status, without a separate type field.
    parse(z.object({mode: shortText, status: shortText}).passthrough(), listed);
  } else if (listed.type !== 'private') return unavailable();
  return listed;
}

export type HeygenAdvancedVoiceQualificationV1 = {
  voice: {voiceId: string; owned: true; ready: boolean; engineTypes: string[]};
  /** Metadata only. Never use it to replace the approved profile's engine. */
  defaultEngine: string | null;
  limitations: HeygenAdvancedLimitationV1[];
};

/** Server-only inputs: complete fixed type=private list rows and exact get_voice
 * detail from the same current authenticated account. Caller DTOs are not proof.
 * available_engines is observed on list_voices, not inferred from get_voice or
 * a global create schema. No observed field proves a per-voice model or that
 * HeyGen Voice will avoid its documented language-dependent ElevenLabs fallback.
 */
export function decodeHeygenAdvancedVoiceQualificationV1(input: {
  voiceId: string; privateVoiceRows: readonly unknown[]; detail: unknown; currentPrivateList?: boolean;
}): HeygenAdvancedVoiceQualificationV1 {
  const voiceId = parse(id, input.voiceId);
  const listed = selectHeygenAdvancedPrivateVoiceV1(input.privateVoiceRows, voiceId, input.currentPrivateList);
  const mapping = input.currentPrivateList ? {} : parse(z.object({default_engine: engine.nullable().optional(),
    available_engines: z.array(engine).max(20).nullable().optional()}).passthrough(), listed);
  const detail = parse(z.object({voice_id: id, status: input.currentPrivateList ? shortText :
    z.enum(['complete', 'completed', 'failed', 'processing', 'pending'])}).passthrough(), observed(input.detail));
  if (detail.voice_id !== voiceId) return invalid();
  if (conflictsWithPrivateOwnership(detail)) return unavailable();
  const ready = input.currentPrivateList ? detail.status === 'ACTIVE' : detail.status === 'complete' || detail.status === 'completed';
  const engineTypes = ready ? [...new Set((mapping.available_engines ?? []).filter(value => reviewedEngines.has(value)))] : [];
  // Current create schemas document orca as the legacy name of heygen_voice.
  if (engineTypes.includes('orca') && !engineTypes.includes('heygen_voice')) engineTypes.push('heygen_voice');
  if (engineTypes.includes('heygen_voice') && !engineTypes.includes('orca')) engineTypes.push('orca');
  const defaultEngine = mapping.default_engine && engineTypes.includes(mapping.default_engine) ? mapping.default_engine : null;
  return {voice: {voiceId, owned: true, ready, engineTypes}, defaultEngine, limitations: [
    ...(!engineTypes.length ? [{setting: 'voice_engine' as const, reason: 'voice_engine_mapping_unobserved' as const,
      remedy: 'Read this private voice\'s current available_engines; keep the approved baseline until its engine is qualified.'}] : []),
    {setting: 'voice_model', reason: 'voice_model_compatibility_unobserved',
      remedy: 'Obtain current compatibility evidence for this voice, engine and model before exposing model selection.'},
    {setting: 'voice_fallback', reason: 'voice_fallback_unverified',
      remedy: 'Qualify the selected HeyGen Voice engine in the spoken language without automatic engine substitution.'},
  ]};
}

export type HeygenOwnedAssetQualificationV1 = {
  assetId: string; owned: true; type: string; renderQualified: false; limitation: HeygenAdvancedLimitationV1;
};

function assetBindingLimitation(type: 'audio' | 'image'): HeygenAdvancedLimitationV1 {
  return {setting: type === 'audio' ? 'audio_asset' : 'background_asset', reason: 'local_media_asset_binding_unverified',
    remedy: 'Bind the owned local Media content digest to this exact provider asset in the current account before rendering.'};
}

export function listHeygenAdvancedOwnedAssetsV1(raw: readonly unknown[], accountUsername: string) {
  return rows(raw, 'id').map(observed).flatMap(value => {
    const type = assetType.safeParse(value.type);
    if (!type.success || value.owner !== accountUsername || conflictsWithPrivateOwnership(value)) return [];
    const assetId = parse(id, value.id);
    parse(id, value.space_id);
    return [{id: assetId, name: safeName(value.name, assetId), type: type.data, renderQualified: false as const,
      limitation: assetBindingLimitation(type.data)}];
  });
}

/** list_assets must use the current account's username. Both list/detail owner,
 * space, ID and type must match. Provider metadata has no local Media ID or
 * content digest. The existing original-recording declaration proves local
 * origin/content only: it cannot populate ownedAudioAssetIds or background IDs.
 */
export function decodeHeygenOwnedAssetQualificationV1(input: {
  assetId: string; accountUsername: string; privateAssetRows: readonly unknown[]; detail: unknown;
}): HeygenOwnedAssetQualificationV1 {
  const assetId = parse(id, input.assetId), owner = parse(shortText, input.accountUsername);
  const schema = z.object({id, type: shortText, owner: shortText, space_id: id}).passthrough();
  const listed = rows(input.privateAssetRows, 'id').find(value => value.id === assetId);
  if (!listed || conflictsWithPrivateOwnership(listed)) return unavailable();
  const list = parse(schema, observed(listed)), detail = parse(schema, observed(input.detail));
  if (list.owner !== owner || detail.owner !== owner || conflictsWithPrivateOwnership(detail)) return unavailable();
  if (detail.id !== assetId || detail.space_id !== list.space_id || detail.type !== list.type) return invalid();
  const recognized = assetType.safeParse(detail.type);
  return {assetId, owned: true, type: detail.type, renderQualified: false,
    limitation: recognized.success ? assetBindingLimitation(recognized.data) : {
      setting: 'background_asset', reason: 'asset_type_unsupported',
      remedy: 'Select an owned image background or original audio asset supported by this route.',
    }};
}

export function listHeygenAdvancedOwnedGlossariesV1(raw: readonly unknown[]) {
  return rows(raw, 'brand_glossary_id').map(observed).filter(value => !conflictsWithPrivateOwnership(value)).map(value => {
    const glossaryId = parse(id, value.brand_glossary_id);
    return {id: glossaryId, name: safeName(value.name, glossaryId)};
  });
}

/** Workspace-scoped list+detail identity proves the selected glossary belongs
 * to this connection's workspace. Selection/apply approval remains per-video.
 * Only the identifier crosses this boundary; private terms are not returned.
 */
export function decodeHeygenOwnedGlossaryQualificationV1(input: {
  glossaryId: string; workspaceGlossaryRows: readonly unknown[]; detail: unknown;
}): {glossaryId: string; owned: true} {
  const glossaryId = parse(id, input.glossaryId);
  if (!listHeygenAdvancedOwnedGlossariesV1(input.workspaceGlossaryRows).some(value => value.id === glossaryId)) return unavailable();
  const detail = parse(z.object({brand_glossary_id: id, terms: z.array(object).max(10000)}).passthrough(), observed(input.detail));
  if (detail.brand_glossary_id !== glossaryId) return invalid();
  if (conflictsWithPrivateOwnership(detail)) return unavailable();
  return {glossaryId, owned: true};
}

/** Current get_avatar_look exposes no trained-matting field. Avatar type,
 * recency and supported_api_engines do not prove trained background separation.
 * Ignore guessed matting/supports_matting keys until their contract is observed.
 */
export function decodeHeygenMattingQualificationV1(input: {
  lookId: string; groupId: string; ownedLookRows: readonly unknown[]; detail: unknown;
}): {lookId: string; matting: 'unknown'; limitation: HeygenAdvancedLimitationV1} {
  const lookId = parse(id, input.lookId), groupId = parse(id, input.groupId);
  selectHeygenAdvancedOwnedLookV1(input.ownedLookRows, lookId, groupId);
  const detail = parse(z.object({id, group_id: id, status: z.string(),
    avatar_type: z.enum(['photo_avatar', 'digital_twin', 'studio_avatar'])}).passthrough(), observed(input.detail));
  if (detail.id !== lookId || detail.group_id !== groupId) return invalid();
  if (conflictsWithPrivateOwnership(detail)) return unavailable();
  return {lookId, matting: 'unknown', limitation: {setting: 'matting', reason: 'trained_matting_not_observed',
    remedy: 'Obtain a documented current trained-matting observation for this exact look before enabling background removal.'}};
}

export function selectHeygenAdvancedOwnedLookV1(ownedLookRows: readonly unknown[], lookId: string, groupId: string) {
  const listed = rows(ownedLookRows, 'id').find(value => value.id === lookId && value.group_id === groupId);
  if (!listed || conflictsWithPrivateOwnership(listed)) return unavailable();
  // A failed sibling can have a resource error in a valid private list.
  return observed(listed);
}

export type HeygenAdvancedBrowseCategoryV1 = 'voice' | 'glossaries' | 'assets' | 'matting';
export type HeygenAdvancedOptionsV1 = {
  voice?: HeygenAdvancedVoiceQualificationV1;
  glossaries?: ReturnType<typeof listHeygenAdvancedOwnedGlossariesV1>;
  glossary?: ReturnType<typeof decodeHeygenOwnedGlossaryQualificationV1>;
  assets?: ReturnType<typeof listHeygenAdvancedOwnedAssetsV1>;
  backgroundAsset?: HeygenOwnedAssetQualificationV1;
  audioAsset?: HeygenOwnedAssetQualificationV1;
  matting?: ReturnType<typeof decodeHeygenMattingQualificationV1>;
  unavailable?: HeygenAdvancedBrowseCategoryV1[];
};
