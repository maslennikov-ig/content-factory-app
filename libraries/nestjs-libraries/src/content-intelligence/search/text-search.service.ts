/**
 * Внутренний поиск области: индекс в памяти, срок жизни и явный сброс.
 *
 * Решение владельца 07.09.2026 (`content-factory-next-m2eg.19`): «нам это
 * нужно сразу сделать, чтобы модель научилась на них ссылаться… использовал
 * внутренний поиск для этого… какую-то хорошую библиотеку для поиска взял, а
 * не сам городил. Тем более нам поиск много где нужен, внутренний».
 *
 * Отсюда и форма. Один сервис отвечает на все внутренние поиски раздела —
 * список архива, список заготовок, витрина фактов и «свои тексты по теме» при
 * адаптации, — потому что четыре разных разбора одного запроса это четыре
 * разных ответа на один вопрос человека. Ровно это правило уже записано в
 * `search-terms.ts`, и оно не изменилось: изменился только разбор.
 *
 * Что здесь есть, чего нет в самом индексе:
 *
 *  - **кэш на область** со сроком жизни. Индекс строится лениво, на первом
 *    запросе, и переживает следующие; область, в которую никто не ходит,
 *    памяти не занимает;
 *  - **сброс по записи** (`invalidate`). Зовут его сервисы, которые пишут:
 *    заготовку, адаптацию, черновик, занесённый текст. Сброс — не запись в
 *    индекс, а «забудь»: следующий запрос построит его заново. Так не
 *    появляется второго места, где живёт «что уже написано»;
 *  - **одна сборка на область одновременно.** Два запроса, пришедшие вместе
 *    в холодную область, ждут одного обещания, а не строят два индекса;
 *  - **потолок областей в памяти.** Больше `MAX_CACHED_ORGANIZATIONS` —
 *    и самая старая по времени сборки уходит. Это кэш, а не хранилище.
 *
 * Отказ поиска никогда не роняет вызывающего: `search` возвращает пустой
 * список, а вызывающий откатывается на поиск по словам или обходится без
 * находок. Индекс — это улучшение ответа, а не условие ответа.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  TextSearchHitV1,
  TextSearchKindV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import {
  TextSearchIndex,
  type TextSearchDocumentV1,
  type TextSearchQueryV1,
} from './text-search.index';
import {
  TextSearchRepository,
  type TextSearchSourceRowsV1,
} from './text-search.repository';

/** Сколько индекс живёт без пересборки. */
export const TEXT_SEARCH_TTL_MS = 5 * 60 * 1000;

/** Сколько областей держится в памяти одновременно. */
export const TEXT_SEARCH_MAX_CACHED_ORGANIZATIONS = 16;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** HTML поста → слова. Индексу нужен текст, а не разметка. */
const plain = (value: unknown): string =>
  text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const iso = (value: Date | null | undefined): string =>
  value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : '';

/** Заголовок поста, у которого своего заголовка нет: первая строка текста. */
const firstLine = (body: string): string => {
  const line = body.split(/[.!?\n]/)[0]?.trim() || body.trim();
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
};

type CacheEntry = {
  index: TextSearchIndex;
  builtAt: number;
};

