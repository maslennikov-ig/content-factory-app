'use strict';

/**
 * Порог, снятый против настоящего противника, — `content-factory-next-pl1.5`.
 *
 * ## Зачем это отдельная команда
 *
 * `measure` судит генерации порогом, который уже снят. Эта команда спрашивает
 * другое: а на своём ли месте сам порог. Сегодня он снимается на текстах чужих
 * людей — `voice.service.ts` берёт образцы соседних аватаров, — и на боевой
 * 28.08.2026 это дало у всех трёх голосов нижнюю границу ноль. «Не похоже»
 * выносится только тексту, набравшему ровно ноль голосов, и в ту же дыру
 * попадает от 5% до 10% собственных постов автора.
 *
 * Противник, о котором задача, — не чужой человек, а машина, пишущая на темы
 * этого автора. Он оплачен и лежит на диске: генерации прогонов `*-t16`. Этот
 * файл снимает порог против них и печатает обе рабочие точки рядом, чтобы
 * разница была числом, а не рассуждением.
 *
 * ## Что здесь своего, а что взято у продукта
 *
 * Своего — только раскладка материала по ролям и печать. Голоса считает
 * `voiceprint.measureSimilarity` через `ruler.cjs`, пороги снимает
 * `voice-calibration.calibrate`, шеренгу строит `lineup.buildLineup`. Второй
 * арифметики у стенда нет намеренно: он существует ровно затем, чтобы судить
 * тем же, чем судит продукт.
 *
 * Ни одного вызова модели.
 */

const { buildRuler, median } = require('./ruler.cjs');
const { loadTypeScriptModule } = require('../../../tests/helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const { calibrate, verdictFor } = loadTypeScriptModule(
  `${BASE}/voice-calibration.ts`
);
const { splitForeign } = loadTypeScriptModule(`${BASE}/lineup.ts`);

/**
 * Та же обрезка, на которой снимает порог продукт (`CALIBRATION_CUT`).
 *
 * Порог, снятый на одной длине и применённый к другой, сравнивал бы две разные
 * величины: у длинного текста больше окон, гистограмма ровнее, и голос его
 * систематически другой.
 */
const CALIBRATION_CUT = 800;

/** Сколько собственных отложенных текстов берётся, как и в продукте. */
const OWN_SAMPLES = 100;

/**
 * Вариант, который продукт действительно отгружает.
 *
 * Пул из семи вариантов — это факторный план, и четыре из них голоса не несут
 * вовсе. Порог, снятый на их среднем, снят против противника слабее
 * настоящего: в живом пространстве человек получает черновик, написанный
 * блоком `product`, и никаким другим.
 */
const SHIPPED_VARIANT = 'product';

const share = (list, predicate) =>
  list.length ? list.filter(predicate).length / list.length : null;

/**
 * Доля пар, в которых свой текст набрал больше чужого; ничья — половина.
 *
 * Это приёмка `pl1.5` («не менее 80% пар») под своим настоящим именем —
 * площадь под кривой. Ничьи считаются ничьими: голос принимает десятки
 * значений на сотни текстов, и `выиграл/пар` систематически занижает
 * разделимость, засчитывая совпадение автору в поражение.
 */
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
 * Что рабочая точка делает с одним множеством голосов.
 *
 * Три доли, а не две: между порогами лежит полоса, в которой мерка молчит, и
 * её размер — половина ответа на вопрос «годится ли эта точка». Точка, у
 * которой девять десятых текстов попадают в молчание, честна и бесполезна.
 */
function outcomes(votes, calibration) {
  const verdicts = votes.map((one) => verdictFor(one, calibration));
  return {
    count: votes.length,
    median: median(votes),
    close: share(verdicts, (one) => one === 'CLOSE'),
    cannotTell: share(verdicts, (one) => one === 'CANNOT_TELL'),
    far: share(verdicts, (one) => one === 'FAR'),
  };
}

