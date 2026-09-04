'use strict';

/**
 * Keeps the test suite out of the tree the development stand watches, and out
 * of the stage evidence that records runs which already happened.
 *
 * A running `next dev` watches `apps/frontend/src` and Tailwind globs
 * `apps/frontend/src/**` and `libraries/**` on every CSS build. `nest start
 * --watch` watches `apps/*​/src` and `libraries/**` the same way. A test that
 * creates a file there and deletes it again a moment later is invisible in the
 * test report and fatal to the stand: if the delete lands between Tailwind's
 * glob and its read of the same file, the CSS build throws
 * `ENOENT ... <fixture>`, the failure is cached against a file that no longer
 * exists, so nothing can invalidate it, and every page answers 500 until the
 * build cache is removed and the server restarted.
 *
 * The suite has no reason to write there at all: a fixture belongs in a
 * temporary directory, and a scanner that classifies files by their path takes
 * the root to scan as an argument. So writing there is refused here, at the
 * moment it happens, naming the file and the caller — rather than surfacing
 * minutes later as a broken stand nobody connects to a test run.
 *
 * The second tree, the `evidence` directory of any `.codex/stages` stage, is
 * refused for a different reason, written out above `isStageEvidence`.
 *
 * Reads are untouched. Child processes are not covered: this patches the fs
 * module of the Jest worker only — a script the suite spawns writes with its
 * own `fs`, so where that script is allowed to write is its own argument to
 * check.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');

/** Trees a watcher of the running stand is subscribed to. */
const WATCHED_TREES = [
  path.join(repositoryRoot, 'apps'),
  path.join(repositoryRoot, 'libraries'),
];

/** Build output inside those trees. No watcher rebuilds from these. */
const EXEMPT_SEGMENTS = new Set(['node_modules', 'dist', '.next', 'coverage']);

const stagesRoot = path.join(repositoryRoot, '.codex', 'stages');

/**
 * Stage evidence is a record of a run that happened, not an output of the
 * suite.
 *
 * The public funnel proof regenerated `.codex/stages/.../public-funnel-runtime`
 * on every full `pnpm test`, and one of its files carries the day the run
 * happened, so the tree came back dirty from a green suite every time and had
 * to be cleaned by hand before a release receipt could be recorded. A stage
 * artifact is refreshed on purpose, in its own commit, by somebody who meant
 * to — never as a side effect of running the tests.
 */
const isStageEvidence = (absolute) => {
  if (
    absolute !== stagesRoot &&
    !absolute.startsWith(`${stagesRoot}${path.sep}`)
  ) {
    return false;
  }
  const segments = path.relative(stagesRoot, absolute).split(path.sep);
  // <stage>/evidence[/...]
  return segments.length > 1 && segments[1] === 'evidence';
};

const asAbsolute = (candidate) => {
  if (typeof candidate !== 'string' || candidate === '') return null;
  try {
    return path.resolve(candidate);
  } catch {
    return null;
  }
};

const isStandTree = (absolute) => {
  const tree = WATCHED_TREES.find(
    (root) => absolute === root || absolute.startsWith(`${root}${path.sep}`)
  );
  if (!tree) return false;

  const segments = path.relative(repositoryRoot, absolute).split(path.sep);
  return !segments.some((segment) => EXEMPT_SEGMENTS.has(segment));
};

const isWatched = (candidate) => {
  const absolute = asAbsolute(candidate);
  if (!absolute) return false;
  return isStandTree(absolute) || isStageEvidence(absolute);
};

const STAND_REASON =
  'apps/** and libraries/** are watched by the running development stand: ' +
  'a file that appears and disappears there mid-run breaks the Tailwind ' +
  'build of a live `next dev` and every page answers 500 afterwards.';

const EVIDENCE_REASON =
  '.codex/stages/**/evidence/** records a run that happened. A suite that ' +
  'rewrites it leaves the tree dirty after a green run, and a release ' +
  'receipt then has to be recorded on a tree somebody cleaned by hand.';

const refuse = (operation, target) => {
  const absolute = path.resolve(target);
  const relative = path.relative(repositoryRoot, absolute);
  return new Error(
    `Test suite refused to ${operation} "${relative}".\n` +
      (isStageEvidence(absolute) ? EVIDENCE_REASON : STAND_REASON) +
      '\n' +
      'Put the fixture in a temporary directory (fs.mkdtempSync(os.tmpdir())) ' +
      'and point the code under test at that root instead.'
  );
};

/** (base method name, indexes of the arguments that name a write target) */
const GUARDED = [
  ['writeFile', [0]],
  ['appendFile', [0]],
  ['mkdir', [0]],
  ['rm', [0]],
  ['rmdir', [0]],
  ['unlink', [0]],
  ['rename', [0, 1]],
  ['copyFile', [1]],
  ['symlink', [1]],
  ['link', [1]],
  ['truncate', [0]],
  ['cp', [1]],
];

const guard = (host, method, indexes) => {
  const original = host && host[method];
  if (typeof original !== 'function') return;

  host[method] = function guarded(...args) {
    for (const index of indexes) {
      if (isWatched(args[index])) throw refuse(method, args[index]);
    }
    return original.apply(this, args);
  };
};

for (const [method, indexes] of GUARDED) {
  guard(fs, method, indexes);
  guard(fs, `${method}Sync`, indexes);
  guard(fs.promises, method, indexes);
}

module.exports = { isWatched, WATCHED_TREES };
