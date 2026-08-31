'use strict';

/**
 * `content-factory-next-pl1.7` — пересобрать состав измерений.
 *
 * ## Что спрашивается
 *
 * Восемь нынешних шкал про оформление отделяют автора от чужой прозы в 48% пар,
 * а составная мерка привычек поста против генерации под его же голосом даёт
 * 40,3 / 30,8 / 42,8% на трёх корпусах — хуже монеты. Задача просит другой
 * СОСТАВ измерений.
 *
 * ## Что здесь измерено сверх задачи, и почему без этого нельзя
 *
 * Состав — половина ответа. Вторая половина — ПРАВИЛО СЧЁТА, и она оказалась
 * связывающей.
 *
 * Сегодняшнее правило — одноклассовое удивление под маргиналами автора:
 * `-log p(признак)` по вероятностям, снятым с его корпуса. Такая величина
 * максимальна В МОДЕ распределения. А генератор, которому привычки автора
 * описаны в промпте, воспроизводит моду РОВНЕЕ, чем живой автор: у владельца
 * ссылка стоит в 15,6% отложенных постов, у генерации — в 0%, и мода «ссылки
 * нет» достаётся генерации в 100% случаев против 84,4% у автора. То же на всех
 * шести привычках и на всех трёх корпусах.
 *
 * Отсюда следствие, которое не зависит от выбора признаков: пока правило
 * одноклассовое, ЛЮБОЙ состав, описанный модели, будет проигран генерации.
 * Прогон это подтверждает — новый состав под старым правилом даёт 41,7%
 * худшего корпуса, то есть хуже нынешнего.
 *
 * Второе правило сравнивает текст с автором И С ФОНОМ: настолько ли он ближе к
 * автору, чем к тому, как пишет машина без голоса. Ни одного подобранного веса:
 * вклад каждого измерения — разность двух устойчивых z, обрезанная сверху,
 * чтобы одно дикое измерение не захватило сумму.
 *
 * ## Что здесь НЕ делается
 *
 * Состав не отбирается по этим же числам. Отбор на трёх корпусах — подгонка на
 * трёх наблюдениях, и её цена измерена: жадный отбор на двух корпусах даёт на
 * третьем 54,1 / 75,5 / 50,0% против генерации, то есть распадается до монеты.
 * Поэтому составы объявлены заранее — по четырём вопросам задачи, — а числа
 * названы после.
 *
 * Ни одного вызова модели.
 */

const { buildRuler } = require('./ruler.cjs');
const { loadTypeScriptModule } = require('../../../tests/helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const {
  measureJudgingMetrics,
  scoreComposite,
  judgingSidesOf,
  COMPOSITE_JUDGING_METRICS,
} = loadTypeScriptModule(`${BASE}/voice-composite.ts`);
const { RU_LOCALE_PACK } = loadTypeScriptModule(`${BASE}/locale-pack.ru.ts`);

/**
 * Отгружаемый состав считается ПРОДУКТОВЫМ кодом, а не здешним.
 *
 * Здешние определения ниже — разведка: ими перебирались кандидаты, и они
 * останутся для сравнения с нынешним составом. Но число, которым отчитывается
 * приёмка, обязано быть посчитано тем кодом, который отгружается.
 *
 * Цена этого правила измерена и оказалась немалой. Одни и те же восемь
 * измерений дают 77,8 / 82,5 / 85,2 здешней арифметикой и **74,5 / 77,0 /
 * 85,7** продуктовой: `measureSingleText` округляет до десятой, предложения
 * режет `splitSentences` по словарю языка, а не регулярным выражением, и
 * `observeLayout` сворачивает `\r\n` до счёта. Разница до 5,5 пункта — ровно
 * то расхождение двух реализаций, о котором предупреждает `habit-screen.cjs`,
 * и поймано оно только потому, что стенд заставили звать продукт.
 */
const PRODUCT_METRICS = Object.fromEntries(
  COMPOSITE_JUDGING_METRICS.map((key) => [
    `product:${key}`,
    (text) => measureJudgingMetrics(text, RU_LOCALE_PACK)[key] ?? 0,
  ])
);

const CUT = 800;
const SHIPPED_VARIANT = 'product';
/** Фон: то, что модель пишет, когда голоса нет вовсе. */
const BACKGROUND_VARIANT = 'none';

/* ------------------------------------------------------------------ *
 * Измерения. Все — уровня A: словарь не нужен ни на одном языке.
 * ------------------------------------------------------------------ */

