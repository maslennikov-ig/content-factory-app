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
import { materialNotFound, platformUnsupported } from './errors';
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
