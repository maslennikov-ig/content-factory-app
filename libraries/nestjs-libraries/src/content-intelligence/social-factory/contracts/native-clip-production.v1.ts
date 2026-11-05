import { z } from 'zod';
import type { HggPilotStagePublicV1, HggPilotStageV1, HggPilotAuthorizationV1, HggPilotWorkspaceBindingV1, HggPilotStagePreparationV1 } from '../../../videos/subscriptions/video-hgg-pilot-stage.v1';
import type { ClipModelAuditV1 } from './native-clip-preproduction.v1';
import type { HggCredentialRenewalRequestV2, HggExecutionCredentialsV2 } from '../../../videos/subscriptions/video-hgg-pilot-credentials.v2';
/** Private owned-asset receipt fields; these never enter the public card. */
export interface ClipPilotFrameAssetV1 {slot: 'first' | 'last'; ownedMediaId: string; byteSha256: string; providerMediaId: string; connectionId: string; accountGeneration: number}
type FirstFrameAsset = ClipPilotFrameAssetV1 & {slot: 'first'};
type LastFrameAsset = ClipPilotFrameAssetV1 & {slot: 'last'};

export const CLIP_PRODUCTION_VERSION_V1 = 1 as const;
export const NATIVE_CLIP_PRODUCTION_PORT_V1 = Symbol('NATIVE_CLIP_PRODUCTION_PORT_V1');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(128);
export const clipProductionPrepareV1 = z.object({pilotId: id}).strict();
export const clipProductionLaunchV1 = z.object({pilotId: id, preflightId: id, approvalHash: hash}).strict();
export const clipProductionBudgetQuestionV1 = z.object({question: z.string().min(1), options: z.array(z.never()).length(0),
  questionPurpose: z.literal('fact'), canDecideForPerson: z.literal(false)}).strict();
export const clipProductionBudgetAnswerV1 = z.object({answer: z.string().trim().regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/).refine(value => Number(value) > 0)}).strict();
export const clipProductionRecoverV1 = z.object({pilotId: id, stage: z.enum(['first_frame', 'last_frame', 'clip']), action: z.enum(['status_read', 'retry_save'])}).strict();
export const clipLastFrameRepairLaunchV1 = clipProductionLaunchV1.extend({repairId: id}).strict();
export const clipLastFrameRepairRefreshV1 = clipProductionPrepareV1.extend({repairId: id}).strict();
export const clipVisionFindingV1 = z.object({ category: z.enum(['continuity', 'composition', 'public_text', 'source', 'feasibility', 'rights']), detail: z.string().min(1).max(3000) }).strict();
export const clipVisionVerdictV1 = z.object({
  inputDigest: hash, sourceContentDigest: hash, scenarioDigest: hash, acceptedTextReviewDigest: hash,
  frameDigests: z.tuple([z.object({slot: z.literal('first'), byteSha256: hash}).strict(), z.object({slot: z.literal('last'), byteSha256: hash}).strict()]),
  verdict: z.enum(['accept', 'blocked']), findings: z.array(clipVisionFindingV1).max(30),
}).strict();
export type ClipVisionVerdictV1 = z.infer<typeof clipVisionVerdictV1>;
export interface ClipFrameReviewRefV1 {slot: 'first' | 'last'; ownedMediaId: string; byteSha256: string}
export type ClipVisionStateV1 = 'not_started' | 'running' | 'captured' | 'reviewed' | 'needs_input' | 'uncertain' | 'stale';
export interface ClipVisionReviewPublicV1 {
  state: ClipVisionStateV1; current: boolean; inputKind: 'image_bytes'; selectedModel: string; actualModel: string | null;
  sourceContentDigest: string; scenarioDigest: string; acceptedTextReviewDigest: string; inputDigest: string;
  frames: ClipFrameReviewRefV1[]; verdict: 'accept' | 'blocked' | null;
  findings: z.infer<typeof clipVisionFindingV1>[]; blocker: string | null;
}
/** Current owned projection under the existing native preproduction read. No provider IDs/raw prompts. */
export interface ClipProductionPublicV1 {
  executionV2?: import('./native-clip-execution.v2').ClipExecutionPublicV2;
  version: 1; outputLocale: string; stages: HggPilotStagePublicV1[]; visionReview: ClipVisionReviewPublicV1 | null;
  settings?: {image: ClipProductionV1['imageSettings']; video: {resolution: '720p' | '1080p'; durationSeconds: 5; aspectRatio: '9:16'}};
  authorization: {state: 'missing' | 'awaiting_answer' | 'authorized' | 'stale'; unit: 'higgsfield_credit';
    pilotLimit: string | null; includedStages: HggPilotStageV1[]; executionApproved: boolean;
    limitSource?: 'owner_entered' | 'owner_delegated_necessary_one_pilot'; capBasis?: ClipDelegatedCapPublicBasisV1};
  executionApproval: {scope: 'one_pilot'; current: boolean; canApprove: boolean; approved: boolean;
    preflightId: string | null; approvalHash: string | null; bindingHash: string; includedStages: HggPilotStageV1[];
    laterPricesUnknown: true; providerBillingCap: false};
  blockers: string[];
  credentialRenewal?: {state: 'pending' | 'completed'; requiresFreshQuote: true};
  lastFrameRepair?: {id: string; current: boolean; state: ClipLastFrameRepairV1['state']; reason: string; approved: boolean; canApprove: boolean;
    preflightId: string | null; approvalHash: string | null; quote: HggPilotStagePublicV1['quote']; remaining: string | null};
}

