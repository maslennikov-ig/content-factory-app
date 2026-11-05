import { Injectable } from '@nestjs/common';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { authenticatedSession } from '../../user/authenticated.session';
import { isOrganizationAdmin } from '../../user/organization.roles';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoConnectionService } from './video-connection.service';
import { VideoMcpClient } from './video-mcp-client';
import { HggReadHooksV1, hggReadPlanV1 } from './video-hgg-qualification-read.v1';

/** Local operator runner only. No controller, catalogue registration or application bootstrap. */
@Injectable()
export class VideoQualificationReadService {
  constructor(readonly repository: VideoSubscriptionRepository, readonly connections: VideoConnectionService, readonly mcp: VideoMcpClient) {}
  async inspect(org: string, actor: string, connectionId: string, generation: number, plan: unknown, hooks: HggReadHooksV1) {
    const commands = hggReadPlanV1(plan);
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
    const results = await this.mcp.readHiggsfieldQualification(def, credential.token, commands, assertUsable, hooks);
    await assertUsable();
    return {version: 1, purpose: 'higgsfield_qualification_reads', accountGeneration: generation, walletVerified: false, results};
  }
}
