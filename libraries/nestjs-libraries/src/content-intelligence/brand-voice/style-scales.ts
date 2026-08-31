import type { LocalePack } from './locale-pack';
import {
  countWords,
  hasSpacedDash,
  splitParagraphs,
  splitSentences,
  stripQuotes,
  words,
  type Sentence,
} from './segment';
import {
  STYLE_SCALE_KEYS,
  type BrandVoiceSampleInput,
  type StyleScaleGap,
  type StyleScaleKey,
  type StyleScaleResult,
  type StyleScaleValue,
} from './brand-voice.types';

/**
 * The eight scales, and the corridor each one is read against.
 *
 * Two things here are decisions rather than arithmetic, and both are in
 * `docs/product/brand-voice-from-samples-spec.md` §3.4 with their reasons.
 *
 * The corridor is the 10th-to-90th percentile of the author's own
 * distribution, not a mean plus a deviation. Sentence length in real writing is
 * not symmetric — a few long ones pull the mean above the middle — and a
 * symmetric interval produces a corridor the author themselves falls outside.
 *
 * Two scales divide by an opportunity rather than by every sentence. "Ставит
 * тире вместо связки · 74%" cannot be a share of all sentences; it is the
 * choice between two spellings of one clause, so it divides by the sentences
 * that took either. The same for "Говорит «мы», а не «компания»".
 */

/** Each scale's own unit range, mapped onto the shared 0–100 axis. */
const DOMAIN: Record<StyleScaleKey, [number, number]> = {
  sentenceLength: [4, 40],
  sentenceSpread: [0, 100],
  shortSentences: [0, 100],
  listParagraphs: [0, 100],
  questions: [0, 100],
  dashCopula: [0, 100],
  firstPerson: [0, 100],
  nominalisation: [0, 100],
};

/** Thresholds below which a scale says nothing rather than guessing. */
export const MIN_OBSERVATIONS = 100;
export const MIN_POSITIVES = 10;
export const MIN_SAMPLES = 5;
/** Opportunity-based scales have far fewer chances; their floor is separate. */
export const MIN_OPPORTUNITIES = 10;

const SHORT_SENTENCE_WORDS = 8;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export const toDisplay = (raw: number, key: StyleScaleKey): number => {
  const [min, max] = DOMAIN[key];
  return Math.round(clamp(((raw - min) / (max - min)) * 100, 0, 100));
};

/** Nearest-rank percentile. Deterministic: same corpus, same corridor. */
export function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1)
  );
  return sorted[rank];
}

