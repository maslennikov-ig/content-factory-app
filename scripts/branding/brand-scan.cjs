#!/usr/bin/env node
'use strict';

/**
 * Content Factory brand scan.
 *
 * ADR-0006 and docs/design/content-factory-interface-specification.md separate
 * three different kinds of `Postiz` / `Gitroom` occurrence:
 *
 *   1. user-facing brand   -> must be replaced by Content Factory
 *   2. legacy contract     -> must be preserved (imports, env keys, stored ids)
 *   3. upstream attribution-> must be preserved (AGPL, provenance, history)
 *
 * The scan therefore never asserts "zero occurrences". It walks the surfaces a
 * person can actually see, classifies every hit against the allowlist below and
 * fails only on hits that nothing explains.
 *
 * Usage: node scripts/branding/brand-scan.cjs [--json]
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');

const BRAND_PATTERN = /postiz|gitroom/i;

/** Surfaces a user can see. Everything else is out of scope for this scan. */
const SCAN_ROOTS = [
  { root: 'apps/frontend/src', extensions: ['.ts', '.tsx', '.scss', '.css'] },
  { root: 'apps/frontend/public', names: true },
  { root: 'apps/extension/src', extensions: ['.ts', '.tsx'] },
  { root: 'apps/extension/public', names: true },
  // The SDK is a public package, so its source, package metadata and README
  // must not send integrators back to an upstream-branded service.
  { root: 'apps/sdk', extensions: ['.ts', '.md', '.json'] },
  {
    root: 'libraries/react-shared-libraries/src',
    extensions: ['.ts', '.tsx', '.json'],
  },
  // Only the server files that render product email or user-visible messages.
  {
    root: 'libraries/nestjs-libraries/src/database/prisma',
    extensions: ['.ts'],
  },
  { root: 'libraries/nestjs-libraries/src/newsletter', extensions: ['.ts'] },
  { root: 'libraries/nestjs-libraries/src/integrations', extensions: ['.ts'] },
  { root: 'libraries/helpers/src/swagger', extensions: ['.ts'] },
  // Product email is written by Temporal workflows, and the MCP server exposes a
  // display name to external clients. Both are read by a user.
  { root: 'apps/orchestrator/src', extensions: ['.ts'] },
  { root: 'libraries/nestjs-libraries/src/chat', extensions: ['.ts'] },
];

/** Locale bundles. Their values are the copy a user reads in their language. */
const LOCALES_ROOT = 'libraries/react-shared-libraries/src/translation/locales';
const SOURCE_LOCALE = 'en';
const PRODUCT_NAME = 'Content Factory';

/** Individual files that are user-facing surfaces on their own. */
const SCAN_FILES = [
  'README.md',
  'apps/extension/manifest.json',
  'apps/extension/manifest.dev.json',
];

