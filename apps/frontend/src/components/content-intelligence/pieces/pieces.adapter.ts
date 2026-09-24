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
  type AdaptationPlanV1,
  type AdaptationStateV1,
  type AdaptationV1,
  type PieceAdaptEventV1,
  type PieceAdaptRequestV1,
  type PieceAdaptOverridesV1,
  type PieceAnswerInputV1,
  type PieceCellStateV1,
  type PieceChannelTabV1,
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
import { stripInlineMarks } from '@contentfactory/helpers/utils/inline-marks';
import {
  PIECE_ADAPTATION_WORKSPACE_ROUTES,
  type PieceAdaptationEditRequestV1,
  type PieceAdaptationScheduleRequestV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-workspace.contract';
import { platformLabel } from '../../brand-voice/voice-copy';
import { EMOJI_LEVEL_VALUES } from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';
import {
  CTA_KINDS,
  HASHTAG_POLICIES,
  LENGTH_PRESETS,
  LENGTH_PRESET_ORDER,
  LINK_POLICIES,
  buildWritingProfilePayload,
  lengthPresetOf,
  type ChannelWritingProfileV1,
  type LengthPreset,
  type WritingProfilePayload,
} from '../intake/writing-profile.adapter';
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
  AdaptationPlanV1,
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
  /* Двери рабочего места (`97dq.37`, §3.5) — из их собственного контракта. */
  /** `PATCH {body?, image?}` — ручная правка, пока пост в черновике. */
  adaptation: PIECE_ADAPTATION_WORKSPACE_ROUTES.edit.path,
  /** `POST {date} | {now: true}` — в расписание или сразу в канал. */
  schedule: PIECE_ADAPTATION_WORKSPACE_ROUTES.schedule.path,
  /** `POST` без тела — «Снять с расписания», обратно в черновик. */
  unschedule: PIECE_ADAPTATION_WORKSPACE_ROUTES.unschedule.path,
  /** `POST {date}` — перенести запланированный пост на другое время (`97dq.57`). */
  place: PIECE_ADAPTATION_WORKSPACE_ROUTES.place.path,
  /** `PUT {options?, planMode?}` — настройки поста в канале (`97dq.70`). */
  postSettings: PIECE_ADAPTATION_WORKSPACE_ROUTES.postSettings.path,
  /** `GET` — сколько написанных постов канала затронет его режим (`97dq.70`). */
  channelPlanImpact: PIECE_ADAPTATION_WORKSPACE_ROUTES.channelPlanImpact.path,
  /** `POST` — «Ко всем N» (`97dq.70`). */
  channelPlanApply: PIECE_ADAPTATION_WORKSPACE_ROUTES.channelPlanApply.path,
  /* Ссылка для поста и правка заготовки (`97dq.75`). */
  /** `PUT {url}` — ответ на «Какую ссылку поставить в пост?»; `null` — без ссылки. */
  postLink: PIECE_ROUTES.postLink.path,
  /** `PUT {text, expected}` — правка сути руками. */
  editCore: PIECE_ROUTES.editCore.path,
  /** `POST {text}` — «Дописать материал». */
  appendMaterial: PIECE_ROUTES.appendMaterial.path,
  /** `POST` — «Пересобрать суть». */
  rebuildCore: PIECE_ROUTES.rebuildCore.path,
  /** `POST {index, replacedAt, expected}` — «Вернуть эту версию» (`97dq.85`). */
  restoreCore: PIECE_ROUTES.restoreCore.path,
} as const;

/** Адрес страницы заготовки — один на весь фронтенд. */
export const piecePath = (pieceId: string) =>
  `/content/pieces/${encodeURIComponent(pieceId)}`;

/**
 * Вкладка страницы заготовки (`97dq.37`): «Суть» или канал.
 *
 * Вкладка живёт в адресе (`?tab=core|<integrationId>`): ссылку на канал
 * заготовки можно переслать, клетка списка и календарь ведут прямо в неё, а
 * перезагрузка не возвращает человека на «Суть».
 */
export const PIECE_TAB_CORE = 'core';

export const pieceTabPath = (pieceId: string, tab?: string | null) =>
  tab && tab !== PIECE_TAB_CORE
    ? `${piecePath(pieceId)}?tab=${encodeURIComponent(tab)}`
    : piecePath(pieceId);

/** Значение `tab` из адреса; пустое — это «Суть». */
export const readPieceTab = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : PIECE_TAB_CORE;

/**
 * Вкладка канала с датой слота календаря (`97dq.50`): «Поставить на 19:00» в
 * окне «Что публикуем» ведёт сюда, а «Когда» черновика встаёт на это время.
 * Дата — ISO в `?when=`; пост по-прежнему уходит только кнопкой
 * «Запланировать» на самой вкладке.
 */
export const pieceSlotPath = (
  pieceId: string,
  integrationId: string,
  at?: Date | null
) => {
  const base = pieceTabPath(pieceId, integrationId);
  if (!at || Number.isNaN(at.getTime())) return base;
  const glue = base.includes('?') ? '&' : '?';
  return `${base}${glue}when=${encodeURIComponent(at.toISOString())}`;
};

/**
 * `?when=` из адреса. Прошедшее и нечитаемое — не дата: вкладка тогда берёт
 * свободный слот канала, как без параметра.
 */
export const readPieceWhen = (
  value: unknown,
  now: Date = new Date()
): Date | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const at = new Date(value.trim());
  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()
    ? null
    : at;
};

/**
 * День поста в календаре, а не календарь «вообще»: человек, нажавший «Открыть
 * в календаре», ищет именно этот пост, и неделя, в которой его нет, — это
 * второй поиск.
 */
