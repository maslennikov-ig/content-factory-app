'use strict';

/**
 * The free half of the stand: the ruler over generations already paid for.
 *
 * Nothing here calls a model. That is the property the task asks for by name —
 * the ruler is going to change several times in this epic, and every change
 * has to be re-scored against the same generations, or the comparison is
 * between two rulers and two samples at once.
 */

const { TOPICS } = require('./topics.cjs');
const {
  buildRuler,
  pairedTest,
  defaultCut,
  mean,
  median,
  CUT_FLOOR,
  CUT_CEILING,
} = require('./ruler.cjs');
const { pairedComparison, closedGapShare } = require('./paired.cjs');

/** The variant every other one is judged against: the model with no voice. */
const BASELINE_ID = 'none';

/**
 * The relative reading, expressed as a distance so that one set of statistics
 * serves both rulers.
 *
 * A vote runs the other way from a distance — 1.0 means «unmistakably this
 * author» — and every paired routine in `paired.cjs` assumes smaller is closer.
 * Flipping it here, once, is cheaper and much harder to get wrong than teaching
 * the bootstrap about direction.
 */
const voteRows = (rows) =>
  rows.map((one) => ({
    topicId: one.topicId,
    runId: one.runId ?? null,
    distance: one.votes === null || one.votes === undefined ? null : 1 - one.votes,
  }));

const percent = (share) =>
  share === null || share === undefined ? '—' : `${(100 * share).toFixed(1)}%`;
const fixed = (value, digits = 3) =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

/**
 * @param pulled cached corpus payload
 * @param generations rows written by `generate.cjs`
 * @param cut characters kept from every text before measuring; the default is
 *   the author's own median length
 * @param foreignTexts real texts by other authors; the lineup is built from
 *   them and the working point is taken on them. `lineup.ts` carries the
 *   measurement that decided why the shipped set was not enough.
 */
