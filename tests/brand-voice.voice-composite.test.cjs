'use strict';

/**
 * Продуктовый `scoreComposite` и вторая мерка стенда (`ratioScore` из
 * `scripts/evidence/voice-eval/composition.cjs`) обязаны быть ОДНОЙ и той же
 * арифметикой. Приёмочные проценты эпика (82,3 / 82,6 / 87,6%, задокументированы
 * в `voice-composite.ts`) сняты стендом; если продукт считает иначе — эти числа
 * относятся не к тому коду, который отгружается. Главный тест ниже — страж
 * именно этого; всё остальное — арифметика самого `scoreComposite`, которую
 * стенд не проверяет вовсе (у него нет ни `MIN_COMPOSITE_METRICS`, ни версии,
 * ни разбора по измерениям для экрана).
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const C = require('../scripts/evidence/voice-eval/composition.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const {
  scoreComposite,
  judgingSidesOf,
  COMPOSITE_JUDGING_METRICS,
  COMPOSITE_CLAMP,
  MIN_COMPOSITE_METRICS,
} = loadTypeScriptModule(`${BASE}/voice-composite.ts`);

/**
 * Имена стенда → имена продукта.
 *
 * Ровно та же карта, которой сверка проводилась вручную на трёх настоящих
 * корпусах (0,000 пункта расхождения на owner/avetov/britva). Здесь она же
 * держит соответствие постоянно, а не разово.
 */
const MAP = {
  softBreakPer1k: 'softBreakRate',
  blockBreakPer1k: 'blockBreakRate',
  meanBlockChars: 'meanBlockChars',
  oneSentenceBlockShare: 'oneSentenceBlockShare',
  emojiPer1k: 'emojiRate',
  digitShare: 'digitShare',
  sentenceLengthWords: 'sentenceLength',
  shortSentenceShare: 'shortSentences',
};

/* ------------------------------------------------------------------ *
 * Синтетические корпуса для равносильности.
 *
 * Настоящие корпуса (owner/avetov/britva) требуют минут прогона и кэшей,
 * которых нет в git. Здесь то же свойство проверяется на текстах, написанных
 * прямо в файле: они собраны так, чтобы у ВСЕХ восьми судящих измерений был
 * настоящий (не вырожденный) разброс на ОБЕИХ сторонах — иначе сверка тихо
 * проверяла бы часть измерений, а не все восемь.
 * ------------------------------------------------------------------ */

const WORDS = [
  'текст', 'автор', 'пишет', 'сегодня', 'просто', 'быстро', 'голос', 'ладно',
  'снова', 'смысл', 'фраза', 'ровно', 'важно', 'коротко', 'длинно', 'чуть',
];

const sentence = ({ wordCount, startAt, digit, emoji }) => {
  const words = Array.from({ length: wordCount }, (_, i) => WORDS[(startAt + i) % WORDS.length]);
  if (digit) words.push('42'); // числовой токен — топливо для digitShare
  if (emoji) words.push('🙂'); // не считается словом (не буква и не цифра), топливо для emojiRate
  return words.join(' ') + '.';
};

/**
 * Пост из блоков с управляемыми параметрами.
 *
 * `softBreaks: true` даёт перенос строки МЕЖДУ предложениями одного блока —
 * то есть мягкий перенос из докстринга `voice-composite.ts`. `softBreaks:
 * false` склеивает предложения блока пробелом — ровный абзац, как пишет
 * генератор без голоса.
 */
function post({ blocks, sentencesPerBlock, wordCount, softBreaks, digitEvery, emojiEvery }) {
  let n = 0;
  const blockList = [];
  for (let b = 0; b < blocks; b += 1) {
    const sentences = [];
    for (let s = 0; s < sentencesPerBlock; s += 1) {
      sentences.push(sentence({
        wordCount,
        startAt: n,
        digit: digitEvery > 0 && n % digitEvery === 0,
        emoji: emojiEvery > 0 && n % emojiEvery === 0,
      }));
      n += 1;
    }
    blockList.push(sentences.join(softBreaks ? '\n' : ' '));
  }
  return blockList.join('\n\n');
}

/**
 * Автор: мягкие переносы, короткие предложения (часть — блок из одного),
 * умеренные числа и эмодзи. Параметры варьируются по индексу, чтобы разброс
 * был ненулевым ВНУТРИ этой же стороны, а не только между автором и фоном.
 */
const AUTHOR_TEXTS = Array.from({ length: 10 }, (_, i) => post({
  blocks: 1 + (i % 3),
  sentencesPerBlock: 1 + (i % 3),
  wordCount: 3 + (i % 6),
  softBreaks: true,
  digitEvery: (i % 4) + 2,
  emojiEvery: (i % 3) + 2,
}));

