/**
 * Экран адаптации: ручная правка и выход в календарь без окна «Создать пост»
 * (`content-factory-next-97dq.37`, спецификация десятой волны §3.5).
 *
 * Отдельный контракт по той же причине, что `review.v2.contract.ts` и
 * `piece-research.contract.ts`: двери добавлены к заготовке, а договор
 * `voice-wiring.contract.ts`, по которому уже живёт экран, не переписывается.
 * Экран импортирует типы отсюда, как импортирует их оттуда.
 *
 * Выход в календарь работает только с черновиком (`DRAFT`). Правка — с
 * черновиком и, с `97dq.80`, с постом в очереди, пока до его слота больше
 * `QUEUED_EDIT_MARGIN_MS`: меняется только текст и картинка, дата и состояние
 * остаются, публикация не перезапускается. Организация — только из сессии.
 */

import type {
  AdaptationV1,
  ChannelPlanModeV1,
  PieceAdaptOverridesV1,
} from '../brand-voice/voice-wiring.contract';
import { PIECES_API_BASE } from '../brand-voice/voice-wiring.contract';

export type { PieceAdaptOverridesV1 };

export const PIECE_ADAPTATION_WORKSPACE_ROUTES = {
  /** `PATCH` — ручная правка тела и/или картинки черновика или поста в очереди до слота. */
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
  /**
   * `POST` — «Поставить на ЧЧ:ММ» из календаря (`97dq.57`): версия встаёт на
   * время по режиму канала.
   */
  place: {
    method: 'POST',
    path: (pieceId: string, adaptationId: string) =>
      `${PIECES_API_BASE}/${pieceId}/adaptations/${adaptationId}/place`,
  },
  /**
   * `PUT` — настройки поста (`97dq.70`): сохраняются сами, режим плана
   * применяется к написанному посту сразу.
   */
  postSettings: {
    method: 'PUT',
    path: (pieceId: string, integrationId: string) =>
      `${PIECES_API_BASE}/${pieceId}/channels/${encodeURIComponent(integrationId)}/settings`,
  },
  /** `GET` — сколько написанных постов затронет режим канала (`97dq.70`). */
  channelPlanImpact: {
    method: 'GET',
    path: (integrationId: string) =>
      `${PIECES_API_BASE}/channels/${encodeURIComponent(integrationId)}/plan-impact`,
  },
  /** `POST` — «Ко всем N»: режим канала к его написанным постам (`97dq.70`). */
  channelPlanApply: {
    method: 'POST',
    path: (integrationId: string) =>
      `${PIECES_API_BASE}/channels/${encodeURIComponent(integrationId)}/plan-apply`,
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
 * «Поставить на ЧЧ:ММ» (`97dq.57`): `date` — ISO, не в прошлом. Версия
 * становится держателем слота своей заготовки в канале и встаёт на время по
 * режиму канала: «Бронь» — «в плане», «Автопилот» — в очередь (после той же
 * проверки площадки, что у «Запланировать»), «Без плана» — черновик с этим
 * временем. Уже запланированная версия переносится и остаётся в очереди.
 */
export type PieceAdaptationPlaceRequestV1 = {
  date: string;
};

export type PieceAdaptationPlacementV1 = {
  /** Режим канала на момент постановки. */
  mode: ChannelPlanModeV1;
  status: 'reserved' | 'queued' | 'draft';
  /** ISO — время, на котором версия стоит теперь. */
  date: string;
  autopilot: boolean;
  /** Почему автопилот не поставил в очередь (версия осталась бронью). */
  note: string | null;
};

export type PieceAdaptationPlaceResponseV1 = {
  adaptation: AdaptationV1;
  placement: PieceAdaptationPlacementV1;
};

/**
 * Пост в очереди правится, пока до его слота больше минуты (`97dq.80`,
 * четырнадцатый заход, B2: «человек отредактировал, сохранил, отправился
 * отредактированный. Не успел — отправился тот, что был»). Публикация читает
 * текст поста из базы в момент выхода (`post.workflow.v1.0.5.ts`), поэтому
 * правка до слота уходит в пост без перезапуска публикации; минута — запас
 * на то, чтобы запись не встретилась с уже начатой отправкой.
 */
export const QUEUED_EDIT_MARGIN_MS = 60_000;

/** Последний момент, когда правка поста в очереди ещё уйдёт в пост. */
export const queuedEditDeadline = (publishDate: Date | string): Date =>
  new Date(new Date(publishDate).getTime() - QUEUED_EDIT_MARGIN_MS);

/**
 * Отказы двух дверей. Тело отказа — то же, что у остальных дверей заготовки:
 * `{ code, message, subject? }`, `message` — на языке `?language=`.
 */
export const ADAPTATION_WORKSPACE_ERROR_CODES = {
  /** Пост не черновик (в очереди, опубликован, удалён) — правка и выход закрыты. */
  ADAPTATION_NOT_DRAFT: { status: 409 },
  /** «Снять с расписания» у поста, который не в очереди (черновик, опубликован, удалён). */
  ADAPTATION_NOT_QUEUED: { status: 409 },
  /**
   * Правка поста в очереди, когда публикация уже началась или прошла
   * (`97dq.80`): до слота меньше `QUEUED_EDIT_MARGIN_MS` или пост вышел.
   */
  ADAPTATION_EDIT_CLOSED: { status: 409 },
  /**
   * Правка, а поста уже нет: его удалили или заменили новой версией
   * (например, автопилот) между открытием страницы и сохранением.
   */
  ADAPTATION_POST_GONE: { status: 409 },
  /** Правка поста, публикация которого закончилась ошибкой. */
  ADAPTATION_POST_FAILED: { status: 409 },
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
  /**
   * Другая версия этой заготовки в канале уже в очереди и выходит через две
   * минуты или раньше: вторая очередь выпустила бы заготовку дважды (`97dq.57`).
   */
  ADAPTATION_QUEUE_BUSY: { status: 409 },
  /**
   * «Ко всем N» ответили на режим канала, который с тех пор сменился
   * (`97dq.70`): применять нечего, спросить заново.
   */
  CHANNEL_PLAN_MODE_CHANGED: { status: 409 },
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
  ADAPTATION_EDIT_CLOSED: {
    ru: 'Пост уже уходит в канал или вышел — эту правку сохранить нельзя. В канале остаётся прежний текст.',
    en: 'This post is already going out or has been published, so this edit cannot be saved. The channel keeps the previous text.',
  },
  ADAPTATION_POST_GONE: {
    ru: 'Этого поста больше нет: его удалили или заменили новой версией, например автопилот. Правка не сохранена — обновите страницу.',
    en: 'This post no longer exists: it was deleted or replaced by a newer version, for example by the autopilot. The edit was not saved — reload the page.',
  },
  ADAPTATION_POST_FAILED: {
    ru: 'Публикация этого поста не удалась, поэтому править его здесь нельзя. Правка не сохранена.',
    en: 'Publishing this post failed, so it cannot be edited here. The edit was not saved.',
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
  ADAPTATION_QUEUE_BUSY: {
    ru: 'Другая версия этой заготовки уже выходит в этом канале. Дождитесь её выхода или выберите время позже.',
    en: 'Another version of this piece is about to go out in this channel. Wait for it, or pick a later time.',
  },
  CHANNEL_PLAN_MODE_CHANGED: {
    ru: 'Режим канала уже сменился. Написанные посты не тронуты — выберите, к каким применить новый режим.',
    en: 'The channel mode has changed since. Written posts are untouched — choose again where the new mode applies.',
  },
};

/**
 * Почему площадка не примет пост — словами, по тем же четырём ответам, что
 * возвращает `validatePosts`. Сообщение провайдера (оно по-английски) идёт в
 * конце как есть: переводить его значило бы потерять точность.
 */
/**
 * Хвост отказа площадки на правку поста в очереди (`97dq.80`, ревью P2-1):
 * пост в очереди остался прежним, правка не записана.
 */
export const QUEUED_EDIT_REFUSAL_TAIL: Words = {
  ru: 'Правка не сохранена: в очереди остаётся прежний текст.',
  en: 'The edit was not saved: the queue keeps the previous text.',
};

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
