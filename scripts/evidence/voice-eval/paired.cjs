'use strict';

/**
 * The paired half of the ruler: same topic, same run, different variants.
 *
 * The stand hands every variant the same eight topics, so the samples are
 * paired by construction — and comparing means throws that pairing away. What
 * it throws away is most of the signal: the spread between topics is larger
 * than the spread between variants, so it lands in the noise term of an
 * unpaired comparison and hides the very difference the epic is trying to see.
 *
 * The numbers that make this the first task of the wave: the gap being moved is
 * 0.051 (0.637 without the voice against 0.586 for the author), while two
 * *identical* variants in one run came apart by 0.028, and still by 0.012 when
 * two runs were pooled. Until the noise is separated from the difference,
 * "the voice does nothing" and "we cannot see what it does" are the same
 * sentence.
 *
 * Nothing here calls a model, and nothing here is random in the sense that
 * matters: the bootstrap draws from a seeded generator, so re-running the
 * measurement on the same generations returns the same interval to the last
 * digit. An interval that moves when nobody changed anything is an interval
 * nobody can argue with.
 */

const DEFAULT_ITERATIONS = 10000;
const DEFAULT_SEED = 20260825;

/**
 * Small, fast, and — the only property this file needs — deterministic.
 *
 * `Math.random` would make two measurements of one run disagree in the third
 * digit, and this epic argues about the third digit.
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Percentile of an already-sorted list, linear interpolation between ranks. */
const percentileOf = (sorted, share) => {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * share;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
};

/**
 * The pairs themselves.
 *
 * A pair is one topic in one run, measured under two variants. Pairing across
 * runs would compare texts the model wrote on different days from different
 * random seeds and call the difference a variant effect.
 *
 * @param baseline rows of `{topicId, runId, distance}` for the reference variant
 * @param variant the same shape for the variant being judged
 */
function pairedDifferences(baseline, variant) {
  const key = (row) => `${row.runId ?? 'single'}::${row.topicId}`;
  const left = new Map();
  for (const row of baseline) {
    if (row.distance === null || row.distance === undefined) continue;
    left.set(key(row), row);
  }
  const pairs = [];
  for (const row of variant) {
    if (row.distance === null || row.distance === undefined) continue;
    const other = left.get(key(row));
    if (!other) continue;
    pairs.push({
      topicId: row.topicId,
      runId: row.runId ?? null,
      baseline: other.distance,
      variant: row.distance,
      // Positive means the variant sits closer to the author than the baseline.
      difference: other.distance - row.distance,
    });
  }
  return pairs;
}

/**
 * Bootstrap that resamples topics, not generations.
 *
 * Both answers of the research say the same thing about this and say it as a
 * requirement: cluster by author and by brief, never by generation. Eight
 * topics generated five times each are not forty independent observations —
 * they are eight, sampled five times. Resampling the forty rows directly would
 * shrink the interval by a factor of about the square root of five and report
 * a confidence nobody earned.
 *
 * @param clusters map from cluster key to the rows drawn together
 * @param statistic called with a flat array of resampled rows
 */
function clusteredBootstrap(clusters, statistic, options = {}) {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const random = mulberry32(options.seed ?? DEFAULT_SEED);
  const keys = [...clusters.keys()];
  if (!keys.length) return { point: null, low: null, high: null, samples: 0 };

  const point = statistic(keys.flatMap((one) => clusters.get(one)));
  const drawn = [];
  for (let round = 0; round < iterations; round += 1) {
    const rows = [];
    for (let pick = 0; pick < keys.length; pick += 1) {
      const chosen = keys[Math.floor(random() * keys.length)];
      rows.push(...clusters.get(chosen));
    }
    const value = statistic(rows);
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      drawn.push(value);
    }
  }
  drawn.sort((a, b) => a - b);
  return {
    point,
    low: percentileOf(drawn, 0.025),
    high: percentileOf(drawn, 0.975),
    samples: drawn.length,
  };
}

