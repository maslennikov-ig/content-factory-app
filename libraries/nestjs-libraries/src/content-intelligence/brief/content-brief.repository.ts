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
import { createHash } from 'node:crypto';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { PostsRepository } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository';
import { Prisma, type CreationMethod } from '@prisma/client';
// Which avatar a space means when it does not say — one rule, one place.
import { DEFAULT_AVATAR_FIRST } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
// Код заготовки печатается одной функцией на весь раздел: `cnt-12` в стриме и
// `cnt-12` в списке — это одно и то же число, а не два похожих.
import { materialCode, kindsOfProvider } from '@contentfactory/nestjs-libraries/content-intelligence/materials/material-presentation';
import { coreDigest, materialAskRecordOf, mayAskMaterial, withMaterialAsk, type MaterialAskRecordV1 } from '../pieces/material-asks';

export type AdaptationSeriesInput = {
  seriesId: string;
  actorUserId: string;
  pieceId: string;
  channelId: string;
  providerIdentifier: string;
  kind: string;
  sourceBody: string;
  sourceBrief: unknown;
  date: string;
  parts: Array<{ body: string; content: string; title: string | null; format: string; usedCitationIds?: string[] }>;
  contentContextSnapshotId?: string | null;
  brandProfileVersionId?: string | null;
  materialAsk?: MaterialAskRecordV1;
};
export type AdaptationSeriesPart = { adaptationId: string; postId: string; createdAt: string; title: string | null };
export type AdaptationSeriesResult = { seriesId: string; parts: AdaptationSeriesPart[]; created: boolean };

type SeriesReceipt = { seriesId: string; actorUserId: string; channelId: string; fingerprint: string;
  parts: Array<AdaptationSeriesPart & { ordinal: number }> };
const seriesError = (code: string, message: string) => Object.assign(new Error(message), { code });
const withoutSeries = (brief: unknown): Record<string, unknown> => {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
    throw seriesError('ADAPTATION_SERIES_UNAVAILABLE', 'The saved source brief is unavailable.');
  }
  const { adaptationSeries: _receipts, ...rest } = brief as Record<string, unknown>;
  return rest;
};
// PostgreSQL JSONB may return object keys in a different order from the input.
const canonicalJson = (value: unknown) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const seriesFingerprint = (organizationId: string, input: AdaptationSeriesInput) =>
  createHash('sha256').update(canonicalJson({ organizationId, ...input, sourceBrief: withoutSeries(input.sourceBrief) })).digest('hex');

