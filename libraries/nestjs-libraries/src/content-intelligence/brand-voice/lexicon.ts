import type { LocalePack } from './locale-pack';
import {
  hasSpacedDash,
  splitSentences,
  stripQuotes,
  words,
} from './segment';
import { hasCopula } from './style-scales';
import type {
  BrandVoiceSampleInput,
  LexiconEntry,
  PunctuationHabits,
} from './brand-voice.types';

/**
 * The words a person reaches for, and the punctuation they reach for.
 *
 * The analysis screen shows both while the model is still out of the picture —
 * "Пока это арифметика по вашим текстам: считаются слова, знаки и повторы" —
 * and that is the point of computing them here rather than asking a model to
 * describe the writing. A count of "смена 64, отгрузка 51" is checkable; an
 * adjective is not.
 */

const MIN_TERM_LENGTH = 4;

export function buildLexicon(
  samples: readonly BrandVoiceSampleInput[],
  pack: LocalePack,
  limit = 12
): LexiconEntry[] {
  // Without a stopword list the answer would be a list of this language's
  // grammar dressed up as this author's favourite words. An empty list is the
  // honest one: the screen shows nothing rather than "the, and, to".
  if (pack.stopwords.size === 0) return [];
  const counts = new Map<string, number>();
  for (const sample of samples) {
    for (const word of words(sample.text.toLowerCase())) {
      if (word.length < MIN_TERM_LENGTH) continue;
      if (pack.stopwords.has(word)) continue;
      if (/^\d+$/.test(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort(
      ([leftTerm, leftCount], [rightTerm, rightCount]) =>
        rightCount - leftCount || leftTerm.localeCompare(rightTerm)
    )
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

const share = (hit: number, pool: number): number | null =>
  pool === 0 ? null : Math.round((100 * hit) / pool);

export function punctuationHabits(
  samples: readonly BrandVoiceSampleInput[],
  pack: LocalePack
): PunctuationHabits {
  const sentences = samples.flatMap((sample) =>
    splitSentences(sample.text, pack)
  );
  if (sentences.length === 0) {
    return {
      dashInsteadOfCopula: null,
      colonBeforeList: null,
      questionAtEnd: null,
      exclamation: null,
    };
  }

  const dashes = sentences.filter((sentence) => hasSpacedDash(sentence.text));
  const copulas = sentences.filter(
    (sentence) =>
      !hasSpacedDash(sentence.text) && hasCopula(sentence.text, pack)
  );
  const colons = sentences.filter((sentence) =>
    /:\s*(?:$|[-–—•*]|\d+[.)])/.test(stripQuotes(sentence.text))
  );

  return {
    // The same opportunity denominator scale 6 uses, so the screen's habit row
    // and the scale cannot disagree about the same writer.
    dashInsteadOfCopula: share(dashes.length, dashes.length + copulas.length),
    colonBeforeList: share(colons.length, sentences.length),
    questionAtEnd: share(
      sentences.filter((sentence) => /\?\s*$/.test(sentence.text)).length,
      sentences.length
    ),
    exclamation: share(
      sentences.filter((sentence) => /!\s*$/.test(sentence.text)).length,
      sentences.length
    ),
  };
}
