const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/**
 * The calendar-shift check (`pnpm run test:time-travel`) moves the clock for
 * everything Jest runs, and stops at the edge of a spawned shell script: a
 * `date` call inside bash reads the operating system and knows nothing about
 * the shift. That gap is where the backup defect of 31.08.2026 lived — a
 * retention cutoff computed as `date -u -d "-14 days"`, compared against a
 * pinned artifact name, red at noon on untouched code.
 *
 * Faking the clock for those scripts was the obvious repair and the wrong one.
 * A `date` wrapper on PATH has to decide, per call, whether a spec means "now"
 * or a fixed instant, and it has to be right every time or it corrupts the
 * moment a test is inspecting. A check that can be quietly wrong is worse than
 * no check, because it reads as coverage.
 *
 * So this forbids the shape instead of emulating it. Two rules, both narrow:
 *
 *   - A moment computed from another moment — `date -d` — takes its base from
 *     a shell variable, so a caller can pin it. `CF_BACKUP_NOW` is what that
 *     looks like in practice.
 *   - A clock reading that reaches a comparison is injectable in the same way.
 *     Stamping a name or a receipt with the real clock stays free: nothing
 *     judges those, so nothing about them can age.
 *
 * A false positive here costs one variable and one default. A false negative
 * costs a scheduled backup deleting itself, found by the calendar.
 */

/** Every shell script in the repository, ignoring dependencies and history. */
function shellScripts(current = root, found = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const next = path.join(current, entry.name);
    if (entry.isDirectory()) {
      shellScripts(next, found);
    } else if (entry.name.endsWith('.sh')) {
      found.push(path.relative(root, next));
    }
  }
  return found;
}

/** `$(date …)` and `` `date …` ``, with the arguments that follow. */
const CLOCK_READ = /(?:\$\(|`)\s*date\b([^)`]*)/g;

/** `-d SPEC` / `--date SPEC`, quoted or not: the base a moment is built on. */
const DERIVED_FROM = /(?:^|\s)(?:-d|--date(?:=|\s))\s*(?:"([^"]*)"|'([^']*)'|(\S+))/;

/** A line that judges rather than records. Redirects are not comparisons. */
function comparisonSpans(line) {
  const spans = [];
  for (const match of line.matchAll(/\[\[(.*?)\]\]|\(\((.*?)\)\)|\[(.*?)\]/g)) {
    spans.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  const test = line.match(/\btest\s+(.*)$/);
  if (test) spans.push(test[1]);
  return spans.filter((span) => /<|>|-lt\b|-gt\b|-le\b|-ge\b|-nt\b|-ot\b/.test(span));
}

/** Relative terms: `-14 days`, `+${n} hours`, `ago`, and the bare `now`. */
const RELATIVE_TERM =
  /[+-]?\s*(?:\$\{?\w+\}?|\d+)\s*(?:second|minute|hour|day|week|fortnight|month|year)s?\b|\bago\b|\bnow\b/gi;

/**
 * A base is pinnable when the moment it counts from can be handed in, not when
 * the string merely contains a variable. `-${retention_days} days` has a
 * variable and is still anchored to the real clock — that is exactly the shape
 * that broke the backup, and reading a `$` as "injectable" waves it through.
 * So the relative terms come off first, and what remains has to be a moment.
 */
function baseIsInjectable(dateArguments) {
  const derived = dateArguments.match(DERIVED_FROM);
  if (!derived) return null;
  const spec = derived[1] ?? derived[2] ?? derived[3] ?? '';
  const base = spec.replace(RELATIVE_TERM, '').trim();
  return base.includes('$') || /\d{4}/.test(base);
}

function findings() {
  const problems = [];

  for (const file of shellScripts()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = text.split('\n');
    const clockVariables = new Map();

    lines.forEach((line, index) => {
      for (const read of line.matchAll(CLOCK_READ)) {
        const injectable = baseIsInjectable(read[1]);

        if (injectable === false) {
          problems.push({
            file,
            line: index + 1,
            why: 'a moment computed with `date -d` takes a literal base, so no caller can pin it',
          });
        }

        const assignment = line.match(/(?:^|\s)(?:readonly\s+|local\s+|export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
        if (assignment) {
          clockVariables.set(assignment[1], { line: index + 1, injectable });
        }
      }
    });

    lines.forEach((line, index) => {
      for (const span of comparisonSpans(line)) {
        // A clock read written straight into the comparison.
        for (const read of span.matchAll(CLOCK_READ)) {
          if (baseIsInjectable(read[1]) !== true) {
            problems.push({
              file,
              line: index + 1,
              why: 'a comparison reads the clock directly, so it cannot be pinned',
            });
          }
        }

        // Or reached through a variable the clock filled in earlier.
        for (const [name, origin] of clockVariables) {
          if (origin.injectable === true) continue;
          if (!new RegExp(`\\$\\{?${name}\\b`).test(span)) continue;
          problems.push({
            file,
            line: index + 1,
            why: `\`${name}\` holds the real clock (line ${origin.line}) and is compared here`,
          });
        }
      }
    });
  }

  return problems;
}

describe('a shell script cannot judge one moment against the real clock', () => {
  test('the scan reaches real scripts, including the one that taught this', () => {
    const scripts = shellScripts();

    expect(scripts.length).toBeGreaterThan(10);
    expect(scripts).toContain('scripts/operations/postgres-backup.sh');
  });

  test('no script builds or compares a moment it cannot be given', () => {
    expect({
      problems: findings(),
      why: 'Штамп для имени или квитанции может читать настоящие часы: его никто не судит. Момент, который сравнивают, должен приходить из переменной — как `CF_BACKUP_NOW` в scripts/operations/postgres-backup.sh, — иначе тест не может пришпилить обе стороны и проверка календарём его не увидит.',
    }).toEqual({ problems: [], why: expect.any(String) });
  });
});
