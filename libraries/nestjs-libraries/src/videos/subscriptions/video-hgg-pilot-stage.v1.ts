import { z } from 'zod';
import type { HggPilotQuoteInputV1, HggPilotQuoteRequestV1 } from './video-hgg-pilot-quote.v1';
import { subscriptionHash } from './video-provider-registry';
import type { HggExecutionCredentialsV2 } from './video-hgg-pilot-credentials.v2';
export const HGG_PILOT_STAGE_KIND_V1 = 'hgg-pilot-stage/v1' as const;
export const HggPilotStageSchemaV1 = z.enum(['first_frame', 'last_frame', 'clip']);
export type HggPilotStageV1 = z.infer<typeof HggPilotStageSchemaV1>;
const id = z.string().min(1).max(512).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const decimal = z.string().regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/).refine(v => Number(v) > 0);
export const HggPilotAuthorizationSchemaV1 = z.object({id, unit: z.literal('higgsfield_credit'), pilotLimit: decimal, stageLimit: decimal,
  stages: z.array(HggPilotStageSchemaV1).min(1).max(3).refine(v => new Set(v).size === v.length), funding: z.literal('credits')}).strict();
export type HggPilotAuthorizationV1 = z.infer<typeof HggPilotAuthorizationSchemaV1>;
export interface HggPilotWorkspaceBindingV1 {
  version: 1; connectionId: string; accountGeneration: number; tokenVersion: number; workspaceId: string;
  bindingHash: string; qualificationId: string; observedAt: string; context: 'observed_private_owner'; atomicBillingProof: false;
}
export interface HggPilotExpectedV1 {
  action: 'quote' | 'admit' | 'submit'; organizationId: string; actorId: string; stage: HggPilotStageV1;
  input: HggPilotQuoteInputV1; publicOutputLocale: string; requestHash: string; modelBindingHash: string;
  settingsHash: string; inputOrderDigest: string; workspaceBindingHash: string; approvalHash?: string;
}
/** Server-issued by the exact current native parent, never accepted from tool input. */
export interface HggPilotLastFrameRepairAuthorizationV1 {
  version: 1; repairId: string; intentId: string; previousJobId: string; previousPreflightId: string;
  previousRequestHash: string; requestHash: string; authorizationId: string; bindingDigest: string;
}
export interface HggPilotParentAssertionV1 {authorization: HggPilotAuthorizationV1 | null; lastFrameRepair?: HggPilotLastFrameRepairAuthorizationV1}
export interface HggPilotFrameReceiptV1 {
  jobId: string; ownedMediaId: string; byteSha256: string; providerJobId: string; workspaceBindingHash: string;
}
export interface HggPilotStagePreparationV1 {
  intentId: string; connectionId: string; accountGeneration: number; workspaceQualificationId: string;
  publicOutputLocale: string; input: HggPilotQuoteInputV1; references: HggPilotFrameReceiptV1[];
}
export interface HggPilotWorkspacePreparationV1 {
  intentId: string; pilotId: string; parentRevision: number; connectionId: string; accountGeneration: number;
  workspaceId: string; selectionAuthorizationId?: string;
}
export interface HggPilotStageSettledV1 {
  eventId: string; organizationId: string; actorId: string; pilotId: string; stage: HggPilotStageV1; jobId: string;
}
export const HGG_PILOT_SERVICE_V1 = Symbol('HGG_PILOT_SERVICE_V1');
export interface HggPilotServicePortV1 {
  discoverWorkspace(org: string, actor: string, input: Pick<HggPilotWorkspacePreparationV1, 'intentId' | 'pilotId' | 'parentRevision' | 'selectionAuthorizationId'>): Promise<HggPilotWorkspaceBindingV1>;
  qualifyWorkspace(org: string, actor: string, input: HggPilotWorkspacePreparationV1): Promise<HggPilotWorkspaceBindingV1>;
  quote(org: string, actor: string, input: HggPilotStagePreparationV1): Promise<HggPilotStagePublicV1>;
  /** Separate intent; frames/references must be empty. Never paid-admissible. */
  quotePlanningClip(org: string, actor: string, input: HggPilotStagePreparationV1): Promise<HggPilotStagePublicV1>;
  read(org: string, actor: string, preflightId: string): Promise<HggPilotStagePublicV1>;
  getByIntent(org: string, actor: string, intentId: string): Promise<HggPilotStagePublicV1 | null>;
  admit(org: string, actor: string, preflightId: string, approvalHash: string): Promise<HggPilotStagePublicV1>;
  recover(org: string, actor: string, preflightId: string, action: HggPilotRecoveryActionV1): Promise<HggPilotStagePublicV1>;
  /** Server-only, never projected by the native HTTP reader. */
  frameReceipt(org: string, actor: string, preflightId: string): Promise<HggPilotFrameReceiptV1 & {connectionId: string; accountGeneration: number; providerMediaId: string}>;
}
export interface HggPilotStoredStageV1 {
  kind: typeof HGG_PILOT_STAGE_KIND_V1; version: 1; stage: HggPilotStageV1; publicOutputLocale: string;
  compiled: HggPilotQuoteRequestV1; workspace: HggPilotWorkspaceBindingV1; references: HggPilotFrameReceiptV1[];
  requestHash: string; capturedAt: string; localAdmissionExpiresAt: string;
  planningOnly?: boolean;
  executionCredentials?: HggExecutionCredentialsV2;
}
export type HggPilotStageStateV1 = 'quote_pending' | 'quote_failed' | 'awaiting_budget' | 'awaiting_approval' | 'ready' |
  'accepted' | 'submitting' | 'submission_unknown' | 'queued' | 'running' | 'saving' | 'saved' | 'save_failed' |
  'status_delayed' | 'reauth_required' | 'access_unavailable' | 'input_changed' | 'canceled' | 'failed';
