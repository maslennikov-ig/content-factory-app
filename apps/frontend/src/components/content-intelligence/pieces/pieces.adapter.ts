/**
 * Провод между экранами заготовок и дверями `/content-intelligence/pieces`.
 *
 * `content-factory-next-tu3k.9.9`, поток Z5. Здесь нет ни одного React-импорта
 * нарочно — тот же раздел ответственности, что у `intake.adapter.ts`: разбор
 * ответа, разбор события стрима, сборка тела запроса и решения «что показать в
 * клетке» проверяются без документа, а экран остаётся тем, что рисует.
 *
 * Сервер этих дверей пишут параллельные потоки волны (Z2 и Z3). Пока его нет,
 * правда одна на всех — типы контракта и `pieces.fixture.ts`; ни одна форма
 * ответа здесь не выдумана.
 *
 * Три решения, которые здесь важнее кода.
 *
 * Строка без `cells` рисует `unknown`, а не `none`. Ответ без клеток означает
 * «публикацию ещё не прочитали», и «ещё нет» поверх существующих постов было
 * бы враньём экрана о состоянии продукта — контракт называет это прямо.
 *
 * Колонка — площадка, а не канал. Клетка `more` считает остальные каналы той
 * же площадки, но выбор колонок и фильтр «Ещё нет в…» работают именно по
 * площадке, потому что колонок иначе становится столько, сколько каналов.
 *
 * И `no_channel` — это отказ до нажатия, а не после. Клетка выключена и несёт
 * причину словами; это то же правило, по которому старая таблица материалов
 * перестала предлагать площадку без канала (`fn33.86`).
 */

import {
  PIECE_DEFAULT_COLUMNS,
  PIECE_EXCERPT_LINES,
  PIECE_MAX_INTERVIEW_ROUNDS,
  PIECE_MAX_QUESTIONS,
  PIECE_ROUTES,
  PIECE_TABLE_MIN_WIDTH,
  PIECES_API_BASE,
  type AdaptationKindV1,
  type AdaptationStateV1,
  type AdaptationV1,
  type PieceAdaptEventV1,
  type PieceAdaptRequestV1,
  type PieceAnswerInputV1,
  type PieceCellStateV1,
  type PieceCellV1,
  type PieceColumnV1,
  type PieceDetailV1,
  type PieceErrorCodeV1,
  type PieceOriginV1,
  type PieceQuestionKeyV1,
  type PieceQuestionV1,
  type PieceRowV1,
  type PieceTargetV1,
  type PiecesQueryV1,
  type PiecesResponseV1,
  type VoiceScreenStateV1,
  type ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  readBrief,
  readSlopReport,
  type AntiCopyReportV1,
  type SlopVerdictV1,
} from '../intake/intake.adapter';

export type {
  AdaptationKindV1,
  AdaptationStateV1,
  AdaptationV1,
  PieceAdaptEventV1,
  PieceAdaptRequestV1,
  PieceAnswerInputV1,
  PieceCellStateV1,
  PieceCellV1,
  PieceColumnV1,
  PieceDetailV1,
  PieceErrorCodeV1,
  PieceOriginV1,
  PieceQuestionKeyV1,
  PieceQuestionV1,
  PieceRowV1,
  PieceTargetV1,
  PiecesQueryV1,
  PiecesResponseV1,
  VoiceScreenStateV1,
  ZagotovkaCoreV1,
};

export {
  PIECE_DEFAULT_COLUMNS,
  PIECE_EXCERPT_LINES,
  PIECE_MAX_INTERVIEW_ROUNDS,
  PIECE_MAX_QUESTIONS,
  PIECE_TABLE_MIN_WIDTH,
};

/** Адреса, по одному месту на каждый. */
export const PIECES_API = {
  list: PIECES_API_BASE,
  detail: PIECE_ROUTES.detail.path,
  create: PIECE_ROUTES.create.path,
  adapt: PIECE_ROUTES.adapt.path,
  archive: PIECE_ROUTES.archive.path,
  deleteAdaptation: PIECE_ROUTES.deleteAdaptation.path,
} as const;

