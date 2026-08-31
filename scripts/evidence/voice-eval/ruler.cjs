'use strict';

/**
 * The ruler from `content-factory-next-e3y.1`, called through the shipped
 * modules rather than reimplemented here.
 *
 * Reimplementing it would mean the stand and the product could drift apart
 * silently, and the stand exists precisely so that nobody judges a voice
 * change by eye. Every number below comes out of `analyzer.ts`,
 * `voiceprint.ts` and `voice-retention.ts` as they are on disk.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests/helpers/load-tsx.cjs'
));

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const analyzer = loadTypeScriptModule(`${BASE}/analyzer.ts`);
const voiceprint = loadTypeScriptModule(`${BASE}/voiceprint.ts`);
const retention = loadTypeScriptModule(`${BASE}/voice-retention.ts`);
const { impostorsFor } = loadTypeScriptModule(`${BASE}/impostor-sets.ts`);
const { calibrate } = loadTypeScriptModule(`${BASE}/voice-calibration.ts`);
const { buildLineup, splitForeign } = loadTypeScriptModule(`${BASE}/lineup.ts`);
const packs = {
  ru: loadTypeScriptModule(`${BASE}/locale-pack.ru.ts`).RU_LOCALE_PACK,
};

const mean = (list) =>
  list.length ? list.reduce((sum, one) => sum + one, 0) / list.length : null;

const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Comparable length, applied to both sides before anything is measured.
 *
 * Without it a 2500-character generation sits closer to the middle of the
 * author's profile than his own 823-character post, and the reason is
 * averaging rather than likeness: a longer text has more windows, so its
 * n-gram histogram is smoother and every distance shrinks. The cut is a
 * property of the run and is recorded with the numbers.
 */
const cutTo = (text, cut) => (cut ? text.slice(0, cut) : text);

/**
 * The default cut for a corpus: the author's own median length.
 *
 * A fixed 800 would be a number calibrated on one author, which is the exact
 * mistake the epic was opened over. The clamp keeps a corpus of one-line notes
 * or of essays from making the cut meaningless; both ends are recorded so a
 * run that hit them says so.
 */
const CUT_FLOOR = 400;
const CUT_CEILING = 1500;

const defaultCut = (texts) => {
  const middle = median(texts.map((one) => one.length)) ?? CUT_FLOOR;
  return Math.min(CUT_CEILING, Math.max(CUT_FLOOR, Math.round(middle)));
};

/**
 * Builds the author's print exactly the way the product builds it.
 *
 * The analyser decides the training/holdout split itself, by content hash, so
 * the stand does not get to choose which posts flatter it.
 *
 * @param options.impostors the lineup to judge with, when the caller has one.
 *   The shipped set is the default and stays reachable, because it is what the
 *   product still does and a run that cannot show the old number cannot show
 *   that the new one is better. `impostor-pool.cjs` explains what changed and
 *   what it cost.
 */
