'use strict';

/**
 * Состав измерений и два правила счёта, которые сравнивают по нему.
 *
 * Главный факт эпика — не про состав, а про правило: сегодняшнее правило
 * («удивление» относительно одного лишь автора) максимально РОВНО В МОДЕ
 * распределения, а генератор, которому привычки автора описаны в промпте,
 * воспроизводит моду точнее живого человека. Значит `calmScore` обязан
 * проигрывать генератору, стоящему в моде, — это не баг эталонного правила, а
 * то самое свойство, ради которого задача меняет правило на `ratioScore`.
 * Тест на `calmScore` ниже закрепляет именно это число, чтобы правило нельзя
 * было тихо «починить» обратно, не заметив, зачем его меняли.
 *
 * Стата и правила протестированы отдельно от `compose()`: `compose()` тянет
 * `buildRuler`, который грузит TS-модули анализатора и требует настоящих
 * корпусов. Здесь всё синтетическое и не читает ни базу, ни сохранённые
 * прогоны — числа подобраны так, чтобы результат правила был известен заранее,
 * и тест проверял именно арифметику, а не совпадение с чужим прогоном.
 */

const {
  auc,
  spread,
  statisticsFor,
  calmScore,
  ratioScore,
  COMPOSITIONS,
  ALL_METRICS,
  LAYOUT,
  VISIBLE,
  RHYTHM,
  LEGACY,
} = require('../scripts/evidence/voice-eval/composition.cjs');

// Раскладка не экспортирована по отдельности — только внутри LAYOUT, тем же
// способом, каким её берёт statisticsFor.
const { softBreakPer1k, blockBreakPer1k, meanBlockChars, oneSentenceBlockShare } = LAYOUT;

describe('auc — доля пар, где своё число больше чужого', () => {
  // Внимание: здесь «своё больше» побеждает (mine > other) — это правило
  // оценок (calmScore, ratioScore), где больше значит лучше. У соседнего
  // discrimination.cjs своя auc(), и там побеждает mine < other, потому что
  // там сравниваются расстояния, где меньше значит ближе. Числа ниже подобраны
  // под правило ЭТОГО модуля, а не скопированы из соседнего файла.
  it('полное разделение — единица', () => {
    expect(auc([0.7, 0.8], [0.1, 0.2, 0.3])).toBe(1);
  });

  it('полное разделение наоборот — ноль', () => {
    expect(auc([0.1, 0.2, 0.3], [0.7, 0.8])).toBe(0);
  });

  it('совпадающие множества — монета', () => {
    expect(auc([0.5, 0.5], [0.5, 0.5])).toBe(0.5);
  });

  it('ничья считается половиной, а не победой', () => {
    // Четыре пары: (0.5,0.4) и (0.6,0.4) и (0.6,0.5) — победа, (0.5,0.5) —
    // ничья. Три выигранных и одна ничья, то есть 3,5 из 4.
    expect(auc([0.5, 0.6], [0.4, 0.5])).toBe(0.875);
  });

  it('пустая сторона молчит null-ом, а не нулём', () => {
    expect(auc([], [0.5])).toBeNull();
    expect(auc([0.5], [])).toBeNull();
  });
});

describe('spread — разброс с полом по объединению', () => {
  /**
   * У признака, где больше половины значений совпадают (как у эмодзи —
   * «нет» в большинстве постов), MAD своей же стороны — ноль: медиана
   * отклонений от медианы тоже ноль. Без пола по объединению измерение
   * молча выключалось бы из состава. Здесь мода — 2 (три значения из пяти
   * лежат на ней ровно), а объединение с фоном достаточно разбросано,
   * чтобы дать ненулевой, определённый разброс.
   */
  it('своя сторона вырождена в ноль — берёт ИМЕННО MAD объединения, а не любое правдоподобное число', () => {
    // own: MAD([0,2,2,2,6]) === 0 — мода 2 держит больше половины значений.
    // Фон [5,6,7,8,9] даёт объединению MAD ≈ 4,4478, а половину его размаха —
    // 2,25: числа заведомо разные, так что проверка «не ноль» их не отличает
    // друг от друга. Заявлено: возвращается MAD объединения, а не запасное
    // число из следующей по очереди ветки — тест сверяет именно его.
    const own = [0, 2, 2, 2, 6];
    const pool = [...own, 5, 6, 7, 8, 9];

    expect(spread(own, pool)).toBeCloseTo(4.4478, 4);
  });

  it('MAD объединения тоже ноль — уходит на размах, и это тоже конкретное число', () => {
    // own и pool оба дают MAD объединения === 0 (пятёрка — мода и там, и там),
    // но размах объединения — 4, а не 0. Третья ветка обязана вернуть именно
    // span/4 = 1, а не молча остановиться на нуле из второй ветки.
    const own = [5, 5, 5, 5, 1];
    const pool = [...own, 5, 5];

    expect(spread(own, pool)).toBe(1);
  });

  it('объединение тоже вырождено в одну точку — null, а не деление на ноль', () => {
    // own и pool — одна и та же точка: и MAD, и размах равны нулю.
    expect(spread([5, 5, 5], [5, 5, 5])).toBeNull();
  });
});

