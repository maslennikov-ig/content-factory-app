import type { LocalePack } from './locale-pack';
import { words } from './segment';

/**
 * Whether a text was written by this person — one number, not eight.
 *
 * The eight scales answer a different question. They say *what* a habit is:
 * how long the phrases run, how often a dash stands in for a copula. Measured
 * on a real channel on 2026-08-24 they turned out not to say *whose* the text
 * is: the owner's held-out posts and somebody else's Russian technical
 * documentation landed inside his corridors at rates a few points apart, which
 * is not a ruler, it is a coin. The scales stay, as the explanation of what
 * diverged; this file is the ruler beside them.
 *
 * The method is the oldest one there is and the most cited: Burrows's Delta
 * over function-word frequencies. Mosteller & Wallace settled the Federalist
 * Papers with it; Stamatatos's survey and the 2023 representation-generalisation
 * review both rate function words four-star — discriminative, frequent, widely
 * dispersed, content independent. That last property is the one being bought
 * here. A topic-dependent feature would tell us the owner writes about
 * releases and the control text is about interfaces, which we already know and
 * which says nothing about who held the pen.
 *
 * Delta, not a learned embedding. No style-embedding model covers Russian
 * except two multilingual ones whose licences are unverified for AGPL, and the
 * check has to run for a workspace with no AI key and no quota left — the same
 * constraint that made the eight scales deterministic in the first place.
 *
 * The reasoning and the sources are `docs/research/writer-voice-style-transfer-2026-08-22.md`
 * §1 and §4; the numbers this scored on the owner's corpus are in
 * `docs/product/brand-voice-from-samples-spec.md` §3.8.
 */

/** Moves when the arithmetic here changes, independently of the analyser. */
export const FUNCTION_WORD_MEASURE_VERSION = 'function-words/1.0.0';

/**
 * Frequencies are per thousand words.
 *
 * A share would work as well and read worse: `в` is about 40 per thousand in
 * ordinary Russian, and 0.04 is a number nobody can sanity-check by eye.
 */
export const FREQUENCY_BASE = 1000;

/**
 * A term counts towards the distance only if the author used it in at least
 * this many training samples.
 *
 * Without a floor, a word used once in the whole corpus gets a deviation
 * barely above zero, and any text that happens to use it twice scores a
 * z-score in the hundreds — one rare word decides the verdict. Three is the
 * smallest floor that makes the deviation an estimate of anything rather than
 * an artefact of a single sample.
 */
export const MIN_TERM_SAMPLES = 3;

/**
 * Below this a text has no measurable frequency profile.
 *
 * Fifty words is four or five sentences. At that length a single `не` moves
 * the rate by twenty per thousand, which is larger than the whole spread the
 * profile was built from, so the distance would be measuring the coin flip and
 * not the writer. The check says so rather than returning a number.
 */
export const MIN_TEXT_WORDS = 50;

/** The author's own spread, and where their own writing stops looking like them. */
export const SELF_DISTANCE_PERCENTILE = 0.95;

export type FunctionWordProfile = {
  measureVersion: string;
  localePackVersion: string;
  /** The terms that survived `MIN_TERM_SAMPLES`, in the pack's order. */
  terms: string[];
  /** Mean rate per thousand words, per surviving term. */
  mean: number[];
  /** Spread of that rate across the author's own samples. Never zero. */
  deviation: number[];
  sampleCount: number;
  /**
   * How far this author's own texts sit from their own centre: the median for
   * the screen to show, and the 95th percentile as the line past which a text
   * stops reading like them.
   *
   * Both are leave-one-out. Measuring a sample against a profile that contains
   * it flatters the profile, and a threshold calibrated on flattered distances
   * is tighter than the truth — the check would then call the author's own next
   * post a stranger's.
   */
  selfMedian: number;
  threshold: number;
};

/** One shape, nullable halves: see the note on `NgramDistance` for why. */
export type FunctionWordDistance = {
  measured: boolean;
  distance: number | null;
  reason: 'TOO_SHORT' | 'NO_PROFILE' | 'NO_DICTIONARY' | null;
  wordCount: number;
  /** How many of the profile's terms the distance was averaged over. */
  terms: number;
};

/** `ё` folds to `е`: one term, not two half-counted ones. */
const fold = (word: string): string => word.replace(/ё/g, 'е');

/**
 * Rate per thousand words for every term in the pack, and the text's length.
 *
 * Exported because the same counting has to happen on both sides — a profile
 * built one way and a text measured another is a distance between two
 * different units.
 */
export function functionWordRates(
  text: string,
  pack: LocalePack
): { rates: Map<string, number>; wordCount: number } {
  const tokens = words(text.toLowerCase()).map(fold);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (!counts.has(token)) counts.set(token, 0);
    counts.set(token, counts.get(token)! + 1);
  }
  const rates = new Map<string, number>();
  for (const term of pack.functionWords) {
    const count = counts.get(term) ?? 0;
    rates.set(
      term,
      tokens.length === 0 ? 0 : (FREQUENCY_BASE * count) / tokens.length
    );
  }
  return { rates, wordCount: tokens.length };
}

const percentileOf = (sorted: number[], fraction: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1)
  );
  return sorted[rank];
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The floor under a term's deviation, as a fraction of its mean rate.
 *
 * A term the author uses at a near-constant rate has a deviation close to
 * zero, and dividing by it turns a rounding difference into a large z-score.
 * Ten per cent of the mean is the smallest spread this treats as real. It is a
 * choice, not a published constant, and it is the only tuning parameter here.
 */
const DEVIATION_FLOOR_SHARE = 0.1;

