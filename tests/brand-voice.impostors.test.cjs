'use strict';

/**
 * The relative decision, as the product now makes it.
 *
 * The absolute rule — "distance below the author's own 95th percentile" — was
 * measured on 2026-08-25 against the adversary that matters, the product's own
 * generated text on the author's own topics, and it called **all one hundred
 * and twenty of them** the author's, at every crop from 600 to 1200 characters.
 * The same n-grams asked relatively — closer to this author than to a set of
 * impostors, over random halves of the profile — separate the two at an AUC of
 * 0.90–0.93.
 *
 * Three properties are held here, and each one is a way the vote could quietly
 * stop meaning anything:
 *
 *   * it is deterministic, because a verdict that changes on reload is not
 *     evidence and cannot be argued with;
 *   * every side is scored on the *author's* windows, because letting each
 *     print keep its own would compare distances computed over different
 *     features and call the difference authorship;
 *   * a language with no impostors falls back to the old rule and says so in
 *     `decidedBy`, rather than passing the worse answer off as the same one.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const impostors = loadTypeScriptModule(`${base}/impostors.ts`);
const sets = loadTypeScriptModule(`${base}/impostor-sets.ts`);
const ngrams = loadTypeScriptModule(`${base}/character-ngrams.ts`);
const voiceprint = loadTypeScriptModule(`${base}/voiceprint.ts`);
const localePack = loadTypeScriptModule(`${base}/locale-pack.ts`);
const calibration = loadTypeScriptModule(`${base}/voice-calibration.ts`);

/** Двенадцать текстов одной манеры — этого хватает на слепок. */
const AUTHOR = Array.from({ length: 12 }, (_, index) => ({
  text:
    `Сел разбирать прогон номер ${index + 1} и посчитал руками, потому что ` +
    'глазами такое не ловится. Вышло хуже, чем я ждал: цифра не держится ' +
    'между прогонами. Записал, чтобы не забыть, — своей памяти я тут уже не ' +
    'верю. Дальше буду мерить только парами, иначе это гадание, а не работа. ' +
    'И да, замеров всё ещё двадцать четыре, а не сорок восемь. ' +
    'Отдельно проверил, не в обрезке ли дело: обрезал на восьмистах знаках и ' +
    'на восьмистах двадцати трёх — знак перевернулся. Такое число я показывать ' +
    'никому не буду, пока не пойму, почему оно так себя ведёт.',
}));

const OWN_TEXT = AUTHOR[0].text;
const ALIEN_TEXT =
  'Настоящий регламент устанавливает порядок согласования проектной документации между структурными подразделениями организации. ' +
  'Согласование осуществляется в течение десяти рабочих дней с момента поступления комплекта документов. ' +
  'В случае выявления несоответствий документация возвращается инициатору с указанием причин возврата и сроков устранения замечаний. ' +
  'Ответственность за соблюдение сроков возлагается на руководителей подразделений.';

const print = voiceprint.buildVoicePrint(
  AUTHOR,
  localePack.LOCALE_PACKS.ru
);

describe('голос считается по окнам автора и не зависит от прогона', () => {
  it('тот же текст даёт тот же голос', () => {
    const first = impostors.impostorVote(OWN_TEXT, print.ngrams, sets.IMPOSTOR_SETS.ru);
    const second = impostors.impostorVote(OWN_TEXT, print.ngrams, sets.IMPOSTOR_SETS.ru);

    expect(first.votes).not.toBeNull();
    expect(second.votes).toBe(first.votes);
  });

  it('свой текст выигрывает у подставных чаще чужого', () => {
    const own = impostors.impostorVote(OWN_TEXT, print.ngrams, sets.IMPOSTOR_SETS.ru);
    const alien = impostors.impostorVote(ALIEN_TEXT, print.ngrams, sets.IMPOSTOR_SETS.ru);

    expect(own.votes).toBeGreaterThan(alien.votes);
  });

  it('без слепка автора голоса нет, и причина названа', () => {
    const answer = impostors.impostorVote(OWN_TEXT, null, sets.IMPOSTOR_SETS.ru);

    expect(answer.votes).toBeNull();
    expect(answer.reason).toBe('NO_PROFILE');
  });

  it('без подставных голоса нет, и причина другая', () => {
    const answer = impostors.impostorVote(OWN_TEXT, print.ngrams, null);

    expect(answer.votes).toBeNull();
    expect(answer.reason).toBe('NO_IMPOSTORS');
  });

  it('набор другого размера окна не берётся молча', () => {
    const wrong = { ...sets.IMPOSTOR_SETS.ru, size: 4 };
    const answer = impostors.impostorVote(OWN_TEXT, print.ngrams, wrong);

    expect(answer.reason).toBe('NO_IMPOSTORS');
  });

  it('короткий текст не судится: там шум больше сигнала', () => {
    const answer = impostors.impostorVote(
      OWN_TEXT.slice(0, impostors.IMPOSTOR_MIN_CHARS - 1),
      print.ngrams,
      sets.IMPOSTOR_SETS.ru
    );

    expect(answer.reason).toBe('TOO_SHORT');
  });
});