export function calendarPath(
  iso: string | null | undefined,
  integrationId?: string | null
): string {
  const at = iso ? new Date(iso) : null;
  const parts: string[] = [];
  if (integrationId)
    parts.push(`integrationId=${encodeURIComponent(integrationId)}`);
  if (at && !Number.isNaN(at.getTime())) {
    const two = (value: number) => String(value).padStart(2, '0');
    const day = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(
      at.getDate()
    )}`;
    parts.push(`startDate=${day}`, `endDate=${day}`, 'display=day');
  }
  return parts.length ? `/launches?${parts.join('&')}` : '/launches';
}

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
    // Имя канала для подсказки клетки (`97dq.20`); нет — подсказка без него.
    ...(typeof record.channelName === 'string' && record.channelName.trim()
      ? { channelName: record.channelName }
      : {}),
    ...(typeof record.more === 'number' && record.more > 0
      ? { more: record.more }
      : {}),
    ...(record.planned === true ? { planned: true } : {}),
  };
};

/**
 * Место версии в календаре канала (`97dq.57`). Нет у старого сервера, у
 * опубликованной и ошибочной версии.
 */
export const readAdaptationPlan = (
  value: unknown
): AdaptationPlanV1 | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const status =
    record.status === 'reserved' ||
    record.status === 'queued' ||
    record.status === 'draft'
      ? record.status
      : null;
  if (!status) return undefined;
  const note = asNullableText(record.note);
  return {
    status,
    date: asNullableText(record.date),
    autopilot: record.autopilot === true,
    current: record.current !== false,
    ...(note ? { note } : {}),
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

export const readAdaptation = (
  value: unknown
): WorkspaceAdaptationV1 | null => {
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
    ...(readAdaptationPlan(record.plan)
      ? { plan: readAdaptationPlan(record.plan) }
      : {}),
    ...(readImage(record.image, record.mediaId)
      ? { image: readImage(record.image, record.mediaId) }
      : {}),
  };
};

/**
 * Картинка поста: одна, из медиатеки.
 *
 * Дверь адаптации называет её идентификатором (`mediaId`); адрес для
 * миниатюры знает только та страница, где её выбрали, и тогда он приезжает
 * объектом `image`. Без адреса картинка всё равно есть — экран говорит это
 * словами, а не пустой рамкой.
 */
const readImage = (
  value: unknown,
  mediaId: unknown
): AdaptationImageV1 | null => {
  const record = asRecord(value);
  if (record && typeof record.id === 'string' && record.id)
    return { id: record.id, path: asText(record.path) };
  return typeof mediaId === 'string' && mediaId
    ? { id: mediaId, path: '' }
    : null;
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

/** Ответ автора на вопрос о ссылке (`97dq.75`): адрес или «Без ссылки». */
const readPostLinkField = (
  value: unknown
): Pick<ZagotovkaCoreV1, 'postLink'> => {
  const record = asRecord(value);
  if (!record || record.origin !== 'author') return {};
  const answeredAt = asText(record.answeredAt);
  if (record.url === null)
    return { postLink: { url: null, origin: 'author', answeredAt } };
  const url = readLinkAddress(asText(record.url));
  return url ? { postLink: { url, origin: 'author', answeredAt } } : {};
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
    // Что автор дал заготовке потом (`97dq.75`).
    ...readPostLinkField(record.postLink),
    ...(asArray(record.addedMaterial).length
      ? {
          addedMaterial: asArray(record.addedMaterial).flatMap((entry) => {
            const added = asRecord(entry);
            return added && asText(added.text).trim()
              ? [{ text: asText(added.text), addedAt: asText(added.addedAt) }]
              : [];
          }),
        }
      : {}),
    ...(record.materialPending === true ? { materialPending: true } : {}),
    ...(record.editedBy === 'person' ? { editedBy: 'person' as const } : {}),
    // «Версии сути» (`97dq.85`): прежние тексты, старые первыми, как хранит
    // сервер. Индекс в этом списке — адрес версии для «Вернуть эту версию»,
    // поэтому битая запись не выбрасывается, а читается пустой и не
    // показывается кнопкой: сдвиг индексов вернул бы не ту версию.
    ...(asArray(record.revisions).length
      ? {
          revisions: asArray(record.revisions).map((entry) => {
            const revision = asRecord(entry);
            return {
              text: asText(revision?.text),
              writtenBy:
                revision?.writtenBy === 'person' ||
                revision?.writtenBy === 'fallback'
                  ? revision.writtenBy
                  : ('model' as const),
              replacedAt: asText(revision?.replacedAt),
            };
          }),
        }
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
          // Вопрос о материале и его текст (`97dq.56`): «Что мы поняли»
          // показывает решение модели рядом с вопросом, на который оно.
          ...(typeof answer.key === 'string' ? { key: answer.key } : {}),
          ...(asText(answer.question).trim()
            ? { question: asText(answer.question) }
            : {}),
          text: asText(answer.text),
          origin: answer.origin === 'model' ? 'model' : 'person',
          answeredAt: asText(answer.answeredAt),
        } as PieceQuestionsV1['answered'][number],
      ];
    }),
  };
};

/**
 * «Что вы прислали» (`97dq.41`): вход дословно, до всех правок.
 *
 * Сервер отдаёт `sentText` строкой (новое поле `inputText`, у старых
 * заготовок — первое непустое из присланного); объект `{text, kind, at}` тоже
 * читается, чтобы поток бэкенда мог добавить вид входа, не ломая экрана.
 * Пока сервер поля не шлёт, текст собирается из того, что уже есть в сути, в
 * том же порядке: чужой текст, задание, свои слова.
 */
export function readSentText(
  value: unknown,
  core: ZagotovkaCoreV1 | null
): SentTextV1 | null {
  const kindOfCore = (): SentTextKindV1 =>
    core?.brief.inputKind === 'foreign_post'
      ? 'source'
      : core?.brief.inputKind === 'link'
      ? 'link'
      : core?.brief.inputKind === 'instruction'
      ? 'instruction'
      : 'person';
  const record = asRecord(value);
  const direct = typeof value === 'string' ? value : asText(record?.text);
  if (direct.trim()) {
    const kind = asText(record?.kind);
    return {
      text: direct,
      kind: SENT_KINDS.includes(kind as SentTextKindV1)
        ? (kind as SentTextKindV1)
        : kindOfCore(),
      at: asNullableText(record?.at),
    };
  }
  if (!core) return null;
  if (core.sourceText?.trim())
    return { text: core.sourceText, kind: kindOfCore(), at: null };
  if (core.instructionText?.trim())
    return { text: core.instructionText, kind: 'instruction', at: null };
  if (core.personText?.trim())
    return { text: core.personText, kind: 'person', at: null };
  return null;
}

/** Вкладка канала из ответа двери (`PieceChannelTabV1`). */
const readChannelTab = (value: unknown): PieceChannelTabV1 | null => {
  const record = asRecord(value);
  if (!record || typeof record.integrationId !== 'string') return null;
  const cell = readCell(record.cell);
  return {
    integrationId: record.integrationId,
    name: asText(record.name, record.integrationId),
    providerIdentifier: asText(record.providerIdentifier),
    maxLength:
      typeof record.maxLength === 'number' && record.maxLength > 0
        ? record.maxLength
        : null,
    cell: cell ?? {
      platform: asText(record.providerIdentifier),
      state: 'none',
    },
    adaptationIds: asArray(record.adaptationIds).filter(
      (id): id is string => typeof id === 'string'
    ),
    ...(isPlanModeWord(record.planMode) ? { planMode: record.planMode } : {}),
    settings: readPostSettings(record.settings),
  };
};

const SENT_KINDS: readonly SentTextKindV1[] = [
  'person',
  'source',
  'link',
  'instruction',
];

export function readPieceDetail(value: unknown): PieceWorkspaceV1 {
  const record = asRecord(value);
  const piece = record ? readRow(record.piece) : null;
  if (!record || !piece) {
    throw new PieceContractError(
      'PIECE_UNREADABLE',
      'The piece arrived unreadable.'
    );
  }
  const core = readCore(record.core);
  return {
    state: readScreenState(record.state),
    piece,
    core,
    sentText: readSentText(record.sentText, core),
    channelTabs: asArray(record.channels).flatMap((entry) => {
      const tab = readChannelTab(entry);
      return tab ? [tab] : [];
    }),
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
    ...(record.linkQuestion === true ? { linkQuestion: true } : {}),
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
  /** «Для этого поста» (§3.4): только отличное от канала и аватара. */
  overrides?: AdaptOverridesV1;
}): PieceAdaptRequestV1 & { overrides?: AdaptOverridesV1 } => ({
  integrationId: input.integrationId,
  ...(input.kind ? { kind: input.kind } : {}),
  ...(input.answers?.length ? { answers: [...input.answers] } : {}),
  ...(input.decideKeys?.length ? { decideKeys: [...input.decideKeys] } : {}),
  ...(input.skipInterview ? { skipInterview: true } : {}),
  ...(input.overrides && Object.keys(input.overrides).length
    ? { overrides: { ...input.overrides } }
    : {}),
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

/* -------------------------------------------------------------------------
 * Рабочее место заготовки (`97dq.37`, вариант A)
 *
 * Всё, что страница шлёт новым дверям и читает из них, собрано здесь, а не в
 * контейнере: двери пишет параллельный поток бэкенда, и когда он назовёт поле
 * иначе, выравнивание — это правка одного файла.
 * ---------------------------------------------------------------------- */

/** Откуда пришёл текст «Что вы прислали». */
export type SentTextKindV1 = 'person' | 'source' | 'link' | 'instruction';

export type SentTextV1 = {
  text: string;
  kind: SentTextKindV1;
  /** ISO, когда прислано; у старых заготовок неизвестно. */
  at: string | null;
};

/** Картинка поста; `path` пуст, когда дверь назвала только идентификатор. */
export type AdaptationImageV1 = { id: string; path: string };

/** Адаптация, как её читает рабочее место: плюс картинка поста. */
export type WorkspaceAdaptationV1 = AdaptationV1 & {
  image?: AdaptationImageV1 | null;
};

export type PieceWorkspaceV1 = Omit<
  PieceDetailV1,
  'adaptations' | 'sentText' | 'channels'
> & {
  adaptations: WorkspaceAdaptationV1[];
  sentText: SentTextV1 | null;
  /** Вкладки каналов из ответа двери; у старого сервера — пусто. */
  channelTabs: PieceChannelTabV1[];
};

/**
 * «Для этого поста» (§3.4, вариант A двенадцатой волны, `97dq.48`): разово,
 * ни канал, ни аватар не меняются.
 *
 * Поля — те же, что у карточки канала «Как пишем в «X»», и с теми же
 * значениями: длина пресетом, эмодзи, хэштеги, ссылки, призыв. `channel` —
 * «как в канале»: не значение, а отсутствие переопределения.
 */
export type PostChoiceV1<Value extends string> = 'channel' | Value;
export type PostLengthV1 = PostChoiceV1<LengthPreset>;

/*
  Обращения («на ты / на вы») здесь нет с одиннадцатого захода
  (`97dq.45`): опция специфична для языка, и кто её хочет, пишет её в
  «Пожелании». Сохранённое раньше значение сервер просто не читает.
*/
export type PostOptionsV1 = {
  length: PostLengthV1;
  emoji: PostChoiceV1<ChannelWritingProfileV1['emojiLevel']>;
  hashtags: PostChoiceV1<ChannelWritingProfileV1['hashtagPolicy']>;
  links: PostChoiceV1<ChannelWritingProfileV1['linkPolicy']>;
  cta: PostChoiceV1<ChannelWritingProfileV1['ctaKind']>;
  /** `null` — аватар канала, как решено в его настройках. */
  brandProfileId: string | null;
  wish: string;
  /**
   * «Ссылка для поста» (`97dq.75`): `''` — как в заготовке, `none` — без
   * ссылки в этом посте, иначе адрес http(s).
   */
  link: string;
  /**
   * «Текст ссылки» (`97dq.79`): слова, на которых стоит ссылка. `''` —
   * слова заготовки, а нет их — подберём сами.
   */
  linkText: string;
};

/** «Без ссылки» в «Ссылке для поста» (`97dq.75`). */
export const POST_LINK_NONE = 'none';

/** Пять полей карточки, которые пост может перекрыть, — в порядке панели. */
export const POST_PROFILE_FIELDS = [
  'length',
  'emoji',
  'hashtags',
  'links',
  'cta',
] as const;
export type PostProfileField = (typeof POST_PROFILE_FIELDS)[number];

export const DEFAULT_POST_OPTIONS: PostOptionsV1 = {
  length: 'channel',
  emoji: 'channel',
  hashtags: 'channel',
  links: 'channel',
  cta: 'channel',
  brandProfileId: null,
  wish: '',
  link: '',
  linkText: '',
};

/** Предел «Текста ссылки» — тот же, что у сервера (`POST_LINK_TEXT_MAX`). */
export const POST_LINK_TEXT_MAX = 80;

/** «Текст ссылки» как его хранит сервер: одна строка, без знаков разметки. */
export const postLinkTextOf = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .replace(/[\[\]()<>«»"`*_]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, POST_LINK_TEXT_MAX)
        .trim()
    : '';

