/**
 * The measured shape of a writer's manner.
 *
 * Every number here is produced without a model call, a network request or a
 * Python dependency, which is what lets the analysis step work for a workspace
 * with no AI key and no quota left. Formulas are fixed by
 * `docs/product/brand-voice-from-samples-spec.md` §3 rather than by this file:
 * "sentence", "paragraph with a list" and "clerical noun" each read several
 * ways, and two implementations disagree on the number unless the reading is
 * written down first.
 */

import type { PostHabits } from './post-habits';
import type { PostLayout } from './post-layout';
import type { VoicePrint } from './voiceprint';
import type { VoiceCalibration } from './voice-calibration';
import type { ImpostorSet } from './impostors';

/** The eight scales the design named, in the order it shows them. */
export const STYLE_SCALE_KEYS = [
  'sentenceLength',
  'sentenceSpread',
  'shortSentences',
  'listParagraphs',
  'questions',
  'dashCopula',
  'firstPerson',
  'nominalisation',
] as const;

export type StyleScaleKey = (typeof STYLE_SCALE_KEYS)[number];

/**
 * What each scale is called where a person reads it.
 *
 * Here rather than in the frontend's `voice-copy.ts`, which is where they were
 * written first, because the server says these names too: the text check's
 * summary is read above the post form, and it used to print the identifier —
 * `dashCopula 0% — ниже коридора` — asking a writer to know a word only the
 * counting code uses (`content-factory-next-vme.21.12`). Two dictionaries for
 * one set of eight names is how the two sides drift.
 */
export const STYLE_SCALE_LABELS = {
  ru: {
    sentenceLength: {
      label: 'Насколько длинные фразы',
      unit: 'слов в предложении',
    },
    sentenceSpread: {
      label: 'Фразы то короткие, то длинные',
      unit: 'разброс длины',
    },
    shortSentences: {
      label: 'Сколько совсем коротких фраз',
      unit: 'короче 8 слов',
    },
    listParagraphs: {
      label: 'Часто ли перечисляет списком',
      unit: 'абзацы со списком',
    },
    questions: {
      label: 'Задаёт ли вопросы читателю',
      unit: 'вопросительных фраз',
    },
    dashCopula: {
      label: 'Ставит тире вместо связки',
      unit: '«поставщика поменяли — сроки»',
    },
    firstPerson: {
      label: 'Говорит «мы», а не «компания»',
      unit: 'первое лицо',
    },
    nominalisation: {
      label: 'Канцелярские слова на «-ение»',
      unit: '«проведение», «обеспечение»',
    },
  },
  en: {
    sentenceLength: { label: 'How long the phrases are', unit: 'words per sentence' },
    sentenceSpread: {
      label: 'Phrases now short, now long',
      unit: 'spread of length',
    },
    shortSentences: {
      label: 'How many very short phrases',
      unit: 'under 8 words',
    },
    listParagraphs: {
      label: 'How often it lists things',
      unit: 'paragraphs with a list',
    },
    questions: {
      label: 'Whether it asks the reader',
      unit: 'question sentences',
    },
    dashCopula: {
      label: 'A dash instead of a copula',
      unit: '“the supplier changed — the dates”',
    },
    firstPerson: {
      label: 'Says “we”, not “the company”',
      unit: 'first person',
    },
    nominalisation: {
      label: 'Clerical nouns',
      unit: '“provision”, “implementation”',
    },
  },
} as const;

export type StyleScaleLabels = typeof STYLE_SCALE_LABELS;

/**
 * The language a corpus is written in.
 *
 * Sixteen, because the product ships sixteen interface locales and a person
 * writes in the language they write in. It used to be `'ru' | 'en'`, which
 * said that a corpus in German did not exist — while `analyzer.ts` quietly
 * measured English with Russian word lists, so even the two it admitted to
 * were one.
 *
 * Which of these can actually be measured is a separate question with a
 * separate answer, in `locale-pack.ts`. Keeping the two apart is the point:
 * "we have no dictionary for Georgian" is a sentence the product can say,
 * "Georgian is not a language" is not.
 */