const clusterByTopic = (rows) => {
  const clusters = new Map();
  for (const row of rows) {
    if (!clusters.has(row.topicId)) clusters.set(row.topicId, []);
    clusters.get(row.topicId).push(row);
  }
  return clusters;
};

/**
 * One variant against the baseline: the median paired difference and what the
 * interval says about zero.
 */
function pairedComparison(baseline, variant, options = {}) {
  const pairs = pairedDifferences(baseline, variant);
  if (!pairs.length) {
    return { pairs: 0, topics: 0, median: null, low: null, high: null, coversZero: null };
  }
  const interval = clusteredBootstrap(
    clusterByTopic(pairs),
    (rows) => median(rows.map((one) => one.difference)),
    options
  );
  return {
    pairs: pairs.length,
    topics: clusterByTopic(pairs).size,
    median: interval.point,
    low: interval.low,
    high: interval.high,
    coversZero:
      interval.low === null || interval.high === null
        ? null
        : interval.low <= 0 && interval.high >= 0,
  };
}

/**
 * The share of the gap the variant closed, computed on paired differences.
 *
 * ```
 * (d_baseline − d_variant) / (d_baseline − d_author)
 * ```
 *
 * The numerator is the median paired difference — the pairing survives into
 * the acceptance number instead of being averaged away. The denominator is the
 * distance the baseline has to travel to reach the author at all, and it is
 * resampled too: an interval that treats the author's side as a fixed constant
 * claims to know it exactly, and 45 held-out posts do not know anything
 * exactly.
 *
 * Negative is a real answer and is reported as such. It means the variant sits
 * further from the author than the baseline does.
 */
function closedGapShare(baseline, variant, authorDistances, options = {}) {
  const pairs = pairedDifferences(baseline, variant);
  const baselineMedian = median(
    baseline.map((one) => one.distance).filter((one) => one !== null)
  );
  const authorMedian = median(authorDistances);
  if (!pairs.length || baselineMedian === null || authorMedian === null) {
    return { value: null, low: null, high: null, coversZero: null, gap: null };
  }
  const gap = baselineMedian - authorMedian;
  if (!gap) {
    return { value: null, low: null, high: null, coversZero: null, gap: 0 };
  }

  const random = mulberry32((options.seed ?? DEFAULT_SEED) + 1);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const clusters = clusterByTopic(pairs);
  const topics = [...clusters.keys()];
  const baselineByTopic = clusterByTopic(
    baseline.filter((one) => one.distance !== null)
  );

  const point = median(pairs.map((one) => one.difference)) / gap;
  const drawn = [];
  for (let round = 0; round < iterations; round += 1) {
    const differences = [];
    const baselineDraw = [];
    for (let pick = 0; pick < topics.length; pick += 1) {
      const chosen = topics[Math.floor(random() * topics.length)];
      clusters.get(chosen).forEach((one) => differences.push(one.difference));
      (baselineByTopic.get(chosen) ?? []).forEach((one) =>
        baselineDraw.push(one.distance)
      );
    }
    const authorDraw = [];
    for (let pick = 0; pick < authorDistances.length; pick += 1) {
      authorDraw.push(
        authorDistances[Math.floor(random() * authorDistances.length)]
      );
    }
    const drawnGap = median(baselineDraw) - median(authorDraw);
    if (!drawnGap) continue;
    const value = median(differences) / drawnGap;
    if (Number.isFinite(value)) drawn.push(value);
  }
  drawn.sort((a, b) => a - b);
  const low = percentileOf(drawn, 0.025);
  const high = percentileOf(drawn, 0.975);
  return {
    value: point,
    low,
    high,
    coversZero: low === null || high === null ? null : low <= 0 && high >= 0,
    gap,
    baselineMedian,
    authorMedian,
  };
}

module.exports = {
  mulberry32,
  median,
  percentileOf,
  pairedDifferences,
  clusteredBootstrap,
  clusterByTopic,
  pairedComparison,
  closedGapShare,
  DEFAULT_ITERATIONS,
  DEFAULT_SEED,
};
