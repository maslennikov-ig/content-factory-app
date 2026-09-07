/**
 * Три вопроса, которые продукт задаёт при создании заготовки.
 *
 * `content-factory-next-tu3k.9.3`, список владельца для короткого текста
 * (§11.9 карты раздела): ключевая мысль, личная деталь или случай, позиция.
 * И три правила, все обязательные: модель всегда предлагает первой («я думаю,
 * вот так»); не больше трёх вопросов за шаг; ответы хранятся дословно.
 *
 * Чего здесь нет и не будет — нового вызова модели. Предложение берётся из уже
 * заполненного брифа: модель однажды сказала, что поняла, и переспрашивать её
 * же о том же значило бы платить дважды за один ответ. Там, где она честно
 * ничего не нашла, `suggested` равен `null` — это и есть «прошу ваши слова», а
 * не пустое поле.
 *
 * Ворота брифа этот файл не подменяет. `questionsFor` (тезис и факты через
 * `evaluateBrief`) остаётся первым и главным: без тезиса или факта до
 * генерации не доходят вовсе, а эти три вопроса задаются уже поверх годного
 * брифа и только про то, чего в нём нет.
 */

import type {
  BriefFilledV1,
  PieceQuestionKeyV1,
  PieceQuestionV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { PIECE_MAX_QUESTIONS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { BriefField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';

/** Ключи вопросов создания и поля брифа, куда ложатся ответы на них. */
export const CORE_QUESTION_FIELDS: Partial<
  Record<PieceQuestionKeyV1, BriefField>
> = {
  key_idea: 'thesis',
  position: 'position',
  personal_detail: 'facts',
};

const TEXTS: Record<
  'key_idea' | 'personal_detail' | 'position',
  { ru: string; en: string; whyRu?: string; whyEn?: string }
> = {
  key_idea: {
    ru: 'Какая главная мысль, которой хотите поделиться?',
    en: 'What is the main thought you want to share?',
  },
  personal_detail: {
    ru: 'Есть личная история или неожиданный факт?',
    en: 'Is there a personal story or an unexpected fact?',
    whyRu: 'Пойдёт в текст дословно.',
    whyEn: 'It goes into the text verbatim.',
  },
  position: {
    ru: 'Где вы стоите в этом споре?',
    en: 'Where do you stand in this argument?',
  },
};

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Текст вопроса по его ключу — для промпта сути, который цитирует пару
 * «вопрос → ответ».
 *
 * Ответ без вопроса — это реплика без разговора: «пять из шести» ничего не
 * значит, пока не сказано, о чём спрашивали. Незнакомый ключ возвращает сам
 * себя, потому что вопросы под канал живут в своём файле, а промпт один.
 */
export const coreQuestionText = (
  key: PieceQuestionKeyV1,
  language: 'ru' | 'en'
): string => {
  const text = (TEXTS as Record<string, { ru: string; en: string }>)[key];
  if (!text) return key;
  return language === 'ru' ? text.ru : text.en;
};

/** Своё у человека: факт из его слов или из его ответа, а не находка поиска. */
export const hasOwnDetail = (brief: BriefFilledV1): boolean =>
  brief.facts.some(
    (fact) => fact.origin === 'input' || fact.origin === 'person'
  );

export type CoreQuestionsInputV1 = {
  brief: BriefFilledV1;
  /** Варианты модели по полям брифа: из них берётся предложение. */
  options: Partial<Record<BriefField, string[]>>;
  language: 'ru' | 'en';
  /** Ключи, на которые человек уже ответил: их не повторяют. */
  answeredKeys: readonly PieceQuestionKeyV1[];
  /** Ключи, отданные модели («Реши сама»): их тоже не повторяют. */
  decideKeys: readonly PieceQuestionKeyV1[];
};

/**
 * Что спросить при создании: до `PIECE_MAX_QUESTIONS` вопросов, только про то,
 * чего в брифе нет или что в нём — предположение модели.
 */
export const coreQuestionsFor = (
  input: CoreQuestionsInputV1
): PieceQuestionV1[] => {
  const { brief } = input;
  const asked = new Set<PieceQuestionKeyV1>([
    ...input.answeredKeys,
    ...input.decideKeys,
  ]);

  const question = (
    key: 'key_idea' | 'personal_detail' | 'position',
    suggested: string | null
  ): PieceQuestionV1 => {
    const text = TEXTS[key];
    const field = CORE_QUESTION_FIELDS[key];
    return {
      key,
      question: input.language === 'ru' ? text.ru : text.en,
      suggested,
      ...(field && field !== 'facts' ? { field } : {}),
      ...(text.whyRu
        ? { why: input.language === 'ru' ? text.whyRu : (text.whyEn as string) }
        : {}),
    };
  };

  const list: PieceQuestionV1[] = [];

  // Тезис есть, но его придумала модель, — это ровно тот случай, ради которого
  // вопрос и существует: продукт предлагает, человек подтверждает или правит.
  if (!trimmed(brief.thesis) || brief.origins.thesis === 'model') {
    list.push(
      question(
        'key_idea',
        trimmed(brief.thesis) || trimmed(input.options.thesis?.[0]) || null
      )
    );
  }

  // Личную деталь модель предложить не может: её либо принёс человек, либо её
  // нет. `suggested: null` здесь — честность, а не пробел.
  if (!hasOwnDetail(brief)) list.push(question('personal_detail', null));

  if (!trimmed(brief.position) || brief.origins.position === 'model') {
    list.push(
      question(
        'position',
        trimmed(brief.position) || trimmed(input.options.position?.[0]) || null
      )
    );
  }

  return list
    .filter((row) => !asked.has(row.key))
    .slice(0, PIECE_MAX_QUESTIONS);
};