/** Адрес страницы заготовки — один на весь фронтенд. */
export const piecePath = (pieceId: string) =>
  `/content/pieces/${encodeURIComponent(pieceId)}`;

/** Где человек делает новую заготовку: вкладка «Бриф» открывается входом. */
export const NEW_PIECE_PATH = '/content?tab=brief';

/** Ключ выбранных колонок. Выбор за человеком, а не за пространством. */
export const PIECE_COLUMNS_STORAGE_KEY = 'cf.pieces.columns';

/* -------------------------------------------------------------------------
 * Отказ, который экран может напечатать
 * ---------------------------------------------------------------------- */

export class PieceContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PieceContractError';
    this.code = code;
  }
}

/* -------------------------------------------------------------------------
 * Чтение ответа
 * ---------------------------------------------------------------------- */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNullableText = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const SCREEN_STATES: readonly VoiceScreenStateV1[] = [
  'default',
  'loading',
  'empty',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
];

export const readScreenState = (value: unknown): VoiceScreenStateV1 =>
  SCREEN_STATES.includes(value as VoiceScreenStateV1)
    ? (value as VoiceScreenStateV1)
    : 'default';

const CELL_STATES: readonly PieceCellStateV1[] = [
  'published',
  'queued',
  'error',
  'draft',
  'none',
  'no_channel',
  'unknown',
];

export const readCellState = (value: unknown): PieceCellStateV1 =>
  CELL_STATES.includes(value as PieceCellStateV1)
    ? (value as PieceCellStateV1)
    : 'unknown';

const ORIGINS: readonly PieceOriginV1[] = [
  'thought',
  'link',
  'foreign_post',
  'lead',
  'manual',
  'legacy',
];

const readOriginKind = (value: unknown): PieceOriginV1 =>
  ORIGINS.includes(value as PieceOriginV1) ? (value as PieceOriginV1) : 'manual';

const ADAPTATION_STATES: readonly AdaptationStateV1[] = [
  'published',
  'queued',
  'error',
  'draft',
];

export const readAdaptationState = (value: unknown): AdaptationStateV1 =>
  ADAPTATION_STATES.includes(value as AdaptationStateV1)
    ? (value as AdaptationStateV1)
    : 'draft';

const KINDS: readonly AdaptationKindV1[] = [
  'post',
  'caption',
  'article',
  'newsletter',
  'video',
  'audio',
];

const readKind = (value: unknown): AdaptationKindV1 =>
  KINDS.includes(value as AdaptationKindV1) ? (value as AdaptationKindV1) : 'post';

const VERDICTS: readonly SlopVerdictV1[] = ['clean', 'review', 'rewrite'];

/** Вердикт строки списка. Незнакомое слово — то же самое, что «не считался». */
export const readVerdict = (value: unknown): SlopVerdictV1 | null =>
  VERDICTS.includes(value as SlopVerdictV1) ? (value as SlopVerdictV1) : null;

export const readColumn = (value: unknown): PieceColumnV1 | null => {
  const record = asRecord(value);
  if (!record || typeof record.platform !== 'string') return null;
  return {
    platform: record.platform,
    name: asText(record.name, record.platform),
    channels: Number(record.channels) || 0,
    adaptations: Number(record.adaptations) || 0,
  };
};

export const readCell = (value: unknown): PieceCellV1 | null => {
  const record = asRecord(value);
  if (!record || typeof record.platform !== 'string') return null;
  return {
    platform: record.platform,
    state: readCellState(record.state),
    date: asNullableText(record.date),
    url: asNullableText(record.url),
    postId: asNullableText(record.postId),
    adaptationId: asNullableText(record.adaptationId),
    integrationId: asNullableText(record.integrationId),
    ...(typeof record.more === 'number' && record.more > 0
      ? { more: record.more }
      : {}),
  };
};

