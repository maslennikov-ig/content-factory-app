'use strict';

/**
 * The norm an author is described against, and the four ways it lies.
 *
 * «Доля вопросительных фраз 6,2 %» tells nobody anything; «заметно чаще
 * обычного» does. What makes the second honest rather than merely friendlier
 * is entirely in the edges, and each of them is a way a product can say
 * something it never measured:
 *
 *   * a metric with no norm behind it must say nothing about position, not
 *     «примерно как обычно»;
 *   * a metric the reference never varies on is not a metric that cannot be
 *     compared — any other value is beyond everything ever seen;
 *   * a metric observed in three of forty-eight reference posts is noise
 *     wearing a number, and must not ship at all;
 *   * the bands are one set for every measurement, because a threshold picked
 *     per scale is taste with a decimal point.
 *
 * The numbers themselves are checked against the two authors this repository
 * has: the owner, and its own technical prose. They have to come out
 * different — if everybody is «как обычно», the norm or the ruler is wrong.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const BASE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const norm = loadTypeScriptModule(`${BASE}/voice-norm.ts`);
const ru = loadTypeScriptModule(`${BASE}/voice-norm.ru.ts`);
const phrasing = loadTypeScriptModule(`${BASE}/voice-norm.phrasing.ts`);
const types = loadTypeScriptModule(`${BASE}/brand-voice.types.ts`);

const NORM = ru.RU_VOICE_NORM;

describe('одна статистика и один порог на все измерения', () => {
  it('устойчивый z считается через медиану и MAD, а не через среднее', () => {
    // Скошенная выборка: девятнадцать нулей и один выброс. Среднее уехало бы
    // к выбросу, медиана — нет, и в этом весь довод исследования.
    const values = [...Array(19).fill(0), 100];

    const stat = norm.normStatOf(values);

    expect(stat.median).toBe(0);
    expect(stat.scale).toBe(0);
  });

  it('масштаб — это MAD, домноженный до сигмы', () => {
    const values = Array.from({ length: 21 }, (unused, index) => index - 10);

    const stat = norm.normStatOf(values);

    expect(stat.median).toBe(0);
    // MAD этой выборки — 5, и 5 × 1,4826 = 7,413.
    expect(stat.scale).toBeCloseTo(5 * norm.MAD_TO_SIGMA, 3);
    expect(stat.observed).toBe(21);
  });

  it('пороги одни и те же для любого измерения', () => {
    const stats = { a: { median: 0, scale: 1, observed: 50 } };
    const at = (raw) => norm.deviationOf('a', raw, { stats });

    expect(at(0).band).toBe('typical');
    expect(at(0.99).band).toBe('typical');
    expect(at(1).band).toBe('above');
    expect(at(1.99).band).toBe('above');
    expect(at(2).band).toBe('far-above');
    expect(at(-1).band).toBe('below');
    expect(at(-2).band).toBe('far-below');
  });

  it('порогов ровно два, и оба объявлены числом', () => {
    expect(norm.DEVIATION_SIGMA).toEqual({ noticeable: 1, strong: 2 });
  });
});

describe('четыре края, на которых продукт мог бы соврать', () => {
  it('измерения без нормы получают «нет нормы», а не «как обычно»', () => {
    const deviation = norm.deviationOf('questions', 6.2, { stats: {} });

    expect(deviation.band).toBe('absent');
    expect(deviation.z).toBeNull();
    // Сырое число остаётся: тому, кто хочет проверить, есть что проверять.
    expect(deviation.raw).toBe(6.2);
  });

  it('норма без разброса — это «дальше всего виденного», а не «сравнить не с чем»', () => {
    // Ни один сгенерированный без голоса пост не пользуется эмодзи. Автор,
    // который ими пользуется, — за пределами всей выборки, и сказать про это
    // «сравнить не с чем» значит выбросить самый различающий факт.
    const stats = { emojiRate: { median: 0, scale: 0, observed: 48 } };

    expect(norm.deviationOf('emojiRate', 5.6, { stats }).band).toBe('far-above');
    expect(norm.deviationOf('emojiRate', 0, { stats }).band).toBe('typical');
  });

  it('измерение, встреченное реже порога, в норму не попадает вовсе', () => {
    // `firstPerson` встретился в трёх постах из сорока восьми: в остальных
    // сорока пяти нет ни местоимения первого лица, ни институционального
    // существительного, и делить было не на что. Полоса, нарисованная по трём
    // наблюдениям, — это шум с числом на боку.
    expect(norm.normStatOf([10, 20, 30])).toBeNull();
  });

  it('измерение входит в норму по порогу, а не по имени', () => {
    /**
     * До 30.08.2026 здесь стояло `expect(NORM.stats.firstPerson).toBeUndefined()`.
     * Это закрепляло не правило, а ФАКТ о прежнем эталоне из сорока восьми
     * постов, где `firstPerson` встретился трижды. На эталоне из двухсот
     * восьмидесяти он встретился двадцать девять раз и порог прошёл честно.
     *
     * Правило от этого не ослабло: оно проверяется дважды — `normStatOf` выше
     * отвергает три наблюдения, а случай ниже проходит по всему файлу и не
     * пускает ни одного измерения ниже порога. Утверждение же про конкретное
     * имя запрещало бы норме становиться полнее, что не является правилом
     * продукта ни в одном документе.
     */
    const first = NORM.stats.firstPerson;
    if (first) {
      expect(first.observed).toBeGreaterThanOrEqual(norm.MIN_NORM_POSTS);
    }
    // И наоборот: измерение с достаточным числом наблюдений обязано войти.
    expect(NORM.stats.sentenceLength.observed).toBeGreaterThanOrEqual(
      norm.MIN_NORM_POSTS
    );
  });

  it('в файле нормы нет ни одного измерения ниже порога наблюдений', () => {
    for (const [key, stat] of Object.entries(NORM.stats)) {
      expect(stat.observed).toBeGreaterThanOrEqual(norm.MIN_NORM_POSTS);
      void key;
    }
  });
});

