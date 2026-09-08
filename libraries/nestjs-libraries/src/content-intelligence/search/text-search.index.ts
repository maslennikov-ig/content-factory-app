/// <reference path="./orama-stemmers.d.ts" />

/**
 * Внутренний поиск: один индекс области в памяти, без единой правки схемы.
 *
 * Решение владельца 07.09.2026 (`content-factory-next-m2eg.19`), дословно:
 * «использовал внутренний поиск для этого… какую-то хорошую библиотеку для
 * поиска взял, а не сам городил. Тем более нам поиск много где нужен,
 * внутренний».
 *
 * Библиотека — `@orama/orama` 3.1.18 со стеммерами `@orama/stemmers` 3.1.18.
 * Обе Apache-2.0, обе без единой зависимости и без нативных модулей, обе
 * отдают CommonJS-сборку, которую наш бэкенд и требует. Русский стеммер у них
 * из коробки — это и решило выбор против `minisearch`, где русский пришлось бы
 * приносить своим пакетом.
 *
 * Чего здесь нет и почему:
 *
 *  - **правки схемы базы.** Индекс живёт в памяти процесса и строится из тех
 *    же строк, которые экраны и так читают. Расширения Postgres означали бы
 *    миграцию боевой базы ради поиска — ровно то, чего владелец просил
 *    избежать ещё 05.09 (`search-terms.ts`);
 *  - **обещания смысла.** Это по-прежнему поиск по словам, только со
 *    стеммингом и ранжированием: «сроки» находят «срок», а порядок строк
 *    считает BM25. Ни на одном экране не написано, что продукт понял смысл;
 *  - **состояния.** Файл ничего не знает ни о Nest, ни о Prisma, ни об
 *    области: он получает готовые документы и отвечает находками. Кэш,
 *    срок жизни и сброс живут в `text-search.service.ts`, потому что там же
 *    живёт знание о том, кто и когда пишет.
 *
 * Два режима отбора названы явно, и разница между ними — это разница между
 * двумя вопросами человека. `all-words` — «покажи, где встречается всё, что я
 * ввёл»: так работали списки архива и заготовок до этой волны, и менять их
 * поведение на середине эпика значило бы, что один и тот же запрос отвечает
 * по-разному в зависимости от даты выпуска. `ranked` — «что у меня написано
 * об этом», вопрос адаптации: там лишняя строка стоит дёшево, а пропущенная
 * дорого.
 */