/**
 * Фон: ровные абзацы без переносов внутри блока, предложения длиннее, ни
 * цифр, ни эмодзи вовсе — как норма §3.5 в докстринге модуля. Это законно
 * даёт `digitShare`/`emojiRate` нулевую МЕДИАНУ фона; сам разброс здесь
 * ненулевой всё равно берётся через пул (`spread()` стенда), что и есть
 * реальное поведение обеих реализаций на этом крае.
 */
const BACKGROUND_TEXTS = Array.from({ length: 10 }, (_, i) => post({
  blocks: 1 + (i % 2),
  sentencesPerBlock: 2 + (i % 3),
  wordCount: 10 + (i % 7),
  softBreaks: false,
  digitEvery: 0,
  emojiEvery: 0,
}));

/** Несколько текстов за пределами обоих корпусов — короткий, длинный, кричащий. */
const EXTRA_JUDGE_TEXTS = [
  post({ blocks: 1, sentencesPerBlock: 1, wordCount: 2, softBreaks: true, digitEvery: 0, emojiEvery: 0 }),
  post({ blocks: 4, sentencesPerBlock: 5, wordCount: 20, softBreaks: false, digitEvery: 1, emojiEvery: 1 }),
  'Одно. Два три четыре пять шесть семь восемь девять десять одиннадцать.',
  '🙂🙂🙂 42 42 42 короткий текст без всего остального вообще совсем.',
];

const JUDGE_TEXTS = [...AUTHOR_TEXTS, ...BACKGROUND_TEXTS, ...EXTRA_JUDGE_TEXTS];

const STAND_KEYS = C.COMPOSITIONS.earning.keys;

/** Продуктовые `CompositeSides`, собранные из статистики стенда через MAP. */
function sidesFromStats(stats) {
  const sides = { author: {}, background: {} };
  for (const standKey of STAND_KEYS) {
    const one = stats[standKey];
    const productKey = MAP[standKey];
    sides.author[productKey] = { median: one.authorCentre, scale: one.authorSpread ?? 0 };
    sides.background[productKey] = { median: one.backgroundCentre, scale: one.backgroundSpread ?? 0 };
  }
  return sides;
}

/** Продуктовый вход `measured`, снятый теми же метриками стенда, переименованными по MAP. */
function measuredFor(text) {
  const out = {};
  for (const standKey of STAND_KEYS) out[MAP[standKey]] = C.ALL_METRICS[standKey](text);
  return out;
}

describe('равносильность со стендом — scoreComposite и ratioScore считают одно и то же', () => {
  it('MAP покрывает ровно COMPOSITE_JUDGING_METRICS, без пропусков и лишнего', () => {
    // Если карта разъедется с продуктовым набором судящих измерений, сверка
    // ниже тихо проверяла бы не весь состав, а его часть.
    expect(Object.keys(MAP).sort()).toEqual([...STAND_KEYS].sort());
    expect(Object.values(MAP).sort()).toEqual([...COMPOSITE_JUDGING_METRICS].sort());
  });

  it('на каждом из синтетических текстов оба правила дают одно число с точностью не хуже 1e-12', () => {
    const stats = C.statisticsFor(AUTHOR_TEXTS, BACKGROUND_TEXTS);
    const sides = sidesFromStats(stats);

    for (const text of JUDGE_TEXTS) {
      const standScore = C.ratioScore(text, stats, STAND_KEYS);
      const product = scoreComposite(measuredFor(text), sides);

      // Оба разброса на этой синтетике ненулевые у всех восьми измерений
      // (проверено при подготовке текстов) — значит все восемь обязаны
      // засчитаться с обеих сторон, а не только часть.
      expect(product.counted).toBe(COMPOSITE_JUDGING_METRICS.length);
      expect(product.score).toBeCloseTo(standScore, 12);
    }
  });
});

