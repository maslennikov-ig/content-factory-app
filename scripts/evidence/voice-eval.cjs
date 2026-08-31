#!/usr/bin/env node
'use strict';

/**
 * The measurement stand for `content-factory-next-pl1`.
 *
 * Every claim about the brand voice in this epic is judged here. Before it
 * existed, a voice change was judged by reading three outputs, and the session
 * that did so on 2026-08-24 called two fixes correct that were not — one of
 * them after a paid run.
 *
 * Two commands, and the split between them is the whole design:
 *
 *   generate  calls the real model with the space's real key and saves what
 *             came back, together with the exact prompt that produced it.
 *   measure   scores saved generations with the shipped ruler and calls no
 *             model at all, so the ruler can change as often as this epic
 *             needs without buying the sample again.
 *
 * Usage:
 *   node scripts/evidence/voice-eval.cjs corpus   [--corpus owner]
 *   node scripts/evidence/voice-eval.cjs generate --corpus owner
 *   node scripts/evidence/voice-eval.cjs measure  --run <dir> [--cut 800]
 *   node scripts/evidence/voice-eval.cjs measure  --run <dir> --json
 *   node scripts/evidence/voice-eval.cjs second   --run <dir> --model luar
 */

const fs = require('node:fs');
const path = require('node:path');

const corpora = require('./voice-eval/corpora.cjs');
const variantsRegistry = require('./voice-eval/variants.cjs');
const { generate } = require('./voice-eval/generate.cjs');
const { measure, render } = require('./voice-eval/measure.cjs');
const {
  measureWithSecondRuler,
  renderSecondRuler,
} = require('./voice-eval/second-ruler.cjs');
const { foreignTexts } = require('./voice-eval/foreign-corpora.cjs');
const {
  discriminate,
  renderDiscrimination,
} = require('./voice-eval/discrimination.cjs');
const {
  calibrationSweep,
  renderCalibration,
} = require('./voice-eval/calibration.cjs');
const { screen, renderScreen } = require('./voice-eval/habit-screen.cjs');
const {
  screenNorms,
  renderNormScreen,
} = require('./voice-eval/norm-screen.cjs');
const {
  compareNorms,
  render: renderNormsFromPeople,
} = require('./voice-eval/norm-from-people.cjs');
const {
  compose,
  renderComposition,
  BACKGROUND_VARIANT,
} = require('./voice-eval/composition.cjs');
const {
  buildRecognitionMaterial,
  writeRecognitionMaterial,
} = require('./voice-eval/recognise.cjs');
const { TOPICS, TOPICS_VERSION } = require('./voice-eval/topics.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const RUNS = path.join(
  REPO,
  '.codex/stages/content-factory-next-pl1/evidence/runs'
);

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
};

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function commandGenerate(args) {
  const name = args.corpus || 'owner';
  const pulled = await corpora.load(name, args.cache);
  const asked =
    typeof args.variants === 'string'
      ? args.variants.split(',')
      : args.factorial
        ? variantsRegistry.FACTORIAL
        : null;
  const variants = variantsRegistry.resolve(asked);

  const runId = args.run || `${name}-${stamp()}`;
  const outDir = path.isAbsolute(String(runId))
    ? String(runId)
    : path.join(RUNS, String(runId));
  fs.mkdirSync(outDir, { recursive: true });

  /**
   * Whether the run hands the model anything to write from.
   *
   * Off by default, because every run before 2026-08-25 was that way and the
   * comparison has to stay possible. On, the topics come with figures and the
   * graph sees them the way the product's own generator does — which is the
   * only way to ask whether a voice reproduces an author whose habit is to
   * bring his own measurements.
   */
  const withMaterial = Boolean(args['with-material']);

  /**
   * Which capacity to buy.
   *
   * `--tier flex` is the same model out of spare capacity at half the price,
   * and a stand run is what that tier is for: nobody waits on the answer. It
   * never falls back to the default tier, so asking for it cannot quietly cost
   * full price — a shortage is an error, and an interrupted run resumes
   * without paying twice. Off by default: every run before 2026-08-27 was on
   * the default tier and the flag is how a later reader tells them apart.
   */
  const serviceTier = typeof args.tier === 'string' ? args.tier : null;

  process.stdout.write(
    `корпус «${name}»: ${pulled.samples.length} текстов, профиль ` +
      `«${pulled.profile?.label ?? 'нет'}»\n` +
      `варианты: ${variants.map((one) => one.id).join(', ')}\n` +
      `материал: ${withMaterial ? 'да, по темам' : 'нет — только тема'}\n` +
      `тариф: ${serviceTier ?? 'default'}${
        serviceTier === 'flex' ? ' — половина цены' : ''
      }\n` +
      `тем ${TOPICS.length}, генераций ${variants.length * TOPICS.length} — ` +
      `прогон платный\n`
  );

  const started = new Date().toISOString();
  const produced = await generate({
    pulled,
    variants,
    outDir,
    withMaterial,
    serviceTier,
  });
  const meta = {
    runId: path.basename(outDir),
    startedAt: started,
    finishedAt: new Date().toISOString(),
    corpus: {
      name,
      organizationId: pulled.corpus.organizationId,
      language: pulled.corpus.language,
      label: pulled.corpus.label,
      posts: pulled.samples.length,
    },
    profile: pulled.profile
      ? {
          id: pulled.profile.id,
          label: pulled.profile.label,
          versionNumber: pulled.profile.versionNumber,
          measurementId: pulled.profile.measurementId,
        }
      : null,
    model: produced.model,
    topicsVersion: TOPICS_VERSION,
    topics: TOPICS,
    variants: variants.map((one) => ({
      id: one.id,
      label: one.label,
      ref: one.ref ?? null,
      withProfile: one.withProfile,
      narrowed: Boolean(one.shape),
    })),
  };
  fs.writeFileSync(
    path.join(outDir, 'run.json'),
    `${JSON.stringify(meta, null, 2)}\n`
  );
  process.stdout.write(`\nпрогон сохранён: ${outDir}\n`);
  return outDir;
}