/** Removes quoted snake_case identifiers so only rendered copy is left. */
function stripSnakeCaseLiterals(line) {
  return line.replace(/(['"`])[a-z0-9]+(?:_[a-z0-9]+)+\1/g, '');
}

/**
 * Generic rules. A hit matched by any of these is explained and never fails the
 * scan, wherever it appears inside the scanned surfaces.
 */
const GENERIC_RULES = [
  {
    id: 'legacy-import-alias',
    reason:
      'Historical upstream import alias retained as an upstream-drift classifier; repository imports use @contentfactory/*.',
    test: (line) => /@gitroom\//.test(line),
  },
  {
    id: 'upstream-source-attribution',
    reason: 'AGPL corresponding-source / upstream provenance link.',
    // Deliberately narrow: only the upstream repository reference itself. An
    // earlier version also accepted any line containing the word `upstream`,
    // which would have explained away a user-facing string that merely
    // mentioned it. Prose that needs the allowance is listed by file below.
    test: (line) => /gitroomhq\/postiz-app/.test(line),
  },
  {
    id: 'third-party-package-name',
    reason: 'Third-party npm package or CLI name the product does not control.',
    // Only one name is left that this product genuinely does not control: the
    // community n8n node, whose npm package is named after the upstream
    // project. The screen links to it as "N8N Node" and shows no upstream name.
    //
    // Everything this rule used to excuse is gone: `@postiz/node` and
    // `postiz-command` became our own packages in the namespace migration,
    // `@postiz/wallets` left with the wallet login, and the upstream CLI
    // instructions were removed from the public-api screen rather than renamed,
    // because this product does not ship that CLI.
    test: (line) => /n8n-nodes-postiz/.test(line),
  },
  {
    id: 'translation-key',
    reason:
      'Internal i18n key. Renaming keys drops every existing translation; the visible value is what the rebrand replaces.',
    // Explained only when the brand word appears solely inside snake_case
    // identifiers — i18n keys and JSON property names, never rendered copy.
    test: (line) => !BRAND_PATTERN.test(stripSnakeCaseLiterals(line)),
  },
  {
    id: 'annotated-provenance',
    reason:
      'Source comment explaining upstream provenance, explicitly annotated for this scan.',
    test: (line) => /brand-scan:allow/.test(line),
  },
];

/**
 * File-scoped allowances. `match` must appear in the offending line.
 * Every entry states why the occurrence is not user-facing brand.
 */
const FILE_ALLOWLIST = [
  {
    file: 'README.md',
    match: 'AGPL-3.0',
    reason:
      'AGPL attribution of the upstream project this product is based on.',
  },
  {
    file: 'README.md',
    match: 'самостоятельный upstream-проект',
    reason:
      'Trademark and non-affiliation notice that has to name the upstream project.',
  },
  {
    file: 'libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts',
    match: 'the link generated by Postiz',
    reason: 'Source comment describing upstream behaviour, not rendered text.',
  },
];

/**
 * Directories the walk never descends into.
 *
 * `dist` matters as much as the other two. `apps/sdk` is scanned from the
 * filesystem rather than from Git, and it builds into `apps/sdk/dist`, which is
 * ignored but still on disk. A stale bundle from before the namespace migration
 * would fail this scan for a reason that no longer exists in any source file,
 * and nothing in the report would say so.
 */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

function walk(directory, accept, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walk(absolute, accept, files);
      continue;
    }
    if (accept(entry.name)) files.push(absolute);
  }

  return files;
}

function collectTargets() {
  const targets = [];

  for (const scan of SCAN_ROOTS) {
    const absoluteRoot = path.join(repositoryRoot, scan.root);
    if (!fs.existsSync(absoluteRoot)) continue;

    const accept = scan.names
      ? () => true
      : (name) => scan.extensions.some((extension) => name.endsWith(extension));

    for (const file of walk(absoluteRoot, accept)) {
      targets.push({ file, namesOnly: Boolean(scan.names) });
    }
  }

  for (const file of SCAN_FILES) {
    const absolute = path.join(repositoryRoot, file);
    if (fs.existsSync(absolute))
      targets.push({ file: absolute, namesOnly: false });
  }

  return targets;
}

function explain(relativePath, line) {
  for (const rule of GENERIC_RULES) {
    if (rule.test(line)) return rule;
  }

  for (const entry of FILE_ALLOWLIST) {
    if (entry.file === relativePath && line.includes(entry.match)) {
      return { id: 'file-allowlist', reason: entry.reason };
    }
  }

  return null;
}

/**
 * Locale values that carry the product name.
 *
 * `postiz` transliterated into Bengali, Hebrew or Japanese does not match the
 * ASCII pattern, so a translated value can keep the old brand while the line
 * scan reports nothing. The product name itself is never translated: where the
 * English source names the product, every locale keeps the Latin
 * `Content Factory`. A localised value that dropped it is either a leftover
 * brand or a lost name, and both are user-facing defects.
 */
function scanLocaleProductName() {
  const violations = [];
  const localesRoot = path.join(repositoryRoot, LOCALES_ROOT);
  const sourcePath = path.join(localesRoot, SOURCE_LOCALE, 'translation.json');
  if (!fs.existsSync(sourcePath)) return violations;

  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const brandedKeys = Object.keys(source).filter(
    (key) =>
      typeof source[key] === 'string' && source[key].includes(PRODUCT_NAME)
  );

  for (const entry of fs.readdirSync(localesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === SOURCE_LOCALE) continue;

    const file = path.join(localesRoot, entry.name, 'translation.json');
    if (!fs.existsSync(file)) continue;

    const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of brandedKeys) {
      const value = translations[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      if (value.includes(PRODUCT_NAME)) continue;

      violations.push({
        file: path.relative(repositoryRoot, file),
        line: 0,
        text: `${key}: ${value.trim().slice(0, 160)}`,
        kind: 'localised-product-name',
      });
    }
  }

  return violations;
}

function scan() {
  const violations = scanLocaleProductName();
  const allowed = [];

  for (const target of collectTargets()) {
    const relativePath = path.relative(repositoryRoot, target.file);

    if (BRAND_PATTERN.test(path.basename(target.file))) {
      violations.push({
        file: relativePath,
        line: 0,
        text: path.basename(target.file),
        kind: 'asset-name',
      });
    }

    if (target.namesOnly) continue;

    let content;
    try {
      content = fs.readFileSync(target.file, 'utf8');
    } catch {
      continue;
    }
    if (!BRAND_PATTERN.test(content)) continue;

    content.split('\n').forEach((line, index) => {
      if (!BRAND_PATTERN.test(line)) return;

      const explanation = explain(relativePath, line);
      const record = {
        file: relativePath,
        line: index + 1,
        text: line.trim().slice(0, 200),
      };

      if (explanation) {
        allowed.push({
          ...record,
          rule: explanation.id,
          reason: explanation.reason,
        });
      } else {
        violations.push({ ...record, kind: 'user-facing' });
      }
    });
  }

  return { violations, allowed };
}

module.exports = { scan, BRAND_PATTERN, GENERIC_RULES, FILE_ALLOWLIST };

if (require.main === module) {
  const result = scan();

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const violation of result.violations) {
      process.stdout.write(
        `${violation.file}:${violation.line}: ${violation.text}\n`
      );
    }
    process.stdout.write(
      `\n${result.violations.length} unexplained reference(s); ` +
        `${result.allowed.length} allowlisted reference(s).\n`
    );
  }

  process.exitCode = result.violations.length === 0 ? 0 : 1;
}