describe('calmScore — эталонное правило проигрывает генератору, стоящему в моде', () => {
  /**
   * Синтетика в один признак (`exclamPer1k`), чтобы значение метрики было
   * известно заранее: текст длиной ровно 1000 знаков, где n из них — «!»,
   * даёт exclamPer1k === n напрямую.
   *
   * Мода автора объявлена равной 2. Отложенные посты автора разбросаны
   * вокруг неё (0, 1, 3, 4 — ни один не стоит в самой моде), а генератор
   * снова и снова попадает точно в 2, потому что мода — это то, что описано
   * ему в промпте. Ожидание — не то, что тест «может» показать: это то
   * самое свойство, которое задача просит устранить сменой правила, и
   * здесь оно закреплено числом, чтобы никто не «починил» calmScore
   * обратно, не заметив последствий.
   */
  const textWithExclaim = (count) => '!'.repeat(count) + 'a'.repeat(1000 - count);

  const stats = {
    exclamPer1k: { authorCentre: 2, authorSpread: 1.5, backgroundCentre: null, backgroundSpread: null },
  };

  it('генератор в моде получает оценку лучше живого автора — AUC ниже монеты', () => {
    const holdout = [0, 1, 3, 4].map(textWithExclaim); // отложенные посты автора
    const shipped = [2, 2, 2].map(textWithExclaim); // генерация — всегда точно в моде

    const score = (text) => calmScore(text, stats, ['exclamPer1k']);
    const result = auc(holdout.map(score), shipped.map(score));

    // Полное разделение наоборот: каждый пост автора дальше от моды, чем
    // генерация, значит каждый пост автора проигрывает каждой генерации.
    expect(result).toBe(0);
    expect(result).toBeLessThan(0.5);
  });
});

describe('ratioScore — отличает автора от фона, но не выдумывает разницу вслепую', () => {
  const textWithExclaim = (count) => '!'.repeat(count) + 'a'.repeat(1000 - count);
  const score = (stats) => (text) => ratioScore(text, stats, ['exclamPer1k']);

  it('фон отличается от автора — правило разделяет заметно лучше монеты', () => {
    const stats = {
      exclamPer1k: { authorCentre: 2, authorSpread: 1, backgroundCentre: 5, backgroundSpread: 1 },
    };
    const nearAuthor = [1, 2, 3].map(textWithExclaim);
    const nearBackground = [6, 7, 8].map(textWithExclaim);

    const rule = score(stats);
    expect(auc(nearAuthor.map(rule), nearBackground.map(rule))).toBe(1);
  });

  it('фон совпадает с автором — те же тексты не дают разделения', () => {
    // Те же две группы текстов, но фон объявлен той же точкой, что и автор:
    // «ближе к автору» и «ближе к фону» совпадают для любого текста, вклад
    // всегда ноль, и разделения нет — правило не выдумывает сигнал там, где
    // сторон фактически одна.
    const stats = {
      exclamPer1k: { authorCentre: 2, authorSpread: 1, backgroundCentre: 2, backgroundSpread: 1 },
    };
    const nearAuthor = [1, 2, 3].map(textWithExclaim);
    const nearBackground = [6, 7, 8].map(textWithExclaim);

    const rule = score(stats);
    expect(auc(nearAuthor.map(rule), nearBackground.map(rule))).toBe(0.5);
  });
});

