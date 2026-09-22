/**
 * Экран адаптации: ручная правка и выход в календарь без окна «Создать пост»
 * (`content-factory-next-97dq.37`, спецификация десятой волны §3.5).
 *
 * Отдельный контракт по той же причине, что `review.v2.contract.ts` и
 * `piece-research.contract.ts`: двери добавлены к заготовке, а договор
 * `voice-wiring.contract.ts`, по которому уже живёт экран, не переписывается.
 * Экран импортирует типы отсюда, как импортирует их оттуда.
 *
 * Обе двери работают только с черновиком (`DRAFT`): запланированный пост
 * возвращается в черновик явным «Снять с расписания», а не правкой поверх
 * очереди. Организация — только из сессии.
 */

import type {
  AdaptationV1,
  PieceAdaptOverridesV1,
} from '../brand-voice/voice-wiring.contract';
import { PIECES_API_BASE } from '../brand-voice/voice-wiring.contract';

export type { PieceAdaptOverridesV1 };

export const PIECE_ADAPTATION_WORKSPACE_ROUTES = {
  /** `PATCH` — ручная правка тела и/или картинки черновика. */
  edit: {
    method: 'PATCH',
    path: (pieceId: string, adaptationId: string) =>
      `${PIECES_API_BASE}/${pieceId}/adaptations/${adaptationId}`,
  },
  /** `POST` — в очередь на дату или «Опубликовать сейчас». */
  schedule: {
    method: 'POST',
    path: (pieceId: string, adaptationId: string) =>
      `${PIECES_API_BASE}/${pieceId}/adaptations/${adaptationId}/schedule`,
  },
  /** `POST` — «Снять с расписания»: из очереди обратно в черновик. */
  unschedule: {
    method: 'POST',
    path: (pieceId: string, adaptationId: string) =>
      `${PIECES_API_BASE}/${pieceId}/adaptations/${adaptationId}/unschedule`,
  },
} as const;

/** Предел тела правки: больше не принимает ни одна площадка продукта. */
export const ADAPTATION_EDIT_BODY_MAX_CHARS = 100_000;

/**
 * Ручная правка. Хотя бы одно поле обязательно.
 *
 * `body` — простой текст с `**жирным**`, как его хранит адаптация; метки
 * цитат (`[E2]`) снимаются сервером, края обрезаются, пустой текст — отказ.
 * `image` — одна картинка из медиатеки области: `{ id }` прикрепляет её к
 * посту (путь сервер берёт из медиатеки сам), `null` снимает.
 */
export type PieceAdaptationEditRequestV1 = {
  body?: string;
  image?: { id: string } | null;
};

/** Адаптация после правки — с пересчитанной квитанцией проверок. */
export type PieceAdaptationEditResponseV1 = {
  adaptation: AdaptationV1;
};

/**
 * Выход в календарь. Ровно одно из двух: `now: true` или `date` (ISO, не в
 * прошлом). Перед этим — та же проверка площадки, что делало окно
 * (`POST /posts/valid`).
 */
export type PieceAdaptationScheduleRequestV1 = {
  date?: string;
  now?: boolean;
};

/** Новое состояние: `queued` и дата публикации. */
export type PieceAdaptationScheduleResponseV1 = {
  adaptation: AdaptationV1;
};

/**
 * Отказы двух дверей. Тело отказа — то же, что у остальных дверей заготовки:
 * `{ code, message, subject? }`, `message` — на языке `?language=`.
 */
export const ADAPTATION_WORKSPACE_ERROR_CODES = {
  /** Пост не черновик (в очереди, опубликован, удалён) — правка и выход закрыты. */
  ADAPTATION_NOT_DRAFT: { status: 409 },
  /** «Снять с расписания» у поста, который не в очереди (черновик, опубликован, удалён). */
  ADAPTATION_NOT_QUEUED: { status: 409 },
  /** Тело правки пустое: ни `body`, ни `image`, или текст пуст после очистки. */
  ADAPTATION_EDIT_EMPTY: { status: 400 },
  /** `image.id` не называет медиафайл этой области. */
  ADAPTATION_MEDIA_UNKNOWN: { status: 422 },
  /** Ни `date`, ни `now`, либо оба сразу. */
  ADAPTATION_SCHEDULE_DATE_REQUIRED: { status: 400 },
  ADAPTATION_SCHEDULE_DATE_INVALID: { status: 400 },
  ADAPTATION_SCHEDULE_DATE_PAST: { status: 422 },
  /** Площадка не примет пост: `subject` — идентификатор провайдера. */
  ADAPTATION_SCHEDULE_INVALID: { status: 422 },
  /** Сервер собран без календаря (наборы, воркеры). */
  ADAPTATION_SCHEDULE_UNAVAILABLE: { status: 503 },
} as const;

