'use strict';

/**
 * Рабочая точка голосования.
 *
 * Проверяется не арифметика перцентиля, а четыре свойства, ошибка в каждом из
 * которых показывает человеку неправду о его собственном тексте.
 *
 * 1. Верхний порог держит долю чужих текстов, названных авторскими. Это
 *    единственная ошибка, которую продукт обещает вслух.
 * 2. Нижний порог держит долю настоящих текстов автора, названных чужими, и
 *    никогда не поднимается до верхнего: «не похоже» дороже молчания.
 * 3. На малом материале калибровки нет, и это отдельный ответ, а не порог по
 *    умолчанию. Порог по умолчанию — это ровно та константа `2/3`, из-за
 *    которой всё переделывается.
 * 4. Голос без калибровки не получает вердикта вообще.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const {
  calibrate,
  verdictFor,
  MIN_CALIBRATION_SAMPLES,
  MAX_FALSE_ACCEPT,
  MAX_FALSE_REJECT,
  CALIBRATION_VERSION,
  UNCALIBRATED,
} = loadTypeScriptModule(`${BASE}/voice-calibration.ts`);

/** Ряд из `count` значений, растущих от `from` до `to`. */
const ramp = (from, to, count) =>
  Array.from({ length: count }, (_, index) =>
    Number((from + ((to - from) * index) / (count - 1)).toFixed(4))
  );

/** Автор пишет по-разному: часть его постов не выигрывает ни одного сравнения. */
const OWN = ramp(0, 1, 40);

/**
 * У чужих есть хвост, и он выше прежней константы `2/3`.
 *
 * Без хвоста набор ничего не проверяет: любой порог выше 0.4 держит обещание,
 * включая жёстко вписанный, и первая попытка этих тестов ровно на это и
 * попалась — подмена выбранного порога на `2/3` оставила все девять зелёными.
 * Шесть чужих текстов из сорока выше двух третей — пятнадцать процентов, втрое
 * больше обещанного, так что константа обязана здесь падать.
 */
const FOREIGN = [...ramp(0, 0.5, 34), 0.72, 0.78, 0.84, 0.9, 0.95, 0.99];

describe('калибровка рабочей точки', () => {
  it('верхний порог держит обещанную долю ложно принятых чужих', () => {
    const calibration = calibrate(OWN, FOREIGN);

    const accepted =
      FOREIGN.filter((one) => one >= calibration.high).length / FOREIGN.length;
    expect(accepted).toBeLessThanOrEqual(MAX_FALSE_ACCEPT);
    expect(calibration.falseAccept).toEqual({
      of: FOREIGN.length,
      wrong: FOREIGN.filter((one) => one >= calibration.high).length,
    });
    expect(calibration.version).toBe(CALIBRATION_VERSION);
  });

  it('нижний порог держит обещанную долю ложно отвергнутых своих', () => {
    const calibration = calibrate(OWN, FOREIGN);

    const rejected =
      OWN.filter((one) => one <= calibration.low).length / OWN.length;
    expect(rejected).toBeLessThanOrEqual(MAX_FALSE_REJECT);
  });

  it('между порогами остаётся полоса, и она не пустая', () => {
    const calibration = calibrate(OWN, FOREIGN);

    expect(calibration.low).toBeLessThan(calibration.high);
    const between = OWN.filter(
      (one) => one > calibration.low && one < calibration.high
    );
    expect(between.length).toBeGreaterThan(0);
  });

  it('когда разброс автора узкий, недостижимым становится «не похоже», а не «похоже»', () => {
    /**
     * Автор, чьи тексты все набирают много, и чужие — тоже немало. Обе точки
     * сходятся, полоса схлопывается, и правило обязано выбрать, какой из двух
     * ответов потерять. Теряется тот, ошибка в котором дороже.
     */
    const tight = Array.from({ length: 30 }, () => 0.9);
    const close = Array.from({ length: 30 }, () => 0.9);

    const calibration = calibrate(tight, close);

    expect(calibration.low).toBe(0);
    expect(verdictFor(0.9, calibration)).not.toBe('FAR');
  });

  it('на малом материале калибровки нет, и сказано почему', () => {
    const few = ramp(0, 1, MIN_CALIBRATION_SAMPLES - 1);

    expect(calibrate(few, FOREIGN)).toEqual({
      ...UNCALIBRATED,
      reason: 'TOO_FEW_OWN',
    });
    expect(calibrate(OWN, few)).toEqual({
      ...UNCALIBRATED,
      reason: 'TOO_FEW_FOREIGN',
    });
  });

  it('без калибровки вердикта нет — и это не «похоже»', () => {
    expect(verdictFor(0.9, null)).toBeNull();
    expect(verdictFor(0.9, UNCALIBRATED)).toBeNull();
    expect(verdictFor(0.0, UNCALIBRATED)).toBeNull();
  });

  it('текст, который нечем измерить, вердикта не получает', () => {
    const calibration = calibrate(OWN, FOREIGN);

    expect(verdictFor(null, calibration)).toBeNull();
    expect(verdictFor(undefined, calibration)).toBeNull();
  });

  it('три ответа разделяются по порогам, а не по близости к ним', () => {
    const calibration = calibrate(OWN, FOREIGN);

    expect(verdictFor(calibration.high, calibration)).toBe('CLOSE');
    expect(verdictFor(1, calibration)).toBe('CLOSE');
    expect(verdictFor(calibration.low, calibration)).toBe('FAR');
    expect(
      verdictFor((calibration.low + calibration.high) / 2, calibration)
    ).toBe('CANNOT_TELL');
  });

  it('порог движется за материалом, а не стоит на месте', () => {
    /**
     * Тот же автор против двух шеренг разной трудности. Порог, не сдвинувшийся
     * между ними, — константа, как бы она ни была получена, и вся эта работа
     * затеяна ровно из-за одной такой.
     */
    const easy = ramp(0, 0.3, 40);
    const hard = [...ramp(0, 0.6, 30), ...ramp(0.7, 0.99, 10)];

    const onEasy = calibrate(OWN, easy);
    const onHard = calibrate(OWN, hard);

    expect(onHard.high).toBeGreaterThan(onEasy.high);
  });

  it('одни и те же наблюдения дают одну и ту же точку', () => {
    const once = calibrate(OWN, FOREIGN);
    const twice = calibrate([...OWN].reverse(), [...FOREIGN].reverse());

    expect(twice).toEqual(once);
  });
});

