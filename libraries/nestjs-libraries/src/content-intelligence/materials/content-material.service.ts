import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  previewRecut,
  type RecutPlatform,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut';
import type {
  MaterialDerivedPostV1,
  MaterialDraftRequestV1,
  MaterialDraftResponseV1,
  MaterialRecutRequestV1,
  MaterialRowV1,
  MaterialsResponseV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { archiveImportInvalid, materialNotFound, platformUnsupported } from './errors';
import {
  ARCHIVE_LAYERS,
  archiveLayerOf,
  archiveOriginOf,
  buildArchiveTags,
  type ArchiveLayer,
  type ArchiveOrigin,
  type ImportableArchiveLayer,
} from './archive-presentation';
import {
  countImages,
  countLinks,
  derivationState,
  isRecutPlatform,
  materialCode,
  materialDate,
  materialFormat,
  PLATFORM_PROVIDERS,
  voiceVersionLabel,
} from './material-presentation';
import { ContentMaterialRepository } from './content-material.repository';

/**
 * The material library, its provenance, and the draft that comes out of it.
 *
 * A material is a finished text that lives apart from any post. That is what
 * makes the two numbers on a row worth printing: a piece knows how many posts
 * went out of it and how many are still waiting, and a post knows which piece
 * it came from — neither of which survives if the text only ever exists inside
 * the post that published it.
 *
 * The recut preview is `previewRecut` from `brand-voice/recut.ts`, called
 * rather than reimplemented. A second copy of that arithmetic drifts from the
 * first by a few hundred characters and goes on being believed, because both
 * numbers look equally exact.
 *
 * Nothing here reaches a platform. It prepares text and writes a draft;
 * `PostsService` and the providers deliver it, the same path as any other
 * post. `docs/product/migration-map.md` makes that a rule.
 */

type PieceRow = {
  id: string;
  title: string;
  body: string;
  language: string;
  tags: unknown;
  brandProfileVersionId: string | null;
  contentContextSnapshotId: string | null;
  createdAt: Date;
  brandProfileVersion?: {
    versionNumber?: number | null;
    label?: string | null;
  } | null;
};

/**
 * A material row widened with the archive's own three fields. Not a change to
 * `MaterialRowV1` itself — that type lives in `voice-wiring.contract.ts`,
 * outside this stream's write zone — so the widening happens locally and is
 * carried on the wire as extra JSON keys the Material tab's own reader
 * (`voice-materials.adapter.ts`'s `screenMaterials`) already ignores.
 */
export type ArchiveMaterialRow = MaterialRowV1 & {
  layer: ArchiveLayer;
  /** Every platform this piece is known to touch: derivations for `MADE_HERE`, the declared origin otherwise. */
  platforms: string[];
  /** «Разбор из текста»: the context snapshot this piece was generated from, when the writing path recorded one. */
  contentContextSnapshotId: string | null;
  /** `null` for `MADE_HERE` by construction — see `archiveOriginOf`. */
  origin: ArchiveOrigin | null;
};

function parseFilterDate(value: string | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

@Injectable()
export class ContentMaterialService {
  constructor(
    private readonly repository: ContentMaterialRepository,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  private row(piece: PieceRow, index: number, counts: Map<string, number>) {
    const row: MaterialRowV1 = {
      id: piece.id,
      code: materialCode(index),
      title: piece.title,
      format: materialFormat(piece.body, piece.tags, piece.language),
      // A post that went out and a post that is waiting are different facts,
      // and a single "posts" number answers neither question completely.
      postCount: counts.get(`${piece.id}|PUBLISHED`) || 0,
      queuedCount: counts.get(`${piece.id}|QUEUED`) || 0,
      // The third state, counted rather than dropped. A recut writes a
      // `DRAFT` derivation, and while only `PUBLISHED` and `QUEUED` were
      // counted the new version existed in the database and nowhere on the
      // screen (`content-factory-next-fn33.84`).
      draftCount: counts.get(`${piece.id}|DRAFT`) || 0,
      date: materialDate(piece.createdAt, piece.language),
      voiceVersion: voiceVersionLabel(piece.brandProfileVersion || null),
    };
    return row;
  }

  private async library(organizationId: string) {
    const pieces: PieceRow[] = await this.repository.listPieces(organizationId);
    const grouped = await this.repository.countDerivations(
      organizationId,
      pieces.map((piece) => piece.id)
    );
    const counts = new Map<string, number>();
    for (const entry of grouped) {
      const key = `${entry.contentPieceId}|${derivationState(entry.state)}`;
      counts.set(key, (counts.get(key) || 0) + (entry._count?._all || 0));
    }
    return {
      pieces,
      rows: pieces.map((piece, index) => this.row(piece, index, counts)),
    };
  }

  async listMaterials(organizationId: string): Promise<MaterialsResponseV1> {
    const { rows } = await this.library(organizationId);
    return {
      // A workspace that has written nothing yet is empty, not broken.
      state: rows.length ? 'default' : 'empty',
      materials: rows,
      derived: [],
    };
  }

  /**
   * The archive, filtered and paginated (`content-factory-next-odb8.4`).
   *
   * The library is loaded whole exactly as `listMaterials` already loads it —
   * `library()` is the one place a piece becomes a row, and a second copy of
   * that arithmetic is how a filtered row and an unfiltered row start
   * disagreeing about a piece's own code or post count. Filtering and paging
   * happen after, in memory, which is the same cost this endpoint already
   * pays today for every workspace regardless of how few pieces it filters
   * down to; pushing the `tags.archive.*` filters into the SQL itself is real
   * future work, named in the handoff rather than done here.
   */
  async listArchive(
    organizationId: string,
    filters: {
      layer?: ArchiveLayer;
      platform?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    state: 'empty' | 'filtered-empty' | 'default';
    materials: ArchiveMaterialRow[];
    page: number;
    limit: number;
    total: number;
    counts: Record<ArchiveLayer, number>;
  }> {
    const { pieces, rows } = await this.library(organizationId);
    const platformsByPiece = await this.repository.platformsByPiece(
      organizationId,
      pieces.map((piece) => piece.id)
    );

    const fromTime = parseFilterDate(filters.from);
    const toTime = parseFilterDate(filters.to);

    const counts = ARCHIVE_LAYERS.reduce(
      (acc, layer) => ({ ...acc, [layer]: 0 }),
      {} as Record<ArchiveLayer, number>
    );

    const decorated = pieces.map((piece, index) => {
      const layer = archiveLayerOf(piece.tags);
      counts[layer] += 1;
      const origin = archiveOriginOf(piece.tags);
      const platforms =
        layer === 'MADE_HERE'
          ? platformsByPiece.get(piece.id) ?? []
          : origin?.platform
          ? [origin.platform]
          : [];
      return { piece, row: rows[index], layer, origin, platforms };
    });

    const filtered = decorated.filter((item) => {
      if (filters.layer && item.layer !== filters.layer) return false;
      if (filters.platform && !item.platforms.includes(filters.platform)) {
        return false;
      }
      const createdAt = item.piece.createdAt.getTime();
      if (fromTime !== null && createdAt < fromTime) return false;
      if (toTime !== null && createdAt > toTime) return false;
      return true;
    });

    // Newest first: the archive is a flat, filterable feed, not the
    // library's own oldest-first shelf — `content-section-map.md` §8.1 makes
    // that call for the witness screen, and a "what did I just bring in"
    // archive reads the same way.
    filtered.sort(
      (left, right) => right.piece.createdAt.getTime() - left.piece.createdAt.getTime()
    );

    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const page = Math.max(filters.page ?? 0, 0);
    const total = filtered.length;
    const pageItems = filtered.slice(page * limit, page * limit + limit);

    const materials: ArchiveMaterialRow[] = pageItems.map((item) => ({
      ...item.row,
      layer: item.layer,
      platforms: item.platforms,
      contentContextSnapshotId: item.piece.contentContextSnapshotId,
      origin: item.origin,
    }));

    return {
      state: pieces.length === 0 ? 'empty' : total === 0 ? 'filtered-empty' : 'default',
      materials,
      page,
      limit,
      total,
      counts,
    };
  }

  /**
   * «Занесение своего прежнего»: a text this workspace already owns, typed or
   * pasted in rather than written by the factory. `docs/product/content-section-map.md`
   * §6 is explicit that this needs no consent screen — the two cases it names
   * with "вопроса нет вовсе" are «своё слово» and «свой текст», and a person's
   * own writing brought into its own archive is the second one exactly. The
   * one case that does need consent, a whole third-party text, is out of
   * scope here; nothing on this path claims to have checked a right this
   * workspace does not need to have.
   */
  async importArchiveMaterial(
    organizationId: string,
    actorUserId: string,
    input: {
      origin: ImportableArchiveLayer;
      title: string;
      body: string;
      language: 'ru' | 'en';
      platform?: string;
      url?: string;
      publishedAt?: string;
      note?: string;
    }
  ): Promise<{ id: string; layer: ImportableArchiveLayer }> {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) {
      throw archiveImportInvalid(
        'Нужны заголовок и текст, чтобы занести материал в архив'
      );
    }
    const tags = buildArchiveTags(null, {
      origin: input.origin,
      platform: input.platform,
      url: input.url,
      publishedAt: input.publishedAt,
      note: input.note,
    });
    const created = await this.repository.createArchivePiece({
      organizationId,
      createdByUserId: actorUserId,
      title,
      body,
      language: input.language,
      tags,
    });
    return { id: created.id, layer: input.origin };
  }

  private async open(organizationId: string, id: string) {
    const { pieces, rows } = await this.library(organizationId);
    const index = pieces.findIndex((piece) => piece.id === id);
    if (index < 0) throw materialNotFound(id);
    const derivations = await this.repository.listDerivations(
      organizationId,
      id
    );
    const derived: MaterialDerivedPostV1[] = derivations.map(
      (derivation: any) => ({
        platform: derivation.platform as RecutPlatform,
        state: derivationState(derivation.state),
        date: materialDate(derivation.createdAt, pieces[index].language),
      })
    );
    return { piece: pieces[index], row: rows[index], rows, derived };
  }

  async getDerivations(
    organizationId: string,
    id: string
  ): Promise<MaterialsResponseV1> {
    const opened = await this.open(organizationId, id);
    return {
      state: 'selected',
      materials: opened.rows,
      derived: opened.derived,
    };
  }

  async previewRecut(
    organizationId: string,
    id: string,
    request: MaterialRecutRequestV1
  ): Promise<MaterialsResponseV1> {
    const platform = this.platform(request?.platform);
    const opened = await this.open(organizationId, id);
    const preview = previewRecut({
      body: opened.piece.body,
      images: countImages(opened.piece.body, opened.piece.tags),
      links: countLinks(opened.piece.body),
      platform,
    });
    return {
      state: 'selected',
      materials: opened.rows,
      derived: opened.derived,
      recut: {
        code: opened.row.code,
        platform,
        voiceVersion: opened.row.voiceVersion,
        changes: preview.changes,
        unchanged: preview.unchanged,
      },
    };
  }

  /**
   * Turning a piece into a draft.
   *
   * The draft carries the material's own text. The preview said what a recut
   * would change; changing it here would cut the text away before anyone had
   * seen the sentence that said it would be cut. The person edits, and the
   * ordinary publishing path sends it.
   */
  async createDraft(
    organizationId: string,
    id: string,
    request: MaterialDraftRequestV1
  ): Promise<MaterialDraftResponseV1> {
    const platform = this.platform(request?.platform);
    const piece: PieceRow = await this.repository.getPiece(organizationId, id);

    const channel = request?.integrationId
      ? await this.repository.findIntegration(
          organizationId,
          request.integrationId
        )
      : await this.repository.findIntegrationForPlatform(
          organizationId,
          PLATFORM_PROVIDERS[platform]
        );
    if (!channel) {
      // Named rather than generic: "нет канала" over a workspace that has four
      // of them is a sentence nobody can act on.
      throw platformUnsupported(
        platform,
        'В рабочем пространстве нет подключённого канала для этой площадки'
      );
    }

    const written = await this.repository.createDraft({
      organizationId,
      contentPieceId: piece.id,
      integrationId: channel.id,
      platform,
      format: materialFormat(piece.body, piece.tags, piece.language),
      brandProfileVersionId: piece.brandProfileVersionId,
      contentContextSnapshotId: piece.contentContextSnapshotId,
      title: piece.title,
      content: piece.body,
      publishDate: this.now(),
      group: randomUUID(),
    });

    return {
      postId: written.postId,
      derivationId: written.derivationId,
      contentPieceId: piece.id,
      platform,
    };
  }

  private platform(value: unknown): RecutPlatform {
    if (!isRecutPlatform(value)) {
      throw platformUnsupported(
        String(value ?? ''),
        'Эта площадка не поддерживается перекройкой'
      );
    }
    return value;
  }
}
