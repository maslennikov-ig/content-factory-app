#!/usr/bin/env node
'use strict';

/**
 * Что отбор черновиков покупает и во что обходится — на уже оплаченных
 * прогонах, без единого нового вызова модели.
 *
 * ## Почему это считается отсюда, а не отдельным платным прогоном
 *
 * Отбор — это «взять лучший из k независимых черновиков, остановившись раньше,
 * если один прошёл». Черновики независимы: тот же промпт, та же температура,
 * разные выборки. Значит k повторных прогонов одного варианта дают ровно тот
 * материал, на котором правило и работает, и оба плеча опыта — «с отбором» и
 * «без» — читаются с одних и тех же генераций.
 *
 * Отдельный прогон «с отбором» стоил бы вдвое-втрое дороже и ответил бы то же
 * самое. Хуже: он ответил бы на других темах, и разница между плечами
 * смешалась бы с разбросом между темами, который на двух корпусах из трёх и
 * так шире измеряемой величины.
 *
 * ## Своей арифметики здесь нет
 *
 * Голоса берутся из отчёта `measure`, то есть посчитаны продуктовой меркой.
 * Правило отбора — `agent/draft-pick.ts`, тот самый модуль, который стоит в
 * графе. Стенд складывает одно с другим и не решает ничего сам.
 *
 * ## Как звать
 *
 *   node scripts/evidence/voice-eval/draft-pick.cjs \
 *     --run owner-2026-08-26-b,owner-2026-08-26-c --cut 823
 *
 * Один прогон тоже принимается: тогда читается только цена — доля черновиков,
 * проходящих точку с первого раза, и ожидаемое число черновиков. Выгода по
 * одному черновику на тему не читается, и отчёт об этом говорит вслух.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests/helpers/load-tsx.cjs'
));

const rules = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/draft-pick.ts'
);

/**
 * Интервал считает тот же бутстрап, что и весь остальной стенд.
 *
 * Ресемпл идёт по темам, а не по генерациям: шестнадцать тем, снятых трижды, —
 * это шестнадцать наблюдений, а не сорок восемь. Своей процедуры здесь нет по
 * той же причине, по которой нет своего порога.
 */
const {
  pairedComparison,
  pairedDifferences,
  clusteredBootstrap,
  clusterByTopic,
} = require('./paired.cjs');

const RUNS = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.codex/stages/content-factory-next-pl1/evidence/runs'
);

const argOf = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
};

const median = (list) => {
  if (!list.length) return null;
  const sorted = [...list].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const mean = (list) =>
  list.length ? list.reduce((sum, one) => sum + one, 0) / list.length : null;

/** Все перестановки — порядок черновиков случаен, и усреднять по нему честно. */
const permutations = (items) => {
  if (items.length <= 1) return [items];
  const out = [];
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([items[index], ...tail]);
  }
  return out;
};

/**
 * Отчёт независимой мерки того же пула, если он посчитан.
 *
 * Не обязателен: `measure` бесплатен везде, а вторая мерка требует Python и
 * весов, которых на машине может не быть. Без неё читается всё, кроме
 * единственной проверки, ради которой она здесь, — и отчёт об этом говорит.
 */
