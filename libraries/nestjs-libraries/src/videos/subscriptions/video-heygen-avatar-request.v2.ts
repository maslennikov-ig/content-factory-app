import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { HEYGEN_NATIVE_REQUEST_KIND_V1, parseHeygenNativeRequestV1 } from './video-heygen-avatar-admission.v1';
import { HEYGEN_SETTINGS_SCHEMA_V2, parseHeygenVideoRecipeV2, type HeygenVideoRecipeV2 } from './video-heygen-settings.v2';

export const HEYGEN_NATIVE_REQUEST_KIND_V2 = 'heygen-personal-avatar-request/v2' as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const request = z.object({kind: z.literal(HEYGEN_NATIVE_REQUEST_KIND_V2), args: z.record(z.unknown()), recipe: z.unknown(),
  subjectDigest: digest, schemaDigest: digest, requestHash: digest, accountGeneration: z.number().int().positive(), tokenVersion: z.number().int().positive(),
  account: z.object({subjectDigest: digest, billingType: z.literal('subscription'), plan: z.string().min(1).max(80),
    remaining: z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/), resetAt: z.string().datetime().nullable()}).strict(),
  selection: z.object({avatar: z.string().min(1).max(120), voice: z.string().min(1).max(120), groupId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)}).strict(),
  quote: z.object({amount: z.null(), unit: z.literal('heygen_credit'), source: z.literal('unavailable'), asOf: z.string().datetime(), expiresAt: z.string().datetime(), upperBound: z.null()}).strict(),
}).strict();
export const isHeygenAvatarRequest = (value: any): boolean => [HEYGEN_NATIVE_REQUEST_KIND_V1, HEYGEN_NATIVE_REQUEST_KIND_V2].includes(value?.kind);
export const heygenAvatarRequestHash = ({requestHash, ...value}: any) => subscriptionHash(value);
export function parseHeygenAvatarRequest(value: unknown) {
  if ((value as any)?.kind === HEYGEN_NATIVE_REQUEST_KIND_V1) return parseHeygenNativeRequestV1(value);
  const parsed = request.safeParse(value);
  if (!parsed.success || parsed.data.requestHash !== heygenAvatarRequestHash(parsed.data)) return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  const v = parsed.data, recipe = parseHeygenVideoRecipeV2(v.recipe);
  if (v.subjectDigest !== v.account.subjectDigest || v.subjectDigest !== recipe.binding.subjectDigest ||
    v.accountGeneration !== recipe.binding.accountGeneration || v.schemaDigest !== HEYGEN_SETTINGS_SCHEMA_V2 ||
    subscriptionHash(v.args) !== subscriptionHash(recipe.args) || v.selection.groupId !== recipe.settings.groupId)
    return videoErrorV1('VIDEO_PERSONAL_REQUEST_INVALID', 409);
  return {...v, recipe} as Omit<z.infer<typeof request>, 'recipe'> & {recipe: HeygenVideoRecipeV2};
}

/** Pure byte-preservation guard shared by admission and the durable worker. */
export function assertHeygenRecipeSnapshotV2(request: ReturnType<typeof parseHeygenAvatarRequest>, settings: any, brief: any) {
  if (request.kind !== HEYGEN_NATIVE_REQUEST_KIND_V2) return;
  if (subscriptionHash(settings.heygenV2) !== subscriptionHash({binding: request.recipe.binding, settings: request.recipe.settings}) ||
    request.recipe.speech !== brief.script)
    return videoErrorV1('VIDEO_PREFLIGHT_STALE', 409);
}