export type AdaptationWorkspaceErrorCodeV1 =
  keyof typeof ADAPTATION_WORKSPACE_ERROR_CODES;

type Words = { ru: string; en: string };

export const ADAPTATION_WORKSPACE_MESSAGES: Record<
  Exclude<AdaptationWorkspaceErrorCodeV1, 'ADAPTATION_SCHEDULE_INVALID'>,
  Words
> = {
  ADAPTATION_NOT_DRAFT: {
    ru: 'Этот пост уже не черновик. Чтобы править его, сначала снимите его с расписания.',
    en: 'This post is no longer a draft. Take it off the schedule before editing it.',
  },
  ADAPTATION_NOT_QUEUED: {
    ru: 'Этот пост не стоит в расписании: снимать нечего.',
    en: 'This post is not scheduled, so there is nothing to take off.',
  },
  ADAPTATION_EDIT_EMPTY: {
    ru: 'Сохранять нечего: текст пуст. Прежний вариант остался как был.',
    en: 'Nothing to save: the text is empty. The previous version is unchanged.',
  },
  ADAPTATION_MEDIA_UNKNOWN: {
    ru: 'Такой картинки в медиатеке нет. Выберите её заново.',
    en: 'This image is not in the media library. Choose it again.',
  },
  ADAPTATION_SCHEDULE_DATE_REQUIRED: {
    ru: 'Выберите время публикации или нажмите «Опубликовать сейчас».',
    en: 'Choose when to publish, or press «Publish now».',
  },
  ADAPTATION_SCHEDULE_DATE_INVALID: {
    ru: 'Не получилось прочитать дату. Выберите её в календаре ещё раз.',
    en: 'The date could not be read. Pick it in the calendar again.',
  },
  ADAPTATION_SCHEDULE_DATE_PAST: {
    ru: 'Это время уже прошло. Выберите время впереди или нажмите «Опубликовать сейчас».',
    en: 'That time has passed. Choose a later time, or press «Publish now».',
  },
  ADAPTATION_SCHEDULE_UNAVAILABLE: {
    ru: 'Календарь сейчас недоступен. Черновик сохранён — попробуйте ещё раз.',
    en: 'The calendar is unavailable right now. The draft is saved — try again.',
  },
};

/**
 * Почему площадка не примет пост — словами, по тем же четырём ответам, что
 * возвращает `validatePosts`. Сообщение провайдера (оно по-английски) идёт в
 * конце как есть: переводить его значило бы потерять точность.
 */
export const scheduleRefusalText = (
  language: 'ru' | 'en',
  channel: string,
  reason:
    | { kind: 'empty' }
    | { kind: 'too_long'; max: number }
    | { kind: 'settings'; detail: string }
    | { kind: 'media'; detail: string }
): string => {
  const ru = language === 'ru';
  switch (reason.kind) {
    case 'empty':
      return ru
        ? `В посте для «${channel}» нет ни текста, ни картинки.`
        : `The post for «${channel}» has neither text nor an image.`;
    case 'too_long':
      return ru
        ? `Текст длиннее, чем примет «${channel}»: там не больше ${reason.max} знаков. Сократите его.`
        : `The text is longer than «${channel}» accepts: at most ${reason.max} characters. Shorten it.`;
    case 'settings':
      return ru
        ? `«${channel}» не примет пост: не заполнены настройки публикации${reason.detail ? ` (${reason.detail})` : ''}.`
        : `«${channel}» will not accept the post: its publishing settings are incomplete${reason.detail ? ` (${reason.detail})` : ''}.`;
    case 'media':
      return ru
        ? `«${channel}» не примет вложение${reason.detail ? `: ${reason.detail}` : ''}.`
        : `«${channel}» will not accept the attachment${reason.detail ? `: ${reason.detail}` : ''}.`;
  }
};
