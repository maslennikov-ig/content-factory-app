import type { LocalePack } from './locale-pack';
import { splitSentences, words } from './segment';
import type { VoiceReportLocale } from './brand-voice.types';

/**
 * What the author does with a post, as opposed to what they do with a sentence.
 *
 * The eight scales all divide by a sentence or a paragraph, and the model was
 * handed nothing else. Measured on the owner's real channel on 2026-08-24 it
 * wrote correctly about first person, lists, dashes and phrase length — and
 * wrote nothing about the two things a reader notices in the first line: that
 * he brings numbers he checked himself («прогнал шесть релизов через свой
 * стенд», «делал дважды, оба раза 89 баллов»), and that he often opens by
 * admitting he was wrong («Я ставил на DeepSeek V4 Pro. Если бы поставил…»).
 *
 * That was not the model being unobservant. Nothing counted either habit, and
 * the pipeline's own rule is that a claim without a number and a quote behind
 * it does not get made. So the answer is to count them, which is what this
 * file does — the research names these exact features in recommendation 1:
 * paragraph structure, discourse markers, CTA habits, emoji and hashtag rates.
 *
 * Every one of these is a heuristic and none of them is a classifier. An
 * opening that puts a first-person pronoun beside «ошибался» is read as a
 * confession; a digit beside «баллов» is read as a measurement. Both rules are
 * wrong sometimes, and both are stated plainly enough that a reader can see
 * when. A model asked to explain a share of 34% will quote the posts it came
 * from, and a wrong quote is visible where a wrong classification is not.
 */

export const POST_HABITS_VERSION = 'post-habits/1.0.0';

/**
 * The habits an observation is allowed to name as the number it explains.
 *
 * Counting them was not enough. The first run against a real model on
 * 2026-08-24 put the habits in the prompt and got 161 grounded observations
 * back, nearly all of them explaining one of the eight scales — because the
 * schema only let an observation name one of the eight. A model told it may
 * cite a number and then given a list of eight will cite one of the eight.
 */
export const POST_HABIT_METRIC_KEYS = [
  'opensWithAdmission',
  'opensWithNumber',
  'opensWithQuestion',
  'endsWithCallToAction',
  'carriesLink',
  'carriesOwnMeasurement',
  'postLength',
  'emojiRate',
] as const;

export type PostHabitMetricKey = (typeof POST_HABIT_METRIC_KEYS)[number];

/** Under this a share is one post's accident rather than a habit. */
export const MIN_POSTS = 5;

export type LengthShape = 'even' | 'long-tail' | 'short-tail';

export type EmojiRole = 'none' | 'list-marker' | 'intonation' | 'both';

export type PostHabits = {
  version: string;
  sampleCount: number;
  /**
   * Shares over the corpus, per cent, rounded to whole numbers.
   *
   * Three of them are `null` when this language has no word list for them.
   * Zero would say "this author never admits a mistake", which is a claim
   * about the author; `null` says "we cannot tell", which is the truth about
   * the product. Until 2026-08-25 every language except Russian got the zero.
   */
  opensWithAdmission: number | null;
  opensWithNumber: number;
  opensWithQuestion: number;
  endsWithCallToAction: number | null;
  carriesLink: number;
  carriesOwnMeasurement: number | null;
  /**
   * The same six as counts.
   *
   * A share alone is not quotable. The pipeline's rule is that the model
   * explains a number and cites the text it came from, and «в 4 постах из 153»
   * is a claim a reader can check where «3%» is a figure they have to trust.
   */
  counts: {
    opensWithAdmission: number | null;
    opensWithNumber: number;
    opensWithQuestion: number;
    endsWithCallToAction: number | null;
    carriesLink: number;
    carriesOwnMeasurement: number | null;
  };
  /**
   * The usual length in characters and the shape of the spread.
   *
   * The median rather than the mean: one long post pulls a mean above every
   * post that produced it, and «обычная длина» has to be a length the author
   * actually writes.
   */
  length: { median: number; low: number; high: number; shape: LengthShape };
  emoji: {
    /** Per thousand characters, so a long post does not look more emotional. */
    perThousandChars: number;
    /** Whether they mark list items, colour a sentence, or both. */
    role: EmojiRole;
    /** Share of emoji that open a line. The role above is read from this. */
    lineOpeningShare: number;
  };
};

/** Anything a font would draw as a picture rather than a letter. */
const EMOJI = /\p{Extended_Pictographic}/gu;
const OPENS_WITH_EMOJI = /^\p{Extended_Pictographic}/u;