function measure({ pulled, generations, cut, foreignTexts }) {
  const { corpus, samples } = pulled;
  const ruler = buildRuler(samples, corpus.language, {
    foreignTexts,
    calibrationCut: cut || undefined,
  });
  const texts = samples.map((one) => one.text);
  const appliedCut = cut || defaultCut(texts);

  /**
   * The author's own row, twice.
   *
   * `all` is the epic's configuration and reproduces its 0.586: every post in
   * the corpus, cropped, against a print built on the training part. `holdout`
   * is the honest one — writing the print has never seen — and it is the row
   * the paired test uses, because a pair in which the author's side helped
   * build the profile is a pair the author cannot lose.
   */
  const author = {
    all: [],
    holdout: [],
    allFull: [],
    holdoutFull: [],
    lengths: [],
    votes: [],
    holdoutVotes: [],
  };
  ruler.inputs.forEach((input) => {
    const measured = ruler.measure(input.text, appliedCut);
    if (measured.distance === null) return;
    author.all.push(measured.distance);
    author.lengths.push(measured.rawLength);
    if (measured.votes !== null) author.votes.push(measured.votes);
    if (measured.full.distance !== null) author.allFull.push(measured.full.distance);
    if (ruler.holdoutCodes.has(input.code)) {
      author.holdout.push(measured.distance);
      if (measured.votes !== null) author.holdoutVotes.push(measured.votes);
      if (measured.full.distance !== null) {
        author.holdoutFull.push(measured.full.distance);
      }
    }
  });

  const byVariant = new Map();
  for (const row of generations) {
    if (!byVariant.has(row.variantId)) byVariant.set(row.variantId, []);
    byVariant.get(row.variantId).push(row);
  }

  const variants = [...byVariant.entries()].map(([id, rows]) => {
    const ok = rows.filter((one) => !one.error && one.text);
    const measured = ok.map((one) => ({
      topicId: one.topicId,
      runId: one.runId ?? null,
      ...ruler.measure(one.text, appliedCut),
    }));
    const distances = measured
      .map((one) => one.distance)
      .filter((one) => one !== null);
    const fullDistances = measured
      .map((one) => one.full?.distance)
      .filter((one) => one !== null && one !== undefined);
    const shares = measured
      .map((one) => one.scaleShare)
      .filter((one) => one !== null);
    const votes = measured
      .map((one) => one.votes)
      .filter((one) => one !== null && one !== undefined);
    return {
      votes: mean(votes),
      medianVotes: median(votes),
      decidedBy: measured[0]?.decidedBy ?? null,
      id,
      generated: rows.length,
      errors: rows.length - ok.length,
      unmeasurable: ok.length - distances.length,
      distance: mean(distances),
      // The paired procedure works on medians, so the median is reported next
      // to the mean rather than derived from a table nobody kept.
      medianDistance: median(distances),
      distanceFull: mean(fullDistances),
      medianDistanceFull: median(fullDistances),
      closeShare: measured.length
        ? measured.filter((one) => one.verdict === 'CLOSE').length /
          measured.length
        : null,
      scaleShare: mean(shares),
      medianLength: median(measured.map((one) => one.rawLength)),
      paired: pairedTest(author.holdout, distances),
      pairedAgainstAll: pairedTest(author.all, distances),
      /**
       * То же сравнение по голосам — правилу, по которому решает продукт.
       *
       * Колонка «автор ближе» считается по абсолютному расстоянию, а эпик
       * похоронил абсолютную мерку: тот же прогон на обрезке 800 и 823 знака
       * менял знак вывода. Приёмка `pl1.5` — 80% на каждом корпусе — читается
       * по голосам, и до 27.08.2026 её читали по колонке, которая про другое.
       *
       * Голос перевёрнут в расстояние (`1 − голос`), чтобы «меньше — ближе»
       * значило одно и то же в обеих колонках.
       */
      pairedVotes: pairedTest(
        author.holdoutVotes.map((one) => 1 - one),
        votes.map((one) => 1 - one)
      ),
      perTopic: measured,
    };
  });

  const everyGenerated = variants.flatMap((one) =>
    one.perTopic.map((row) => row.distance).filter((row) => row !== null)
  );

  /**
   * Every variant against the no-voice baseline, pair by pair.
   *
   * The baseline row keeps a comparison against itself. It has to be zero with
   * an interval of zero width, and a reader who sees anything else knows the
   * pairing broke before reading any other number.
   */
  const baselineRows = byVariant.has(BASELINE_ID)
    ? variants.find((one) => one.id === BASELINE_ID).perTopic
    : null;
  if (baselineRows) {
    /**
     * The same arithmetic twice, on the two rulers that disagree.
     *
     * Wave A established that the absolute distance flips sign between a crop
     * of 800 and one of 823, so a run judged only by it can be argued either
     * way. The vote is the rule the product now ships and the one the epic is
     * accepted on. Both are reported: if they agree, the finding is safe, and
     * if they disagree, that disagreement is itself the result.
     */
    const baselineVotes = voteRows(baselineRows);
    for (const variant of variants) {
      variant.versusBaseline = pairedComparison(baselineRows, variant.perTopic);
      variant.closedGap = {
        all: closedGapShare(baselineRows, variant.perTopic, author.all),
        holdout: closedGapShare(baselineRows, variant.perTopic, author.holdout),
      };
      const rows = voteRows(variant.perTopic);
      const authorVoteDistances = author.holdoutVotes.map((one) => 1 - one);
      variant.versusBaselineVotes = pairedComparison(baselineVotes, rows);
      variant.closedGapVotes = authorVoteDistances.length
        ? closedGapShare(baselineVotes, rows, authorVoteDistances)
        : null;
    }
  }

  return {
    corpus: {
      name: corpus.name,
      label: corpus.label,
      language: corpus.language,
      posts: samples.length,
      characters: samples.reduce((sum, one) => sum + one.text.length, 0),
      trainingCount: ruler.measurement.sampleCount,
      holdoutCount: ruler.holdoutCodes.size,
    },
    ruler: {
      threshold: ruler.threshold,
      selfMedian: ruler.selfMedian,
      localePackVersion: ruler.measurement.voicePrint?.localePackVersion ?? null,
      /**
       * Which lineup produced every vote below.
       *
       * Reported because the same corpus scores 86.4% against documentation and
       * 44.6% against other authors, and a number without its lineup is not a
       * number anybody can compare with another run.
       */
      impostorSet: ruler.impostors?.version ?? null,
      impostorSource: ruler.impostors?.source ?? null,
      impostorCount: ruler.impostors?.impostors?.length ?? 0,
      calibration: ruler.calibration ?? null,
    },
    cut: {
      applied: appliedCut,
      explicit: Boolean(cut),
      corpusMedian: median(texts.map((one) => one.length)),
      atFloor: appliedCut === CUT_FLOOR,
      atCeiling: appliedCut === CUT_CEILING,
    },
    author: {
      allMean: mean(author.all),
      allCount: author.all.length,
      holdoutMean: mean(author.holdout),
      holdoutCount: author.holdout.length,
      allMeanFull: mean(author.allFull),
      holdoutMeanFull: mean(author.holdoutFull),
      medianLength: median(author.lengths),
      votes: mean(author.votes),
      holdoutVotes: mean(author.holdoutVotes),
      holdoutVoteCount: author.holdoutVotes.length,
    },
    variants,
    baselineId: baselineRows ? BASELINE_ID : null,
    overallPaired: pairedTest(author.holdout, everyGenerated),
    /**
     * Приёмка `pl1.5` целиком, по голосам: автор против всей генерации.
     *
     * Рядом с `overallPaired`, а не вместо него: расстояние остаётся в отчёте,
     * потому что расхождение двух мерок — это тоже результат, и молча выбрать
     * ту, что удобнее, было бы худшим из способов его не заметить.
     */
    overallPairedVotes: pairedTest(
      author.holdoutVotes.map((one) => 1 - one),
      variants.flatMap((one) =>
        one.perTopic
          .map((row) => row.votes)
          .filter((row) => row !== null && row !== undefined)
          .map((row) => 1 - row)
      )
    ),
  };
}

