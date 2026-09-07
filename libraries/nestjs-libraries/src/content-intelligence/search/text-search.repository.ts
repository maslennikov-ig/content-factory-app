/**
 * Чтение под внутренний индекс: четыре запроса и ни одной новой колонки.
 *
 * `content-factory-next-m2eg.19`. Индекс строится из того, что в базе уже
 * есть, — заготовок, адаптаций, вышедших постов и фактов, — и живёт в памяти
 * процесса. Схема не меняется ничем: ни таблицей, ни колонкой, ни расширением
 * Postgres.
 *
 * `organizationId` стоит первым в каждом `where` и не зависит ни от одного
 * пришедшего значения: слова человека сужают выборку внутри области, а
 * границу области не двигает ничто.
 *
 * Prisma и только Prisma — сырой SQL здесь запрещён контрактом репозитория
 * (`AGENTS.md`). Потолки на каждый запрос стоят затем, что «весь архив
 * области» — это обещание, которое однажды перестанет быть маленьким.
 */

import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { TEXT_SEARCH_MAX_DOCUMENTS } from './text-search.index';

/** Строки в том виде, в каком их превращает в документы сервис. */
export type TextSearchSourceRowsV1 = {
  pieces: Array<{
    id: string;
    title: string | null;
    body: string | null;
    createdAt: Date;
  }>;
  derivations: Array<{
    id: string;
    contentPieceId: string;
    platform: string | null;
    title: string | null;
    body: string | null;
    createdAt: Date;
    postId: string | null;
    post: {
      state: string;
      content: string | null;
      releaseURL: string | null;
      publishDate: Date | null;
      deletedAt: Date | null;
    } | null;
  }>;
  posts: Array<{
    id: string;
    content: string | null;
    releaseURL: string | null;
    publishDate: Date | null;
    integration: { providerIdentifier: string } | null;
  }>;
  facts: Array<{
    id: string;
    statement: string | null;
    claimKey: string | null;
  }>;
};

@Injectable()
export class TextSearchRepository {
  constructor(private readonly repository: PrismaRepository<any>) {}

  private client(): Record<string, any> {
    return this.repository.model as unknown as Record<string, any>;
  }

  /**
   * Всё, из чего собирается индекс области, — четырьмя запросами.
   *
   * Архивные заготовки читаются вместе с живыми. Список экранов прячет их
   * сам, а поиск обязан отвечать тем же множеством: иначе «в архиве» и
   * «найдено» никогда не пересекаются — та же причина, по которой
   * `PieceRepository.listPieces` читает архив всегда
   * (`content-factory-next-tu3k.11`).
   */
  async load(organizationId: string): Promise<TextSearchSourceRowsV1> {
    const client = this.client();
    const [pieces, derivations, posts, facts] = await Promise.all([
      client.contentPiece.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: TEXT_SEARCH_MAX_DOCUMENTS,
        select: { id: true, title: true, body: true, createdAt: true },
      }),
      client.contentDerivation.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: TEXT_SEARCH_MAX_DOCUMENTS,
        select: {
          id: true,
          contentPieceId: true,
          platform: true,
          title: true,
          body: true,
          createdAt: true,
          postId: true,
          post: {
            select: {
              state: true,
              content: true,
              releaseURL: true,
              publishDate: true,
              deletedAt: true,
            },
          },
        },
      }),
      /*
        Посты берутся только вышедшие и только со своим адресом: этот вид
        нужен ради поста, написанного мимо заготовок — прямо в календаре, — а
        сослаться в новом тексте можно лишь на то, что читатель откроет.
        Черновик календаря в индекс не идёт вовсе.
      */
      client.post.findMany({
        where: {
          organizationId,
          deletedAt: null,
          state: 'PUBLISHED',
          releaseURL: { not: null },
        },
        orderBy: { publishDate: 'desc' },
        take: TEXT_SEARCH_MAX_DOCUMENTS,
        select: {
          id: true,
          content: true,
          releaseURL: true,
          publishDate: true,
          integration: { select: { providerIdentifier: true } },
        },
      }),
      client.contentFact.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: TEXT_SEARCH_MAX_DOCUMENTS,
        select: { id: true, statement: true, claimKey: true },
      }),
    ]);
    return { pieces, derivations, posts, facts };
  }
}