export interface ClipVisionCheckpointV1 {
  state: Exclude<ClipVisionStateV1, 'stale'>; inputDigest: string; sourceContentDigest: string; scenarioDigest: string;
  acceptedTextReviewDigest: string; frames: ClipFrameReviewRefV1[]; selectedModel: string; selectedProvider?: 'openai' | 'openrouter';
  startedAt?: string; leaseUntil?: string; raw?: string; audit?: ClipModelAuditV1; result?: ClipVisionVerdictV1; blocker?: string;
  recoveryV1?: {priorState: 'captured' | 'needs_input'; priorBlocker: string | null; rawSha256: string; requestMessageId: string; validation: 'fenced_json_bound_v1'};
}
export interface ClipDelegatedCapPublicBasisV1 {
  rule: 'ceil_125pct_two_first_plus_planning_clip/v1'; firstFrameQuotedCredits: string;
  estimatedLastFrameCredits: string; clipPlanningQuotedCredits: string; lastFrameTerm: 'estimate'; bufferPercent: 25;
}
export interface ClipDelegatedQuoteReceiptV1 {preflightId: string; bindingHash: string; amount: string; capturedAt: string; inputDigest: string}
export interface ClipDelegatedCapBasisV1 {
  contextDigest: string; rule: ClipDelegatedCapPublicBasisV1['rule'];
  firstFrame: ClipDelegatedQuoteReceiptV1; clipPlanning: ClipDelegatedQuoteReceiptV1;
  lastFrameTerm: 'estimate_same_as_first';
}
export interface ClipPilotExecutionApprovalV1 {contextDigest: string; preflightId: string; approvalHash: string}
export type ClipPilotAuthorizationBindingV1 = {
  value: HggPilotAuthorizationV1; contextDigest: string; executionApproval?: ClipPilotExecutionApprovalV1;
} & ({source?: 'owner_entered'; ownerAnswer: string; cardId: string; requestMessageId: string; toolCallId: string}
  | {source: 'delegated_quote_bound'; requestMessageId: string; rawOwnerInstruction: string; basis: ClipDelegatedCapBasisV1; basisDigest: string});
export interface ClipProductionV1 {
  executionV2?: import('./native-clip-execution.v2').ClipExecutionPolicyV2;
  version: 1; contextDigest: string; request: {messageId: string; text: string}; outputLocale: string;
  connectionId?: string; accountGeneration?: number; workspace?: HggPilotWorkspaceBindingV1;
  workspaceIntent?: {intentId: string; parentRevision: number; selectionAuthorizationId: string};
  imageSettings: {variant: 'flare' | 'sunburst'; quality: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; resolution: '1k' | '2k' | '4k'; background?: 'auto' | 'opaque' | 'transparent'};
  videoResolution: '720p' | '1080p';
  budgetMode?: 'owner_entered' | 'delegated_quote_bound';
  stagePlans: Partial<Record<HggPilotStageV1, HggPilotStagePreparationV1>>;
  stageSnapshots?: Partial<Record<HggPilotStageV1, HggPilotStagePublicV1>>;
  clipPlanningPlan?: HggPilotStagePreparationV1; clipPlanningQuote?: HggPilotStagePublicV1;
  firstFrame?: {receipt: import('../../../videos/subscriptions/video-hgg-pilot-stage.v1').HggPilotFrameReceiptV1;
    asset: FirstFrameAsset; path: string};
  framePair?: {receipts: [import('../../../videos/subscriptions/video-hgg-pilot-stage.v1').HggPilotFrameReceiptV1, import('../../../videos/subscriptions/video-hgg-pilot-stage.v1').HggPilotFrameReceiptV1];
    assets: [FirstFrameAsset, LastFrameAsset]; paths: [string, string]};
  stopped?: {requestMessageId: string};
  settledEvents: {eventId: string; stage: HggPilotStageV1; state: 'started' | 'applied'}[];
  authorization?: ClipPilotAuthorizationBindingV1;
  budgetQuestion?: {contextDigest: string; cardId: string; requestMessageId: string; toolCallId: string};
  vision?: ClipVisionCheckpointV1; blockers: string[];
  lastFrameRepair?: ClipLastFrameRepairV1;
  /** Credential continuity is separate from immutable V1 creative/budget context. */
  credentialRenewalsV2?: ClipCredentialRenewalV2[];
  executionCredentialsV2?: HggExecutionCredentialsV2;
}

export interface ClipCredentialRenewalV2 {
  version: 2; request: {messageId: string; text: string}; input: HggCredentialRenewalRequestV2;
  state: 'pending' | 'completed'; credentials?: HggExecutionCredentialsV2;
}

/** One separately approved corrective purchase; original paid evidence is retained. */
export interface ClipLastFrameRepairV1 {
  version: 1; id: string; pilotId: string; request: {messageId: string; text: string}; contextDigest: string; bindingDigest: string;
  firstFrameDigest: string; authorizationDigest: string; reason: string;
  previous: {plan: HggPilotStagePreparationV1; snapshot: HggPilotStagePublicV1;
    framePair: NonNullable<ClipProductionV1['framePair']>; vision: ClipVisionCheckpointV1};
  plan: HggPilotStagePreparationV1; snapshot?: HggPilotStagePublicV1;
  approval?: {preflightId: string; approvalHash: string}; promoted?: boolean;
  state: 'preparing' | 'awaiting_approval' | 'approved' | 'vision_pending' | 'reviewed' | 'blocked';
  quoteRefreshes?: {version: 1; id: string; request: {messageId: string; text: string}; repairBindingDigest: string;
    priorRefreshId?: string; executionBindingHash?: string;
    previousSnapshot: HggPilotStagePublicV1; state: 'pending' | 'completed' | 'failed'; snapshot?: HggPilotStagePublicV1; errorCode?: string;
    recoveryRequests?: {messageId: string; text: string}[]; supersededBy?: string}[];
}
