'use strict';

/**
 * Whether the ruler is broken or only badly aimed.
 *
 * `content-factory-next-pl1.5` names the experiment and the reason for it. The
 * epic has two numbers that look contradictory and are not: the paired test
 * separates the author from generated text in 64–67% of pairs, while the
 * threshold rejects one generation in twenty-four. Those measure different
 * things — ranking and the operating point — and mending the threshold while
 * the ranking is the problem would be repairing the sight on a bent barrel.
 *
 * So the two are computed apart:
 *
 *   AUC              — can the feature rank the author above an impostor at all
 *   operating point  — at the threshold in force, who is let through
 *
 * If AUC is respectable and the miss rate is high, a recalibration fixes it.
 * If AUC falls towards 0.5, the feature is what fails and no threshold saves
 * it. Both answers of the research say this in the same words.
 *
 * The third question belongs to this epic specifically: the same measurement at
 * a crop of 800 and at 823 gave −19.6% and +5.2% of the closed gap. A ruler
 * whose verdict turns over twenty-three characters is not measuring what it
 * claims to. The crop sweep here is what turns that observation into a number.
 *
 * Nothing here calls a model.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

const { buildRuler, cutTo, median } = require('./ruler.cjs');
const { mulberry32, percentileOf } = require('./paired.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..');
const { loadTypeScriptModule } = require(path.join(
  REPO,
  'tests/helpers/load-tsx.cjs'
));

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const ngrams = loadTypeScriptModule(`${BASE}/character-ngrams.ts`);

/**
 * The stranger, pinned to the same commit the `e3y.1` acceptance used.
 *
 * Four Russian technical documents of this repository, written by somebody who
 * is not the owner. Pinned rather than read live, because a control that moves
 * when a document is edited turns the number into a diary entry — and the very
 * commit recording the number would change it.
 */
const CONTROL_COMMIT = '00a7bfa8';
const CONTROL_FILES = [
  'docs/operations/production-deploy.md',
  'docs/product/brand-voice-from-samples-spec.md',
  'docs/product/content-intelligence-brand-profile-spec.md',
  'docs/design/content-factory-interface-specification.md',
];

const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

const stripMarkdown = (text) =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*[|>].*$/gm, ' ')
    .replace(EMOJI, ' ');

/** Paragraph-joined pieces of about a post's length, so the sides are alike. */
const chunk = (text, target = 900) => {
  const pieces = [];
  let current = '';
  for (const paragraph of text.split(/\n\s*\n/)) {
    const clean = paragraph.replace(/\s+/gu, ' ').trim();
    if (!clean) continue;
    current = current ? `${current} ${clean}` : clean;
    if (current.length >= target) {
      pieces.push(current);
      current = '';
    }
  }
  if (current.length > 200) pieces.push(current);
  return pieces;
};

function strangerTexts() {
  return CONTROL_FILES.flatMap((file) =>
    chunk(
      stripMarkdown(
        execSync(`git show ${CONTROL_COMMIT}:${file}`, {
          cwd: REPO,
          encoding: 'utf8',
          maxBuffer: 1 << 28,
        })
      )
    )
  );
}

/**
 * The probability that a random text of the author scores closer than a random
 * text of the impostor set. Ties count as half, which is what an AUC is.
 *
 * This is the paired test of the stand under its proper name, and naming it
 * that way is the point: the epic's 64.4% is an AUC of 0.644, and an AUC of
 * 0.5 is a coin.
 */
function auc(ours, theirs) {
  if (!ours.length || !theirs.length) return null;
  let won = 0;
  let tied = 0;
  for (const mine of ours) {
    for (const other of theirs) {
      if (mine < other) won += 1;
      else if (mine === other) tied += 1;
    }
  }
  return (won + tied / 2) / (ours.length * theirs.length);
}

/**
 * Who the threshold lets through, in both directions, at the point in force.
 *
 * Separately from the AUC on purpose: `1 of 24 rejected` is a 95.8% miss rate
 * on the hard negative set, and it sits perfectly happily beside a usable
 * ranking. Reading them as one number is what made the epic's earlier numbers
 * look contradictory.
 */
function operatingPoint(threshold, ours, theirs) {
  const rejectedOwn = ours.filter((one) => one > threshold).length;
  const acceptedImpostor = theirs.filter((one) => one <= threshold).length;
  return {
    threshold,
    ownRejected: rejectedOwn,
    ownTotal: ours.length,
    ownRejectedShare: ours.length ? rejectedOwn / ours.length : null,
    impostorAccepted: acceptedImpostor,
    impostorTotal: theirs.length,
    missRate: theirs.length ? acceptedImpostor / theirs.length : null,
  };
}

