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
import { reviewConflict, type AdaptationReviewSnapshot } from './adaptation-review.contract';
import { searchWords } from '../search-terms';

type PrismaClientLike = Record<string, any>;

type ReviewDraftRow = {
  id: string; body: string | null; updatedAt: Date; postId: string | null;
  post: { id: string; content: string; updatedAt: Date; state: string; deletedAt: Date | null;
    integration: { providerIdentifier: string } } | null;
};

/** Канал области в том виде, в каком его читают колонки, цели и адаптация. */
export type PieceIntegrationRow = {
  id: string;
  name: string;
  providerIdentifier: string;
  contentLanguage: string | null;
  writingProfile: unknown;
  additionalSettings: string | null;
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

export type ReadyAdaptationRow = {
  id: string;
  title: string | null;
  body: string | null;
  updatedAt: Date;
  piece: { id: string; title: string };
  post: { id: string; integrationId: string; content: string };
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
   * Draft adaptations that can still enter the calendar.
   *
   * State and channel identity come from the linked post. The derivation's
   * mirrored state and integrationId are intentionally not read.
   */
  listReadyAdaptations(
    organizationId: string,
    limit: number
  ): Promise<ReadyAdaptationRow[]> {
    return this.client().contentDerivation.findMany({
      where: {
        organizationId,
        post: {
          is: {
            organizationId,
            state: 'DRAFT',
            deletedAt: null,
            integration: {
              is: { organizationId, deletedAt: null },
            },
          },
        },
        piece: { is: { organizationId } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        updatedAt: true,
        piece: { select: { id: true, title: true } },
        post: {
          select: { id: true, integrationId: true, content: true },
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
      },
    });
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
        id: true, body: true, updatedAt: true, postId: true,
        post: { select: { id: true, content: true, updatedAt: true, state: true, deletedAt: true,
          integration: { select: { providerIdentifier: true } } } },
      },
    });
  }

  /** Both compare-and-swap updates must succeed; throwing rolls back the first one. */
  acceptReview(organizationId: string, pieceId: string, adaptationId: string,
    snapshot: AdaptationReviewSnapshot, text: string, content: string) {
    return this.client().$transaction(async (tx: PrismaClientLike) => {
      const adaptation = await tx.contentDerivation.updateMany({
        where: { organizationId, contentPieceId: pieceId, id: adaptationId,
          postId: snapshot.postId, body: snapshot.adaptationBody,
          updatedAt: new Date(snapshot.adaptationUpdatedAt) },
        data: { body: text },
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

  archive(organizationId: string, pieceId: string, archivedAt: Date | null) {
    return this.client().contentPiece.updateMany({
      where: { organizationId, id: pieceId },
      data: { archivedAt },
    });
  }
}