const round0 = (value: number) => Math.round(value);
const share = (hit: number, total: number) =>
  total === 0 ? 0 : round0((100 * hit) / total);

const percentile = (sorted: number[], fraction: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1)
  );
  return sorted[rank];
};

/**
 * The opening: the first sentence, or the first line when the post starts with
 * a title.
 *
 * A channel post often opens with a heading on its own line — «🚀 "Обо мне и
 * мой план"» — and reading that as the opening sentence would measure the
 * heading rather than the first thing the author says.
 */
export function opening(text: string, pack: LocalePack): string {
  const sentences = splitSentences(text, pack);
  if (sentences.length === 0) return '';
  const first = sentences[0];
  // A heading is short and carries no full stop of its own; the sentence after
  // it is the opening.
  const looksLikeHeading =
    first.words <= 6 && !/[.!?…]\s*$/.test(first.text) && sentences.length > 1;
  return looksLikeHeading ? sentences[1].text : first.text;
}

const hasFirstPersonSingular = (sentence: string, pack: LocalePack): boolean =>
  words(sentence.toLowerCase()).some((word) =>
    pack.firstPersonSingular.includes(word)
  );

const hasAdmission = (sentence: string, pack: LocalePack): boolean => {
  const bare = sentence.toLowerCase();
  return (
    hasFirstPersonSingular(sentence, pack) &&
    pack.admissionMarkers.some((marker) => bare.includes(marker))
  );
};

const carriesDigit = (sentence: string): boolean => /\d/.test(sentence);

const isQuestion = (sentence: string): boolean => /\?\s*$/.test(sentence.trim());

/** The last two sentences: a call to action lives at the end or nowhere. */
const ending = (text: string, pack: LocalePack): string =>
  splitSentences(text, pack)
    .slice(-2)
    .map((one) => one.text)
    .join(' ')
    .toLowerCase();

const hasCallToAction = (text: string, pack: LocalePack): boolean => {
  const tail = ending(text, pack);
  return pack.callToAction.some((phrase) => tail.includes(phrase));
};

const LINK = /https?:\/\/\S+|\bt\.me\/\S+|\[[^\]]+\]\([^)]+\)/iu;

const hasLink = (text: string): boolean => LINK.test(text);

/**
 * A number the author checked, as opposed to a number they mentioned.
 *
 * A digit within four words of a unit. The window is what keeps «в 2026 году»
 * and «за 500 рублей» apart from «прогнал 6 релизов»: a date has no unit near
 * it, and a price does, which this rule counts and says so.
 */
export function hasOwnMeasurement(text: string, pack: LocalePack): boolean {
  const tokens = words(text.toLowerCase());
  for (let index = 0; index < tokens.length; index += 1) {
    if (!/^\d/.test(tokens[index])) continue;
    const window = tokens.slice(index + 1, index + 5);
    if (
      window.some((word) =>
        pack.measurementUnits.some((unit) => word.startsWith(unit))
      )
    ) {
      return true;
    }
  }
  // `89%` and `12мс` are one token, so the digit rule above never sees them.
  // The suffixes are the ones written without a space in either script; a unit
  // this language spells differently belongs in the pack's list above.
  return /\d\s*(?:%|мс|кб|мб|гб|ms|kb|mb|gb|km|kg|k|x)\b/iu.test(text);
}

/**
 * Что один пост сделал — до того, как из многих постов получится привычка.
 *
 * ## Зачем это отдельно от `computePostHabits`
 *
 * Привычка — свойство корпуса, и порог `MIN_POSTS` тому порукой: доля,
 * снятая с трёх постов, это случай, а не манера. Но у одного текста те же
 * шесть вопросов имеют ответ, и ответ этот — факт, а не доля. Разница нужна
 * там, где судят черновик: «этот пост начинается с числа» проверяемо, «этот
 * автор начинает с числа в 46% случаев» — нет.
 *
 * ## Почему функция, а не второй счётчик
 *
 * `content-factory-next-pl1.5` спрашивает, поднимут ли привычки поста парный
 * тест, и спрашивать это надо тем же кодом, каким продукт их считает. Вторая
 * реализация «начинается ли пост с числа» разошлась бы с первой, и разошлась
 * бы молча — обе возвращают булево, и обе выглядят правдоподобно. Поэтому
 * предикаты живут здесь в одном экземпляре, а `computePostHabits` ниже
 * складывает ровно их.
 *
 * `null` там, где у языка нет списка слов: ноль сказал бы «этот автор никогда
 * не признаёт ошибок», что есть утверждение об авторе, а правда — о продукте.
 */
