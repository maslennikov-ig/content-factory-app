import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { sanitizePostContent } from '@contentfactory/helpers/utils/sanitize.post.content';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import { integrationDisplayName } from '@contentfactory/helpers/utils/integration-name';
import { mediaPresentationKind } from '@contentfactory/helpers/utils/media-kind';
import { resolveOwnedPostMediaV1 } from '@contentfactory/nestjs-libraries/database/prisma/media/owned-post-media.v1';
import { lookup } from 'mime-types';
import { PreviewReviewRepositoryV1, ReviewActorV1 } from './preview-review.repository';
import { PreviewReviewCommentDtoV1, PreviewReviewThreadDtoV1 } from './preview-review.dto';

export const reviewHashV1 = (value: string) => createHash('sha256').update(value).digest('hex');
export const reviewTextV1 = (value: string) => stripHtmlValidation('normal', sanitizePostContent(value).replace(/<br\s*\/?\s*>/gi, '\n'), false, true);
export const reviewCookieNameV1 = (postId: string) => `cf_preview_${reviewHashV1(postId).slice(0, 16)}`;

type ReviewMediaReferenceV1 = { id?: string; path?: string; alt?: string | null; thumbnail?: string | null; thumbnailTimestamp?: number | null };
function mediaReferences(value: string | null): ReviewMediaReferenceV1[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object').slice(0, 100) : [];
  } catch { return []; }
}

export function assertReviewMutationV1(request: Pick<Request, 'headers'>) {
  const origins = [process.env.FRONTEND_URL, process.env.MAIN_URL].flatMap(value => {
    try { return value ? [new URL(value).origin] : []; } catch { return []; }
  });
  if (request.headers['x-preview-review'] !== '1' ||
      String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json' ||
      typeof request.headers.origin !== 'string' || !origins.includes(request.headers.origin)) {
    throw new ForbiddenException({ code: 'review_origin_forbidden', message: 'Review changes must come from the application' });
  }
}

@Injectable()
export class PreviewReviewServiceV1 {
  constructor(private readonly repository: PreviewReviewRepositoryV1) {}