/**
 * The relative decision the research calls the most important pointer.
 *
 * Instead of "is it closer than the threshold", ask "is it closer to this
 * author than to a set of impostors, over random halves of the features". The
 * threshold does not disappear — it becomes a share of votes rather than a
 * distance, which is the honest form of the same question and is not hostage
 * to one author's spread.
 */
function impostorScore(text, ruler, impostorRates, options = {}) {
  const profile = ruler.measurement.voicePrint?.ngrams;
  if (!profile?.grams?.length) return null;
  const rounds = options.rounds ?? 60;
  const share = options.share ?? 0.5;
  const random = mulberry32(options.seed ?? 20260825);
  const keep = Math.max(20, Math.round(profile.grams.length * share));

  let wins = 0;
  for (let round = 0; round < rounds; round += 1) {
    const picked = new Set();
    while (picked.size < keep) {
      picked.add(Math.floor(random() * profile.grams.length));
    }
    const indices = [...picked];
    /**
     * One feature space for every side of the comparison.
     *
     * The windows are the author's, and the impostors are weighted on those
     * same windows — a rate of zero where an impostor never wrote one. Letting
     * each print keep its own top-400 would compare distances computed over
     * different features and call the difference authorship; it would also
     * flatter the author, whose windows are by construction the ones being
     * asked about.
     */
    const grams = indices.map((index) => profile.grams[index]);
    const mine = ngrams.characterNgramDistance(text, {
      ...profile,
      grams,
      weight: indices.map((index) => profile.weight[index]),
    }).distance;
    if (mine === null) return null;
    let best = Infinity;
    for (const rates of impostorRates) {
      const theirs = ngrams.characterNgramDistance(text, {
        ...profile,
        grams,
        weight: grams.map((gram) => rates.get(gram) ?? 0),
      }).distance;
      if (theirs !== null && theirs < best) best = theirs;
    }
    if (best === Infinity) return null;
    if (mine < best) wins += 1;
  }
  return wins / rounds;
}

/**
 * The working point of the relative decision: a share of votes, not a distance.
 *
 * Two thirds is a first proposal and nothing more — a number this file measures
 * against rather than derives. It is stated here so the table has one, and it
 * moves the moment a second corpus disagrees with it.
 */
const RELATIVE_VOTE_FLOOR = 2 / 3;

function relativeOperatingPoint(floor, ownVotes, theirVotes) {
  const rejected = ownVotes.filter((one) => one < floor).length;
  const accepted = theirVotes.filter((one) => one >= floor).length;
  return {
    floor,
    ownRejected: rejected,
    ownTotal: ownVotes.length,
    ownRejectedShare: ownVotes.length ? rejected / ownVotes.length : null,
    impostorAccepted: accepted,
    impostorTotal: theirVotes.length,
    missRate: theirVotes.length ? accepted / theirVotes.length : null,
  };
}

/**
 * The impostors, as rates over every window they wrote — not as top-400 lists.
 *
 * The comparison happens on the author's windows, so an impostor has to be
 * answerable about windows it would never have put in a profile of its own.
 * A map of rates answers that; a truncated profile answers a different
 * question and quietly makes every impostor look distant.
 *
 * Three of them, from disjoint thirds of the stranger corpus: one impostor
 * turns the vote into a coin toss between two profiles, and overlapping text
 * would make three copies of one opinion.
 */
function impostorPrints(texts, size = 3) {
  const rates = [];
  const per = Math.floor(texts.length / size);
  if (per < 2) return rates;
  for (let index = 0; index < size; index += 1) {
    const slice = texts.slice(index * per, (index + 1) * per);
    const pooled = new Map();
    let total = 0;
    for (const text of slice) {
      for (const [gram, count] of ngrams.countNgrams(text, ngrams.NGRAM_SIZE)) {
        pooled.set(gram, (pooled.get(gram) ?? 0) + count);
        total += count;
      }
    }
    if (!total) continue;
    const map = new Map();
    for (const [gram, count] of pooled) map.set(gram, count / total);
    rates.push(map);
  }
  return rates;
}

/**
 * @param cuts the crop sweep. The epic's own two — 800 and the corpus median —
 *   are the ones that disagreed; the rest are there so the disagreement can be
 *   seen as a shape rather than as a pair of points.
 */
