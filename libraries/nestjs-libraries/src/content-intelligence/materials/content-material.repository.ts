import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { materialNotFound } from './errors';
import { wordsWhere } from '../search-terms';

/**
 * По каким полям ищет поиск по словам.
 *
 * Заголовок и текст — обычные колонки, и поиск по ним честно уходит в базу.
 * Происхождение занесённого текста (площадка, ссылка, заметка) лежит в
 * `tags` — это JSON, и Prisma не умеет искать в нём без учёта регистра, а
 * сырой SQL здесь запрещён. Площадка и так отбирается своим фильтром рядом,
 * так что дыры в отборе это не оставляет; записано в карте раздела.
 */
const SEARCHABLE_PIECE_FIELDS = ['title', 'body'] as const;

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

  /**
   * Поиск по словам: какие тексты этого пространства подходят под запрос
   * (`content-factory-next-odb8.4`).
   *
   * Отдельный запрос за одними идентификаторами, а не сужение `listPieces`, и
   * причина не в стиле. Код материала (`cnt-01`) — это его место в общем
   * списке от старых к новым; сузь сам список — и `cnt-07` при поиске станет
   * `cnt-02`, то есть код перестанет быть кодом. Поэтому список читается
   * целиком, как и раньше, а поиск отвечает множеством, по которому список
   * потом отбирается.
   *
   * `organizationId` стоит в `where` первым и вне слов: слова — это то, что
   * человек ввёл, а границу пространства ввод не двигает ни при каком запросе.
   */
  searchPieceIds(organizationId: string, words: readonly string[]) {
    const byWords = wordsWhere(words, SEARCHABLE_PIECE_FIELDS);
    return (this.repository.model as any).contentPiece.findMany({
      where: { organizationId, archivedAt: null, ...(byWords ?? {}) },
      select: { id: true },
    });
  }

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

  /**
   * Which platforms a piece has ever been cut for — the «сделано здесь» half
   * of the archive's platform filter (`content-factory-next-odb8.4`). One
   * query for the whole page rather than one per row: `platformsByPiece` in
   * `content-material.service.ts` reads this map alongside `tags.archive.platform`
   * for pieces brought in from outside, so one filter covers both origins of
   * a piece's platform.
   */
  async platformsByPiece(
    organizationId: string,
    contentPieceIds: string[]
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!contentPieceIds.length) return map;
    const rows = await (this.repository.model as any).contentDerivation.findMany({
      where: { organizationId, contentPieceId: { in: contentPieceIds } },
      select: { contentPieceId: true, platform: true },
      distinct: ['contentPieceId', 'platform'],
    });
    for (const row of rows as { contentPieceId: string; platform: string }[]) {
      const list = map.get(row.contentPieceId) ?? [];
      list.push(row.platform);
      map.set(row.contentPieceId, list);
    }
    return map;
  }

  /**
   * «Занесение своего прежнего»: a piece this workspace brings in rather than
   * one the factory wrote. Same table, same `contentPiece.create` any other
   * piece goes through — `archiveLayerOf` reads the layer back from `tags`
   * rather than from a column, so no model changed to make this possible.
   *
   * `brandProfileVersionId` and `contentContextSnapshotId` stay `null`: a
   * brought-in text was not measured against a voice version and was not
   * generated from a context snapshot, and a `null` here says so honestly
   * rather than pointing at whichever happens to be current.
   */
  createArchivePiece(input: {
    organizationId: string;
    createdByUserId: string;
    title: string;
    body: string;
    language: string;
    tags: Record<string, unknown>;
  }) {
    return (this.repository.model as any).contentPiece.create({
      data: {
        organizationId: input.organizationId,
        title: input.title,
        body: input.body,
        language: input.language,
        tags: input.tags,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true, createdAt: true },
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
