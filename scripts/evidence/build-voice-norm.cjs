#!/usr/bin/env node
'use strict';

/**
 * Builds the norm an author is described against, from the product's own
 * generation with no voice at all.
 *
 * «Доля вопросительных фраз 6,2 %» tells nobody anything. «Заметно чаще
 * обычного» does, and the method behind it is fifty years old — Burrows's
 * Delta, a z against a reference. The reference has to match the author in
 * language and register, which is the whole reason it is not a ready-made
 * corpus: every licence-clean corpus of short social writing turned out either
 * not to exist or not to be checkable, and a Telegram author compared against
 * scientific papers discovers the register rather than the person.
 *
 * So the reference is what the product itself writes when nobody tells it whose
 * voice to use. Owner's decision of 2026-08-25, with its weakness recorded in
 * the same breath: the norm is a model, not people, and every sentence built on
 * it says «обычного сгенерированного поста» rather than «большинства людей».
 *
 * What ships is derived statistics — a median and a MAD per metric — and never
 * text, the same rule `build-impostor-prints.cjs` follows.
 *
 * Usage:
 *   node scripts/evidence/build-voice-norm.cjs
 *   node scripts/evidence/build-voice-norm.cjs --dry-run
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const { loadTypeScriptModule } = require(path.join(
  REPO,
  'tests/helpers/load-tsx.cjs'
));

const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const scales = loadTypeScriptModule(`${BASE}/style-scales.ts`);
const packs = loadTypeScriptModule(`${BASE}/locale-pack.ts`);
const norm = loadTypeScriptModule(`${BASE}/voice-norm.ts`);
const types = loadTypeScriptModule(`${BASE}/brand-voice.types.ts`);
const composite = loadTypeScriptModule(`${BASE}/voice-composite.ts`);

const RUNS = path.join(
  REPO,
  '.codex/stages/content-factory-next-pl1/evidence/runs'
);

/**
 * The variant that is the norm, and the only one that can be.
 *
 * `none` is generation with no voice block at all. Any other variant carries
 * somebody's voice, and a norm built from it would describe that author rather
 * than the population they are being compared against.
 */
const NORM_VARIANT = 'none';

/**
 * Эмодзи и остальные судящие измерения приходят из продукта.
 *
 * Здесь стояла собственная копия класса `\p{Extended_Pictographic}` с
 * оговоркой, что тест держит две реализации равными. Оговорка больше не нужна:
 * `measureJudgingMetrics` считает эмодзи там же, где их считает вердикт, и
 * копии не осталось. Замер 30.08.2026 показал, чего стоит противоположный
 * порядок: восемь измерений, посчитанных дважды, разошлись на 5,5 пункта.
 */

/** Every no-voice generation this machine has, across every saved run. */
function normTexts() {
  if (!fs.existsSync(RUNS)) return [];
  const texts = [];
  for (const dir of fs.readdirSync(RUNS).sort()) {
    const file = path.join(RUNS, dir, 'generations.json');
    if (!fs.existsSync(file)) continue;
    for (const one of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      if (one?.variantId !== NORM_VARIANT || one.error) continue;
      const text = String(one.text ?? '').trim();
      if (text) texts.push({ run: dir, text });
    }
  }
  return texts;
}

/**
 * The metrics a norm is stated for, and why the rest are left out.
 *
 * A robust z needs a distribution, and only a metric measured per post has
 * one. The eight scales do — `measureSingleText` computes them for a single
 * text — and so do the post's length and its emoji rate.
 *
 * The six remaining habits (`opensWithAdmission`, `opensWithNumber`,
 * `opensWithQuestion`, `endsWithCallToAction`, `carriesLink`,
 * `carriesOwnMeasurement`) are yes/no per post and only become numbers as a
 * share over a set. A median and a MAD over zeros and ones says nothing, and
 * comparing two shares is a different statistic with different thresholds —
 * which would break the one rule this task is about: the bands are set once for
 * every measurement, not picked per metric. They keep their raw share and the
 * deviation reports `absent`, which is the honest answer and the one the type
 * was given a value for.
 */
const perPostMetrics = () => [
  ...new Set([
    ...types.STYLE_SCALE_KEYS,
    'postLength',
    ...composite.COMPOSITE_JUDGING_METRICS,
  ]),
];

