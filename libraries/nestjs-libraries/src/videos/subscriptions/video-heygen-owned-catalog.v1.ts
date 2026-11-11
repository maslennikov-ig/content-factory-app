import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import type { VideoPersonalAssetV1 } from '../video-personal-subscription.v1';

/** Three authenticated read-tool schemas, unchanged 4–6 November. Unrelated tools grant no authority. */
export const HEYGEN_OWNED_CATALOG_SCHEMA_V1 = '8746c447a2e65a94bf7dfe4383b841d9177e410e49c0ea1d4ff21312ffeb56ff';
export const HEYGEN_OWNED_CATALOG_READS_V1 = [
  {kind: 'groups', tool: 'list_avatar_groups', arguments: {ownership: 'private', limit: 50}},
  {kind: 'looks', tool: 'list_avatar_looks', arguments: {ownership: 'private', limit: 50}},
  {kind: 'voices', tool: 'list_voices', arguments: {type: 'private', limit: 100}},
] as const;
/** Historical authenticated input schemas; each current tool is checked before any read. */
export const HEYGEN_OWNED_AVATAR_GROUP_READ_SCHEMAS_V1 = {
  list_avatar_groups: '75df4ad11b0f061354b873007c6ce55cdfb8c289758d148e5e3adb9d7b0b70f1',
  list_avatar_looks: 'be567c8bb59f8a292ca71d04a169269087d2d6db0daa18e1c331c8af3e9cee34',
  get_avatar_group: '25ae73ab1e0c402d22a4d50c27cd67ff281f6643eab173f785b402b60b722179',
} as const;
export type HeygenCatalogKindV1 = typeof HEYGEN_OWNED_CATALOG_READS_V1[number]['kind'];
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const selectedAvatar = z.object({avatarId: id, groupId: id.optional()}).strict();
export const heygenOwnedAvatarGroupInputV1 = (raw: unknown) => {
  const parsed = selectedAvatar.safeParse(raw);
  return parsed.success ? parsed.data as {avatarId: string; groupId?: string} : videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
};
export type HeygenAvatarTypeV1 = 'studio_avatar' | 'digital_twin' | 'photo_avatar';
export type HeygenAvatarGroupTypeV1 = 'digital_twin' | 'photo' | 'prompt';
export type HeygenConsentStatusV1 = 'accepted' | 'pending' | 'rejected' | 'unknown' | null;
const avatarType = (raw: unknown): HeygenAvatarTypeV1 | null => ['studio_avatar', 'digital_twin', 'photo_avatar'].includes(String(raw)) ? raw as HeygenAvatarTypeV1 : null;
const groupType = (raw: unknown): HeygenAvatarGroupTypeV1 | null => ['digital_twin', 'photo', 'prompt'].includes(String(raw)) ? raw as HeygenAvatarGroupTypeV1 : null;
const consentStatus = (raw: unknown): HeygenConsentStatusV1 => raw === null ? null : ['accepted', 'pending', 'rejected'].includes(String(raw)) ? raw as HeygenConsentStatusV1 : 'unknown';
const row = z.object({}).passthrough();
const page = z.object({items: z.array(row).max(100).optional(), data: z.array(row).max(100).optional(),
  has_more: z.boolean(), next_token: z.string().min(1).max(2000).nullable().optional()}).passthrough();
export function heygenCatalogPageV1(raw: unknown) {
  const parsed = page.safeParse(raw);
  if (!parsed.success || (parsed.data.items === undefined) === (parsed.data.data === undefined) || parsed.data.has_more && !parsed.data.next_token ||
    parsed.data.error !== undefined && parsed.data.error !== null) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  return {...parsed.data, data: parsed.data.items ?? parsed.data.data!};
}
export interface HeygenCatalogEntryV1 {
  id: string; name: string; ownership: 'owned';
  selectableForDraft: boolean;
  state: 'available' | 'consent_required' | 'training' | 'unverified' | 'failed';
  engines: string[]; locales: string[]; language?: string;
  groupId?: string; avatarType?: HeygenAvatarTypeV1 | null; groupType?: HeygenAvatarGroupTypeV1 | null; consentStatus?: HeygenConsentStatusV1;
  /** Opt-in private metadata; identical labels never establish a shared identity. */
  groupName?: string;
}
export interface HeygenOwnedCatalogV1 {
  scope: 'authenticated_private_account'; readOnly: true; renderQualified: false;
  avatars: HeygenCatalogEntryV1[]; voices: HeygenCatalogEntryV1[];
}
const name = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() && !/https?:\/\/|\bbearer\s/i.test(value)
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120) : fallback;
const privateRow = (value: Record<string, unknown>) =>
  ![value.ownership, value.type].some(scope => ['public', 'community', 'shared', 'foreign'].includes(String(scope))) && value.is_public !== true;
