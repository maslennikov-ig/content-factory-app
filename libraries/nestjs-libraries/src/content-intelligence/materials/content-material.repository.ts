import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { materialNotFound } from './errors';

/**
 * Storage for the material library.
 *
 * Every read and every write carries `organizationId`, and the models are
 * scoped `@@unique([organizationId, id])` so a piece from another workspace
 * cannot be reached even with its identifier in hand. Prisma models only, no
 * raw SQL — `AGENTS.md` makes that the repository contract for this codebase.
 *
 * Nothing here reaches a platform. It writes a draft post and the row that
 * says where the draft came from; `PostsService` and the providers publish it
 * exactly as they publish any other post, which is the rule
 * `docs/product/migration-map.md` states.
 */

export type DerivationCount = {
  contentPieceId: string;
  state: string;
  _count: { _all: number };
};

export type DraftInput = {
  organizationId: string;
  contentPieceId: string;
  integrationId: string;
  platform: string;
  format: string;
  brandProfileVersionId: string | null;
  contentContextSnapshotId: string | null;
  title: string;
  content: string;
  publishDate: Date;
  group: string;
};

@Injectable()
export class ContentMaterialRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly transaction: PrismaTransaction
  ) {}

  listPieces(organizationId: string) {
    return (this.repository.model as any).contentPiece.findMany({
      where: { organizationId, archivedAt: null },
      // Oldest first, because the code the library prints beside a piece is
      // its place in that order: `cnt-01` has to stay `cnt-01` when a new
      // piece is written today.
      orderBy: { createdAt: 'asc' },
      include: {
        brandProfileVersion: { select: { versionNumber: true, label: true } },
      },
    });
  }

  async getPiece(organizationId: string, id: string) {
    const piece = await (this.repository.model as any).contentPiece.findFirst({
      where: { organizationId, id, archivedAt: null },
      include: {
        brandProfileVersion: { select: { versionNumber: true, label: true } },
      },
    });
    if (!piece) throw materialNotFound(id);
    return piece;
  }

  /**
   * How many posts came out of each piece, by state, in one query.
   *
   * Grouped rather than joined: a library of forty pieces should not load
   * every post any of them produced to print two numbers per row.
   */
  async countDerivations(
    organizationId: string,
    contentPieceIds: string[]
  ): Promise<DerivationCount[]> {
    if (!contentPieceIds.length) return [];
    return (this.repository.model as any).contentDerivation.groupBy({
      by: ['contentPieceId', 'state'],
      where: { organizationId, contentPieceId: { in: contentPieceIds } },
      _count: { _all: true },
    });
  }

  listDerivations(organizationId: string, contentPieceId: string) {
    return (this.repository.model as any).contentDerivation.findMany({
      where: { organizationId, contentPieceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** A channel of this workspace, named by the request. */
  findIntegration(organizationId: string, integrationId: string) {
    return (this.repository.model as any).integration.findFirst({
      where: {
        organizationId,
        id: integrationId,
        deletedAt: null,
        disabled: false,
      },
      select: { id: true, providerIdentifier: true },
    });
  }

  /** The workspace's own channel for a platform, when the request named none. */
  findIntegrationForPlatform(organizationId: string, providers: string[]) {
    return (this.repository.model as any).integration.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        disabled: false,
        providerIdentifier: { in: providers },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, providerIdentifier: true },
    });
  }

  /**
   * The draft and its provenance, written together.
   *
   * One transaction, because a post with no derivation is a post that lost
   * where it came from — and that is the one fact this whole surface exists to
   * keep.
   */
  async createDraft(input: DraftInput) {
    return (this.transaction.model as any).$transaction(
      async (database: any) => {
        const post = await database.post.create({
          data: {
            organizationId: input.organizationId,
            integrationId: input.integrationId,
            state: 'DRAFT',
            publishDate: input.publishDate,
            content: input.content,
            title: input.title,
            group: input.group,
            creationMethod: 'WEB',
            brandProfileVersionId: input.brandProfileVersionId,
            contentContextSnapshotId: input.contentContextSnapshotId,
          },
        });
        const derivation = await database.contentDerivation.create({
          data: {
            organizationId: input.organizationId,
            contentPieceId: input.contentPieceId,
            postId: post.id,
            integrationId: input.integrationId,
            platform: input.platform,
            format: input.format,
            brandProfileVersionId: input.brandProfileVersionId,
            state: 'DRAFT',
          },
        });
        return { postId: post.id, derivationId: derivation.id };
      }
    );
  }
}
