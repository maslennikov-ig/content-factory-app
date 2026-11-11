import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import type { VideoSettingsV1 } from '../video-provider.v1';
import type { SubscriptionEndpoint } from './video-provider-registry';
import { subscriptionHash } from './video-provider-registry';
import { HEYGEN_AVATAR_NATIVE_KIND_V1, heygenAvatarWireArgsV1 } from './video-heygen-avatar-native.v1';
import type { VideoMcpClient, VideoTokenGuard } from './video-mcp-client';

export const HEYGEN_NATIVE_REQUEST_KIND_V1 = HEYGEN_AVATAR_NATIVE_KIND_V1;
export const isHeygenNativeRequestV1 = (value: any): boolean => value?.kind === HEYGEN_NATIVE_REQUEST_KIND_V1;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/);
const nativeRequest = z.object({
  kind: z.literal(HEYGEN_NATIVE_REQUEST_KIND_V1), args: z.record(z.unknown()),
  subjectDigest: digest, schemaDigest: digest, requestHash: digest,
  accountGeneration: z.number().int().positive(), tokenVersion: z.number().int().positive(),
  account: z.object({subjectDigest: digest, billingType: z.literal('subscription'), plan: z.string().min(1).max(80), remaining: amount, resetAt: z.string().datetime().nullable()}).strict(),
  selection: z.object({avatar: z.string().min(1).max(120), voice: z.string().min(1).max(120), groupId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)}).strict(),
  quote: z.object({amount: z.null(), unit: z.literal('heygen_credit'), source: z.literal('unavailable'), asOf: z.string().datetime(), expiresAt: z.string().datetime(), upperBound: z.null()}).strict(),
}).strict();
export type HeygenNativeRequestV1 = z.infer<typeof nativeRequest>;
export const heygenNativeRequestHashV1 = ({requestHash, ...request}: any) => subscriptionHash(request);
export function parseHeygenNativeRequestV1(value: unknown): HeygenNativeRequestV1 {
  const parsed = nativeRequest.safeParse(value);
  if (!parsed.success || parsed.data.subjectDigest !== parsed.data.account.subjectDigest ||
    parsed.data.requestHash !== heygenNativeRequestHashV1(parsed.data)) return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  const args = heygenAvatarWireArgsV1(parsed.data.args);
  if (subscriptionHash(args) !== subscriptionHash(parsed.data.args)) return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  return parsed.data;
}

/** Catalog visibility and consent are independent checks; neither an engine list nor a language tag alone proves rendering. */
export async function heygenNativeOwnedSelectionV1(mcp: VideoMcpClient, def: SubscriptionEndpoint, token: string,
  settings: VideoSettingsV1, guard: VideoTokenGuard) {
  const owned = await mcp.readHeygenOwnedCatalog(def, token, guard);
  const avatar = owned.catalog.avatars.find(entry => entry.id === settings.avatarId);
  const voice = owned.catalog.voices.find(entry => entry.id === settings.voiceId);
  if (!avatar || !voice || !avatar.selectableForDraft || ['failed', 'training'].includes(avatar.state) ||
    !avatar.engines.includes(settings.engine!) || voice.state !== 'available' || !avatar.groupId)
    return videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
  const group = await mcp.readHeygenOwnedAvatarGroup(def, token, {avatarId: avatar.id, groupId: avatar.groupId}, guard);
  if (!['accepted', 'not_applicable'].includes(group.consentState)) return videoErrorV1('VIDEO_AVATAR_CONSENT_UNVERIFIED', 409);
  await guard();
  return {avatar: avatar.name, voice: voice.name, groupId: avatar.groupId};
}