const sentencesOf = (text) =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((one) => one.trim())
    .filter(Boolean);

const wordsOf = (text) => text.match(/[\p{L}\p{N}]+/gu) ?? [];
const per1k = (count, text) => (text.length ? (1000 * count) / text.length : 0);
const blocksOf = (text) =>
  text
    .split(/\n\s*\n/)
    .map((one) => one.trim())
    .filter(Boolean);

/**
 * Раскладка поста — четыре измерения, которых сегодня нет ни одного.
 *
 * Их не было в составе потому, что все восемь шкал делят на предложение или на
 * абзац, а сама расстановка переносов не измерялась. И ровно она оказалась тем,
 * что генератор не воспроизводит: ему про переносы никто ничего не говорит.
 *
 * Живой автор канала ставит мягкий перенос внутри абзаца — строку под строкой
 * без пустой строки между ними. Модель пишет ровными блоками через пустую
 * строку. У владельца мягких переносов 4,26 на тысячу знаков против 0,00 у
 * генерации; у Бритвы 5,09 против 1,25.
 */
const LAYOUT = {
  softBreakPer1k: (text) => per1k((text.match(/(?<!\n)\n(?!\n)/g) ?? []).length, text),
  blockBreakPer1k: (text) => per1k((text.match(/\n\s*\n/g) ?? []).length, text),
  meanBlockChars: (text) => {
    const blocks = blocksOf(text);
    return blocks.length
      ? blocks.reduce((sum, one) => sum + one.length, 0) / blocks.length
      : 0;
  },
  oneSentenceBlockShare: (text) => {
    const blocks = blocksOf(text);
    return blocks.length
      ? (100 * blocks.filter((one) => sentencesOf(one).length === 1).length) /
          blocks.length
      : 0;
  },
};

/** Видимые привычки: то, что читатель замечает, не вчитываясь. */
const VISIBLE = {
  emojiPer1k: (text) => per1k((text.match(/\p{Extended_Pictographic}/gu) ?? []).length, text),
  digitShare: (text) =>
    text.length ? (100 * (text.match(/\d/g) ?? []).length) / text.length : 0,
  capsWordShare: (text) => {
    const list = wordsOf(text).filter((one) => one.length >= 3);
    return list.length
      ? (100 * list.filter((one) => one === one.toUpperCase() && /\p{L}/u.test(one)).length) /
          list.length
      : 0;
  },
  exclamPer1k: (text) => per1k((text.match(/!/g) ?? []).length, text),
};

/** Ритм фразы: три шкалы из нынешних восьми, которые остаются. */
const RHYTHM = {
  sentenceLengthWords: (text) => {
    const list = sentencesOf(text);
    return list.length
      ? list.reduce((sum, one) => sum + wordsOf(one).length, 0) / list.length
      : 0;
  },
  shortSentenceShare: (text) => {
    const list = sentencesOf(text);
    return list.length
      ? (100 * list.filter((one) => wordsOf(one).length < 8).length) / list.length
      : 0;
  },
  questionShare: (text) => {
    const list = sentencesOf(text);
    return list.length
      ? (100 * list.filter((one) => one.endsWith('?')).length) / list.length
      : 0;
  },
};

/**
 * Нынешний состав, воспроизведённый здесь для сравнения.
 *
 * Четыре из восьми: остальные четыре требуют словаря языка и на этом стенде
 * считались бы другим кодом, чем в продукте. Сравнение идёт по тем, которые
 * воспроизводимы дословно.
 */
const LEGACY = {
  sentenceLengthWords: RHYTHM.sentenceLengthWords,
  shortSentenceShare: RHYTHM.shortSentenceShare,
  questionShare: RHYTHM.questionShare,
  commaPerSentence: (text) => {
    const list = sentencesOf(text);
    return list.length ? (text.match(/,/g) ?? []).length / list.length : 0;
  },
  /**
   * Разброс длин фразы — измерение, которое задача просит убрать.
   *
   * Здесь оно стоит ровно затем, чтобы у снятия была цена, названная числом,
   * а не довод.
   */
  sentenceSpread: (text) => {
    const lengths = sentencesOf(text).map((one) => wordsOf(one).length);
    if (lengths.length < 2) return 0;
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean === 0) return 0;
    const variance =
      lengths.reduce((sum, one) => sum + (one - mean) ** 2, 0) / lengths.length;
    return (100 * Math.sqrt(variance)) / mean;
  },
};

