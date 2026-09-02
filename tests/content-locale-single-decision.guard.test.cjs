'use strict';

/**
 * `content-factory-next-w4vh`: one decision about which language a person
 * reads, made in one place.
 *
 * The audit of 02.09.2026 found three screens in the «Контент» folder each
 * spelling out `String(language ?? 'ru').toLowerCase().startsWith('ru') ? 'ru'
 * : 'en'` by hand, while the editorial stage had had an extracted helper for
 * this since the day it was written. By the time the search panel landed on
 * 02.09 there were seven copies. That is not a pattern anyone chose — it is
 * what happens when the second copy is allowed.
 *
 * The rule is repo-wide (`CLAUDE.md`: «второй ручной экземпляр одного решения
 * — дубликат, который надо извлечь»), but this guard is deliberately narrow:
 * it holds one folder, where the duplication was actually found and removed.
 * The rest of `apps/frontend` still spells it out in about fifteen places, and
 * grandfathering them here rather than pretending they do not exist is the
 * same shape every other ledger in this suite takes.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FOLDER = 'apps/frontend/src/components/content-intelligence';
const HELPER = `${FOLDER}/content-section.copy.ts`;

/** The helper's own definition and the sentence explaining it. */
const ALLOWED = new Set([HELPER]);

const sourceFiles = (directory) =>
  fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(entryPath);
      return /\.(tsx?|jsx?)$/.test(entry.name) ? [entryPath] : [];
    }
  );

describe('the «Контент» section decides its language once', () => {
  test('no screen in the folder spells the decision out by hand', () => {
    const offenders = sourceFiles(FOLDER).filter(
      (file) =>
        !ALLOWED.has(file) &&
        /startsWith\(\s*['"]ru['"]\s*\)/.test(
          fs.readFileSync(path.join(root, file), 'utf8')
        )
    );

    expect({
      offenders,
      hint: offenders.length
        ? `These files decide the reading language by hand instead of calling "resolveContentLocale" from ${HELPER}: ${offenders.join(', ')}. Seven copies of one ternary is how one of them ends up fixed differently from the other six.`
        : 'in step',
    }).toEqual({ offenders: [], hint: 'in step' });
  });

  test('the helper is exported and every screen in the folder uses it', () => {
    const helper = fs.readFileSync(path.join(root, HELPER), 'utf8');
    expect(helper).toContain('export const resolveContentLocale');

    // Every file that reads `language` off the variable context has to get its
    // locale from the helper; a screen that reads the raw value and branches
    // on it some other way is the next copy under a different spelling.
    const readers = sourceFiles(FOLDER).filter((file) => {
      if (ALLOWED.has(file)) return false;
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      return /const\s*\{\s*language\s*\}\s*=\s*useVariables\(\)/.test(source);
    });

    const missing = readers.filter(
      (file) =>
        !fs
          .readFileSync(path.join(root, file), 'utf8')
          .includes('resolveContentLocale')
    );

    expect({
      readers: readers.length > 0,
      missing,
      hint: missing.length
        ? `These files take "language" from the variable context without calling "resolveContentLocale": ${missing.join(', ')}.`
        : 'in step',
    }).toEqual({ readers: true, missing: [], hint: 'in step' });
  });
});
