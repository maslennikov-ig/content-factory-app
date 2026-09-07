/**
 * Отказы входа одной мыслью, которые случаются до первого байта стрима.
 *
 * `content-factory-next-tu3k.1`. Граница проведена по одному признаку: пока
 * ответ не начался, отказ — обычный HTTP, и экран показывает его формой; как
 * только пошли строки NDJSON, менять код ответа поздно, и всё остальное
 * приходит последней строкой `{name:'error'}`. Поэтому здесь только пять
 * кодов контракта (`IntakePreflightErrorCodeV1`) и ни одного из тех, что
 * рождаются в стриме.
 *
 * Класс по форме тот же, что `ContentBriefError`, и это не совпадение:
 * `safeHttpError` в контроллере читает `code` и `status` с любого объекта, а
 * две двери одного раздела должны отказывать одинаково.
 */

import type { IntakePreflightErrorCodeV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

export class IntakeError extends Error {
  constructor(
    readonly code: IntakePreflightErrorCodeV1,
    readonly status: number,
    message: string,
    /** То, о чём отказ: идентификатор канала, имя провайдера. */
    readonly subject?: string
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

/**
 * Тексты отказов на двух языках.
 *
 * Здесь, а не в контроллере: человек читает предложение, а экран ветвится по
 * коду, и обе половины принадлежат одному решению.
 */
export const INTAKE_ERROR_MESSAGES: Record<
  IntakePreflightErrorCodeV1,
  { ru: string; en: string }
> = {
  INTAKE_INPUT_TOO_SHORT: {
    ru: 'Слишком коротко. Вставьте мысль, ссылку или чужой пост — хотя бы одно предложение.',
    en: 'Too short. Paste a thought, a link or somebody else’s post — a sentence at least.',
  },
  INTAKE_CHANNEL_REQUIRED: {
    ru: 'Выберите канал, в который готовить черновик.',
    en: 'Choose a channel the draft is written into.',
  },
  INTAKE_CHANNEL_UNKNOWN: {
    ru: 'Такого канала в рабочем пространстве нет или он отключён.',
    en: 'This workspace has no such channel, or it is switched off.',
  },
  INTAKE_TOO_MANY_CHANNELS: {
    ru: 'За один раз можно писать не больше чем в три канала.',
    en: 'One input writes into three channels at most.',
  },
  INTAKE_CHANNEL_UNSUPPORTED: {
    ru: 'Продукт не знает, как писать в этот канал.',
    en: 'The product does not know how to write into this channel.',
  },
};

export const intakeError = (
  code: IntakePreflightErrorCodeV1,
  language: 'ru' | 'en',
  subject?: string
) => new IntakeError(code, 422, INTAKE_ERROR_MESSAGES[code][language], subject);

/**
 * Единственный отказ, который рождается уже в стриме и имеет свой код.
 *
 * Не в перечислении контракта выше: до него дело доходит после `intake-started`,
 * то есть ответ уже начался и это событие, а не статус.
 */
export const INTAKE_LINK_UNREACHABLE_MESSAGES = {
  ru: 'Страницу по ссылке не удалось прочитать. Вставьте текст поста прямо в поле.',
  en: 'The page behind the link could not be read. Paste the text into the field instead.',
} as const;

/**
 * Второй такой отказ: заготовка написана, но не записалась.
 *
 * `content-factory-next-m2eg`. Раньше здесь была тишина — `recordCore`
 * возвращал `null`, и ход шёл дальше как ни в чём не бывало. Теперь весь
 * раздел стоит на том, что заготовка появляется первой, поэтому её отсутствие
 * называется вслух, а не остаётся между строк.
 */
export const PIECE_NOT_SAVED_MESSAGES = {
  ru: 'Заготовку не удалось сохранить. Ничего не потеряно — попробуйте ещё раз.',
  en: 'The piece could not be saved. Nothing is lost — try again.',
} as const;
