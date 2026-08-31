'use strict';

/**
 * The paired procedure of the measurement stand.
 *
 * The stand hands every variant the same eight topics, and until this file the
 * report compared means of independent samples — which throws the pairing away
 * and hides the difference under the spread between topics. The numbers that
 * made it matter: the gap being moved is 0.051, and two identical variants in
 * one run came apart by 0.028.
 *
 * The fixtures are synthetic on purpose. They cannot prove anything about the
 * owner's corpus and are not asked to; they prove that the arithmetic does
 * what the task says — that the pairing survives, that the interval is drawn
 * over topics rather than over generations, that the same input returns the
 * same interval, and that a negative share comes back negative instead of
 * being tidied up into zero.
 */

const {
  pairedDifferences,
  pairedComparison,
  closedGapShare,
  clusteredBootstrap,
  clusterByTopic,
} = require('../scripts/evidence/voice-eval/paired.cjs');

const TOPICS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
const RUNS = ['a', 'b', 'c', 'd', 'e'];

/**
 * A corpus where topics differ a lot and the variant effect is small and
 * constant — the exact shape the stand meets and the exact shape an unpaired
 * comparison cannot see.
 */
const build = (offset, jitter = 0) => {
  const rows = [];
  TOPICS.forEach((topicId, topicIndex) => {
    RUNS.forEach((runId, runIndex) => {
      const topicLevel = 0.55 + topicIndex * 0.02;
      const runWobble = ((runIndex % 3) - 1) * jitter;
      rows.push({
        topicId,
        runId,
        distance: topicLevel + runWobble + offset,
      });
    });
  });
  return rows;
};

describe('парные разности', () => {
  it('соединяет только одну и ту же тему в одном и том же прогоне', () => {
    const baseline = build(0);
    const variant = build(-0.01);
    const pairs = pairedDifferences(baseline, variant);

    expect(pairs).toHaveLength(TOPICS.length * RUNS.length);
    pairs.forEach((pair) => {
      expect(pair.difference).toBeCloseTo(0.01, 10);
    });
  });

  it('пропускает генерацию, которой нет пары', () => {
    const baseline = build(0).filter((row) => row.topicId !== 't1');
    const variant = build(-0.01);
    const pairs = pairedDifferences(baseline, variant);

    expect(pairs).toHaveLength((TOPICS.length - 1) * RUNS.length);
    expect(pairs.some((pair) => pair.topicId === 't1')).toBe(false);
  });

  it('не считает парой две генерации на одну тему из разных прогонов', () => {
    const baseline = build(0).filter((row) => row.runId === 'a');
    const variant = build(-0.01).filter((row) => row.runId === 'b');

    expect(pairedDifferences(baseline, variant)).toHaveLength(0);
  });
});

describe('парное сравнение против базовой линии', () => {
  it('видит постоянный сдвиг, который среднее топит в разбросе тем', () => {
    const baseline = build(0);
    const variant = build(-0.01);
    const result = pairedComparison(baseline, variant);

    expect(result.pairs).toBe(40);
    expect(result.topics).toBe(8);
    expect(result.median).toBeCloseTo(0.01, 10);
    expect(result.coversZero).toBe(false);
  });

  it('базовая линия против себя даёт ноль нулевой ширины', () => {
    const baseline = build(0);
    const result = pairedComparison(baseline, baseline);

    expect(result.median).toBe(0);
    expect(result.low).toBe(0);
    expect(result.high).toBe(0);
    expect(result.coversZero).toBe(true);
  });

  it('накрывает ноль, когда варианты различает только шум', () => {
    const baseline = build(0, 0.02);
    const variant = build(0, 0.02).map((row, index) => ({
      ...row,
      distance: row.distance + (index % 2 ? 0.015 : -0.015),
    }));
    const result = pairedComparison(baseline, variant);

    expect(result.coversZero).toBe(true);
  });

  it('возвращает то же число при повторном счёте', () => {
    const baseline = build(0, 0.01);
    const variant = build(-0.008, 0.01);

    expect(pairedComparison(baseline, variant)).toEqual(
      pairedComparison(baseline, variant)
    );
  });
});

describe('бутстрап кластеризуется по теме, а не по генерации', () => {
  /**
   * Восемь тем, снятых пять раз, — это восемь наблюдений, а не сорок.
   * Ресемпл сорока строк напрямую сузил бы интервал примерно в корень из пяти
   * и объявил бы уверенность, которой никто не покупал.
   */
  it('интервал по темам шире, чем интервал по отдельным генерациям', () => {
    const rows = build(0, 0.03);
    const statistic = (drawn) =>
      drawn.reduce((sum, one) => sum + one.distance, 0) / drawn.length;

    const byTopic = clusteredBootstrap(clusterByTopic(rows), statistic);
    const byGeneration = clusteredBootstrap(
      new Map(rows.map((row, index) => [index, [row]])),
      statistic
    );

    const width = (one) => one.high - one.low;
    expect(width(byTopic)).toBeGreaterThan(width(byGeneration));
  });
});

describe('доля закрытого разрыва', () => {
  const author = Array.from({ length: 45 }, (_, index) => 0.5 + index * 0.001);

  it('половина пройденного пути читается как половина', () => {
    // Автор на медиане 0.522, базовая линия на 0.67: разрыв 0.148.
    const baseline = build(0.05);
    const variant = build(0.05 - 0.074);
    const share = closedGapShare(baseline, variant, author);

    expect(share.gap).toBeCloseTo(0.148, 3);
    expect(share.value).toBeCloseTo(0.5, 1);
  });

  it('отрицательная доля возвращается отрицательной', () => {
    const baseline = build(0.05);
    const variant = build(0.06);
    const share = closedGapShare(baseline, variant, author);

    expect(share.value).toBeLessThan(0);
  });

  it('интервал считает и сторону автора, а не только сторону генерации', () => {
    const baseline = build(0.05);
    const variant = build(0.05 - 0.074);
    const narrow = closedGapShare(baseline, variant, [0.522, 0.522, 0.522]);
    const wide = closedGapShare(
      baseline,
      variant,
      Array.from({ length: 45 }, (_, index) => 0.4 + index * 0.006)
    );

    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
  });

  it('молчит, когда пар нет', () => {
    const share = closedGapShare([], build(0), author);
    expect(share.value).toBeNull();
  });
});
