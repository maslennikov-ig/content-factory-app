#!/usr/bin/env node
/**
 * A live pass over the brand-voice routes with a real session.
 *
 * It feeds the corpus from `docs/product/*.md` in two moves — one batch below
 * the floor, one that crosses it — so the evidence shows both answers the
 * contract promises: `insufficient` with the number of characters still
 * missing, and the analysis that runs once the floor is behind.
 *
 * Usage: node scripts/evidence/run-voice-walkthrough.cjs <evidenceDir>
 * Reads the session token from CF_AUTH_TOKEN.
 */

const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.CF_BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.CF_AUTH_TOKEN;
const OUT = process.argv[2];
const REPO = path.resolve(__dirname, '../..');

if (!TOKEN || !OUT) {
  console.error('need CF_AUTH_TOKEN and an output directory');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });

async function call(method, route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Cookie: `auth=${TOKEN}`,
      Origin: 'http://localhost:4200',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 2000) };
  }
  return { status: response.status, body: parsed };
}

function save(name, payload) {
  fs.writeFileSync(
    path.join(OUT, `${name}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

/** Prose paragraphs from the product docs, stripped of markdown furniture. */
function paragraphs(file) {
  const raw = fs.readFileSync(path.join(REPO, 'docs/product', file), 'utf8');
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(
      (block) =>
        block.length > 400 &&
        !block.startsWith('#') &&
        !block.startsWith('|') &&
        !block.startsWith('```') &&
        !block.includes('```'),
    )
    .map((block) => block.replace(/\s+/g, ' '));
}

async function main() {
  const sources = [
    'brand-voice-from-samples-spec.md',
    'content-intelligence-brand-profile-spec.md',
    'content-creation-wiring-spec.md',
    'content-memory-spec.md',
    'content-source-registry-spec.md',
    'cloud-saas-growth-spec.md',
    'telegram-pipeline-mvp.md',
    'migration-map.md',
    'product-scope.md',
  ];

  const pool = [];
  for (const file of sources) {
    for (const [index, text] of paragraphs(file).entries()) {
      pool.push({ title: `${file} · фрагмент ${index + 1}`, text });
    }
  }

  const items = [];
  let chars = 0;
  for (const candidate of pool) {
    if (items.length >= 12 && chars >= 18000) break;
    items.push(candidate);
    chars += candidate.text.length;
  }

  const log = { pool: pool.length, chosen: items.length, chars };

  // First move: three samples, deliberately under the floor.
  const first = items.slice(0, 3);
  const firstIntake = await call('POST', '/content-intelligence/voice/samples', {
    origin: 'PASTE',
    usagePurpose: 'OWN_VOICE',
    language: 'ru',
    items: first,
  });
  save('step3-01-samples-below-floor', {
    sent: { count: first.length, chars: first.reduce((n, i) => n + i.text.length, 0) },
    ...firstIntake,
  });

  save(
    'step3-02-analysis-below-floor',
    await call('POST', '/content-intelligence/voice/analysis', { language: 'ru' }),
  );

  // Second move: the rest, crossing the floor.
  const rest = items.slice(3);
  const secondIntake = await call('POST', '/content-intelligence/voice/samples', {
    origin: 'PASTE',
    usagePurpose: 'OWN_VOICE',
    language: 'ru',
    items: rest,
  });
  save('step3-03-samples-above-floor', {
    sent: { count: rest.length, chars: rest.reduce((n, i) => n + i.text.length, 0) },
    ...secondIntake,
  });

  save('step3-04-analysis', await call('POST', '/content-intelligence/voice/analysis', {
    language: 'ru',
  }));
  save('step3-05-proposal', await call('GET', '/content-intelligence/voice/proposal'));
  save('step3-06-overview', await call('GET', '/content-intelligence/voice/overview'));

  fs.writeFileSync(path.join(OUT, 'step3-corpus.json'), `${JSON.stringify(log, null, 2)}\n`);
  console.log(JSON.stringify(log));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
