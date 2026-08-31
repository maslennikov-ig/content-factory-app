import type { BrandVoiceLocale } from './brand-voice.types';
import type { Deviation, NormMetricKey } from './voice-norm';

/**
 * A measurement said as a direction rather than as a per cent.
 *
 * «Доля вопросительных фраз 6,2 %» is a number a reader cannot place. «Задаёт
 * вопросы реже обычного» is a sentence they can act on — and it is the same
 * number, positioned. The raw value never disappears: it travels beside the
 * sentence for whoever wants to check, which is the half of §3.1 that stops
 * this from becoming vaguer rather than clearer.
 *
 * ## Both halves of a direction, not one
 *
 * Every metric needs two phrasings, because «выше» and «ниже» are different
 * facts about a person and not one fact with a sign. An author with short
 * sentences and an author with long ones are described by different sentences,
 * not by the same sentence with a minus in front. So each metric names what
 * more of it looks like and what less of it looks like, in the reader's own
 * words.
 *
 * ## Why nothing here says «чем у большинства»
 *
 * The norm is the product's own generation with no voice, not a population of
 * humans. Saying «чаще большинства» over it would be a claim about people
 * nobody measured. Every sentence therefore ends in «обычного поста» — the
 * ordinary generated post — and `voice-norm.ts` explains why that wording is
 * load-bearing rather than modest.
 *
 * Measured on 2026-08-25, and worth knowing before trusting a sentence from
 * here: the owner and this repository's technical prose — two different authors
 * in two different registers — land on the same side of the norm for sentence
 * spread, dash-instead-of-copula and questions. Some of what this detects is
 * «человек, а не модель» rather than «этот автор, а не другой».
 */

type Phrasing = {
  /** What more of it looks like, in the reader's words. */
  above: string;
  /** What less of it looks like. Not the same sentence negated. */
  below: string;
  /**
   * What the axis is called when the author is on neither side of it.
   *
   * A third phrasing rather than a reused one, because reusing `above` for
   * «как обычно» produces a sentence that states the opposite of the number:
   * an author who never writes a list came out «Часто перечисляет списком: как
   * обычный пост». The neutral band needs the name of the habit, not a
   * direction along it.
   */
  topic: string;
  /** What the raw number is, so the sentence can be checked. */
  unit: string;
};

const RU: Partial<Record<NormMetricKey, Phrasing>> = {
  sentenceLength: {
    above: 'Пишет длинными фразами',
    below: 'Пишет короткими фразами',
    topic: 'Длина фразы',
    unit: 'слов в предложении',
  },
  sentenceSpread: {
    above: 'Чередует короткие фразы с длинными',
    below: 'Держит фразы примерно одной длины',
    topic: 'Разброс длины фраз',
    unit: 'разброс длины',
  },
  shortSentences: {
    above: 'Часто рубит фразу совсем коротко',
    below: 'Почти не пользуется короткой фразой',
    topic: 'Короткие фразы',
    unit: '% фраз короче восьми слов',
  },
  listParagraphs: {
    above: 'Часто перечисляет списком',
    below: 'Списками почти не пользуется',
    topic: 'Списки',
    unit: '% абзацев со списком',
  },
  questions: {
    above: 'Часто спрашивает читателя',
    below: 'Вопросов читателю почти не задаёт',
    topic: 'Вопросы читателю',
    unit: '% вопросительных фраз',
  },
  dashCopula: {
    above: 'Ставит тире там, где другие ставят «это»',
    below: 'Обходится без тире вместо связки',
    topic: 'Тире вместо связки',
    unit: '% таких фраз',
  },
  firstPerson: {
    above: 'Говорит от себя, а не от организации',
    below: 'Говорит от организации, а не от себя',
    topic: 'От кого говорит',
    unit: '% упоминаний',
  },
  nominalisation: {
    above: 'Склонен к канцелярским существительным',
    below: 'Говорит глаголами, а не отглагольными существительными',
    topic: 'Канцелярские существительные',
    unit: '% длинных существительных',
  },
  postLength: {
    above: 'Пишет длинные посты',
    below: 'Пишет короткие посты',
    topic: 'Длина поста',
    unit: 'знаков в посте',
  },
  emojiRate: {
    above: 'Пользуется эмодзи',
    below: 'Эмодзи не пользуется',
    topic: 'Эмодзи',
    unit: 'эмодзи на тысячу знаков',
  },
};

