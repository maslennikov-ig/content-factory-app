const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'scripts/release');
const pushScript = path.join(releaseDir, 'push-image.sh');
const archiveScript = path.join(releaseDir, 'make-source-archive.sh');

/**
 * The release may not outrun its own test suite.
 *
 * `AGENTS.md` named `pnpm test` in release acceptance from the start, and
 * between 25.08.2026 and 30.08.2026 five releases went to production with
 * fourteen tests red — activation atomicity, the immutable published snapshot,
 * the serializable pin. Nobody skipped the step on purpose. A step a person can
 * skip is not a gate, and the release order could not tell "ran and passed"
 * from "did not run". GitHub Actions could not tell either: it stopped starting
 * jobs on 25.08.2026, two hours after the commit that turned the tests red, and
 * every run since carries the same red mark it carried before.
 *
 * These scripts run against a throwaway git repository with a stub `pnpm` on
 * PATH — real git, real refusals, no network and no five-minute suite.
 */
let workspace = null;
try {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-suite-receipt-'));
} catch {
  // A sandbox with no writable temp directory cannot host this suite. That says
  // nothing about the scripts, so skip rather than fail.
  workspace = null;
}

// Prints the three summaries `pnpm test` really prints — one per run — so the
// receipt is built from the shape it will meet, not from a single "ok".
const PNPM_STUB = `#!/usr/bin/env bash
set -Eeuo pipefail
if [ "\${1:-}" != 'test' ]; then
  printf 'stub pnpm: unexpected command %s\\n' "\${1:-}" >&2
  exit 127
fi
printf 'Test Suites: 221 passed, 221 total\\n'
printf 'Tests:       1 skipped, 3036 passed, 3037 total\\n'
printf '# pass 93\\n'
printf '# fail %s\\n' "\${CF_STUB_NODE_FAIL:-0}"
printf '%s\\n' "\${CF_STUB_PYTHON:-OK}"
exit "\${CF_STUB_SUITE_STATUS:-0}"
`;

const gitEnv = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

let caseCounter = 0;

/** A throwaway repository carrying the three real scripts. */
function makeRepository() {
  caseCounter += 1;
  const repo = path.join(workspace, `repo-${caseCounter}`);
  fs.mkdirSync(path.join(repo, 'scripts/release'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'var/docker'), { recursive: true });

  for (const name of [
    'tree-differences.sh',
    'record-suite-receipt.sh',
    'check-suite-receipt.sh',
  ]) {
    fs.copyFileSync(
      path.join(releaseDir, name),
      path.join(repo, 'scripts/release', name)
    );
    fs.chmodSync(path.join(repo, 'scripts/release', name), 0o755);
  }

  fs.writeFileSync(path.join(repo, 'var/docker/entrypoint.sh'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(repo, 'app.txt'), 'first\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), '/var/release/\n');

  const git = (...args) =>
    spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...gitEnv } });

  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'first');
  return { repo, git };
}

function run(repo, script, extraEnv = {}) {
  return spawnSync('bash', [path.join(repo, 'scripts/release', script)], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...gitEnv,
      // Scoped to this child only.
      PATH: `${path.join(workspace, 'bin')}${path.delimiter}${process.env.PATH}`,
      ...extraEnv,
    },
  });
}

const readReceipt = (repo) =>
  JSON.parse(fs.readFileSync(path.join(repo, 'var/release/suite-receipt.json'), 'utf8'));

const headOf = (git) => git('rev-parse', 'HEAD').stdout.trim();

const describeIfWritable = workspace ? describe : describe.skip;

