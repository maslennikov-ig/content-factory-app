/**
 * Хранилище заготовок и адаптаций.
 *
 * `content-factory-next-tu3k.9.3`. Каждое чтение и каждая запись несут
 * `organizationId`, и модели ограничены `@@unique([organizationId, id])`, так
 * что чужая заготовка недостижима даже с её идентификатором в руках.
 *
 * Двух вещей здесь нет намеренно:
 *
 *  - **своего запроса за адаптациями**. Их читает
 *    `ContentMaterialRepository.adaptationsByPiece` — один `findMany` вместе с
 *    постами, — и он инжектирован сюда целиком. Второй такой запрос стал бы
 *    вторым местом, где живёт правило «состояние читается из поста», а первое
 *    из них уже однажды разошлось с правдой на три месяца;
 *  - **своей записи заготовки и адаптации**. Пишет `ContentBriefRepository`:
 *    там же, где живёт `createDraft`, то есть единственный путь продукта к
 *    созданию поста. Методы ниже — имена этих записей на стороне заготовок, а
 *    не вторая их реализация.
 */

import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import type { PiecesQueryV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  ContentMaterialRepository,
  type AdaptationRow,
} from '../materials/content-material.repository';
import { ContentBriefRepository } from '../brief/content-brief.repository';
import type { ReviewSnapshotV2 } from './review.v2.contract';
import { reviewConflict } from './adaptation-review.contract';
import { searchWords } from '../search-terms';
import { channelLockKey, supersededDraftPostIds } from './adaptation-plan';

type PrismaClientLike = Record<string, any>;

type ReviewDraftRow = {
  title: string | null;
  id: string; body: string | null; updatedAt: Date; postId: string | null;
  post: { id: string; content: string; updatedAt: Date; state: string; deletedAt: Date | null;
    /** `id` — the channel whose emoji ceiling the catalogue honours (`97dq.83`). */
    integration: { id?: string; providerIdentifier: string } } | null;
};

/** Канал области в том виде, в каком его читают колонки, цели и адаптация. */
export type PieceIntegrationRow = {
  id: string;
  name: string;
  providerIdentifier: string;
  contentLanguage: string | null;
  writingProfile: unknown;
  additionalSettings: string | null;
  /** Режим плана канала (`97dq.57`); `NULL` и отсутствие — «Бронь». */
  planMode?: string | null;
  /** `Integration.postingTimes` — JSON минут от полуночи UTC. */
  postingTimes?: string | null;
};

/** Окно замка канала: только решение и записи в базу, без Temporal (N2). */
export const PLAN_LOCK_MS = 10_000;

export type PlanWrite = {
  plan?: string | null;
  planNote?: string | null;
  plannedAt?: Date | null;
};

/** Чтения и записи плана поверх одного клиента — базового или транзакции замка. */
export type PlanDb = {
  channelVariants(
    organizationId: string,
    pieceId: string,
    integrationId: string
  ): Promise<PlanVariantRow[]>;
  busySlots(
    organizationId: string,
    integrationId: string,
    from: Date,
    to: Date,
    excludePostIds?: readonly string[]
  ): Promise<Date[]>;
  channelPlanMode(organizationId: string, integrationId: string): Promise<string | null>;
  /**
   * `ContentPiece.tags` — where a post's own plan mode lives (`97dq.70`,
   * `post-settings.ts`). Optional: a store without it reads every post as
   * «как в канале».
   */
  pieceTags?(organizationId: string, pieceId: string): Promise<unknown>;
  /**
   * `tags` заготовки под блокировкой строки (`SELECT … FOR UPDATE`) до конца
   * транзакции замка (`97dq.70`, ревью P1): чтение-слияние-запись настроек
   * поста не теряет параллельную запись другого канала той же заготовки.
   * `null` — заготовки нет.
   */
  lockPieceTags?(organizationId: string, pieceId: string): Promise<{ tags: unknown } | null>;
  /** Записать уже слитый мешок `tags` — только после `lockPieceTags`. */
  writePieceTags?(organizationId: string, pieceId: string, tags: unknown): Promise<boolean>;
  setPlan(
    organizationId: string,
    adaptationId: string,
    data: PlanWrite,
    onlyPlan?: string
  ): Promise<{ count: number }>;
  /** Состояние и/или время поста — только в базе; процесс публикации — после. */
  setPostState(
    organizationId: string,
    postId: string,
    data: { state?: 'DRAFT' | 'QUEUE'; publishDate?: Date }
  ): Promise<{ updatedAt: Date } | null>;
};