describe('обрезка вклада — CLAMP держит один признак в рамке ±4', () => {
  it('дикий выброс не может утащить вклад дальше границы', () => {
    // Автор — точечный (spread 0,01), фон — широкий (spread 100), а текст
    // стоит далеко от обоих. Без обрезки разность расстояний ушла бы в
    // десятки тысяч; с обрезкой одно измерение не может дать больше ±4.
    const stats = {
      exclamPer1k: { authorCentre: 0, authorSpread: 0.01, backgroundCentre: 0, backgroundSpread: 100 },
    };
    const text = '!'.repeat(500) + 'a'.repeat(500); // exclamPer1k === 500

    const result = ratioScore(text, stats, ['exclamPer1k']);

    expect(result).toBe(-4);
    expect(Math.abs(result)).toBeLessThanOrEqual(4);
  });
});

describe('statisticsFor — обе стороны по каждому измерению из ALL_METRICS', () => {
  it('ни одно измерение не теряется молча', () => {
    const author = ['Первый пост автора.\n\nВторой абзац поста.', 'Ещё один пост, короче.'];
    const background = ['Фоновый текст модели без голоса.', 'Второй фоновый текст, другой длины совсем.'];

    const stats = statisticsFor(author, background);

    expect(Object.keys(stats).sort()).toEqual(Object.keys(ALL_METRICS).sort());
    for (const key of Object.keys(ALL_METRICS)) {
      expect(stats[key]).toHaveProperty('authorCentre');
      expect(stats[key]).toHaveProperty('authorSpread');
      expect(stats[key]).toHaveProperty('backgroundCentre');
      expect(stats[key]).toHaveProperty('backgroundSpread');
      // Центр посчитан по непустой стороне — не undefined и не пропущен.
      expect(stats[key].authorCentre).not.toBeUndefined();
      expect(stats[key].backgroundCentre).not.toBeUndefined();
    }
  });
});

describe('COMPOSITIONS — состав объявлен заранее, а не подобран по числам', () => {
  it('proposed — ровно объединение LAYOUT, VISIBLE и RHYTHM, без потерь и без лишнего', () => {
    const expected = [...Object.keys(LAYOUT), ...Object.keys(VISIBLE), ...Object.keys(RHYTHM)].sort();
    expect([...COMPOSITIONS.proposed.keys].sort()).toEqual(expected);
  });

  it('legacy не пересекается с LAYOUT — раскладка сегодня не измеряется вовсе', () => {
    const layoutKeys = new Set(Object.keys(LAYOUT));
    const overlap = COMPOSITIONS.legacy.keys.filter((key) => layoutKeys.has(key));
    expect(overlap).toEqual([]);
  });

  it('ни один ключ ни одного состава не отсутствует в ALL_METRICS', () => {
    const known = new Set(Object.keys(ALL_METRICS));
    for (const composition of Object.values(COMPOSITIONS)) {
      for (const key of composition.keys) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it('LEGACY тоже целиком входит в ALL_METRICS — сравнение не тянет посторонний код', () => {
    const known = new Set(Object.keys(ALL_METRICS));
    for (const key of Object.keys(LEGACY)) {
      expect(known.has(key)).toBe(true);
    }
  });
});

describe('измерения раскладки — по одному короткому случаю на каждое', () => {
  it('softBreakPer1k считает одиночный перенос и не считает двойной', () => {
    expect(softBreakPer1k('a\nb')).toBeCloseTo(1000 / 3, 6); // один перенос, длина 3
    expect(softBreakPer1k('a\n\nb')).toBe(0); // перенос парный — это уже блочный
  });

  it('blockBreakPer1k считает двойной перенос и не считает одиночный', () => {
    expect(blockBreakPer1k('a\n\nb')).toBeCloseTo(1000 / 4, 6); // один блочный разрыв, длина 4
    expect(blockBreakPer1k('a\nb')).toBe(0); // одиночный перенос блоком не считается
  });

  it('meanBlockChars — среднее по известным длинам двух блоков', () => {
    // Блоки после разбора: "abc" (3 знака) и "defgh" (5 знаков) — среднее 4.
    expect(meanBlockChars('abc\n\ndefgh')).toBe(4);
  });

  it('oneSentenceBlockShare — доля блоков ровно с одним предложением', () => {
    // Блок 1: "Hello world." — одно предложение. Блок 2: "One. Two." — два.
    // Один однопредложенческий блок из двух — 50%.
    expect(oneSentenceBlockShare('Hello world.\n\nOne. Two.')).toBe(50);
  });
});
