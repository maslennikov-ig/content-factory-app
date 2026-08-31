'use strict';

/**
 * The same saved generations, measured by a ruler that learned somewhere else.
 *
 * The stand's own ruler is character 5-grams over a crop of 800 characters.
 * Both answers of the research put that at the lower edge of where stylometry
 * is reliable, and the stand's own numbers agree: two identical variants in one
 * run came apart by 0.028 while the gap being moved is 0.051. Until a second,
 * independently trained ruler has looked at the same texts, "the voice does
 * nothing" and "our ruler cannot see what it does" are the same sentence — and
 * the epic cannot tell which one it is looking at.
 *
 * Two representations, both checked against their model cards on 2026-08-25:
 * LUAR (`rrivera1849/LUAR-MUD`, Apache-2.0), contrastive authorship trained on
 * a million authors; mStyleDistance (`StyleDistance/mstyledistance`, MIT),
 * multilingual style representation covering nine languages including Russian.
 *
 * This is a measuring instrument and not a dependency of the product. It runs
 * from `scripts/evidence/`, it never enters `libraries/`, the Python
 * environment and the weights are ignored by git, and no model is called for
 * money: the generations were paid for once and are scored offline as often as
 * the epic needs.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildRuler, defaultCut, cutTo, mean, median } = require('./ruler.cjs');
const { pairedComparison, closedGapShare } = require('./paired.cjs');

const HERE = path.join(__dirname, 'second-ruler');
const PYTHON = path.join(HERE, '.venv', 'bin', 'python');
const SCRIPT = path.join(HERE, 'embed.py');

const MODELS = {
  luar: { repo: 'rrivera1849/LUAR-MUD', licence: 'Apache-2.0' },
  mstyledistance: { repo: 'StyleDistance/mstyledistance', licence: 'MIT' },
};

const available = () => fs.existsSync(PYTHON) && fs.existsSync(SCRIPT);

/** Cosine distance, on vectors normalised once instead of per comparison. */
const normalise = (vector) => {
  const norm = Math.sqrt(vector.reduce((sum, one) => sum + one * one, 0));
  return norm ? vector.map((one) => one / norm) : vector;
};

const cosineDistance = (left, right) => {
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }
  return 1 - dot;
};

/**
 * The author's print for this ruler: the mean direction of the training half.
 *
 * The training/holdout split is the analyser's own, by content hash, so the two
 * rulers judge the same texts against prints built from the same posts — the
 * only way a disagreement between them is about the rulers rather than about
 * which posts each one was allowed to see.
 */
const centroid = (vectors) => {
  if (!vectors.length) return null;
  const sum = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      sum[index] += vector[index];
    }
  }
  return normalise(sum.map((one) => one / vectors.length));
};