export type AdaptOverridesV1 = PieceAdaptOverridesV1;

/** Предел «Пожелания» и «что унести» у двери адаптации. */
export const POST_WISH_MAX = 500;

/**
 * Что решено для канала — от этого считается «для этого поста».
 *
 * Аватар по умолчанию берётся из карточки канала, а не выдумывается.
 * `profile` — карточка канала, пока её ответ не пришёл — `null`: тогда
 * «как в канале» рисуется без значения, а любой явный выбор считается
 * изменением.
 */
export type PostOptionsBaselineV1 = {
  brandProfileId: string | null;
  profile?: ChannelWritingProfileV1 | null;
};

export const DEFAULT_POST_BASELINE: PostOptionsBaselineV1 = {
  brandProfileId: null,
  profile: null,
};

export const postBaselineOf = (
  profile: ChannelWritingProfileV1 | null | undefined
): PostOptionsBaselineV1 => ({
  brandProfileId: profile?.brandProfileId ?? null,
  profile: profile ?? null,
});

/** Настройки поста, с которых начинается вкладка: как решено для канала. */
export const postOptionsFrom = (
  baseline: PostOptionsBaselineV1
): PostOptionsV1 => ({
  ...DEFAULT_POST_OPTIONS,
  brandProfileId: baseline.brandProfileId,
});

