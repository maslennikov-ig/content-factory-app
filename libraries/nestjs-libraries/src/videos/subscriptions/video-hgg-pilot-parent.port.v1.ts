import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { videoErrorV1 } from '../video-brief.v1';
import type { HggPilotExpectedV1, HggPilotParentAssertionV1, HggPilotStageSettledV1, HggPilotWorkspacePreparationV1 } from './video-hgg-pilot-stage.v1';
import type { HggCredentialRenewalRequestV2, HggExecutionCredentialsV2 } from './video-hgg-pilot-credentials.v2';
export interface HggPilotParentAdapterV1 {
  /** A fences parent/source/scenario/accepted reviews, exact prompt, stop, account and owned ordered frames in this transaction. */
  assertCurrentPilot(tx: Prisma.TransactionClient, expected: HggPilotExpectedV1): Promise<HggPilotParentAssertionV1>;
  assertCurrentPilotWithCredentialsV2?(tx: Prisma.TransactionClient, expected: HggPilotExpectedV1 & {executionCredentials: HggExecutionCredentialsV2}): Promise<HggPilotParentAssertionV1>;
  assertWorkspaceSelection?(tx: Prisma.TransactionClient, expected: HggPilotWorkspacePreparationV1 & {organizationId: string; actorId: string}): Promise<void>;
  assertCredentialRenewalV2?(tx: Prisma.TransactionClient, expected: HggCredentialRenewalRequestV2 & {organizationId: string; actorId: string}): Promise<void>;
  /** Idempotent by eventId/jobId. A advances first -> last -> actual vision -> clip or persists a blocker. */
  onStageSettled?(event: HggPilotStageSettledV1): Promise<void>;
}
/** A binds once on module init. Videos never imports the SocialFactoryModule. */
@Injectable()
export class HggPilotParentPortV1 {
  private adapter?: HggPilotParentAdapterV1;
  bind(adapter: HggPilotParentAdapterV1) {
    if (this.adapter && this.adapter !== adapter) return videoErrorV1('VIDEO_PILOT_PARENT_ALREADY_BOUND', 409);
    this.adapter = adapter;
  }
  async assertCurrentPilot(tx: Prisma.TransactionClient, expected: HggPilotExpectedV1): Promise<HggPilotParentAssertionV1> {
    if (!this.adapter) return videoErrorV1('VIDEO_PILOT_PARENT_UNAVAILABLE', 409);
    return this.adapter.assertCurrentPilot(tx, expected);
  }
  async assertCurrentPilotWithCredentialsV2(tx: Prisma.TransactionClient, expected: HggPilotExpectedV1 & {executionCredentials: HggExecutionCredentialsV2}): Promise<HggPilotParentAssertionV1> {
    if (!this.adapter?.assertCurrentPilotWithCredentialsV2) return videoErrorV1('VIDEO_PILOT_PARENT_UNAVAILABLE', 409);
    return this.adapter.assertCurrentPilotWithCredentialsV2(tx, expected);
  }
  async assertWorkspaceSelection(tx: Prisma.TransactionClient, expected: HggPilotWorkspacePreparationV1 & {organizationId: string; actorId: string}) {
    if (!this.adapter?.assertWorkspaceSelection) return videoErrorV1('VIDEO_PILOT_WORKSPACE_AUTHORIZATION_REQUIRED', 409);
    await this.adapter.assertWorkspaceSelection(tx, expected);
  }
  async assertCredentialRenewalV2(tx: Prisma.TransactionClient, expected: HggCredentialRenewalRequestV2 & {organizationId: string; actorId: string}) {
    if (!this.adapter?.assertCredentialRenewalV2) return videoErrorV1('VIDEO_PILOT_PARENT_UNAVAILABLE', 409);
    await this.adapter.assertCredentialRenewalV2(tx, expected);
  }
  async onStageSettled(event: HggPilotStageSettledV1) {
    if (!this.adapter?.onStageSettled) return videoErrorV1('VIDEO_PILOT_CONTINUATION_UNAVAILABLE', 409);
    await this.adapter.onStageSettled(event);
  }
}