/**
 * Рабочая точка, снятая на этом авторе.
 *
 * До 27.08.2026 её роль играла константа `2/3`, и тесты ниже проверяли её. Она
 * снята — на новой шеренге она отвергала от 41% до 71% собственных отложенных
 * постов трёх настоящих авторов, — поэтому вердикт читается против точки,
 * выбранной на материале этого человека. Значения здесь подобраны так, чтобы
 * свой текст лёг выше верхнего порога, а чужой на самый ноль.
 */
const CALIBRATION = calibration.calibrate(
  Array.from({ length: 40 }, (_, index) => index / 39),
  Array.from({ length: 40 }, (_, index) => (index < 34 ? index / 100 : 0.5))
);

describe('вердикт продукта принимается относительно', () => {
  it('свой текст — «похоже», и решено калиброванной точкой', () => {
    const answer = voiceprint.measureSimilarity(
      OWN_TEXT,
      print,
      localePack.LOCALE_PACKS.ru,
      sets.IMPOSTOR_SETS.ru,
      CALIBRATION
    );

    expect(answer.decidedBy).toBe('CALIBRATED');
    expect(answer.verdict).toBe('CLOSE');
    expect(answer.votes).toBeGreaterThanOrEqual(CALIBRATION.high);
  });

  it('чужой текст — «мало похоже», хотя абсолютный порог его пропускал', () => {
    const relative = voiceprint.measureSimilarity(
      ALIEN_TEXT,
      print,
      localePack.LOCALE_PACKS.ru,
      sets.IMPOSTOR_SETS.ru,
      CALIBRATION
    );
    const absolute = voiceprint.measureSimilarity(
      ALIEN_TEXT,
      print,
      localePack.LOCALE_PACKS.ru
    );

    expect(relative.verdict).toBe('FAR');
    expect(relative.votes).toBeLessThanOrEqual(CALIBRATION.low);
    // Расстояние никуда не делось — поменялось правило, а не мерка.
    expect(relative.distance).toBe(absolute.distance);
  });

  it('без калибровки голос считается, но вердикта не выносится', () => {
    const answer = voiceprint.measureSimilarity(
      OWN_TEXT,
      print,
      localePack.LOCALE_PACKS.ru,
      sets.IMPOSTOR_SETS.ru
    );

    expect(answer.votes).not.toBeNull();
    expect(answer.verdict).toBe('UNKNOWN');
    expect(answer.reason).toBe('UNCALIBRATED');
    expect(answer.decidedBy).toBe('NONE');
  });

  it('язык без подставных возвращается к старому правилу и не скрывает этого', () => {
    const answer = voiceprint.measureSimilarity(
      OWN_TEXT,
      print,
      localePack.LOCALE_PACKS.ru,
      null
    );

    expect(answer.decidedBy).toBe('THRESHOLD');
    expect(answer.votes).toBeNull();
    expect(answer.voteFloor).toBeNull();
  });

  it('без слепка вообще решать нечем, и это третье состояние', () => {
    const answer = voiceprint.measureSimilarity(
      OWN_TEXT,
      null,
      localePack.LOCALE_PACKS.ru,
      sets.IMPOSTOR_SETS.ru
    );

    expect(answer.verdict).toBe('UNKNOWN');
    expect(answer.decidedBy).toBe('NONE');
  });
});

describe('подставные — производные статистики, а не чужой текст', () => {
  it('в наборе только окна и частоты', () => {
    for (const locale of ['ru', 'en']) {
      const set = sets.IMPOSTOR_SETS[locale];
      expect(set.impostors.length).toBe(3);
      for (const rates of set.impostors) {
        const windows = Object.keys(rates);
        expect(windows.length).toBeGreaterThan(500);
        // Окно ровно в пять символов: связного текста из него не собрать.
        windows.forEach((one) => expect([...one]).toHaveLength(ngrams.NGRAM_SIZE));
        Object.values(rates).forEach((rate) => {
          expect(rate).toBeGreaterThan(0);
          expect(rate).toBeLessThan(1);
        });
      }
    }
  });

  it('языки без набора отвечают отсутствием, а не чужим набором', () => {
    expect(sets.impostorsFor('de')).toBeNull();
    expect(sets.impostorsFor('ru')).toBe(sets.IMPOSTOR_SETS.ru);
  });

  it('каждый набор помнит, из чего собран', () => {
    for (const locale of ['ru', 'en']) {
      const set = sets.IMPOSTOR_SETS[locale];
      expect(set.version).toMatch(/^impostors-/u);
      expect(set.source).toMatch(/коммит [0-9a-f]{7,}/u);
      expect(set.size).toBe(ngrams.NGRAM_SIZE);
    }
  });
});