@Injectable()
export class TextSearchService {
  private readonly logger = new Logger(TextSearchService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly building = new Map<string, Promise<TextSearchIndex>>();
  private readonly now: () => number;

  constructor(
    private readonly repository: TextSearchRepository,
    /**
     * Часы наборов. Необязательный и последний — порядок параметров здесь
     * такая же часть договора, как у соседних сервисов раздела: наборы
     * собирают сервис руками.
     */
    @Optional() now: () => number = () => Date.now()
  ) {
    this.now = now || (() => Date.now());
  }

  /**
   * Забыть индекс области. Зовут после записи текста, адаптации или поста.
   *
   * Именно «забыть», а не «дописать строку»: дописывание означало бы, что
   * индекс знает правила сборки документа в двух местах — здесь и в `build`,
   * — и однажды они разойдутся, как разошлась колонка
   * `ContentDerivation.state` со своим постом.
   */
  invalidate(organizationId: string): void {
    this.cache.delete(organizationId);
    this.building.delete(organizationId);
  }

  /**
   * Найти свои тексты. Отказ индекса — это пустой список, а не исключение.
   */
  async search(
    organizationId: string,
    query: string,
    options: TextSearchQueryV1 = {}
  ): Promise<TextSearchHitV1[]> {
    const term = String(query || '').trim();
    if (!term) return [];
    try {
      const index = await this.indexFor(organizationId);
      return index.search(term, options);
    } catch (error) {
      this.logger.warn(
        `The internal search index could not answer; falling back to no results: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Есть ли что искать. Отвечает на вопрос «стоит ли верить пустому ответу».
   *
   * Списки, у которых поиск по словам был всегда, спрашивают именно это:
   * пустой индекс означает, что искать надо старым способом, а не что в
   * области ничего не нашлось.
   */
  async ready(organizationId: string): Promise<boolean> {
    try {
      const index = await this.indexFor(organizationId);
      return index.size > 0;
    } catch {
      return false;
    }
  }

  private async indexFor(organizationId: string): Promise<TextSearchIndex> {
    const cached = this.cache.get(organizationId);
    if (cached && this.now() - cached.builtAt < TEXT_SEARCH_TTL_MS) {
      return cached.index;
    }
    const building = this.building.get(organizationId);
    if (building) return building;
    const promise = this.build(organizationId)
      .then((index) => {
        this.cache.set(organizationId, { index, builtAt: this.now() });
        this.evict();
        return index;
      })
      .finally(() => {
        this.building.delete(organizationId);
      });
    this.building.set(organizationId, promise);
    return promise;
  }

  private evict(): void {
    while (this.cache.size > TEXT_SEARCH_MAX_CACHED_ORGANIZATIONS) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.cache) {
        if (entry.builtAt < oldestAt) {
          oldestAt = entry.builtAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }

  private async build(organizationId: string): Promise<TextSearchIndex> {
    const rows = await this.repository.load(organizationId);
    return new TextSearchIndex(this.documentsOf(rows));
  }

  /**
   * Строки базы → документы индекса.
   *
   * Одно правило решает всё остальное: **один текст — одна строка индекса.**
   * Адаптация и её пост это один и тот же текст, увиденный с двух сторон,
   * поэтому адаптация индексируется вместе со своим постом и забирает у него
   * адрес, площадку и дату выхода, а сам такой пост второй строкой не идёт.
   * Отдельным видом `POST` остаётся только пост, написанный мимо заготовок —
   * прямо в календаре: до этой волны его не видел ни один внутренний поиск,
   * и именно про него владелец говорил «свои старые посты».
   */
  private documentsOf(rows: TextSearchSourceRowsV1): TextSearchDocumentV1[] {
    const documents: TextSearchDocumentV1[] = [];
    const claimedPostIds = new Set<string>();

    for (const piece of rows.pieces || []) {
      const body = plain(piece.body);
      if (!body && !text(piece.title)) continue;
      documents.push({
        id: piece.id,
        kind: 'PIECE',
        title: text(piece.title) || firstLine(body),
        body,
        platform: '',
        url: '',
        publishedAt: iso(piece.createdAt),
        pieceId: piece.id,
        linkable: false,
      });
    }

    for (const derivation of rows.derivations || []) {
      if (derivation.postId) claimedPostIds.add(derivation.postId);
      const post = derivation.post;
      const alive = post && !post.deletedAt;
      // Текст адаптации живёт в её собственной колонке с волны «заготовка и
      // адаптации»; у строк до неё он есть только в посте.
      const body = plain(derivation.body) || (alive ? plain(post.content) : '');
      if (!body && !text(derivation.title)) continue;
      const published = Boolean(
        alive && String(post.state || '').toUpperCase() === 'PUBLISHED'
      );
      const url = published ? text(post.releaseURL) : '';
      documents.push({
        id: derivation.id,
        kind: 'ADAPTATION',
        title: text(derivation.title) || firstLine(body),
        body,
        platform: text(derivation.platform),
        url,
        publishedAt: alive && published ? iso(post.publishDate) : '',
        pieceId: derivation.contentPieceId,
        linkable: Boolean(url),
      });
    }

    for (const post of rows.posts || []) {
      if (claimedPostIds.has(post.id)) continue;
      const body = plain(post.content);
      if (!body) continue;
      const url = text(post.releaseURL);
      documents.push({
        id: post.id,
        kind: 'POST',
        title: firstLine(body),
        body,
        platform: text(post.integration?.providerIdentifier),
        url,
        publishedAt: iso(post.publishDate),
        pieceId: '',
        linkable: Boolean(url),
      });
    }

    for (const fact of rows.facts || []) {
      const statement = text(fact.statement).trim();
      if (!statement) continue;
      documents.push({
        id: fact.id,
        kind: 'FACT',
        // Ключ утверждения — это `тема|признак`, и он ищется вместе с самим
        // утверждением: витрина фактов отбирает по теме теми же словами.
        title: text(fact.claimKey).replace(/\|/g, ' '),
        body: statement,
        platform: '',
        url: '',
        publishedAt: '',
        pieceId: '',
        linkable: false,
      });
    }

    return documents;
  }

  /**
   * Идентификаторы одного вида — то, чем живут отборы списков.
   *
   * `null` означает «искать было нечего или индекс пуст», и это НЕ то же
   * самое, что пустое множество: пустое множество прячет все строки, а `null`
   * оставляет список таким, каким он был бы без запроса. Ровно это различие
   * держит `PieceRepository.searchPieceIds` с 05.09.2026, и оно здесь
   * повторено, а не изобретено заново.
   */
  async matchingIds(
    organizationId: string,
    query: string,
    kind: TextSearchKindV1,
    options: { limit?: number } = {}
  ): Promise<Set<string> | null> {
    const term = String(query || '').trim();
    if (!term) return null;
    if (!(await this.ready(organizationId))) return null;
    const hits = await this.search(organizationId, term, {
      kinds: [kind],
      limit: options.limit ?? 100,
      mode: 'all-words',
    });
    return new Set(
      hits.map((hit) => (kind === 'PIECE' ? hit.pieceId || hit.id : hit.id))
    );
  }
}
