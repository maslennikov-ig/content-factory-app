import { z } from 'zod';
import { parseVideoV1, videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import type { HeygenPersonProfileFrozenV1 } from './video-heygen-person-profile.v1';

/** Canonical {name,inputSchema} entries in the authenticated 7 November inventory. */
export const HEYGEN_STYLE_TOOL_SCHEMAS_V1 = {
  create_prompt_avatar: '88f0d66b0a7afbbfb2bbc606131c11c6d5379525b1aeb9abb0b452c1e6e929d8',
  get_avatar_creation_status: '02bb0468201d47b1910715a4646651a01e6ef777caddf543e705ca187004088b',
  get_avatar_look: '32ea80d50c90e57bddd5d883f738098723c133d1f5270d0ebaf541a9244896c7',
} as const;
export const HEYGEN_STYLE_SCHEMA_V1 = subscriptionHash(HEYGEN_STYLE_TOOL_SCHEMAS_V1);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const clean = (text: string) => !/[\u0000-\u001f\u007f]|https?:\/\/|\bbearer\s/i.test(text);
const english = (text: string) => !Array.from(text).some(char => /\p{L}/u.test(char) && !/[a-z]/i.test(char));
export const HeygenStylePrepareSchemaV1 = z.object({
  operationId: uuid, connectionId: uuid, profileId: uuid,
  expectedProfileRevision: z.number().int().positive(), expectedProfileDigest: digest,
  groupId: id, baseLookId: id,
  name: z.string().trim().min(1).max(120).refine(clean),
  prompt: z.string().trim().min(1).max(4000).refine(clean).refine(english), promptLanguage: z.literal('en'),
  aspectRatio: z.enum(['auto', '16:9', '9:16', '1:1', '4:5', '5:4']),
  referenceMediaIds: z.array(uuid).max(3).default([]),
}).strict();
export type HeygenStylePrepareV1 = z.infer<typeof HeygenStylePrepareSchemaV1>;
export interface HeygenStyleWireArgsV1 {
  name: string; prompt: string; avatarId: string; avatarGroupId: string;
  aspectRatio: HeygenStylePrepareV1['aspectRatio'];
  referenceImages?: {type: 'asset_id'; asset_id: string}[];
}
export interface HeygenStyleReferenceV1 {mediaId: string; assetId: string}
export interface HeygenStyleContextV1 {
  organizationId: string; actorId: string; operationId: string; connectionId: string;
  accountDigest: string; accountGeneration: number; profile: HeygenPersonProfileFrozenV1;
  input: HeygenStylePrepareV1;
}
export interface HeygenStyleQualificationV1 {
  accountDigest: string; accountGeneration: number;
  schemaDigests: typeof HEYGEN_STYLE_TOOL_SCHEMAS_V1;
  baseLook: {lookId: string; groupId: string; ownership: 'owned'; imageUsable: true; consent: 'accepted' | 'not_required'};
  entitlement: 'available' | 'unavailable' | 'unknown';
  /** Existing asset IDs resolved from actor/account-bound owned images. Never upload in qualification. */
  references: HeygenStyleReferenceV1[];
}
const receiptSchema = z.object({
  /** Legacy operation handle. With referenceKind=look this is the actual look ID, never a photar/job ID. */
  operationId: id, childLookIds: z.array(id).max(100), referenceKind: z.literal('look').optional(), groupId: id.optional(),
}).strict().refine(value => value.referenceKind === 'look'
  ? !!value.groupId && value.childLookIds.length === 1 && value.childLookIds[0] === value.operationId
  : value.groupId === undefined);
export type HeygenStyleReceiptV1 = z.infer<typeof receiptSchema>;
export interface HeygenStyleChildrenV1 extends HeygenStyleReceiptV1 {state: 'queued' | 'running' | 'completed' | 'failed'}
export interface HeygenStyleLookV1 {
  lookId: string; groupId: string; ownership: 'owned'; state: 'queued' | 'running' | 'completed' | 'failed'; imageUrl?: string;
}
export interface HeygenStyleOwnedImageV1 {mediaId: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'}
export interface HeygenStyleHooksV1 {
  beforeDispatch(): Promise<void>;
  /** Capture bounded raw response before SDK parsing, including on subsequent decoding failure. */
  afterResponse(raw: Record<string, unknown>): Promise<void>;
}
/** Trusted server-only adapter. No method or authority object is model/HTTP input. */
export interface HeygenStyleAdapterV1 {
  /** Authenticated native subject observation; never write it into global connection eligibility. */
  currentAccount?(organizationId: string, actorId: string, connectionId: string): Promise<{accountDigest: string; accountGeneration: number}>;
  qualify(context: HeygenStyleContextV1): Promise<HeygenStyleQualificationV1>;
  create(context: HeygenStyleContextV1, args: HeygenStyleWireArgsV1, hooks: HeygenStyleHooksV1): Promise<HeygenStyleReceiptV1>;
  decodeReceipt(raw: Record<string, unknown>): HeygenStyleReceiptV1;
  poll(context: HeygenStyleContextV1, receipt: HeygenStyleReceiptV1): Promise<HeygenStyleChildrenV1>;
  inspectLook(context: HeygenStyleContextV1, lookId: string): Promise<HeygenStyleLookV1>;
  /** Download as an image through native Media storage; stable key must reuse an already saved image. */
  saveOwnedImage(context: HeygenStyleContextV1, look: HeygenStyleLookV1 & {imageUrl: string}, idempotencyKey: string): Promise<HeygenStyleOwnedImageV1>;
}
export interface HeygenStyleAuthorizationV1 {
  decisionId: string; scopeId: string; organizationId: string; actorId: string; operationId: string;
  requestHash: string; connectionId: string; accountDigest: string; accountGeneration: number;
  expiresAt: string; funding: 'personal_subscription';
}
export type HeygenStyleAuthorizeV1 = (context: HeygenStyleContextV1 & {requestHash: string; args: HeygenStyleWireArgsV1}) => Promise<HeygenStyleAuthorizationV1>;
export interface HeygenStyleChildV1 {
  lookId: string; groupId: string; state: 'queued' | 'running' | 'failed' | 'save_pending' | 'saved';
  imageUrl?: string; image?: HeygenStyleOwnedImageV1; blocker?: string;
}
export interface HeygenStylePayloadV1 {
  version: 1; context: HeygenStyleContextV1; args: HeygenStyleWireArgsV1;
  references: HeygenStyleReferenceV1[]; requestHash: string; schemaDigest: string;
  state: 'prepared' | 'dispatching' | 'uncertain' | 'submitted' | 'collecting' | 'completed' | 'partial' | 'failed';
  blockers: string[]; createdAt: string;
  attempt?: {id: string; claimedAt: string; dispatchedAt?: string; authorization: HeygenStyleAuthorizationV1;
    rawResponse?: Record<string, unknown>; rawResponseHash?: string; receipt?: HeygenStyleReceiptV1};
  providerState?: HeygenStyleChildrenV1['state']; children: HeygenStyleChildV1[];
  selection?: {lookId: string; mediaId: string; selectedAt: string};
}
export interface HeygenStyleViewV1 {
  version: 1; operationId: string; revision: number; name: string; connectionId: string; requestHash: string;
  profileId: string; profileRevision: number; profileDigest: string; groupId: string; baseLookId: string;
  referenceMediaIds: string[]; prompt: string; aspectRatio: HeygenStylePrepareV1['aspectRatio'];
  state: HeygenStylePayloadV1['state']; blockers: string[]; attempted: boolean; actualCost: null;
  resultKind: 'image'; completedCount: number; failedCount: number;
  children: {lookId: string; groupId: string; state: HeygenStyleChildV1['state']; mediaId?: string; mimeType?: string; blocker?: string}[];
  selection?: HeygenStylePayloadV1['selection'];
}
/** Server-validated generated appearance; it reuses identity setup and changes this recipe only. */
export interface HeygenStyleAppearanceV1 extends HeygenPersonProfileFrozenV1 {
  operationId: string; operationRevision: number; requestHash: string; mediaId: string; lineageDigest: string;
}
export const parseHeygenStylePrepareV1 = (raw: unknown): HeygenStylePrepareV1 => {
  const value = parseVideoV1(HeygenStylePrepareSchemaV1, raw);
  if (new Set(value.referenceMediaIds).size !== value.referenceMediaIds.length) return videoErrorV1('VIDEO_STYLE_REFERENCE_INVALID', 409);
  return value;
};
export function heygenStyleWireArgsV1(input: HeygenStylePrepareV1, profile: HeygenPersonProfileFrozenV1, references: HeygenStyleReferenceV1[]): HeygenStyleWireArgsV1 {
  if (profile.baseLookId !== input.baseLookId || profile.groupId !== input.groupId || references.length !== input.referenceMediaIds.length ||
    references.some((ref, index) => ref.mediaId !== input.referenceMediaIds[index] || !id.safeParse(ref.assetId).success))
    return videoErrorV1('VIDEO_STYLE_REFERENCE_INVALID', 409);
  return {name: input.name, prompt: input.prompt, avatarId: profile.baseLookId, avatarGroupId: profile.groupId,
    aspectRatio: input.aspectRatio, ...(references.length ? {referenceImages: references.map(ref => ({type: 'asset_id' as const, asset_id: ref.assetId}))} : {})};
}
export const heygenStyleRequestHashV1 = (context: HeygenStyleContextV1, args: HeygenStyleWireArgsV1, references: HeygenStyleReferenceV1[]): string =>
  subscriptionHash({kind: 'heygen-style/v1', context, args, references, schemaDigest: HEYGEN_STYLE_SCHEMA_V1});
export function parseHeygenStyleReceiptV1(raw: unknown): HeygenStyleReceiptV1 {
  const parsed = receiptSchema.safeParse(raw);
  if (!parsed.success || new Set(parsed.data.childLookIds).size !== parsed.data.childLookIds.length) return videoErrorV1('VIDEO_STYLE_RECEIPT_INVALID', 409);
  return parsed.data;
}
export function heygenStyleImageUrlV1(raw: unknown): string {
  try {
    if (typeof raw !== 'string' || raw.length > 8192) throw new Error();
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
    return raw;
  } catch { return videoErrorV1('VIDEO_STYLE_IMAGE_UNAVAILABLE', 409); }
}
export function heygenStyleRawResponseV1(raw: Record<string, unknown>): Record<string, unknown> {
  const bytes = JSON.stringify(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !bytes || bytes.length > 1024 * 1024)
    return videoErrorV1('VIDEO_STYLE_RECEIPT_INVALID', 409);
  return JSON.parse(bytes);
}
