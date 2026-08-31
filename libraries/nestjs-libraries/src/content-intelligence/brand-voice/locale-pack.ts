import { RU_LOCALE_PACK } from './locale-pack.ru';
import { EN_LOCALE_PACK } from './locale-pack.en';
import type { BrandVoiceLocale } from './brand-voice.types';

/**
 * Which languages the voice can be measured in, and what a language costs.
 *
 * The product ships sixteen interface locales. Two of them have word lists.
 * That is not a defect as long as the difference is visible: a corpus in a
 * language with no pack must be told what cannot be measured and why, rather
 * than be handed a zero. A zero in this product reads as a finding — "this
 * author never writes clerically" — and it was, until 2026-08-25, the answer
 * every dictionary scale gave for every language except Russian.
 */

/**
 * The lists a pack has to carry, what each is for, and how small it may be.
 *
 * This is the price of the seventeenth language, written as data so that
 * `tests/brand-voice.locale-pack.test.cjs` can hold a new pack to it instead
 * of a reviewer having to remember. The minimums are not opinions: each one is
 * the size below which the measurement that reads the list stops separating
 * anything, and the reason is beside it.
 */
export const LOCALE_PACK_CONTRACT = [
  {
    list: 'functionWords',
    reads: 'the service-word distance, and the profile the lexicon is read against',
    minimum: 60,
    why: 'Burrows\'s Delta over fewer terms is a distance in too few dimensions; the Russian pack carries 86.',
  },
  {
    list: 'stopwords',
    reads: 'the lexicon of words this author reaches for',
    minimum: 120,
    why: 'a shorter list leaves ordinary grammar at the top of the list and the author\'s own words below it.',
  },
  {
    list: 'copulas',
    reads: 'scale 6 — a dash where a copula could have stood',
    minimum: 6,
    why: 'the list is the scale\'s denominator; with too few of them the scale has no opportunities and reports nothing.',
  },
  {
    list: 'firstPerson',
    reads: 'scale 7 — "we" against the organisation named from outside',
    minimum: 4,
    why: 'every inflected form of the first person plural, or the count is of one form rather than of the habit.',
  },
  {
    list: 'institutional',
    reads: 'scale 7 — the other half of the same choice',
    minimum: 5,
    why: 'the ways this language names an organisation from outside.',
  },
  {
    list: 'nominalisationSuffixes',
    reads: 'scale 8 — clerical nouns',
    minimum: 4,
    why: 'the deverbal endings of the language; a language that forms them differently needs the scale rethought rather than a list.',
  },
  {
    list: 'nominalisationExceptions',
    reads: 'scale 8 — the everyday words those endings also produce',
    minimum: 20,
    why: 'without them the scale calls ordinary writing bureaucratic.',
  },
  {
    list: 'abbreviationsBeforeName',
    reads: 'sentence splitting',
    minimum: 5,
    why: 'only abbreviations a capitalised word may follow; everything else the capital-letter test already handles.',
  },
  {
    list: 'admissionMarkers',
    reads: 'post habits — openings that admit a mistake',
    minimum: 10,
    why: 'stems, not a classifier; too few and the habit reads as absent in a writer who has it.',
  },
  {
    list: 'callToAction',
    reads: 'post habits — what the ending asks the reader to do',
    minimum: 10,
    why: 'the phrases an ending uses to ask; too few and the habit reads as absent in a writer who has it.',
  },
  {
    list: 'measurementUnits',
    reads: 'post habits — a digit that is a measurement rather than a date',
    minimum: 10,
    why: 'short and concrete, or dates and prices count as measurements.',
  },
] as const;

/**
 * Every measurement, and whether it needs a word list at all.
 *
 * Separated because the answer differs and nobody had written it down. The
 * character n-grams need no dictionary whatsoever — they read morphology,
 * spacing and punctuation straight off the text — which is an argument in
 * their favour that had not been made before `pl1.11` asked the question. The
 * five sentence-shape scales need one only for sentence splitting, and split
 * acceptably without it. Three scales, the service-word distance, the lexicon
 * and three post habits are a word list and nothing else.
 */
export const DICTIONARY_FREE_MEASUREMENTS = [
  'characterNgrams',
  'sentenceLength',
  'sentenceSpread',
  'shortSentences',
  'questions',
  'listParagraphs',
  'postLength',
  'emoji',
] as const;

export const DICTIONARY_BOUND_MEASUREMENTS = [
  'dashCopula',
  'firstPerson',
  'nominalisation',
  'functionWordDistance',
  'lexicon',
  'admissionOpenings',
  'callToAction',
  'ownMeasurements',
] as const;

/**
 * What a pack is, spelled out rather than inferred from the Russian one.
 *
 * It used to be `typeof RU_LOCALE_PACK`, which made Russian the definition of
 * a language rather than an instance of one, and meant a second pack could
 * only ever be checked against the first one's exact literal shapes.
 */
export type LocalePack = {
  version: string;
  functionWords: readonly string[];
  admissionMarkers: readonly string[];
  callToAction: readonly string[];
  measurementUnits: readonly string[];
  abbreviationsBeforeName: readonly string[];
  copulas: readonly string[];
  firstPerson: ReadonlySet<string>;
  firstPersonSingular: readonly string[];
  institutional: readonly string[];
  nominalisationSuffixes: readonly string[];
  nominalisationExceptions: ReadonlySet<string>;
  stopwords: ReadonlySet<string>;
};

/** The packs that exist. A locale absent from here has no measurement. */
export const LOCALE_PACKS: { ru: LocalePack; en: LocalePack } = {
  ru: RU_LOCALE_PACK,
  en: EN_LOCALE_PACK,
};

/** The locales a pack exists for, as a value a caller can iterate. */
export const MEASURABLE_LOCALES = Object.keys(
  LOCALE_PACKS
) as ReadonlyArray<keyof typeof LOCALE_PACKS>;

export type MeasurableLocale = (typeof MEASURABLE_LOCALES)[number];

export const hasLocalePack = (
  locale: BrandVoiceLocale
): locale is MeasurableLocale =>
  Object.prototype.hasOwnProperty.call(LOCALE_PACKS, locale);

/**
 * The pack for a locale, or nothing.
 *
 * Deliberately not "or the Russian one". The fallback is what made an English
 * corpus report zeros with a straight face, and the honest answer for a
 * language with no lists is that these measurements are unavailable — which
 * every caller below now says in words.
 */
export const packFor = (
  locale: BrandVoiceLocale
): LocalePack | undefined =>
  hasLocalePack(locale) ? LOCALE_PACKS[locale] : undefined;

/**
 * A pack with nothing in it, for a language that has no pack.
 *
 * Every measurement asks its own list whether it is empty and answers with an
 * absence when it is, so the analysis still runs and still returns everything
 * that needs no dictionary: sentence length and its spread, short sentences,
 * questions, list paragraphs, post length, the emoji rate, and the character
 * n-grams, which need no word list of any kind. That last one is an argument
 * in their favour nobody had made before this question was asked.
 *
 * The version says which language it is standing in for, so a measurement
 * saved today can be told apart from one saved after that language gets lists.
 */
export const emptyLocalePack = (locale: BrandVoiceLocale): LocalePack => ({
  version: `none-${locale}`,
  functionWords: [],
  admissionMarkers: [],
  callToAction: [],
  measurementUnits: [],
  abbreviationsBeforeName: [],
  copulas: [],
  firstPerson: new Set<string>(),
  firstPersonSingular: [],
  institutional: [],
  nominalisationSuffixes: [],
  nominalisationExceptions: new Set<string>(),
  stopwords: new Set<string>(),
});
