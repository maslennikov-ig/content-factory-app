'use strict';

/**
 * Рабочая точка для набора, у которого нет базы с чужими аватарами.
 *
 * В продукте её снимает `VoiceService.calibrationFor`: берёт отложенную часть
 * корпуса, берёт настоящие тексты других авторов системы и считает две
 * границы. Наборы, работающие с чистыми функциями, базы не имеют — и всё же
 * подсунуть им придуманное число нельзя: тест, где порог выбран так, чтобы
 * ответ сошёлся, проверяет арифметику подгонки, а не мерку.
 *
 * Поэтому здесь та же арифметика на настоящих голосах: тексты действительно
 * прогоняются через отпечаток и подставных, и порог получается из того, что
 * они набрали. Отличие от продукта одно — какие тексты считаются чужими:
 * набор называет их сам, вместо того чтобы читать из базы.
 */

const { loadTypeScriptModule } = require('./load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const { measureSimilarity } = loadTypeScriptModule(`${BASE}/voiceprint.ts`);
const { impostorsFor } = loadTypeScriptModule(`${BASE}/impostor-sets.ts`);
const { packFor } = loadTypeScriptModule(`${BASE}/locale-pack.ts`);
const { calibrate, MIN_CALIBRATION_SAMPLES } = loadTypeScriptModule(
  `${BASE}/voice-calibration.ts`
);

/** Та же обрезка, что у продукта: порог и текст должны мериться одинаково. */
const CUT = 800;

/**
 * @param measurement результат `analyzeBrandVoice`
 * @param own тексты этого же автора, не входившие в корпус
 * @param foreign тексты, которых этот автор не писал
 * @returns измерение с рабочей точкой — не новый объект поверх старого, а
 *   именно то, что дальше пойдёт в `checkText`
 */
function withCalibration(measurement, own, foreign) {
  if (
    own.length < MIN_CALIBRATION_SAMPLES ||
    foreign.length < MIN_CALIBRATION_SAMPLES
  ) {
    throw new Error(
      `нужно хотя бы ${MIN_CALIBRATION_SAMPLES} текстов с каждой стороны, ` +
        `дано ${own.length} и ${foreign.length}`
    );
  }
  const pack = packFor(measurement.language);
  const impostors = impostorsFor(measurement.language);
  const votesOf = (texts) =>
    texts
      .map(
        (text) =>
          measureSimilarity(
            text.slice(0, CUT),
            measurement.voicePrint,
            pack,
            impostors
          ).votes
      )
      .filter((one) => one !== null);

  return {
    ...measurement,
    calibration: calibrate(votesOf(own), votesOf(foreign)),
  };
}

module.exports = { withCalibration, MIN_CALIBRATION_SAMPLES, CUT };