function valuesOf(texts, pack) {
  const collected = new Map(perPostMetrics().map((key) => [key, []]));
  for (const { text } of texts) {
    const measured = scales.measureSingleText(text, pack);
    for (const key of types.STYLE_SCALE_KEYS) {
      const value = measured[key];
      if (Number.isFinite(value)) collected.get(key).push(value);
    }
    collected.get('postLength').push(text.length);
    /**
     * Судящие измерения — тем же кодом, каким их считает вердикт.
     *
     * Четыре из них (раскладка поста) и `digitShare` в норме до 30.08.2026
     * отсутствовали вовсе, поэтому второй мерке не с чем было сравнивать.
     */
    const judged = composite.measureJudgingMetrics(text, pack);
    for (const key of composite.COMPOSITE_JUDGING_METRICS) {
      // Две шкалы ритма уже собраны выше как шкалы стиля. Собрать их второй раз
      // значило бы удвоить каждое наблюдение: медиана и MAD этого не заметят, а
      // счётчик `observed` начнёт врать вдвое — поле, заведённое ровно затем,
      // чтобы говорить правду о числе наблюдений.
      if (types.STYLE_SCALE_KEYS.includes(key)) continue;
      const value = judged[key];
      if (Number.isFinite(value)) collected.get(key).push(value);
    }
  }
  return collected;
}

const render = (locale, source, texts, stats) => {
  const entries = [...stats.entries()]
    .filter(([, stat]) => stat)
    .map(
      ([key, stat]) =>
        `    ${key}: { median: ${stat.median}, scale: ${stat.scale}, observed: ${stat.observed} },`
    )
    .join('\n');
  return `import type { VoiceNorm } from './voice-norm';
import { VOICE_NORM_VERSION } from './voice-norm';

/**
 * The norm for \`${locale}\`, built by \`scripts/evidence/build-voice-norm.cjs\`.
 *
 * Derived statistics only: a median and a robust MAD per metric, over ${texts.length}
 * posts the product wrote with no voice block at all. This file holds no
 * sentence anybody wrote, and none of the texts it was computed from.
 *
 * The norm is a model, not people. Every sentence the product builds on it says
 * «обычного сгенерированного поста» and never «большинства людей» — see
 * \`voice-norm.ts\` for why that wording is load-bearing rather than modest.
 *
 * Six post habits are absent on purpose: they are yes/no per post and only
 * become numbers as a share, which is a different statistic with different
 * thresholds. A metric observed in fewer than \`MIN_NORM_POSTS\` of the
 * reference is absent too, for a different reason — \`voice-norm.ts\` states
 * both.
 *
 * Rebuild with the script; do not edit by hand.
 */
export const ${locale.toUpperCase()}_VOICE_NORM: VoiceNorm = {
  version: VOICE_NORM_VERSION,
  locale: '${locale}',
  source: '${source}',
  posts: ${texts.length},
  stats: {
${entries}
  },
};
`;
};

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const texts = normTexts();
  const runs = [...new Set(texts.map((one) => one.run))];
  console.log(
    `без голоса: ${texts.length} текстов из ${runs.length} прогонов (${runs.join(', ')})`
  );
  if (texts.length < norm.MIN_NORM_POSTS) {
    throw new Error(
      `норма строится от ${norm.MIN_NORM_POSTS} текстов, а найдено ${texts.length}; ` +
        'прогоны стенда лежат локально и в репозиторий не попадают — ' +
        'запустите generate или возьмите машину, где они есть'
    );
  }

  const pack = packs.packFor('ru');
  const collected = valuesOf(texts, pack);
  const stats = new Map();
  for (const [key, values] of collected) {
    stats.set(key, norm.normStatOf(values));
  }

  for (const [key, stat] of stats) {
    console.log(
      stat
        ? `  ${key.padEnd(22)} медиана ${String(stat.median).padStart(8)} · разброс ${String(stat.scale).padStart(8)} · наблюдений ${stat.observed}`
        : `  ${key.padEnd(22)} пропущено: наблюдений меньше ${norm.MIN_NORM_POSTS}`
    );
  }

  const source =
    'собственная генерация продукта без голоса, ' +
    `${texts.length} постов, восемь нейтральных тем, openai/gpt-5.6-luna, температура 0,7`;
  const file = path.join(REPO, BASE, 'voice-norm.ru.ts');
  const rendered = render('ru', source, texts, stats);
  if (dryRun) {
    console.log('\n--dry-run: файл не записан');
    return;
  }
  fs.writeFileSync(file, rendered);
  console.log(`\nзаписано: ${path.relative(REPO, file)}`);
}

main();