import { create, insertMultiple, search as oramaSearch } from '@orama/orama';
import { stemmer as russianStemmer } from '@orama/stemmers/russian';
import { stemmer as englishStemmer } from '@orama/stemmers/english';
import type {
  TextSearchHitV1,
  TextSearchKindV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import type { RelatedOwnPostV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/** Одна строка индекса. Собирает её репозиторий, читает — Orama. */
export type TextSearchDocumentV1 = {
  id: string;
  kind: TextSearchKindV1;
  title: string;
  body: string;
  /** `providerIdentifier` канала или пустая строка, когда площадки нет. */
  platform: string;
  /** Адрес вышедшего текста или пустая строка. */
  url: string;
  /** ISO или пустая строка. */
  publishedAt: string;
  /** Заготовка, к которой относится строка; у самой заготовки — её же `id`. */
  pieceId: string;
  /** Есть ли адрес. Отдельным полем, потому что фильтр Orama сравнивает значения, а не длины. */
  linkable: boolean;
};

export type TextSearchQueryV1 = {
  platform?: string;
  kinds?: readonly TextSearchKindV1[];
  /** Только то, на что можно дать ссылку: вышедший текст со своим адресом. */
  linkableOnly?: boolean;
  limit?: number;
  mode?: 'all-words' | 'ranked';
};

/** Сколько знаков тела попадает в индекс. Длинный пост режется, а не выбрасывается. */
export const TEXT_SEARCH_MAX_BODY_CHARACTERS = 4_000;

/** Сколько знаков уходит в выдержку на экран и в промпт. */
export const TEXT_SEARCH_EXCERPT_CHARACTERS = 240;

/** Потолок строк на область. Больше — и это уже не «индекс в памяти». */
export const TEXT_SEARCH_MAX_DOCUMENTS = 2_000;

const SCHEMA = {
  id: 'string',
  kind: 'string',
  title: 'string',
  body: 'string',
  platform: 'string',
  url: 'string',
  publishedAt: 'string',
  pieceId: 'string',
  linkable: 'boolean',
} as const;

/**
 * Стеммер на слово, а не на индекс.
 *
 * У области один индекс, а тексты в нём двуязычные: русский пост и английский
 * лежат рядом, и выбирать язык на весь индекс значило бы отдать один из них.
 * Кириллица идёт русскому стеммеру, всё остальное — английскому; ни один из
 * них не портит чужое слово сильнее, чем его испортило бы отсутствие
 * стемминга вовсе.
 */
export const stemWord = (word: string): string =>
  /[Ѐ-ӿ]/.test(word) ? russianStemmer(word) : englishStemmer(word);

/** Формы из исходного текста: тот же стеммер и префиксы, что у Orama. */
export function matchedFormsOf(query: string, text: string): string[] {
  const words = (value: string) =>
    value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const wanted = words(query).map(stemWord);
  return [
    ...new Set(
      words(text).filter((word) =>
        wanted.some((stem) => stemWord(word).startsWith(stem))
      )
    ),
  ];
}

/** Первые 160 знаков, либо окно вокруг найденной формы, если она дальше. */
export function matchedSnippetOf(
  body: string,
  forms: readonly string[]
): string {
  const text = body.replace(/\s+/g, ' ').trim();
  const lower = text.toLocaleLowerCase();
  const offsets = forms
    .map((form) => lower.indexOf(form.toLocaleLowerCase()))
    .filter((at) => at >= 0);
  const first = offsets.length ? Math.min(...offsets) : 0;
  const start = first >= 160 ? Math.max(0, first - 40) : 0;
  return `${start ? '…' : ''}${text.slice(start, start + 160)}${
    text.length > start + 160 ? '…' : ''
  }`;
}

/**
 * Находки → «свои тексты по теме»: одно превращение на экран и на модель.
 *
 * Живёт здесь, а не в двух сервисах, потому что список, который видит человек,
 * и список, который видит модель, обязаны совпадать до строки: иначе ссылка в
 * готовом тексте перестала бы быть проверяемой глазами. Строка без адреса
 * отсеивается — сослаться можно только на то, что читатель откроет.
 */
export const relatedOwnPostsOf = (
  hits: readonly TextSearchHitV1[]
): RelatedOwnPostV1[] =>
  hits
    .filter((hit) => Boolean(hit.url))
    .map((hit) => ({
      id: hit.id,
      kind: hit.kind === 'POST' ? 'POST' : 'ADAPTATION',
      title: hit.title,
      excerpt: hit.excerpt,
      url: hit.url as string,
      platform: hit.platform,
      publishedAt: hit.publishedAt,
      score: hit.score,
    }));

/** Выдержка: первые строки текста, обрезанные по слову. */
export const excerptOf = (body: string): string => {
  const text = String(body || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= TEXT_SEARCH_EXCERPT_CHARACTERS) return text;
  const cut = text.slice(0, TEXT_SEARCH_EXCERPT_CHARACTERS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 40 ? cut.slice(0, lastSpace) : cut}…`;
};

/**
 * Один индекс области.
 *
 * Класс, а не набор функций: у Orama состояние живёт в объекте базы, и
 * прятать его за модульной переменной значило бы завести один индекс на весь
 * процесс — то есть на все области сразу.
 */
export class TextSearchIndex {
  private readonly db: ReturnType<typeof create>;
  readonly size: number;

  constructor(documents: readonly TextSearchDocumentV1[]) {
    /*
      Язык называется ВНУТРИ настроек токенизатора, а не рядом с ними.
      `create({ language, components: { tokenizer } })` бросает
      `NO_LANGUAGE_WITH_CUSTOM_TOKENIZER`: пакет считает любой переданный
      токенизатор своим и отказывается спорить с ним о языке. Проверено на
      3.1.18.
    */
    this.db = create({
      schema: SCHEMA,
      components: {
        tokenizer: {
          language: 'russian',
          stemming: true,
          stemmer: stemWord,
        },
      },
    } as any);
    const kept = documents.slice(0, TEXT_SEARCH_MAX_DOCUMENTS).map((one) => ({
      ...one,
      body: String(one.body || '').slice(0, TEXT_SEARCH_MAX_BODY_CHARACTERS),
    }));
    this.size = kept.length;
    if (kept.length) {
      // Возвращает массив идентификаторов синхронно; обещание — только у
      // версий с асинхронным хранилищем, которого здесь нет.
      void insertMultiple(this.db as any, kept as any);
    }
  }

  /**
   * Найти. Пустой запрос отвечает пустотой, а не всей библиотекой.
   *
   * Это не мелочь: `search` с пустым `term` у Orama возвращает КАЖДЫЙ
   * документ, и список архива без запроса молча превратился бы в список
   * архива, отфильтрованный по всему.
   */
  search(query: string, options: TextSearchQueryV1 = {}): TextSearchHitV1[] {
    const term = String(query || '').trim();
    if (!term || this.size === 0) return [];
    const where: Record<string, unknown> = {};
    if (options.platform) where.platform = options.platform;
    if (options.linkableOnly) where.linkable = true;
    if (options.kinds?.length) where.kind = [...options.kinds];
    const found = oramaSearch(
      this.db as any,
      {
        term,
        // Слова ищутся в заголовке и теле. Адрес, площадка и дата лежат в тех же
        // строках, и без этого списка запрос «telegram» находил бы каждый пост
        // канала по его же служебному полю.
        properties: ['title', 'body'],
        // `0` — «встретиться должно всё», `1` — «хватит одного слова, дальше
        // решает вес». Orama называет это порогом объединения; умолчание у неё
        // `1`, и списки, которые до этой волны требовали все слова, получили бы
        // от умолчания молча другое поведение.
        threshold: options.mode === 'ranked' ? 1 : 0,
        limit: Math.min(Math.max(options.limit ?? 20, 1), 100),
        ...(Object.keys(where).length ? { where } : {}),
      } as any
    ) as any;
    return (found?.hits || []).map((hit: any) => {
      const document = hit.document as TextSearchDocumentV1;
      return {
        id: document.id,
        kind: document.kind,
        title: document.title,
        excerpt: excerptOf(document.body),
        url: document.url || null,
        platform: document.platform || null,
        publishedAt: document.publishedAt || null,
        pieceId: document.pieceId || null,
        score: hit.score,
      };
    });
  }
}
