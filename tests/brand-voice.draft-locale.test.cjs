'use strict';

/**
 * The draft check measures in the language the corpus was measured in.
 *
 * `content-factory-next-pl1.11` gave English its own lists and taught the
 * analyser to stop substituting Russian ones — and left the draft check
 * untouched. `voice-retention.ts` took `RU_LOCALE_PACK` in three places, so the
 * very defect that task was opened over went on living in the place a person
 * sees most often: the remark above the post form, printed while they write.
 *
 * What it looked like from the outside: an English draft measured against an
 * English profile reported `nominalisation` at 0 — «this author never writes
 * bureaucratically» — because the scale was looking for `-ение` in English
 * text. The corridor it was compared against had been built with the English
 * pack, so the zero landed below it and the product told the author a habit of
 * theirs had gone missing. A zero against an honest corridor is not a null
 * result; it is a finding that is not there.
 *
 * The corpus below is generated rather than written out: the scales need a
 * hundred sentences before they report a corridor at all, and a fixture that
 * quietly falls short of that floor tests nothing while looking green.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const retention = loadTypeScriptModule(`${base}/voice-retention.ts`);
const scales = loadTypeScriptModule(`${base}/style-scales.ts`);
const voiceprint = loadTypeScriptModule(`${base}/voiceprint.ts`);
const localePack = loadTypeScriptModule(`${base}/locale-pack.ts`);

/**
 * An English corpus with a loud, countable habit: nearly every sentence carries
 * a nominalisation. Through the English pack that is a habit with a corridor;
 * through the Russian one it is a zero.
 */
const TEMPLATES = [
  'The implementation of release N took three evenings, and the verification of the rollback took one more. I wrote the numbers down because I no longer trust my memory on this. The optimisation of the query plan gave us nothing at all this time around.',
  'The registration of experiment N went through on a Tuesday, and the propagation of the records took an hour. I watched it the way people watch a kettle, with the documentation of the failure open beside me. The explanation of the fix is at the bottom.',
  'The consolidation of the dashboards for team N is finished at last. The duplication of the same metric under two names is gone, and the confusion of the quarter goes with it. I measured the latency of the search endpoint again after the deployment.',
];

const englishCorpus = (language) =>
  Array.from({ length: 60 }, (_, index) => ({
    code: `${language}-${String(index + 1).padStart(3, '0')}`,
    text: TEMPLATES[index % TEMPLATES.length].replace('N', String(index + 1)),
    language,
    contentHash: `${language}-hash-${index}`,
  }));

/** A draft in the same manner as the corpus: the habit is present, not missing. */
const ENGLISH_DRAFT =
  'The implementation of the new configuration is complete. The verification of the deployment took an afternoon, and the documentation of the rollback is written. The confirmation of the numbers happened twice.';

describe('черновик меряется словарём своего языка', () => {
  const measurement = analyzer.analyzeBrandVoice(englishCorpus('en'), {
    language: 'en',
  });

  it('корпус разобран английским пакетом и коридор у канцелярита есть', () => {
    expect(measurement.language).toBe('en');
    expect(measurement.localePackVersion).toMatch(/^en-/);
    expect(measurement.scales.nominalisation.corridorSource).toBe('MEASURED');
  });

  it('русский пакет на английском тексте по-прежнему врёт нулём', () => {
    const throughRussian = scales.measureSingleText(
      ENGLISH_DRAFT,
      localePack.LOCALE_PACKS.ru
    );
    const throughEnglish = scales.measureSingleText(
      ENGLISH_DRAFT,
      localePack.LOCALE_PACKS.en
    );

    expect(throughRussian.nominalisation).toBe(0);
    expect(throughEnglish.nominalisation).toBeGreaterThan(50);
  });

  it('привычка автора не объявляется пропавшей', () => {
    const check = retention.checkText(ENGLISH_DRAFT, measurement, 'en');
    const nominalisation = check.outside.find(
      (one) => one.key === 'nominalisation'
    );

    // Черновик написан в той же манере, что и корпус: шкала обязана лежать
    // внутри коридора. На коде до правки она приходит нулём русского пакета и
    // оказывается ниже коридора, построенного английским.
    expect(nominalisation).toBeUndefined();
    expect(check.total).toBeGreaterThan(0);
  });

  /**
   * Расстояние до слепка считается символьными n-граммами, а им словарь не
   * нужен ни на одном языке — поэтому подмена пакета его числа не меняет и
   * поймать её этим числом нельзя. Здесь проверяется, что оно совпадает с
   * прямым вызовом: подмена пакета не должна ломать и то, что от пакета не
   * зависит.
   */
  it('расстояние до слепка не расходится с прямым вызовом', () => {
    const check = retention.checkText(ENGLISH_DRAFT, measurement, 'en');
    const throughEnglish = voiceprint.measureSimilarity(
      ENGLISH_DRAFT,
      measurement.voicePrint,
      localePack.LOCALE_PACKS.en
    );

    expect(check.similarity.distance).toBe(throughEnglish.distance);
    expect(check.similarity.verdict).toBe(throughEnglish.verdict);
  });
});

describe('русский черновик не сломан правкой', () => {
  const russianCorpus = Array.from({ length: 60 }, (_, index) => ({
    code: `ru-${String(index + 1).padStart(3, '0')}`,
    text:
      `Сел разбирать прогон номер ${index + 1} и посчитал руками. ` +
      'Вышло хуже, чем я ждал: цифра не держится между прогонами. ' +
      'Записал, чтобы не забыть, потому что своей памяти я тут уже не верю. ' +
      'Дальше буду мерить только парами, иначе это гадание, а не работа.',
    language: 'ru',
    contentHash: `ru-hash-${index}`,
  }));

  it('русский корпус и русский черновик считаются как раньше', () => {
    const measurement = analyzer.analyzeBrandVoice(russianCorpus, {
      language: 'ru',
    });
    const check = retention.checkText(
      'Сел разбирать очередной прогон и посчитал руками. Вышло хуже, чем я ждал. Записал, чтобы не забыть.',
      measurement,
      'ru'
    );

    expect(measurement.localePackVersion).toMatch(/^ru-/);
    expect(check.total).toBeGreaterThan(0);
  });
});

describe('язык без пакета не выдаёт ноль за находку', () => {
  /**
   * Немецкого пакета нет. Корпус на нём меряется тем, что не требует словаря,
   * а словарные шкалы отвечают отсутствием — и проверка черновика обязана
   * держаться того же правила, а не пересчитывать их русским списком.
   */
  it('словарные шкалы не попадают в замечание', () => {
    const measurement = analyzer.analyzeBrandVoice(englishCorpus('de'), {
      language: 'de',
    });
    const check = retention.checkText(ENGLISH_DRAFT, measurement, 'en');
    const dictionaryBound = new Set(localePack.DICTIONARY_BOUND_MEASUREMENTS);
    const leaked = check.outside.filter((one) => dictionaryBound.has(one.key));

    expect(measurement.localePackVersion).toBe('none-de');
    expect(leaked).toEqual([]);
  });
});
