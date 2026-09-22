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
  type PieceRowV1 as BasePieceRowV1,
  type PieceTargetV1,
  type PiecesQueryV1,
  type PiecesResponseV1 as BasePiecesResponseV1,
  type PieceQuestionsV1,
  type VoiceScreenStateV1,
  type ZagotovkaCoreV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { PLATFORM_NAMES } from '@contentfactory/react/platform/platform.families';
import { platformLabel } from '../../brand-voice/voice-copy';
import {
  readBrief,
  readQualityChecks,
  readQuestions as readIntakeQuestions,
  readSlopReport,
  type AntiCopyReportV1,
  type SlopVerdictV1,
} from '../intake/intake.adapter';

export type PieceRowV1 = BasePieceRowV1 & {
  matchedForms?: string[];
  searchSnippet?: string;
};
export type PiecesResponseV1 = Omit<BasePiecesResponseV1, 'pieces'> & {
  pieces: PieceRowV1[];
};

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
  PieceQuestionsV1,
  PieceTargetV1,
  PiecesQueryV1,
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

/**
 * Имя площадки, как её называет человек.
 *
 * Сервер кладёт в `name` сам идентификатор провайдера (`columnsOf`), и до этой
 * правки шапка таблицы, фишка фильтра и подсказка клетки печатали `telegram`,
 * `vk`, `wordpress` строчными. Двух новых словарей здесь не заводится: сперва
 * спрашивается словарь раздела — он один знает продуктовые «Сайт» и
 * «Рассылка», которых у провайдеров нет вовсе, — потом общий список из
 * тридцати пяти назначений. Неизвестное имя возвращается как есть: код,
 * который никто не перевёл, человек хотя бы может назвать в письме.
 */
export function platformName(
  platform: string,
  locale: 'ru' | 'en',
  fallback?: string
): string {
  const section = platformLabel(platform, locale);
  if (section !== platform) return section;
  return PLATFORM_NAMES[platform] ?? fallback ?? platform;
}

/** Адреса, по одному месту на каждый. */
export const PIECES_API = {
  list: PIECES_API_BASE,
  detail: PIECE_ROUTES.detail.path,
  create: PIECE_ROUTES.create.path,
  adapt: PIECE_ROUTES.adapt.path,
  archive: PIECE_ROUTES.archive.path,
  delete: PIECE_ROUTES.delete.path,
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

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

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
  'instruction',
  'lead',
  'manual',
  'legacy',
];

const readOriginKind = (value: unknown): PieceOriginV1 =>
  ORIGINS.includes(value as PieceOriginV1)
    ? (value as PieceOriginV1)
    : 'manual';

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
  KINDS.includes(value as AdaptationKindV1)
    ? (value as AdaptationKindV1)
    : 'post';

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
    ...(Array.isArray(record.matchedForms)
      ? {
          matchedForms: record.matchedForms.filter(
            (form): form is string => typeof form === 'string'
          ),
        }
      : {}),
    ...(typeof record.searchSnippet === 'string'
      ? { searchSnippet: record.searchSnippet }
      : {}),
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
    throw new PieceContractError(
      'PIECES_UNREADABLE',
      'The list arrived unreadable.'
    );
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
    checks: readQualityChecks(record.checks),
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
    // Что осталось спросить (`content-factory-next-m2eg`). Заготовки до этой
    // волны вопросов не несут вовсе, и это читается как «спрашивать нечего», а
    // не как пробел: `null` здесь — обычное состояние готовой заготовки.
    questions: readOpenQuestions(record.questions),
    // Что человек прислал (`content-factory-next-97dq.25`): свои слова или
    // чужой пост дословно. Страница показывает это на месте сути, пока сути
    // нет, — вопросы задаются по этому тексту. У заготовок до этой волны
    // чужого текста нет, а свои слова читаются защитно.
    ...(asText(record.personText).trim()
      ? { personText: asText(record.personText) }
      : {}),
    ...(asText(record.instructionText).trim()
      ? { instructionText: asText(record.instructionText) }
      : {}),
    ...(asText(record.sourceText).trim()
      ? { sourceText: asText(record.sourceText) }
      : {}),
    // Источник повода (`content-factory-next-75xn.8`). Без адреса записи нет:
    // строка на странице существует, чтобы человек мог открыть исходное.
    ...(asText(asRecord(record.leadSource)?.url)
      ? {
          leadSource: {
            leadId: asText(asRecord(record.leadSource)?.leadId),
            url: asText(asRecord(record.leadSource)?.url),
            ...(asText(asRecord(record.leadSource)?.title)
              ? { title: asText(asRecord(record.leadSource)?.title) }
              : {}),
          },
        }
      : {}),
  };
};

