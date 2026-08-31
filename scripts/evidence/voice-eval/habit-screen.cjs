'use strict';

/**
 * Пункт 2 задачи `content-factory-next-pl1.5`: хватает ли голосу привычек поста.
 *
 * ## Что здесь спрашивается
 *
 * Голосование по символьным окнам отвечает «кто это написал» и на корпусе
 * `britva` против отгружаемого блока даёт 58% — почти монету. Привычки поста
 * считаются с 24.08.2026 и в мерку не входят: несёт ли текст собственные
 * измерения автора, с чего он начинается, стоит ли в нём ссылка, какой длины
 * он вышел. Вопрос задачи — поднимут ли они парный тест.
 *
 * ## Правило, по которому это судится
 *
 * Задача написала его сама: составная мерка остаётся, только если поднимает
 * парный тест **на всех трёх корпусах**. Признак, выигравший на одном, — это
 * ровно та ошибка, из-за которой эпик и открыт.
 *
 * ## Почему обрезка та же
 *
 * Длина — самая громкая привычка, и на полной длине она выиграет за всех:
 * автор пишет 823, 642 и 724 знака, генерация под голосом — 1237, 1282 и 1013.
 * Мерка, победившая длиной, померила ножницы. Поэтому основной счёт идёт на
 * той же обрезке 800, что и голос, а длина считается отдельно и печатается
 * рядом — продукт судит настоящий черновик и вправе ею пользоваться, но
 * называть это победой мерки нельзя.
 *
 * ## Что здесь своего
 *
 * Ничего из арифметики. Привычки считает `computePostHabits` продукта на
 * выборке из одного текста, голоса — `voiceprint.measureSimilarity` через
 * `ruler.cjs`. Своё — только раскладка по ролям, слияние двух порядков и
 * печать.
 *
 * Ни одного вызова модели.
 */

const { buildRuler, median } = require('./ruler.cjs');
const { loadTypeScriptModule } = require('../../../tests/helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const { computePostHabits, observePost } = loadTypeScriptModule(
  `${BASE}/post-habits.ts`
);
const { RU_LOCALE_PACK } = loadTypeScriptModule(`${BASE}/locale-pack.ru.ts`);

const CUT = 800;
const SHIPPED_VARIANT = 'product';

/**
 * Бинарные привычки, которые есть у одного текста.
 *
 * Шесть из восьми ключей `POST_HABIT_METRIC_KEYS`: две оставшиеся — длина и
 * плотность эмодзи — не бинарны и идут отдельными числами.
 */
const BINARY = [
  'opensWithAdmission',
  'opensWithNumber',
  'opensWithQuestion',
  'endsWithCallToAction',
  'carriesLink',
  'carriesOwnMeasurement',
];

/**
 * Привычки одного текста, посчитанные тем же кодом, что и привычки корпуса.
 *
 * `observePost` — те самые предикаты, которые складывает `computePostHabits`.
 * Второй реализации здесь нет намеренно: две функции, считающие «начинается ли
 * пост с числа», разойдутся, и разойдутся молча — обе возвращают булево.
 */
function featuresOf(text) {
  const seen = observePost(text, RU_LOCALE_PACK);
  const out = {};
  for (const key of BINARY) {
    out[key] = seen[key] === null ? null : seen[key] ? 1 : 0;
  }
  out.postLength = text.length;
  return out;
}

/**
 * Насколько текст удивителен для этого автора — одним числом, без подгонки.
 *
 * Корпус автора даёт вероятность каждой привычки. Отрицательный логарифм
 * вероятности наблюдённого — это удивление в его обычном смысле: автор, у
 * которого ссылка стоит в трети постов, не удивлён ни ссылкой, ни её
 * отсутствием, а автор, который ссылок не ставит никогда, удивлён ссылкой
 * сильно.
 *
 * Ни одного подобранного веса. Шестнадцать генераций на корпус — это выборка,
 * на которой подбирать нельзя ничего: любой вес, взятый по ней, будет
 * подогнан под неё и покажет успех, которого нет. Сглаживание Лапласа держит
 * логарифм конечным на привычке, которой автор не проявил ни разу.
 */
function surpriseOf(features, prior) {
  let sum = 0;
  let counted = 0;
  for (const key of BINARY) {
    const seen = features[key];
    const share = prior[key];
    if (seen === null || share === null) continue;
    const probability = seen >= 0.5 ? share : 1 - share;
    sum += -Math.log(Math.max(probability, 1e-3));
    counted += 1;
  }
  return counted ? sum / counted : null;
}

/** Доля пар, где своё число больше чужого; ничья — половина. */
const auc = (ours, theirs) => {
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
};

/**
 * Слияние двух порядков без единого веса.
 *
 * Средний нормированный ранг: у голоса и у удивления разные единицы и разные
 * распределения, и любой коэффициент между ними пришлось бы взять из тех же
 * шестнадцати генераций, против которых он потом и проверяется. Ранговое
 * слияние такого коэффициента не требует и потому проверяемо честно.
 */
function fuse(rows, keys) {
  const ranked = keys.map((key) => {
    const values = rows.map((row) => row[key]);
    const order = [...values.keys()].sort((a, b) => values[a] - values[b]);
    const rank = new Array(values.length);
    order.forEach((index, position) => {
      rank[index] = values.length > 1 ? position / (values.length - 1) : 0.5;
    });
    return rank;
  });
  return rows.map(
    (_, index) =>
      ranked.reduce((sum, rank) => sum + rank[index], 0) / ranked.length
  );
}