/** Значение поля у канала — то, что значит «как в канале»; нет карточки — `null`. */
export function channelValueOf<Field extends PostProfileField>(
  field: Field,
  profile: ChannelWritingProfileV1 | null | undefined
): Exclude<PostOptionsV1[Field], 'channel'> | null {
  if (!profile) return null;
  const value = {
    length: lengthPresetOf(profile.lengthPolicy),
    emoji: profile.emojiLevel,
    hashtags: profile.hashtagPolicy,
    links: profile.linkPolicy,
    cta: profile.ctaKind,
  }[field];
  return value as Exclude<PostOptionsV1[Field], 'channel'>;
}

/** Поля, которые пост действительно меняет: выбор, отличный от канала. */
export function changedPostFields(
  options: PostOptionsV1,
  baseline: PostOptionsBaselineV1 = DEFAULT_POST_BASELINE
): PostProfileField[] {
  return POST_PROFILE_FIELDS.filter((field) => {
    const value = options[field];
    return value !== 'channel' && value !== channelValueOf(field, baseline.profile);
  });
}

/** Сколько изменений у поста: поля карточки, аватар, пожелание и ссылка. */
export function postChangeCount(
  options: PostOptionsV1,
  baseline: PostOptionsBaselineV1 = DEFAULT_POST_BASELINE
): number {
  return (
    changedPostFields(options, baseline).length +
    (options.brandProfileId &&
    options.brandProfileId !== baseline.brandProfileId
      ? 1
      : 0) +
    (options.wish.trim() ? 1 : 0) +
    // Своя ссылка и её слова — одно изменение: «ссылка этого поста».
    (options.link || postLinkTextOf(options.linkText) ? 1 : 0)
  );
}

/**
 * Длина пресетом — в форме двери карточки: дискриминатор и диапазон.
 *
 * Числа — те же `LENGTH_PRESETS`, что пишет карточка канала, поэтому «до
 * 500» поста и «до 500» канала — один диапазон в промпте.
 */
const lengthOverride = (
  preset: LengthPreset
): Pick<AdaptOverridesV1, 'lengthPolicy' | 'lengthRange'> =>
  preset === 'auto'
    ? { lengthPolicy: 'auto' }
    : { lengthPolicy: 'range', lengthRange: { ...LENGTH_PRESETS[preset] } };

/**
 * «Ссылка для поста» как её хранит пост (`97dq.75`): `''` — как в заготовке,
 * `none` — без ссылки, иначе адрес http(s). Не адрес — как в заготовке.
 */
