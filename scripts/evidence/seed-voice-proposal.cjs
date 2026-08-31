#!/usr/bin/env node
/**
 * Puts a voice proposal on the newest measurement so the passport can be
 * reached on a stand with no model behind it.
 *
 * `POST /voice/analysis {withAssist:true}` is the only writer of a proposal,
 * and it answers `VOICE_ASSIST_UNAVAILABLE` where no provider is configured.
 * Everything after that point — accepting a field, activating, the passport,
 * the scales, the ribbon — is product code that never asks a model, so the
 * one missing piece is written here and the rest is walked through the real
 * routes.
 *
 * The quotes are taken from the samples actually stored, so the grounding
 * check in `proposal()` sees sample codes that exist.
 *
 * Usage: node scripts/evidence/seed-voice-proposal.cjs <organizationId>
 */

const { execFileSync } = require('node:child_process');

const CONTAINER = process.env.CF_PG_CONTAINER || 'cf-dev-postgres';
const USER = process.env.CF_PG_USER || 'cf-dev';
const DB = process.env.CF_PG_DB || 'cf-dev-db';
const organizationId = process.argv[2];

if (!organizationId) {
  console.error('need an organization id');
  process.exit(2);
}

const psql = (sql) =>
  execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB, '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim();

// `smp-NN` is not a column: the repository numbers rows by `createdAt, id`
// over every row the workspace ever added, and the same order is repeated here.
const samples = JSON.parse(
  psql(
    `SELECT coalesce(json_agg(row_to_json(s) ORDER BY s.n), '[]'::json)::text FROM (
       SELECT
         'smp-' || lpad(
           (row_number() OVER (ORDER BY "createdAt" ASC, id ASC))::text, 2, '0'
         ) AS code,
         row_number() OVER (ORDER BY "createdAt" ASC, id ASC) AS n,
         left(text, 240) AS quote
       FROM "BrandVoiceSample"
       WHERE "organizationId" = '${organizationId}'
     ) s WHERE s.n <= 5`,
  ),
);

if (samples.length < 5) {
  console.error(`only ${samples.length} samples stored; need five to ground the fields`);
  process.exit(1);
}

const plan = [
  {
    key: 'WHO_SPEAKS',
    text: 'Говорит инженерная команда продукта: от первого лица множественного числа, без представителя бренда и без обращения «мы в компании».',
    claim: 'Корпус написан от лица команды, а не от лица бренда.',
  },
  {
    key: 'TONE',
    text: 'Тон спокойный и точный: утверждение, затем причина. Без восклицаний, без превосходных степеней, без призывов.',
    claim: 'В корпусе нет восклицательных знаков и оценочных усилителей.',
  },
  {
    key: 'AUDIENCE',
    text: 'Читатель — инженер или редактор, который принимает решение по продукту и хочет увидеть основание, а не обещание.',
    claim: 'Тексты обращаются к читателю, который проверяет утверждение.',
  },
  {
    key: 'SENTENCE_LENGTH',
    text: 'Предложения средней длины, 14–22 слова, с одним придаточным. Длинную мысль корпус разбивает на два предложения, а не на список.',
    claim: 'Средняя длина предложения держится в этом коридоре.',
    metric: 'sentenceLength',
  },
  {
    key: 'NEVER_SAY',
    text: 'революционный; лучший на рынке; просто и легко; уникальное решение',
    claim: 'Ни одна из этих формулировок в корпусе не встречается.',
  },
];

const observations = plan.map((field, index) => ({
  ref: `obs-${String(index + 1).padStart(2, '0')}`,
  index: index + 1,
  field: field.key,
  claim: field.claim,
  quote: samples[index].quote,
  sampleCode: samples[index].code,
  metric: field.metric ?? null,
}));

const proposal = {
  fields: plan.map((field, index) => ({
    key: field.key,
    text: field.text,
    status: 'UNDECIDED',
    observationRefs: [observations[index].ref],
  })),
  observations,
  categories: {
    pointOfView: 'company_we',
    formality: 'neutral',
    emojiPolicy: 'none',
    hashtagPolicy: 'restrained',
    neverSay: ['революционный', 'лучший на рынке'],
  },
};

const measurementId = psql(
  `SELECT id FROM "BrandVoiceMeasurement"
   WHERE "organizationId" = '${organizationId}'
   ORDER BY "createdAt" DESC LIMIT 1`,
);

if (!measurementId) {
  console.error('no measurement stored; run the analysis first');
  process.exit(1);
}

const literal = JSON.stringify(proposal).replace(/'/g, "''");
psql(
  `UPDATE "BrandVoiceMeasurement"
   SET metrics = jsonb_set(metrics::jsonb, '{proposal}', '${literal}'::jsonb, true)
   WHERE id = '${measurementId}'`,
);

console.log(
  JSON.stringify({
    measurementId,
    fields: proposal.fields.map((field) => field.key),
    groundedIn: observations.map((one) => one.sampleCode),
  }),
);