/**
 * Голоса всех сторон, посчитанные один раз.
 *
 * Один голос — это шестьдесят раундов против шести подставных, и на корпусе
 * `avetov` сторон набирается под пятьсот. Пересчитывать их на каждую рабочую
 * точку значило бы платить минутами за арифметику, которая от точки не
 * зависит: голос — свойство текста и шеренги, а точка выбирается по голосам.
 */
function collectVotes({ pulled, generations, foreignTexts, cut }) {
  const { corpus, samples } = pulled;
  const applied = cut ?? CALIBRATION_CUT;
  const ruler = buildRuler(samples, corpus.language, {
    foreignTexts,
    calibrationCut: applied,
  });

  const voteAt = (text) => ruler.measure(text, applied).votes;

  const holdout = ruler.inputs.filter((one) => ruler.holdoutCodes.has(one.code));
  const step = Math.max(1, Math.ceil(holdout.length / OWN_SAMPLES));
  const own = holdout
    .filter((_, index) => index % step === 0)
    .map((one) => voteAt(one.text))
    .filter((one) => one !== null);

  /**
   * Чужой материал делится тем же `splitForeign`, что у продукта.
   *
   * Из одной части собрана шеренга, по другой снимается порог, и пересекаться
   * они не имеют права: текст, участвовавший в постройке подставного,
   * проигрывает своему же подставному и кладёт порог на пол.
   */
  const foreign = splitForeign(foreignTexts ?? [])
    .negatives.map(voteAt)
    .filter((one) => one !== null);

  const byVariant = new Map();
  for (const row of generations) {
    if (row.error || !row.text) continue;
    if (!byVariant.has(row.variantId)) byVariant.set(row.variantId, []);
    byVariant.get(row.variantId).push(voteAt(row.text));
  }
  for (const [id, votes] of byVariant) {
    byVariant.set(
      id,
      votes.filter((one) => one !== null)
    );
  }
  const generated = [...byVariant.values()].flat();

  return { ruler, applied, own, foreign, generated, byVariant };
}

/**
 * Три рабочие точки на одном и том же материале.
 *
 * `foreign_avatars` — то, что снимает продукт сегодня. `own_generations` — то,
 * что задача просит проверить. `mixed` — обе стороны сразу, потому что живому
 * пространству чужие люди достаются бесплатно, а генерации накапливаются, и
 * вопрос «не хуже ли смесь» надо задать до того, как отвечать на него кодом.
 *
 * Каждая точка меряется по обеим сторонам, а не по своей: точка, снятая на
 * генерациях, обязана сказать, что она делает с чужими людьми, иначе её
 * достоинство измерено там же, где она подогнана.
 */