export const postLinkOverride = (value: unknown): string => {
  if (typeof value === 'string' && value.trim().toLowerCase() === POST_LINK_NONE)
    return POST_LINK_NONE;
  return typeof value === 'string' ? readLinkAddress(value) ?? '' : '';
};

/**
 * Что из «Для этого поста» уходит в `overrides`.
 *
 * Только отличное от канала: «как в канале» — это не значение, а
 * отсутствие переопределения, и сервер разрешает его сам по цепочке
 * «пост → канал → аватар».
 */
export function adaptOverrides(
  options: PostOptionsV1,
  baseline: PostOptionsBaselineV1 = DEFAULT_POST_BASELINE,
  takeaway?: string | null
): AdaptOverridesV1 | undefined {
  const wish = options.wish.trim().slice(0, POST_WISH_MAX);
  const changed = new Set(changedPostFields(options, baseline));
  const pick = <Field extends PostProfileField>(field: Field) =>
    changed.has(field)
      ? (options[field] as Exclude<PostOptionsV1[Field], 'channel'>)
      : null;
  const length = pick('length');
  const emoji = pick('emoji');
  const hashtags = pick('hashtags');
  const links = pick('links');
  const cta = pick('cta');
  const result: AdaptOverridesV1 = {
    ...(length ? lengthOverride(length) : {}),
    ...(emoji ? { emojiLevel: emoji } : {}),
    ...(hashtags ? { hashtagPolicy: hashtags } : {}),
    ...(links ? { linkPolicy: links } : {}),
    ...(cta ? { ctaKind: cta } : {}),
    ...(options.brandProfileId &&
    options.brandProfileId !== baseline.brandProfileId
      ? { brandProfileId: options.brandProfileId }
      : {}),
    ...(wish ? { wish } : {}),
    ...(postLinkOverride(options.link)
      ? { postLink: postLinkOverride(options.link)! }
      : {}),
    // Слова ссылки (`97dq.79`) — только пока в посте есть ссылка.
    ...(postLinkOverride(options.link) !== POST_LINK_NONE &&
    postLinkTextOf(options.linkText)
      ? { postLinkText: postLinkTextOf(options.linkText) }
      : {}),
    ...(takeaway?.trim()
      ? { takeaway: takeaway.trim().slice(0, POST_WISH_MAX) }
      : {}),
  };
  return Object.keys(result).length ? result : undefined;
}

export const postOptionsChanged = (
  options: PostOptionsV1,
  baseline: PostOptionsBaselineV1 = DEFAULT_POST_BASELINE
): boolean => adaptOverrides(options, baseline) !== undefined;

/* ---- Настройки поста (`97dq.70`) ----------------------------------------- */

/** Режим плана: «Без плана», «Бронь», «Автопилот». */
export type PlanModeWordV1 = 'draft' | 'reserve' | 'autopilot';
export const PLAN_MODE_WORDS: readonly PlanModeWordV1[] = [
  'draft',
  'reserve',
  'autopilot',
];
export const isPlanModeWord = (value: unknown): value is PlanModeWordV1 =>
  typeof value === 'string' &&
  (PLAN_MODE_WORDS as readonly string[]).includes(value);

/**
 * Свои настройки поста в канале, как их хранит сервер
 * (`ContentPiece.tags.postSettings`): поля панели, свой режим плана и когда
 * их сохранили.
 */
export type PostSettingsV1 = {
  options: PostOptionsV1;
  /** `null` — режим как в канале. */
  planMode: PlanModeWordV1 | null;
  savedAt: string | null;
  /** Когда менялось то, что меняет текст: «применится при переписывании». */
  textChangedAt: string | null;
};

const choiceOf = <Value extends string>(
  values: readonly Value[],
  value: unknown
): PostChoiceV1<Value> =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as Value)
    : 'channel';

const settingsIsoOf = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/** Поля поста из ответа; мусор — «как в канале». */
export function readPostOptions(value: unknown): PostOptionsV1 {
  const record = asRecord(value) ?? {};
  return {
    length: choiceOf(LENGTH_PRESET_ORDER, record.length),
    emoji: choiceOf(EMOJI_LEVEL_VALUES, record.emoji),
    hashtags: choiceOf(HASHTAG_POLICIES, record.hashtags),
    links: choiceOf(LINK_POLICIES, record.links),
    cta: choiceOf(CTA_KINDS, record.cta),
    brandProfileId:
      typeof record.brandProfileId === 'string' && record.brandProfileId
        ? record.brandProfileId
        : null,
    wish:
      typeof record.wish === 'string' ? record.wish.slice(0, POST_WISH_MAX) : '',
    link: postLinkOverride(record.link),
    // Настройки до `97dq.79` поля не знали: пусто.
    linkText: postLinkTextOf(record.linkText),
  };
}

export function readPostSettings(value: unknown): PostSettingsV1 | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    options: readPostOptions(record.options),
    planMode: isPlanModeWord(record.planMode) ? record.planMode : null,
    savedAt: settingsIsoOf(record.savedAt),
    textChangedAt: settingsIsoOf(record.textChangedAt),
  };
}

/** Ответ `PUT …/settings`: настройки и держатель слота после применения режима. */
export function readPostSettingsResponse(value: unknown): {
  settings: PostSettingsV1 | null;
  adaptation: WorkspaceAdaptationV1 | null;
} {
  const record = asRecord(value) ?? {};
  return {
    settings: readPostSettings(record.settings),
    adaptation: record.adaptation ? readAdaptationPatch(record.adaptation) : null,
  };
}