describe('deviation — вырожденный разброс (scale === 0) не делит на ноль', () => {
  const sides = {
    author: { emojiRate: { median: 3, scale: 0 } },
    background: { emojiRate: { median: 3, scale: 0 } },
  };

  it('совпадение с вырожденной серединой — ноль отклонений с обеих сторон, счёт ноль', () => {
    // MIN_COMPOSITE_METRICS === 3 по умолчанию, поэтому одного измерения мало
    // для числового счёта — здесь важны сами contributions, не итог.
    const result = scoreComposite({ emojiRate: 3 }, sides);
    const [one] = result.contributions;
    expect(one.fromAuthor).toBe(0);
    expect(one.fromBackground).toBe(0);
    expect(one.contribution).toBe(0);
  });

  it('любое отличие от вырожденной середины — ровно COMPOSITE_CLAMP, не Infinity и не NaN', () => {
    const result = scoreComposite({ emojiRate: 9 }, sides);
    const [one] = result.contributions;
    expect(one.fromAuthor).toBe(COMPOSITE_CLAMP);
    expect(one.fromBackground).toBe(COMPOSITE_CLAMP);
    expect(Number.isFinite(one.fromAuthor)).toBe(true);
    expect(Number.isFinite(one.fromBackground)).toBe(true);
    expect(Number.isFinite(one.contribution)).toBe(true);
  });
});

describe('измерение, известное автору и не известное фону, не участвует', () => {
  const sides = {
    author: {
      softBreakRate: { median: 5, scale: 2 },
      blockBreakRate: { median: 1, scale: 0.5 },
      meanBlockChars: { median: 200, scale: 40 },
      emojiRate: { median: 2, scale: 1 }, // у фона этого измерения нет вовсе
    },
    background: {
      softBreakRate: { median: 1, scale: 1 },
      blockBreakRate: { median: 3, scale: 0.5 },
      meanBlockChars: { median: 400, scale: 40 },
    },
  };
  const measured = { softBreakRate: 5, blockBreakRate: 1, meanBlockChars: 200, emojiRate: 2 };

  it('не входит в contributions', () => {
    const result = scoreComposite(measured, sides);
    expect(result.contributions.map((one) => one.metric)).not.toContain('emojiRate');
  });

  it('не входит в counted — молчаливая подстановка нуля объявила бы то, чего никто не измерял', () => {
    const result = scoreComposite(measured, sides);
    expect(result.counted).toBe(3);
  });
});

describe('null, undefined и NaN у измерения — пропускаются, а не считаются нулём', () => {
  const sides = {
    author: {
      softBreakRate: { median: 5, scale: 2 },
      blockBreakRate: { median: 1, scale: 0.5 },
      meanBlockChars: { median: 200, scale: 40 },
      emojiRate: { median: 2, scale: 1 },
    },
    background: {
      softBreakRate: { median: 1, scale: 1 },
      blockBreakRate: { median: 3, scale: 0.5 },
      meanBlockChars: { median: 400, scale: 40 },
      emojiRate: { median: 0, scale: 1 },
    },
  };

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
  ])('%s пропускает измерение целиком', (_label, value) => {
    const measured = { softBreakRate: 5, blockBreakRate: 1, meanBlockChars: 200, emojiRate: value };
    const result = scoreComposite(measured, sides);
    expect(result.contributions.map((one) => one.metric)).not.toContain('emojiRate');
    expect(result.counted).toBe(3);
  });
});

describe('MIN_COMPOSITE_METRICS — порог молчания', () => {
  const sides = {
    author: {
      softBreakRate: { median: 5, scale: 2 },
      blockBreakRate: { median: 1, scale: 0.5 },
      meanBlockChars: { median: 200, scale: 40 },
    },
    background: {
      softBreakRate: { median: 1, scale: 1 },
      blockBreakRate: { median: 3, scale: 0.5 },
      meanBlockChars: { median: 400, scale: 40 },
    },
  };

  it('два измерения — счёта нет, причина названа', () => {
    const result = scoreComposite({ softBreakRate: 5, blockBreakRate: 1 }, sides);
    expect(result.counted).toBe(2);
    expect(result.score).toBeNull();
    expect(result.reason).toBe('TOO_FEW_METRICS');
    expect(MIN_COMPOSITE_METRICS).toBe(3);
  });

  it('три измерения — уже число, причины нет', () => {
    const result = scoreComposite({ softBreakRate: 5, blockBreakRate: 1, meanBlockChars: 200 }, sides);
    expect(result.counted).toBe(3);
    expect(typeof result.score).toBe('number');
    expect(result.reason).toBeUndefined();
  });
});