function discriminate({ pulled, generations, cuts, foreignTexts }) {
  const { corpus, samples } = pulled;
  const ruler = buildRuler(samples, corpus.language, { foreignTexts });
  const strangers = strangerTexts();
  const prints = impostorPrints(strangers);

  const generated = generations.filter((one) => !one.error && one.text);
  const byVariant = new Map();
  for (const row of generated) {
    if (!byVariant.has(row.variantId)) byVariant.set(row.variantId, []);
    byVariant.get(row.variantId).push(row.text);
  }

  const corpusMedian = median(samples.map((one) => one.text.length));
  const grid = cuts ?? [600, 700, 800, Math.round(corpusMedian), 1000, 1200];

  const rows = grid.map((cut) => {
    const own = [];
    ruler.inputs.forEach((input) => {
      if (!ruler.holdoutCodes.has(input.code)) return;
      const measured = ruler.measure(input.text, cut);
      if (measured.distance !== null) own.push(measured.distance);
    });
    const strangerDistances = strangers
      .map((text) => ruler.measure(text, cut).distance)
      .filter((one) => one !== null);
    const perVariant = [...byVariant.entries()].map(([id, texts]) => {
      const distances = texts
        .map((text) => ruler.measure(text, cut).distance)
        .filter((one) => one !== null);
      return {
        id,
        auc: auc(own, distances),
        operating: operatingPoint(ruler.threshold, own, distances),
      };
    });
    return {
      cut,
      own: { count: own.length, median: median(own) },
      stranger: {
        count: strangerDistances.length,
        median: median(strangerDistances),
        auc: auc(own, strangerDistances),
        operating: operatingPoint(ruler.threshold, own, strangerDistances),
      },
      variants: perVariant,
    };
  });

  /**
   * The relative decision, at the epic's own crop only.
   *
   * Sixty random halves of the profile per text against three impostor prints
   * is already the expensive part of this file, and running it over the whole
   * sweep would buy a table nobody reads instead of the one number the research
   * asked for: does asking the question relatively separate what asking it
   * absolutely could not.
   */
  const relativeCut = 800;
  const ownVotes = ruler.inputs
    .filter((input) => ruler.holdoutCodes.has(input.code))
    .map((input) =>
      impostorScore(cutTo(input.text, relativeCut), ruler, prints)
    )
    .filter((one) => one !== null);
  /**
   * The threshold, recomputed for the relative decision — point three of the
   * task.
   *
   * The same promise as before, pointing the other way: the old rule kept 95%
   * of the author's own texts under a distance ceiling, this one keeps 95% of
   * them above a vote floor. The number is the author's own 5th percentile
   * rather than a constant, so an author who writes more variably gets a lower
   * floor instead of a broken product — and, unlike the old rule, the floor is
   * bounded by what the impostors score, which is the half of the decision the
   * research says the percentile alone never had.
   */
  const sortedOwn = [...ownVotes].sort((left, right) => left - right);
  const calibratedFloor = percentileOf(sortedOwn, 0.05);

  const generatedVotes = [...byVariant.values()]
    .flat()
    .map((text) => impostorScore(cutTo(text, relativeCut), ruler, prints))
    .filter((one) => one !== null);

  /**
   * The floor that knows both sides — the half the old rule never had.
   *
   * The 95th percentile of the author's own distances answers "how far do this
   * author's texts wander" and says nothing about how close an impostor comes;
   * both answers of the research say so, and this run measures the cost of that
   * omission: calibrated on the author alone the floor lands at 27% of the
   * votes and lets three generations in four through. Chosen against the real
   * adversary instead, it is the point where the two errors are cheapest
   * together — Youden's J, the plainest form of "both sides count".
   */
  const balancedFloor = (() => {
    let best = { floor: null, j: -1 };
    for (let step = 0; step <= 100; step += 1) {
      const floor = step / 100;
      const kept = ownVotes.filter((one) => one >= floor).length / (ownVotes.length || 1);
      const let_in =
        generatedVotes.filter((one) => one >= floor).length /
        (generatedVotes.length || 1);
      const j = kept - let_in;
      if (j > best.j) best = { floor, j };
    }
    return best.floor;
  })();

  const relative = {
    cut: relativeCut,
    impostorPrints: prints.length,
    proposedFloor: RELATIVE_VOTE_FLOOR,
    calibratedFloor,
    balancedFloor,
    own: { count: ownVotes.length, median: median(ownVotes) },
    /**
     * The AUC keeps its meaning — "the author's own text scores better" — even
     * though the score points the other way here. A vote is "how often the
     * author wins", so more is better, and the sign is flipped before the
     * comparison rather than after it, where a reader would have to remember to
     * flip it back.
     */
    variants: [...byVariant.entries()].map(([id, texts]) => {
      const votes = texts
        .map((text) => impostorScore(cutTo(text, relativeCut), ruler, prints))
        .filter((one) => one !== null);
      return {
        id,
        count: votes.length,
        median: median(votes),
        auc: auc(ownVotes.map((one) => -one), votes.map((one) => -one)),
        operating: relativeOperatingPoint(RELATIVE_VOTE_FLOOR, ownVotes, votes),
        calibrated: relativeOperatingPoint(calibratedFloor, ownVotes, votes),
        balanced: relativeOperatingPoint(balancedFloor, ownVotes, votes),
      };
    }),
    stranger: (() => {
      const votes = strangers
        .map((text) => impostorScore(cutTo(text, relativeCut), ruler, prints))
        .filter((one) => one !== null);
      return {
        count: votes.length,
        median: median(votes),
        auc: auc(ownVotes.map((one) => -one), votes.map((one) => -one)),
        operating: relativeOperatingPoint(RELATIVE_VOTE_FLOOR, ownVotes, votes),
        calibrated: relativeOperatingPoint(calibratedFloor, ownVotes, votes),
        balanced: relativeOperatingPoint(balancedFloor, ownVotes, votes),
      };
    })(),
  };

  return {
    corpus: {
      name: corpus.name,
      language: corpus.language,
      posts: samples.length,
      holdout: ruler.holdoutCodes.size,
      median: corpusMedian,
    },
    ruler: { threshold: ruler.threshold, selfMedian: ruler.selfMedian },
    stranger: { texts: strangers.length, commit: CONTROL_COMMIT },
    rows,
    relative,
  };
}

