'use strict';

/**
 * The stand reports the cut and the full length side by side.
 *
 * The cut is what makes the comparison about manner instead of about length:
 * a 2700-character generation has more windows, its n-gram histogram is
 * smoother, and every distance shrinks. That is also what the cut hides — the
 * product writes three times longer than the author, and length is one of the
 * loudest habits a person has.
 *
 * Both answers of the research asked for the same thing and for the same
 * reason: report both numbers while the transition runs, so nobody has to
 * guess whether a gain was the voice or the scissors. On the owner's five runs
 * the answer turned out to matter — at full length the generation sits *closer*
 * to the print than the author's own posts do.
 */

const { buildRuler } = require('../scripts/evidence/voice-eval/ruler.cjs');
const { measure } = require('../scripts/evidence/voice-eval/measure.cjs');

/** Twelve short posts in one manner: enough for the analyser to build a print. */
const SAMPLES = Array.from({ length: 12 }, (_, index) => ({
  contentHash: `hash-${index}`,
  text:
    `Сел разбирать очередной прогон, и вот что вышло. Взял ${index + 3} замера ` +
    'и посчитал руками, потому что глазами такое не ловится. Вышло хуже, чем ' +
    'я ждал: цифра не держится между прогонами. Записал, чтобы не забыть. ' +
    'Ты бы тоже записал, если бы два раза подряд поверил своей же памяти. ' +
    'Дальше буду мерить только парами, иначе это гадание, а не работа.',
}));

/** One long generation and one short, so the crop has something to cut. */
const LONG = `${SAMPLES[0].text} `.repeat(6).trim();
const SHORT = SAMPLES[1].text.slice(0, 400);

const generationsOf = () =>
  ['none', 'product'].flatMap((variantId) =>
    ['t1', 't2', 't3', 't4'].map((topicId, index) => ({
      variantId,
      topicId,
      runId: 'r1',
      text: index % 2 ? LONG : SHORT,
    }))
  );

const pulled = {
  corpus: { name: 'fixture', label: 'вымышленный', language: 'ru' },
  samples: SAMPLES,
};

describe('линейка отдаёт оба чтения одного текста', () => {
  const ruler = buildRuler(SAMPLES, 'ru');

  it('обрезанное и полное расстояние — разные числа', () => {
    const measured = ruler.measure(LONG, 400);

    expect(measured.distance).not.toBeNull();
    expect(measured.full.distance).not.toBeNull();
    expect(measured.full.distance).not.toBe(measured.distance);
  });

  it('на тексте короче обрезки оба числа совпадают', () => {
    const measured = ruler.measure(SHORT, 4000);

    expect(measured.full.distance).toBe(measured.distance);
  });

  it('сырая длина остаётся сырой, а измеренная — обрезанной', () => {
    const measured = ruler.measure(LONG, 400);

    expect(measured.rawLength).toBe(LONG.length);
    expect(measured.measuredLength).toBe(400);
  });
});

describe('отчёт несёт три числа на вариант', () => {
  // Обрезка короче постов автора: иначе его сторона не режется и оба числа
  // совпадают по построению, а тест ничего не проверяет.
  const report = measure({ pulled, generations: generationsOf(), cut: 200 });

  it('расстояние на обрезке, расстояние на полной длине и медианная длина', () => {
    report.variants.forEach((variant) => {
      expect(variant.distance).not.toBeNull();
      expect(variant.distanceFull).not.toBeNull();
      expect(variant.medianLength).toBeGreaterThan(0);
    });
  });

  it('сторона автора тоже названа на полной длине и своей длиной', () => {
    expect(report.author.allMeanFull).not.toBeNull();
    expect(report.author.allMeanFull).not.toBe(report.author.allMean);
    expect(report.author.medianLength).toBe(SAMPLES[0].text.length);
  });

  it('медианная длина варианта считается по сырым текстам, а не по обрезке', () => {
    const variant = report.variants.find((one) => one.id === 'none');

    expect(variant.medianLength).toBeGreaterThan(200);
    expect(variant.medianLength).toBe((LONG.length + SHORT.length) / 2);
  });
});