/**
 * The author's profile: what rate they use each service word at, and how much
 * that rate moves between their own texts.
 *
 * Built on the training part only, like the corridors — the held-out part
 * exists to check the measure against writing the profile never saw, and a
 * threshold calibrated on the whole corpus could not be checked against
 * anything.
 */
export function buildFunctionWordProfile(
  samples: readonly { text: string }[],
  pack: LocalePack
): FunctionWordProfile | null {
  if (pack.functionWords.length === 0) return null;
  const usable = samples.filter(
    (sample) => words(sample.text).length >= MIN_TEXT_WORDS
  );
  if (usable.length < MIN_TERM_SAMPLES) return null;

  const vectors = usable.map(
    (sample) => functionWordRates(sample.text, pack).rates
  );

  const terms: string[] = [];
  const mean: number[] = [];
  const deviation: number[] = [];
  // Kept per surviving term so the leave-one-out pass below can subtract one
  // sample without walking the corpus again.
  const sums: number[] = [];
  const squares: number[] = [];

  for (const term of pack.functionWords) {
    const rates = vectors.map((vector) => vector.get(term) ?? 0);
    const present = rates.filter((rate) => rate > 0).length;
    if (present < MIN_TERM_SAMPLES) continue;
    const sum = rates.reduce((total, rate) => total + rate, 0);
    const square = rates.reduce((total, rate) => total + rate * rate, 0);
    const average = sum / rates.length;
    const spread = Math.sqrt(Math.max(0, square / rates.length - average * average));
    terms.push(term);
    mean.push(average);
    deviation.push(Math.max(spread, average * DEVIATION_FLOOR_SHARE));
    sums.push(sum);
    squares.push(square);
  }

  if (terms.length === 0) return null;

  const count = vectors.length;
  const selfDistances: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (count < 2) break;
    let total = 0;
    let used = 0;
    for (let term = 0; term < terms.length; term += 1) {
      const rate = vectors[index].get(terms[term]) ?? 0;
      const otherMean = (sums[term] - rate) / (count - 1);
      const otherSquare = (squares[term] - rate * rate) / (count - 1);
      const otherSpread = Math.max(
        Math.sqrt(Math.max(0, otherSquare - otherMean * otherMean)),
        otherMean * DEVIATION_FLOOR_SHARE
      );
      if (otherSpread <= 0) continue;
      total += Math.abs((rate - otherMean) / otherSpread);
      used += 1;
    }
    if (used > 0) selfDistances.push(total / used);
  }

  const sorted = [...selfDistances].sort((left, right) => left - right);

  return {
    measureVersion: FUNCTION_WORD_MEASURE_VERSION,
    localePackVersion: pack.version,
    terms,
    mean: mean.map(round3),
    deviation: deviation.map(round3),
    sampleCount: count,
    selfMedian: round3(percentileOf(sorted, 0.5)),
    threshold: round3(percentileOf(sorted, SELF_DISTANCE_PERCENTILE)),
  };
}

/**
 * How far one text sits from this author's centre.
 *
 * Burrows's Delta: the mean absolute z-score across the profile's terms, where
 * the z-score is taken against the author's own mean and spread. The profile's
 * own centre is zero by construction, so the general form — mean |z_a − z_b| —
 * collapses to this.
 */
export function functionWordDistance(
  text: string,
  profile: FunctionWordProfile | null | undefined,
  pack: LocalePack
): FunctionWordDistance {
  const { rates, wordCount } = functionWordRates(text, pack);
  const absent = (
    reason: 'TOO_SHORT' | 'NO_PROFILE' | 'NO_DICTIONARY'
  ): FunctionWordDistance => ({
    measured: false,
    distance: null,
    reason,
    wordCount,
    terms: 0,
  });
  // Told apart from `NO_PROFILE` on purpose: one says this corpus was too
  // small to build a profile, the other says the product has no word list for
  // this language at all. They call for different things — more posts, or a
  // dictionary — and merging them would ask a person for posts that cannot help.
  if (pack.functionWords.length === 0) return absent('NO_DICTIONARY');
  if (!profile || profile.terms.length === 0) return absent('NO_PROFILE');
  if (wordCount < MIN_TEXT_WORDS) return absent('TOO_SHORT');

  let total = 0;
  let used = 0;
  for (let index = 0; index < profile.terms.length; index += 1) {
    const spread = profile.deviation[index];
    if (!spread || spread <= 0) continue;
    const rate = rates.get(profile.terms[index]) ?? 0;
    total += Math.abs((rate - profile.mean[index]) / spread);
    used += 1;
  }
  if (used === 0) return absent('NO_PROFILE');

  return {
    measured: true,
    distance: round3(total / used),
    reason: null,
    wordCount,
    terms: used,
  };
}

/**
 * The terms that pulled a text away from its author, largest first.
 *
 * The distance alone says "not you" and nothing a person can act on. This says
 * which service words were used at a rate the author does not use them at,
 * which is the same shape of answer the eight scales give — and the input the
 * sentence-level repair needs to point somewhere.
 */
export function functionWordOutliers(
  text: string,
  profile: FunctionWordProfile | null | undefined,
  pack: LocalePack,
  limit = 5
): Array<{ term: string; rate: number; expected: number; z: number }> {
  if (!profile) return [];
  const { rates, wordCount } = functionWordRates(text, pack);
  if (wordCount < MIN_TEXT_WORDS) return [];

  const scored = profile.terms.map((term, index) => {
    const rate = rates.get(term) ?? 0;
    const spread = profile.deviation[index] || 1;
    return {
      term,
      rate: round3(rate),
      expected: profile.mean[index],
      z: round3((rate - profile.mean[index]) / spread),
    };
  });

  return scored
    .sort((left, right) => Math.abs(right.z) - Math.abs(left.z))
    .slice(0, limit);
}
