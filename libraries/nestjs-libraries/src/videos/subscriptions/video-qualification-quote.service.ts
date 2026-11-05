import { Injectable } from '@nestjs/common';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { authenticatedSession } from '../../user/authenticated.session';
import { isOrganizationAdmin } from '../../user/organization.roles';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoConnectionService } from './video-connection.service';
import { VideoMcpClient } from './video-mcp-client';
import { hggPilotQuoteRequestV1, type HggPilotEvidenceBytesV1, type HggPilotQuoteHooksV1 } from './video-hgg-pilot-quote.v1';

/** Operator-only non-generating quote. No controller/module registration or wallet promotion. */
@Injectable()
export class VideoQualificationQuoteService {
  constructor(readonly repository: VideoSubscriptionRepository, readonly connections: VideoConnectionService, readonly mcp: VideoMcpClient) {}
  async inspect(org: string, actor: string, connectionId: string, generation: number, input: unknown, evidence: HggPilotEvidenceBytesV1, hooks: HggPilotQuoteHooksV1) {
    const owner = {organizationId: org, actorId: actor, connectionId, accountGeneration: generation};
    const request = hggPilotQuoteRequestV1(input, evidence, owner);
    const assertOperator = async () => {
      if (authenticatedSession()?.actorId !== actor) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
      const member = await this.repository.member(org, actor);
      if (!isOrganizationAdmin(member.role)) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    };
    await assertOperator();
    const credential = await this.connections.token(org, actor, connectionId, generation, 'discovery', {allowRefresh: false});
    if (credential.connection.provider !== 'higgsfield') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
    const def = await this.connections.connectable(org, 'higgsfield');
    const assertUsable = async () => {await assertOperator(); await credential.assertUsable();};
    await assertUsable(); await hooks.beforeSession(); await assertUsable();
    // Use the parsed immutable input, so caller mutation during an async guard cannot alter a quote.
    const quote = await this.mcp.quoteHiggsfieldPilot(def, credential.token, request.input, evidence, owner, assertUsable, hooks);
    await assertUsable();
    return {version: 1, purpose: 'higgsfield_pilot_quote', accountGeneration: generation, requestHash: request.requestHash,
      walletVerified: false, generationReady: false, paidSubmitEnabled: false, quote};
  }
}
