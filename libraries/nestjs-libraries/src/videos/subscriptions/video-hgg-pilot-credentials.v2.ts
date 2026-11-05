import type { HggPilotStagePreparationV1, HggPilotStagePublicV1, HggPilotFrameReceiptV1, HggPilotWorkspaceBindingV1 } from './video-hgg-pilot-stage.v1';
import { subscriptionHash } from './video-provider-registry';
import { videoErrorV1 } from '../video-brief.v1';

/** Server-only inputs, derived from the owned native parent. */
export interface HggCredentialRenewalRequestV2 {
  renewalId: string; pilotId: string; parentRevision: number; requestMessageId: string;
  originContextDigest: string; connectionId: string; accountGeneration: number;
  originWorkspace: HggPilotWorkspaceBindingV1; references: HggPilotFrameReceiptV1[];
}

export interface HggExecutionCredentialsV2 {
  version: 2; renewalId: string; pilotId: string; originContextDigest: string;
  connectionId: string; accountGeneration: number; originWorkspaceBindingHash: string;
  currentWorkspace: HggPilotWorkspaceBindingV1; retainedReferencesDigest: string;
  executionBindingHash: string;
}

export interface HggPilotCredentialsPortV2 {
  renewCredentialBindingV2(org: string, actor: string, input: HggCredentialRenewalRequestV2): Promise<HggExecutionCredentialsV2>;
  readCredentialBindingV2(org: string, actor: string, input: HggCredentialRenewalRequestV2): Promise<HggExecutionCredentialsV2 | null>;
  quoteWithCredentialsV2(org: string, actor: string, input: HggPilotStagePreparationV1, credentials: HggExecutionCredentialsV2): Promise<HggPilotStagePublicV1>;
  frameReceiptWithCredentialsV2(org: string, actor: string, preflightId: string, credentials: HggExecutionCredentialsV2): Promise<HggPilotFrameReceiptV1 & {connectionId: string; accountGeneration: number; providerMediaId: string}>;
}

/** Validate persisted provenance, never a caller-provided hash alone. */
export async function assertHggExecutionCredentialsV2(tx: any, org: string, actor: string, credentials: HggExecutionCredentialsV2, origin: HggPilotWorkspaceBindingV1, now: Date) {
  if (!credentials || credentials.version !== 2 || !credentials.currentWorkspace) return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID', 409);
  const {executionBindingHash, ...core} = credentials;
  if (subscriptionHash(core) !== executionBindingHash || credentials.connectionId !== origin.connectionId || credentials.accountGeneration !== origin.accountGeneration || credentials.originWorkspaceBindingHash !== origin.bindingHash || credentials.currentWorkspace.connectionId !== origin.connectionId || credentials.currentWorkspace.accountGeneration !== origin.accountGeneration || credentials.currentWorkspace.workspaceId !== origin.workspaceId || credentials.currentWorkspace.tokenVersion !== origin.tokenVersion + 1) return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID', 409);
  const id = subscriptionHash({kind: 'hgg-execution-credential/v2', org, actor, pilotId: credentials.pilotId, renewalId: credentials.renewalId});
  const row = await tx.videoAccessPreflight.findUnique({where: {id, organizationId: org, actorId: actor}});
  const renewalId = subscriptionHash({kind: 'hgg-same-grant-renewal/v1', connectionId: origin.connectionId, generation: origin.accountGeneration, tokenVersion: origin.tokenVersion});
  const renewal = await tx.videoAccessPreflight.findUnique({where: {id: renewalId, organizationId: org, actorId: actor}});
  const qualification = await tx.videoAccessPreflight.findUnique({where: {id: credentials.currentWorkspace.qualificationId, organizationId: org, actorId: actor}});
  if (!row || row.organizationId !== org || row.actorId !== actor || row.connectionId !== origin.connectionId || row.generation !== origin.accountGeneration || subscriptionHash(row.snapshot?.credentials) !== subscriptionHash(credentials) || renewal?.actorId !== actor || renewal?.connectionId !== origin.connectionId || renewal?.generation !== origin.accountGeneration || renewal?.snapshot?.kind !== 'hgg-same-grant-renewal/v1' || renewal.snapshot.state !== 'completed' || renewal.snapshot.fromTokenVersion !== origin.tokenVersion || renewal.snapshot.toTokenVersion !== credentials.currentWorkspace.tokenVersion || qualification?.organizationId !== org || qualification?.actorId !== actor || qualification.expiresAt <= now || qualification?.snapshot?.kind !== 'hgg-workspace/v1' || qualification.snapshot.state !== 'qualified' || subscriptionHash(qualification.snapshot.binding) !== subscriptionHash(credentials.currentWorkspace)) return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID', 409);
}