/** Тело `PUT …/settings`: поля поста и, если прислан, режим (`null` — как в канале). */
export function buildPostSettingsPayload(input: {
  options?: PostOptionsV1;
  planMode?: PlanModeWordV1 | null;
  /** С `planMode: null` — режим канала, который видел человек (F10). */
  expectedChannelMode?: PlanModeWordV1;
}): {
  options?: PostOptionsV1;
  planMode?: PlanModeWordV1 | null;
  expectedChannelMode?: PlanModeWordV1;
} {
  return {
    ...(input.options
      ? {
          options: {
            ...input.options,
            wish: input.options.wish.slice(0, POST_WISH_MAX),
            link: postLinkOverride(input.options.link),
            linkText: postLinkTextOf(input.options.linkText),
          },
        }
      : {}),
    ...(input.planMode !== undefined ? { planMode: input.planMode } : {}),
    ...(input.planMode === null && input.expectedChannelMode
      ? { expectedChannelMode: input.expectedChannelMode }
      : {}),
  };
}

/** Ответ `GET …/plan-impact`: сколько написанных постов затронет режим. */
export function readPlanImpact(value: unknown): { count: number } {
  const record = asRecord(value) ?? {};
  return {
    count:
      typeof record.count === 'number' && record.count > 0
        ? Math.floor(record.count)
        : 0,
  };
}

/** Тело `PATCH` ручной правки. Картинка `null` — убрать её с поста. */
export function buildAdaptationPatch(input: {
  body?: string;
  image?: { id: string } | null;
}): PieceAdaptationEditRequestV1 {
  return {
    ...(typeof input.body === 'string' ? { body: input.body } : {}),
    // Путь картинки сервер берёт из медиатеки сам: уходит только её имя.
    ...(input.image !== undefined
      ? { image: input.image ? { id: input.image.id } : null }
      : {}),
  };
}

/** Ответ `PATCH`: обновлённая адаптация, обёрнутая или нет. */
export function readAdaptationPatch(
  value: unknown
): WorkspaceAdaptationV1 | null {
  const record = asRecord(value);
  if (!record) return null;
  return readAdaptation(record.adaptation ?? record);
}

/** Тело `POST …/schedule`: либо момент, либо «сейчас» — не оба сразу. */
export function buildSchedulePayload(
  input: { now: true } | { date: Date | string }
): PieceAdaptationScheduleRequestV1 {
  if ('now' in input) return { now: true };
  const at = typeof input.date === 'string' ? new Date(input.date) : input.date;
  return { date: at.toISOString() };
}

/**
 * Ответ `POST …/schedule` — новое состояние.
 *
 * Сервер может вернуть адаптацию целиком или только `state` и `date`; экран
 * всё равно перечитывает заготовку, и отсюда ему нужно только слово о том,
 * что случилось.
 */
export function readScheduleResult(value: unknown): {
  state: AdaptationStateV1 | null;
  date: string | null;
  adaptation: WorkspaceAdaptationV1 | null;
} {
  const record = asRecord(value) ?? {};
  const adaptation = readAdaptation(record.adaptation);
  const stateSource =
    typeof record.state === 'string' ? record.state : adaptation?.state;
  return {
    state: ADAPTATION_STATES.includes(stateSource as AdaptationStateV1)
      ? (stateSource as AdaptationStateV1)
      : null,
    date: asNullableText(record.date) ?? adaptation?.date ?? null,
    adaptation,
  };
}

/** Слово отказа двери, если оно есть. */
export const refusalMessage = (value: unknown): string | null => {
  const record = asRecord(value);
  const message = asText(record?.message);
  return message.trim() ? message : null;
};

/** Код отказа двери (`ADAPTATION_EDIT_CLOSED` и т. п.), если он есть. */
export const refusalCode = (value: unknown): string | null => {
  const code = asText(asRecord(value)?.code).trim();
  return code || null;
};

/**
 * Отказы правки, после которых правка больше не ляжет (ревью `97dq.80`,
 * P2-4): пост уходит или вышел, его нет, публикация упала, он уже не
 * черновик. Экран забывает несохранённый текст и не предлагает повтор.
 */
export const EDIT_CLOSED_CODES: ReadonlySet<string> = new Set([
  'ADAPTATION_EDIT_CLOSED',
  'ADAPTATION_POST_GONE',
  'ADAPTATION_POST_FAILED',
  'ADAPTATION_NOT_DRAFT',
]);

/** Сколько знаков увидит читатель: звёздочки выделения не в счёт. */
export const visibleLength = (text: string): number =>
  Array.from(stripInlineMarks(text)).length;

/* ---- Правка текста -------------------------------------------------------- */

export type TextEdit = { text: string; start: number; end: number };

/**
 * «Ж» на выделенном: обернуть в `**…**` или снять обёртку, если она уже есть.
 * Без выделения ставится пустая пара, и каретка встаёт внутрь неё.
 */
export function toggleBold(text: string, start: number, end: number): TextEdit {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  const before = text.slice(0, from);
  const chosen = text.slice(from, to);
  const after = text.slice(to);
  if (before.endsWith('**') && after.startsWith('**')) {
    return {
      text: `${before.slice(0, -2)}${chosen}${after.slice(2)}`,
      start: from - 2,
      end: to - 2,
    };
  }
  if (chosen.length > 4 && chosen.startsWith('**') && chosen.endsWith('**')) {
    const inner = chosen.slice(2, -2);
    return {
      text: `${before}${inner}${after}`,
      start: from,
      end: from + inner.length,
    };
  }
  return {
    text: `${before}**${chosen}**${after}`,
    start: from + 2,
    end: to + 2,
  };
}

/** Вставить строку на место выделения (ссылка вставляется адресом). */
export function insertText(
  text: string,
  start: number,
  end: number,
  insert: string
): TextEdit {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  const before = text.slice(0, from);
  const after = text.slice(to);
  const pad = before && !/\s$/.test(before) ? ' ' : '';
  const tail = after && !/^\s/.test(after) ? ' ' : '';
  const piece = `${pad}${insert}${tail}`;
  const at = before.length + piece.length;
  return { text: `${before}${piece}${after}`, start: at, end: at };
}