export type PostObservation = {
  opensWithAdmission: boolean | null;
  opensWithNumber: boolean;
  opensWithQuestion: boolean;
  endsWithCallToAction: boolean | null;
  carriesLink: boolean;
  carriesOwnMeasurement: boolean | null;
};

export function observePost(text: string, pack: LocalePack): PostObservation {
  const body = text.trim();
  const first = opening(body, pack);
  const knowsAdmissions =
    pack.admissionMarkers.length > 0 && pack.firstPersonSingular.length > 0;
  return {
    opensWithAdmission: knowsAdmissions ? hasAdmission(first, pack) : null,
    opensWithNumber: carriesDigit(first),
    opensWithQuestion: isQuestion(first),
    endsWithCallToAction:
      pack.callToAction.length > 0 ? hasCallToAction(body, pack) : null,
    carriesLink: hasLink(body),
    carriesOwnMeasurement:
      pack.measurementUnits.length > 0 ? hasOwnMeasurement(body, pack) : null,
  };
}

const lengthShape = (
  low: number,
  median: number,
  high: number
): LengthShape => {
  const up = high - median;
  const down = median - low;
  if (up > down * 1.5) return 'long-tail';
  if (down > up * 1.5) return 'short-tail';
  return 'even';
};

const emojiRole = (lineOpeningShare: number, total: number): EmojiRole => {
  if (total === 0) return 'none';
  if (lineOpeningShare >= 60) return 'list-marker';
  if (lineOpeningShare <= 20) return 'intonation';
  return 'both';
};

export function computePostHabits(
  samples: readonly { text: string }[],
  pack: LocalePack
): PostHabits | null {
  const usable = samples.filter((sample) => sample.text.trim().length > 0);
  if (usable.length < MIN_POSTS) return null;

  let admissions = 0;
  let numbers = 0;
  let questions = 0;
  let calls = 0;
  let links = 0;
  let measurements = 0;
  let emojiTotal = 0;
  let emojiOpening = 0;
  let charTotal = 0;
  const lengths: number[] = [];

  for (const sample of usable) {
    const text = sample.text.trim();
    lengths.push(text.length);
    charTotal += text.length;

    const seen = observePost(text, pack);
    if (seen.opensWithAdmission) admissions += 1;
    if (seen.opensWithNumber) numbers += 1;
    if (seen.opensWithQuestion) questions += 1;
    if (seen.endsWithCallToAction) calls += 1;
    if (seen.carriesLink) links += 1;
    if (seen.carriesOwnMeasurement) measurements += 1;

    for (const line of text.split('\n')) {
      const found = line.match(EMOJI) ?? [];
      emojiTotal += found.length;
      // One per line at most, and only the one that opens it: a line beginning
      // with an emoji is using it as a bullet, and the rest of that line's
      // emoji are not.
      if (found.length > 0 && OPENS_WITH_EMOJI.test(line.trim())) {
        emojiOpening += 1;
      }
    }
  }

  // Three habits are a word list and nothing else. A language whose pack has
  // no list for one of them cannot answer that question at all, and says so.
  const knowsAdmissions =
    pack.admissionMarkers.length > 0 && pack.firstPersonSingular.length > 0;
  const knowsCalls = pack.callToAction.length > 0;
  const knowsUnits = pack.measurementUnits.length > 0;

  const sorted = [...lengths].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.9);
  const lineOpeningShare = share(emojiOpening, emojiTotal);

  return {
    version: POST_HABITS_VERSION,
    sampleCount: usable.length,
    opensWithAdmission: knowsAdmissions
      ? share(admissions, usable.length)
      : null,
    opensWithNumber: share(numbers, usable.length),
    opensWithQuestion: share(questions, usable.length),
    endsWithCallToAction: knowsCalls ? share(calls, usable.length) : null,
    carriesLink: share(links, usable.length),
    carriesOwnMeasurement: knowsUnits
      ? share(measurements, usable.length)
      : null,
    counts: {
      opensWithAdmission: knowsAdmissions ? admissions : null,
      opensWithNumber: numbers,
      opensWithQuestion: questions,
      endsWithCallToAction: knowsCalls ? calls : null,
      carriesLink: links,
      carriesOwnMeasurement: knowsUnits ? measurements : null,
    },
    length: { median, low, high, shape: lengthShape(low, median, high) },
    emoji: {
      perThousandChars:
        charTotal === 0 ? 0 : Math.round((1000 * emojiTotal) / charTotal),
      role: emojiRole(lineOpeningShare, emojiTotal),
      lineOpeningShare,
    },
  };
}