export const BRAND_VOICE_LOCALES = [
  'ar',
  'bn',
  'de',
  'en',
  'es',
  'fr',
  'he',
  'it',
  'ja',
  'ka',
  'ko',
  'pt',
  'ru',
  'tr',
  'vi',
  'zh',
] as const;

export type BrandVoiceLocale = (typeof BRAND_VOICE_LOCALES)[number];

export const isBrandVoiceLocale = (value: string): value is BrandVoiceLocale =>
  (BRAND_VOICE_LOCALES as readonly string[]).includes(value);

/**
 * The language the product speaks back in.
 *
 * Not the same list, and deliberately not tied to it. The voice copy — the
 * verdict line, the scale labels, the habit names — exists in Russian and
 * English; a corpus may be in any of the sixteen and still be reported on in
 * either of these two.
 */
export type VoiceReportLocale = 'ru' | 'en';

/**
 * A scale that could not be computed is `null`, not zero.
 *
 * The design says it in words on the screen — "В образцах 4 вопроса — мало,
 * чтобы считать привычкой. Шкала останется пустой" — and the reason is that a
 * habit measured on four observations is not a habit. A zero would be read as
 * "this writer never asks questions", which is a different and false claim.
 */
export type StyleScaleValue = {
  /** The scale's own unit: words for `sentenceLength`, per cent for the rest. */
  raw: number;
  /** `raw` mapped onto the shared 0–100 axis the design draws all eight on. */
  display: number;
  /** The author's own corridor: the interval covering 8 of their 10 observations. */
  low: number;
  high: number;
  /** Where the corridor came from. A hand-edited one survives recomputation. */
  corridorSource: 'MEASURED' | 'MANUAL';
  /**
   * What the analysis measured under a corridor somebody moved by hand.
   *
   * Only ever set beside `corridorSource: 'MANUAL'`, and only by a recount:
   * the hand-set numbers are what the product obeys, and these two are what it
   * would have chosen. Keeping both is what lets a screen say the two have
   * drifted apart and offer the measured pair back in one press — without
   * them, a carried-over corridor is a number with nothing to compare against.
   */
  measuredLow?: number;
  measuredHigh?: number;
  /** How many observations the scale divided by, and how many samples fed it. */
  observations: number;
  sampleCount: number;
  /** One real sentence this was computed from, so the screen can show its working. */
  exampleSampleCode: string | null;
  exampleText: string | null;
};

/** Why a scale stayed empty. Shown to the person, not swallowed. */
export type StyleScaleGap = {
  reason:
    | 'TOO_FEW_OBSERVATIONS'
    | 'TOO_FEW_POSITIVE'
    | 'TOO_FEW_SAMPLES'
    /**
     * This language has no word list for this scale.
     *
     * Distinct from every other gap, because the others are about this corpus
     * and this one is about the product. Until 2026-08-25 it did not exist,
     * and a scale that divides by a word list the language does not have
     * returned zero — read on the screen as "this author never does that".
     */
    | 'NO_DICTIONARY'
    | 'FAILED';
  observations: number;
  positives: number;
  sampleCount: number;
  /** Present only for `FAILED`: one scale falling over must not take the rest. */
  error?: string;
};

export type StyleScaleResult = StyleScaleValue | StyleScaleGap;

export const isScaleValue = (
  result: StyleScaleResult | undefined
): result is StyleScaleValue =>
  !!result && typeof (result as StyleScaleValue).raw === 'number';

/** A word the author reaches for often. The screen lists a handful. */
export type LexiconEntry = { term: string; count: number };

/**
 * Punctuation habits, as the design shows them on the analysis screen: a share
 * each, not a count, because a count only says how much the person wrote.
 */
export type PunctuationHabits = {
  dashInsteadOfCopula: number | null;
  colonBeforeList: number | null;
  questionAtEnd: number | null;
  exclamation: number | null;
};