/** Открытые вопросы заготовки: круг, сами вопросы и то, что уже закрыто. */
export const readOpenQuestions = (value: unknown): PieceQuestionsV1 | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    round: Number(record.round) || 0,
    items: readIntakeQuestions(record.items) as PieceQuestionsV1['items'],
    answered: asArray(record.answered).flatMap((entry) => {
      const answer = asRecord(entry);
      if (!answer || typeof answer.field !== 'string') return [];
      return [
        {
          field: answer.field as PieceQuestionsV1['answered'][number]['field'],
          text: asText(answer.text),
          origin: answer.origin === 'model' ? 'model' : 'person',
          answeredAt: asText(answer.answeredAt),
        } as PieceQuestionsV1['answered'][number],
      ];
    }),
  };
};

export function readPieceDetail(value: unknown): PieceDetailV1 {
  const record = asRecord(value);
  const piece = record ? readRow(record.piece) : null;
  if (!record || !piece) {
    throw new PieceContractError(
      'PIECE_UNREADABLE',
      'The piece arrived unreadable.'
    );
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

  // Transport keep-alives do not change the current product stage.
  if (record.name === 'heartbeat') return null;

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
      return {
        kind: 'event',
        event: { name: 'generator', event: record.event },
      };

    case 'adaptation': {
      const adaptation = readAdaptation(record.adaptation);
      if (!adaptation) {
        throw new PieceContractError(
          'PIECE_STREAM_INVALID',
          'The adaptation arrived without an identifier.'
        );
      }
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
          checks: readQualityChecks(record.checks),
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

/**
 * Шапка списка: одна фраза из двух фильтров.
 *
 * `platform` и `state` читаются вместе — «на площадке в состоянии», — и пара
 * заменила прежнее «Ещё нет в…»: то была та же фраза с намертво вписанным
 * состоянием `none`, и спросить у той же площадки что-либо ещё было нельзя.
 * Сервер по-прежнему знает ровно два вопроса из этой пары, и именно они уходят
 * в запрос; остальные сочетания отбираются на уже загруженных строках.
 */
export type PiecesFilters = {
  q: string;
  /** Площадка, либо `ALL`. */
  platform: string;
  /** Состояние клетки, либо `ALL`, либо архив. */
  state: PieceCellStateV1 | 'ALL' | 'archived';
  includeArchived: boolean;
  sort: PieceSort;
};

/** Состояния, про которые умеет спрашивать сервер. */
const SERVER_STATES: readonly AdaptationStateV1[] = [
  'published',
  'queued',
  'error',
  'draft',
];

const isServerState = (
  state: PiecesFilters['state']
): state is AdaptationStateV1 =>
  SERVER_STATES.includes(state as AdaptationStateV1);

export const PIECE_SORT_DEFAULT = 'date:desc' as const;

export const PIECE_SORT_FIELDS = ['code', 'title', 'format', 'date'] as const;
export type PieceSortField = (typeof PIECE_SORT_FIELDS)[number];
export type PieceSortDirection = 'asc' | 'desc';
export type PieceSort = `${PieceSortField}:${PieceSortDirection}`;

const PIECE_SORT_VALUES: readonly PieceSort[] = [
  'code:asc',
  'code:desc',
  'title:asc',
  'title:desc',
  'format:asc',
  'format:desc',
  'date:asc',
  'date:desc',
];

export const isPieceSort = (value: unknown): value is PieceSort =>
  typeof value === 'string' && PIECE_SORT_VALUES.includes(value as PieceSort);

/** Reads `sort` from a page query, falling back to newest pieces first. */
export function readPieceSort(value: unknown): PieceSort {
  if (isPieceSort(value)) return value;

  let raw: string | null = null;
  if (typeof value === 'string') {
    try {
      raw = new URLSearchParams(
        value.startsWith('?') ? value.slice(1) : value
      ).get('sort');
    } catch {
      raw = null;
    }
  } else if (
    value &&
    typeof value === 'object' &&
    'get' in value &&
    typeof value.get === 'function'
  ) {
    raw = value.get('sort');
  }

  return isPieceSort(raw) ? raw : PIECE_SORT_DEFAULT;
}

export const emptyPiecesFilters: PiecesFilters = {
  q: '',
  platform: 'ALL',
  state: 'ALL',
  includeArchived: false,
  sort: PIECE_SORT_DEFAULT,
};

/**
 * Что из пары умеет спросить сервер.
 *
 * «Площадка + ещё нет» — это ровно `missingOn`, а «состояние при любой
 * площадке» — ровно `state`. Прочие сочетания сервер не знает, и выдумывать
 * ему параметр волна не стала: строка приезжает целиком, а отбор доделывает
 * `filterPieces` на том, что уже загружено.
 */
export const piecesQuery = (filters: PiecesFilters): PiecesQueryV1 => ({
  ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
  ...(filters.platform !== 'ALL' && filters.state === 'none'
    ? { missingOn: filters.platform }
    : {}),
  ...(filters.platform === 'ALL' && isServerState(filters.state)
    ? { state: filters.state }
    : {}),
  ...(filters.includeArchived || filters.state === 'archived'
    ? { includeArchived: true }
    : {}),
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
  state === 'published' ||
  state === 'queued' ||
  state === 'draft' ||
  state === 'error'
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

/** Состояния, которые значат «адаптация здесь есть». */
const WRITTEN_STATES: readonly PieceCellStateV1[] = [
  'published',
  'queued',
  'error',
  'draft',
];

/**
 * Отбор строк по шапке.
 *
 * Дублирование намеренное и одностороннее: то, что сервер умеет спросить,
 * уходит в запрос, а здесь применяется всё целиком — и то, чего сервер не
 * знает. Повторно применённый отбор ничего не меняет; отсутствующий превратил
 * бы половину пары в кнопку без действия.
 *
 * Пара читается одной фразой. Площадка без состояния значит «здесь уже
 * писали» — иначе выбор площадки не отбирал бы ничего вовсе, потому что
 * клетка на этой площадке есть у каждой строки. Состояние без площадки значит
 * «хоть где-нибудь». «Ещё нет» по-прежнему не захватывает строки, публикации
 * которых просто не прочитаны: `unknown` — это незнание, а не отсутствие.
 */
export function filterPieces(
  rows: readonly PieceRowV1[],
  filters: PiecesFilters
): PieceRowV1[] {
  return rows.filter((row) => {
    if (filters.state === 'archived' && !row.archivedAt) return false;
    if (
      filters.state !== 'archived' &&
      !filters.includeArchived &&
      row.archivedAt
    )
      return false;
    if (filters.state === 'archived') return true;

    const platform = filters.platform;
    const state = filters.state;

    if (platform !== 'ALL' && state !== 'ALL') {
      return cellOf(row, platform).state === state;
    }
    if (platform !== 'ALL') {
      return WRITTEN_STATES.includes(cellOf(row, platform).state);
    }
    if (state !== 'ALL') {
      const columns = row.cells;
      // Строка без клеток — сплошное «пока не знаем»: другого состояния у неё
      // нет, и подставлять ей «ещё нет» фильтр не смеет.
      if (!columns) return state === 'unknown';
      return columns.some((cell) => cell.state === state);
    }
    return true;
  });
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const displayDate = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/;

const dateValue = (value: string): number | null => {
  const match = value.match(displayDate);
  if (match) {
    const year = Number(match[3]);
    const fullYear = match[3].length === 2 ? 2000 + year : year;
    return Date.UTC(fullYear, Number(match[2]) - 1, Number(match[1]));
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sortText = (row: PieceRowV1, field: PieceSortField): string => {
  switch (field) {
    case 'code':
      // Codes are the visible creation marker. The ISO timestamp keeps
      // unpadded codes (cnt-9, cnt-12) in creation order when it is present.
      return row.createdAt || row.code;
    case 'date':
      return row.createdAt || row.date;
    case 'title':
      return row.title;
    case 'format':
      return row.format;
  }
};

const compareSortText = (
  left: string,
  right: string,
  field: PieceSortField
): number => {
  if (field === 'code' || field === 'date') {
    const leftDate = dateValue(left);
    const rightDate = dateValue(right);
    if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    // A missing date follows a dated row in the base (ascending) order.
    if (leftDate !== null && rightDate === null) return -1;
    if (leftDate === null && rightDate !== null) return 1;
  }
  return collator.compare(left, right);
};

/** Sorts the already-filtered list without mutating the response array. */
export function sortPieces(
  rows: readonly PieceRowV1[],
  sort: PieceSort = PIECE_SORT_DEFAULT
): PieceRowV1[] {
  const value = readPieceSort(sort);
  const separator = value.indexOf(':');
  const field = value.slice(0, separator) as PieceSortField;
  const direction = value.slice(separator + 1) as PieceSortDirection;
  const multiplier = direction === 'asc' ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = compareSortText(
        sortText(left.row, field),
        sortText(right.row, field),
        field
      );
      return compared === 0 ? left.index - right.index : compared * multiplier;
    })
    .map(({ row }) => row);
}