/** Версия адаптации канала, как её читает правило держателя слота (`97dq.57`). */
export type PlanVariantRow = {
  id: string;
  contentPieceId: string;
  integrationId: string | null;
  plan: string | null;
  planNote: string | null;
  plannedAt: Date | null;
  createdAt: Date;
  postId: string | null;
  post: {
    id: string;
    state: string;
    publishDate: Date;
    deletedAt: Date | null;
    integrationId: string;
    updatedAt?: Date;
  } | null;
};

/** Строка `ContentPiece`, как её читает список заготовок. */
export type PieceRow = {
  id: string;
  title: string;
  kind: string | null;
  body: string;
  brief: unknown;
  language: string;
  tags: unknown;
  archivedAt: Date | null;
  createdAt: Date;
  brandProfileVersion: {
    versionNumber: number | null;
    label: string | null;
  } | null;
};

/** Черновик адаптации, как его читает экран адаптации (`97dq.37`). */
export type WorkspaceDraftRow = {
  id: string;
  body: string | null;
  platform: string;
  mediaId: string | null;
  postId: string | null;
  post: {
    id: string;
    state: string;
    deletedAt: Date | null;
    publishDate?: Date | null;
    content: string;
    image: string | null;
    settings: string | null;
    integration: {
      id: string;
      name: string;
      providerIdentifier: string;
      additionalSettings: string | null;
      planMode?: string | null;
      postingTimes?: string | null;
    };
  } | null;
};

export type ReadyAdaptationRow = {
  id: string;
  title: string | null;
  body: string | null;
  updatedAt: Date;
  plan?: string | null;
  planNote?: string | null;
  piece: { id: string; title: string };
  post: {
    id: string;
    integrationId: string;
    content: string;
    state?: string;
    publishDate?: Date | null;
  };
};