export type BrandVoiceSampleInput = {
  /** The short code the screen shows beside an example: `smp-02`. */
  code: string;
  text: string;
  language: BrandVoiceLocale;
  /** Deterministic split key. Same corpus in, same split out. */
  contentHash: string;
  /**
   * The message id a Telegram import kept, and the only thing in a corpus that
   * orders it in time.
   *
   * Read by `selectVoiceExamples` and by nothing else: quotes come from the
   * author's recent posts, every counted number comes from the whole corpus.
   * Absent for pasted and uploaded corpora, which is why the window is a
   * Telegram-only refinement rather than a rule the analyser depends on.
   */
  externalRef?: string | null;
};

export type CorpusSplit = 'TRAIN' | 'HOLDOUT';

export type BrandVoiceMeasurementResult = {
  analyzerVersion: string;
  localePackVersion: string;
  language: BrandVoiceLocale;
  sampleCount: number;
  charCount: number;
  wordCount: number;
  sentenceCount: number;
  scales: Partial<Record<StyleScaleKey, StyleScaleResult>>;
  lexicon: LexiconEntry[];
  punctuation: PunctuationHabits;
  /** Samples dropped before counting, with the reason, so nothing vanishes silently. */
  rejected: { code: string; reason: 'AI_ARTEFACT' | 'TOO_SHORT' | 'LANGUAGE' }[];
  split: Record<string, CorpusSplit>;
  /**
   * Whose the writing is, as distinct from what its habits are.
   *
   * The eight scales above answer "how does this person write"; this answers
   * "is this the same person", and the two are separate because measuring the
   * owner's real channel on 2026-08-24 showed the first cannot do the second.
   * Null when the corpus was too small to build one — an absent print is a
   * check that says "cannot tell", never one that says "not you".
   */
  voicePrint: VoicePrint | null;
  /**
   * Где у этого автора проходят границы «похоже» и «не похоже».
   *
   * Отдельно от отпечатка, потому что отпечаток — чистая арифметика над
   * корпусом, а рабочая точка требует материала, которого у автора нет:
   * текстов, написанных не им. Их приносит слой, у которого есть база, и
   * поэтому поле заполняется после разбора, а не внутри него.
   *
   * `null` — калибровки нет, и вердикт тогда не выносится вовсе. Это третье
   * состояние, а не «похоже» по умолчанию: константа, стоявшая тут до
   * 27.08.2026, отвергала до 71% собственных текстов настоящих авторов.
   */
  calibration?: VoiceCalibration | null;
  /**
   * Кем судили — шеренга, собранная под этого автора.
   *
   * Рядом с границами, потому что границы без неё бессмысленны: голос это
   * число относительно шеренги, и порог, снятый против одной, к голосу против
   * другой неприменим. `null` — шеренги своей нет, судили набором из сборки.
   */
  lineup?: ImpostorSet | null;
  /**
   * What the author does with a post, as opposed to with a sentence.
   *
   * The eight scales divide by a sentence or a paragraph, so the model was
   * handed nothing about openings, endings, links, own measurements or emoji —
   * and wrote nothing about them, correctly, because the pipeline forbids a
   * claim with no number behind it. Null under five posts.
   */
  postHabits: PostHabits | null;
  /**
   * How a post is laid out on the page, as opposed to how its sentences read.
   *
   * `post-layout.ts` measures the group the eight scales and the post habits
   * both miss: a live author breaks a paragraph with a soft line return
   * mid-thought, and a model asked to sound like them writes even blocks
   * separated by a blank line instead. Null under five posts, the same floor
   * `postHabits` uses.
   *
   * Absent — read as `null` — on every measurement produced before
   * `ANALYZER_VERSION` carried this field. That is a fact about when the
   * measurement ran, not about the author: an old row is read under its own
   * analyzer version and shown without a layout section, never recomputed and
   * never shown as zero, for the same reason `postHabits` above is `null`
   * rather than zero for a language with no dictionary — a zero here would
   * claim "this author never breaks a line softly" where the truth is "this
   * run did not measure it".
   */
  postLayout: PostLayout | null;
};