function screen({ pulled, generations, foreignTexts }) {
  const { corpus, samples } = pulled;
  const ruler = buildRuler(samples, corpus.language, {
    foreignTexts,
    calibrationCut: CUT,
  });

  /**
   * Вероятности привычек берутся с обучающей части, а не со всего корпуса.
   *
   * Отложенные посты — это то, чем мерка проверяется. Автор, чьи вероятности
   * посчитаны в том числе по ним, выигрывает у генерации отчасти потому, что
   * его же тексты участвовали в постройке правила. Ошибка бесшумная: числа
   * растут, и растут не там.
   */
  const trainingTexts = ruler.inputs
    .filter((one) => !ruler.holdoutCodes.has(one.code))
    .map((one) => one.text);
  const corpusHabits = computePostHabits(
    trainingTexts.map((text) => ({ text })),
    RU_LOCALE_PACK
  );
  const prior = {};
  for (const key of BINARY) {
    prior[key] =
      corpusHabits[key] === null ? null : corpusHabits[key] / 100;
  }

  const rowFor = (text, side) => {
    const cropped = text.slice(0, CUT);
    const measured = ruler.measure(text, CUT);
    const features = featuresOf(cropped);
    return {
      side,
      votes: measured.votes,
      surprise: surpriseOf(features, prior),
      /** Меньше удивления — ближе к автору, поэтому знак переворачивается. */
      calm: -(surpriseOf(features, prior) ?? 0),
      croppedLength: cropped.length,
      fullLength: text.length,
    };
  };

  const own = ruler.inputs
    .filter((one) => ruler.holdoutCodes.has(one.code))
    .map((one) => rowFor(one.text, 'own'));

  const byVariant = new Map();
  for (const row of generations) {
    if (row.error || !row.text) continue;
    if (!byVariant.has(row.variantId)) byVariant.set(row.variantId, []);
    byVariant.get(row.variantId).push(rowFor(row.text, row.variantId));
  }
  const shipped = byVariant.get(SHIPPED_VARIANT) ?? [];
  const generated = [...byVariant.values()].flat();

  /**
   * Слияние считается на объединении сторон, а не на каждой отдельно.
   *
   * Ранг — величина относительно множества, и два множества, отранжированные
   * порознь, дают два числа, которые нельзя сравнивать между собой. Ошибку
   * такого рода эпик уже ловил на подставных, считавшихся по своим окнам.
   */
  const fuseAgainst = (theirs) => {
    const rows = [...own, ...theirs].filter(
      (one) => one.votes !== null && one.surprise !== null
    );
    const fused = fuse(rows, ['votes', 'calm']);
    const ours = [];
    const others = [];
    rows.forEach((row, index) => {
      (row.side === 'own' ? ours : others).push(fused[index]);
    });
    return { ours, others };
  };

  const compare = (theirs, label) => {
    const values = (list, key) =>
      list.map((one) => one[key]).filter((one) => one !== null);
    const fused = fuseAgainst(theirs);
    return {
      label,
      count: theirs.length,
      votes: auc(values(own, 'votes'), values(theirs, 'votes')),
      calm: auc(values(own, 'calm'), values(theirs, 'calm')),
      /** Длина как признак: короче — ближе к автору, знак перевёрнут. */
      length: auc(
        own.map((one) => -one.fullLength),
        theirs.map((one) => -one.fullLength)
      ),
      fused: auc(fused.ours, fused.others),
    };
  };

  return {
    corpus: {
      name: corpus.name,
      posts: samples.length,
      holdout: own.length,
    },
    cut: CUT,
    prior,
    lengths: {
      author: median(own.map((one) => one.fullLength)),
      shipped: median(shipped.map((one) => one.fullLength)),
    },
    against: [
      compare(shipped, `генерация «${SHIPPED_VARIANT}»`),
      compare(generated, 'вся генерация'),
    ],
  };
}

const percent = (value) =>
  value === null || value === undefined ? '—' : `${(100 * value).toFixed(1)}%`;

function renderScreen(report) {
  const lines = [];
  lines.push(
    `корпус «${report.corpus.name}»: ${report.corpus.posts} постов, ` +
      `отложенных ${report.corpus.holdout}; обрезка ${report.cut}`
  );
  lines.push(
    `длина: автор ${report.lengths.author}, отгружаемый блок ${report.lengths.shipped}`
  );
  lines.push('');
  lines.push(
    'AUC — доля пар, где свой текст набрал больше. Цель приёмки 80%. Столбец'
  );
  lines.push(
    '«длина» считается на полной длине и потому в составную мерку не входит.'
  );
  lines.push('');
  const header = [
    'против кого',
    'текстов',
    'голоса',
    'привычки',
    'голоса+привычки',
    'длина',
  ];
  const rows = report.against.map((one) => [
    one.label,
    String(one.count),
    percent(one.votes),
    percent(one.calm),
    percent(one.fused),
    percent(one.length),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((one) => one[index].length))
  );
  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  lines.push(line(header));
  lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  rows.forEach((one) => lines.push(line(one)));
  return lines.join('\n');
}

module.exports = { screen, renderScreen, featuresOf, surpriseOf, fuse, auc };