function buildRuler(samples, language, options = {}) {
  const pack = packs[language];
  if (!pack) {
    throw new Error(
      `no locale pack for "${language}"; content-factory-next-pl1.11 is the task that adds one`
    );
  }
  /**
   * Шеренга строится позже отпечатка: она выравнивается по его окнам.
   *
   * Поэтому здесь только запомнили, из чего её строить, а сама она собирается
   * ниже — тем же `buildLineup`, каким собирает продукт. Второй реализации у
   * стенда нет намеренно: он существует ровно затем, чтобы судить тем же.
   */
  let impostors = options.impostors ?? null;
  const inputs = samples.map((row, index) => ({
    code: `smp-${String(index + 1).padStart(3, '0')}`,
    text: row.text,
    language,
    contentHash: row.contentHash,
  }));
  const measurement = analyzer.analyzeBrandVoice(inputs, { language });
  const holdoutCodes = new Set(
    inputs
      .filter((one) => measurement.split[one.code] === 'HOLDOUT')
      .map((one) => one.code)
  );

  /**
   * The verdict is taken the way the product takes it, impostors and all.
   *
   * Until 2026-08-25 this call passed three arguments, so the stand judged by
   * the absolute threshold while the product had moved to the relative vote.
   * That is not a stale default: the absolute rule accepts **every** generated
   * text, so the «похоже» column read 100% for every variant and a paid run
   * would have been scored by the one rule already known to be blind.
   *
   * `votes` travels beside `distance` because it is the quantity the epic is
   * now accepted on, and because it moves the other way — more votes means
   * closer, where more distance means further.
   */
  /**
   * Рабочая точка этого автора, снятая на чужих настоящих текстах.
   *
   * Считается один раз на построение мерки и до первого замера, потому что она
   * свойство автора, а не текста. Оба множества голосов берутся на той же
   * обрезке, что и всё остальное: порог, снятый на полной длине и применённый
   * к обрезанному тексту, сравнивал бы две разные величины.
   */
  const calibrationCut =
    options.calibrationCut ?? defaultCut(samples.map((one) => one.text));

  /**
   * Чужой материал делится на два непересекающихся: из одного строится
   * шеренга, по другому снимается порог. Тем же `splitForeign`, что у
   * продукта, и по той же причине — текст, участвовавший в постройке
   * подставного, проигрывает своему же подставному и кладёт порог на пол.
   */
  const foreign = splitForeign(options.foreignTexts ?? []);
  if (!impostors) {
    impostors =
      buildLineup(foreign.lineup, measurement.voicePrint?.ngrams, language) ??
      impostorsFor(language);
  }
  const voteAt = (text) =>
    voiceprint.measureSimilarity(
      cutTo(text, calibrationCut),
      measurement.voicePrint,
      pack,
      impostors
    ).votes;

  let calibration = options.calibration ?? null;
  if (!calibration && foreign.negatives.length) {
    const own = inputs
      .filter((one) => measurement.split[one.code] === 'HOLDOUT')
      .map((one) => voteAt(one.text))
      .filter((one) => one !== null);
    /**
     * Генерации в отрицательные примеры здесь не идут намеренно.
     *
     * Стенд судит генерации; порог, снятый на них же, судил бы их собой.
     * Вторую сторону обещания меряет отдельная команда `calibrate`, где обе
     * точки печатаются рядом и ни одна не участвует в собственной проверке.
     */
    calibration = calibrate(
      own,
      foreign.negatives.map(voteAt).filter((one) => one !== null)
    );
  }

  const at = (text, cut) => {
    const cropped = cutTo(text, cut);
    const similarity = voiceprint.measureSimilarity(
      cropped,
      measurement.voicePrint,
      pack,
      impostors,
      calibration
    );
    const check = retention.checkText(cropped, measurement, language);
    return {
      distance: similarity.distance,
      verdict: similarity.verdict,
      votes: similarity.votes ?? null,
      decidedBy: similarity.decidedBy,
      scaleShare: check.total ? check.inCorridor / check.total : null,
      measuredLength: cropped.length,
    };
  };

  /**
   * Both readings of the same text, always.
   *
   * The cut is what makes the comparison about manner instead of about length,
   * and it is also what hides the fact that the product writes three times
   * longer than the author does — 2708 characters against his 823. Length is
   * one of the loudest habits a person has, so the report carries the cropped
   * distance, the full-length distance and the length itself, and a reader can
   * see whether a gain was the voice or the scissors.
   */
  const measure = (text, cut) => {
    const cropped = at(text, cut);
    const full = at(text, null);
    return {
      ...cropped,
      full: {
        distance: full.distance,
        verdict: full.verdict,
        votes: full.votes,
        scaleShare: full.scaleShare,
      },
      rawLength: text.length,
    };
  };

  return {
    language,
    measurement,
    pack,
    inputs,
    holdoutCodes,
    impostors,
    calibration,
    calibrationCut,
    threshold: measurement.voicePrint?.ngrams?.threshold ?? null,
    selfMedian: measurement.voicePrint?.ngrams?.selfMedian ?? null,
    measure,
  };
}

/**
 * The share of pairs in which the author's own post sits closer to his profile
 * than a text the product produced on the same eight topics.
 *
 * This is the epic's real adversary. `e3y.1` measured 89.7% against somebody
 * else's technical documentation, and the same ruler scores 66.7% here — the
 * acceptance of that task was taken against an easy opponent.
 */
function pairedTest(ourDistances, theirDistances) {
  let won = 0;
  let tied = 0;
  for (const mine of ourDistances) {
    for (const theirs of theirDistances) {
      if (mine < theirs) won += 1;
      else if (mine === theirs) tied += 1;
    }
  }
  const pairs = ourDistances.length * theirDistances.length;
  return {
    won,
    tied,
    pairs,
    share: pairs ? won / pairs : null,
    /**
     * То же, но с ничьими по половине — обычная площадь под кривой.
     *
     * На расстояниях ничьих почти не бывает, и оба числа совпадают. На голосах
     * бывают сплошь: голос это доля выигранных сравнений против трёх
     * подставных, значений у него на порядок меньше, чем текстов, и `won/pairs`
     * систематически занижает разделимость, засчитывая совпадение как
     * поражение автора. Приёмка `pl1.5` читается по голосам, так что число, по
     * которому её читают, обязано считать ничью ничьёй.
     *
     * Оба поля рядом намеренно: если они сильно расходятся, значит мерка
     * упирается в свою зернистость, и это само по себе результат.
     */
    auc: pairs ? (won + tied / 2) / pairs : null,
    tiedShare: pairs ? tied / pairs : null,
  };
}

module.exports = {
  buildRuler,
  pairedTest,
  defaultCut,
  cutTo,
  mean,
  median,
  CUT_FLOOR,
  CUT_CEILING,
};