export const readRow = (value: unknown): PieceRowV1 | null => {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') return null;
  return {
    id: record.id,
    code: asText(record.code, record.id),
    title: asText(record.title),
    format: asText(record.format),
    date: asText(record.date),
    createdAt: asText(record.createdAt),
    excerpt: asArray(record.excerpt).filter(
      (line): line is string => typeof line === 'string'
    ),
    coreExtracted: record.coreExtracted === true,
    origin: readOriginKind(record.origin),
    ...(typeof record.voiceVersion === 'string'
      ? { voiceVersion: record.voiceVersion }
      : {}),
    slopVerdict: readVerdict(record.slopVerdict),
    // Ключа нет вовсе — состояние неизвестно; пустой массив — тоже ответ, и
    // это разные вещи, поэтому поле не подставляется.
    ...('cells' in record
      ? {
          cells: asArray(record.cells).flatMap((entry) => {
            const cell = readCell(entry);
            return cell ? [cell] : [];
          }),
        }
      : {}),
    archivedAt: asNullableText(record.archivedAt),
  };
};

export function readPiecesResponse(value: unknown): PiecesResponseV1 {
  const record = asRecord(value);
  if (!record) {
    throw new PieceContractError('PIECES_UNREADABLE', 'The list arrived unreadable.');
  }
  return {
    state: readScreenState(record.state),
    columns: asArray(record.columns).flatMap((entry) => {
      const column = readColumn(entry);
      return column ? [column] : [];
    }),
    pieces: asArray(record.pieces).flatMap((entry) => {
      const row = readRow(entry);
      return row ? [row] : [];
    }),
    ...(typeof record.notice === 'string' ? { notice: record.notice } : {}),
  };
}

export const readAdaptation = (value: unknown): AdaptationV1 | null => {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') return null;
  const checks = asRecord(record.checks) ?? {};
  return {
    id: record.id,
    pieceId: asText(record.pieceId),
    kind: readKind(record.kind),
    platform: asText(record.platform),
    integrationId: asNullableText(record.integrationId),
    integrationName: asNullableText(record.integrationName),
    title: asNullableText(record.title),
    body: asNullableText(record.body),
    postId: asNullableText(record.postId),
    mediaId: asNullableText(record.mediaId),
    state: readAdaptationState(record.state),
    date: asNullableText(record.date),
    url: asNullableText(record.url),
    createdAt: asText(record.createdAt),
    ...(typeof record.voiceVersion === 'string'
      ? { voiceVersion: record.voiceVersion }
      : {}),
    checks: {
      antiCopy: (asRecord(checks.antiCopy) ?? null) as AntiCopyReportV1 | null,
      slop: readSlopReport(checks.slop),
    },
  };
};

const readTarget = (value: unknown): PieceTargetV1 | null => {
  const record = asRecord(value);
  if (!record || typeof record.platform !== 'string') return null;
  const platform = record.platform;
  return {
    platform,
    name: asText(record.name, record.platform),
    kinds: asArray(record.kinds).map(readKind),
    channels: asArray(record.channels).flatMap((entry) => {
      const channel = asRecord(entry);
      if (!channel || typeof channel.id !== 'string') return [];
      return [
        {
          id: channel.id,
          name: asText(channel.name, channel.id),
          providerIdentifier: asText(channel.providerIdentifier, platform),
        },
      ];
    }),
    available: record.available === true,
  };
};

