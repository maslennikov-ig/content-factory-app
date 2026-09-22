/**
 * Вопросы, которые продукт задаёт при создании заготовки.
 *
 * С волны `content-factory-next-4zul.1` их два: тезис и личная
 * позиция. Факты и контекст продукт ищет сам и о них не спрашивает.
 *
 * Чего здесь нет и не будет — нового вызова модели. Предложение берётся из уже
 * заполненного брифа: модель однажды сказала, что поняла, и переспрашивать её
 * же о том же значило бы платить дважды за один ответ. Там, где она честно
 * ничего не нашла, `suggested` равен `null` — это и есть «прошу ваши слова», а
 * не пустое поле.
 *
 * Ворота брифа этот файл не подменяет и с волны `content-factory-next-m2eg`
 * не дублирует: `openQuestionsFor` ниже сводит вопросы ворот и вопросы
 * интервью в ОДИН список по полям брифа. До этого их было два, они шли подряд
 * и спрашивали про факты дважды разными словами — первое, что владелец увидел
 * на живом прогоне 07.09.2026. `coreQuestionsFor` остаётся: по нему живёт
 * интервью под канал при адаптации, где ключ вопроса, а не поле брифа, и есть
 * единица работы.
 */

import type {
  BriefFilledV1,
  PieceOpenQuestionV1,
  PieceQuestionKeyV1,
  PieceQuestionV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { PIECE_MAX_QUESTIONS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type {
  Brief,
  BriefField,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import { evaluateBrief } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';

/** Ключи вопросов создания и поля брифа, куда ложатся ответы на них. */
export const CORE_QUESTION_FIELDS: Partial<
  Record<PieceQuestionKeyV1, BriefField>
> = {
  key_idea: 'thesis',
  position: 'position',
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
    (fact) => fact.origin === 'person' || (brief.inputKind === 'thought' && fact.origin === 'input')
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
    key: 'key_idea' | 'position',
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
    .slice(0, Math.min(2, PIECE_MAX_QUESTIONS));
};

/* -------------------------------------------------------------------------
 * Открытые вопросы заготовки: один список вместо двух
 * ---------------------------------------------------------------------- */

const textOf = (
  key: 'key_idea' | 'personal_detail' | 'position',
  language: 'ru' | 'en'
): string => (language === 'ru' ? TEXTS[key].ru : TEXTS[key].en);

/**
 * Заполненный бриф в том виде, в каком его читают ворота.
 *
 * Одно место на весь продукт: вход и дверь ответов обязаны судить готовность
 * одинаково, а две копии этого перевода разошлись бы на первом же поле. Свой
 * факт человека помечается `own` — он и есть опора (§9.5 карты раздела), и
 * только он: утверждение, вынутое моделью из чужого поста, приезжает с
 * происхождением `input` и опорой не становится.
 */
export const briefForGate = (brief: BriefFilledV1): Brief => ({
  goal: brief.goal ?? undefined,
  thesis: brief.thesis ?? undefined,
  format: brief.format ?? undefined,
  position: brief.position ?? undefined,
  disagreement: brief.disagreement ?? undefined,
  audience: brief.audience ?? undefined,
  facts: brief.facts.map((fact) => ({
    statement: fact.statement,
    sourceUrl: fact.sourceUrl ?? null,
    factId: fact.factId ?? null,
    own: fact.origin === 'person',
  })),
});

export type OpenQuestionsInputV1 = {
  brief: BriefFilledV1;
  /** Варианты модели по полям брифа: из них берётся предложение. */
  options: Partial<Record<BriefField, string[]>>;
  language: 'ru' | 'en';
  /** Поля, на которые человек ответил или которые отдал модели. */
  settled: readonly BriefField[];
};

/**
 * Что у заготовки осталось спросить — одним списком, по полям брифа.
 *
 * `content-factory-next-m2eg`, живой прогон 07.09.2026. До этой волны вопросов
 * было два вида и два круга: ворота брифа спрашивали про тезис и факты, а
 * интервью следом — про главную мысль, личную деталь и позицию. Про факты
 * человека спрашивали дважды подряд разными словами, и это владелец увидел
 * первым же ходом. Здесь они сведены в один список, ключ которого — поле
 * брифа, поэтому повтор невозможен по устройству, а не по договорённости.
 *
 * Спрашивается ровно две вещи и ни одной больше:
 *
 *  - **тезис** — когда его нет или его придумала модель;
 *  - **позиция** — когда её нет или её предположила модель.
 *
 * Про возражение и адресата не спрашивают вовсе: их модель предлагает, а
 * человек правит в квитанции. Это решение владельца от 06.09.2026 и граница
 * между «продукт предлагает» и «продукт допрашивает».
 */
export const openQuestionsFor = (
  input: OpenQuestionsInputV1
): PieceOpenQuestionV1[] => {
  const { brief, language } = input;
  const settled = new Set<BriefField>(input.settled);
  const verdict = evaluateBrief(briefForGate(brief));
  const gateText = (field: BriefField) =>
    verdict.questions.find((question) => question.field === field)?.question[
      language
    ] ?? '';

  const list: PieceOpenQuestionV1[] = [];
  const add = (question: PieceOpenQuestionV1) => {
    if (!settled.has(question.field) && question.question) list.push(question);
  };

  const thesis = trimmed(brief.thesis);
  if (!thesis || brief.origins.thesis === 'model') {
    add({
      field: 'thesis',
      // Тезиса нет — спрашивают словами ворот; тезис есть, но его придумала
      // модель — словами интервью, и тогда она отвечает первой.
      question: thesis ? textOf('key_idea', language) : gateText('thesis'),
      suggested: thesis || trimmed(input.options.thesis?.[0]) || null,
      ...(input.options.thesis?.length ? { options: input.options.thesis } : {}),
    });
  }

  const position = trimmed(brief.position);
  if (!position || brief.origins.position === 'model') {
    // A foreign post always gets the three stances, never the model's own
    // options: on the stand (18.09.2026) the model offered three rewordings of
    // the source author's view with the first one pre-filled, so pressing
    // «Дальше» adopted the foreign position — the defect the question exists
    // to prevent. Nothing is pre-filled either: the person has to choose.
    const foreign = brief.inputKind === 'foreign_post';
    // The third stance is not an answer but a request for the person's own
    // words, so it is named once and handed over as `ownOption`
    // (`content-factory-next-97dq.23`). Without the marker it was saved
    // verbatim as the position, and the core was written from a button label.
    const clarifyStance =
      language === 'ru'
        ? 'Я согласен частично и хочу уточнить свою позицию'
        : 'I partly agree and want to clarify my position';
    const positionOptions = foreign
      ? language === 'ru'
        ? [
            'Я согласен с позицией автора исходного поста',
            'Я не согласен с позицией автора исходного поста',
            clarifyStance,
          ]
        : [
            'I agree with the source author\'s position',
            'I disagree with the source author\'s position',
            clarifyStance,
          ]
      : input.options.position?.length
        ? input.options.position
        : undefined;
    add({
      field: 'position',
      question: textOf('position', language),
      suggested: foreign
        ? null
        : position || trimmed(positionOptions?.[0]) || null,
      ...(positionOptions?.length
        ? { options: positionOptions }
        : {}),
      ...(foreign ? { ownOption: clarifyStance } : {}),
    });
  }

  return list.slice(0, Math.min(2, PIECE_MAX_QUESTIONS));
};