/** Адрес, который можно вставить: только http(s), без пробелов. */
export const readLinkAddress = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  // Другая схема (`ftp:`, `mailto:`, `javascript:`) — не ссылка для поста.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed))
    return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    // Только http(s) с настоящим адресом: «mailto:a@b.c» с приставленным
    // https:// разбирается как адрес с паролем — это не ссылка для поста.
    // Разобранная форма (`url.href`) — та же, что хранит сервер
    // (`post-link.ts`), иначе «как в заготовке» не совпало бы с ответом.
    return url.hostname.includes('.') && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/* ---- Каналы и вкладки ------------------------------------------------------ */

export type WorkspaceChannel = {
  id: string;
  name: string;
  platform: string;
  /** Имя площадки из ответа сервера; переводит его экран. */
  platformName: string;
  providerIdentifier: string;
  kinds: AdaptationKindV1[];
  /** Версии этого канала, свежая первой. */
  adaptations: WorkspaceAdaptationV1[];
  /** Состояние свежей версии; без версий — «ещё нет». */
  state: PieceCellStateV1;
  /** Канал подключён сейчас. Адаптация отключённого канала остаётся видна. */
  connected: boolean;
  /** Предел площадки для счётчика; `null` — провайдер его не назвал. */
  maxLength: number | null;
  /** Режим плана канала (`97dq.57`); у старого сервера — «Бронь». */
  planMode: PlanModeWordV1;
  /** Свои настройки поста в канале (`97dq.70`); `null` — всё как в канале. */
  settings: PostSettingsV1 | null;
};

const newestFirst = (left: AdaptationV1, right: AdaptationV1) =>
  right.createdAt.localeCompare(left.createdAt);

/**
 * Каналы рабочего места: по одному на каждый подключённый канал и на каждый
 * канал, где адаптация уже есть.
 *
 * Порядок — порядок ответа: сервер уже поставил площадки по числу адаптаций.
 * Адаптация канала, который с тех пор отключили, не пропадает: её
 * происхождение и опубликованный текст остаются читаемыми.
 */
export function workspaceChannels(
  detail: Pick<PieceWorkspaceV1, 'targets' | 'adaptations'> &
    Partial<Pick<PieceWorkspaceV1, 'channelTabs'>>
): WorkspaceChannel[] {
  const byChannel = new Map<string, WorkspaceAdaptationV1[]>();
  for (const adaptation of detail.adaptations) {
    const key = adaptation.integrationId ?? `platform:${adaptation.platform}`;
    byChannel.set(key, [...(byChannel.get(key) ?? []), adaptation]);
  }
  const stateOf = (list: readonly WorkspaceAdaptationV1[]): PieceCellStateV1 =>
    list.length ? list[0].state : 'none';

  const channels: WorkspaceChannel[] = [];
  const seen = new Set<string>();

  /*
    Сервер, знающий вкладки (`PieceChannelTabV1`), решает их порядок, имя,
    клетку и предел площадки сам. Версии — по `adaptationIds` от старой к
    новой; свежая версия из стрима, которой дверь ещё не знает, встаёт
    первой по времени создания.
  */
  if (detail.channelTabs?.length) {
    for (const tab of detail.channelTabs) {
      const target = detail.targets.find((one) =>
        one.channels.some((channel) => channel.id === tab.integrationId)
      );
      const platform = target?.platform ?? tab.providerIdentifier;
      const adaptations = [...(byChannel.get(tab.integrationId) ?? [])].sort(
        newestFirst
      );
      seen.add(tab.integrationId);
      channels.push({
        id: tab.integrationId,
        name: tab.name,
        platform,
        platformName: target?.name ?? platform,
        providerIdentifier: tab.providerIdentifier || platform,
        kinds: target?.kinds.length ? target.kinds : ['post'],
        adaptations,
        state: adaptations.length ? stateOf(adaptations) : tab.cell.state,
        connected: true,
        maxLength: tab.maxLength,
        planMode: tab.planMode ?? 'reserve',
        settings: tab.settings ?? null,
      });
    }
  }

  for (const target of detail.targets) {
    if (!target.available) continue;
    for (const channel of target.channels) {
      if (seen.has(channel.id)) continue;
      const adaptations = [...(byChannel.get(channel.id) ?? [])].sort(
        newestFirst
      );
      seen.add(channel.id);
      channels.push({
        id: channel.id,
        name: channel.name,
        platform: target.platform,
        platformName: target.name,
        providerIdentifier: channel.providerIdentifier,
        kinds: target.kinds.length ? target.kinds : ['post'],
        adaptations,
        state: stateOf(adaptations),
        connected: true,
        maxLength: null,
        planMode: 'reserve',
        settings: null,
      });
    }
  }
  for (const [key, list] of byChannel) {
    if (seen.has(key)) continue;
    const adaptations = [...list].sort(newestFirst);
    const first = adaptations[0];
    channels.push({
      id: key,
      name: first.integrationName ?? first.platform,
      platform: first.platform,
      platformName: first.platform,
      providerIdentifier: first.platform,
      kinds: [first.kind],
      adaptations,
      state: stateOf(adaptations),
      connected: false,
      maxLength: null,
      planMode: 'reserve',
      settings: null,
    });
  }
  return channels;
}

/**
 * Какие каналы стоят вкладками, а какие ждут в «Ещё канал».
 *
 * Вкладку получает канал, где уже есть текст, первый канал каждой площадки и
 * тот, что открыт сейчас. Остальные каналы той же площадки — в меню: у
 * человека с тремя Telegram-каналами иначе вкладок становится больше, чем
 * слов на экране, а начать можно с любого.
 */