describe('норма — часть продукта и обязана быть версионированной', () => {
  it('файл несёт свою версию, язык и то, из чего построен', () => {
    expect(NORM.version).toBe(norm.VOICE_NORM_VERSION);
    expect(NORM.locale).toBe('ru');
    expect(NORM.posts).toBeGreaterThanOrEqual(norm.MIN_NORM_POSTS);
    expect(NORM.source).toMatch(/без голоса/);
  });

  it('версия называет язык и дату: норма меняет каждое уже показанное число', () => {
    expect(norm.VOICE_NORM_VERSION).toMatch(/^voice-norm\/ru-\d{4}-\d{2}-\d{2}$/);
  });

  it('норма покрывает восемь шкал, кроме того, чего не наблюдала', () => {
    const covered = Object.keys(NORM.stats);
    for (const key of types.STYLE_SCALE_KEYS) {
      if (key === 'firstPerson') continue;
      expect(covered).toContain(key);
    }
    expect(covered).toContain('postLength');
  });
});

describe('измерение, сказанное направлением', () => {
  const stats = { questions: { median: 4.3, scale: 4.151, observed: 48 } };

  it('обе стороны — разные предложения, а не одно с минусом', () => {
    const above = phrasing.phraseDeviation(
      'questions',
      norm.deviationOf('questions', 20, { stats }),
      'ru'
    );
    const below = phrasing.phraseDeviation(
      'questions',
      norm.deviationOf('questions', 0, { stats }),
      'ru'
    );

    expect(above.text).toMatch(/спрашивает/);
    expect(below.text).toMatch(/не задаёт/);
    expect(above.text).not.toBe(below.text);
  });

  it('сырое число едет рядом с предложением, и число эталона вместе с ним', () => {
    const said = phrasing.phraseDeviation(
      'questions',
      norm.deviationOf('questions', 20, { stats }),
      'ru'
    );

    expect(said.detail).toBe('20 % вопросительных фраз, у обычного поста 4.3');
  });

  it('два автора внутри одной полосы получают разные предложения', () => {
    /**
     * Это и есть провал приёмки `pl1.6`, найденный 28.08.2026 на трёх
     * настоящих корпусах: полос всего пять, и всё дальше двух сигм читается
     * одним словом «сильно». У двух авторов 36,4 % и 56,5 % фраз короче
     * восьми слов — полтора раза разницы, одна и та же полоса. Число эталона
     * рядом с числом автора — единственное, что их различает, и третьего
     * порога ради этого не заводится.
     */
    const one = phrasing.phraseDeviation(
      'shortSentences',
      norm.deviationOf('shortSentences', 36.4, NORM),
      'ru'
    );
    const other = phrasing.phraseDeviation(
      'shortSentences',
      norm.deviationOf('shortSentences', 56.5, NORM),
      'ru'
    );

    expect(one.text).toBe(other.text);
    expect(one.detail).not.toBe(other.detail);
    expect(one.detail).toContain('у обычного поста');
  });

  it('измерение, снятое до 28.08.2026, сравнения не выдумывает', () => {
    // У таких строк числа эталона в измерении нет. Пустое место честнее
    // подставленного нуля: ноль прочитался бы как «обычный пост так никогда
    // не делает», а это утверждение, которого никто не проверял.
    const said = phrasing.phraseDeviation(
      'questions',
      { ...norm.deviationOf('questions', 20, { stats }), normMedian: null },
      'ru'
    );

    expect(said.detail).toBe('20 % вопросительных фраз');
  });

  it('где эталон не менялся, сила не называется', () => {
    /**
     * Ни один из сорока восьми постов эталона не пользуется эмодзи, поэтому
     * разброс равен нулю и расстояние измерять нечем. Полоса честна — «за
     * пределами всего виденного», — а слово «сильно» нет: сильнее чего.
     * До 28.08.2026 5,6 эмодзи на тысячу знаков и 2,2 получали одно и то же
     * предложение «сильно отличается от обычного поста».
     */
    const loud = phrasing.phraseDeviation(
      'emojiRate',
      norm.deviationOf('emojiRate', 5.6, NORM),
      'ru'
    );
    const quiet = phrasing.phraseDeviation(
      'emojiRate',
      norm.deviationOf('emojiRate', 2.2, NORM),
      'ru'
    );

    expect(loud.text).not.toMatch(/сильно|заметно/i);
    expect(loud.text).toContain('Обычный пост так не делает вовсе');
    expect(loud.detail).not.toBe(quiet.detail);
  });

  it('ни одно предложение не говорит «чем у большинства»', () => {
    // Норма — модель, а не люди. «Чаще большинства» было бы утверждением о
    // людях, которых никто не мерил.
    for (const raw of [0, 4.3, 20, 40]) {
      for (const locale of ['ru', 'en']) {
        const said = phrasing.phraseDeviation(
          'questions',
          norm.deviationOf('questions', raw, { stats }),
          locale
        );
        expect(said.text ?? '').not.toMatch(/большинств|most people|people/i);
      }
    }
    expect(
      phrasing.phraseDeviation(
        'questions',
        norm.deviationOf('questions', 20, { stats }),
        'ru'
      ).text
    ).toMatch(/обычного поста/);
  });

  it('«как обычно» называет привычку, а не её направление', () => {
    // Автор, который списками не пользуется вовсе, при норме, которая ими тоже
    // не пользуется, получал «Часто перечисляет списком: как обычный пост» —
    // предложение, утверждающее обратное собственному числу. Нейтральной
    // полосе нужно название привычки, а не направление вдоль неё.
    const lists = { listParagraphs: { median: 0, scale: 0, observed: 48 } };
    const said = phrasing.phraseDeviation(
      'listParagraphs',
      norm.deviationOf('listParagraphs', 0, { stats: lists }),
      'ru'
    );

    expect(said.text).toBe('Списки: как обычный пост');
    expect(said.text).not.toMatch(/Часто/);
  });

  it('направление сказано один раз, а не дважды', () => {
    // «Пишет короткими фразами — намного меньше обычного поста» говорит про
    // направление и в основе, и в хвосте, и во второй раз — неверно. Хвост
    // отвечает только на «насколько сильно».
    const stats = { sentenceLength: { median: 14.9, scale: 1.7, observed: 48 } };
    const said = phrasing.phraseDeviation(
      'sentenceLength',
      norm.deviationOf('sentenceLength', 10.8, { stats }),
      'ru'
    );

    expect(said.text).toBe(
      'Пишет короткими фразами. Сильно отличается от обычного поста'
    );
    expect(said.text).not.toMatch(/меньше|больше/);
  });

  it('near-absence не описывается словом «сильнее»', () => {
    // «Вопросов читателю почти не задаёт — заметно сильнее» утверждает, что
    // отсутствие привычки выражено сильно. Хвост говорит только о расстоянии
    // до нормы и потому верен по обе стороны от неё.
    const stats = { questions: { median: 4.3, scale: 4.151, observed: 48 } };
    const said = phrasing.phraseDeviation(
      'questions',
      norm.deviationOf('questions', 0, { stats }),
      'ru'
    );

    expect(said.text).toBe(
      'Вопросов читателю почти не задаёт. Заметно отличается от обычного поста'
    );
    expect(said.text).not.toMatch(/сильнее/);
  });

  it('эмодзи считаются одним и тем же классом в норме и у автора', () => {
    const fs = require('node:fs');
    const read = (file) => fs.readFileSync(file, 'utf8');
    const CLASS = String.raw`\p{Extended_Pictographic}`;

    // Три копии одного класса — три шанса посчитать разное и назвать разницу
    // привычкой.
    for (const file of [
      'libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-habits.ts',
      'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-norm.ts',
      'scripts/evidence/build-voice-norm.cjs',
    ]) {
      expect(read(file)).toContain(CLASS);
    }
  });

  it('без нормы предложение не выдумывается', () => {
    const said = phrasing.phraseDeviation(
      'questions',
      norm.deviationOf('questions', 6.2, { stats: {} }),
      'ru'
    );

    expect(said.text).toBeNull();
    expect(said.detail).toBe('6.2 % вопросительных фраз');
  });

  it('оба языка отвечают, и ни один не отвечает по-английски за русский', () => {
    const deviation = norm.deviationOf('questions', 20, { stats });

    expect(phrasing.phraseDeviation('questions', deviation, 'ru').text).toMatch(
      /[а-яё]/i
    );
    expect(phrasing.phraseDeviation('questions', deviation, 'en').text).toMatch(
      /^[\x00-\x7F\s—"']+$/
    );
  });
});

describe('два автора получают разные описания', () => {
  /**
   * Числа сняты 25.08.2026 тем же путём, каким их снимает продукт: медиана
   * `measureSingleText` по постам автора против медианы нормы. Записаны сюда
   * числами, а не пересчитываются: корпус владельца лежит на машине и в
   * репозиторий не попадает, а утверждение теста — про то, что описания
   * расходятся, а не про то, что корпус доступен.
   */
  const OWNER = {
    sentenceLength: 10.8,
    shortSentences: 36.4,
    nominalisation: 10,
    postLength: 823,
    emojiRate: 5.6,
  };
  const REPO_PROSE = {
    sentenceLength: 15.1,
    shortSentences: 24.3,
    nominalisation: 28.7,
    postLength: 1027,
    emojiRate: 0,
  };

  const bandsOf = (author) =>
    Object.fromEntries(
      Object.entries(author).map(([key, raw]) => [
        key,
        norm.deviationOf(key, raw, NORM).band,
      ])
    );

  it('владелец описан так, как его уже знает эпик', () => {
    const bands = bandsOf(OWNER);

    // Короткие посты, короткие фразы, много совсем коротких, эмодзи там, где
    // норма их не знает вовсе.
    expect(bands.postLength).toBe('far-below');
    expect(bands.sentenceLength).toBe('far-below');
    expect(bands.shortSentences).toBe('far-above');
    expect(bands.emojiRate).toBe('far-above');
  });

  it('техпроза репозитория описана иначе, а не тем же набором слов', () => {
    const owner = bandsOf(OWNER);
    const other = bandsOf(REPO_PROSE);

    const differing = Object.keys(owner).filter(
      (key) => owner[key] !== other[key]
    );
    // Если бы у всех выходило одно и то же, неверна была бы норма или мерка —
    // это прямая формулировка приёмки задачи.
    expect(differing.length).toBeGreaterThanOrEqual(3);
    expect(other.sentenceLength).toBe('typical');
    expect(other.emojiRate).toBe('typical');
  });

  it('«как обычно» достаётся не всем: это не описание по умолчанию', () => {
    const bands = Object.values(bandsOf(OWNER));

    expect(bands.filter((one) => one === 'typical').length).toBeLessThan(
      bands.length
    );
  });
});

void path;
