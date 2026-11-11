import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseVideoV1, videoErrorV1 } from '../video-brief.v1';
import { HeygenVoiceBaselineSchemaV2 } from './video-heygen-settings.v2';
import type { HeygenCatalogEntryV1, HeygenOwnedCatalogV1 } from './video-heygen-owned-catalog.v1';

const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().trim().min(1).max(120).refine(value =>
  !/[\u0000-\u001f\u007f]|https?:\/\/|\bbearer\s/i.test(value));
export const HeygenPersonProfileInputSchemaV1 = z.object({
  profileId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), connectionId: z.string().uuid(),
  displayName: label, aliases: z.array(label).max(20).default([]), preferredForName: z.boolean().default(false),
  editorialPersonaId: z.string().uuid().optional(),
  groupIds: z.array(providerId).min(1).max(30), preferredGroupId: providerId,
  sourceLooks: z.array(z.object({groupId: providerId, lookId: providerId,
    roles: z.array(z.enum(['style_base', 'appearance', 'animation_reference'])).min(1).max(3),
    previewMediaId: z.string().uuid().optional(),
  }).strict()).min(1).max(100),
  preferredSourceLookId: providerId, defaultAppearanceLookId: providerId.optional(), defaultAnimationReferenceLookId: providerId.optional(),
  defaultVoice: z.object({voiceId: providerId, engine: providerId.optional(), baseline: HeygenVoiceBaselineSchemaV2.optional()}).strict(),
}).strict();
export type HeygenPersonProfileInputV1 = z.infer<typeof HeygenPersonProfileInputSchemaV1>;
/** The native approval must contain every value exactly; normalization belongs before review. */
const confirmedLabel = z.string().min(1).max(120).refine(value => value === value.trim() &&
  !/[\u0000-\u001f\u007f]|https?:\/\/|\bbearer\s/i.test(value));
export const HeygenPersonProfileConfirmationSchemaV1 = HeygenPersonProfileInputSchemaV1.extend({
  displayName: confirmedLabel, aliases: z.array(confirmedLabel).max(20), preferredForName: z.boolean(),
}).strict();
export type HeygenPersonProfileSourceLookV1 = HeygenPersonProfileInputV1['sourceLooks'][number];

/** Only a native confirmed tool or authenticated screen handler constructs this context.
 * It is a separate server argument and must never be part of the model/HTTP input schema.
 * The catalog and preview bindings come from the actor's authenticated private reads.
 */
export interface HeygenProfileHumanDecisionV1 {
  decisionId: string; source: 'authenticated_screen_action' | 'confirmed_chat_action'; approvedDigest: string;
  accountDigest: string; accountGeneration: number; observedAt: string; catalog: HeygenOwnedCatalogV1;
  previewMediaBindings?: {groupId: string; lookId: string; mediaId: string}[];
}
/** Authenticated provider subject observation supplied by server code, never a model argument. */
export interface HeygenProfileAccountContextV1 {accountDigest: string; accountGeneration: number}
export interface HeygenProfileDecisionReceiptV1 {
  decisionId: string; actorId: string; source: HeygenProfileHumanDecisionV1['source']; approvedDigest: string; at: string;
}
export interface HeygenPersonProfilePayloadV1 {
  version: 1; organizationId: string; actorId: string; accountDigest: string; observedAccountGeneration: number;
  preferences: HeygenPersonProfileInputV1; approvedDigest: string; humanDecision: HeygenProfileDecisionReceiptV1;
  observations: {observedAt: string; renderQualified: false;
    looks: {groupId: string; lookId: string; name: string; state: HeygenCatalogEntryV1['state'];
      avatarType: HeygenCatalogEntryV1['avatarType']; groupType: HeygenCatalogEntryV1['groupType'];
      consentStatus: HeygenCatalogEntryV1['consentStatus']; engines: string[]}[];
    voice: {voiceId: string; name: string; state: HeygenCatalogEntryV1['state']};
  };
}
export interface HeygenPersonProfileViewV1 {
  version: 1; profileId: string; revision: number; digest: string; connectionId: string;
  displayName: string; aliases: string[]; preferredForName: boolean; editorialPersonaId?: string;
  groupIds: string[]; preferredGroupId: string; sourceLooks: HeygenPersonProfileSourceLookV1[];
  preferredSourceLookId: string; defaultAppearanceLookId?: string; defaultAnimationReferenceLookId?: string;
  defaultVoice: HeygenPersonProfileInputV1['defaultVoice']; observations: HeygenPersonProfilePayloadV1['observations'];
  humanDecision: Pick<HeygenProfileDecisionReceiptV1, 'decisionId' | 'source' | 'at'>;
  setupReusable: boolean; blockers: string[]; renderQualified: false; generationAuthorized: false;
}
export interface HeygenPersonProfileSelectionV1 {
  connectionId: string; profileId?: string; name?: string; groupId?: string; lookId?: string;
  appearanceLookId?: string; animationReferenceLookId?: string;
}
export interface HeygenPersonProfileFrozenV1 {
  version: 1; profileId: string; profileRevision: number; profileDigest: string; connectionId: string;
  groupId: string; baseLookId: string; appearanceLookId: string; animationReferenceLookId?: string;
  voiceId: string; voiceEngine?: string; voiceBaseline?: HeygenPersonProfileInputV1['defaultVoice']['baseline'];
  generationAuthorized: false; renderQualified: false;
}
export interface HeygenProfileFrozenFenceV1 {
  profileId: string; profileRevision: number; profileDigest: string; connectionId: string; subjectDigest: string;
}