export const readCore = (value: unknown): ZagotovkaCoreV1 | null => {
  const record = asRecord(value);
  if (!record) return null;
  const brief = readBrief(record.brief);
  if (!brief) return null;
  return {
    version: 'piece-core/v1',
    text: asText(record.text),
    brief,
    answers: asArray(record.answers).flatMap((entry) => {
      const answer = asRecord(entry);
      if (!answer || typeof answer.key !== 'string') return [];
      return [
        {
          key: answer.key as PieceQuestionKeyV1,
          text: asText(answer.text),
          origin:
            answer.origin === 'person' || answer.origin === 'confirmed'
              ? answer.origin
              : 'model',
          step: answer.step === 'adaptation' ? 'adaptation' : 'core',
          ...(typeof answer.platform === 'string'
            ? { platform: answer.platform }
            : {}),
          answeredAt: asText(answer.answeredAt),
        },
      ];
    }),
    slop: readSlopReport(record.slop),
    writtenBy: record.writtenBy === 'fallback' ? 'fallback' : 'model',
    authorNumbers: record.authorNumbers === true,
  };
};

export function readPieceDetail(value: unknown): PieceDetailV1 {
  const record = asRecord(value);
  const piece = record ? readRow(record.piece) : null;
  if (!record || !piece) {
    throw new PieceContractError('PIECE_UNREADABLE', 'The piece arrived unreadable.');
  }
  return {
    state: readScreenState(record.state),
    piece,
    core: readCore(record.core),
    legacyBody: asNullableText(record.legacyBody),
    adaptations: asArray(record.adaptations).flatMap((entry) => {
      const adaptation = readAdaptation(entry);
      return adaptation ? [adaptation] : [];
    }),
    targets: asArray(record.targets).flatMap((entry) => {
      const target = readTarget(entry);
      return target ? [target] : [];
    }),
    later: asArray(record.later).map(readKind),
    ...(typeof record.notice === 'string' ? { notice: record.notice } : {}),
  };
}

export const readQuestions = (value: unknown): PieceQuestionV1[] =>
  asArray(value).flatMap((entry) => {
    const question = asRecord(entry);
    if (!question || typeof question.key !== 'string') return [];
    return [
      {
        key: question.key as PieceQuestionKeyV1,
        question: asText(question.question),
        // `null` — модель честно не нашла ответа и просит слова человека. Это
        // не то же самое, что пустая строка, и подменять одно другим значит
        // напечатать «я думаю, вот так» с пустотой под этим.
        suggested:
          typeof question.suggested === 'string' && question.suggested.trim()
            ? question.suggested
            : null,
        ...(typeof question.field === 'string'
          ? { field: question.field as PieceQuestionV1['field'] }
          : {}),
        ...(Array.isArray(question.options)
          ? {
              options: question.options.filter(
                (option): option is string => typeof option === 'string'
              ),
            }
          : {}),
        ...(typeof question.why === 'string' ? { why: question.why } : {}),
      },
    ];
  });

/* -------------------------------------------------------------------------
 * Чтение стрима адаптации
 * ---------------------------------------------------------------------- */

/**
 * Событие стрима, прочитанное как размеченное объединение контракта.
 *
 * Имя, которого в контракте нет, не роняет экран: оно становится шагом, как у
 * входа. Контракт разрешает добавлять события аддитивно, и читатель, падающий
 * на незнакомом имени, превратил бы это разрешение в поломку.
 */
export type PieceAdaptReading =
  | { kind: 'event'; event: PieceAdaptEventV1 }
  | { kind: 'step'; name: string };