const SHAPE_WORDS: Record<VoiceReportLocale, Record<LengthShape, string>> = {
  ru: {
    even: 'длины ровные',
    'long-tail': 'иногда пишет заметно длиннее обычного',
    'short-tail': 'иногда пишет заметно короче обычного',
  },
  en: {
    even: 'lengths are even',
    'long-tail': 'sometimes writes markedly longer than usual',
    'short-tail': 'sometimes writes markedly shorter than usual',
  },
};

const ROLE_WORDS: Record<VoiceReportLocale, Record<EmojiRole, string>> = {
  ru: {
    none: 'эмодзи не ставит',
    'list-marker': 'эмодзи — маркер пункта списка',
    intonation: 'эмодзи — интонация внутри фразы',
    both: 'эмодзи и маркер списка, и интонация',
  },
  en: {
    none: 'uses no emoji',
    'list-marker': 'emoji mark list items',
    intonation: 'emoji colour a sentence',
    both: 'emoji do both',
  },
};

/**
 * The habits as lines for the prompt.
 *
 * Named in words rather than by key, because the model is asked to explain
 * them to a person and `opensWithAdmission: 34` is not a sentence anybody
 * writes. The numbers stay exact: an explanation of a rounded number is an
 * explanation of a different number.
 */
export function renderPostHabits(
  habits: PostHabits | null,
  locale: VoiceReportLocale = 'ru'
): string {
  if (!habits) return '';
  const russian = locale !== 'en';
  const of = (key: keyof PostHabits['counts']) => {
    const count = habits.counts[key];
    // Absence, in the same words a person would use. Printing `0%` here is how
    // "we have no dictionary for this language" used to read as "this author
    // never does it".
    if (count === null || habits[key] === null) {
      return russian
        ? 'не измеряется: для этого языка нет словаря'
        : 'not measured: this language has no dictionary for it';
    }
    return `${habits[key]}% (${count} ${russian ? 'из' : 'of'} ${habits.sampleCount})`;
  };
  const lines = russian
    ? [
        `постов разобрано: ${habits.sampleCount}`,
        `opensWithAdmission · начинает с признания своей ошибки: ${of('opensWithAdmission')}`,
        `opensWithNumber · начинает с числа: ${of('opensWithNumber')}`,
        `opensWithQuestion · начинает с вопроса: ${of('opensWithQuestion')}`,
        `endsWithCallToAction · заканчивает призывом: ${of('endsWithCallToAction')}`,
        `carriesLink · даёт ссылку: ${of('carriesLink')}`,
        `carriesOwnMeasurement · приносит собственные измерения (число рядом с единицей): ${of('carriesOwnMeasurement')}`,
        `postLength · обычная длина поста: ${habits.length.median} знаков (${habits.length.low}–${habits.length.high}), ${SHAPE_WORDS.ru[habits.length.shape]}`,
        `emojiRate · эмодзи: ${habits.emoji.perThousandChars} на тысячу знаков, ${ROLE_WORDS.ru[habits.emoji.role]}`,
      ]
    : [
        `posts analysed: ${habits.sampleCount}`,
        `opensWithAdmission · opens by admitting a mistake: ${of('opensWithAdmission')}`,
        `opensWithNumber · opens with a number: ${of('opensWithNumber')}`,
        `opensWithQuestion · opens with a question: ${of('opensWithQuestion')}`,
        `endsWithCallToAction · ends with a call to action: ${of('endsWithCallToAction')}`,
        `carriesLink · carries a link: ${of('carriesLink')}`,
        `carriesOwnMeasurement · brings its own measurements (a figure beside a unit): ${of('carriesOwnMeasurement')}`,
        `postLength · usual post length: ${habits.length.median} characters (${habits.length.low}–${habits.length.high}), ${SHAPE_WORDS.en[habits.length.shape]}`,
        `emojiRate · emoji: ${habits.emoji.perThousandChars} per thousand characters, ${ROLE_WORDS.en[habits.emoji.role]}`,
      ];
  return lines.join('\n');
}
