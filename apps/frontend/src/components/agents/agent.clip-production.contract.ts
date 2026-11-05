import { z } from 'zod';

// Browser projection of native-clip-production.v1 / HggPilotStagePublicV1.
// Keep provider internals and execution authority out of presentation decisions.
export const clipStages = ['first_frame', 'last_frame', 'clip'] as const;
const stage = z.enum(clipStages);
const id = z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const amount = z.string().regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/);
const positiveAmount = amount.refine(value => /[1-9]/.test(value));
const unit = z.literal('higgsfield_credit');
const stages = z.array(stage).max(3).refine(values => new Set(values).size === values.length);
const model = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const blockers = z.array(z.string().min(1).max(3000)).max(30);
const mediaPath = z.string().min(1).max(4096).refine(value => {
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
});
const ownedResult = z.object({
  ownedMediaId: id, path: mediaPath, mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']),
  width: z.number().int().positive().max(32768), height: z.number().int().positive().max(32768), byteSha256: hash,
  durationSeconds: z.number().positive().finite().optional(),
});
const stageSchema = z.object({
  version: z.literal(1), pilotId: id, stage, preflightId: id, jobId: id.optional(),
  state: z.enum(['quote_pending', 'quote_failed', 'awaiting_budget', 'awaiting_approval', 'ready', 'accepted', 'submitting', 'submission_unknown', 'input_changed', 'queued', 'running', 'saving', 'saved', 'save_failed', 'status_delayed', 'reauth_required', 'access_unavailable', 'canceled', 'failed']),
  bindingHash: hash, approvalHash: hash.nullable(), canSubmit: z.boolean(), localInputValidated: z.boolean(), validationSource: z.literal('cf_owned_source_and_assets'),
  blockers, recoveryActions: z.array(z.enum(['status_read', 'retry_save'])).max(2),
  quote: z.object({amount, unit, source: z.literal('provider'), capturedAt: z.string().datetime(), observationSource: z.literal('local_receive_clock'),
    providerInputValidated: z.literal(false), localAdmissionExpiresAt: z.string().datetime(), providerBillingCap: z.literal(false)}).nullable(),
  ownerLimit: z.object({authorizationId: id, unit, pilotLimit: positiveAmount, stageLimit: positiveAmount, includedStages: stages,
    authorized: z.literal(true), reserved: amount, remaining: amount, remainingSource: z.literal('local_authorization'), actualChargeUnknown: z.boolean()}).nullable(),
  cost: z.object({amount: amount.nullable(), unit, certainty: z.enum(['unknown', 'provider_confirmed', 'owner_reconciled'])}),
  result: ownedResult.nullable(), errorCode: z.string().min(1).max(128).nullable(),
}).refine(value => !value.result || (value.stage === 'clip' ? value.result.mime.startsWith('video/') : value.result.mime.startsWith('image/')));
const visionSchema = z.object({
  state: z.enum(['not_started', 'running', 'captured', 'reviewed', 'needs_input', 'uncertain', 'stale']), current: z.boolean(), inputKind: z.literal('image_bytes'),
  selectedModel: model, actualModel: model.nullable(), sourceContentDigest: hash, scenarioDigest: hash, acceptedTextReviewDigest: hash, inputDigest: hash,
  frames: z.array(z.object({slot: z.enum(['first', 'last']), ownedMediaId: id, byteSha256: hash})).max(2), verdict: z.enum(['accept', 'blocked']).nullable(),
  findings: z.array(z.object({category: z.enum(['continuity', 'composition', 'public_text', 'source', 'feasibility', 'rights']), detail: z.string().min(1).max(3000)})).max(30), blocker: z.string().min(1).max(128).nullable(),
});
const productionSchema = z.object({
  executionV2: z.object({version: z.literal(2), mode: z.enum(['review', 'autopilot']), referenceApproval: z.object({
    state: z.enum(['not_ready', 'awaiting_approval', 'approved', 'stale']), referenceDigest: hash.nullable(), canApprove: z.boolean(),
  })}).optional(),
  version: z.literal(1), outputLocale: z.string().min(1).max(60), stages: z.array(stageSchema).max(3), visionReview: visionSchema.nullable(),
  lastFrameRepair: z.object({
    id, current: z.boolean(), state: z.enum(['preparing', 'awaiting_approval', 'approved', 'vision_pending', 'reviewed', 'blocked']),
    reason: z.string().min(1).max(90030), approved: z.boolean(), canApprove: z.boolean(),
    preflightId: id.nullable(), approvalHash: hash.nullable(), quote: stageSchema.innerType().shape.quote, remaining: amount.nullable(),
  }).optional(),
  settings: z.object({
    image: z.object({variant: z.enum(['flare', 'sunburst']), quality: z.enum(['low', 'medium', 'high', 'xhigh', 'max']), resolution: z.enum(['1k', '2k', '4k']), background: z.enum(['auto', 'opaque', 'transparent']).optional()}),
    video: z.object({resolution: z.enum(['720p', '1080p']), durationSeconds: z.literal(5), aspectRatio: z.literal('9:16')}),
  }).optional(),
  authorization: z.object({state: z.enum(['missing', 'awaiting_answer', 'authorized', 'stale']), unit, pilotLimit: positiveAmount.nullable(), includedStages: stages, executionApproved: z.boolean(),
    limitSource: z.enum(['owner_entered', 'owner_delegated_necessary_one_pilot']).optional(),
    capBasis: z.object({rule: z.literal('ceil_125pct_two_first_plus_planning_clip/v1'), firstFrameQuotedCredits: amount, estimatedLastFrameCredits: amount, clipPlanningQuotedCredits: amount, lastFrameTerm: z.literal('estimate'), bufferPercent: z.literal(25)}).optional(),
  }),
  executionApproval: z.object({scope: z.literal('one_pilot'), current: z.boolean(), canApprove: z.boolean(), approved: z.boolean(), preflightId: id.nullable(), approvalHash: hash.nullable(), bindingHash: hash, includedStages: stages, laterPricesUnknown: z.literal(true), providerBillingCap: z.literal(false)}),
  blockers,
});
export type AgentClipProduction = z.infer<typeof productionSchema>;
export type AgentClipProductionStage = z.infer<typeof stageSchema>;
const approvalScopeSchema = z.union([z.object({pilotId: id, preflightId: id, approvalHash: hash}).strict(), z.object({pilotId: id, referenceDigest: hash}).strict()]);
export type AgentClipPilotApprovalScope = {pilotId: string; preflightId: string; approvalHash: string} | {pilotId: string; referenceDigest: string};
export const readClipPilotApprovalScope = (value: unknown): AgentClipPilotApprovalScope | null => {
  const parsed = approvalScopeSchema.safeParse(value);
  return parsed.success ? parsed.data as AgentClipPilotApprovalScope : null;
};
export function readClipProduction(value: unknown, pilotId: string, outputLocale: string): AgentClipProduction | null {
  const parsed = productionSchema.safeParse(value);
  if (!parsed.success || parsed.data.outputLocale !== outputLocale || parsed.data.stages.some(item => item.pilotId !== pilotId) || new Set(parsed.data.stages.map(item => item.stage)).size !== parsed.data.stages.length) return null;
  return parsed.data;
}
export function clipPilotApprovalCurrent(production: AgentClipProduction, scope: AgentClipPilotApprovalScope): boolean {
  if ('referenceDigest' in scope) {
    const refs = production.executionV2?.referenceApproval, vision = production.visionReview;
    return production.executionV2?.mode === 'review' && production.authorization.state === 'authorized' &&
      refs?.state === 'awaiting_approval' && refs.canApprove && refs.referenceDigest === scope.referenceDigest &&
      !!vision?.current && vision.verdict === 'accept' && !!vision.actualModel && !vision.findings.length && !vision.blocker &&
      ['first', 'last'].every(slot => {
        const frame = vision.frames.find(f => f.slot === slot), saved = production.stages.find(s => s.stage === (slot === 'first' ? 'first_frame' : 'last_frame'));
        return frame && saved?.state === 'saved' && saved.result?.ownedMediaId === frame.ownedMediaId && saved.result.byteSha256 === frame.byteSha256;
      });
  }
  const approval = production.executionApproval;
  if (production.authorization.limitSource === 'owner_delegated_necessary_one_pilot' && (!production.settings || !production.authorization.capBasis)) return false;
  return production.authorization.state === 'authorized' && production.authorization.pilotLimit !== null &&
    approval.current && approval.canApprove && !approval.approved && approval.preflightId === scope.preflightId && approval.approvalHash === scope.approvalHash &&
    clipStages.every(stage => approval.includedStages.includes(stage) && production.authorization.includedStages.includes(stage));
}
export const clipPilotApprovalReadKey = (scope: AgentClipPilotApprovalScope | undefined, threadId: string | null | undefined, orgId: string | undefined, actorId: string | undefined): string | null =>
  scope && threadId && orgId && actorId ? JSON.stringify([orgId, actorId, threadId, scope.pilotId, ...('referenceDigest' in scope ? ['references-v2', scope.referenceDigest] : [scope.preflightId, scope.approvalHash])]) : null;