const EN: Partial<Record<NormMetricKey, Phrasing>> = {
  sentenceLength: {
    above: 'Writes in long sentences',
    below: 'Writes in short sentences',
    topic: 'Sentence length',
    unit: 'words per sentence',
  },
  sentenceSpread: {
    above: 'Alternates short sentences with long ones',
    below: 'Keeps sentences about the same length',
    topic: 'Spread of sentence length',
    unit: 'spread of length',
  },
  shortSentences: {
    above: 'Often cuts a sentence very short',
    below: 'Rarely uses a short sentence',
    topic: 'Short sentences',
    unit: '% of sentences under eight words',
  },
  listParagraphs: {
    above: 'Often sets things out as a list',
    below: 'Rarely uses lists',
    topic: 'Lists',
    unit: '% of paragraphs with a list',
  },
  questions: {
    above: 'Often asks the reader a question',
    below: 'Rarely asks the reader anything',
    topic: 'Questions to the reader',
    unit: '% of sentences that are questions',
  },
  dashCopula: {
    above: 'Uses a dash where others would write "is"',
    below: 'Does without the dash-for-copula',
    topic: 'Dash instead of a copula',
    unit: '% of such sentences',
  },
  firstPerson: {
    above: 'Speaks as themselves rather than as the organisation',
    below: 'Speaks as the organisation rather than as themselves',
    topic: 'Who speaks',
    unit: '% of mentions',
  },
  nominalisation: {
    above: 'Leans on institutional nouns',
    below: 'Uses verbs rather than nouns made from verbs',
    topic: 'Institutional nouns',
    unit: '% of long nouns',
  },
  postLength: {
    above: 'Writes long posts',
    below: 'Writes short posts',
    topic: 'Post length',
    unit: 'characters per post',
  },
  emojiRate: {
    above: 'Uses emoji',
    below: 'Does not use emoji',
    topic: 'Emoji',
    unit: 'emoji per thousand characters',
  },
};

const PHRASINGS = { ru: RU, en: EN };

/**
 * How strongly the direction is stated.
 *
 * Two words, matching the two thresholds, and no third: there is no measured
 * ground for a finer split and inventing one would be the taste that
 * `DEVIATION_SIGMA` exists to remove.
 */
const STRENGTH = {
  ru: { strong: 'Сильно', noticeable: 'Заметно' },
  en: { strong: 'Far', noticeable: 'Noticeably' },
};

const TYPICAL = {
  ru: 'как обычный пост',
  en: 'like an ordinary post',
};

const COMPARED_TO = {
  ru: 'обычного поста',
  en: 'an ordinary post',
};

/**
 * Что сказать, когда эталон вообще не менялся.
 *
 * Ни один из сорока восьми постов эталона не пользуется эмодзи и не пишет
 * списками. Полоса тогда честна — «за пределами всего виденного», — а вот
 * слово «сильно» нет: расстояние измерять было нечем, разброс равен нулю.
 * Замер 28.08.2026 показал, во что это обходится: у владельца 5,6 эмодзи на
 * тысячу знаков, у второго автора 2,2, разница в два с половиной раза — и одно
 * и то же предложение «сильно отличается от обычного поста» на обоих.
 *
 * Теперь предложение говорит то, что действительно известно: обычный пост так
 * не делает вовсе. Число автора остаётся рядом и по-прежнему различает их.
 */