const corridor = (values: number[]): [number, number] => {
  const sorted = [...values].sort((left, right) => left - right);
  return [percentile(sorted, 0.1), percentile(sorted, 0.9)];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

type SampleAnalysis = {
  code: string;
  sentences: Sentence[];
  paragraphs: ReturnType<typeof splitParagraphs>;
};

const analyseSample = (
  sample: BrandVoiceSampleInput,
  pack: LocalePack
): SampleAnalysis => ({
  code: sample.code,
  sentences: splitSentences(sample.text, pack),
  paragraphs: splitParagraphs(sample.text),
});

/** A scale over sentences: share of those that satisfy a predicate. */
type RateScale = {
  key: StyleScaleKey;
  /** Positive over every sentence, or over an explicit opportunity set. */
  positive: (sentence: Sentence, pack: LocalePack) => boolean;
  /** When present, the denominator is only sentences this accepts. */
  opportunity?: (sentence: Sentence, pack: LocalePack) => boolean;
};

const hasCopula = (sentence: string, pack: LocalePack): boolean => {
  const bare = stripQuotes(sentence).toLowerCase();
  return pack.copulas.some((copula) => {
    if (copula.includes(' ')) return bare.includes(copula);
    if (copula !== 'есть') {
      return new RegExp(`(?<![\\p{L}])${copula}(?![\\p{L}])`, 'u').test(bare);
    }
    // `есть` is also "there is" and "to eat". Only count it where a predicate
    // could stand: not followed by a preposition of place or possession.
    return /(?<![\p{L}])есть(?![\p{L}])(?!\s+(?:у|в|во|на|при)\b)/u.test(bare);
  });
};

const countFrom = (text: string, terms: readonly string[]): number =>
  words(text.toLowerCase()).filter((word) =>
    terms.some(
      (term) => word === term || (term.length > 4 && word.startsWith(term))
    )
  ).length;

const RATE_SCALES: RateScale[] = [
  {
    key: 'shortSentences',
    positive: (sentence) => sentence.words < SHORT_SENTENCE_WORDS,
  },
  {
    key: 'questions',
    positive: (sentence) => /\?\s*$/.test(sentence.text),
  },
  {
    key: 'dashCopula',
    positive: (sentence) => hasSpacedDash(sentence.text),
    opportunity: (sentence, pack) =>
      hasSpacedDash(sentence.text) || hasCopula(sentence.text, pack),
  },
];

const gap = (
  reason: StyleScaleGap['reason'],
  observations: number,
  positives: number,
  sampleCount: number
): StyleScaleGap => ({ reason, observations, positives, sampleCount });

/**
 * Whether this language has the list a scale divides by.
 *
 * Three of the eight are a word list and nothing else, and until 2026-08-25 a
 * language without one got a number anyway: an empty copula list left
 * `dashCopula` with no opportunities, an empty first-person list made every
 * sentence institutional, an empty suffix list made every author plain-spoken.
 * All three read on the screen as findings about the writer.
 */
const DICTIONARY_FOR: Partial<Record<StyleScaleKey, (pack: LocalePack) => boolean>> = {
  dashCopula: (pack) => pack.copulas.length > 0,
  firstPerson: (pack) =>
    pack.firstPerson.size > 0 && pack.institutional.length > 0,
  nominalisation: (pack) => pack.nominalisationSuffixes.length > 0,
};

const missingDictionary = (
  key: StyleScaleKey,
  pack: LocalePack
): StyleScaleGap | null => {
  const known = DICTIONARY_FOR[key];
  return known && !known(pack) ? gap('NO_DICTIONARY', 0, 0, 0) : null;
};

/**
 * Runs one scale and never lets it take the others down. The design draws this
 * exact case — "Остальные семь шкал посчитаны и действуют" beside a single
 * failed one — so a thrown error becomes that scale's gap, not the run's end.
 */
const guarded = (
  key: StyleScaleKey,
  compute: () => StyleScaleResult
): StyleScaleResult => {
  try {
    return compute();
  } catch (error) {
    return {
      reason: 'FAILED',
      observations: 0,
      positives: 0,
      sampleCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const value = (
  key: StyleScaleKey,
  raw: number,
  [low, high]: [number, number],
  observations: number,
  sampleCount: number,
  example: { code: string; text: string } | null
): StyleScaleValue => ({
  raw: round1(raw),
  display: toDisplay(raw, key),
  low: round1(low),
  high: round1(high),
  corridorSource: 'MEASURED',
  observations,
  sampleCount,
  exampleSampleCode: example?.code ?? null,
  exampleText: example?.text ?? null,
});

export function computeStyleScales(
  samples: readonly BrandVoiceSampleInput[],
  pack: LocalePack
): Partial<Record<StyleScaleKey, StyleScaleResult>> {
  const analyses = samples.map((sample) => analyseSample(sample, pack));
  const contributing = analyses.filter(
    (analysis) => analysis.sentences.length > 0
  );
  const allSentences = contributing.flatMap((analysis) =>
    analysis.sentences.map((sentence) => ({
      ...sentence,
      code: analysis.code,
    }))
  );
  const sampleCount = contributing.length;
  const result: Partial<Record<StyleScaleKey, StyleScaleResult>> = {};

  const tooFewSamples = (observations: number, positives: number) =>
    sampleCount < MIN_SAMPLES
      ? gap('TOO_FEW_SAMPLES', observations, positives, sampleCount)
      : null;

  // 1 and 2 — mean sentence length and its spread. The corridor for the first
  // is over sentences, because that is what the design's caption promises:
  // "коридор 10–18 покрывает 8 из 10 ваших фраз".
  result.sentenceLength = guarded('sentenceLength', () => {
    const lengths = allSentences.map((sentence) => sentence.words);
    const short = tooFewSamples(lengths.length, lengths.length);
    if (short) return short;
    if (lengths.length < MIN_OBSERVATIONS) {
      return gap('TOO_FEW_OBSERVATIONS', lengths.length, lengths.length, sampleCount);
    }
    const mean = lengths.reduce((sum, one) => sum + one, 0) / lengths.length;
    const example =
      allSentences.find(
        (sentence) => Math.abs(sentence.words - mean) <= 1
      ) ?? allSentences[0];
    return value(
      'sentenceLength',
      mean,
      corridor(lengths),
      lengths.length,
      sampleCount,
      { code: example.code, text: example.text }
    );
  });

  result.sentenceSpread = guarded('sentenceSpread', () => {
    const lengths = allSentences.map((sentence) => sentence.words);
    const short = tooFewSamples(lengths.length, lengths.length);
    if (short) return short;
    if (lengths.length < MIN_OBSERVATIONS) {
      return gap('TOO_FEW_OBSERVATIONS', lengths.length, lengths.length, sampleCount);
    }
    const mean = lengths.reduce((sum, one) => sum + one, 0) / lengths.length;
    const variance =
      lengths.reduce((sum, one) => sum + (one - mean) ** 2, 0) / lengths.length;
    const perSample = contributing.map((analysis) => {
      const own = analysis.sentences.map((sentence) => sentence.words);
      const ownMean = own.reduce((sum, one) => sum + one, 0) / own.length;
      const ownVariance =
        own.reduce((sum, one) => sum + (one - ownMean) ** 2, 0) / own.length;
      return ownMean > 0
        ? clamp((Math.sqrt(ownVariance) / ownMean) * 100, 0, 100)
        : 0;
    });
    const raw = mean > 0 ? clamp((Math.sqrt(variance) / mean) * 100, 0, 100) : 0;
    const longest = [...allSentences].sort((a, b) => b.words - a.words)[0];
    return value(
      'sentenceSpread',
      raw,
      corridor(perSample),
      lengths.length,
      sampleCount,
      { code: longest.code, text: longest.text }
    );
  });

  // 3, 5 and 6 — shares over sentences, with their own corridors taken across
  // samples: a percentage over the whole corpus has no distribution of its own.
  for (const scale of RATE_SCALES) {
    result[scale.key] = guarded(scale.key, () => {
      const absent = missingDictionary(scale.key, pack);
      if (absent) return absent;
      const pool = scale.opportunity
        ? allSentences.filter((sentence) => scale.opportunity!(sentence, pack))
        : allSentences;
      const positives = pool.filter((sentence) =>
        scale.positive(sentence, pack)
      );
      const floor = scale.opportunity ? MIN_OPPORTUNITIES : MIN_OBSERVATIONS;

      const short = tooFewSamples(pool.length, positives.length);
      if (short) return short;
      if (pool.length < floor) {
        return gap(
          'TOO_FEW_OBSERVATIONS',
          pool.length,
          positives.length,
          sampleCount
        );
      }
      // Few-but-present is untrustworthy; none at all is a finding. Four
      // questions in a corpus cannot tell us whether asking is a habit, which
      // is what the design says in words. Zero questions across nine hundred
      // sentences says plainly that this writer does not ask, and reporting
      // that as "unknown" would hide a real trait.
      if (positives.length > 0 && positives.length < MIN_POSITIVES) {
        return gap(
          'TOO_FEW_POSITIVE',
          pool.length,
          positives.length,
          sampleCount
        );
      }

      const perSample = contributing.map((analysis) => {
        const own = scale.opportunity
          ? analysis.sentences.filter((sentence) =>
              scale.opportunity!(sentence, pack)
            )
          : analysis.sentences;
        if (own.length === 0) return 0;
        const hit = own.filter((sentence) =>
          scale.positive(sentence, pack)
        ).length;
        return (100 * hit) / own.length;
      });

      /**
       * No positives at all is a finding, and this is where it used to become
       * an error instead. The comment above says a corpus with no questions
       * says plainly that this writer does not ask — and then the example
       * lookup read `positives[0]` on an empty array, threw, and the scale
       * came back `FAILED`. The share is 0 and there is no sentence to quote,
       * which `value` has always been able to say.
       */
      const example = positives[0] ?? null;
      return value(
        scale.key,
        (100 * positives.length) / pool.length,
        corridor(perSample),
        pool.length,
        sampleCount,
        example ? { code: example.code, text: example.text } : null
      );
    });
  }

  // 4 — paragraphs with a list. Its unit is the paragraph, not the sentence.
  result.listParagraphs = guarded('listParagraphs', () => {
    const paragraphs = contributing.flatMap((analysis) =>
      analysis.paragraphs.map((paragraph) => ({
        ...paragraph,
        code: analysis.code,
      }))
    );
    const positives = paragraphs.filter((paragraph) => paragraph.isList);
    const short = tooFewSamples(paragraphs.length, positives.length);
    if (short) return short;
    // Paragraphs are an order of magnitude scarcer than sentences, so the
    // opportunity floor applies rather than the sentence one.
    if (paragraphs.length < MIN_OPPORTUNITIES) {
      return gap(
        'TOO_FEW_OBSERVATIONS',
        paragraphs.length,
        positives.length,
        sampleCount
      );
    }
    if (positives.length === 1) {
      return gap(
        'TOO_FEW_POSITIVE',
        paragraphs.length,
        positives.length,
        sampleCount
      );
    }
    const perSample = contributing.map((analysis) =>
      analysis.paragraphs.length === 0
        ? 0
        : (100 * analysis.paragraphs.filter((one) => one.isList).length) /
          analysis.paragraphs.length
    );
    const example = positives[0] ?? null;
    return value(
      'listParagraphs',
      (100 * positives.length) / paragraphs.length,
      corridor(perSample),
      paragraphs.length,
      sampleCount,
      example
        ? { code: example.code, text: example.lines[0] ?? example.text }
        : null
    );
  });

  // 7 — "we" against the organisation named from outside. Counted over word
  // occurrences, and quoted speech is excluded from both halves: someone else
  // saying "компания" is not this writer's habit.
  result.firstPerson = guarded('firstPerson', () => {
    const absent = missingDictionary('firstPerson', pack);
    if (absent) return absent;
    let ours = 0;
    let theirs = 0;
    const perSample: number[] = [];
    let example: { code: string; text: string } | null = null;

    for (const analysis of contributing) {
      let sampleOurs = 0;
      let sampleTheirs = 0;
      for (const sentence of analysis.sentences) {
        const bare = stripQuotes(sentence.text);
        const mine = countFrom(bare, [...pack.firstPerson]);
        const named = countFrom(bare, pack.institutional);
        sampleOurs += mine;
        sampleTheirs += named;
        if (!example && mine > 0) {
          example = { code: analysis.code, text: sentence.text };
        }
      }
      ours += sampleOurs;
      theirs += sampleTheirs;
      const total = sampleOurs + sampleTheirs;
      perSample.push(total > 0 ? (100 * sampleOurs) / total : 0);
    }

    const pool = ours + theirs;
    const short = tooFewSamples(pool, ours);
    if (short) return short;
    if (pool < MIN_OPPORTUNITIES) {
      return gap('TOO_FEW_OBSERVATIONS', pool, ours, sampleCount);
    }
    return value(
      'firstPerson',
      (100 * ours) / pool,
      corridor(perSample),
      pool,
      sampleCount,
      example
    );
  });

  // 8 — clerical nouns. The research prefers a nominalisation-to-verb ratio;
  // that needs a morphological parser, which this product deliberately does
  // not run, so the share of sentences carrying at least one stands in. The
  // substitution is recorded in the specification as a deduction.
  result.nominalisation = guarded('nominalisation', () => {
    const absent = missingDictionary('nominalisation', pack);
    if (absent) return absent;
    const isClerical = (word: string) =>
      word.length >= 7 &&
      !pack.nominalisationExceptions.has(word) &&
      pack.nominalisationSuffixes.some((suffix) => word.endsWith(suffix));

    const positives = allSentences.filter((sentence) =>
      words(sentence.text.toLowerCase()).some(isClerical)
    );
    const short = tooFewSamples(allSentences.length, positives.length);
    if (short) return short;
    if (allSentences.length < MIN_OBSERVATIONS) {
      return gap(
        'TOO_FEW_OBSERVATIONS',
        allSentences.length,
        positives.length,
        sampleCount
      );
    }
    const perSample = contributing.map((analysis) =>
      analysis.sentences.length === 0
        ? 0
        : (100 *
            analysis.sentences.filter((sentence) =>
              words(sentence.text.toLowerCase()).some(isClerical)
            ).length) /
          analysis.sentences.length
    );
    const example = positives[0] ?? null;
    return value(
      'nominalisation',
      (100 * positives.length) / allSentences.length,
      corridor(perSample),
      allSentences.length,
      sampleCount,
      example ? { code: example.code, text: example.text } : null
    );
  });

  // Order the eight the way the design lists them, so a caller that iterates
  // gets the screen's order without sorting.
  return Object.fromEntries(
    STYLE_SCALE_KEYS.filter((key) => key in result).map((key) => [
      key,
      result[key]!,
    ])
  );
}

export { SHORT_SENTENCE_WORDS, DOMAIN as STYLE_SCALE_DOMAIN, hasCopula };

/**
 * The eight scales for one text, without the sufficiency floors.
 *
 * The floors in `computeStyleScales` answer a different question: is this a
 * settled habit of this writer? Four questions in a corpus cannot say. But
 * checking a single finished text asks where *that text* sits, and applying
 * habit-floors to it would report nothing for every output shorter than a
 * corpus — which is every output.
 *
 * So this returns values with no gaps and no corridors. The corridors belong
 * to the author and come from the measurement being compared against.
 */
export function measureSingleText(
  text: string,
  pack: LocalePack
): Partial<Record<StyleScaleKey, number>> {
  const sentences = splitSentences(text, pack);
  const paragraphs = splitParagraphs(text);
  if (sentences.length === 0) return {};

  const lengths = sentences.map((sentence) => sentence.words);
  const mean = lengths.reduce((sum, one) => sum + one, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, one) => sum + (one - mean) ** 2, 0) / lengths.length;

  const share = (hit: number, pool: number) => (pool === 0 ? 0 : (100 * hit) / pool);

  const dashes = sentences.filter((sentence) => hasSpacedDash(sentence.text));
  const copulas = sentences.filter(
    (sentence) =>
      !hasSpacedDash(sentence.text) && hasCopula(sentence.text, pack)
  );

  let ours = 0;
  let theirs = 0;
  for (const sentence of sentences) {
    const bare = stripQuotes(sentence.text);
    ours += countFrom(bare, [...pack.firstPerson]);
    theirs += countFrom(bare, pack.institutional);
  }

  const isClerical = (word: string) =>
    word.length >= 7 &&
    !pack.nominalisationExceptions.has(word) &&
    pack.nominalisationSuffixes.some((suffix) => word.endsWith(suffix));

  const result: Partial<Record<StyleScaleKey, number>> = {
    sentenceLength: round1(mean),
    sentenceSpread: round1(
      mean > 0 ? clamp((Math.sqrt(variance) / mean) * 100, 0, 100) : 0
    ),
    shortSentences: round1(
      share(
        sentences.filter((one) => one.words < SHORT_SENTENCE_WORDS).length,
        sentences.length
      )
    ),
    questions: round1(
      share(
        sentences.filter((one) => /\?\s*$/.test(one.text)).length,
        sentences.length
      )
    ),
    nominalisation: round1(
      share(
        sentences.filter((one) =>
          words(one.text.toLowerCase()).some(isClerical)
        ).length,
        sentences.length
      )
    ),
  };

  if (paragraphs.length > 0) {
    result.listParagraphs = round1(
      share(paragraphs.filter((one) => one.isList).length, paragraphs.length)
    );
  }
  // The opportunity-based scales stay absent when the text offered no
  // opportunity: a share of nothing is not zero, it is unmeasured.
  if (dashes.length + copulas.length > 0) {
    result.dashCopula = round1(
      share(dashes.length, dashes.length + copulas.length)
    );
  }
  if (ours + theirs > 0) {
    result.firstPerson = round1(share(ours, ours + theirs));
  }

  return result;
}