export function readAdaptEvent(line: string): PieceAdaptReading | null {
  if (!line.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new PieceContractError(
      'PIECE_STREAM_INVALID',
      'The adaptation response was incomplete.'
    );
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new PieceContractError(
      'PIECE_STREAM_INVALID',
      'The adaptation response was incomplete.'
    );
  }

  if (record.error === true || record.name === 'error') {
    return {
      kind: 'event',
      event: {
        name: 'error',
        error: true,
        code: asText(record.code, 'PIECE_ADAPT_FAILED'),
        message: asText(record.message, 'The adaptation was not written.'),
      },
    };
  }

  const name = asText(record.name);
  if (!name) {
    throw new PieceContractError(
      'PIECE_STREAM_INVALID',
      'The adaptation response was incomplete.'
    );
  }

  switch (name) {
    case 'adapt-started': {
      const channel = asRecord(record.channel) ?? {};
      return {
        kind: 'event',
        event: {
          name: 'adapt-started',
          pieceId: asText(record.pieceId),
          kind: readKind(record.kind),
          channel: {
            id: asText(channel.id),
            name: asText(channel.name, asText(channel.id)),
            providerIdentifier: asText(channel.providerIdentifier),
          },
        },
      };
    }

    case 'questions':
      return {
        kind: 'event',
        event: {
          name: 'questions',
          questions: readQuestions(record.questions),
          round: Number(record.round) || 1,
        },
      };

    case 'content-context':
      return {
        kind: 'event',
        event: {
          name: 'content-context',
          data: { output: asRecord(record.data)?.output },
        },
      };

    case 'generator':
      return { kind: 'event', event: { name: 'generator', event: record.event } };

    case 'adaptation': {
      const adaptation = readAdaptation(record.adaptation);
      if (!adaptation) {
        throw new PieceContractError(
          'PIECE_STREAM_INVALID',
          'The adaptation arrived without an identifier.'
        );
      }
      const checks = asRecord(record.checks) ?? {};
      return {
        kind: 'event',
        event: {
          name: 'adaptation',
          adaptation,
          content: asArray(record.content).flatMap((entry) => {
            const part = asRecord(entry);
            if (!part || typeof part.content !== 'string') return [];
            return [
              {
                content: part.content,
                usedCitationIds: asArray(part.usedCitationIds).filter(
                  (id): id is string => typeof id === 'string'
                ),
              },
            ];
          }),
          provenance: record.provenance,
          draftGaps: asArray(record.draftGaps),
          checks: {
            antiCopy: (asRecord(checks.antiCopy) ?? null) as AntiCopyReportV1 | null,
            slop: readSlopReport(checks.slop),
          },
        },
      };
    }

    case 'done':
      return {
        kind: 'event',
        event: {
          name: 'done',
          adaptationId: asText(record.adaptationId),
          postId: asNullableText(record.postId),
        },
      };

    default:
      return { kind: 'step', name };
  }
}

/* -------------------------------------------------------------------------
 * Запросы
 * ---------------------------------------------------------------------- */

export type PiecesFilters = {
  q: string;
  /** Площадка фильтра «Ещё нет в…», либо `ALL`. */
  missingOn: string;
  /** Состояние, либо `ALL`. */
  state: AdaptationStateV1 | 'ALL';
  includeArchived: boolean;
};

export const emptyPiecesFilters: PiecesFilters = {
  q: '',
  missingOn: 'ALL',
  state: 'ALL',
  includeArchived: false,
};

export const piecesQuery = (filters: PiecesFilters): PiecesQueryV1 => ({
  ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
  ...(filters.missingOn !== 'ALL' ? { missingOn: filters.missingOn } : {}),
  ...(filters.state !== 'ALL' ? { state: filters.state } : {}),
  ...(filters.includeArchived ? { includeArchived: true } : {}),
});

export function piecesListUrl(filters: PiecesFilters): string {
  const query = piecesQuery(filters);
  const search = new URLSearchParams();
  if (query.q) search.set('q', query.q);
  if (query.missingOn) search.set('missingOn', query.missingOn);
  if (query.state) search.set('state', query.state);
  if (query.includeArchived) search.set('includeArchived', 'true');
  const suffix = search.toString();
  return suffix ? `${PIECES_API.list}?${suffix}` : PIECES_API.list;
}

export const buildAdaptPayload = (input: {
  integrationId: string;
  kind?: AdaptationKindV1;
  answers?: readonly PieceAnswerInputV1[];
  decideKeys?: readonly PieceQuestionKeyV1[];
  skipInterview?: boolean;
}): PieceAdaptRequestV1 => ({
  integrationId: input.integrationId,
  ...(input.kind ? { kind: input.kind } : {}),
  ...(input.answers?.length ? { answers: [...input.answers] } : {}),
  ...(input.decideKeys?.length ? { decideKeys: [...input.decideKeys] } : {}),
  ...(input.skipInterview ? { skipInterview: true } : {}),
});

