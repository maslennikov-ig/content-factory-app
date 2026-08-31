import {
  hasSpacedDash,
  splitSentences,
  stripQuotes,
  words,
  type Sentence,
} from './segment';
import { hasCopula } from './style-scales';
import type { LocalePack } from './locale-pack';
import {
  STYLE_SCALE_LABELS,
  type BrandVoiceLocale,
  type StyleScaleKey,
} from './brand-voice.types';
import type { ScaleVerdict } from './voice-retention';

/**
 * Where in the text the divergence actually is.
 *
 * The check already says a scale left the corridor. That is a fact about the
 * whole text and there is nothing a person can do with it: "фразы длиннее
 * обычного" does not say which fraze. The owner's decision on 2026-08-24 was
 * that the product points at places and repairs them one sentence at a time
 * rather than regenerating the text, and this file is the pointing half.
 *
 * Why pointwise at all. Regeneration loses the thing the text was written for
 * — the facts, the order of thought, the author's own findings — costs a full
 * call instead of a short one, and is unpredictable: a second pass can carry
 * the style further away than the first did. A sentence rewritten in place
 * keeps the content by construction, because everything else is untouched.
 *
 * Not every scale can be pointed at. Spread is a property of the whole text,
 * and the share of list paragraphs is a property of the paragraphs; naming one
 * sentence as the culprit of either would be a guess dressed as a finding. Two
 * more say nothing worth acting on when they fall short — fewer clerical nouns
 * than usual is not a defect — so they produce no spot in that direction.
 */

export type TextSpot = {
  /** Which habit this sentence pulls away from. */
  scale: StyleScaleKey;
  /** The sentence, verbatim, as it stands in the text that was measured. */
  sentence: string;
  /** Where it starts and ends in that text, so a screen can highlight it. */
  start: number;
  end: number;
  /** One phrase saying what is wrong with it. Words, not a metric. */
  note: string;
  /** The concrete words the note is about, where there are any. */
  terms: string[];
};

/** Five is what a person reads. A list of thirty is a report again. */
export const MAX_SPOTS = 5;

const isClerical = (word: string, pack: LocalePack) =>
  word.length >= 7 &&
  !pack.nominalisationExceptions.has(word) &&
  pack.nominalisationSuffixes.some((suffix) => word.endsWith(suffix));

const clericalWords = (sentence: string, pack: LocalePack): string[] => [
  ...new Set(
    words(sentence.toLowerCase()).filter((word) => isClerical(word, pack))
  ),
];

const institutionalWords = (sentence: string, pack: LocalePack): string[] => [
  ...new Set(
    words(stripQuotes(sentence).toLowerCase()).filter((word) =>
      pack.institutional.some(
        (term) => word === term || (term.length > 4 && word.startsWith(term))
      )
    )
  ),
];

const copulaWords = (sentence: string, pack: LocalePack): string[] => {
  const bare = stripQuotes(sentence).toLowerCase();
  return pack.copulas.filter((copula) => bare.includes(copula));
};

type Located = Sentence & { start: number; end: number };

/**
 * The sentences with their offsets.
 *
 * `splitSentences` returns text and word counts because that is all eight
 * scales ever needed. A screen that highlights needs to know where, and
 * re-splitting on the client would be a second implementation of the one thing
 * this module says must have exactly one.
 */
export function locateSentences(text: string, pack: LocalePack): Located[] {
  const located: Located[] = [];
  let cursor = 0;
  for (const sentence of splitSentences(text, pack)) {
    const start = text.indexOf(sentence.text, cursor);
    if (start < 0) continue;
    cursor = start + sentence.text.length;
    located.push({ ...sentence, start, end: cursor });
  }
  return located;
}

type Rule = {
  /** Which side of the corridor this rule answers. */
  placement: 'above' | 'below';
  /**
   * The sentences that carry the divergence, best candidate first.
   *
   * A rule that merely sorts is not enough. Sorting by length and taking the
   * top two names the longest sentence in the text even when it is three words
   * long, and the note then tells somebody their three-word phrase is longer
   * than they usually write. Every rule here filters first and sorts second.
   */
  pick: (
    sentences: Located[],
    pack: LocalePack,
    verdict: ScaleVerdict
  ) => Located[];
  terms?: (sentence: string, pack: LocalePack) => string[];
  note: (context: {
    sentence: Located;
    verdict: ScaleVerdict;
    terms: string[];
    locale: BrandVoiceLocale;
  }) => string;
};

const byWordsDesc = (list: Located[]) =>
  [...list].sort((left, right) => right.words - left.words);
const byWordsAsc = (list: Located[]) =>
  [...list].sort((left, right) => left.words - right.words);

/** Under this a sentence counts as "very short" — the same 8 scale 3 divides by. */
const SHORT_WORDS = 8;

const list = (terms: string[]) => terms.slice(0, 4).join(', ');