/**
 * Второй противник — то, что продукт написал сам.
 *
 * Замер 28.08.2026 на трёх корпусах: порог, снятый по одним чужим людям,
 * пропускал 33% собственных генераций у автора с самым маленьким корпусом.
 * Ниже проверяется не это число, а свойство, из-за которого оно получалось:
 * две популяции — два обещания, и точка обязана держать оба.
 */
describe('порог против настоящего противника', () => {
  /**
   * Чужие люди набирают мало, генерации — много.
   *
   * Так и было на замере: текст, написанный моделью под голос человека,
   * прячется лучше, чем другой человек. Поэтому точка, снятая по людям, лежит
   * ниже той, что нужна против машины.
   */
  const EASY_HUMANS = ramp(0, 0.3, 40);
  const HARD_DRAFTS = ramp(0.4, 0.95, 40);

  it('держит обещание перед обеими популяциями сразу', () => {
    const calibration = calibrate(OWN, EASY_HUMANS, HARD_DRAFTS);

    const accepted = (list) =>
      list.filter((one) => one >= calibration.high).length / list.length;
    expect(accepted(EASY_HUMANS)).toBeLessThanOrEqual(MAX_FALSE_ACCEPT);
    expect(accepted(HARD_DRAFTS)).toBeLessThanOrEqual(MAX_FALSE_ACCEPT);
  });

  it('берёт строгую точку, а не точку по объединению', () => {
    /**
     * Это и есть та ошибка, ради которой правило написано. Объединение
     * разбавляет меньшую популяцию большей и держит обещание только для
     * суммы — то есть ровно для той стороны, которая и так проходила.
     */
    const pooled = calibrate(OWN, [...EASY_HUMANS, ...HARD_DRAFTS]);
    const strict = calibrate(OWN, EASY_HUMANS, HARD_DRAFTS);

    expect(strict.high).toBeGreaterThan(pooled.high);
    const acceptedByPooled =
      HARD_DRAFTS.filter((one) => one >= pooled.high).length /
      HARD_DRAFTS.length;
    expect(acceptedByPooled).toBeGreaterThan(MAX_FALSE_ACCEPT);
  });

  it('без черновиков правило ровно прежнее', () => {
    expect(calibrate(OWN, FOREIGN, [])).toEqual(calibrate(OWN, FOREIGN));
  });

  it('популяция, которой не набралось на обещание, не участвует вовсе', () => {
    const few = ramp(0.4, 0.95, MIN_CALIBRATION_SAMPLES - 1);

    expect(calibrate(OWN, FOREIGN, few)).toEqual(calibrate(OWN, FOREIGN));
    /**
     * И наоборот: чужих людей не набралось, а черновиков хватает — точка
     * снимается, потому что обещание одно и оно выполнимо.
     */
    const onDrafts = calibrate(OWN, few, HARD_DRAFTS);
    expect(onDrafts.high).not.toBeNull();
    expect(onDrafts.negatives).toBe('own_generations');
  });

  it('из чего снята точка — выводится, а не объявляется', () => {
    expect(calibrate(OWN, FOREIGN).negatives).toBe('foreign_avatars');
    expect(calibrate(OWN, FOREIGN, HARD_DRAFTS).negatives).toBe('mixed');
    /**
     * Счётчик ошибок считает обе стороны: черновик, принятый за авторский, —
     * такая же ложная похвала, как чужой пост, и знаменатель обязан её видеть.
     */
    expect(calibrate(OWN, FOREIGN, HARD_DRAFTS).falseAccept.of).toBe(
      FOREIGN.length + HARD_DRAFTS.length
    );
  });

  it('ни одной стороны — калибровки нет, и причина названа', () => {
    const few = ramp(0, 0.3, MIN_CALIBRATION_SAMPLES - 1);

    expect(calibrate(OWN, few, few)).toEqual({
      ...UNCALIBRATED,
      reason: 'TOO_FEW_FOREIGN',
    });
  });
});

void path;