const ALL_METRICS = { ...LAYOUT, ...VISIBLE, ...RHYTHM, ...LEGACY, ...PRODUCT_METRICS };

/**
 * Составы, объявленные ЗАРАНЕЕ — по четырём вопросам задачи, не по числам.
 */
const COMPOSITIONS = {
  legacy: {
    label: 'нынешний состав (воспроизводимая часть)',
    keys: Object.keys(LEGACY),
  },
  layout: {
    label: 'только раскладка поста',
    keys: Object.keys(LAYOUT),
  },
  proposed: {
    label: 'предлагаемый состав',
    keys: [...Object.keys(LAYOUT), ...Object.keys(VISIBLE), ...Object.keys(RHYTHM)],
  },
  /**
   * Тот же состав без трёх измерений, у которых число вышло ровно 50,0% на
   * ВСЕХ трёх корпусах: `capsWordShare`, `exclamPer1k`, `questionShare`.
   *
   * Это не отбор по числам, а правило §5 спецификации, применённое дословно:
   * измерение входит в состав только при числе, показывающем, что оно
   * что-то даёт. Ровно 50,0% на каждом из трёх корпусов — число, и оно
   * говорит «ничего». Отличие от подгонки в том, что порог здесь не
   * подбирался: он объявлен спецификацией до всякого замера, и под него
   * попадают только измерения, не давшие НИ ЕДИНОГО пункта нигде.
   */
  earning: {
    label: 'предлагаемый, без измерений без числа',
    keys: [
      ...Object.keys(LAYOUT),
      'emojiPer1k',
      'digitShare',
      'sentenceLengthWords',
      'shortSentenceShare',
    ],
  },
  /**
   * Тот же состав плюс разброс длин фразы.
   *
   * Задача просит `sentenceSpread` убрать, и довод её справедлив: на разброс
   * нельзя показать пальцем в тексте и нельзя выполнить его как инструкцию.
   * Но это доводы о ролях ОПИСАНИЯ, а судьёй разброс работает — поодиночке
   * он второй из тринадцати. Состав стоит здесь затем, чтобы у снятия была
   * цена, названная числом, а не рассуждением.
   */
  /**
   * Отгружаемый состав, посчитанный продуктовым кодом. Это и есть число
   * приёмки: остальные строки таблицы — разведка, приведшая к нему.
   */
  shipped: {
    label: 'отгружаемый состав, продуктовым кодом',
    keys: Object.keys(PRODUCT_METRICS),
  },
  'earning+spread': {
    label: 'то же плюс разброс длин фразы',
    keys: [
      ...Object.keys(LAYOUT),
      'emojiPer1k',
      'digitShare',
      'sentenceLengthWords',
      'shortSentenceShare',
      'sentenceSpread',
    ],
  },
};

/* ------------------------------------------------------------------ *
 * Арифметика
 * ------------------------------------------------------------------ */

