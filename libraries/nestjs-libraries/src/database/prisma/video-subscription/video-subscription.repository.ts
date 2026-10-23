import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { serializableWithRetry } from '../serializable.transaction';
import { videoErrorV1 } from '../../../videos/video-brief.v1';
import { isOrganizationEditor } from '../../../user/organization.roles';
import { authenticatedSession } from '../../../user/authenticated.session';

@Injectable()
export class VideoSubscriptionRepository {
  constructor(readonly db: PrismaService) {}
  transaction<T>(run: Parameters<typeof serializableWithRetry<T>>[1]) { return serializableWithRetry(this.db, run, 'Video subscription is busy; retry the same intent.'); }
  async member(organizationId: string, userId: string, write = true, db: any = this.db) {
    if (write && authenticatedSession() && authenticatedSession()!.actorId !== userId) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    const member = await db.userOrganization.findFirst({where: {organizationId, userId, disabled: false}, include: {user: true}});
    if (!member || !member.user.activated || (write && !isOrganizationEditor(member.role))) return videoErrorV1('VIDEO_ACCESS_DENIED', 403);
    return member;
  }
  async connection(organizationId: string, userId: string, id: string, db: any = this.db, requireActive = true) {
    await this.member(organizationId, userId, true, db);
    const row = await db.videoSubscriptionConnection.findFirst({where: {id, ownerId: userId}});
    const grant = await db.videoSubscriptionGrant.findUnique({where: {connectionId_organizationId: {connectionId: id, organizationId}}});
    if (!row || !grant?.enabled || (requireActive && row.state !== 'connected')) return videoErrorV1('VIDEO_REAUTH_REQUIRED', 409);
    return row;
  }
}
