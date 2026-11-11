import { z } from 'zod';
import type { SocialFactoryStoreV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { HeygenPerformanceValuesSchemaV1, HEYGEN_PERFORMANCE_KEYS_V1 } from './video-heygen-performance.v1';

export const HEYGEN_PERFORMANCE_KIND_V1 = 'heygen_performance_plan' as const;
export const heygenPerformanceRecordIdV1 = (actor: string, draftId: string) => `heygen-performance:${subscriptionHash([actor, draftId])}`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const field = z.enum(HEYGEN_PERFORMANCE_KEYS_V1);
export const HEYGEN_PERFORMANCE_FEEDBACK_KIND_V1 = 'heygen_performance_feedback' as const;
export const HeygenPerformanceFeedbackIdSchemaV1 = z.string().regex(/^heygen-performance-feedback:[a-f0-9]{64}$/);
export const HeygenPerformanceFeedbackFragmentSchemaV1 = z.object({start: z.number().int().nonnegative(),
  end: z.number().int().positive(), exactText: z.string().min(1).max(1500)}).strict();
export const HeygenPerformanceFeedbackRenderSchemaV1 = z.object({jobId: z.string().uuid(),
  startMs: z.number().int().nonnegative().safe().optional(), endMs: z.number().int().positive().safe().optional()}).strict();
const feedbackRenderRecord = HeygenPerformanceFeedbackRenderSchemaV1.extend({mediaId: z.string().uuid(), receiptDigest: digest,
  requestDigest: digest, durationMs: z.number().int().positive().safe().nullable()}).strict();
export const HeygenPerformanceFeedbackRecordSchemaV1 = z.object({type: z.literal('heygen_performance_feedback/v1'),
  actorId: z.string().min(1), draftId: z.string().uuid(), draftVersion: z.number().int().positive(),
  planDigest: digest.nullable(), sourceRevision: z.string().min(1).optional(), scriptDigest: digest.optional(), text: z.string().min(1).max(1500),
  fragment: HeygenPerformanceFeedbackFragmentSchemaV1.nullable(), render: feedbackRenderRecord.optional(),
}).strict();
export type HeygenPerformanceFeedbackRecordV1 = z.infer<typeof HeygenPerformanceFeedbackRecordSchemaV1>;
export type HeygenPerformanceFeedbackViewV1 = {
  draftId: string;
  draftVersion: number;
  revision: number;
  target: {kind: 'draft'; draftVersion: number} | {kind: 'render'; draftVersion: number; jobId: string; durationMs: number | null};
  observations: Array<{id: string; draftVersion: number; text: string; createdAt: string;
    fragment: HeygenPerformanceFeedbackRecordV1['fragment']; render: z.infer<typeof HeygenPerformanceFeedbackRenderSchemaV1> | null}>;
};
export const HeygenPerformanceWishResolutionSchemaV1 = z.object({wishDigest: digest,
  fields: z.array(field).min(1).max(HEYGEN_PERFORMANCE_KEYS_V1.length).refine(keys => new Set(keys).size === keys.length && !keys.includes('wish') && !keys.includes('context')),
  rationale: z.string().min(1).max(700).refine(value => value.trim().length > 0)}).strict();
export const HeygenPerformanceRecordSchemaV1 = z.object({
  type: z.literal('heygen_performance_plan/v1'), actorId: z.string().min(1), draftId: z.string().uuid(), draftVersion: z.number().int().positive(),
  sourceRevision: z.string().min(1), scriptDigest: digest, settingsDigest: digest,
  profileId: z.string().min(1), profileDigest: digest, connectionId: z.string().uuid(), accountGeneration: z.number().int().positive(),
  values: HeygenPerformanceValuesSchemaV1, lockedFields: z.array(field).max(7),
  origins: z.record(z.enum(['assistant', 'manual', 'default'])),
  rationale: z.string().max(700).default(''),
  feedbackId: HeygenPerformanceFeedbackIdSchemaV1.optional(),
  requiredFields: z.array(field).max(HEYGEN_PERFORMANCE_KEYS_V1.length),
  wishResolution: HeygenPerformanceWishResolutionSchemaV1.extend({valuesDigest: digest}).strict().optional(),
  limitations: z.array(z.object({field: z.string().max(80), code: z.string().max(100), message: z.string().max(700)}).strict()).max(20),
  applied: z.boolean(), planDigest: digest,
}).strict();
export type HeygenPerformanceRecordV1 = z.infer<typeof HeygenPerformanceRecordSchemaV1>;
export const heygenPerformancePlanDigestV1 = ({planDigest, ...record}: Omit<HeygenPerformanceRecordV1, 'planDigest'> & {planDigest?: string}) => subscriptionHash(record);
export const heygenPerformanceMatchesDraftV1 = (record: HeygenPerformanceRecordV1, draft: any) => {
  const b = draft.settings?.heygenV2?.binding;
  return record.draftId === draft.id && record.draftVersion === draft.version && record.sourceRevision === draft.pieceRevision &&
    record.scriptDigest === subscriptionHash(draft.brief?.script) && record.settingsDigest === subscriptionHash(draft.settings) &&
    b?.profileId === record.profileId && b?.profileDigest === record.profileDigest && b?.connectionId === record.connectionId && b?.accountGeneration === record.accountGeneration;
};
export function heygenPerformanceRequiredLimitationsV1(record: HeygenPerformanceRecordV1) {
  const locked = new Set([...record.lockedFields, ...record.requiredFields]);
  return record.limitations.filter(item => locked.has(item.field as any) ||
    ['motionPrompt', 'motion', 'durationSeconds'].includes(item.field) && (locked.has('gaze') || locked.has('gestures')));
}
/** New plans gate only their bound draft; historical jobs/requests are never reinterpreted. */
export async function assertHeygenPerformanceDraftV1(store: SocialFactoryStoreV1 | undefined, org: string, actor: string, draft: any): Promise<void> {
  if (!store || !draft.settings?.heygenV2) return;
  const row = await store.read<unknown>(org, HEYGEN_PERFORMANCE_KIND_V1, heygenPerformanceRecordIdV1(actor, draft.id));
  if (!row) return;
  const p = HeygenPerformanceRecordSchemaV1.safeParse(row.payload);
  if (!p.success || row.parentId !== `heygen-performance:actor:${actor}` || p.data.actorId !== actor || p.data.planDigest !== heygenPerformancePlanDigestV1(p.data) || !heygenPerformanceMatchesDraftV1(p.data, draft))
    return videoErrorV1('VIDEO_PERFORMANCE_PLAN_STALE', 409);
  if (heygenPerformanceRequiredLimitationsV1(p.data).length) return videoErrorV1('VIDEO_PERFORMANCE_CUE_UNAVAILABLE', 409);
}