@Injectable()
export class PieceRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly materials: ContentMaterialRepository,
    private readonly briefs: ContentBriefRepository
  ) {}

  private client(): PrismaClientLike {
    return this.repository.model as PrismaClientLike;
  }

  /**
   * Все заготовки области, от старых к новым.
   *
   * Архивные читаются ВСЕГДА, а прячет их сервис. Причина в коде заготовки:
   * `cnt-12` — это место строки в списке области, и список, суженный до
   * запроса или до неархивных, переставил бы номера — то есть код перестал бы
   * быть кодом. Ровно это записано у `searchPieceIds` старой вкладки, и здесь
   * то же правило доведено до архива.
   */
  listPieces(organizationId: string, _query?: PiecesQueryV1): Promise<PieceRow[]> {
    return this.client().contentPiece.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        kind: true,
        body: true,
        brief: true,
        language: true,
        tags: true,
        archivedAt: true,
        createdAt: true,
        brandProfileVersion: { select: { versionNumber: true, label: true } },
      },
    });
  }

  /**
   * Только порядок и идентификаторы — для кода одной открытой заготовки.
   *
   * Страница заготовки обязана напечатать тот же `cnt-12`, что и список, а код
   * известен только из порядка. Читать ради этого все тела — платить телом
   * каждой строки за одно число.
   */
  listPieceIds(organizationId: string): Promise<Array<{ id: string }>> {
    return this.client().contentPiece.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }

  /**
   * Adaptations that can still enter or move in the calendar: drafts and
   * queued posts (`97dq.57` — the picker shows the booked date instead of
   * hiding queued ones).
   *
   * State and channel identity come from the linked post. The derivation's
   * mirrored state and integrationId are intentionally not read. Superseded
   * variant drafts (not the slot holder of their piece and channel) are not
   * offered: one piece is one row per channel.
   */
  async listReadyAdaptations(
    organizationId: string,
    limit: number,
    integrationIds?: string[]
  ): Promise<ReadyAdaptationRow[]> {
    /*
      Superseded drafts are dropped page by page (`97dq.65`, F12): each page's
      own drafts are the only candidates, so no `NOT IN` list of every
      regenerated variant in the organisation is built. Pages keep the order,
      so the first `limit` visible rows are the same as before.
    */
    const client = this.client();
    const batch = Math.max(limit, 50);
    const ready: ReadyAdaptationRow[] = [];
    for (let skip = 0; ready.length < limit; skip += batch) {
      const rows: ReadyAdaptationRow[] = await this.readyAdaptationsPage(
        organizationId,
        skip,
        batch,
        integrationIds
      );
      const drafts = rows
        .filter((row) => String(row.post?.state) === 'DRAFT' && row.post?.id)
        .map((row) => row.post!.id);
      const hidden = new Set(
        drafts.length
          ? await supersededDraftPostIds(client, organizationId, null, {
              id: { in: drafts },
            })
          : []
      );
      for (const row of rows) {
        if (ready.length >= limit) break;
        if (row.post?.id && hidden.has(row.post.id)) continue;
        ready.push(row);
      }
      if (rows.length < batch) break;
    }
    return ready;
  }

  private readyAdaptationsPage(
    organizationId: string,
    skip: number,
    take: number,
    integrationIds?: string[]
  ): Promise<ReadyAdaptationRow[]> {
    return this.client().contentDerivation.findMany({
      where: {
        organizationId,
        post: {
          is: {
            organizationId,
            state: { in: ['DRAFT', 'QUEUE'] },
            ...(integrationIds ? { integrationId: { in: integrationIds } } : {}),
            deletedAt: null,
            integration: {
              is: { organizationId, deletedAt: null },
            },
          },
        },
        piece: { is: { organizationId } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        body: true,
        updatedAt: true,
        plan: true,
        planNote: true,
        piece: { select: { id: true, title: true } },
        post: {
          select: {
            id: true,
            integrationId: true,
            content: true,
            state: true,
            publishDate: true,
          },
        },
      },
    });
  }

  getPiece(organizationId: string, id: string): Promise<PieceRow | null> {
    return this.client().contentPiece.findFirst({
      where: { organizationId, id },
      select: {
        id: true,
        title: true,
        kind: true,
        body: true,
        brief: true,
        language: true,
        tags: true,
        archivedAt: true,
        createdAt: true,
        brandProfileVersion: { select: { versionNumber: true, label: true } },
      },
    });
  }

  /**
   * Поиск по словам: какие заготовки подходят под запрос.
   *
   * Тот же самый запрос, что у старой вкладки материалов
   * (`ContentMaterialRepository.searchPieceIds`), и не второй его экземпляр:
   * два поиска по одной таблице, разошедшиеся правилом разбора слов, — это две
   * разные вкладки, отвечающие на один запрос по-разному. Пустой запрос до
   * базы не доходит. Архив входит в ответ только по флагу — тем же, что
   * показывает архивные строки в списке.
   */
  async searchPieceIds(
    organizationId: string,
    query: string | null | undefined,
    includeArchived = false
  ): Promise<Set<string> | null> {
    const words = searchWords(query);
    if (!words.length) return null;
    const found: Array<{ id: string }> = await this.materials.searchPieceIds(
      organizationId,
      words,
      { includeArchived }
    );
    return new Set(found.map((row) => row.id));
  }

  /** Живые каналы области: колонки таблицы, цели адаптации и имена строк. */
  listIntegrations(organizationId: string): Promise<PieceIntegrationRow[]> {
    return this.client().integration.findMany({
      where: { organizationId, deletedAt: null, disabled: false },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        name: true,
        providerIdentifier: true,
        contentLanguage: true,
        writingProfile: true,
        additionalSettings: true,
        planMode: true,
        postingTimes: true,
      },
    });
  }

  /* ---- План канала (`content-factory-next-97dq.57`) --------------------- */

  /**
   * Чтения и записи плана поверх данного клиента: базового или транзакции
   * замка. Под замком всё идёт через `tx`, поэтому истёкший замок обрывает
   * работу: следующая запись бросит, и транзакция откатится целиком (N2).
   */
  private planDb(client: PrismaClientLike): PlanDb {
    return {
      channelVariants: (organizationId, pieceId, integrationId) =>
        client.contentDerivation.findMany({
          where: {
            organizationId,
            contentPieceId: pieceId,
            OR: [
              { post: { is: { organizationId, integrationId } } },
              { postId: null, integrationId },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            contentPieceId: true,
            integrationId: true,
            plan: true,
            planNote: true,
            plannedAt: true,
            createdAt: true,
            postId: true,
            post: {
              select: {
                id: true,
                state: true,
                publishDate: true,
                deletedAt: true,
                integrationId: true,
                updatedAt: true,
              },
            },
          },
        }),
      busySlots: async (organizationId, integrationId, from, to, excludePostIds = []) => {
        const hidden = await supersededDraftPostIds(client, organizationId, integrationId, {
          parentPostId: null,
          publishDate: { gte: from, lte: to },
        });
        const skip = [...new Set([...hidden, ...excludePostIds])];
        const rows: Array<{ publishDate: Date }> = await client.post.findMany({
          where: {
            organizationId,
            integrationId,
            deletedAt: null,
            parentPostId: null,
            publishDate: { gte: from, lte: to },
            ...(skip.length ? { id: { notIn: skip } } : {}),
          },
          select: { publishDate: true },
        });
        return rows.map((row) => row.publishDate);
      },
      channelPlanMode: async (organizationId, integrationId) => {
        const row = await client.integration.findFirst({
          where: { organizationId, id: integrationId, deletedAt: null },
          select: { planMode: true },
        });
        return row?.planMode ?? null;
      },
      pieceTags: async (organizationId, pieceId) => {
        const row = await client.contentPiece.findFirst({
          where: { organizationId, id: pieceId },
          select: { tags: true },
        });
        return row?.tags ?? null;
      },
      lockPieceTags: async (organizationId, pieceId) => {
        const rows: Array<{ tags: unknown }> = await client.$queryRaw`SELECT "tags" FROM "ContentPiece" WHERE "organizationId" = ${organizationId} AND "id" = ${pieceId} FOR UPDATE`;
        return rows?.[0] ? { tags: rows[0].tags ?? null } : null;
      },
      writePieceTags: async (organizationId, pieceId, tags) => {
        const saved = await client.contentPiece.updateMany({
          where: { organizationId, id: pieceId },
          data: { tags: tags as any },
        });
        return saved.count === 1;
      },
      setPlan: (organizationId, adaptationId, data, onlyPlan) =>
        client.contentDerivation.updateMany({
          where: {
            organizationId,
            id: adaptationId,
            ...(onlyPlan ? { plan: onlyPlan } : {}),
          },
          data,
        }),
      setPostState: async (organizationId, postId, data) => {
        const saved = await client.post.updateMany({
          where: { organizationId, id: postId, deletedAt: null },
          data: {
            ...(data.state ? { state: data.state } : {}),
            ...(data.publishDate ? { publishDate: data.publishDate } : {}),
          },
        });
        if (saved.count !== 1) return null;
        const row = await client.post.findFirst({
          where: { organizationId, id: postId },
          select: { updatedAt: true },
        });
        return row ? { updatedAt: row.updatedAt } : null;
      },
    };
  }

  /** Все версии заготовки в этом канале — с постами, для правила держателя. */
  channelVariants(organizationId: string, pieceId: string, integrationId: string) {
    return this.planDb(this.client()).channelVariants(organizationId, pieceId, integrationId);
  }

  /**
   * Времена, уже занятые ЭТИМ каналом в окне: живые посты канала, кроме
   * черновиков вытесненных версий и явно исключённых постов (держатель,
   * которого сейчас сменит новая версия).
   */
  busySlots(
    organizationId: string,
    integrationId: string,
    from: Date,
    to: Date,
    excludePostIds: readonly string[] = []
  ) {
    return this.planDb(this.client()).busySlots(organizationId, integrationId, from, to, excludePostIds);
  }

  /**
   * Режим плана канала, прочитанный заново (`97dq.57`, review F8): генерация
   * идёт минуты, и режим, прочитанный в её начале, мог смениться.
   */
  channelPlanMode(organizationId: string, integrationId: string) {
    return this.planDb(this.client()).channelPlanMode(organizationId, integrationId);
  }

  /** `ContentPiece.tags` заготовки (`97dq.70`): там живут настройки постов. */
  pieceTags(organizationId: string, pieceId: string) {
    return this.planDb(this.client()).pieceTags!(organizationId, pieceId);
  }

  /**
   * Заготовки, у которых в этом канале есть живой пост (`97dq.70`): для
   * вопроса «применить к N уже написанным» при смене режима канала. Строки —
   * версии с их постами и `tags` заготовки; держателя и «не вышло» решает
   * сервис по правилу `adaptation-plan.ts`.
   */
  channelPieceVariants(organizationId: string, integrationId: string): Promise<
    Array<PlanVariantRow & { piece: { tags: unknown; archivedAt: Date | null } | null }>
  > {
    return this.client().contentDerivation.findMany({
      where: {
        organizationId,
        postId: { not: null },
        post: { is: { organizationId, integrationId, deletedAt: null } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        contentPieceId: true,
        integrationId: true,
        plan: true,
        planNote: true,
        plannedAt: true,
        createdAt: true,
        postId: true,
        post: {
          select: {
            id: true,
            state: true,
            publishDate: true,
            deletedAt: true,
            integrationId: true,
            updatedAt: true,
          },
        },
        piece: { select: { tags: true, archivedAt: true } },
      },
    });
  }

  /**
   * Отметка плана на версии. `onlyPlan` — запись только если версия ещё
   * несёт этот план (снять метку автопилота, не трогая остальные).
   */
  setPlan(
    organizationId: string,
    adaptationId: string,
    data: PlanWrite,
    onlyPlan?: string
  ) {
    return this.planDb(this.client()).setPlan(organizationId, adaptationId, data, onlyPlan);
  }

  /**
   * Один постановщик на (область, заготовка, канал) за раз (`97dq.57`,
   * review F4, N2): два параллельных прогона одной заготовки в один канал
   * иначе оба увидели бы «очереди нет» и оба поставили бы свою версию.
   *
   * Транзакционная рекомендательная блокировка Postgres
   * (`pg_advisory_xact_lock`) держится, пока открыта транзакция, и снимается
   * сама при её конце. Под замком — только решение и записи в базу через
   * `db` этой же транзакции; Temporal вызывается после фиксации. Окно
   * короткое (10 с): замок, который истёк, откатывает всё, что под ним было
   * записано, и работа дальше не идёт. Ключ — `hashtext` строки:
   * столкновение ключей лишь сериализует две постановки.
   */
  withChannelLock<T>(
    organizationId: string,
    pieceId: string,
    integrationId: string,
    work: (db: PlanDb) => Promise<T>
  ): Promise<T> {
    const key = channelLockKey(organizationId, pieceId, integrationId);
    return this.client().$transaction(
      async (tx: PrismaClientLike) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS held`;
        return work(this.planDb(tx));
      },
      { maxWait: PLAN_LOCK_MS, timeout: PLAN_LOCK_MS }
    );
  }

  /** Адаптации этих заготовок — вместе с постами, одним запросом. */
  adaptationsByPiece(
    organizationId: string,
    pieceIds: string[]
  ): Promise<AdaptationRow[]> {
    return this.materials.adaptationsByPiece(organizationId, pieceIds);
  }

  /** Заготовка. Запись живёт в `ContentBriefRepository`, здесь только имя. */
  createCore(
    organizationId: string,
    input: Parameters<ContentBriefRepository['recordCore']>[1]
  ) {
    return this.briefs.recordCore(organizationId, input);
  }

  /** Адаптация. Та же запись, что делает вход одной мыслью. */
  createAdaptation(
    organizationId: string,
    input: Parameters<ContentBriefRepository['recordAdaptation']>[1]
  ) {
    return this.briefs.recordAdaptation(organizationId, input);
  }

  /** Черновик и пост под адаптацию — тем же путём, что и любой другой пост. */
  createDraft(
    organizationId: string,
    input: Parameters<ContentBriefRepository['createDraft']>[1]
  ) {
    return this.briefs.createDraft(organizationId, input);
  }

  /** Квитанция «что модель поняла», переписанная целиком. */
  updateBrief(organizationId: string, pieceId: string, brief: unknown) {
    return this.client().contentPiece.updateMany({
      where: { organizationId, id: pieceId },
      data: { brief: brief as any },
    });
  }

  /**
   * Одна адаптация вместе с состоянием её поста.
   *
   * Пост читается двумя полями и только ими: удалять адаптацию нельзя, когда
   * пост опубликован и не удалён, и никакого другого факта о посте это
   * решение не спрашивает.
   */
  findAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string
  ): Promise<{
    id: string;
    postId: string | null;
    post: { state: string; deletedAt: Date | null } | null;
  } | null> {
    return this.client().contentDerivation.findFirst({
      where: { organizationId, id: adaptationId, contentPieceId: pieceId },
      select: {
        id: true,
        postId: true,
        post: { select: { state: true, deletedAt: true } },
      },
    });
  }

  /** Read the exact draft that is about to be reviewed, scoped through both relations. */
  reviewDraft(organizationId: string, pieceId: string, adaptationId: string): Promise<ReviewDraftRow | null> {
    return this.client().contentDerivation.findFirst({
      where: { organizationId, contentPieceId: pieceId, id: adaptationId },
      select: {
        id: true, title: true, body: true, updatedAt: true, postId: true,
        post: { select: { id: true, content: true, updatedAt: true, state: true, deletedAt: true,
          integration: { select: { id: true, providerIdentifier: true } } } },
      },
    });
  }

  /**
   * Both compare-and-swap updates must succeed; throwing rolls back the first
   * one. V2 also protects and atomically writes the independent adaptation
   * title. The accept without a title (`acceptReview`) is gone with the
   * service door that called it (`97dq.18`).
   */
  acceptReviewV2(organizationId: string, pieceId: string, adaptationId: string,
    snapshot: ReviewSnapshotV2, text: string, content: string, title: string | null) {
    return this.client().$transaction(async (tx: PrismaClientLike) => {
      const adaptation = await tx.contentDerivation.updateMany({
        where: { organizationId, contentPieceId: pieceId, id: adaptationId,
          postId: snapshot.postId, body: snapshot.adaptationBody, title: snapshot.adaptationTitle,
          updatedAt: new Date(snapshot.adaptationUpdatedAt) },
        data: { body: text, title },
      });
      if (adaptation.count !== 1) throw reviewConflict();
      const post = await tx.post.updateMany({
        where: { organizationId, id: snapshot.postId, state: 'DRAFT', deletedAt: null,
          content: snapshot.postContent, updatedAt: new Date(snapshot.postUpdatedAt) },
        data: { content },
      });
      if (post.count !== 1) throw reviewConflict();
      return { accepted: true as const };
    });
  }

  /**
   * Аватар области для «Кто говорит» (`content-factory-next-97dq.38`).
   *
   * Только живой и только свой: `organizationId` в том же `where`, так что
   * чужой идентификатор читается как отсутствующий. Голос аватара — его
   * `activeVersionId`; без него писать от имени аватара нечем.
   */
  findAvatar(
    organizationId: string,
    avatarId: string
  ): Promise<{ id: string; activeVersionId: string | null } | null> {
    return this.client().projectBrandProfile.findFirst({
      where: { organizationId, id: avatarId, deletedAt: null },
      select: { id: true, activeVersionId: true },
    });
  }

  /**
   * Черновик адаптации для экрана адаптации (`97dq.37`): строка, её пост и
   * канал поста. Обе связи — через `organizationId`.
   */
  workspaceDraft(
    organizationId: string,
    pieceId: string,
    adaptationId: string
  ): Promise<WorkspaceDraftRow | null> {
    return this.client().contentDerivation.findFirst({
      where: { organizationId, contentPieceId: pieceId, id: adaptationId },
      select: {
        id: true,
        body: true,
        platform: true,
        mediaId: true,
        postId: true,
        post: {
          select: {
            id: true,
            state: true,
            deletedAt: true,
            publishDate: true,
            content: true,
            image: true,
            settings: true,
            integration: {
              select: {
                id: true,
                name: true,
                providerIdentifier: true,
                additionalSettings: true,
                planMode: true,
                postingTimes: true,
              },
            },
          },
        },
      },
    });
  }

  /** Файл медиатеки этой области — тот, что человек выбрал в «картинке». */
  findMedia(
    organizationId: string,
    mediaId: string
  ): Promise<{
    id: string;
    path: string;
    alt: string | null;
    thumbnail: string | null;
  } | null> {
    return this.client().media.findFirst({
      where: { organizationId, id: mediaId, deletedAt: null },
      select: { id: true, path: true, alt: true, thumbnail: true },
    });
  }

  /**
   * Ручная правка: тело адаптации и её черновик одной транзакцией.
   *
   * Пост меняется, пока он `DRAFT` и не удалён, или стоит в очереди со
   * слотом позже `queuedAfter` (`97dq.80`): публикация читает текст из базы
   * в момент выхода, поэтому правка меняет только текст и картинку — дата и
   * состояние остаются, публикация не перезапускается. Без `queuedAfter`
   * очередь закрыта, как раньше. Любой из двух промахов бросает и откатывает
   * первую запись; какой именно, говорит `reason`.
   */
  editAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string,
    postId: string,
    change: {
      body?: string;
      content?: string;
      image?: string;
      mediaId?: string | null;
    },
    queuedAfter?: Date
  ) {
    return this.client().$transaction(async (tx: PrismaClientLike) => {
      const derivation = await tx.contentDerivation.updateMany({
        where: { organizationId, contentPieceId: pieceId, id: adaptationId, postId },
        data: {
          ...(change.body !== undefined ? { body: change.body } : {}),
          ...(change.mediaId !== undefined ? { mediaId: change.mediaId } : {}),
        },
      });
      if (derivation.count !== 1)
        throw Object.assign(new Error('adaptation moved'), { reason: 'ADAPTATION_NOT_FOUND' });
      const post = await tx.post.updateMany({
        where: {
          organizationId,
          id: postId,
          deletedAt: null,
          ...(queuedAfter
            ? {
                OR: [
                  { state: 'DRAFT' },
                  { state: 'QUEUE', publishDate: { gt: queuedAfter } },
                ],
              }
            : { state: 'DRAFT' }),
        },
        data: {
          ...(change.content !== undefined ? { content: change.content } : {}),
          ...(change.image !== undefined ? { image: change.image } : {}),
        },
      });
      if (post.count !== 1) {
        // Промах записи называется по тому, что с постом сейчас (ревью P3-3):
        // удалён или заменён, ошибка публикации, ушёл в канал.
        const now = await tx.post.findFirst({
          where: { organizationId, id: postId },
          select: { state: true, deletedAt: true },
        });
        const state = String(now?.state || '').toUpperCase();
        const reason =
          !now || now.deletedAt
            ? 'ADAPTATION_POST_GONE'
            : state === 'ERROR'
              ? 'ADAPTATION_POST_FAILED'
              : queuedAfter
                ? 'ADAPTATION_EDIT_CLOSED'
                : 'ADAPTATION_NOT_DRAFT';
        throw Object.assign(new Error('post is not editable'), { reason });
      }
      return { saved: true as const };
    });
  }

  /**
   * Снятие адаптации — строки происхождения, а не поста.
   *
   * Пост остаётся: он мог быть отправлен, запланирован или просто открыт в
   * окне, и удалять чужую работу заодно с записью о ней никто не просил.
   * `deleteMany` вместо `delete` ровно ради `organizationId` в `where`: у
   * `delete` условие обязано быть уникальным ключом, и запись в другую область
   * отличалась бы от этой одной строкой.
   */
  deleteAdaptation(
    organizationId: string,
    pieceId: string,
    adaptationId: string
  ) {
    return this.client().contentDerivation.deleteMany({
      where: { organizationId, id: adaptationId, contentPieceId: pieceId },
    });
  }

  async acceptCoreReview(organizationId: string, pieceId: string, snapshot: { body: string; brief: unknown; title: string }, body: string, title: string, brief: unknown) {
    const saved = await this.client().contentPiece.updateMany({
      where: { organizationId, id: pieceId, body: snapshot.body, title: snapshot.title, brief: { equals: snapshot.brief as any } },
      data: { body, title, brief: brief as any },
    });
    if (!saved.count) throw reviewConflict();
    return { body, title };
  }

  archive(organizationId: string, pieceId: string, archivedAt: Date | null) {
    return this.client().contentPiece.updateMany({
      where: { organizationId, id: pieceId },
      data: { archivedAt },
    });
  }

  /**
   * Удалить заготовку с её адаптациями (`97dq.30`). Посты не трогаются: у
   * `ContentDerivation.post` связи на удаление нет, и опубликованное остаётся
   * там, где опубликовано. Строки адаптаций снимаются явно, а не только
   * каскадом внешнего ключа: так удаление читается из кода, а не из схемы.
   * Оба `deleteMany` — с областью: промахнуться по чужой заготовке нечем.
   */
  async delete(organizationId: string, pieceId: string): Promise<number> {
    await this.client().contentDerivation.deleteMany({
      where: { organizationId, contentPieceId: pieceId },
    });
    const removed = await this.client().contentPiece.deleteMany({
      where: { organizationId, id: pieceId },
    });
    return removed.count as number;
  }
}