function calibrationSweep(inputs) {
  const collected = collectVotes(inputs);
  const { own, foreign, generated, byVariant, ruler, applied } = collected;

  const shipped = byVariant.get(SHIPPED_VARIANT) ?? [];

  const points = [
    { label: 'только чужие люди', against: foreign, extra: [] },
    { label: 'только генерации', against: generated, extra: [] },
    {
      label: `только генерации «${SHIPPED_VARIANT}»`,
      against: shipped,
      extra: [],
    },
    { label: 'объединение', against: [...foreign, ...generated], extra: [] },
    /**
     * Правило, которое продукт отгружает: строже из двух.
     *
     * Считается тем же `calibrate` с обоими списками, а не пересчитывается
     * здесь: стенд обязан показывать ту точку, по которой человек получит
     * вердикт, а не похожую на неё.
     */
    { label: 'ОТГРУЖЕНО: строже из двух', against: foreign, extra: generated },
  ].map(({ label, against, extra }) => {
    const calibration = calibrate(own, against, extra);
    return {
      label,
      negatives: calibration.negatives,
      takenOn: against.length + extra.length,
      calibration,
      onOwn: outcomes(own, calibration),
      onForeign: outcomes(foreign, calibration),
      onGenerated: outcomes(generated, calibration),
      byVariant: [...byVariant.entries()].map(([id, votes]) => ({
        id,
        ...outcomes(votes, calibration),
      })),
    };
  });

  return {
    corpus: {
      name: inputs.pulled.corpus.name,
      language: inputs.pulled.corpus.language,
      posts: inputs.pulled.samples.length,
      holdout: ruler.holdoutCodes.size,
    },
    cut: applied,
    lineup: {
      size: ruler.impostors?.impostors?.length ?? 0,
      version: ruler.impostors?.version ?? null,
    },
    material: {
      own: own.length,
      foreign: foreign.length,
      generated: generated.length,
    },
    ceiling: median(own),
    /**
     * Сами голоса, а не только сводка по ним.
     *
     * Рабочая точка выбирается допуском, а допуск — решение владельца, не
     * программиста: пять процентов ложного приёма были взяты против чужих
     * людей, и против настоящего противника они дают другую цену. Чтобы
     * пересчитать эту цену на любом допуске, нужны сами числа, а пересчитывать
     * их — минута на корпус. Здесь только числа: ни одного чужого
     * предложения, ни одного своего.
     */
    votes: { own, foreign, generated, shipped },
    /**
     * Разделимость отдельно от рабочей точки.
     *
     * Приёмка `pl1.5` читается здесь, а не в таблице порогов: порог отвечает
     * за то, кого пускают, AUC — за то, различима ли вообще одна сторона от
     * другой. Два числа эпика, выглядевшие противоречием, были ровно этими
     * двумя, и складывать их обратно нельзя.
     */
    separability: {
      againstGenerated: auc(own, generated),
      againstShipped: auc(own, shipped),
      againstForeign: auc(own, foreign),
    },
    points,
  };
}

const percent = (value) =>
  value === null || value === undefined ? '—' : `${(100 * value).toFixed(1)}%`;

const bound = (value) =>
  value === null || value === undefined ? '—' : value.toFixed(3);

function renderCalibration(report) {
  const lines = [];
  lines.push(
    `корпус «${report.corpus.name}»: ${report.corpus.posts} постов, ` +
      `отложенных ${report.corpus.holdout}; обрезка ${report.cut}, ` +
      `шеренга ${report.lineup.size}`
  );
  lines.push(
    `материала на порог: своих ${report.material.own}, чужих людей ` +
      `${report.material.foreign}, генераций ${report.material.generated}`
  );
  lines.push(
    `потолок — медиана голосов автора на своих отложенных постах: ${percent(
      report.ceiling
    )}`
  );
  lines.push(
    `разделимость по голосам (цель приёмки 80%): против всей генерации ${percent(
      report.separability.againstGenerated
    )} · против отгружаемого блока ${percent(
      report.separability.againstShipped
    )} · против чужих людей ${percent(report.separability.againstForeign)}`
  );
  lines.push('');
  lines.push(
    'против кого снят порог · «не похоже» до · «похоже» от · что он делает с каждой стороной'
  );
  lines.push('');

  const header = [
    'отрицательные',
    'низ',
    'верх',
    'своих «не похоже»',
    'своих молчание',
    'чужих принято',
    'генераций принято',
  ];
  const rows = report.points.map((point) => [
    point.label,
    bound(point.calibration.low),
    bound(point.calibration.high),
    percent(point.onOwn.far),
    percent(point.onOwn.cannotTell),
    percent(point.onForeign.close),
    percent(point.onGenerated.close),
  ]);
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((one) => one[index].length))
  );
  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  lines.push(line(header));
  lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  rows.forEach((one) => lines.push(line(one)));

  lines.push('');
  lines.push('по вариантам генерации — доля, принятая за автора:');
  for (const point of report.points) {
    lines.push(
      `  ${point.label}: ` +
        point.byVariant
          .map((one) => `${one.id} ${percent(one.close)}`)
          .join(' · ')
    );
  }
  return lines.join('\n');
}

module.exports = {
  calibrationSweep,
  renderCalibration,
  collectVotes,
  outcomes,
  CALIBRATION_CUT,
  OWN_SAMPLES,
};