const secondReportFor = (runId, cut, model) => {
  const file = path.join(RUNS, runId, `second-${model}-cut${cut}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

const reportFor = (runId, cut) => {
  const file = path.join(RUNS, runId, `report-cut${cut}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `нет отчёта ${file}; сначала посчитайте прогон: voice-eval.cjs measure --run ${runId} --cut ${cut}`
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

/**
 * Один прогон правила на одной теме.
 *
 * Черновики предъявляются по одному, ровно как их предъявляет граф, и решение
 * «платить ли дальше» принимает продуктовое `needsAnotherDraft`. Выбор —
 * продуктовый `bestDraftIndex`. Здесь только цикл.
 */
const selectOne = (votes, accepts) => {
  const paid = [];
  for (const one of votes) {
    paid.push({ votes: one });
    if (!rules.needsAnotherDraft(paid, accepts)) break;
  }
  const picked = rules.bestDraftIndex(paid);
  return {
    drafts: paid.length,
    pickedIndex: picked,
    first: paid[0].votes,
    chosen: paid[picked].votes,
    passed: rules.draftPasses(paid[picked].votes, accepts),
  };
};

function main() {
  const runIds = (argOf('run') || '').split(',').filter(Boolean);
  const cut = argOf('cut') || '800';
  if (!runIds.length) {
    process.stderr.write(
      'нужен --run <прогон>[,<прогон>…]; --cut по умолчанию 800\n'
    );
    process.exit(2);
  }

  const reports = runIds.map((runId) => reportFor(runId, cut));
  const first = reports[0];
  const accepts = first.ruler?.calibration?.high ?? null;
  if (accepts === null) {
    process.stderr.write(
      'у этого отчёта нет калиброванной точки: отбор судить нечем, и это ответ, а не поломка\n'
    );
    process.exit(3);
  }
  for (const report of reports) {
    const other = report.ruler?.calibration?.high ?? null;
    if (other !== accepts) {
      throw new Error(
        `прогоны сняты разными мерками (${accepts} против ${other}): складывать их голоса нельзя`
      );
    }
  }

  const secondModel = argOf('second');
  const secondReports = secondModel
    ? runIds.map((runId) => secondReportFor(runId, cut, secondModel))
    : [];
  const secondByKey = secondReports.every(Boolean) && secondReports.length
    ? new Map(
        secondReports.flatMap((report) =>
          report.variants.flatMap((variant) =>
            variant.perTopic.map((row) => [
              `${variant.id}::${row.topicId}::${row.runId ?? null}`,
              row.distance,
            ])
          )
        )
      )
    : null;
  if (secondModel && !secondByKey) {
    process.stderr.write(
      `отчёта второй мерки «${secondModel}» на обрезке ${cut} нет — ` +
        'посчитайте его: voice-eval.cjs second --run … --model ' +
        `${secondModel} --cut ${cut}\n`
    );
  }

  const corpus = first.corpus?.id ?? first.corpus?.name ?? '—';
  const ceiling = first.author?.holdoutVotes ?? null;
  process.stdout.write(
    `Отбор черновиков — ${corpus}, обрезка ${cut}, прогонов ${reports.length}\n` +
      `точка «похоже» ${accepts.toFixed(3)}` +
      (ceiling === null
        ? '\n'
        : `, потолок (отложенные посты автора) ${ceiling.toFixed(3)}\n`) +
      `потолок попыток ${rules.MAX_DRAFT_ATTEMPTS}, отгружено включённым: ${
        rules.DRAFT_PICK_SHIPPED ? 'да' : 'нет'
      }\n\n`
  );

  const byVariant = new Map();
  for (const report of reports) {
    for (const variant of report.variants) {
      if (!byVariant.has(variant.id)) byVariant.set(variant.id, new Map());
      const topics = byVariant.get(variant.id);
      for (const row of variant.perTopic) {
        if (!topics.has(row.topicId)) topics.set(row.topicId, []);
        topics.get(row.topicId).push({
          votes: row.votes ?? null,
          runId: row.runId ?? null,
        });
      }
    }
  }

  const table = [];
  for (const [id, topics] of byVariant) {
    const firsts = [];
    const chosen = [];
    const drafts = [];
    const passedFirst = [];
    /**
     * Пары для интервала: без отбора против с отбором, тема к теме.
     *
     * Голоса подаются со знаком минус, потому что `paired.cjs` говорит на
     * языке расстояний — там меньше значит ближе, а у голосов наоборот.
     * Инверсия здесь, а не в бутстрапе: соглашение принадлежит мерке, и
     * менять его ради одного вызова значило бы завести второе.
     */
    const before = [];
    const after = [];
    const secondBefore = [];
    const secondAfter = [];
    for (const [topicId, votes] of topics) {
      /**
       * Порядок черновиков усредняется, а не берётся как записан.
       *
       * Прогоны равноправны: какой из них «первый», решил порядок в
       * командной строке. При двух прогонах разница между порядками — целая
       * половина выборки, и оставить один порядок значило бы отдать ответ
       * жребию.
       */
      let permutation = 0;
      for (const order of permutations(votes)) {
        const outcome = selectOne(
          order.map((one) => one.votes),
          accepts
        );
        firsts.push(outcome.first);
        chosen.push(outcome.chosen);
        drafts.push(outcome.drafts);
        passedFirst.push(rules.draftPasses(order[0].votes, accepts) ? 1 : 0);
        const runId = `perm-${permutation}`;
        before.push({ topicId, runId, distance: -outcome.first });
        after.push({ topicId, runId, distance: -outcome.chosen });
        /**
         * Та же пара, прочитанная меркой, которая в отборе не участвовала.
         *
         * Отбор берёт максимум по голосам из трёх выборок, и часть подъёма по
         * голосам обязана быть выбором удачной выборки, а не приближением к
         * автору: у best-of-k завышается любая величина, по которой выбирали.
         * Отличить одно от другого может только независимая мерка, поэтому
         * отбор здесь идёт по голосам, а результат читается по LUAR. Знак у
         * неё обычный — меньше значит ближе, инвертировать нечего.
         */
        if (secondByKey) {
          const firstAt = secondByKey.get(`${id}::${topicId}::${order[0].runId}`);
          const pickedAt = secondByKey.get(
            `${id}::${topicId}::${order[outcome.pickedIndex].runId}`
          );
          if (firstAt !== undefined && pickedAt !== undefined) {
            secondBefore.push({ topicId, runId, distance: firstAt });
            secondAfter.push({ topicId, runId, distance: pickedAt });
          }
        }
        permutation += 1;
      }
    }
    const interval = pairedComparison(before, after);
    /**
     * То же самое, но на среднем, и это не украшение.
     *
     * Медиана парной разности здесь по построению ноль всюду, где больше
     * половины тем проходят с первого раза: правило тогда ничего не делает, и
     * «типичная тема не получает ничего» — правда. Но вопрос, ради которого
     * узел писался, другой: сколько голосов покупает отбор на пост в среднем.
     * Обе статистики стоят рядом, потому что расхождение между ними и есть
     * форма эффекта — редкий крупный выигрыш вместо повсеместного мелкого.
     */
    const averageGain = clusteredBootstrap(
      clusterByTopic(pairedDifferences(before, after)),
      (rows) => mean(rows.map((one) => one.difference))
    );
    /**
     * Выигрыш по независимой мерке. Положительное — отбор приблизил к автору.
     */
    const secondGain = secondBefore.length
      ? clusteredBootstrap(
          clusterByTopic(pairedDifferences(secondBefore, secondAfter)),
          (rows) => mean(rows.map((one) => one.difference))
        )
      : { point: null, low: null, high: null };
    const share = mean(passedFirst);
    const draws = [...topics.values()][0]?.length ?? 0;
    table.push({
      id,
      topics: topics.size,
      draws,
      firstMean: mean(firsts),
      chosenMean: mean(chosen),
      firstMedian: median(firsts),
      chosenMedian: median(chosen),
      /**
       * Оплачено — то, что правило потратило на этом материале. При двух
       * черновиках на тему оно упирается в два и цену недосказывает, поэтому
       * рядом стоит ожидание.
       */
      drafts: mean(drafts),
      draftsCapped: draws < rules.MAX_DRAFT_ATTEMPTS,
      /**
       * Ожидание при полном потолке: 1 + (1−p) + (1−p)². Допущение названо
       * прямо — доля прохождения p одинакова у первого черновика и у
       * следующих. Черновики независимы (тот же промпт, та же температура), но
       * тема, которая не даётся мерке, не даётся ей и со второго раза, так что
       * это ожидание — нижняя граница цены, а не точное число.
       */
      expected: Array.from(
        { length: rules.MAX_DRAFT_ATTEMPTS },
        (unused, index) => (1 - share) ** index
      ).reduce((sum, one) => sum + one, 0),
      passedFirst: share,
      interval,
      averageGain,
      secondGain,
    });
  }

  const columns = [
    ['вариант', (row) => row.id.padEnd(12)],
    ['тем', (row) => String(row.topics).padStart(3)],
    ['черновиков на тему', (row) => String(row.draws).padStart(18)],
    ['прошло с первого', (row) => `${(row.passedFirst * 100).toFixed(0)}%`.padStart(16)],
    [
      'оплачено',
      (row) =>
        (row.draftsCapped ? `≥${row.drafts.toFixed(2)}` : row.drafts.toFixed(2)).padStart(8),
    ],
    ['ожидаемо при потолке', (row) => row.expected.toFixed(2).padStart(20)],
    ['голоса без отбора', (row) => row.firstMean.toFixed(3).padStart(17)],
    ['голоса с отбором', (row) => row.chosenMean.toFixed(3).padStart(16)],
    [
      'медиана разности',
      (row) =>
        (row.interval.median === null ? '—' : row.interval.median.toFixed(3)).padStart(
          16
        ),
    ],
    [
      'средняя разность, 95% интервал',
      (row) =>
        (row.averageGain.point === null
          ? '—'
          : `${row.averageGain.point.toFixed(3)} (${row.averageGain.low.toFixed(3)}…${row.averageGain.high.toFixed(3)})`
        ).padStart(30),
    ],
    [
      'по независимой мерке',
      (row) =>
        (row.secondGain.point === null
          ? '—'
          : `${row.secondGain.point.toFixed(4)} (${row.secondGain.low.toFixed(4)}…${row.secondGain.high.toFixed(4)})`
        ).padStart(20),
    ],
    [
      'мимо нуля',
      (row) =>
        (row.averageGain.low === null
          ? '—'
          : row.averageGain.low > 0 || row.averageGain.high < 0
            ? 'ДА'
            : 'нет'
        ).padStart(9),
    ],
  ];
  process.stdout.write(`${columns.map(([name]) => name).join(' | ')}\n`);
  for (const row of table) {
    process.stdout.write(`${columns.map(([, get]) => get(row)).join(' | ')}\n`);
  }

  if ((table[0]?.draws ?? 0) < 2) {
    process.stdout.write(
      '\nЧерновик на тему всего один, поэтому прочитана только ЦЕНА: доля\n' +
        'прошедших с первого раза и ожидаемое число черновиков. Выгода отбора\n' +
        'по одному черновику не читается — для неё нужен тот же вариант,\n' +
        'прогнанный повторно на тех же темах.\n'
    );
  }

  const out = argOf('out');
  if (out) {
    fs.writeFileSync(
      out,
      `${JSON.stringify(
        { runIds, cut: Number(cut), accepts, ceiling, variants: table },
        null,
        2
      )}\n`
    );
    process.stdout.write(`\n${out}\n`);
  }
}

if (require.main === module) main();

module.exports = { selectOne, permutations };