export type HggPilotRecoveryActionV1 = 'status_read' | 'retry_save';
export interface HggPilotOwnedResultV1 {
  ownedMediaId: string; path: string; mime: string; width: number; height: number; byteSha256: string; durationSeconds?: number;
}
/** A projects this under its existing native parent; no raw provider/credential/workspace/model IDs. */
export interface HggPilotStagePublicV1 {
  version: 1; pilotId: string; stage: HggPilotStageV1; preflightId: string; jobId?: string; state: HggPilotStageStateV1;
  bindingHash: string; approvalHash: string | null; canSubmit: boolean; localInputValidated: boolean; validationSource: 'cf_owned_source_and_assets';
  blockers: string[]; recoveryActions: HggPilotRecoveryActionV1[];
  quote: null | {amount: string; unit: 'higgsfield_credit'; source: 'provider'; capturedAt: string; observationSource: 'local_receive_clock';
    providerInputValidated: false; localAdmissionExpiresAt: string; providerBillingCap: false};
  ownerLimit: null | {authorizationId: string; unit: 'higgsfield_credit'; pilotLimit: string; stageLimit: string;
    includedStages: HggPilotStageV1[]; authorized: true; reserved: string; remaining: string; remainingSource: 'local_authorization'; actualChargeUnknown: boolean};
  cost: {amount: string | null; unit: 'higgsfield_credit'; certainty: 'unknown' | 'provider_confirmed' | 'owner_reconciled'};
  result: HggPilotOwnedResultV1 | null; errorCode: string | null;
}
export function hggPilotStageOfV1(input: HggPilotQuoteInputV1): HggPilotStageV1 {
  return input.kind === 'video' ? 'clip' : input.slot === 'first' ? 'first_frame' : 'last_frame';
}
export function hggPilotExpectedV1(stage: HggPilotStoredStageV1, org: string, actor: string, action: HggPilotExpectedV1['action'], approvalHash?: string): HggPilotExpectedV1 {
  return {action, organizationId: org, actorId: actor, stage: stage.stage, input: stage.compiled.input, publicOutputLocale: stage.publicOutputLocale,
    requestHash: stage.requestHash, modelBindingHash: stage.compiled.modelBindingHash, settingsHash: stage.compiled.settingsHash,
    inputOrderDigest: stage.compiled.inputOrderDigest, workspaceBindingHash: stage.workspace.bindingHash, ...(approvalHash ? {approvalHash} : {})};
}
export const hggPilotApprovalHashV1 = (stage: HggPilotStoredStageV1, quoteHash: string, authorization: HggPilotAuthorizationV1) =>
  subscriptionHash({requestHash: stage.requestHash, quoteHash, authorization, localAdmissionExpiresAt: stage.localAdmissionExpiresAt, ...(stage.executionCredentials ? {executionBindingHash: stage.executionCredentials.executionBindingHash} : {})});
