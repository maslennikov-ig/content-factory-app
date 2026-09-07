/**
 * Отказы дверей заготовок и адаптаций.
 *
 * `content-factory-next-tu3k.9.3`. Граница та же, что у входа одной мыслью
 * (`intake/intake.errors.ts`): пока ответ не начался, отказ — обычный HTTP с
 * кодом контракта; как только пошли строки NDJSON, менять статус поздно, и
 * отказ приходит последней строкой `{name:'error'}`. Поэтому класс один, а
 * судьбу отказа решает место броска, а не сам код.
 *
 * Статус не выписан здесь заново: он читается из `PIECE_ERROR_CODES`. Отказ,
 * который в контракте 404, а в сервисе 400, — это экран, который ветвится по
 * одному и получает другое, и найти такое, читая любой из двух файлов
 * поодиночке, нельзя.
 */

import {
  PIECE_ERROR_CODES,
  type PieceErrorCodeV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

export class PieceError extends Error {
  readonly status: number;

  constructor(
    readonly code: PieceErrorCodeV1,
    message: string,
    /** То, о чём отказ: канал, вид адаптации, заготовка. Никогда — значение. */
    readonly subject?: string
  ) {
    super(message);
    this.name = 'PieceError';
    this.status = PIECE_ERROR_CODES[code].status;
  }
}

/**
 * Тексты отказов на двух языках.
 *
 * Здесь, а не в контроллере: человек читает предложение, экран ветвится по
 * коду, и обе половины принадлежат одному решению. Тот же порядок, что у
 * `INTAKE_ERROR_MESSAGES`.
 */
export const PIECE_ERROR_MESSAGES: Record<
  PieceErrorCodeV1,
  { ru: string; en: string }
> = {
  PIECE_NOT_FOUND: {
    ru: 'Такой заготовки в рабочем пространстве нет.',
    en: 'This workspace has no such piece.',
  },
  PIECE_ARCHIVED: {
    ru: 'Заготовка в архиве. Верните её из архива, чтобы адаптировать.',
    en: 'The piece is archived. Bring it back to adapt it.',
  },
  PIECE_CHANNEL_REQUIRED: {
    ru: 'Выберите канал, в который писать адаптацию.',
    en: 'Choose the channel this adaptation is written for.',
  },
  PIECE_CHANNEL_UNKNOWN: {
    ru: 'Такого канала в рабочем пространстве нет или он отключён.',
    en: 'This workspace has no such channel, or it is switched off.',
  },
  PIECE_CHANNEL_UNSUPPORTED: {
    ru: 'Продукт не знает, как писать в этот канал.',
    en: 'The product does not know how to write into this channel.',
  },
  ADAPTATION_KIND_UNSUPPORTED: {
    ru: 'Такой вид адаптации появится позже: сейчас продукт пишет текст.',
    en: 'That kind of adaptation comes later; for now the product writes text.',
  },
  ADAPTATION_NOT_FOUND: {
    ru: 'Такой адаптации у этой заготовки нет.',
    en: 'This piece has no such adaptation.',
  },
  ADAPTATION_PUBLISHED: {
    ru: 'Пост уже опубликован: происхождение опубликованного текста не стирается.',
    en: 'The post is published: the provenance of published text is not erased.',
  },
  PIECE_INTERVIEW_EXHAUSTED: {
    ru: 'Уточнения кончились. Ответьте своими словами или дайте модели решить самой.',
    en: 'No more questions. Answer in your own words, or let the model decide.',
  },
  PIECE_CORE_MISSING: {
    ru: 'У этого материала нет выделенной сути: он сделан до заготовок, и уточнять в нём нечего.',
    en: 'This material has no extracted substance: it predates pieces, and there is nothing to clarify in it.',
  },
  PIECE_NOT_SAVED: {
    ru: 'Заготовку не удалось сохранить. Ничего не потеряно — попробуйте ещё раз.',
    en: 'The piece could not be saved. Nothing is lost — try again.',
  },
};

export const pieceError = (
  code: PieceErrorCodeV1,
  language: 'ru' | 'en',
  subject?: string
) => new PieceError(code, PIECE_ERROR_MESSAGES[code][language], subject);
