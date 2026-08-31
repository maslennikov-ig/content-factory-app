'use strict';

/**
 * The stand judges by the rule the product ships, and not by the one it
 * replaced.
 *
 * On 2026-08-25 the product moved its verdict from an absolute threshold to a
 * relative vote, because the absolute rule was measured against the adversary
 * that matters — the product's own generated text — and accepted **all one
 * hundred and twenty** samples as the author's. The stand kept calling
 * `measureSimilarity` with three arguments, so it went on scoring paid runs by
 * the blind rule: every variant's «похоже» column read 100%, and a factorial
 * run costing 96 model calls would have been read off that column.
 *
 * This is the kind of defect that looks like a stale default and is not. The
 * two rulers do not merely differ in strictness — on the owner's corpus they
 * disagree in *sign* about whether the voice helps at all (−19.6% by distance,
 * +7.1% by vote), so which one the stand uses decides what the epic concludes.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { buildRuler } = require('../scripts/evidence/voice-eval/ruler.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const sets = loadTypeScriptModule(`${BASE}/impostor-sets.ts`);
const calibration = loadTypeScriptModule(`${BASE}/voice-calibration.ts`);

/** Twelve posts in one manner: enough for the analyser to build a print. */
const SAMPLES = Array.from({ length: 12 }, (_, index) => ({
  text:
    `Сел разбирать прогон номер ${index + 1} и посчитал руками, потому что ` +
    'глазами такое не ловится. Вышло хуже, чем я ждал: цифра не держится ' +
    'между прогонами. Записал, чтобы не забыть, — своей памяти я тут уже не ' +
    'верю. Дальше буду мерить только парами, иначе это гадание, а не работа. ' +
    'И да, замеров всё ещё двадцать четыре, а не сорок восемь. ' +
    'Отдельно проверил, не в обрезке ли дело: обрезал на восьмистах знаках и ' +
    'на восьмистах двадцати трёх — знак перевернулся.',
  contentHash: `hash-${index}`,
}));

const ALIEN =
  'Настоящий регламент устанавливает порядок согласования проектной документации между структурными подразделениями организации. ' +
  'Согласование осуществляется в течение десяти рабочих дней с момента поступления комплекта документов. ' +
  'В случае выявления несоответствий документация возвращается инициатору с указанием причин возврата и сроков устранения замечаний. ' +
  'Ответственность за соблюдение сроков возлагается на руководителей подразделений.';

const ruler = buildRuler(SAMPLES, 'ru');

describe('стенд берёт вердикт так же, как продукт', () => {
  it('подставные найдены и переданы мерке', () => {
    expect(ruler.impostors).toBe(sets.IMPOSTOR_SETS.ru);
  });

  it('голос считается, но без чужих текстов вердикта не выносится', () => {
    const measured = ruler.measure(SAMPLES[0].text, 800);

    /**
     * До 27.08.2026 здесь ожидалось `RELATIVE` — вердикт по константе `2/3`.
     * Константа снята: на шеренге из настоящих авторов она отвергала от 41% до
     * 71% собственных отложенных постов трёх измеренных людей. Мерка, которой
     * не дали чужих текстов, теперь честно молчит.
     */
    expect(measured.votes).not.toBeNull();
    expect(measured.votes).toBeGreaterThanOrEqual(0);
    expect(measured.votes).toBeLessThanOrEqual(1);
    expect(measured.decidedBy).toBe('NONE');
    expect(measured.verdict).toBe('UNKNOWN');
  });

  it('двенадцати постов на рабочую точку не хватает, и отказ назван', () => {
    /**
     * Чужих сколько угодно, своих — двенадцать, отложенных из них единицы.
     * Пятипроцентный допуск на такой выборке это доля одного наблюдения, и
     * порог стал бы свойством того, какой пост случайно попал в отложенную
     * часть. Отказ здесь дороже числа.
     */
    const small = buildRuler(SAMPLES, 'ru', {
      foreignTexts: Array.from({ length: 40 }, () => ALIEN),
      calibrationCut: 800,
    });

    expect(small.calibration.high).toBeNull();
    expect(small.calibration.reason).toBe('TOO_FEW_OWN');
    expect(small.measure(SAMPLES[0].text, 800).verdict).toBe('UNKNOWN');
  });

  it('с готовой точкой вердикт выносится и назван калиброванным', () => {
    const calibrated = buildRuler(SAMPLES, 'ru', {
      calibration: calibration.calibrate(
        Array.from({ length: 40 }, (_, index) => 0.5 + (index / 39) * 0.5),
        Array.from({ length: 40 }, (_, index) => (index / 39) * 0.4)
      ),
    });
    const measured = calibrated.measure(SAMPLES[0].text, 800);

    expect(measured.decidedBy).toBe('CALIBRATED');
    expect(['CLOSE', 'FAR', 'UNKNOWN']).toContain(measured.verdict);
  });

  it('чужой текст получает меньше голосов, чем свой', () => {
    const own = ruler.measure(SAMPLES[0].text, 800);
    const alien = ruler.measure(ALIEN, 800);

    expect(own.votes).toBeGreaterThan(alien.votes);
  });

  it('голос считается и на полной длине, рядом с обрезанным', () => {
    const measured = ruler.measure(SAMPLES[0].text, 400);

    expect(measured.full.votes).not.toBeNull();
    expect(measured.measuredLength).toBe(400);
  });

  it('расстояние никуда не делось: поменялось правило, а не мерка', () => {
    const measured = ruler.measure(SAMPLES[0].text, 800);

    expect(typeof measured.distance).toBe('number');
    expect(ruler.threshold).toBeGreaterThan(0);
  });
});
