import type {
  AdaptationV1,
  PieceAdaptEventV1,
  PieceCellV1,
  PieceColumnV1,
  PieceDetailV1,
  PieceQuestionV1,
  PieceRowV1,
  PiecesResponseV1,
  AdaptationChecksV1,
  SlopReportV1,
  ZagotovkaCoreV1,
} from './voice-wiring.contract';
import { ADAPTATION_KINDS_LATER, PIECE_CORE_VERSION } from './voice-wiring.contract';

/**
 * Фикстура списка и страницы заготовок.
 *
 * Общая правда для экранов (Z5), пока сервер (Z1–Z3) не выпущен: каждое
 * состояние клетки встречается хотя бы раз, есть заготовка без выделенной
 * сути (материал до волны), строка без клеток («пока не знаем») и площадка,
 * которой в колонках нет вовсе, но на странице она выключена с причиной.
 * Слова, коды и даты примерные — как в макетах 06.09.2026.
 *
 * Ничего отсюда не идёт в базу и не зовёт модель: это данные для сцен
 * обзора и наборов, не для боевого пути.
 */

const day = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y.slice(2)}`;
};

export const PIECES_FIXTURE_COLUMNS: PieceColumnV1[] = [
  { platform: 'telegram', name: 'Telegram', channels: 3, adaptations: 5 },
  { platform: 'vk', name: 'VK', channels: 1, adaptations: 2 },
  { platform: 'wordpress', name: 'Сайт', channels: 1, adaptations: 2 },
  /** Канал отключили вчера, а публикация была: колонка остаётся ради неё. */
  { platform: 'linkedin', name: 'LinkedIn', channels: 0, adaptations: 1 },
];

const cells = (
  ...list: Array<Partial<PieceCellV1> & Pick<PieceCellV1, 'platform' | 'state'>>
): PieceCellV1[] =>
  list.map((cell) => ({
    date: null,
    url: null,
    postId: null,
    adaptationId: null,
    integrationId: null,
    ...cell,
  }));

export const PIECE_FIXTURE_ROWS: PieceRowV1[] = [
  {
    id: 'piece-12',
    code: 'cnt-12',
    title: 'Дедлайн, назначенный себе, работает хуже',
    format: 'короткий',
    date: day('2026-09-06'),
    createdAt: '2026-09-06T09:40:00.000Z',
    excerpt: [
      'Из шести дедлайнов, которые я ставил себе сам, сдвинулись пять. С клиентом не сдвинулся ни один.',
      'Разница не в дисциплине.',
      'Срок держится, когда о нём знает кто-то ещё.',
    ],
    coreExtracted: true,
    origin: 'thought',
    voiceVersion: 'v3',
    slopVerdict: 'clean',
    cells: cells(
      {
        platform: 'telegram',
        state: 'published',
        date: '2026-09-06T10:00:00.000Z',
        url: 'https://t.me/example/412',
        postId: 'post-412',
        adaptationId: 'adaptation-12-tg',
        integrationId: 'int-tg-main',
        /** Три Telegram-канала: лучшее состояние в клетке, остальные — «ещё 2». */
        more: 2,
      },
      {
        platform: 'vk',
        state: 'queued',
        date: '2026-09-08T07:00:00.000Z',
        postId: 'post-413',
        adaptationId: 'adaptation-12-vk',
        integrationId: 'int-vk',
      },
      {
        platform: 'wordpress',
        state: 'draft',
        postId: 'post-414',
        adaptationId: 'adaptation-12-site',
        integrationId: 'int-site',
      },
      { platform: 'linkedin', state: 'none' }
    ),
  },
  {
    id: 'piece-11',
    code: 'cnt-11',
    title: 'Почему счёт за модели вырос вдвое за месяц',
    format: 'длинный',
    date: day('2026-09-05'),
    createdAt: '2026-09-05T14:12:00.000Z',
    excerpt: [
      'За август мы заплатили за модели вдвое больше, чем за июль, при том же числе постов.',
      'Дело не в цене токена.',
    ],
    coreExtracted: true,
    origin: 'lead',
    voiceVersion: 'v3',
    slopVerdict: 'review',
    cells: cells(
      {
        platform: 'telegram',
        state: 'draft',
        postId: 'post-401',
        adaptationId: 'adaptation-11-tg',
        integrationId: 'int-tg-main',
      },
      { platform: 'vk', state: 'none' },
      {
        platform: 'wordpress',
        state: 'error',
        date: '2026-09-05T16:00:00.000Z',
        postId: 'post-402',
        adaptationId: 'adaptation-11-site',
        integrationId: 'int-site',
      },
      { platform: 'linkedin', state: 'none' }
    ),
  },
  {
    id: 'piece-07',
    code: 'cnt-07',
    title: 'Как мы считаем удержание',
    format: 'короткий',
    date: day('2026-09-02'),
    createdAt: '2026-09-02T08:00:00.000Z',
    /** Материал до волны: суть не выделена, тело — HTML одного канала. */
    excerpt: [],
    coreExtracted: false,
    origin: 'legacy',
    voiceVersion: 'v2',
    slopVerdict: null,
    cells: cells(
      {
        platform: 'telegram',
        state: 'published',
        date: '2026-09-02T09:30:00.000Z',
        url: 'https://t.me/example/398',
        postId: 'post-398',
        adaptationId: 'adaptation-07-tg',
        integrationId: 'int-tg-main',
      },
      { platform: 'vk', state: 'none' },
      { platform: 'wordpress', state: 'none' },
      {
        platform: 'linkedin',
        state: 'published',
        date: '2026-09-02T12:00:00.000Z',
        url: 'https://www.linkedin.com/posts/example-398',
        postId: 'post-399',
        adaptationId: 'adaptation-07-li',
        integrationId: 'int-li-old',
      }
    ),
  },
  {
    id: 'piece-04',
    code: 'cnt-04',
    title: 'Что мы поменяли в отборе клиентов',
    format: 'длинный',
    date: day('2026-08-29'),
    createdAt: '2026-08-29T11:20:00.000Z',
    excerpt: [
      'Раньше мы брали всех, кто готов платить. Теперь — только тех, у кого есть свой канал.',
      'Из 14 клиентов прошлого квартала 9 ушли в первые два месяца.',
      'У всех девяти канала не было.',
    ],
    coreExtracted: true,
    origin: 'foreign_post',
    voiceVersion: 'v3',
    slopVerdict: 'clean',
    /** Чтение публикации ещё не выпущено: клеток нет, экран пишет «пока не знаем». */
  },
];

export const PIECES_FIXTURE_RESPONSE: PiecesResponseV1 = {
  state: 'default',
  columns: PIECES_FIXTURE_COLUMNS,
  pieces: PIECE_FIXTURE_ROWS,
};

export const PIECES_FIXTURE_EMPTY: PiecesResponseV1 = {
  state: 'empty',
  columns: PIECES_FIXTURE_COLUMNS.slice(0, 1),
  pieces: [],
};

const slopClean: SlopReportV1 = {
  version: 'slop-check/1.0.0',
  platform: 'core',
  locale: 'ru',
  findings: [],
  truncated: false,
  metrics: {
    sentences: 5,
    words: 48,
    meanNeighbourDiff: 6.2,
    shortSentences: 2,
    questions: 0,
    boldSpans: 0,
    emojiKinds: 0,
    dashPer1k: 0,
    lists: 0,
    listItemsMax: 0,
  },
  score: 0,
  verdict: 'clean',
};

/**
 * Квитанция проверок адаптации: с 07.09.2026 её считают всегда
 * (`content-factory-next-k879.1`), поэтому и в образце она заполнена, а не
 * пуста. Пороги здесь телеграмные — адаптация посчитана по площадке канала, а
 * не по нейтральной сути.
 */
const adaptationChecks: AdaptationChecksV1 = {
  antiCopy: null,
  slop: { ...slopClean, platform: 'telegram' },
  voice: { verdict: 'CLOSE' },
};

export const PIECE_FIXTURE_CORE: ZagotovkaCoreV1 = {
  version: PIECE_CORE_VERSION,
  text: [
    'Из шести дедлайнов, которые я ставил себе сам, сдвинулись пять. С клиентом не сдвинулся ни один.',
    '',
    'Разница не в дисциплине. Срок держится, когда о нём знает кто-то ещё, и это работает даже без всякого контроля с его стороны.',
    '',
    'Возразить тут есть чем: кому-то самодисциплины хватает, и такие люди мне встречались.',
  ].join('\n'),
  brief: {
    inputKind: 'thought',
    goal: null,
    thesis: 'Дедлайн, о котором знает другой, держится лучше',
    position: 'Ставлю себе срок только вместе с клиентом',
    disagreement: 'Кому-то самодисциплины достаточно',
    audience: 'Владельцы небольших студий',
    format: 'opinion',
    facts: [
      {
        statement: 'Пять из шести сроков сдвинулись',
        origin: 'input',
        verified: true,
      },
      {
        statement: 'Средний срыв по отрасли 40%',
        origin: 'model',
        verified: false,
      },
    ],
    origins: {
      thesis: 'input',
      position: 'person',
      disagreement: 'model',
      audience: 'avatar',
      format: 'model',
    },
    ungrounded: ['Средний срыв по отрасли 40%'],
  },
  answers: [
    {
      key: 'position',
      text: 'ставлю себе срок только вместе с клиентом, иначе он не срок а пожелание',
      origin: 'person',
      step: 'core',
      answeredAt: '2026-09-06T09:39:20.000Z',
    },
    {
      key: 'personal_detail',
      text: '',
      origin: 'model',
      step: 'core',
      answeredAt: '2026-09-06T09:39:25.000Z',
    },
  ],
  slop: slopClean,
  writtenBy: 'model',
  authorNumbers: true,
};

export const PIECE_FIXTURE_ADAPTATIONS: AdaptationV1[] = [
  {
    id: 'adaptation-12-tg',
    pieceId: 'piece-12',
    kind: 'post',
    platform: 'telegram',
    integrationId: 'int-tg-main',
    integrationName: 'Мой канал',
    title: null,
    body: 'Пять из шести сроков я сорвал сам себе.\n\nС клиентом — ни одного. Разница не в дисциплине: срок держится, когда о нём знает кто-то ещё.\n\nА у вас как?',
    postId: 'post-412',
    mediaId: null,
    state: 'published',
    date: '2026-09-06T10:00:00.000Z',
    url: 'https://t.me/example/412',
    createdAt: '2026-09-06T09:41:00.000Z',
    voiceVersion: 'v3',
    answers: [
      {
        key: 'hook',
        text: 'Пять из шести сроков я сорвал сам себе',
        origin: 'confirmed',
        step: 'adaptation',
        platform: 'telegram',
        answeredAt: '2026-09-06T09:40:40.000Z',
      },
      {
        key: 'cta',
        text: 'вопрос',
        origin: 'confirmed',
        step: 'adaptation',
        platform: 'telegram',
        answeredAt: '2026-09-06T09:40:45.000Z',
      },
    ],
    checks: adaptationChecks,
  },
  {
    id: 'adaptation-12-vk',
    pieceId: 'piece-12',
    kind: 'post',
    platform: 'vk',
    integrationId: 'int-vk',
    integrationName: 'Студия',
    body: 'Из шести дедлайнов, которые я ставил себе сам, сдвинулись пять…',
    postId: 'post-413',
    state: 'queued',
    date: '2026-09-08T07:00:00.000Z',
    createdAt: '2026-09-06T12:00:00.000Z',
    voiceVersion: 'v3',
  },
  {
    id: 'adaptation-12-site',
    pieceId: 'piece-12',
    kind: 'article',
    platform: 'wordpress',
    integrationId: 'int-site',
    integrationName: 'Блог',
    title: 'Дедлайн, назначенный себе, работает хуже',
    body: null,
    postId: 'post-414',
    state: 'draft',
    createdAt: '2026-09-06T12:30:00.000Z',
    voiceVersion: 'v3',
  },
];

export const PIECE_FIXTURE_DETAIL: PieceDetailV1 = {
  state: 'default',
  piece: PIECE_FIXTURE_ROWS[0],
  core: PIECE_FIXTURE_CORE,
  legacyBody: null,
  adaptations: PIECE_FIXTURE_ADAPTATIONS,
  targets: [
    {
      platform: 'telegram',
      name: 'Telegram',
      kinds: ['post'],
      channels: [
        { id: 'int-tg-main', name: 'Мой канал', providerIdentifier: 'telegram' },
        { id: 'int-tg-2', name: 'Заметки', providerIdentifier: 'telegram' },
        { id: 'int-tg-3', name: 'Анонсы', providerIdentifier: 'telegram' },
      ],
      available: true,
    },
    {
      platform: 'vk',
      name: 'VK',
      kinds: ['post'],
      channels: [{ id: 'int-vk', name: 'Студия', providerIdentifier: 'vk' }],
      available: true,
    },
    {
      platform: 'wordpress',
      name: 'Сайт',
      kinds: ['article'],
      channels: [{ id: 'int-site', name: 'Блог', providerIdentifier: 'wordpress' }],
      available: true,
    },
    /** Не подключён: на странице показан выключенным с причиной и ссылкой на каналы. */
    {
      platform: 'instagram',
      name: 'Instagram',
      kinds: ['caption'],
      channels: [],
      available: false,
    },
  ],
  later: ADAPTATION_KINDS_LATER,
};

/** Страница материала до волны: сути нет, тело — HTML одного канала. */
export const PIECE_FIXTURE_DETAIL_LEGACY: PieceDetailV1 = {
  state: 'default',
  piece: PIECE_FIXTURE_ROWS[2],
  core: null,
  legacyBody:
    '<p>Удержание мы считаем по когортам недели регистрации, а не по календарному месяцу.</p>',
  adaptations: [
    {
      id: 'adaptation-07-tg',
      pieceId: 'piece-07',
      kind: 'post',
      platform: 'telegram',
      integrationId: 'int-tg-main',
      integrationName: 'Мой канал',
      body: null,
      postId: 'post-398',
      state: 'published',
      date: '2026-09-02T09:30:00.000Z',
      url: 'https://t.me/example/398',
      createdAt: '2026-09-02T08:00:00.000Z',
      voiceVersion: 'v2',
    },
  ],
  targets: PIECE_FIXTURE_DETAIL.targets,
  later: ADAPTATION_KINDS_LATER,
};

/** Вопросы при создании: до трёх, у каждого — вариант модели или честное «не нашла». */
export const PIECE_FIXTURE_CORE_QUESTIONS: PieceQuestionV1[] = [
  {
    key: 'key_idea',
    question: 'Какая главная мысль, которой хотите поделиться?',
    suggested: 'срок держится, когда о нём знает кто-то ещё',
    field: 'thesis',
  },
  {
    key: 'personal_detail',
    question: 'Есть личная история или неожиданный факт?',
    suggested: null,
    why: 'Пойдёт в текст дословно.',
  },
  {
    key: 'position',
    question: 'Где вы стоите в этом споре?',
    suggested: 'ставлю себе срок только вместе с клиентом',
    field: 'position',
  },
];

/** Вопросы под Telegram: из исследования канала, только чего нет в заготовке. */
export const PIECE_FIXTURE_TELEGRAM_QUESTIONS: PieceQuestionV1[] = [
  {
    key: 'hook',
    question: 'Чем зацепить в первой строке?',
    suggested: 'Пять из шести сроков я сорвал сам себе',
    why: 'Её видно в уведомлении, 80–180 знаков.',
  },
  {
    key: 'cta',
    question: 'Один призыв в конце: вопрос читателю или ссылка?',
    suggested: 'вопрос — у вас в канале он собирает больше ответов',
    options: ['вопрос', 'ссылка', 'без призыва'],
  },
];

/** Стрим адаптации, как его читает страница: вопросы терминальны, `done` — последняя строка. */
export const PIECE_FIXTURE_ADAPT_QUESTIONS_STREAM: PieceAdaptEventV1[] = [
  {
    name: 'adapt-started',
    pieceId: 'piece-12',
    kind: 'post',
    channel: { id: 'int-tg-main', name: 'Мой канал', providerIdentifier: 'telegram' },
  },
  { name: 'questions', questions: PIECE_FIXTURE_TELEGRAM_QUESTIONS, round: 1 },
];

export const PIECE_FIXTURE_ADAPT_STREAM: PieceAdaptEventV1[] = [
  {
    name: 'adapt-started',
    pieceId: 'piece-12',
    kind: 'post',
    channel: { id: 'int-tg-main', name: 'Мой канал', providerIdentifier: 'telegram' },
  },
  { name: 'content-context', data: { output: null } },
  {
    name: 'adaptation',
    adaptation: { ...PIECE_FIXTURE_ADAPTATIONS[0], state: 'draft', url: null, date: null },
    content: [
      {
        content: PIECE_FIXTURE_ADAPTATIONS[0].body ?? '',
        usedCitationIds: [],
      },
    ],
    provenance: null,
    draftGaps: [],
    checks: adaptationChecks,
  },
  { name: 'done', adaptationId: 'adaptation-12-tg', postId: 'post-412' },
];

export const PIECE_FIXTURE_ADAPT_ERROR_STREAM: PieceAdaptEventV1[] = [
  {
    name: 'adapt-started',
    pieceId: 'piece-12',
    kind: 'caption',
    channel: { id: 'int-ig', name: 'Витрина', providerIdentifier: 'instagram' },
  },
  {
    name: 'error',
    error: true,
    code: 'PIECE_CHANNEL_UNKNOWN',
    message: 'Подключите канал, чтобы писать сюда.',
  },
];