/* -------------------------------------------------------------------------
 * Что показывает таблица
 * ---------------------------------------------------------------------- */

/**
 * Клетка строки на колонке.
 *
 * Строка без `cells` — не пустая строка, а незнание: контракт говорит это
 * словом, и здесь это одна ветка, а не пять тернарников по экрану.
 */
export function cellOf(row: PieceRowV1, platform: string): PieceCellV1 {
  if (!row.cells) return { platform, state: 'unknown' };
  return (
    row.cells.find((cell) => cell.platform === platform) ?? {
      platform,
      state: 'none',
    }
  );
}

/** Нажимаемая ли клетка и что нажатие означает. */
export type CellAction = 'post' | 'adapt' | 'none';

export const cellAction = (state: PieceCellStateV1): CellAction =>
  state === 'published' || state === 'queued' || state === 'draft' || state === 'error'
    ? 'post'
    : state === 'none'
    ? 'adapt'
    : 'none';

/**
 * Какие колонки видно.
 *
 * Порядок ответа сохраняется: сервер уже отсортировал площадки по числу
 * адаптаций, и вторая сортировка на экране — это два разных ответа на вопрос
 * «какая площадка главная». Без выбора человека видно первые
 * `PIECE_DEFAULT_COLUMNS`; выбор человека уважается целиком, включая пустой.
 */
export function visibleColumns(
  columns: readonly PieceColumnV1[],
  chosen: readonly string[] | null
): { shown: PieceColumnV1[]; rest: PieceColumnV1[] } {
  if (chosen) {
    const wanted = new Set(chosen);
    return {
      shown: columns.filter((column) => wanted.has(column.platform)),
      rest: columns.filter((column) => !wanted.has(column.platform)),
    };
  }
  return {
    shown: columns.slice(0, PIECE_DEFAULT_COLUMNS),
    rest: columns.slice(PIECE_DEFAULT_COLUMNS),
  };
}

export function readStoredColumns(
  storage: Pick<Storage, 'getItem'> | null | undefined
): string[] | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PIECE_COLUMNS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((one): one is string => typeof one === 'string')
      : null;
  } catch {
    return null;
  }
}

export function storeColumns(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  platforms: readonly string[]
): void {
  try {
    storage?.setItem(PIECE_COLUMNS_STORAGE_KEY, JSON.stringify([...platforms]));
  } catch {
    // Приватный режим браузера запрещает запись. Выбор колонок — не та
    // потеря, ради которой стоит показывать человеку отказ.
  }
}

/**
 * Отбор строк по шапке, тот же, что просит сервер.
 *
 * Дублирование намеренное и одностороннее: запрос уходит с теми же
 * параметрами, а это — то, что экран покажет, если сервер параметр ещё не
 * знает (двери пишут параллельно). Повторно применённый отбор ничего не
 * меняет; отсутствующий превратил бы фильтр в кнопку без действия.
 */
export function filterPieces(
  rows: readonly PieceRowV1[],
  filters: PiecesFilters
): PieceRowV1[] {
  const needle = filters.q.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (needle) {
      const haystack = [row.title, row.code, ...row.excerpt]
        .join(' ')
        .toLocaleLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.missingOn !== 'ALL') {
      const cell = cellOf(row, filters.missingOn);
      // «Ещё нет» — это отсутствие адаптации, а не незнание о ней: строка,
      // публикацию которой не прочитали, в этот фильтр не попадает.
      if (cell.state !== 'none') return false;
    }
    if (filters.state !== 'ALL') {
      const cells = row.cells ?? [];
      if (!cells.some((cell) => cell.state === filters.state)) return false;
    }
    return true;
  });
}
