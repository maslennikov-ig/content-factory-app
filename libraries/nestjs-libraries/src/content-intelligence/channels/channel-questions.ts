/**
 * О чём продукт спрашивает под конкретный канал — и почему именно об этом.
 *
 * `content-factory-next-tu3k.9.3`, §11.9 карты раздела: при адаптации вопросы
 * берутся из исследования конкретной площадки, и только о том, на что
 * заготовка не отвечает. Файл лежит рядом с правилами письма
 * (`channel-writing-profile.ts`) не по вкусу: числа в вопросах — те же самые
 * числа карточки, и разъедься они на два файла, экран спросил бы про 80–180
 * знаков там, где карточка обещает другое.
 *
 * Telegram — единственная площадка, по которой у продукта есть исследование
 * владельца (материалы 20.05.2026, те же, из которых собран
 * `TELEGRAM_WRITING_DEFAULTS`): пуш показывает первые 80–180 знаков, призыв
 * один, формат решает автор. Длинные площадки — сайт и рассылка — спрашивают
 * не про крючок, а про доказательство: своё число, снимок экрана, кусок лога.
 *
 * Ни один вопрос не задаётся ради полноты. Если заготовка уже отвечает —
 * автор принёс своё число, формат назван в брифе, призыв записан в карточке, —
 * вопрос не появляется вовсе.
 */

import type { AdaptationKindV1, PieceQuestionV1, ZagotovkaCoreV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { ChannelWritingProfileV2 as ChannelWritingProfileV1 } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile.v2.contract';
import { PIECE_MAX_QUESTIONS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { TELEGRAM_PROVIDER_IDENTIFIER } from './channel-writing-profile';

/**
 * Сколько знаков крючка видно в уведомлении. Число из исследования Telegram,
 * то же, что стоит в `channelInstructionLines`.
 */
export const HOOK_PUSH_MIN = 80;
export const HOOK_PUSH_MAX = 180;

/** Площадки, где текст длинный и доказательство важнее крючка. */
export const LONG_FORM_PROVIDERS: readonly string[] = ['wordpress', 'listmonk'];

/** Форматы, у которых обещание конкретики нужно чем-то закрыть. */
const EVIDENCE_FORMATS: readonly string[] = ['case', 'expert'];

const TEXTS = {
  hook: {
    ru: 'Чем зацепить в первой строке?',
    en: 'What hooks the reader in the first line?',
    whyRu: `Её видно в уведомлении, ${HOOK_PUSH_MIN}–${HOOK_PUSH_MAX} знаков`,
    whyEn: `It is what the push notification shows, ${HOOK_PUSH_MIN}–${HOOK_PUSH_MAX} characters`,
  },
  cta: {
    ru: 'Один призыв в конце — какой?',
    en: 'One call to action at the end — which one?',
  },
  format: {
    ru: 'В какой форме рассказать?',
    en: 'Which shape should this text take?',
  },
  own_number: {
    ru: 'Есть своё число или измерение, которое можно назвать?',
    en: 'Is there a number or a measurement of your own you can name?',
    whyRu: 'Длинный текст без своего числа читается как чужой пересказ',
    whyEn: 'A long text with no number of its own reads as somebody else’s retelling',
  },
  screenshot: {
    ru: 'Есть снимок экрана или таблица, которую можно показать?',
    en: 'Is there a screenshot or a table you can show?',
  },
  log: {
    ru: 'Есть кусок лога, письма или переписки, который это подтверждает?',
    en: 'Is there a log, a letter or a message that confirms it?',
  },
} as const;

const FORMAT_OPTIONS = {
  ru: ['мнение', 'разбор', 'случай', 'история', 'список'],
  en: ['opinion', 'expert', 'case', 'story', 'list'],
} as const;

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Первая фраза сути, обрезанная по границе слова.
 *
 * Именно фраза, а не первые 180 знаков: обрубок на полуслове человек прочитает
 * как сбой продукта, а не как предложение.
 */
export const hookSuggestionFrom = (
  text: string,
  limit = HOOK_PUSH_MAX
): string | null => {
  const first = trimmed(trimmed(text).split(/\n+/u)[0]);
  if (!first) return null;
  const sentence = trimmed(first.split(/(?<=[.!?…])\s/u)[0]) || first;
  if (sentence.length <= limit) return sentence;
  const cut = sentence.slice(0, limit);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > limit / 2 ? cut.slice(0, boundary) : cut).trim();
};

export type ChannelQuestionsInputV1 = {
  profile: ChannelWritingProfileV1;
  providerIdentifier: string;
  core: ZagotovkaCoreV1 | null;
  language: 'ru' | 'en';
  kind?: AdaptationKindV1;
};

/**
 * Вопросы под канал: не больше трёх и только то, на что заготовка не отвечает.
 */
export const questionsForChannel = (
  profile: ChannelWritingProfileV1,
  providerIdentifier: string,
  core: ZagotovkaCoreV1 | null,
  language: 'ru' | 'en'
): PieceQuestionV1[] => {
  const ru = language === 'ru';
  const provider = String(providerIdentifier || '').toLowerCase();
  const format = trimmed(core?.brief?.format);
  const list: PieceQuestionV1[] = [];

  if (provider === TELEGRAM_PROVIDER_IDENTIFIER) {
    list.push({
      key: 'hook',
      question: ru ? TEXTS.hook.ru : TEXTS.hook.en,
      suggested: hookSuggestionFrom(core?.text || ''),
      why: ru ? TEXTS.hook.whyRu : TEXTS.hook.whyEn,
    });
    if (!profile.ctaKind) list.push({
      key: 'cta',
      question: ru ? TEXTS.cta.ru : TEXTS.cta.en,
      // Предложение — из карточки канала: человек уже сказал, чем этот канал
      // заканчивает пост, и спрашивать об этом заново значило бы не услышать.
      suggested: null,
      options: ru ? ['вопрос читателю', 'приглашение написать', 'ссылка на пост', 'без призыва'] : ['a question to the reader', 'an invitation to write', 'a link to the post', 'no call to action'],
    });
    // Формат спрашивается ровно тогда, когда его никто не выбрал: ни карточка
    // канала, ни бриф заготовки.
    if (
      profile.formatPreference === 'auto' &&
      (!format || format === 'auto')
    ) {
      list.push({
        key: 'format',
        question: ru ? TEXTS.format.ru : TEXTS.format.en,
        suggested: null,
        options: [...(ru ? FORMAT_OPTIONS.ru : FORMAT_OPTIONS.en)],
      });
    }
  } else if (LONG_FORM_PROVIDERS.includes(provider)) {
    if (core && core.authorNumbers === false) {
      list.push({
        key: 'own_number',
        question: ru ? TEXTS.own_number.ru : TEXTS.own_number.en,
        suggested: null,
        why: ru ? TEXTS.own_number.whyRu : TEXTS.own_number.whyEn,
      });
    }
    if (EVIDENCE_FORMATS.includes(format)) {
      list.push({
        key: 'screenshot',
        question: ru ? TEXTS.screenshot.ru : TEXTS.screenshot.en,
        suggested: null,
      });
      list.push({
        key: 'log',
        question: ru ? TEXTS.log.ru : TEXTS.log.en,
        suggested: null,
      });
    }
  }

  return list.slice(0, PIECE_MAX_QUESTIONS);
};