const rows = (values: Record<string, unknown>[], key: string) => {
  const ids = values.map(value => value[key]);
  if (values.length > 300 || ids.some(value => !id.safeParse(value).success) || new Set(ids).size !== ids.length)
    return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  return values;
};
type OwnedAvatar = {look: Record<string, unknown>; group: Record<string, unknown>};
/** Fresh private list responses establish group ownership; a caller-supplied group ID cannot. */
export function selectHeygenOwnedAvatarV1(input: {groups: Record<string, unknown>[]; looks: Record<string, unknown>[]}, raw: unknown): OwnedAvatar {
  const selected = heygenOwnedAvatarGroupInputV1(raw);
  const groups = rows(input.groups, 'id').filter(privateRow), looks = rows(input.looks, 'id').filter(privateRow);
  const look = looks.find(value => value.id === selected.avatarId);
  const group = look && groups.find(value => value.id === look.group_id);
  if (!look || !group || selected.groupId && selected.groupId !== group.id) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  return {look, group};
}
export interface HeygenOwnedAvatarGroupV1 {
  scope: 'authenticated_private_account'; readOnly: true; renderQualified: false;
  avatarId: string; groupId: string; name: string; groupName: string;
  avatarType: HeygenAvatarTypeV1 | null; groupType: HeygenAvatarGroupTypeV1 | null;
  /** Current detail count, not inferred from a possibly partial private list. */
  looksCount?: number;
  consentStatus: HeygenConsentStatusV1;
  consentState: 'accepted' | 'pending' | 'rejected' | 'not_applicable' | 'unknown';
  consentRequirement: 'required' | 'not_required' | 'unknown';
}
/** Whitelist current status only; URLs, preview media, history and remote text never leave this boundary. */
export function decodeHeygenOwnedAvatarGroupV1(owned: OwnedAvatar, raw: unknown): HeygenOwnedAvatarGroupV1 {
  const envelope = row.safeParse(raw);
  if (!envelope.success || envelope.data.data !== undefined && (envelope.data.id !== undefined || envelope.data.error != null)) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  const parsed = row.safeParse(envelope.data.data === undefined ? envelope.data : envelope.data.data);
  if (!parsed.success || parsed.data.id !== owned.group.id || !id.safeParse(parsed.data.id).success) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  const detail = parsed.data;
  if (!privateRow(detail)) return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  const listedType = groupType(owned.group.type), detailType = groupType(detail.type);
  if (listedType && detailType && listedType !== detailType) return videoErrorV1('VIDEO_PROVIDER_RESPONSE_INVALID', 409);
  const type = detail.type === undefined ? listedType : detailType, status = consentStatus(detail.consent_status);
  const notRequired = status === null && (type === 'photo' || type === 'prompt');
  return {scope: 'authenticated_private_account', readOnly: true, renderQualified: false,
    avatarId: owned.look.id as string, groupId: owned.group.id as string,
    name: name(owned.look.name, name(owned.group.name, 'Мой аватар')), groupName: name(detail.name, name(owned.group.name, 'Мой аватар')),
    avatarType: avatarType(owned.look.avatar_type), groupType: type, consentStatus: status,
    ...(typeof detail.looks_count === 'number' && Number.isSafeInteger(detail.looks_count) && detail.looks_count >= 0 && detail.looks_count <= 300 ? {looksCount: detail.looks_count} : {}),
    consentState: notRequired ? 'not_applicable' : status === null ? 'unknown' : status,
    consentRequirement: notRequired ? 'not_required' : type === 'digital_twin' ? 'required' : 'unknown'};
}
/** Only fixed ownership=private/type=private responses may reach this decoder. */
export function decodeHeygenOwnedCatalogV1(input: Record<HeygenCatalogKindV1, Record<string, unknown>[]>, options: {includeIdentityMetadata?: boolean} = {}) {
  const groups = rows(input.groups, 'id').filter(privateRow);
  const looks = rows(input.looks, 'id').filter(privateRow);
  const voices = rows(input.voices, 'voice_id').filter(privateRow);
  const avatars: HeygenCatalogEntryV1[] = looks.flatMap(value => {
    const group = groups.find(group => group.id === value.group_id);
    // A private look outside the returned private group population is not an owned identity proof.
    if (!group) return [];
    const completed = value.status === 'completed' && group.status === 'completed';
    const selectableForDraft = value.status === 'completed' && (group.status === 'completed' || group.status === null || group.status === undefined);
    const state: HeygenCatalogEntryV1['state'] = ['failed', 'error'].includes(String(value.status)) || ['failed', 'error'].includes(String(group.status)) ? 'failed'
      : ['pending', 'processing', 'training'].includes(String(value.status)) || ['pending', 'processing', 'training'].includes(String(group.status)) ? 'training'
      : !completed || group.consent_status === null || group.consent_status === undefined ? 'unverified'
      : group.consent_status !== 'accepted' ? 'consent_required' : 'available';
    return [{id: value.id as string, name: name(value.name, name(group.name, 'Мой аватар')), ownership: 'owned' as const, state, selectableForDraft,
      groupId: group.id as string, avatarType: avatarType(value.avatar_type), groupType: groupType(group.type), consentStatus: consentStatus(group.consent_status),
      ...(options.includeIdentityMetadata ? {groupName: name(group.name, 'Мой аватар')} : {}),
      engines: Array.isArray(value.supported_api_engines) ? value.supported_api_engines.filter((engine): engine is string => ['avatar_iii', 'avatar_iv', 'avatar_v'].includes(String(engine))) : [], locales: []}];
  });
  const voiceEntries: HeygenCatalogEntryV1[] = voices.map(value => {
    // V3 list_voices has no lifecycle field. Presence establishes catalog visibility,
    // never inference readiness, consent, renderer compatibility or a billing identity.
    const language = typeof value.language === 'string' ? value.language.slice(0, 60) : undefined;
    const code = language && ({Russian: 'ru', English: 'en', German: 'de', French: 'fr', Spanish: 'es', Italian: 'it', Portuguese: 'pt'} as Record<string, string>)[language];
    const state = value.status !== undefined && !['active', 'ACTIVE', 'completed', 'ready'].includes(String(value.status)) ? 'unverified' : 'available';
    return {id: value.voice_id as string, name: name(value.name, 'Мой голос'), ownership: 'owned', state, selectableForDraft: state === 'available',
      engines: [], locales: code ? [code] : [], ...(language ? {language} : {})};
  });
  const catalog: HeygenOwnedCatalogV1 = {scope: 'authenticated_private_account', readOnly: true, renderQualified: false, avatars, voices: voiceEntries};
  const eligible = (entry: HeygenCatalogEntryV1): entry is HeygenCatalogEntryV1 & {state: 'available'} => entry.state === 'available';
  const asset = ({language, ...entry}: HeygenCatalogEntryV1 & {state: 'available'}): VideoPersonalAssetV1 => entry;
  return {catalog, avatars: avatars.filter(eligible).map(asset), voices: voiceEntries.filter(eligible).map(asset)};
}

/** Group looks by their authenticated exact group ID, never by a display name. */
export function heygenOwnedCatalogIdentityGroupsV1(catalog: HeygenOwnedCatalogV1): {groupId: string; name: string; lookIds: string[]}[] {
  const groups = new Map<string, {groupId: string; name: string; lookIds: string[]}>();
  for (const look of catalog.avatars) {
    if (look.ownership !== 'owned' || !look.groupId) continue;
    const group = groups.get(look.groupId) ?? {groupId: look.groupId, name: look.groupName ?? 'Мой аватар', lookIds: []};
    group.lookIds.push(look.id);
    groups.set(look.groupId, group);
  }
  return [...groups.values()];
}
