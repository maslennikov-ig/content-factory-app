import {
  describePiece,
  PLATFORM_SHAPES,
  type PlatformShape,
  type RecutPlatform,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut';
import type {
  AdaptationKindV1,
  AdaptationStateV1,
  PieceCellV1,
  PieceColumnV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The pure half of the library: turning a stored piece into the row a person
 * reads.
 *
 * None of this touches the database and none of it reaches a platform. It is
 * separate from the service for the same reason `recut.ts` is separate from
 * everything: a number on a screen should be reproducible from its inputs
 * without a workspace, a session or a network.
 */

/** `cnt-01`, the short code the library prints beside a piece. */
export const materialCode = (index: number): string =>
  `cnt-${String(index + 1).padStart(2, '0')}`;

/**
 * A text no short-form surface carries whole is a long one.
 *
 * The threshold is a product judgement rather than a measurement, so it is
 * named once here instead of appearing as `1500` in three files.
 */
export const LONG_FORM_CHARS = 1_500;

/**
 * The word the table prints in the format column.
 *
 * `tags.format` wins when a piece carries one: an author who wrote "интервью"
 * meant it, and replacing that with "длинный" tells them less than they
 * already knew.
 */
export function materialFormat(
  body: string,
  tags: unknown,
  language = 'ru'
): string {
  const declared =
    tags && typeof tags === 'object' && !Array.isArray(tags)
      ? (tags as Record<string, unknown>).format
      : undefined;
  if (typeof declared === 'string' && declared.trim()) return declared.trim();

  const long = describePiece(body).chars >= LONG_FORM_CHARS;
  if (language === 'ru') return long ? 'длинный' : 'короткий';
  return long ? 'long' : 'short';
}

/**
 * The date as the library shows it: `05.08.26`.
 *
 * Formatted in UTC on purpose. A per-reader time zone is not carried by any
 * request on this surface, and a date that silently shifts by one day
 * depending on which machine rendered it is worse than one that does not shift
 * at all.
 */
export function materialDate(value: Date | string, language = 'ru'): string {
  const date = value instanceof Date ? value : new Date(value);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  if (language === 'ru') return `${day}.${month}.${year.slice(2)}`;
  return `${year}-${month}-${day}`;
}

/** `v3`, or the label the workspace gave the version instead. */
export function voiceVersionLabel(
  version: { versionNumber?: number | null; label?: string | null } | null
): string | undefined {
  if (!version) return undefined;
  if (version.label && version.label.trim()) return version.label.trim();
  return typeof version.versionNumber === 'number'
    ? `v${version.versionNumber}`
    : undefined;
}

/** How many pictures the piece carries, counted from the piece itself. */
export function countImages(body: string, tags: unknown): number {
  const declared =
    tags && typeof tags === 'object' && !Array.isArray(tags)
      ? (tags as Record<string, unknown>).images
      : undefined;
  if (Array.isArray(declared)) return declared.length;
  if (typeof declared === 'number' && Number.isFinite(declared)) {
    return Math.max(0, Math.trunc(declared));
  }
  return (body.match(/!\[[^\]]*\]\(|<img\b/gu) || []).length;
}

/** How many links it carries. Counted, never opened. */
export const countLinks = (body: string): number =>
  (body.match(/https?:\/\/\S/gu) || []).length;

export const RECUT_PLATFORMS = Object.keys(PLATFORM_SHAPES) as RecutPlatform[];

export const isRecutPlatform = (value: unknown): value is RecutPlatform =>
  typeof value === 'string' && RECUT_PLATFORMS.includes(value as RecutPlatform);

/**
 * Which of this workspace's channels a recut for a platform can be attached to.
 *
 * Identifiers, not providers. Choosing which channel a draft belongs to is a
 * question about the workspace's own rows; sending anything to that channel is
 * `PostsService` and the providers, and nothing here imports them.
 */
export const PLATFORM_PROVIDERS: Readonly<Record<RecutPlatform, string[]>> = {
  site: ['wordpress'],
  telegram: ['telegram'],
  vk: ['vk'],
  newsletter: ['listmonk'],
};

/**
 * The three states the library reports, whatever the column happens to hold.
 *
 * Оставлено ради старой вкладки материалов и её экрана: `MaterialDerivedPostV1`
 * знает ровно три состояния, а адаптация знает четыре. Источник у обеих теперь
 * один — пост, — и эта функция только сужает `AdaptationStateV1` до прежних
 * трёх имён, чтобы вкладка не выучила новый словарь ради того же факта.
 */
export function derivationState(
  value: unknown
): 'DRAFT' | 'QUEUED' | 'PUBLISHED' {
  const state = String(value || '').toUpperCase();
  if (state === 'PUBLISHED') return 'PUBLISHED';
  if (state === 'QUEUED' || state === 'QUEUE') return 'QUEUED';
  return 'DRAFT';
}

/* -------------------------------------------------------------------------
 * Заготовка и адаптации: чистая половина
 *
 * `content-factory-next-tu3k.9.2`. Всё ниже — арифметика над строками, которые
 * уже прочитаны: ни базы, ни площадки, ни сессии. Состояние адаптации приходит
 * из поста и здесь только истолковывается — колонка `ContentDerivation.state`
 * три месяца лгала именно потому, что была вторым местом, где живёт один факт.
 * ---------------------------------------------------------------------- */

/** Пост ровно в той части, из которой читается состояние адаптации. */
export type AdaptationPostLike = {
  state?: unknown;
  releaseURL?: string | null;
  publishDate?: Date | string | null;
  deletedAt?: Date | string | null;
};

/**
 * Адаптация ровно в той части, которая нужна клетке и колонке.
 *
 * Структурный тип, а не строка репозитория: чистая половина не должна знать ни
 * Prisma, ни того, каким запросом строку достали.
 */
export type AdaptationLike = {
  id: string;
  platform: string;
  postId?: string | null;
  integrationId?: string | null;
  post?: AdaptationPostLike | null;
};

/**
 * Старшинство состояний, сверху вниз. Один список на весь файл: клетка,
 * счётчики и фильтр обязаны считать одинаково, иначе таблица и строка под ней
 * скажут о заготовке разное.
 */
export const ADAPTATION_STATE_ORDER: readonly AdaptationStateV1[] = [
  'published',
  'queued',
  'error',
  'draft',
];

/**
 * Состояние адаптации — из поста, а не из зеркала.
 *
 * `null` значит «состояния нет»: поста нет вовсе или он удалён. Удалённый пост
 * не «черновик» — от него не осталось ничего, что человек мог бы открыть, и
 * рисовать по нему черновик значило бы обещать несуществующее.
 */
export function adaptationState(
  post: AdaptationPostLike | null | undefined
): AdaptationStateV1 | null {
  if (!post) return null;
  if (post.deletedAt) return null;
  switch (String(post.state || '').toUpperCase()) {
    case 'PUBLISHED':
      return 'published';
    // `QUEUE` в базе, `queued` на экране: имя состояния поста досталось от
    // апстрима, и переименовывать колонку ради словаря никто не станет.
    case 'QUEUE':
    case 'QUEUED':
      return 'queued';
    case 'ERROR':
      return 'error';
    case 'DRAFT':
      return 'draft';
    default:
      return null;
  }
}

/**
 * Провайдер площадки по тому, что записано в `ContentDerivation.platform`.
 *
 * До этой волны туда клали имя перекройки (`site`, `newsletter`), с этой —
 * `providerIdentifier` канала (`telegram`, `instagram`, `wordpress`). Два
 * поколения строк живут рядом без переноса, и схлопывает их эта функция.
 * Таблица перевода не переписывается заново: `PLATFORM_PROVIDERS` уже говорит,
 * какими провайдерами закрывается площадка перекройки, а `telegram` и `vk`
 * называют сами себя — поэтому под правило попадают ровно `site` и
 * `newsletter`.
 */
export function providerOfPlatform(value: unknown): string {
  const platform = String(value || '')
    .trim()
    .toLowerCase();
  if (!platform) return '';
  if (
    isRecutPlatform(platform) &&
    !PLATFORM_PROVIDERS[platform].includes(platform)
  ) {
    return PLATFORM_PROVIDERS[platform][0];
  }
  return platform;
}

/**
 * Форма площадки для перекройки, найденная по провайдеру.
 *
 * Неизвестный провайдер получает форму `telegram`, и это решение, а не
 * умолчание из лени. Незнакомый канал в этом продукте — почти всегда короткая
 * лента, а у формы `site` потолка длины нет вовсе: предпросмотр по ней сказал
 * бы «ничего не обрежется» там, где площадка обрежет. Ошибиться в сторону
 * «текст придётся сократить» дешевле, чем в сторону обещания, которого
 * площадка не даёт.
 */
export function shapeOfProvider(provider: unknown): PlatformShape {
  const key = String(provider || '')
    .trim()
    .toLowerCase();
  const platform = RECUT_PLATFORMS.find((one) =>
    PLATFORM_PROVIDERS[one].includes(key)
  );
  return PLATFORM_SHAPES[platform ?? 'telegram'];
}

/**
 * Какие виды адаптации умеет площадка.
 *
 * Вид — не площадка: Instagram берёт подпись, сайт — статью, рассылка —
 * письмо, всё остальное текстовое — пост. Видео и аудио здесь не значатся ни у
 * кого: в этой волне их нет, и страница заготовки говорит о них строкой
 * «позже» (`ADAPTATION_KINDS_LATER` в контракте).
 */
export const KINDS_BY_PROVIDER: Readonly<Record<string, AdaptationKindV1[]>> = {
  instagram: ['caption'],
  wordpress: ['article'],
  listmonk: ['newsletter'],
};

export function kindsOfProvider(provider: unknown): AdaptationKindV1[] {
  const key = String(provider || '')
    .trim()
    .toLowerCase();
  return KINDS_BY_PROVIDER[key] ?? ['post'];
}

const stateRank = (state: AdaptationStateV1 | null): number => {
  const index = state ? ADAPTATION_STATE_ORDER.indexOf(state) : -1;
  // Адаптация без состояния — всё ещё адаптация: строка есть, текст в ней
  // есть, публикации нет. Она встаёт на ту же ступень, что и черновик, чтобы
  // клетка не притворилась пустой над существующей работой.
  return index < 0 ? ADAPTATION_STATE_ORDER.length - 1 : index;
};

const isoOf = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

/**
 * Клетка матрицы «площадка × заготовка».
 *
 * Колонка — площадка, а не канал: три Telegram-канала дают одну клетку с
 * лучшим состоянием и счётом «ещё N». Поимённо они видны в раскрытой строке, и
 * `more` считает именно КАНАЛЫ с адаптацией, а не адаптации: две версии в один
 * канал — это одна строка списка, а не два места, где текст вышел.
 *
 * `none` здесь значит ровно «адаптации нет». Отличить это от `no_channel`
 * клетка сама не может — для этого нужен список подключённых каналов, — и
 * поднимает `none` до `no_channel` тот, у кого этот список есть.
 */
export function bestCell(
  platform: string,
  adaptations: readonly AdaptationLike[]
): PieceCellV1 {
  const provider = providerOfPlatform(platform);
  const here = adaptations.filter(
    (one) => providerOfPlatform(one.platform) === provider
  );
  if (!here.length) {
    return { platform: provider, state: 'none', date: null, url: null, more: 0 };
  }

  let winner = here[0];
  let winnerRank = stateRank(adaptationState(here[0].post));
  for (const candidate of here.slice(1)) {
    const rank = stateRank(adaptationState(candidate.post));
    if (rank < winnerRank) {
      winner = candidate;
      winnerRank = rank;
    }
  }

  // Канал без идентификатора бывает у строк до этой волны; все такие
  // складываются в одну группу, иначе «ещё N» посчитало бы отсутствие канала
  // за столько каналов, сколько строк.
  const channels = new Set(here.map((one) => String(one.integrationId ?? '')));
  const state = ADAPTATION_STATE_ORDER[winnerRank];
  const dated = state === 'published' || state === 'queued';

  return {
    platform: provider,
    state,
    date: dated ? isoOf(winner.post?.publishDate) : null,
    url: winner.post?.releaseURL ?? null,
    postId: winner.postId ?? null,
    adaptationId: winner.id,
    integrationId: winner.integrationId ?? null,
    more: Math.max(0, channels.size - 1),
  };
}

/**
 * Виды, которые площадками не бывают. Видео и аудио — это `kind` адаптации, а
 * не место, куда она уходит, и колонкой они стать не должны ни при какой
 * строке в базе.
 */
const NOT_A_PLATFORM = new Set<string>(['video', 'audio']);

/**
 * Колонки таблицы заготовок.
 *
 * Подключённые площадки плюс те, где адаптация уже была: неподключённая
 * площадка без единой адаптации колонкой не становится — пустой столбец,
 * которого никто не просил, это шум. Отключённая площадка с публикацией,
 * наоборот, остаётся: то, что уже вышло, не перестаёт существовать оттого, что
 * канал отвязали, и `channels: 0` честно говорит, что писать туда сейчас
 * некуда.
 *
 * `name` — идентификатор провайдера, а не имя канала: колонка называет
 * площадку, а площадку в этой области могут закрывать три канала с разными
 * именами. Читаемую подпись даёт экран (`platformName` в `voice-copy.ts`),
 * потому что это перевод, а не факт о данных.
 */
export function columnsOf(
  integrations: readonly { providerIdentifier: string; name?: string | null }[],
  adaptations: readonly AdaptationLike[]
): PieceColumnV1[] {
  const columns = new Map<string, PieceColumnV1>();
  const take = (provider: string): PieceColumnV1 | null => {
    if (!provider || NOT_A_PLATFORM.has(provider)) return null;
    const existing = columns.get(provider);
    if (existing) return existing;
    const fresh: PieceColumnV1 = {
      platform: provider,
      name: provider,
      channels: 0,
      adaptations: 0,
    };
    columns.set(provider, fresh);
    return fresh;
  };

  for (const integration of integrations) {
    const column = take(providerOfPlatform(integration.providerIdentifier));
    if (column) column.channels += 1;
  }
  for (const adaptation of adaptations) {
    const column = take(providerOfPlatform(adaptation.platform));
    if (column) column.adaptations += 1;
  }

  // По числу адаптаций — «куда эта область на самом деле пишет» впереди. При
  // равенстве вперёд идёт площадка с каналами, и только потом алфавит: порядок
  // колонок обязан быть одним и тем же при двух одинаковых чтениях.
  return [...columns.values()].sort(
    (left, right) =>
      right.adaptations - left.adaptations ||
      right.channels - left.channels ||
      left.platform.localeCompare(right.platform)
  );
}
