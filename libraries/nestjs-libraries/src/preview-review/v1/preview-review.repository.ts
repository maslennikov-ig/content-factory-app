import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';

export type ReviewScopeV1 = { organizationId: string; postId: string };
export type ReviewActorV1 = ReviewScopeV1 & (
  { kind: 'team'; userId: string } |
  { kind: 'guest'; grantId: string; expiresAt: Date }
);

@Injectable()
export class PreviewReviewRepositoryV1 {
  constructor(private readonly prisma: PrismaService) {}

  postScope(postId: string) {
    return this.prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { organizationId: true } });
  }

  member(userId: string, organizationId: string) {
    return this.prisma.userOrganization.findFirst({
      where: { userId, organizationId, disabled: false, user: { activated: true, blockedAt: null } },
      select: { userId: true },
    });
  }

  grant(tokenHash: string, postId: string, now: Date) {
    return this.prisma.previewReviewGrantV1.findFirst({
      where: { tokenHash, postId, revokedAt: null, expiresAt: { gt: now }, post: { deletedAt: null } },
      select: { id: true, organizationId: true, postId: true, expiresAt: true },
    });
  }

  async preview(scope: ReviewScopeV1) {
    const posts = [];
    const seen = new Set<string>();
    let id: string | undefined = scope.postId;
    // The existing preview is a post and its reply chain, never sibling channels.
    while (id && !seen.has(id) && seen.size < 100) {
      seen.add(id);
      const post = await this.prisma.post.findFirst({
        where: { id, organizationId: scope.organizationId, deletedAt: null },
        select: {
          id: true, content: true, image: true, publishDate: true, creationMethod: true,
          integration: { select: { id: true, name: true, displayName: true, providerIdentifier: true, profile: true } },
          childrenPost: { where: { organizationId: scope.organizationId, deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 1, select: { id: true } },
        },
      });
      if (!post) break;
      posts.push(post);
      id = post.childrenPost[0]?.id;
    }
    if (!posts.length) throw new NotFoundException('Preview not found');
    return posts;
  }

  media(organizationId: string, ids: string[], paths: string[]) {
    if (!ids.length && !paths.length) return Promise.resolve([]);
    return this.prisma.media.findMany({
      where: { organizationId, deletedAt: null, OR: [{ id: { in: ids } }, { path: { in: paths } }] },
      select: { id: true, organizationId: true, name: true, path: true, type: true, alt: true, thumbnail: true, thumbnailTimestamp: true },
    });
  }

  /** Existence only: a foreign/deleted library ID cannot become an external label. */
  async registeredMediaIds(ids: string[]) {
    if (!ids.length) return [];
    return (await this.prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(row => row.id);
  }

  discussions(scope: ReviewScopeV1) {
    return this.prisma.previewReviewThreadV1.findMany({
      where: scope, orderBy: { createdAt: 'asc' },
      include: { comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true, lastName: true } } } } },
    });
  }

  legacyComments(scope: ReviewScopeV1) {
    return this.prisma.comments.findMany({
      where: { ...scope, deletedAt: null, post: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, createdAt: true, user: { select: { name: true, lastName: true } } },
    });
  }

  private async liveActor(tx: Prisma.TransactionClient, actor: ReviewActorV1) {
    const post = await tx.post.findFirst({ where: { id: actor.postId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
    if (!post) throw new NotFoundException('Preview not found');
    const live = actor.kind === 'guest'
      ? await tx.previewReviewGrantV1.findFirst({ where: { id: actor.grantId, organizationId: actor.organizationId, postId: actor.postId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
      : await tx.userOrganization.findFirst({ where: { userId: actor.userId, organizationId: actor.organizationId, disabled: false, user: { activated: true, blockedAt: null } }, select: { id: true } });
    if (!live) throw new NotFoundException('Preview access unavailable');
  }

  createThread(actor: ReviewActorV1, anchor: { anchorPostId?: string; anchorQuote?: string; anchorStart?: number; anchorEnd?: number; anchorRevision?: string }, content: string, guestName?: string) {
    return this.prisma.$transaction(async tx => {
      await this.liveActor(tx, actor);
      return tx.previewReviewThreadV1.create({ data: {
        organizationId: actor.organizationId, postId: actor.postId, ...anchor,
        comments: { create: this.commentData(actor, content, guestName) },
      }, select: { id: true } });
    });
  }

  private commentData(actor: ReviewActorV1, content: string, guestName?: string) {
    return actor.kind === 'team' ? { content, authorUserId: actor.userId } : { content, guestGrantId: actor.grantId, guestName };
  }

  reply(actor: ReviewActorV1, threadId: string, content: string, guestName?: string) {
    return this.prisma.$transaction(async tx => {
      await this.liveActor(tx, actor);
      const thread = await tx.previewReviewThreadV1.findFirst({ where: { id: threadId, organizationId: actor.organizationId, postId: actor.postId }, select: { id: true } });
      if (!thread) throw new NotFoundException('Discussion not found');
      return tx.previewReviewCommentV1.create({ data: { organizationId: actor.organizationId, postId: actor.postId, threadId, ...this.commentData(actor, content, guestName) }, select: { id: true } });
    });
  }

  resolve(actor: ReviewActorV1 & { kind: 'team' }, threadId: string, resolved: boolean) {
    return this.prisma.$transaction(async tx => {
      await this.liveActor(tx, actor);
      const result = await tx.previewReviewThreadV1.updateMany({
        where: { id: threadId, organizationId: actor.organizationId, postId: actor.postId },
        data: { resolvedAt: resolved ? new Date() : null, resolvedByUserId: resolved ? actor.userId : null },
      });
      if (!result.count) throw new NotFoundException('Discussion not found');
      return { resolved };
    });
  }

  grants(scope: ReviewScopeV1) {
    return this.prisma.previewReviewGrantV1.findMany({ where: scope, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, expiresAt: true, revokedAt: true } });
  }

  createGrant(actor: ReviewActorV1 & { kind: 'team' }, tokenHash: string, expiresAt: Date, reissueId?: string) {
    return this.prisma.$transaction(async tx => {
      await this.liveActor(tx, actor);
      if (reissueId) {
        const previous = await tx.previewReviewGrantV1.updateMany({ where: { id: reissueId, organizationId: actor.organizationId, postId: actor.postId }, data: { revokedAt: new Date() } });
        if (!previous.count) throw new NotFoundException('Review link not found');
      }
      return tx.previewReviewGrantV1.create({ data: { organizationId: actor.organizationId, postId: actor.postId, createdByUserId: actor.userId, tokenHash, expiresAt }, select: { id: true, createdAt: true, expiresAt: true } });
    });
  }

  revoke(actor: ReviewActorV1 & { kind: 'team' }, grantId: string) {
    return this.prisma.$transaction(async tx => {
      await this.liveActor(tx, actor);
      const result = await tx.previewReviewGrantV1.updateMany({ where: { id: grantId, organizationId: actor.organizationId, postId: actor.postId }, data: { revokedAt: new Date() } });
      if (!result.count) throw new NotFoundException('Review link not found');
      return { revoked: true };
    });
  }
}