/** The table the task asks for, in words a person reads once and understands. */
function render(report) {
  const lines = [];
  const { corpus, ruler, cut, author } = report;
  lines.push(
    `корпус «${corpus.name}» (${corpus.label}), язык ${corpus.language}: ` +
      `${corpus.posts} текстов, ${corpus.characters} знаков`
  );
  lines.push(
    `обучающая часть ${corpus.trainingCount} · отложенная ${corpus.holdoutCount} · ` +
      `порог ${fixed(ruler.threshold, 4)} · словарь ${ruler.localePackVersion}`
  );
  lines.push(
    `шеренга: ${ruler.impostorCount} подставных — ${
      ruler.impostorSource ?? 'нет'
    }`
  );
  const point = ruler.calibration;
  lines.push(
    point?.high === null || point?.high === undefined
      ? `рабочая точка: не снята${point?.reason ? ` (${point.reason})` : ''} — вердикт не выносится`
      : `рабочая точка: «похоже» от ${percent(point.high)} голосов, ` +
          `«не похоже» до ${percent(point.low)}; ` +
          `на калибровке чужих принято ${point.falseAccept.wrong}/${point.falseAccept.of}, ` +
          `своих отвергнуто ${point.falseReject.wrong}/${point.falseReject.of}`
  );
  lines.push(
    `обрезка ${cut.applied} знаков (${
      cut.explicit ? 'задана' : 'медиана корпуса'
    }, медиана корпуса ${cut.corpusMedian})` +
      (cut.atFloor ? ' — упёрлась в нижнюю границу' : '') +
      (cut.atCeiling ? ' — упёрлась в верхнюю границу' : '')
  );
  lines.push('');
  lines.push(
    `настоящие тексты автора: ${fixed(author.allMean)} по всем ${author.allCount}` +
      `, ${fixed(author.holdoutMean)} по отложенным ${author.holdoutCount}` +
      `; на полной длине ${fixed(author.allMeanFull)}, медианная длина ${
        author.medianLength ?? '—'
      }`
  );
  lines.push(
    `голосов за автора на его же отложенных текстах: ${percent(
      author.holdoutVotes
    )} (${author.holdoutVoteCount} текстов) — это потолок, к которому идёт генерация`
  );
  lines.push('');

  const header = [
    'вариант',
    'текстов',
    'голосов',
    'на обрезке',
    'на полной длине',
    'длина',
    '«похоже»',
    'шкалы в коридоре',
    'ошибок',
    'автор ближе по расстоянию',
    'автор ближе по голосам',
  ];
  const rows = report.variants.map((one) => [
    one.id,
    String(one.generated - one.errors),
    percent(one.votes),
    fixed(one.distance),
    fixed(one.distanceFull),
    String(one.medianLength ?? '—'),
    percent(one.closeShare),
    percent(one.scaleShare),
    String(one.errors + (one.unmeasurable ? `+${one.unmeasurable}?` : '')),
    `${percent(one.paired.share)} (${one.paired.won}/${one.paired.pairs})`,
    // Ничьи стоят рядом с числом, а не прячутся в нём: на голосах их много, и
    // «73.6% при 30% ничьих» — не то же самое, что «73.6% при нуле».
    `${percent(one.pairedVotes.auc)} (ничьих ${percent(
      one.pairedVotes.tiedShare
    )})`,
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length))
  );
  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  lines.push(line(header));
  lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  rows.forEach((row) => lines.push(line(row)));

  lines.push('');
  lines.push(
    `парный тест против всей генерации по расстоянию: ${percent(
      report.overallPaired.share
    )} (${report.overallPaired.won}/${report.overallPaired.pairs})`
  );
  /**
   * Приёмка эпика читается здесь, а не строкой выше.
   *
   * `pl1.5` требует 80% на каждом корпусе, и требует их от той мерки, по
   * которой продукт выносит вердикт. Абсолютное расстояние ею не является с
   * тех пор, как один и тот же прогон на обрезке 800 и 823 знака поменял знак
   * вывода; голосование — является.
   */
  lines.push(
    `парный тест по голосам — цель эпика 80%: ${percent(
      report.overallPairedVotes.auc
    )} при ${percent(report.overallPairedVotes.tiedShare)} ничьих ` +
      `(${report.overallPairedVotes.won}/${report.overallPairedVotes.pairs} без ничьих)`
  );

  const baseline = report.variants.find((one) => one.id === 'none');
  const product = report.variants.find((one) => one.id === 'product');
  if (baseline?.distance && product?.distance) {
    const moved = baseline.distance - product.distance;
    lines.push(
      `голос двигает генерацию к автору на ${fixed(moved)} ` +
        `(без голоса ${fixed(baseline.distance)} → под голосом ${fixed(product.distance)})`
    );
  }

  if (author.medianLength) {
    const longest = report.variants
      .map((one) => one.medianLength)
      .filter(Boolean);
    if (longest.length) {
      const times = Math.max(...longest) / author.medianLength;
      lines.push(
        `длина: автор ${author.medianLength} знаков, генерация до ${Math.max(
          ...longest
        )} — в ${times.toFixed(1)} раза длиннее; обрезка прячет это, поэтому число стоит рядом`
      );
    }
  }

  if (report.baselineId) {
    lines.push('');
    lines.push(
      `парное сравнение с «${report.baselineId}»: та же тема, тот же прогон, ` +
        'бутстрап 10000 раз с ресемплом тем, а не генераций'
    );
    lines.push('');
    const pairedHeader = [
      'вариант',
      'пар',
      'тем',
      'медиана разности',
      '95% интервал',
      'накрывает ноль',
      'доля разрыва',
      '95% интервал',
    ];
    const pairedRows = report.variants
      .filter((one) => one.versusBaseline)
      .map((one) => {
        const closed = one.closedGap?.all;
        return [
          one.id,
          String(one.versusBaseline.pairs),
          String(one.versusBaseline.topics),
          fixed(one.versusBaseline.median),
          `${fixed(one.versusBaseline.low)}…${fixed(one.versusBaseline.high)}`,
          one.versusBaseline.coversZero === null
            ? '—'
            : one.versusBaseline.coversZero
              ? 'да'
              : 'нет',
          percent(closed?.value),
          `${percent(closed?.low)}…${percent(closed?.high)}`,
        ];
      });
    if (pairedRows.length) {
      const pairedWidths = pairedHeader.map((cell, index) =>
        Math.max(cell.length, ...pairedRows.map((row) => row[index].length))
      );
      const pairedLine = (cells) =>
        cells
          .map((cell, index) => cell.padEnd(pairedWidths[index]))
          .join('  ')
          .trimEnd();
      lines.push(pairedLine(pairedHeader));
      lines.push(pairedWidths.map((width) => '-'.repeat(width)).join('  '));
      pairedRows.forEach((row) => lines.push(pairedLine(row)));
    }

    const judged = report.variants.find((one) => one.id === 'product');
    const closed = judged?.closedGap?.all;
    if (closed?.value !== null && closed?.value !== undefined) {
      lines.push('');
      lines.push(
        `доля закрытого разрыва у «product»: ${percent(closed.value)} ` +
          `(разрыв ${fixed(closed.gap)} = ${fixed(closed.baselineMedian)} у базовой линии ` +
          `− ${fixed(closed.authorMedian)} у автора); цель — 50%`
      );
      lines.push(
        judged.versusBaseline.coversZero === false
          ? 'интервал ноль не накрывает: разница между вариантом и базовой линией видна мерке'
          : 'интервал накрывает ноль: мерка не отличает вариант от базовой линии'
      );
    }

    /**
     * The second table exists because the first one was shown to be
     * argument-shaped: 800 characters says the voice throws generation 20% back,
     * 823 says it covers 5% of the way. The vote is what the product ships.
     */
    const voted = report.variants.filter((one) => one.versusBaselineVotes);
    if (voted.length) {
      lines.push('');
      lines.push(
        'то же самое по голосам подставных — правилу, по которому продукт ' +
          'сейчас и решает:'
      );
      lines.push('');
      const voteHeader = [
        'вариант',
        'голосов за автора',
        'медиана разности',
        '95% интервал',
        'накрывает ноль',
        'доля разрыва',
      ];
      const voteRowsOut = voted.map((one) => [
        one.id,
        percent(one.votes),
        fixed(one.versusBaselineVotes.median),
        `${fixed(one.versusBaselineVotes.low)}…${fixed(one.versusBaselineVotes.high)}`,
        one.versusBaselineVotes.coversZero === null
          ? '—'
          : one.versusBaselineVotes.coversZero
            ? 'да'
            : 'нет',
        percent(one.closedGapVotes?.value),
      ]);
      const voteWidths = voteHeader.map((cell, index) =>
        Math.max(cell.length, ...voteRowsOut.map((row) => row[index].length))
      );
      const voteLine = (cells) =>
        cells
          .map((cell, index) => cell.padEnd(voteWidths[index]))
          .join('  ')
          .trimEnd();
      lines.push(voteLine(voteHeader));
      lines.push(voteWidths.map((width) => '-'.repeat(width)).join('  '));
      voteRowsOut.forEach((row) => lines.push(voteLine(row)));

      const judgedVotes = report.variants.find((one) => one.id === 'product');
      const byDistance = judgedVotes?.closedGap?.all?.value;
      const byVotes = judgedVotes?.closedGapVotes?.value;
      if (
        byDistance !== null &&
        byDistance !== undefined &&
        byVotes !== null &&
        byVotes !== undefined
      ) {
        lines.push('');
        lines.push(
          Math.sign(byDistance) === Math.sign(byVotes)
            ? `обе мерки согласны в знаке: ${percent(byDistance)} по расстоянию, ` +
              `${percent(byVotes)} по голосам`
            : `мерки расходятся в знаке: ${percent(byDistance)} по расстоянию против ` +
              `${percent(byVotes)} по голосам — вывод принимается по голосам, ` +
              'потому что по ним решает продукт'
        );
      }
    }
  }
  return lines.join('\n');
}

module.exports = { measure, render, TOPICS };