const NEVER_SEEN = {
  ru: { above: 'Обычный пост так не делает вовсе', below: 'Обычный пост делает так всегда' },
  en: { above: 'An ordinary post never does', below: 'An ordinary post always does' },
};

export type PhrasedDeviation = {
  /** The sentence a person reads. `null` where nothing may be claimed. */
  text: string | null;
  /** The author's own number and its unit, for whoever wants to check. */
  detail: string;
};

/**
 * The direction, as a sentence, or nothing.
 *
 * `absent` and `flat` return `null` rather than a hedge. A metric with no norm
 * behind it has to keep its raw number and say nothing about position: a
 * sentence like «примерно как обычно» over a comparison that never happened is
 * the class of statement this epic keeps finding and removing.
 */
export function phraseDeviation(
  key: NormMetricKey,
  deviation: Deviation,
  locale: BrandVoiceLocale
): PhrasedDeviation {
  const language: 'ru' | 'en' = locale === 'ru' ? 'ru' : 'en';
  const phrasing = PHRASINGS[language][key];
  const rounded = Math.round(deviation.raw * 10) / 10;
  /**
   * Число автора и рядом число эталона, а не одно число автора.
   *
   * Полос всего пять, и всё, что дальше двух сигм, читается одним словом
   * «сильно»: замер 28.08.2026 дал двум разным авторам 36,4 % и 56,5 % фраз
   * короче восьми слов и одно и то же предложение на обоих. Число эталона
   * рядом — единственная часть, которая их различает, и стоит она ноль:
   * `deviationOf` его и так вернул.
   *
   * Не третий порог. Порог, добавленный ради этого случая, был бы взят по
   * вкусу, а правило `pl1.6` требует одних порогов на все измерения.
   */
  const middle =
    deviation.normMedian === null || deviation.normMedian === undefined
      ? null
      : Math.round(deviation.normMedian * 10) / 10;
  const against =
    middle === null
      ? ''
      : language === 'ru'
        ? `, у обычного поста ${middle}`
        : `, an ordinary post ${middle}`;
  const detail = phrasing
    ? `${rounded} ${phrasing.unit}${against}`
    : `${rounded}${against}`;

  if (!phrasing || deviation.band === 'absent' || deviation.band === 'flat') {
    return { text: null, detail };
  }

  if (deviation.band === 'typical') {
    return { text: `${phrasing.topic}: ${TYPICAL[language]}`, detail };
  }

  const above =
    deviation.band === 'above' || deviation.band === 'far-above';
  const strong =
    deviation.band === 'far-above' || deviation.band === 'far-below';
  const stem = above ? phrasing.above : phrasing.below;
  /**
   * Расстояние называется только там, где его мерили.
   *
   * `z` равен `null` ровно в одном случае — эталон не менялся ни разу, и
   * полоса пришла из сравнения с константой. Тогда сказать «сильно» нельзя:
   * сильнее чего.
   */
  if (deviation.z === null || deviation.z === undefined) {
    const never = above ? NEVER_SEEN[language].above : NEVER_SEEN[language].below;
    return { text: `${stem}. ${never}`, detail };
  }
  const strength = strong
    ? STRENGTH[language].strong
    : STRENGTH[language].noticeable;

  /**
   * The direction is in the stem; the tail only says how far, in its own
   * sentence.
   *
   * Two earlier shapes were wrong in the same way — they made the tail agree
   * grammatically with a direction the stem had already fixed. «Пишет
   * короткими фразами — намного меньше обычного поста» compares the shortness
   * as though it were a quantity; «Вопросов читателю почти не задаёт — заметно
   * сильнее» says a near-absence is strong. A separate sentence about the
   * distance is the only form that stays correct on both sides of the norm.
   */
  void above;
  return {
    text:
      language === 'ru'
        ? `${stem}. ${strength} отличается от ${COMPARED_TO.ru}`
        : `${stem}. ${strength} different from ${COMPARED_TO.en}`,
    detail,
  };
}