/** Exact normalized name/alias comparison only: no fuzzy match, translation or identity merging. */
export const normalizeHeygenPersonNameV1 = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
export const parseHeygenPersonProfileInputV1 = (raw: unknown): HeygenPersonProfileInputV1 => {
  const input = parseVideoV1(HeygenPersonProfileInputSchemaV1, raw);
  const unique = (values: string[]) => new Set(values).size === values.length;
  const source = input.sourceLooks.find(look => look.lookId === input.preferredSourceLookId);
  const look = (id: string | undefined, role: HeygenPersonProfileSourceLookV1['roles'][number]) => !id || input.sourceLooks.some(look => look.lookId === id && look.roles.includes(role));
  if (!unique(input.groupIds) || !input.groupIds.includes(input.preferredGroupId) || !unique(input.sourceLooks.map(look => look.lookId)) ||
    !unique(input.aliases.map(normalizeHeygenPersonNameV1)) || input.aliases.some(alias => normalizeHeygenPersonNameV1(alias) === normalizeHeygenPersonNameV1(input.displayName)) ||
    input.sourceLooks.some(look => !input.groupIds.includes(look.groupId) || !unique(look.roles)) ||
    !source || source.groupId !== input.preferredGroupId || !source.roles.includes('style_base') ||
    !look(input.defaultAppearanceLookId, 'appearance') || !look(input.defaultAnimationReferenceLookId, 'animation_reference')) return videoErrorV1('VIDEO_PROFILE_SELECTION_INVALID', 409);
  return input;
};
/** The approval card covers the exact preferences, target revision and account, never token generation. */
export const heygenPersonProfileApprovalDigestV1 = (organizationId: string, actorId: string, raw: unknown, accountDigest: string): string => {
  const input = parseHeygenPersonProfileInputV1(raw);
  if (!organizationId || !actorId || !digest.safeParse(accountDigest).success) return videoErrorV1('VIDEO_PROFILE_ACCOUNT_UNVERIFIED', 409);
  return createHash('sha256').update(JSON.stringify(canonical({kind: 'heygen-person-profile/v1', organizationId, actorId, accountDigest, input}))).digest('hex');
};
export const heygenPersonProfileDecisionContextSchemaV1 = z.object({decisionId: z.string().uuid(),
  source: z.enum(['authenticated_screen_action', 'confirmed_chat_action']), approvedDigest: digest,
  accountDigest: digest, accountGeneration: z.number().int().positive(), observedAt: z.string().datetime(),
}).strict();
/** Provider text is descriptive metadata, never an endpoint or an instruction. */
export const heygenPersonProfileSafeLabelV1 = (value: string, fallback: string): string =>
  label.safeParse(value).success ? value.trim() : fallback;