  async authorize(postId: string, request: Pick<Request, 'headers' | 'cookies'>, mediaCookie = false): Promise<ReviewActorV1> {
    if (!postId || postId.length > 100) throw new NotFoundException('Preview not found');
    const header = request.headers['x-preview-grant'];
    const token = typeof header === 'string' ? header : mediaCookie ? request.cookies?.[reviewCookieNameV1(postId)] : undefined;
    // An explicitly supplied grant never acquires team privileges from cookies.
    if (token !== undefined) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ForbiddenException('Review link unavailable');
      const grant = await this.repository.grant(reviewHashV1(token), postId, new Date());
      if (!grant) {
        // A stale media-only guest cookie must not block a live team session.
        if (mediaCookie && header === undefined) return this.authorize(postId, { headers: request.headers, cookies: { auth: request.cookies?.auth } });
        throw new ForbiddenException({ code: 'review_link_unavailable', message: 'Review link has expired or was revoked' });
      }
      return { kind: 'guest', organizationId: grant.organizationId, postId, grantId: grant.id, expiresAt: grant.expiresAt };
    }
    let userId: string | undefined;
    try {
      const auth = typeof request.headers.auth === 'string' ? request.headers.auth : request.cookies?.auth;
      userId = auth ? (AuthService.verifySessionJWT(auth) as { id?: string } | null)?.id : undefined;
    } catch { /* Invalid sessions carry no authority. */ }
    if (!userId) throw new ForbiddenException({ code: 'review_sign_in_required', message: 'Sign in or request a new review link' });
    const scope = await this.repository.postScope(postId);
    if (!scope || !await this.repository.member(userId, scope.organizationId)) throw new NotFoundException('Preview not found');
    return { kind: 'team', userId, organizationId: scope.organizationId, postId };
  }

  team(actor: ReviewActorV1): asserts actor is ReviewActorV1 & { kind: 'team' } {
    if (actor.kind !== 'team') throw new ForbiddenException('Only the team can manage discussions and review links');
  }

  private async previewMedia(actor: ReviewActorV1) {
    const posts = await this.repository.preview(actor);
    const references = posts.flatMap(post => mediaReferences(post.image));
    const media = await this.repository.media(actor.organizationId,
      references.flatMap(item => typeof item.id === 'string' ? [item.id] : []),
      references.flatMap(item => [!item.id && item.path, item.thumbnail].filter((path): path is string => typeof path === 'string')));
    const liveIds = new Set(media.map(row => row.id));
    const unknownIds = [...new Set(references.flatMap(item => typeof item.id === 'string' && !liveIds.has(item.id) ? [item.id] : []))];
    const registeredIds = new Set(unknownIds.length ? await this.repository.registeredMediaIds(unknownIds) : []);
    // Library default covers are also resolved through live organization-scoped rows.
    const defaultCoverPaths = media.flatMap(item => item.thumbnail ? [item.thumbnail] : []);
    const covers = defaultCoverPaths.length ? await this.repository.media(actor.organizationId, [], defaultCoverPaths) : [];
    const ownedRows = [...media, ...covers].map(row => ({ ...row, organizationId: row.organizationId || actor.organizationId }));
    const byId = new Map(ownedRows.map(row => [row.id, row]));
    const byPath = new Map(ownedRows.map(row => [row.path, row]));
    const attachments = await Promise.all(posts.flatMap(post => mediaReferences(post.image).map(async (reference, index) => {
      try {
        const owned = reference.id ? byId.get(reference.id) : reference.path ? byPath.get(reference.path) : undefined;
        // Resolve the primary source independently; an unavailable old cover does not hide the file.
        const { items: [resolved] } = await resolveOwnedPostMediaV1(actor.organizationId, [{ ...reference, thumbnail: null }], {
          byId: async (_organizationId, id) => byId.get(id) || null,
          byPath: async (_organizationId, path) => byPath.get(path) || null,
          exists: async id => registeredIds.has(id),
        });
        const source = String(resolved.path);
        if (!owned) {
          const url = new URL(source);
          if (url.protocol !== 'https:' || url.username || url.password) return null;
        }
        const referenceKey = reviewHashV1(JSON.stringify([post.id, index, reference]));
        const id = owned?.id || `external-${referenceKey}`;
        const name = owned?.name || new URL(source).pathname.split('/').pop() || 'attachment';
        const thumbnail = reference.thumbnail !== undefined ? reference.thumbnail : owned?.thumbnail;
        const candidateCover = thumbnail ? byPath.get(thumbnail) : undefined;
        const cover = candidateCover && String(lookup(candidateCover.path.split('?')[0]) || '').startsWith('image/') ? candidateCover : undefined;
        return { postId: post.id, id, referenceKey, path: source, name,
          type: mediaPresentationKind({ path: source, name, type: owned?.type }),
          alt: reference.alt !== undefined ? reference.alt : owned?.alt,
          thumbnailTimestamp: reference.thumbnailTimestamp !== undefined ? reference.thumbnailTimestamp : owned?.thumbnailTimestamp,
          cover };
      } catch { return null; /* Invalid legacy references carry no preview authority. */ }
    })));
    return { posts, attachments: attachments.filter((item): item is NonNullable<typeof item> => item !== null) };
  }

  async preview(actor: ReviewActorV1) {
    const { posts, attachments } = await this.previewMedia(actor);
    return posts.map(({ childrenPost, image, ...post }) => {
      const safeMedia = attachments.filter(item => item.postId === post.id).map(item => {
        const path = `/preview-review/v1/posts/${encodeURIComponent(actor.postId)}/media/${encodeURIComponent(item.id)}`;
        return { id: item.id, name: item.name, path, type: item.type, alt: item.alt, thumbnailTimestamp: item.thumbnailTimestamp,
          thumbnail: item.cover ? `${path}?variant=thumbnail&reference=${item.referenceKey}` : undefined };
      });
      const text = reviewTextV1(post.content);
      return { ...post, content: sanitizePostContent(post.content), reviewText: text, reviewRevision: reviewHashV1(text), image: JSON.stringify(safeMedia),
        integration: { ...post.integration, name: integrationDisplayName(post.integration), displayName: undefined, picture: null } };
    });
  }

  async assertMedia(actor: ReviewActorV1, mediaId: string, thumbnail = false, referenceKey?: string) {
    const { attachments } = await this.previewMedia(actor);
    const attachment = attachments.find(item => item.id === mediaId && (!referenceKey || item.referenceKey === referenceKey));
    if (!attachment || (thumbnail && !attachment.cover)) throw new NotFoundException('Preview media not found');
    return thumbnail ? { path: attachment.cover!.path, filename: attachment.cover!.name }
      : { path: attachment.path, filename: attachment.name };
  }

  async discussions(actor: ReviewActorV1) {
    const [posts, threads, legacy] = await Promise.all([this.repository.preview(actor), this.repository.discussions({ organizationId: actor.organizationId, postId: actor.postId }), this.repository.legacyComments({ organizationId: actor.organizationId, postId: actor.postId })]);
    return { canManage: actor.kind === 'team', threads: threads.map(thread => {
      const currentPost = posts.find(post => post.id === thread.anchorPostId);
      const currentText = currentPost ? reviewTextV1(currentPost.content) : undefined;
      const stale = !!thread.anchorQuote && (!currentText || reviewHashV1(currentText) !== thread.anchorRevision || currentText.slice(thread.anchorStart!, thread.anchorEnd!) !== thread.anchorQuote);
      return { id: thread.id, createdAt: thread.createdAt, resolvedAt: thread.resolvedAt,
        anchor: thread.anchorQuote ? { postId: thread.anchorPostId, quote: thread.anchorQuote, start: thread.anchorStart, end: thread.anchorEnd, revision: thread.anchorRevision, stale } : null,
        comments: thread.comments.map(comment => ({ id: comment.id, content: comment.content, createdAt: comment.createdAt, authorName: comment.guestGrantId ? comment.guestName || 'Guest' : [comment.author?.name, comment.author?.lastName].filter(Boolean).join(' ') || 'Team member', unverified: !!comment.guestGrantId })),
      };
    }), legacyComments: legacy.map(comment => ({ id: comment.id, content: comment.content, createdAt: comment.createdAt, authorName: [comment.user?.name, comment.user?.lastName].filter(Boolean).join(' ') || 'Team member', unanchored: true })) };
  }

  private comment(actor: ReviewActorV1, body: PreviewReviewCommentDtoV1) {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    if (!content || content.length > 4000 || (actor.kind === 'guest' && (!guestName || guestName.length > 80))) throw new BadRequestException('A comment and a guest name are required within the length limits');
    return { content, guestName: actor.kind === 'guest' ? guestName : undefined };
  }

  async createThread(actor: ReviewActorV1, body: PreviewReviewThreadDtoV1) {
    const { content, guestName } = this.comment(actor, body);
    const anchor = body.anchor;
    const stored: { anchorPostId?: string; anchorQuote?: string; anchorStart?: number; anchorEnd?: number; anchorRevision?: string } = {};
    if (anchor) {
      const post = (await this.repository.preview(actor)).find(post => post.id === anchor.postId);
      if (!post) throw new BadRequestException('Anchor does not belong to this preview');
      const text = reviewTextV1(post.content);
      if (reviewHashV1(text) !== anchor.revision) throw new ConflictException({ code: 'review_anchor_changed', message: 'The post changed. Reload it and select the passage again.' });
      if (!Number.isSafeInteger(anchor.start) || !Number.isSafeInteger(anchor.end) || anchor.start < 0 || anchor.end <= anchor.start || anchor.end > text.length || !anchor.quote || anchor.quote.length > 2000 || text.slice(anchor.start, anchor.end) !== anchor.quote) throw new BadRequestException('Anchor does not match the selected text');
      Object.assign(stored, { anchorPostId: anchor.postId, anchorQuote: anchor.quote, anchorStart: anchor.start, anchorEnd: anchor.end, anchorRevision: anchor.revision });
    }
    return this.repository.createThread(actor, stored, content, guestName);
  }

  reply(actor: ReviewActorV1, threadId: string, body: PreviewReviewCommentDtoV1) {
    const { content, guestName } = this.comment(actor, body);
    return this.repository.reply(actor, threadId, content, guestName);
  }
  resolve(actor: ReviewActorV1, threadId: string, resolved: boolean) { this.team(actor); return this.repository.resolve(actor, threadId, resolved); }
  grants(actor: ReviewActorV1) { this.team(actor); return this.repository.grants({ organizationId: actor.organizationId, postId: actor.postId }); }
  async createGrant(actor: ReviewActorV1, expiresInDays = 7, reissueId?: string) {
    this.team(actor);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) throw new BadRequestException('Link lifetime must be between 1 and 30 days');
    const token = randomBytes(32).toString('base64url');
    const grant = await this.repository.createGrant(actor, reviewHashV1(token), new Date(Date.now() + expiresInDays * 86400000), reissueId);
    return { ...grant, token };
  }
  revoke(actor: ReviewActorV1, grantId: string) { this.team(actor); return this.repository.revoke(actor, grantId); }
}