/** The receipt is server-owned and may only come from the version being replaced. */
const retainSeriesReceipts = (next: unknown, prior: unknown): unknown => {
  if (!next || typeof next !== 'object' || Array.isArray(next)) {
    if (prior && typeof prior === 'object' && !Array.isArray(prior) &&
        Object.prototype.hasOwnProperty.call(prior, 'adaptationSeries')) {
      throw seriesError('ADAPTATION_SERIES_CONFLICT', 'The series receipt cannot be discarded.');
    }
    return next;
  }
  const { adaptationSeries: _incoming, ...rest } = next as Record<string, unknown>;
  if (prior && typeof prior === 'object' && !Array.isArray(prior) &&
      Object.prototype.hasOwnProperty.call(prior, 'adaptationSeries')) {
    return { ...rest, adaptationSeries: (prior as Record<string, unknown>).adaptationSeries };
  }
  return rest;
};

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
      /**
       * На чём стоит текст, если черновик написала модель
       * (`content-factory-next-tu3k.1`). Все три поля необязательны и приходят
       * вместе: бриф собирает текст сам, без единого вызова модели, и ему
       * цитировать нечего, а вход одной мыслью получает их от генератора.
       *
       * Порядок проверки не наш: `PostsRepository.createOrUpdatePost`
       * отказывает `CONTENT_CONTEXT_INPUT_INVALID`, если версия голоса или
       * цитаты пришли без снимка контекста. Поэтому без снимка два других
       * поля не отправляются вовсе — иначе строка происхождения в окне поста
       * стоила бы человеку черновика.
       */
      contentContextSnapshotId?: string | null;
      brandProfileVersionId?: string | null;
      usedCitationIds?: string[];
    }
  ): Promise<string | null> {
    const snapshotId = input.contentContextSnapshotId || undefined;
    const created = await this.posts.createOrUpdatePost(
      'draft',
      organizationId,
      input.date,
      {
        integration: { id: input.channelId },
        value: [
          {
            content: input.content,
            image: [],
            ...(snapshotId && input.usedCitationIds
              ? { usedCitationIds: input.usedCitationIds }
              : {}),
          },
        ],
        settings: { __type: input.providerIdentifier },
        ...(snapshotId ? { contentContextSnapshotId: snapshotId } : {}),
        ...(snapshotId && input.brandProfileVersionId
          ? { brandProfileVersionId: input.brandProfileVersionId }
          : {}),
      } as any,
      [],
      'WEB' as CreationMethod
    );
    return created?.posts?.[0]?.id ?? null;
  }

  /** All drafts, derivations and the completed receipt share one transaction. */
  async createAdaptationSeries(organizationId: string, input: AdaptationSeriesInput): Promise<AdaptationSeriesResult> {
    if (!input.seriesId || !input.actorUserId || !input.pieceId || !input.channelId || !input.providerIdentifier || !input.kind ||
        !Array.isArray(input.parts) || !input.parts.length || input.parts.some(part => !part ||
          typeof part.body !== 'string' || !part.body.trim() || typeof part.content !== 'string' || !part.content.trim() ||
          typeof part.format !== 'string' || !part.format || (part.title !== null && typeof part.title !== 'string'))) {
      throw seriesError('ADAPTATION_SERIES_INVALID', 'The series input is incomplete.');
    }
    const fingerprint = seriesFingerprint(organizationId, input);
    const unavailable = () => seriesError('ADAPTATION_SERIES_UNAVAILABLE', 'The source, channel or membership is unavailable.');
    const changed = () => seriesError('ADAPTATION_SERIES_SOURCE_CHANGED', 'The source changed before the series was saved.');
    const conflict = () => seriesError('ADAPTATION_SERIES_CONFLICT', 'The series receipt belongs to different input or another person.');
    return this.client().$transaction(async (tx: PrismaClientLike) => {
      const member = await tx.userOrganization.findFirst({ where: { organizationId, userId: input.actorUserId, disabled: false }, select: { id: true, role: true } });
      if (!member || !['EDITOR', 'ADMIN', 'SUPERADMIN'].includes(member.role)) throw unavailable();
      const where = { id: input.pieceId, kind: 'CORE', archivedAt: null as null };
      const read = () => tx.contentPiece.findFirst({ where: { ...where, organizationId }, select: { body: true, brief: true, tags: true } });
      const receiptsOf = (brief: any): SeriesReceipt[] => {
        if (brief?.adaptationSeries === undefined) return [];
        if (!Array.isArray(brief.adaptationSeries)) throw conflict();
        return brief.adaptationSeries;
      };
      const replay = async (brief: any): Promise<AdaptationSeriesResult | null> => {
        const matches = receiptsOf(brief).filter(receipt => receipt?.seriesId === input.seriesId);
        if (!matches.length) return null;
        if (matches.length !== 1) throw conflict();
        const receipt = matches[0];
        if (receipt.actorUserId !== input.actorUserId || receipt.channelId !== input.channelId || receipt.fingerprint !== fingerprint ||
            !Array.isArray(receipt.parts) || receipt.parts.length !== input.parts.length ||
            receipt.parts.some((part, index) => !part || part.ordinal !== index + 1 || typeof part.adaptationId !== 'string' ||
              typeof part.postId !== 'string' || typeof part.createdAt !== 'string' || (part.title !== null && typeof part.title !== 'string'))) throw conflict();
        const rows = await tx.contentDerivation.findMany({ where: { organizationId, contentPieceId: input.pieceId,
          integrationId: input.channelId, id: { in: receipt.parts.map(part => part.adaptationId) } }, select: { id: true, postId: true } });
        if (rows.length !== receipt.parts.length || receipt.parts.some(part => !rows.some((row: any) => row.id === part.adaptationId && row.postId === part.postId))) throw unavailable();
        return { seriesId: input.seriesId, parts: receipt.parts.map(({ ordinal: _ordinal, ...part }) => part), created: false };
      };
      let piece = await read();
      if (!piece) throw unavailable();
      const prior = await replay(piece.brief);
      if (prior) return prior;
      // A conditional no-op update takes the row lock. Re-read under that lock
      // so concurrent receipts are merged and a source edit is never overwritten.
      const locked = await tx.contentPiece.updateMany({ where: { ...where, organizationId, body: input.sourceBody }, data: { body: input.sourceBody } });
      if (locked.count !== 1) throw changed();
      piece = await read();
      if (!piece) throw unavailable();
      const concurrent = await replay(piece.brief);
      if (concurrent) return concurrent;
      if (piece.body !== input.sourceBody || canonicalJson(withoutSeries(piece.brief)) !== canonicalJson(withoutSeries(input.sourceBrief))) throw changed();
      const channel = await tx.integration.updateMany({ where: { organizationId, id: input.channelId,
        providerIdentifier: input.providerIdentifier, deletedAt: null, disabled: false }, data: { providerIdentifier: input.providerIdentifier } });
      if (channel.count !== 1) throw unavailable();
      if (!kindsOfProvider(input.providerIdentifier).includes(input.kind as any)) throw unavailable();
      const parts: AdaptationSeriesPart[] = [];
      for (const part of input.parts) {
        const snapshotId = input.contentContextSnapshotId || undefined;
        const created = await this.posts.createOrUpdatePost('draft', organizationId, input.date, {
          integration: { id: input.channelId },
          value: [{ content: part.content, image: [], ...(snapshotId && part.usedCitationIds ? { usedCitationIds: part.usedCitationIds } : {}) }],
          settings: { __type: input.providerIdentifier },
          ...(snapshotId ? { contentContextSnapshotId: snapshotId } : {}),
          ...(snapshotId && input.brandProfileVersionId ? { brandProfileVersionId: input.brandProfileVersionId } : {}),
        } as any, [], 'WEB' as CreationMethod, undefined, tx);
        const postId = created?.posts?.[0]?.id;
        if (!postId) throw seriesError('ADAPTATION_SERIES_WRITE_FAILED', 'The draft was not saved.');
        const derivation = await tx.contentDerivation.create({ data: { organizationId, contentPieceId: input.pieceId,
          postId, integrationId: input.channelId, platform: input.providerIdentifier, kind: input.kind, title: part.title,
          body: part.body, format: part.format, brandProfileVersionId: snapshotId ? input.brandProfileVersionId ?? null : null,
          state: 'DRAFT' }, select: { id: true, createdAt: true } });
        parts.push({ adaptationId: derivation.id, postId, createdAt: derivation.createdAt.toISOString(), title: part.title });
      }
      const receipt: SeriesReceipt = { seriesId: input.seriesId, actorUserId: input.actorUserId, channelId: input.channelId,
        fingerprint, parts: parts.map((part, index) => ({ ...part, ordinal: index + 1 })) };
      const currentAsk = materialAskRecordOf(piece.tags, input.channelId);
      const ask = input.materialAsk;
      const tags = ask && ask.state === 'open' && ask.core === coreDigest(piece.body) && ask.questions.length &&
        mayAskMaterial(currentAsk, piece.body)
        ? withMaterialAsk(piece.tags, input.channelId, { ...ask, adaptationId: parts[0].adaptationId })
        : undefined;
      const saved = await tx.contentPiece.updateMany({ where: { ...where, organizationId }, data: { brief: { ...piece.brief,
        adaptationSeries: [...receiptsOf(piece.brief), receipt] }, ...(tags ? { tags } : {}) } });
      if (saved.count !== 1) throw unavailable();
      return { seriesId: input.seriesId, parts, created: true };
    }, { maxWait: 5_000, timeout: 30_000 });
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

  /**
   * Заготовка: суть простым текстом и то, что модель поняла, — одной строкой.
   *
   * `content-factory-next-tu3k.9.3`. Пишется ОДИН раз до цикла по каналам, и в
   * этом вся разница с `recordPiece` выше: тот заводил по материалу на каждый
   * канал с HTML одного канала в теле, и в библиотеке лежало три «текста» там,
   * где текст был один. `recordPiece` остался и не изменился — его зовёт
   * старая перекройка, — но со входа он больше не вызывается.
   *
   * Без производной, тоже намеренно: заготовка существует и до того, как её
   * куда-нибудь адаптировали. «Только заготовка, без каналов» — обычный исход
   * этой волны, а не полстроки.
   *
   * Отказ записи **бросается**, и это изменение волны
   * `content-factory-next-m2eg`. До неё он возвращался как `null`: суть уже
   * написана, черновики уже будут, и терять их из-за неудачной строки казалось
   * лишним. Живой прогон 07.09.2026 показал цену такой любезности — заготовки
   * нет, стрим идёт дальше как ни в чём не бывало, и человеку об этом не
   * говорят вовсе. Теперь весь раздел стоит на том, что заготовка записана
   * первой, поэтому её отсутствие — это отказ с кодом `PIECE_NOT_SAVED`, а не
   * тишина.
   */
  async recordCore(
    organizationId: string,
    input: {
      title: string;
      /** Нейтральная суть простым текстом. */
      body: string;
      /** `ZagotovkaCoreV1` без `text`. */
      brief: unknown;
      language: string;
      createdByUserId: string;
      brandProfileVersionId?: string | null;
      contentContextSnapshotId?: string | null;
    }
  ): Promise<{ id: string; code: string }> {
    const piece = await this.client().contentPiece.create({
      data: {
        organizationId,
        kind: 'CORE',
        title: input.title,
        body: input.body,
        brief: input.brief as any,
        language: input.language,
        createdByUserId: input.createdByUserId,
        brandProfileVersionId: input.brandProfileVersionId ?? null,
        contentContextSnapshotId: input.contentContextSnapshotId ?? null,
      },
      select: { id: true, createdAt: true },
    });
    if (!piece?.id) {
      throw new Error('The piece was written but the library kept no row');
    }
    /*
      Код возвращается вместе с идентификатором, потому что стрим обещает
      человеку строку «Заготовка сохранена — cnt-NN» сразу (§11.3 карты
      раздела), а код — это место строки в списке области. Только что
      созданная стоит последней, поэтому её место — это число уже
      существующих минус одна. Счёт, а не выборка: тела остальных заготовок
      ради одного числа никому не нужны.
    */
    const total = await this.client().contentPiece.count({
      where: { organizationId },
    });
    return { id: piece.id, code: materialCode(Math.max(0, total - 1)) };
  }

  /**
   * Переписанная суть и её бриф — той же строкой, что и была.
   *
   * `content-factory-next-m2eg`: человек ответил на открытые вопросы, суть
   * переписана, и версии здесь нет намеренно. Заготовка — это то, о чём
   * человек хочет рассказать, а не журнал того, как он это формулировал;
   * происхождение вышедшего текста хранит адаптация, и её ответ этот метод не
   * трогает вовсе.
   *
   * `updateMany` вместо `update` ровно ради `organizationId` в `where`: у
   * `update` условие обязано быть уникальным ключом, и запись в чужую область
   * отличалась бы от этой одной строкой.
   */
  async updateCoreMetadata(organizationId: string, pieceId: string, input: {
    title?: string; brief: unknown; expectedBody: string; expectedBrief: unknown;
  }): Promise<void> {
    const written = await this.client().contentPiece.updateMany({
      where: { organizationId, id: pieceId, body: input.expectedBody, brief: { equals: input.expectedBrief === null ? Prisma.AnyNull : input.expectedBrief as any } },
      data: { ...(input.title ? { title: input.title } : {}), brief: retainSeriesReceipts(input.brief, input.expectedBrief) as any },
    });
    if (!written?.count) throw new Error('The piece changed; reload before editing its metadata');
  }

  async updateCore(
    organizationId: string,
    pieceId: string,
    input: {
      /** Нейтральная суть простым текстом. */
      body: string;
      title?: string;
      /** `ZagotovkaCoreV1` без `text`. */
      brief: unknown;
      /**
       * Строка, поверх которой пишется (`97dq.75`, ревью P1-1/P1-2): пока шёл
       * вызов модели, автор мог дать ссылку или дописать материал. Не совпала —
       * отказ, и вызывающий перечитывает и сливает, а не затирает.
       */
      expected?: { body: string; brief: unknown };
    }
  ): Promise<void> {
    // Preserve server receipts from the exact source version covered by CAS.
    const expected = input.expected ?? await this.client().contentPiece.findFirst({
      where: { organizationId, id: pieceId }, select: { body: true, brief: true },
    });
    if (!expected) throw new Error('The rewritten core matched no piece of this workspace');
    const written = await this.client().contentPiece.updateMany({
      where: { organizationId, id: pieceId, body: expected.body, brief: { equals: expected.brief === null ? Prisma.AnyNull : expected.brief as any } },
      data: { body: input.body, brief: retainSeriesReceipts(input.brief, expected.brief) as any,
        ...(input.title ? { title: input.title } : {}) },
    });
    if (!written?.count) {
      throw new Error('The rewritten core matched no piece of this workspace');
    }
  }

  /**
   * Адаптация: текст под площадку и связь с постом, который его несёт.
   *
   * `state: 'DRAFT'` пишется, хотя ни одна строка кода эту колонку больше не
   * читает (`content-factory-next-tu3k.9.2`: состояние берётся из поста).
   * Колонка не обнулена и не снята — снос это отдельный план миграции, — и
   * пока она есть, писать в неё правду дешевле, чем оставлять её пустой для
   * того, кто прочтёт её старым кодом.
   */
  async recordAdaptation(
    organizationId: string,
    input: {
      pieceId: string;
      postId: string | null;
      integrationId: string;
      /** `providerIdentifier` канала: площадка, а не имя перекройки. */
      platform: string;
      kind: string;
      title?: string | null;
      /** Текст адаптации простым текстом, не разметкой редактора. */
      body: string;
      format: string;
      brandProfileVersionId?: string | null;
      mediaId?: string | null;
    }
  ): Promise<{ id: string; createdAt: Date } | null> {
    try {
      const derivation = await this.client().contentDerivation.create({
        data: {
          organizationId,
          contentPieceId: input.pieceId,
          postId: input.postId,
          integrationId: input.integrationId,
          platform: input.platform,
          format: input.format,
          kind: input.kind,
          title: input.title ?? null,
          body: input.body,
          mediaId: input.mediaId ?? null,
          brandProfileVersionId: input.brandProfileVersionId ?? null,
          state: 'DRAFT',
        },
        select: { id: true, createdAt: true },
      });
      return derivation ?? null;
    } catch {
      return null;
    }
  }
}