describe('обрезка — один дикий выброс не уводит сумму дальше ±COMPOSITE_CLAMP', () => {
  // Автор — точечный (crazy маленький scale), фон — широкий; текст стоит
  // очень далеко от обоих. Три нормальных измерения плюс один выброс — чтобы
  // порог MIN_COMPOSITE_METRICS не мешал увидеть итог.
  const sides = {
    author: {
      softBreakRate: { median: 5, scale: 2 },
      blockBreakRate: { median: 1, scale: 0.5 },
      meanBlockChars: { median: 200, scale: 40 },
      emojiRate: { median: 0, scale: 0.001 },
    },
    background: {
      softBreakRate: { median: 1, scale: 1 },
      blockBreakRate: { median: 3, scale: 0.5 },
      meanBlockChars: { median: 400, scale: 40 },
      emojiRate: { median: 0, scale: 100 },
    },
  };
  const measured = { softBreakRate: 5, blockBreakRate: 1, meanBlockChars: 200, emojiRate: 500 };

  it('вклад выброса не превышает COMPOSITE_CLAMP по модулю', () => {
    const result = scoreComposite(measured, sides);
    const outlier = result.contributions.find((one) => one.metric === 'emojiRate');
    expect(Math.abs(outlier.contribution)).toBeLessThanOrEqual(COMPOSITE_CLAMP);
  });

  it('итоговый счёт остаётся конечным числом', () => {
    const result = scoreComposite(measured, sides);
    expect(Number.isFinite(result.score)).toBe(true);
  });
});

describe('знак — сторона, к которой текст ближе, определяет знак счёта', () => {
  const sides = {
    author: {
      softBreakRate: { median: 5, scale: 1 },
      blockBreakRate: { median: 1, scale: 0.3 },
      meanBlockChars: { median: 200, scale: 20 },
    },
    background: {
      softBreakRate: { median: 1, scale: 1 },
      blockBreakRate: { median: 3, scale: 0.3 },
      meanBlockChars: { median: 400, scale: 20 },
    },
  };

  it('текст на медиане автора и далеко от фона — счёт больше нуля', () => {
    const measured = { softBreakRate: 5, blockBreakRate: 1, meanBlockChars: 200 };
    const result = scoreComposite(measured, sides);
    expect(result.score).toBeGreaterThan(0);
  });

  it('текст на медиане фона и далеко от автора — счёт меньше нуля', () => {
    const measured = { softBreakRate: 1, blockBreakRate: 3, meanBlockChars: 400 };
    const result = scoreComposite(measured, sides);
    expect(result.score).toBeLessThan(0);
  });
});

describe('judgingSidesOf — только судящие измерения, без посторонних и без пустышек', () => {
  const sides = {
    author: {
      softBreakRate: { median: 5, scale: 1 },
      blockBreakRate: { median: 1, scale: 0.3 },
      // meanBlockChars — судящее измерение, но автор его не знает.
      capsWordShare: { median: 10, scale: 2 }, // описательное — сюда не входит
    },
    background: {
      softBreakRate: { median: 1, scale: 1 },
      blockBreakRate: { median: 3, scale: 0.3 },
      meanBlockChars: { median: 400, scale: 20 },
      exclamPer1k: { median: 5, scale: 1 }, // описательное — сюда не входит
    },
  };

  it('оставляет только COMPOSITE_JUDGING_METRICS, выбрасывая посторонние ключи с обеих сторон', () => {
    const picked = judgingSidesOf(sides);
    expect(Object.keys(picked.author).sort()).toEqual(['blockBreakRate', 'softBreakRate']);
    expect(Object.keys(picked.background).sort()).toEqual(['blockBreakRate', 'meanBlockChars', 'softBreakRate']);
  });

  it('отсутствующее у стороны измерение не появляется в результате пустышкой', () => {
    const picked = judgingSidesOf(sides);
    expect(picked.author).not.toHaveProperty('meanBlockChars');
    expect(picked.background).not.toHaveProperty('emojiRate');
  });
});

describe('COMPOSITE_JUDGING_METRICS — состав закреплён, а не собран из всех известных ключей', () => {
  it('не содержит описательные измерения из §5.3', () => {
    // Каждое дало ровно 50,0% на всех трёх корпусах поодиночке (capsWordShare,
    // exclamPer1k, questionShare) либо избыточно с длиной фразы (sentenceSpread) —
    // числа в §5.2/§5.3 спецификации. Страж держит это решение от возврата
    // «на всякий случай».
    expect(COMPOSITE_JUDGING_METRICS).not.toContain('capsWordShare');
    expect(COMPOSITE_JUDGING_METRICS).not.toContain('exclamPer1k');
    expect(COMPOSITE_JUDGING_METRICS).not.toContain('questionShare');
    expect(COMPOSITE_JUDGING_METRICS).not.toContain('sentenceSpread');
  });

  it('состав — ровно восемь объявленных измерений, в объявленном порядке', () => {
    expect(COMPOSITE_JUDGING_METRICS).toEqual([
      'softBreakRate',
      'blockBreakRate',
      'meanBlockChars',
      'oneSentenceBlockShare',
      'emojiRate',
      'digitShare',
      'sentenceLength',
      'shortSentences',
    ]);
  });
});