const runDirOf = (name) =>
  path.isAbsolute(name) ? name : path.join(RUNS, name);

/**
 * Several runs measured as one.
 *
 * Eight topics per variant is a small sample against a noise floor this stand
 * measured at 0.028, and the epic draws conclusions from differences smaller
 * than that. Pooling runs is the only honest way to shrink it without changing
 * the topic list — which would make every earlier run incomparable.
 */
/** Everything both offline commands need: the runs, their generations, the corpus. */
async function loadRuns(args) {
  const names = String(args.run || '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);
  if (!names.length || names.some((one) => !fs.existsSync(runDirOf(one)))) {
    throw new Error(
      '--run must name one directory made by `generate`, or several separated by commas'
    );
  }
  const metas = names.map((name) =>
    JSON.parse(fs.readFileSync(path.join(runDirOf(name), 'run.json'), 'utf8'))
  );
  const meta = metas[0];
  const differing = metas.filter(
    (one) =>
      one.corpus.name !== meta.corpus.name ||
      one.topicsVersion !== meta.topicsVersion
  );
  if (differing.length) {
    throw new Error(
      'pooled runs must share one corpus and one topic list; these do not'
    );
  }
  const generations = names.flatMap((name) =>
    JSON.parse(
      fs.readFileSync(path.join(runDirOf(name), 'generations.json'), 'utf8')
    ).map((row) => ({ ...row, runId: name }))
  );
  const runDir =
    names.length === 1
      ? runDirOf(names[0])
      : path.join(RUNS, `pooled-${names.join('+')}`);
  fs.mkdirSync(runDir, { recursive: true });
  // `measure` calls no model and must call no database either: it re-scores a
  // sample that has already been paid for, and a freshness check here would
  // make an offline recount depend on the stand being up.
  const pulled = await corpora.load(meta.corpus.name, args.cache, {
    offline: true,
  });
  return { names, metas, meta, generations, runDir, pulled };
}

/**
 * The lineup a run is judged with.
 *
 * The default changed on 2026-08-27 from the shipped set — three files of this
 * repository's own technical documentation — to the other authors of the
 * registry. `impostor-pool.cjs` carries the measurement that decided it. The
 * old lineup stays reachable as `--impostors shipped`, because the epic has to
 * be able to show both numbers side by side.
 */
function lineupFor(name, args) {
  const choice = typeof args.impostors === 'string' ? args.impostors : 'pool';
  if (choice === 'shipped') return [];
  if (choice !== 'pool') {
    throw new Error(`unknown --impostors "${choice}"; known: pool, shipped`);
  }
  const { texts, missing, used } = foreignTexts(name, corpora.registry());
  if (!texts.length) {
    throw new Error(
      `no other corpus of this language in the registry, so «${name}» has ` +
        'nobody to stand beside it; add one or pass --impostors shipped'
    );
  }
  if (missing.length) {
    process.stderr.write(
      `шеренга неполна: нет кэша корпусов ${missing.join(', ')} — ` +
        'вытяните их, иначе числа этого прогона несравнимы с прежними\n'
    );
  }
  process.stderr.write(`шеренга: ${used.join(', ')}\n`);
  return texts;
}

async function commandMeasure(args) {
  const { metas, meta, generations, runDir, pulled } = await loadRuns(args);

  const report = measure({
    pulled,
    generations,
    cut: args.cut ? Number(args.cut) : undefined,
    /**
     * Одни и те же чужие тексты и на шеренгу, и на порог.
     *
     * Иначе голос считался бы против одной шеренги, а порог был бы снят против
     * другой — обе величины лежат в нуле-единице и обе выглядят как доля
     * голосов, так что ошибка была бы бесшумной.
     */
    foreignTexts: lineupFor(meta.corpus.name, args),
  });
  report.run = {
    runIds: metas.map((one) => one.runId),
    finishedAt: metas.map((one) => one.finishedAt),
    model: meta.model,
    topicsVersion: meta.topicsVersion,
    variants: meta.variants,
  };

  // Named by the cut, because a report measured at another cut is a different
  // reading of the same generations and overwriting one with the other is how
  // two numbers become one argument.
  const stem = `report-cut${report.cut.applied}`;
  fs.writeFileSync(
    path.join(runDir, `${stem}.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );
  const table = render(report);
  fs.writeFileSync(path.join(runDir, `${stem}.txt`), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
  process.stdout.write('\n');
}

/**
 * The same generations through a ruler trained somewhere else.
 *
 * Free and offline like `measure`, and separate from it because it needs a
 * Python environment the rest of the stand does not: the epic must be able to
 * run the first ruler on a machine that never downloaded a model weight.
 */
async function commandSecond(args) {
  const { meta, generations, runDir, pulled } = await loadRuns(args);
  const model = String(args.model || 'luar');
  const report = measureWithSecondRuler({
    pulled,
    generations,
    cut: args.cut ? Number(args.cut) : undefined,
    model,
  });
  report.run = {
    runIds: meta ? [meta.runId] : [],
    model: meta.model,
    topicsVersion: meta.topicsVersion,
  };
  const stem = `second-${model}-cut${report.cut.applied}`;
  fs.writeFileSync(
    path.join(runDir, `${stem}.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );
  const table = renderSecondRuler(report);
  fs.writeFileSync(path.join(runDir, `${stem}.txt`), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
  process.stdout.write('\n');
}

/**
 * Is the ruler bent, or only badly aimed — `content-factory-next-pl1.5`.
 *
 * Free and offline. Ranking (AUC) and the operating point are computed apart,
 * because the epic's two apparently contradictory numbers — 64.4% of pairs and
 * one rejection in twenty-four — are those two things and not one.
 */
async function commandDiscriminate(args) {
  const { generations, runDir, pulled } = await loadRuns(args);
  const report = discriminate({
    pulled,
    generations,
    foreignTexts: lineupFor(pulled.corpus.name, args),
    cuts: args.cuts
      ? String(args.cuts)
          .split(',')
          .map((one) => Number(one.trim()))
          .filter(Boolean)
      : undefined,
  });
  fs.writeFileSync(
    path.join(runDir, 'discrimination.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  const table = renderDiscrimination(report);
  fs.writeFileSync(path.join(runDir, 'discrimination.txt'), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
  process.stdout.write('\n');
}

/**
 * На своём ли месте сам порог — `content-factory-next-pl1.5`.
 *
 * Бесплатно и офлайн: порог снимается заново против сохранённых генераций
 * того же прогона и печатается рядом с тем, который снят против чужих людей.
 * Обе точки меряются по обеим сторонам, потому что точка, снятая на
 * генерациях, обязана сказать, что она делает с чужими людьми.
 */
async function commandCalibrate(args) {
  const { generations, runDir, pulled } = await loadRuns(args);
  const report = calibrationSweep({
    pulled,
    generations,
    foreignTexts: lineupFor(pulled.corpus.name, args),
    cut: args.cut ? Number(args.cut) : undefined,
  });
  const stem = `calibration-cut${report.cut}`;
  fs.writeFileSync(
    path.join(runDir, `${stem}.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );
  const table = renderCalibration(report);
  fs.writeFileSync(path.join(runDir, `${stem}.txt`), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
  process.stdout.write('\n');
}

/**
 * Хватает ли голосу привычек поста — пункт 2 `content-factory-next-pl1.5`.
 *
 * Бесплатно и офлайн. Печатает парный тест по голосам, по привычкам и по их
 * слиянию; правило приёмки задачи — составная мерка остаётся, только если
 * поднимает число на всех трёх корпусах.
 */
async function commandHabits(args) {
  const { generations, runDir, pulled } = await loadRuns(args);
  const report = screen({
    pulled,
    generations,
    foreignTexts: lineupFor(pulled.corpus.name, args),
  });
  fs.writeFileSync(
    path.join(runDir, 'habit-screen.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  const table = renderScreen(report);
  fs.writeFileSync(path.join(runDir, 'habit-screen.txt'), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
  process.stdout.write('\n');
}

/**
 * Разные ли описания у разных авторов — приёмка `content-factory-next-pl1.6`.
 *
 * Бесплатно и офлайн, по кэшам корпусов реестра. Третья половина приёмки —
 * «владелец, читая своё описание, узнаёт себя» — здесь не проверяется и
 * проверена быть не может: её спрашивают у человека.
 */
async function commandNorm(args) {
  const names =
    typeof args.corpus === 'string'
      ? args.corpus.split(',')
      : Object.keys(corpora.registry());
  const loaded = [];
  for (const name of names) {
    const pulled = await corpora.load(name, args.cache, { offline: true });
    loaded.push({
      name,
      language: pulled.corpus.language,
      samples: pulled.samples,
    });
  }
  const target = path.join(
    REPO,
    '.codex/stages/content-factory-next-pl1/evidence/avatars'
  );
  fs.mkdirSync(target, { recursive: true });

  /**
   * `--people` отвечает на вопрос владельца 28.08.2026: хватит ли настоящих
   * постов вместо собственной генерации в роли эталона. Отдельным флагом, а не
   * заменой: отгруженная норма остаётся тем, по чему продукт описывает людей,
   * и обе стороны печатаются одной командой ровно затем, чтобы их сравнивали.
   */
  if (args.people) {
    const report = compareNorms(loaded);
    const table = renderNormsFromPeople(report);
    fs.writeFileSync(
      path.join(target, 'norm-from-people.json'),
      `${JSON.stringify(report, null, 2)}\n`
    );
    fs.writeFileSync(path.join(target, 'norm-from-people.txt'), `${table}\n`);
    process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
    process.stdout.write('\n');
    return;
  }

  const report = screenNorms(loaded);
  const table = renderNormScreen(report);
  fs.writeFileSync(
    path.join(target, 'norm-screen.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  fs.writeFileSync(path.join(target, 'norm-screen.txt'), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) : table);
  process.stdout.write('\n');
}

/**
 * What the stand would measure, before anything is paid for.
 *
 * The number the split produces is the one thing a run cannot recover from
 * getting wrong: the training part decides the print, the print decides the
 * threshold, and every distance in the report is read against it. Since a
 * space holds three authors, the cheapest way to be wrong is to point at the
 * wrong one — and until this command, finding that out cost a generation.
 *
 * It calls no model. Given no `--corpus` it walks the whole registry, which is
 * what «the three corpora differ, and match the product» is asked with.
 */
async function commandCorpus(args) {
  const { buildRuler } = require('./voice-eval/ruler.cjs');
  const names =
    typeof args.corpus === 'string'
      ? args.corpus.split(',')
      : Object.keys(corpora.registry());
  const rows = [];
  for (const name of names) {
    const pulled = await corpora.load(name, args.cache);
    const ruler = buildRuler(pulled.samples, pulled.corpus.language, {
      foreignTexts: lineupFor(name, args),
    });
    rows.push({
      name,
      avatar: pulled.corpus.avatar,
      avatarId: pulled.corpus.avatarId,
      isDefault: Boolean(pulled.corpus.avatarIsDefault),
      posts: pulled.samples.length,
      characters: pulled.samples.reduce((sum, one) => sum + one.text.length, 0),
      trainingCount: ruler.measurement.sampleCount,
      holdoutCount: ruler.holdoutCodes.size,
      profile: pulled.profile
        ? {
            id: pulled.profile.id,
            versionNumber: pulled.profile.versionNumber,
            portrait: pulled.profile.content?.persona?.portrait?.length ?? 0,
            examples: (pulled.profile.content?.examples ?? []).length,
          }
        : null,
    });
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  for (const row of rows) {
    process.stdout.write(
      `${row.name} · ${row.avatar}${row.isDefault ? ' (по умолчанию)' : ''}\n` +
        `  корпус ${row.posts} текстов, ${row.characters} знаков\n` +
        `  обучающая часть ${row.trainingCount} · отложенная ${row.holdoutCount}\n` +
        `  голос ${
          row.profile
            ? `v${row.profile.versionNumber}, портрет ${row.profile.portrait} знаков, ` +
              `цитат ${row.profile.examples}`
            : 'не собран'
        }\n`
    );
  }
}

/**
 * Материал, на котором владелец отвечает «узнаю ли я себя» — приёмка `pl1.6`.
 *
 * Бесплатно: портрет и описание уже посчитаны, генерации уже оплачены. Файл
 * пишется рядом с прочими артефактами аватаров и НЕ попадает в git — он
 * состоит из собственных текстов автора.
 */
async function commandRecognise(args) {
  const name = typeof args.corpus === 'string' ? args.corpus : 'owner';
  const { generations, pulled } = await loadRuns(args);
  const norms = screenNorms([
    {
      name,
      language: pulled.corpus.language,
      samples: pulled.samples,
    },
  ]);
  const said = (norms.said ?? []).find((one) => one.name === name);
  const { buildRuler } = require('./voice-eval/ruler.cjs');
  const ruler = buildRuler(pulled.samples, pulled.corpus.language, {
    foreignTexts: lineupFor(name, args),
  });
  const text = buildRecognitionMaterial({
    corpusName: name,
    portrait: pulled.profile?.content?.persona?.portrait ?? null,
    lines: said?.lines ?? [],
    holdoutTexts: ruler.inputs
      .filter((one) => ruler.holdoutCodes.has(one.code))
      .map((one) => one.text),
    generatedTexts: generations
      .filter((one) => !one.error && one.text && one.variantId === 'product')
      .map((one) => one.text),
  });
  const file = writeRecognitionMaterial(
    path.join(
      REPO,
      '.codex/stages/content-factory-next-pl1/evidence/avatars',
      `recognise-${name}.txt`
    ),
    text
  );
  process.stdout.write(`${file}\n`);
}

/**
 * Состав измерений против генерации — `content-factory-next-pl1.7`.
 *
 * Идёт сразу по трём корпусам: число, полученное на одном, в этом эпике не
 * считается полученным. Фон второго правила собирается из варианта `none` —
 * из того, что модель пишет, когда голоса нет вовсе.
 *
 * Бесплатно и офлайн.
 */
async function commandComposition(args) {
  const names =
    typeof args.corpus === 'string'
      ? args.corpus.split(',')
      : Object.keys(corpora.registry());
  const reports = [];
  for (const name of names) {
    const runs = String(args.runs ?? '')
      .split(',')
      .map((one) => one.trim())
      .filter((one) => one.startsWith(`${name}-`));
    if (!runs.length) {
      throw new Error(`корпусу «${name}» не передан ни один прогон в --runs`);
    }
    const { generations, pulled } = await loadRuns({ ...args, run: runs.join(',') });
    const backgroundTexts = generations
      .filter((one) => !one.error && one.text && one.variantId === BACKGROUND_VARIANT)
      .map((one) => one.text);
    if (!backgroundTexts.length) {
      throw new Error(
        `корпус «${name}»: в прогонах нет варианта «${BACKGROUND_VARIANT}», ` +
          'а он и есть фон второго правила'
      );
    }
    reports.push(
      compose({
        pulled,
        generations,
        foreignTexts: lineupFor(name, args),
        backgroundTexts,
      })
    );
  }
  const target = path.join(
    REPO,
    '.codex/stages/content-factory-next-pl1/evidence/avatars'
  );
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, 'composition.json'),
    `${JSON.stringify(reports, null, 2)}\n`
  );
  const table = renderComposition(reports);
  fs.writeFileSync(path.join(target, 'composition.txt'), `${table}\n`);
  process.stdout.write(args.json ? JSON.stringify(reports, null, 2) : table);
  process.stdout.write('\n');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'corpus') return commandCorpus(args);
  if (command === 'generate') return commandGenerate(args);
  if (command === 'measure') return commandMeasure(args);
  if (command === 'second') return commandSecond(args);
  if (command === 'discriminate') return commandDiscriminate(args);
  if (command === 'calibrate') return commandCalibrate(args);
  if (command === 'habits') return commandHabits(args);
  if (command === 'norm') return commandNorm(args);
  if (command === 'recognise') return commandRecognise(args);
  if (command === 'composition') return commandComposition(args);
  process.stderr.write(
    'usage: voice-eval.cjs corpus [--corpus <name[,name]>] [--json]\n' +
      '       voice-eval.cjs generate --corpus <name> [--factorial] [--tier flex]\n' +
      '       voice-eval.cjs measure --run <dir> [--cut N] [--json]\n' +
      '       voice-eval.cjs second  --run <dir> [--cut N] [--model luar|mstyledistance]\n' +
      '       voice-eval.cjs discriminate --run <dir> [--cuts 600,800,823]\n' +
      '       voice-eval.cjs calibrate --run <dir> [--cut N] [--json]\n' +
      '       voice-eval.cjs habits    --run <dir> [--json]\n' +
      '       voice-eval.cjs norm      [--corpus <name[,name]>] [--people] [--json]\n' +
      '       voice-eval.cjs recognise --run <dir> [--corpus owner]\n' +
      '       voice-eval.cjs composition --runs <dir,dir,...> [--corpus <name,...>]\n'
  );
  process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