/** Доля пар, где своё число больше чужого; ничья — половина. */
function auc(ours, theirs) {
  if (!ours.length || !theirs.length) return null;
  let won = 0;
  let tied = 0;
  for (const mine of ours) {
    for (const other of theirs) {
      if (mine > other) won += 1;
      else if (mine === other) tied += 1;
    }
  }
  return (won + tied / 2) / (ours.length * theirs.length);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const madRaw = (values) => {
  const centre = median(values);
  return centre === null
    ? 0
    : 1.4826 * median(values.map((one) => Math.abs(one - centre)));
};

/**
 * Разброс с полом.
 *
 * У признака вроде эмодзи больше половины текстов — ноль, и MAD обращается в
 * ноль. Без пола измерение молча выключалось бы, и состав из десяти измерений
 * оказывался бы составом из шести, ничего об этом не сообщая. Пол берётся по
 * объединению обеих сторон — то есть по тому же признаку, а не по вкусу.
 */
function spread(values, pool) {
  const own = madRaw(values);
  if (own > 1e-9) return own;
  const joint = madRaw(pool);
  if (joint > 1e-9) return joint;
  const span = Math.max(...pool) - Math.min(...pool);
  return span > 1e-9 ? span / 4 : null;
}

/** Насколько один признак у текста далёк от стороны, в единицах её разброса. */
const distance = (value, centre, width) => Math.abs((value - centre) / width);

/**
 * Правило 1 — как сегодня: одно только удивление относительно автора.
 * Максимально в моде, и потому проигрывает генератору, стоящему в моде.
 */
function calmScore(text, stats, keys) {
  let sum = 0;
  let counted = 0;
  for (const key of keys) {
    const one = stats[key];
    if (!one || one.authorSpread === null) continue;
    sum += -distance(ALL_METRICS[key](text), one.authorCentre, one.authorSpread);
    counted += 1;
  }
  return counted ? sum / counted : 0;
}

/** Насколько один признак ближе к автору, чем к фону. Обрезано до ±4. */
const CLAMP = 4;

/** Правило 2 — отношение правдоподобий: автор против фона. */
function ratioScore(text, stats, keys) {
  let sum = 0;
  let counted = 0;
  for (const key of keys) {
    const one = stats[key];
    if (!one || one.authorSpread === null || one.backgroundSpread === null) continue;
    const value = ALL_METRICS[key](text);
    const toAuthor = distance(value, one.authorCentre, one.authorSpread);
    const toBackground = distance(value, one.backgroundCentre, one.backgroundSpread);
    sum += Math.max(-CLAMP, Math.min(CLAMP, toBackground - toAuthor));
    counted += 1;
  }
  return counted ? sum / counted : 0;
}

const RULES = {
  calm: { label: 'удивление (сегодня)', score: calmScore },
  ratio: { label: 'отношение правдоподобий', score: ratioScore },
};

/** Статистика обеих сторон по каждому измерению. */
function statisticsFor(authorTexts, backgroundTexts) {
  const stats = {};
  for (const key of Object.keys(ALL_METRICS)) {
    const metric = ALL_METRICS[key];
    const author = authorTexts.map(metric);
    const background = backgroundTexts.map(metric);
    const pool = [...author, ...background];
    stats[key] = {
      authorCentre: median(author),
      authorSpread: spread(author, pool),
      backgroundCentre: median(background),
      backgroundSpread: spread(background, pool),
    };
  }
  return stats;
}

/**
 * Разбор одного корпуса.
 *
 * @param {{
 *   pulled: any,
 *   generations: any[],
 *   foreignTexts?: string[],
 *   backgroundTexts: string[],
 * }} input
 */
function compose({ pulled, generations, foreignTexts, backgroundTexts }) {
  const ruler = buildRuler(pulled.samples, pulled.corpus.language, {
    foreignTexts,
    calibrationCut: CUT,
  });
  const crop = (text) => text.slice(0, CUT);

  const training = ruler.inputs
    .filter((one) => !ruler.holdoutCodes.has(one.code))
    .map((one) => crop(one.text));
  const holdout = ruler.inputs
    .filter((one) => ruler.holdoutCodes.has(one.code))
    .map((one) => crop(one.text));
  const shipped = generations
    .filter((one) => !one.error && one.text && one.variantId === SHIPPED_VARIANT)
    .map((one) => crop(one.text));

  const background = backgroundTexts.map(crop);
  const stats = statisticsFor(training, background);

  const compositions = {};
  for (const [name, one] of Object.entries(COMPOSITIONS)) {
    compositions[name] = { label: one.label, count: one.keys.length, rules: {} };
    for (const [ruleName, rule] of Object.entries(RULES)) {
      compositions[name].rules[ruleName] = auc(
        holdout.map((text) => rule.score(text, stats, one.keys)),
        shipped.map((text) => rule.score(text, stats, one.keys))
      );
    }
  }

  /**
   * Отгружаемое число: и измерения, и счёт — продуктовым кодом.
   *
   * Строки таблицы выше считаются здешним правилом, и оно отличается от
   * продуктового политикой вырожденного разброса: стенд берёт пол по
   * объединению сторон, продукт читает совпадение с вырожденной серединой как
   * ноль отклонений, а любое отличие — как границу обрезки. Обе политики
   * защитимы, но отчитываться надо той, которая отгружается.
   *
   * Стороны строятся простой медианой и MAD без пола — так же, как их построит
   * продукт из разбора автора и из нормы.
   */
  const productSides = judgingSidesOf({
    author: sidesFrom(training),
    background: sidesFrom(background),
  });
  const productScore = (text) =>
    scoreComposite(measureJudgingMetrics(text, RU_LOCALE_PACK), productSides).score;
  const shippedByProduct = auc(
    holdout.map(productScore).filter((one) => one !== null),
    shipped.map(productScore).filter((one) => one !== null)
  );

  /** Вклад каждого измерения поодиночке, вторым правилом. */
  const perMetric = {};
  for (const key of Object.keys(ALL_METRICS)) {
    perMetric[key] = auc(
      holdout.map((text) => ratioScore(text, stats, [key])),
      shipped.map((text) => ratioScore(text, stats, [key]))
    );
  }

  return {
    corpus: {
      name: pulled.corpus.name,
      posts: pulled.samples.length,
      training: training.length,
      holdout: holdout.length,
    },
    cut: CUT,
    counts: { shipped: shipped.length, background: background.length },
    compositions,
    shippedByProduct,
    perMetric,
  };
}

/** Медиана и MAD по каждому судящему измерению — так, как их построит продукт. */
function sidesFrom(texts) {
  const rows = texts.map((text) => measureJudgingMetrics(text, RU_LOCALE_PACK));
  const out = {};
  for (const key of COMPOSITE_JUDGING_METRICS) {
    const values = rows
      .map((one) => one[key])
      .filter((one) => typeof one === 'number' && Number.isFinite(one));
    if (!values.length) continue;
    out[key] = { median: median(values), scale: madRaw(values) };
  }
  return out;
}

const percent = (value) =>
  value === null || value === undefined ? '  —  ' : `${(100 * value).toFixed(1)}%`;

function renderComposition(reports) {
  const lines = [];
  lines.push(
    'AUC — доля пар, где отложенный пост автора набрал больше, чем генерация'
  );
  lines.push(`под его же голосом. Обрезка ${CUT}. Цель эпика — 80%.`);
  lines.push('');
  for (const report of reports) {
    lines.push(
      `корпус «${report.corpus.name}»: ${report.corpus.posts} постов, ` +
        `обучающих ${report.corpus.training}, отложенных ${report.corpus.holdout}; ` +
        `генераций ${report.counts.shipped}, фон ${report.counts.background}`
    );
  }
  lines.push('');
  const header = ['состав', 'правило', ...reports.map((one) => one.corpus.name), 'худший'];
  const rows = [];
  for (const name of Object.keys(COMPOSITIONS)) {
    for (const [ruleName, rule] of Object.entries(RULES)) {
      const cells = reports.map(
        (one) => one.compositions[name].rules[ruleName]
      );
      const worst = Math.min(...cells.map((one) => (one === null ? 1 : one)));
      rows.push([
        `${COMPOSITIONS[name].label} (${COMPOSITIONS[name].keys.length})`,
        rule.label,
        ...cells.map(percent),
        percent(worst),
      ]);
    }
  }
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((one) => one[index].length))
  );
  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  lines.push(line(header));
  lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  rows.forEach((one) => lines.push(line(one)));

  lines.push('');
  lines.push('ОТГРУЖАЕМОЕ ЧИСЛО — измерения и счёт продуктовым кодом:');
  lines.push('');
  for (const report of reports) {
    lines.push(
      `  ${report.corpus.name.padEnd(9)} ${percent(report.shippedByProduct)}`
    );
  }
  lines.push(
    `  ХУДШИЙ КОРПУС ${percent(
      Math.min(...reports.map((one) => one.shippedByProduct ?? 1))
    )}`
  );
  lines.push('');
  lines.push('Каждое измерение поодиночке, вторым правилом:');
  lines.push('');
  const metricHeader = ['измерение', ...reports.map((one) => one.corpus.name), 'худший'];
  const metricRows = Object.keys(ALL_METRICS).map((key) => {
    const cells = reports.map((one) => one.perMetric[key]);
    const worst = Math.min(...cells.map((one) => (one === null ? 1 : one)));
    return [key, ...cells.map(percent), percent(worst)];
  });
  metricRows.sort((a, b) => b[b.length - 1].localeCompare(a[a.length - 1]));
  const metricWidths = metricHeader.map((cell, index) =>
    Math.max(cell.length, ...metricRows.map((one) => one[index].length))
  );
  const metricLine = (cells) =>
    cells.map((cell, index) => cell.padEnd(metricWidths[index])).join('  ').trimEnd();
  lines.push(metricLine(metricHeader));
  lines.push(metricWidths.map((width) => '-'.repeat(width)).join('  '));
  metricRows.forEach((one) => lines.push(metricLine(one)));
  return lines.join('\n');
}

module.exports = {
  compose,
  renderComposition,
  COMPOSITIONS,
  ALL_METRICS,
  LAYOUT,
  VISIBLE,
  RHYTHM,
  LEGACY,
  auc,
  spread,
  statisticsFor,
  calmScore,
  ratioScore,
  BACKGROUND_VARIANT,
  CUT,
};