function embed(model, items) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-eval-'));
  const input = path.join(directory, 'items.json');
  const output = path.join(directory, 'vectors.json');
  fs.writeFileSync(input, JSON.stringify({ items }));
  try {
    execFileSync(
      PYTHON,
      [SCRIPT, '--model', model, '--input', input, '--output', output],
      { stdio: ['ignore', 'ignore', 'inherit'] }
    );
    const parsed = JSON.parse(fs.readFileSync(output, 'utf8'));
    return parsed;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * @param model `luar` or `mstyledistance`
 * @returns the same shape the first ruler's report uses, so the two can be read
 *   side by side without translating one into the other
 */
function measureWithSecondRuler({ pulled, generations, cut, model }) {
  if (!MODELS[model]) {
    throw new Error(
      `unknown second ruler "${model}"; known: ${Object.keys(MODELS).join(', ')}`
    );
  }
  if (!available()) {
    throw new Error(
      `no Python environment at ${PYTHON}; see scripts/evidence/voice-eval/second-ruler/README.md`
    );
  }

  const { corpus, samples } = pulled;
  const ruler = buildRuler(samples, corpus.language);
  const appliedCut = cut || defaultCut(samples.map((one) => one.text));

  const items = [];
  ruler.inputs.forEach((input) => {
    items.push({ id: `author::${input.code}`, text: cutTo(input.text, appliedCut) });
  });
  const rows = generations.filter((one) => !one.error && one.text);
  rows.forEach((row, index) => {
    items.push({
      id: `gen::${index}`,
      text: cutTo(row.text, appliedCut),
    });
  });

  const embedded = embed(model, items);
  const vectors = new Map(
    Object.entries(embedded.vectors).map(([id, vector]) => [
      id,
      normalise(vector),
    ])
  );

  const training = ruler.inputs
    .filter((input) => !ruler.holdoutCodes.has(input.code))
    .map((input) => vectors.get(`author::${input.code}`))
    .filter(Boolean);
  const print = centroid(training);
  if (!print) throw new Error('the training half embedded to nothing');

  const author = { all: [], holdout: [] };
  ruler.inputs.forEach((input) => {
    const vector = vectors.get(`author::${input.code}`);
    if (!vector) return;
    const distance = cosineDistance(vector, print);
    author.all.push(distance);
    if (ruler.holdoutCodes.has(input.code)) author.holdout.push(distance);
  });

  const byVariant = new Map();
  rows.forEach((row, index) => {
    const vector = vectors.get(`gen::${index}`);
    if (!vector) return;
    if (!byVariant.has(row.variantId)) byVariant.set(row.variantId, []);
    byVariant.get(row.variantId).push({
      topicId: row.topicId,
      runId: row.runId ?? null,
      distance: cosineDistance(vector, print),
    });
  });

  const variants = [...byVariant.entries()].map(([id, measured]) => ({
    id,
    texts: measured.length,
    distance: mean(measured.map((one) => one.distance)),
    medianDistance: median(measured.map((one) => one.distance)),
    perTopic: measured,
  }));

  const baseline = variants.find((one) => one.id === 'none');
  if (baseline) {
    for (const variant of variants) {
      variant.versusBaseline = pairedComparison(
        baseline.perTopic,
        variant.perTopic
      );
      variant.closedGap = {
        all: closedGapShare(baseline.perTopic, variant.perTopic, author.all),
        holdout: closedGapShare(
          baseline.perTopic,
          variant.perTopic,
          author.holdout
        ),
      };
    }
  }

  return {
    ruler: {
      model,
      repo: embedded.repo,
      licence: embedded.licence,
      dimensions: embedded.dimensions,
      distance: 'cosine to the mean direction of the training half',
    },
    corpus: {
      name: corpus.name,
      language: corpus.language,
      posts: samples.length,
      trainingCount: training.length,
      holdoutCount: ruler.holdoutCodes.size,
    },
    cut: { applied: appliedCut, explicit: Boolean(cut) },
    author: {
      allMean: mean(author.all),
      allCount: author.all.length,
      holdoutMean: mean(author.holdout),
      holdoutCount: author.holdout.length,
    },
    variants,
    baselineId: baseline ? 'none' : null,
  };
}

const percent = (share) =>
  share === null || share === undefined ? '—' : `${(100 * share).toFixed(1)}%`;
const fixed = (value, digits = 4) =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

function renderSecondRuler(report) {
  const lines = [];
  lines.push(
    `вторая мерка «${report.ruler.model}» (${report.ruler.repo}, ${report.ruler.licence}), ` +
      `${report.ruler.dimensions} измерений, косинус к среднему направлению обучающей части`
  );
  lines.push(
    `корпус «${report.corpus.name}», язык ${report.corpus.language}: ` +
      `${report.corpus.posts} текстов, обучающая ${report.corpus.trainingCount} · ` +
      `отложенная ${report.corpus.holdoutCount}; обрезка ${report.cut.applied}`
  );
  lines.push('');
  lines.push(
    `настоящие тексты автора: ${fixed(report.author.allMean)} по всем ` +
      `${report.author.allCount}, ${fixed(report.author.holdoutMean)} по отложенным ` +
      `${report.author.holdoutCount}`
  );
  lines.push('');

  const header = [
    'вариант',
    'текстов',
    'расстояние',
    'медиана',
    'медиана разности',
    '95% интервал',
    'накрывает ноль',
    'доля разрыва',
  ];
  const rows = report.variants.map((one) => [
    one.id,
    String(one.texts),
    fixed(one.distance),
    fixed(one.medianDistance),
    fixed(one.versusBaseline?.median),
    one.versusBaseline
      ? `${fixed(one.versusBaseline.low)}…${fixed(one.versusBaseline.high)}`
      : '—',
    one.versusBaseline?.coversZero === null ||
    one.versusBaseline?.coversZero === undefined
      ? '—'
      : one.versusBaseline.coversZero
        ? 'да'
        : 'нет',
    percent(one.closedGap?.all?.value),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length))
  );
  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  lines.push(line(header));
  lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  rows.forEach((row) => lines.push(line(row)));

  return lines.join('\n');
}

module.exports = {
  measureWithSecondRuler,
  renderSecondRuler,
  available,
  MODELS,
  PYTHON,
};