const percent = (share) =>
  share === null || share === undefined ? '—' : `${(100 * share).toFixed(1)}%`;
const fixed = (value, digits = 3) =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

function renderDiscrimination(report) {
  const lines = [];
  lines.push(
    `корпус «${report.corpus.name}»: ${report.corpus.posts} текстов, ` +
      `отложенных ${report.corpus.holdout}, медиана ${report.corpus.median} знаков`
  );
  lines.push(
    `порог ${fixed(report.ruler.threshold, 4)} · своя медиана ${fixed(
      report.ruler.selfMedian,
      4
    )} · чужой текст: ${report.stranger.texts} кусков из коммита ${report.stranger.commit}`
  );
  lines.push('');
  lines.push(
    'AUC — доля пар, где свой текст ближе. 0,5 — монета. Пропуск — доля чужих,'
  );
  lines.push('которых порог принял за своего. Считаются отдельно намеренно.');
  lines.push('');

  const header = [
    'обрезка',
    'против кого',
    'AUC',
    'своих отвергнуто',
    'чужих пропущено',
  ];
  const rows = [];
  for (const row of report.rows) {
    rows.push([
      String(row.cut),
      'чужая проза',
      fixed(row.stranger.auc),
      percent(row.stranger.operating.ownRejectedShare),
      percent(row.stranger.operating.missRate),
    ]);
    for (const variant of row.variants) {
      rows.push([
        String(row.cut),
        `генерация «${variant.id}»`,
        fixed(variant.auc),
        percent(variant.operating.ownRejectedShare),
        percent(variant.operating.missRate),
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
  lines.push(
    `относительное решение вместо порога (обрезка ${report.relative.cut}, ` +
      `${report.relative.impostorPrints} подставных слепка):`
  );
  lines.push(
    `свои тексты выигрывают у подставных в ${percent(
      report.relative.own.median
    )} случайных половин признаков`
  );
  const relativeLine = (label, side) =>
    `  ${label}: голосов ${percent(side.median)} · AUC ${fixed(side.auc)} · ` +
    `пропущено при ${percent(report.relative.calibratedFloor)} — ${percent(
      side.calibrated.missRate
    )}, при ${percent(report.relative.balancedFloor)} — ${percent(
      side.balanced.missRate
    )}`;
  for (const variant of report.relative.variants) {
    lines.push(relativeLine(`генерация «${variant.id}»`, variant));
  }
  lines.push(relativeLine('чужая проза', report.relative.stranger));
  lines.push('');
  const first = report.relative.variants[0];
  lines.push('две рабочие точки, и разница между ними — вся суть задачи:');
  lines.push(
    `  по своим текстам (5-й перцентиль): ${percent(
      report.relative.calibratedFloor
    )} голосов — своих отвергнуто ${percent(
      first?.calibrated.ownRejectedShare
    )}, генерации пропущено ${percent(first?.calibrated.missRate)}`
  );
  lines.push(
    `  против настоящего противника: ${percent(
      report.relative.balancedFloor
    )} голосов — своих отвергнуто ${percent(
      first?.balanced.ownRejectedShare
    )}, генерации пропущено ${percent(first?.balanced.missRate)}`
  );
  lines.push('цель эпика по различению — AUC не ниже 0,80');
  return lines.join('\n');
}

module.exports = {
  discriminate,
  renderDiscrimination,
  auc,
  operatingPoint,
  impostorScore,
  impostorPrints,
  strangerTexts,
  chunk,
  stripMarkdown,
  CONTROL_COMMIT,
  CONTROL_FILES,
};
