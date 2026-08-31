'use strict';

/**
 * Приёмка `content-factory-next-pl1.6` на трёх настоящих корпусах.
 *
 * Задача требует буквально двух вещей, которые машина может проверить: то, что
 * у автора действительно выражено, названо выраженным на всех корпусах, и что
 * два разных автора получают **разные** описания. Третья — «владелец, читая
 * своё описание, узнаёт себя» — спрашивается у человека и записывается словами.
 *
 * До 28.08.2026 это было проверено на владельце против технической прозы
 * репозитория: расходились пять измерений из десяти. Проза — не автор, и
 * доказывала она в лучшем случае, что норма отличает пост от документации.
 * Здесь стоят три настоящих русских канала.
 *
 * Отклонения считает `deviationsForCorpus` — та самая функция, которой продукт
 * пишет их в измерение. Второй арифметики у стенда нет намеренно.
 *
 * Ни одного вызова модели: всё считается по кэшам корпусов.
 */

const { loadTypeScriptModule } = require('../../../tests/helpers/load-tsx.cjs');

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const { deviationsForCorpus } = loadTypeScriptModule(`${BASE}/voice-norm.ts`);
const { normFor } = loadTypeScriptModule(`${BASE}/voice-norm.sets.ts`);
const { phraseDeviation } = loadTypeScriptModule(`${BASE}/voice-norm.phrasing.ts`);
const { RU_LOCALE_PACK } = loadTypeScriptModule(`${BASE}/locale-pack.ru.ts`);

const packs = { ru: RU_LOCALE_PACK };

/** Полосы словами — то же, что видит человек, но короче, чтобы влезло в столбец. */
const BAND_WORDS = {
  'far-above': 'намного выше',
  above: 'заметно выше',
  typical: 'как обычно',
  below: 'заметно ниже',
  'far-below': 'намного ниже',
  flat: 'ровно',
  absent: '—',
};

/**
 * Выражено ли измерение — то есть попало ли оно хоть в какую-то сторону.
 *
 * Приёмка говорит «то, что у него действительно выражено, названо выраженным».
 * Выраженность — это не знак, а выход из нейтральной полосы: автор, у которого
 * вопросов намного меньше обычного, охарактеризован так же определённо, как
 * тот, у кого их намного больше.
 */
const isStated = (band) => band !== 'typical' && band !== 'absent';

function screenNorms(corpora) {
  const perCorpus = corpora.map(({ name, language, samples }) => {
    const pack = packs[language];
    if (!pack) throw new Error(`no locale pack for "${language}"`);
    const deviations = deviationsForCorpus(samples, pack, normFor(language));
    return { name, language, posts: samples.length, deviations };
  });

  const metrics = [
    ...new Set(
      perCorpus.flatMap((one) => Object.keys(one.deviations?.byMetric ?? {}))
    ),
  ].sort();

  const rows = metrics.map((metric) => {
    const cells = perCorpus.map(
      (one) => one.deviations?.byMetric?.[metric] ?? null
    );
    const bands = cells.map((one) => one?.band ?? 'absent');
    return {
      metric,
      cells,
      /** Названо выраженным везде, где вообще посчиталось. */
      statedEverywhere: bands.every(isStated),
      /** Названо выраженным где-то и нейтральным где-то — расхождение. */
      splits: new Set(bands).size > 1,
      /** Все три по одну сторону — доверять этому измерению нельзя так же. */
      sameSide: new Set(bands).size === 1 && isStated(bands[0]),
    };
  });

  /**
   * Пары авторов, различённые описанием.
   *
   * «Два разных автора получают разные описания» — это про пару, а не про
   * таблицу: три автора дают три пары, и провалиться может любая.
   */
  const pairs = [];
  for (let left = 0; left < perCorpus.length; left += 1) {
    for (let right = left + 1; right < perCorpus.length; right += 1) {
      const differing = metrics.filter(
        (metric) =>
          (perCorpus[left].deviations?.byMetric?.[metric]?.band ?? 'absent') !==
          (perCorpus[right].deviations?.byMetric?.[metric]?.band ?? 'absent')
      );
      pairs.push({
        between: [perCorpus[left].name, perCorpus[right].name],
        differing: differing.length,
        of: metrics.length,
        metrics: differing,
      });
    }
  }

  /**
   * Само описание словами, а не полосами.
   *
   * Приёмка спрашивает человека «узнаёте ли вы себя», и прочитать при этом
   * нечего: строки пишутся в версию голоса при активации и ни на одном экране
   * сегодня не показываются. Здесь они собираются тем же `phraseDeviation`,
   * которым их пишет продукт, — чтобы владельцу было что читать, а не пересказ.
   */
  const said = perCorpus.map(({ name, deviations }) => ({
    name,
    lines: Object.entries(deviations?.byMetric ?? {})
      .map(([metric, value]) => {
        const phrased = phraseDeviation(
          metric,
          {
            band: value.band,
            z: value.z,
            raw: value.raw,
            /**
             * Число эталона отдаётся, а не зануляется. Внутри одной полосы оно
             * единственное, что различает двух авторов: 36,4 % и 56,5 % фраз
             * короче восьми слов читаются одним и тем же предложением.
             */
            normMedian: value.normMedian ?? null,
          },
          'ru'
        );
        return phrased.text
          ? { metric, text: phrased.text, detail: phrased.detail ?? null }
          : null;
      })
      .filter(Boolean),
  }));

  return {
    normVersion: perCorpus[0]?.deviations?.normVersion ?? null,
    corpora: perCorpus.map(({ name, posts }) => ({ name, posts })),
    metrics: rows,
    pairs,
    said,
  };
}

function renderNormScreen(report) {
  const lines = [];
  lines.push(`норма ${report.normVersion ?? '—'}`);
  lines.push(
    'корпуса: ' +
      report.corpora.map((one) => `${one.name} (${one.posts})`).join(', ')
  );
  lines.push('');

  const header = ['измерение', ...report.corpora.map((one) => one.name)];
  const rows = report.metrics.map((row) => [
    row.metric,
    ...row.cells.map((cell) =>
      cell
        ? `${BAND_WORDS[cell.band] ?? cell.band}${
            cell.z === null ? '' : ` (z=${cell.z})`
          }`
        : '—'
    ),
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
  lines.push('пары авторов — сколько измерений их различает:');
  for (const pair of report.pairs) {
    lines.push(
      `  ${pair.between.join(' / ')}: ${pair.differing} из ${pair.of}` +
        (pair.differing ? ` — ${pair.metrics.join(', ')}` : '')
    );
  }

  const sameSide = report.metrics.filter((one) => one.sameSide);
  lines.push('');
  lines.push(
    `по одну сторону нормы у всех троих: ${
      sameSide.length
        ? sameSide.map((one) => one.metric).join(', ')
        : 'ни одного'
    }`
  );
  lines.push(
    'это ограничение доверия, а не находка: часть того, что ловит мерка, —'
  );
  lines.push('«человек, а не модель», а не «этот автор, а не другой».');

  lines.push('');
  lines.push('--- описание словами: то, что продукт сказал бы о человеке ---');
  for (const author of report.said ?? []) {
    lines.push('');
    lines.push(`${author.name}:`);
    for (const line of author.lines) {
      lines.push(`  • ${line.text}${line.detail ? ` (${line.detail})` : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = { screenNorms, renderNormScreen, BAND_WORDS, isStated };
