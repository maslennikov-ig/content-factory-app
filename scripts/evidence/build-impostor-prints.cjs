#!/usr/bin/env node
'use strict';

/**
 * Builds the impostor sets the relative decision needs, as frequencies.
 *
 * The product asks "is this text closer to its author than to anybody else",
 * and "anybody else" has to ship with the product. What ships is derived
 * statistics — rates of character windows — and never text: the research is
 * unanimous that a corpus does not go inside a product, and every licence-clean
 * corpus of short social writing turned out not to exist for any of the sixteen
 * locales.
 *
 * So the impostors are this repository's own documents, written by people who
 * are not any workspace's author, read from a pinned commit and reduced to
 * frequencies. AGPL-3.0, ours, and nobody's personal writing.
 *
 * Three impostors per language, from disjoint parts: one makes the vote a coin
 * toss between two profiles, and overlapping text makes three copies of one
 * opinion.
 *
 * Usage:
 *   node scripts/evidence/build-impostor-prints.cjs
 *
 * Needs the full history. The pinned commit is read with `git show`, so this
 * runs in the private archive and not in a clone of the public repository,
 * which is one commit deep by design. `read()` returns null rather than
 * throwing, so a clone gets an empty rebuild instead of a crash — the output it
 * already ships stays valid either way, and nothing in the product or the suite
 * calls this script. The corpus that the suite does read was moved into
 * `tests/fixtures/english-corpus/` on 31.08.2026 for exactly this reason.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const { loadTypeScriptModule } = require(path.join(
  REPO,
  'tests/helpers/load-tsx.cjs'
));
const BASE = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const ngrams = loadTypeScriptModule(`${BASE}/character-ngrams.ts`);

/** Pinned, so a rebuild that changes nothing produces no diff. */
const COMMIT = '00a7bfa8';

const SOURCES = {
  ru: {
    label: 'русская техническая проза этого репозитория',
    files: [
      'docs/operations/production-deploy.md',
      'docs/product/brand-voice-from-samples-spec.md',
      'docs/product/content-intelligence-brand-profile-spec.md',
      'docs/design/content-factory-interface-specification.md',
      'docs/product/telegram-pipeline-mvp.md',
      'docs/architecture/system-overview.md',
    ],
  },
  en: {
    label: 'English prose of this repository and its inherited documents',
    files: [
      'CODE_OF_CONDUCT.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'README.md',
      'AGENTS.md',
      'docs/adr/0005-release-content-factory-next-under-agpl.md',
      'docs/adr/0009-external-services-allowed-when-justified.md',
      'docs/adr/0010-cloud-first-agpl-saas.md',
      'docs/adr/0001-postiz-fork-baseline.md',
    ],
  },
};

const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

const strip = (text) =>
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
    .replace(EMOJI, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const read = (file) => {
  try {
    return execFileSync('git', ['show', `${COMMIT}:${file}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
  } catch {
    return null;
  }
};

/**
 * Rates rounded to six digits and sorted by window.
 *
 * Sorted because a file whose key order depends on a hash map is a file that
 * produces a diff every time somebody rebuilds it; rounded because the seventh
 * digit of a frequency is noise that costs a kilobyte per thousand windows.
 */
const ratesOf = (texts, size) => {
  const pooled = new Map();
  let total = 0;
  for (const text of texts) {
    for (const [gram, count] of ngrams.countNgrams(text, size)) {
      pooled.set(gram, (pooled.get(gram) ?? 0) + count);
      total += count;
    }
  }
  if (!total) return null;
  /**
   * The common windows only, and the count is a budget rather than a finding.
   *
   * A vote compares half of the author's windows at a time, so an
   * impostor needs to be answerable about the windows a person actually
   * repeats — not about every five characters that occurred once in a
   * specification. Five thousand keeps every window seen more than once in
   * these documents while holding the shipped file near a hundred kilobytes.
   */
  const entries = [...pooled.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
    .slice(0, 5_000)
    .sort((left, right) => (left[0] < right[0] ? -1 : 1));
  const rates = {};
  for (const [gram, count] of entries) {
    rates[gram] = Number((count / total).toFixed(6));
  }
  return rates;
};

const build = (locale) => {
  const source = SOURCES[locale];
  const texts = source.files.map(read).filter(Boolean).map(strip);
  if (texts.length < 3) {
    throw new Error(`${locale}: need at least three readable documents`);
  }
  const per = Math.floor(texts.length / 3);
  const impostors = [];
  for (let index = 0; index < 3; index += 1) {
    const slice =
      index === 2 ? texts.slice(index * per) : texts.slice(index * per, (index + 1) * per);
    const rates = ratesOf(slice, ngrams.NGRAM_SIZE);
    if (rates) impostors.push(rates);
  }
  return { locale, label: source.label, impostors };
};

const render = ({ locale, label, impostors }) => {
  const upper = locale.toUpperCase();
  return `import type { ImpostorSet } from './impostors';

/**
 * Impostors for \`${locale}\`, built by \`scripts/evidence/build-impostor-prints.cjs\`.
 *
 * Frequencies of character windows, not text: what a product ships is derived
 * statistics, and this file holds no sentence anybody wrote. The source is
 * ${label}, read from commit ${COMMIT} —
 * documents of this repository, under its own AGPL-3.0, written by people who
 * are not any workspace's author.
 *
 * Three impostors from disjoint documents. Rebuild only from the pinned commit;
 * rebuilding from the working tree makes the verdict a function of whatever was
 * edited last.
 */
export const ${upper}_IMPOSTORS: ImpostorSet = {
  version: 'impostors-${locale}-2026-08-25',
  locale: '${locale}',
  source: '${label}, коммит ${COMMIT}',
  size: ${ngrams.NGRAM_SIZE},
  impostors: ${JSON.stringify(impostors)},
};
`;
};

for (const locale of Object.keys(SOURCES)) {
  const built = build(locale);
  const file = path.join(REPO, BASE, `impostors.${locale}.ts`);
  fs.writeFileSync(file, render(built));
  const size = fs.statSync(file).size;
  process.stdout.write(
    `${locale}: ${built.impostors.length} подставных, ` +
      `${built.impostors.map((one) => Object.keys(one).length).join('/')} окон, ` +
      `${Math.round(size / 1024)} КБ\n`
  );
}