const RULES: Partial<Record<StyleScaleKey, Rule[]>> = {
  sentenceLength: [
    {
      placement: 'above',
      pick: (sentences, _pack, verdict) =>
        byWordsDesc(sentences.filter((one) => one.words > verdict.high)),
      note: ({ sentence, verdict, locale }) =>
        locale === 'ru'
          ? `Длиннее, чем вы обычно пишете: ${sentence.words} слов при коридоре ${verdict.low}–${verdict.high}.`
          : `Longer than you usually write: ${sentence.words} words against a corridor of ${verdict.low}–${verdict.high}.`,
    },
    {
      placement: 'below',
      pick: (sentences, _pack, verdict) =>
        byWordsAsc(sentences.filter((one) => one.words < verdict.low)),
      note: ({ sentence, verdict, locale }) =>
        locale === 'ru'
          ? `Короче, чем вы обычно пишете: ${sentence.words} слов при коридоре ${verdict.low}–${verdict.high}.`
          : `Shorter than you usually write: ${sentence.words} words against a corridor of ${verdict.low}–${verdict.high}.`,
    },
  ],
  shortSentences: [
    {
      placement: 'above',
      pick: (sentences) =>
        byWordsAsc(sentences.filter((one) => one.words < SHORT_WORDS)),
      note: ({ locale }) =>
        locale === 'ru'
          ? 'Совсем коротких фраз здесь больше обычного, и эта — одна из них.'
          : 'There are more very short phrases here than usual, and this is one of them.',
    },
    {
      placement: 'below',
      pick: (sentences) =>
        byWordsDesc(sentences.filter((one) => one.words >= SHORT_WORDS * 2)),
      note: ({ locale }) =>
        locale === 'ru'
          ? 'Совсем коротких фраз меньше обычного: эту можно разрубить надвое.'
          : 'Fewer very short phrases than usual: this one could be cut in two.',
    },
  ],
  dashCopula: [
    {
      placement: 'below',
      pick: (sentences, pack) =>
        sentences.filter(
          (sentence) =>
            !hasSpacedDash(sentence.text) && hasCopula(sentence.text, pack)
        ),
      terms: copulaWords,
      note: ({ terms, locale }) =>
        locale === 'ru'
          ? `Связка «${terms[0] ?? 'это'}» там, где вы обычно ставите тире.`
          : `A copula “${terms[0] ?? 'is'}” where you usually put a dash.`,
    },
    {
      placement: 'above',
      pick: (sentences) =>
        sentences.filter((sentence) => hasSpacedDash(sentence.text)),
      note: ({ locale }) =>
        locale === 'ru'
          ? 'Тире вместо связки здесь чаще обычного.'
          : 'A dash stands in for a copula more often here than usual.',
    },
  ],
  nominalisation: [
    {
      placement: 'above',
      pick: (sentences, pack) =>
        sentences
          .filter((sentence) => clericalWords(sentence.text, pack).length > 0)
          .sort(
            (left, right) =>
              clericalWords(right.text, pack).length -
              clericalWords(left.text, pack).length
          ),
      terms: clericalWords,
      note: ({ terms, locale }) =>
        locale === 'ru'
          ? `Канцелярские слова: ${list(terms)}.`
          : `Clerical nouns: ${list(terms)}.`,
    },
  ],
  firstPerson: [
    {
      placement: 'below',
      pick: (sentences, pack) =>
        sentences.filter(
          (sentence) => institutionalWords(sentence.text, pack).length > 0
        ),
      terms: institutionalWords,
      note: ({ terms, locale }) =>
        locale === 'ru'
          ? `Здесь «${terms[0]}» там, где вы обычно говорите «мы».`
          : `“${terms[0]}” here, where you usually say “we”.`,
    },
  ],
  questions: [
    {
      placement: 'above',
      pick: (sentences) =>
        sentences.filter((sentence) => /\?\s*$/.test(sentence.text)),
      note: ({ locale }) =>
        locale === 'ru'
          ? 'Вопросов читателю здесь больше обычного.'
          : 'More questions to the reader here than usual.',
    },
  ],
};

/** How far outside the corridor a scale fell, as a share of the corridor. */
const severity = (verdict: ScaleVerdict): number => {
  const width = Math.max(1, verdict.high - verdict.low);
  const distance =
    verdict.placement === 'above'
      ? verdict.value - verdict.high
      : verdict.low - verdict.value;
  return distance / width;
};

/**
 * The places to point at, worst divergence first.
 *
 * One sentence appears once even when two scales blame it: a person reading a
 * highlighted draft is not helped by the same phrase marked twice, and the
 * scale that fell furthest is the one worth naming.
 */
export function findTextSpots(
  text: string,
  outside: readonly ScaleVerdict[],
  pack: LocalePack,
  locale: BrandVoiceLocale = 'ru',
  limit: number = MAX_SPOTS
): TextSpot[] {
  const sentences = locateSentences(text, pack);
  if (sentences.length === 0) return [];

  const ordered = [...outside].sort(
    (left, right) => severity(right) - severity(left)
  );

  const spots: TextSpot[] = [];
  const taken = new Set<number>();

  for (const verdict of ordered) {
    const rules = RULES[verdict.key] ?? [];
    const rule = rules.find((one) => one.placement === verdict.placement);
    if (!rule) continue;

    // Two per scale at most. A scale that blames five sentences has not found
    // five defects, it has found a habit, and the repair is not pointwise.
    let used = 0;
    for (const sentence of rule.pick(sentences, pack, verdict)) {
      if (used >= 2 || spots.length >= limit) break;
      if (taken.has(sentence.start)) continue;
      const terms = rule.terms ? rule.terms(sentence.text, pack) : [];
      if (rule.terms && terms.length === 0) continue;
      taken.add(sentence.start);
      used += 1;
      spots.push({
        scale: verdict.key,
        sentence: sentence.text,
        start: sentence.start,
        end: sentence.end,
        note: rule.note({ sentence, verdict, terms, locale }),
        terms,
      });
    }
    if (spots.length >= limit) break;
  }

  return spots.sort((left, right) => left.start - right.start);
}

/** The scale's name as a person reads it, for a screen that groups by habit. */
export const spotLabel = (spot: TextSpot, locale: BrandVoiceLocale): string =>
  STYLE_SCALE_LABELS[locale][spot.scale].label;