describeIfWritable('the release suite gate, executed against a throwaway repository', () => {
  beforeAll(() => {
    const stubBin = path.join(workspace, 'bin');
    fs.mkdirSync(stubBin, { recursive: true });
    fs.writeFileSync(path.join(stubBin, 'pnpm'), PNPM_STUB, { mode: 0o755 });
  });

  afterAll(() => {
    if (workspace) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('the harness reaches the real scripts: an absent receipt is refused', () => {
    const { repo } = makeRepository();
    const result = run(repo, 'check-suite-receipt.sh');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REFUSING');
    expect(result.stderr).toContain('No receipt at var/release/suite-receipt.json');
    expect(result.stderr).toContain('record-suite-receipt.sh');
  });

  test('a green run records the commit it covered, and the check accepts it', () => {
    const { repo, git } = makeRepository();

    const recorded = run(repo, 'record-suite-receipt.sh');
    expect(recorded.stderr).toBe('');
    expect(recorded.status).toBe(0);

    const receipt = readReceipt(repo);
    expect(receipt.commit).toBe(headOf(git));
    expect(receipt.command).toBe('pnpm test');

    // All three summaries, not just jest's. Reading the first as the answer is
    // the mistake this exists to close.
    expect(receipt.jest.suites).toContain('221 passed');
    expect(receipt.nodeTest.fail).toBe('# fail 0');
    expect(receipt.python).toBe('OK');

    const checked = run(repo, 'check-suite-receipt.sh');
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain('Suite receipt covers');
    expect(checked.stdout).toContain('# fail 0');
  });

  test('a failing suite writes no receipt at all, so the release stays blocked', () => {
    const { repo } = makeRepository();

    const recorded = run(repo, 'record-suite-receipt.sh', {
      CF_STUB_SUITE_STATUS: '1',
      CF_STUB_NODE_FAIL: '14',
    });
    expect(recorded.status).toBe(1);
    expect(fs.existsSync(path.join(repo, 'var/release/suite-receipt.json'))).toBe(false);
    expect(recorded.stderr).toContain('no receipt was written');

    expect(run(repo, 'check-suite-receipt.sh').status).toBe(1);
  });

  test('a receipt does not carry over to the next commit', () => {
    const { repo, git } = makeRepository();
    expect(run(repo, 'record-suite-receipt.sh').status).toBe(0);
    const covered = readReceipt(repo).commit;

    fs.writeFileSync(path.join(repo, 'app.txt'), 'second\n');
    git('add', '-A');
    git('commit', '-qm', 'second');

    const checked = run(repo, 'check-suite-receipt.sh');
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain(`covers ${covered.slice(0, 12)}`);
  });

  test('a receipt naming no commit is refused rather than trusted', () => {
    const { repo } = makeRepository();
    fs.mkdirSync(path.join(repo, 'var/release'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'var/release/suite-receipt.json'),
      JSON.stringify({ command: 'pnpm test' })
    );

    const checked = run(repo, 'check-suite-receipt.sh');
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain('names no commit');
  });

  test('a receipt cannot be recorded from a tree that is not the commit', () => {
    const { repo } = makeRepository();
    fs.writeFileSync(path.join(repo, 'app.txt'), 'uncommitted\n');

    const recorded = run(repo, 'record-suite-receipt.sh');
    expect(recorded.status).toBe(1);
    expect(recorded.stderr).toContain('differs from HEAD');
    expect(fs.existsSync(path.join(repo, 'var/release/suite-receipt.json'))).toBe(false);
  });

  test('the tooling directories the suite writes into do not block a receipt', () => {
    // `pnpm test` writes into `.codex` on every run. If that counted as a
    // difference, no receipt could ever be recorded — the gate would be
    // unusable and would be taken out again.
    const { repo } = makeRepository();
    fs.mkdirSync(path.join(repo, '.codex/stages'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.codex/stages/evidence.json'), '{}\n');
    fs.mkdirSync(path.join(repo, '.beads'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.beads/db'), 'x\n');

    expect(run(repo, 'record-suite-receipt.sh').status).toBe(0);
  });

  test('a change to something that does reach the image still blocks it', () => {
    // `var/docker` holds tracked files the image runs — `entrypoint.sh`,
    // `nginx.conf`. Excluding all of `var` to make room for the receipt would
    // have hidden exactly this.
    const { repo } = makeRepository();
    fs.writeFileSync(path.join(repo, 'var/docker/entrypoint.sh'), '#!/bin/sh\nchanged\n');

    const recorded = run(repo, 'record-suite-receipt.sh');
    expect(recorded.status).toBe(1);
    expect(recorded.stderr).toContain('var/docker/entrypoint.sh');
  });

  test('an untracked file blocks it too: COPY . /app would bake it in', () => {
    const { repo } = makeRepository();
    fs.writeFileSync(path.join(repo, 'sneaked.txt'), 'not committed\n');

    const recorded = run(repo, 'record-suite-receipt.sh');
    expect(recorded.status).toBe(1);
    expect(recorded.stderr).toContain('sneaked.txt');
  });
});

describe('the release order calls the suite gate', () => {
  // Read as text: these scripts talk to a registry and a production host.
  const push = fs.readFileSync(pushScript, 'utf8');
  const archive = fs.readFileSync(archiveScript, 'utf8');

  test('push-image.sh refuses before it uploads anything', () => {
    const check = push.search(/check-suite-receipt\.sh/);
    const upload = push.indexOf('docker push');

    expect(check).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(check);
  });

  test('the call is unguarded, so a refusal ends the release', () => {
    // `|| true`, or the call inside an `if`, would report the problem and carry
    // on — which is the checklist line this replaces, spelled in bash.
    expect(push).toContain('set -euo pipefail');
    for (const line of push.split('\n')) {
      if (!line.includes('check-suite-receipt.sh')) continue;
      if (line.trim().startsWith('#')) continue;
      expect(line).toEqual(expect.not.stringContaining('||'));
      expect(line).toEqual(expect.not.stringContaining('if '));
    }
  });

  test('one rule decides what a difference is, and both callers read it', () => {
    // The receipt names a commit; the archive is built from one. The two rest
    // on the same fact, and a second hand-written exclusion list would drift
    // until one of them vouched for something it had not seen.
    expect(archive).toContain('tree-differences.sh');
    expect(archive).not.toMatch(/git status --porcelain/);

    const shared = fs.readFileSync(
      path.join(releaseDir, 'tree-differences.sh'),
      'utf8'
    );
    expect(shared).toContain("':(exclude,top).codex'");
    expect(shared).toContain("':(exclude,top)var/release'");
    // Narrow on purpose: `var/docker` reaches the image.
    expect(shared).not.toContain("':(exclude,top)var'\n");
  });
});
