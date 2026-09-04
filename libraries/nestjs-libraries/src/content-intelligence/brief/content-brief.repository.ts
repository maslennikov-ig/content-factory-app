/**
 * The four reads and the one write the brief surface needs.
 *
 * The write is a draft, and it is made by the repository the rest of the
 * product makes posts with. That is deliberate: a second way to create a post
 * would be a second place for the tenant scope, the provenance and the draft
 * state to drift. Delivery is not here and cannot be — `createOrUpdatePost` is
 * asked for `'draft'`, and the workflow that publishes a post is started by
 * `PostsService`, which this path never calls.
 *
 * The fact memory is read through `ContentFactService` by the service above;
 * the only fact query here is the one that service does not offer — an exact,
 * tenant-scoped lookup of the ids a brief claims.
 */

import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { PostsRepository } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository';
import type { CreationMethod } from '@prisma/client';
// Which avatar a space means when it does not say — one rule, one place.
import { DEFAULT_AVATAR_FIRST } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';

type PrismaClientLike = Record<string, any>;

export type WorkspaceChannelV1 = {
  id: string;
  name: string;
  providerIdentifier: string;
};

export type RememberedFactV1 = {
  id: string;
  status: string;
  statement: string;
};

@Injectable()
export class ContentBriefRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly posts: PostsRepository
  ) {}

  private client() {
    return this.repository.model as PrismaClientLike;
  }

  /** What the workspace has already published, for "you wrote about this". */
  listPublishedPosts(organizationId: string) {
    return this.client().post.findMany({
      where: { organizationId, deletedAt: null, state: 'PUBLISHED' },
      select: { id: true, content: true, publishDate: true },
      orderBy: { publishDate: 'desc' },
      take: 200,
    });
  }

  /**
   * The ids a brief claims, looked up in this workspace's memory only.
   *
   * An id from somewhere else finds nothing here, which is the whole point:
   * `factId` is a promise that the statement was checked when it entered *this*
   * workspace, and nobody else's memory can keep that promise.
   */
  async findFactsByIds(
    organizationId: string,
    ids: readonly string[]
  ): Promise<RememberedFactV1[]> {
    if (!ids.length) return [];
    return this.client().contentFact.findMany({
      where: { organizationId, id: { in: [...ids] } },
      select: { id: true, status: true, statement: true },
      take: 128,
    });
  }

  /** The channels a draft could be written into. */
  listChannels(organizationId: string): Promise<WorkspaceChannelV1[]> {
    return this.client().integration.findMany({
      where: { organizationId, deletedAt: null, disabled: false },
      select: { id: true, name: true, providerIdentifier: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  /**
   * A draft, through the same path every other post is created by.
   *
   * `'draft'` is not a detail. The repository writes `DRAFT` for it and starts
   * nothing; anything else would put a post the author has not read yet into a
   * queue.
   */
  async createDraft(
    organizationId: string,
    input: {
      channelId: string;
      providerIdentifier: string;
      content: string;
      date: string;
    }
  ): Promise<string | null> {
    const created = await this.posts.createOrUpdatePost(
      'draft',
      organizationId,
      input.date,
      {
        integration: { id: input.channelId },
        value: [{ content: input.content, image: [] }],
        settings: { __type: input.providerIdentifier },
      } as any,
      [],
      'WEB' as CreationMethod
    );
    return created?.posts?.[0]?.id ?? null;
  }

  /**
   * Which voice wrote it, so a later recut can say whether the voice moved on.
   *
   * A read, not a requirement: a workspace with no voice writes in the neutral
   * style and its pieces simply carry no version.
   */
  async activeVoiceVersionId(organizationId: string): Promise<string | null> {
    const profile = await this.client().projectBrandProfile.findFirst({
      orderBy: DEFAULT_AVATAR_FIRST,
      where: { organizationId, deletedAt: null },
      select: { activeVersionId: true },
    });
    return profile?.activeVersionId ?? null;
  }

  /**
   * The piece this draft came out of, and the derivation that says so.
   *
   * `migration-map.md` puts a Content Variant between a brief and a post: the
   * text is written once and cut for each platform after. The brief wrote
   * straight to `Post` instead, so nothing in the product ever created a
   * `ContentPiece` — and the Material tab, which reads exactly that table,
   * could not fill for any workspace at all (`content-factory-next-vme.21.6`).
   *
   * Written after the post rather than before it, and in one transaction with
   * its derivation: a piece with no derivation would sit in the library
   * claiming to have produced nothing, which is the one fact that surface
   * exists to keep. The post is the caller's success, so a failure here is
   * reported by returning `null` — a draft the author can already open beats a
   * refusal over the bookkeeping behind it.
   */
  async recordPiece(
    organizationId: string,
    input: {
      postId: string;
      integrationId: string;
      platform: string;
      format: string;
      title: string;
      body: string;
      language: string;
      createdByUserId: string;
      brandProfileVersionId?: string | null;
      /**
       * The context this text was written from, so «Разбор» can list the facts
       * it stood on (`content-factory-next-fn33.89`). Absent when the context
       * could not be built; the piece is still written, because a library row
       * without its provenance is worth more than no library row at all.
       */
      contentContextSnapshotId?: string | null;
    }
  ): Promise<string | null> {
    try {
      const piece = await this.client().$transaction(async (database: any) => {
        const created = await database.contentPiece.create({
          data: {
            organizationId,
            title: input.title,
            body: input.body,
            language: input.language,
            createdByUserId: input.createdByUserId,
            brandProfileVersionId: input.brandProfileVersionId ?? null,
            contentContextSnapshotId: input.contentContextSnapshotId ?? null,
          },
        });
        await database.contentDerivation.create({
          data: {
            organizationId,
            contentPieceId: created.id,
            postId: input.postId,
            integrationId: input.integrationId,
            platform: input.platform,
            format: input.format,
            brandProfileVersionId: input.brandProfileVersionId ?? null,
            state: 'DRAFT',
          },
        });
        return created;
      });
      return piece?.id ?? null;
    } catch {
      return null;
    }
  }
}