export function workspaceTabs(
  channels: readonly WorkspaceChannel[],
  active: string
): { shown: WorkspaceChannel[]; more: WorkspaceChannel[] } {
  const firstOfPlatform = new Set<string>();
  const platforms = new Set<string>();
  for (const channel of channels) {
    if (!channel.connected || platforms.has(channel.platform)) continue;
    platforms.add(channel.platform);
    firstOfPlatform.add(channel.id);
  }
  const shown: WorkspaceChannel[] = [];
  const more: WorkspaceChannel[] = [];
  for (const channel of channels) {
    if (
      channel.adaptations.length > 0 ||
      firstOfPlatform.has(channel.id) ||
      channel.id === active
    )
      shown.push(channel);
    else more.push(channel);
  }
  return { shown, more };
}

/** Канал из адреса, если такой есть в заготовке. */
export const channelOfTab = (
  channels: readonly WorkspaceChannel[],
  tab: string
): WorkspaceChannel | null =>
  tab === PIECE_TAB_CORE
    ? null
    : channels.find((channel) => channel.id === tab) ?? null;

/**
 * Старый адрес `?adapt=<площадка>` — вкладка первого канала этой площадки.
 * Клетки списка до этой волны вели сюда так, и ссылки живут дольше волн.
 */
export const tabOfPlatform = (
  channels: readonly WorkspaceChannel[],
  platform: string | null | undefined
): string | null =>
  platform
    ? channels.find(
        (channel) => channel.connected && channel.platform === platform
      )?.id ?? null
    : null;

/* ---- «Запомнить для канала» ------------------------------------------------ */

/**
 * Профиль канала с тем, что человек выбрал для этого поста.
 *
 * Поля панели — те же поля карточки, поэтому запоминание пишет их как есть:
 * выбранный пресет длины, эмодзи, хэштеги, ссылки, призыв и аватар (§3.4).
 * «Как в канале» и всё, чего в панели нет (формат, заметка), уходит как
 * было: запоминание не стирает того, чего человек здесь не видел.
 */
export function rememberedProfilePayload(
  profile: ChannelWritingProfileV1,
  options: PostOptionsV1
): WritingProfilePayload {
  const chosen = <Value extends string>(value: PostChoiceV1<Value>) =>
    value === 'channel' ? null : (value as Value);
  const length = chosen(options.length);
  const emoji = chosen(options.emoji);
  const hashtags = chosen(options.hashtags);
  const links = chosen(options.links);
  const cta = chosen(options.cta);
  return buildWritingProfilePayload({
    ...profile,
    ...(length
      ? {
          lengthPolicy:
            length === 'auto' ? ('auto' as const) : { ...LENGTH_PRESETS[length] },
        }
      : {}),
    ...(emoji ? { emojiLevel: emoji } : {}),
    ...(hashtags ? { hashtagPolicy: hashtags } : {}),
    ...(links ? { linkPolicy: links } : {}),
    ...(cta ? { ctaKind: cta } : {}),
    brandProfileId: options.brandProfileId,
  });
}

/**
 * Поля карточки канала в форме панели (`97dq.70`): одна панель рисует и
 * канал, и пост, поэтому канал читается теми же пятью полями и аватаром.
 */
export const postOptionsOfProfile = (
  profile: ChannelWritingProfileV1
): PostOptionsV1 => ({
  length: lengthPresetOf(profile.lengthPolicy),
  emoji: profile.emojiLevel,
  hashtags: profile.hashtagPolicy,
  links: profile.linkPolicy,
  cta: profile.ctaKind,
  brandProfileId: profile.brandProfileId ?? null,
  wish: '',
  // Ссылка — только у поста (`97dq.75`): у канала своей ссылки нет.
  link: '',
  linkText: '',
});

/**
 * Что изменить в карточке канала, когда панель в области канала сменила
 * поле. Длина пишется пресетом только если её действительно сменили:
 * своё число канала, не совпадающее с пресетом, не затирается правкой
 * соседнего поля.
 */
export function profilePatchOfOptions(
  profile: ChannelWritingProfileV1,
  options: PostOptionsV1
): Partial<ChannelWritingProfileV1> {
  const before = postOptionsOfProfile(profile);
  const patch: Partial<ChannelWritingProfileV1> = {};
  if (options.length !== 'channel' && options.length !== before.length)
    patch.lengthPolicy =
      options.length === 'auto' ? 'auto' : { ...LENGTH_PRESETS[options.length] };
  if (options.emoji !== 'channel' && options.emoji !== before.emoji)
    patch.emojiLevel = options.emoji;
  if (options.hashtags !== 'channel' && options.hashtags !== before.hashtags)
    patch.hashtagPolicy = options.hashtags;
  if (options.links !== 'channel' && options.links !== before.links)
    patch.linkPolicy = options.links;
  if (options.cta !== 'channel' && options.cta !== before.cta)
    patch.ctaKind = options.cta;
  if (options.brandProfileId !== before.brandProfileId)
    patch.brandProfileId = options.brandProfileId;
  return patch;
}

/* ---- «Когда» по умолчанию -------------------------------------------------- */

/**
 * Ближайшее свободное время канала — тот же ответ, по которому календарь
 * ставит новый пост этого канала (`launches/menu/menu.tsx`).
 */
export const findSlotUrl = (integrationId: string) =>
  `/posts/find-slot/${encodeURIComponent(integrationId)}`;

/** Время из `find-slot`: сервер пишет его в UTC, иногда без знака зоны. */
export function readSlotDate(value: unknown): Date | null {
  const raw = asText(asRecord(value)?.date);
  if (!raw.trim()) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw.trim())
    ? raw.trim()
    : `${raw.trim().replace(' ', 'T')}Z`;
  const at = new Date(zoned);
  return Number.isNaN(at.getTime()) ? null : at;
}
