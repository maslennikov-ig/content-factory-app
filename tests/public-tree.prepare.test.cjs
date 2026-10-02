const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'scripts/operations/prepare-public-tree.sh');

/**
 * The move publishes a tree, so the tree is what has to be checked.
 *
 * A filesystem copy would take the three authors' corpora, which sit in the
 * working directory ignored by Git — the same "Git does not see it, but the
 * copy does" that shipped thirteen images with personal source texts between 26
 * and 30 August 2026. These tests run the real script against throwaway
 * repositories: real git, real refusals, no network.
 */
let workspace = null;
try {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-public-tree-'));
} catch {
  workspace = null;
}

const gitEnv = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

let counter = 0;

const write = (repo, relative, contents) => {
  const file = path.join(repo, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

/** A repository shaped like this one: tracked source, ignored corpora, evidence. */
function makeRepository({ extraTracked = {}, ignored = {}, license = true } = {}) {
  counter += 1;
  const repo = path.join(workspace, `repo-${counter}`);
  fs.mkdirSync(repo, { recursive: true });

  fs.mkdirSync(path.join(repo, 'scripts/operations'), { recursive: true });
  fs.copyFileSync(scriptPath, path.join(repo, 'scripts/operations/prepare-public-tree.sh'));
  fs.chmodSync(path.join(repo, 'scripts/operations/prepare-public-tree.sh'), 0o755);

  if (license) write(repo, 'LICENSE', 'GNU AFFERO GENERAL PUBLIC LICENSE\n');
  write(repo, '.gitignore', 'scripts/evidence/voice-eval/corpus.*.json\n.env\n');
  write(repo, 'app.txt', 'source\n');
  write(repo, '.env.example', 'DATABASE_URL=\n');
  // The rest of `.codex` travels; process verification does not run without it.
  write(repo, '.codex/handoff.md', '# handoff\n');
  write(repo, '.codex/stages/stage-a/summary.md', '# summary\n');
  // These do not: 677 screenshots and the authors' full names live here.
  write(repo, '.codex/stages/stage-a/evidence/screenshot.txt', 'Full Name\n');
  write(repo, '.codex/stages/stage-b/evidence/run.log', 'Another Name\n');
  // Tooling, not stage evidence — the name collides and the meaning does not.
  write(repo, 'scripts/evidence/voice-eval/measure.cjs', 'module.exports = {};\n');

  for (const [relative, contents] of Object.entries(extraTracked)) {
    write(repo, relative, contents);
  }

  const git = (...args) =>
    spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...gitEnv } });

  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'first');

  // Written after the commit on purpose: ignored files exist on disk and in no
  // index, which is the whole hazard being guarded.
  for (const [relative, contents] of Object.entries(ignored)) {
    write(repo, relative, contents);
  }

  return { repo, git };
}

const prepare = (repo, target, flags = []) =>
  spawnSync('bash', [path.join(repo, 'scripts/operations/prepare-public-tree.sh'), ...flags, target], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...gitEnv },
  });

const targetFor = (repo) => path.join(repo, '..', `out-${path.basename(repo)}`);

const nestedEvidence = {
  '.codex/stages/content-factory-next-0qgn-search-reader-negative-state/bounded-language-sampling/evidence/verification.json': 'private recorded verification\n',
  '.codex/stages/stage-a/child/grandchild/evidence/archive/run.log': 'private recorded output\n',
  '.codex/stages/stage-a/child samples/evidence/line\nbreak.txt': 'private recorded output\n',
};

const publicStageFiles = {
  '.codex/stages/stage-a/child/spec.md': '# reviewed specification\n',
  '.codex/stages/stage-a/child/evidence-notes/summary.md': '# public artifact\n',
  '.codex/stages/stage-a/child/evidence.md': '# public artifact\n',
  '.codex/stages/evidence/summary.md': '# stage named evidence\n',
  '.codex/tools/evidence/helper.cjs': 'module.exports = {};\n',
};

const describeIfWritable = workspace ? describe : describe.skip;

afterAll(() => {
  if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
});

describeIfWritable('preparing the public tree', () => {
  test('copies tracked source and leaves stage evidence behind', () => {
    const { repo } = makeRepository();
    const target = targetFor(repo);

    const result = prepare(repo, target);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(fs.existsSync(path.join(target, 'app.txt'))).toBe(true);
    expect(fs.existsSync(path.join(target, '.codex/handoff.md'))).toBe(true);
    expect(fs.existsSync(path.join(target, '.codex/stages/stage-a/summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(target, '.codex/stages/stage-a/evidence/screenshot.txt'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.codex/stages/stage-b/evidence/run.log'))).toBe(false);
    expect(result.stdout).toContain('2 stage-evidence files held back');
  });

  test('scripts/evidence is tooling and travels, despite the matching name', () => {
    // The exclusion is anchored at `.codex/stages/<stage>/` and an evidence directory. A looser pattern
    // — anything containing `evidence` — would silently drop the measurement
    // tools the product's voice work runs on.
    const { repo } = makeRepository();
    const target = targetFor(repo);

    expect(prepare(repo, target).status).toBe(0);
    expect(fs.existsSync(path.join(target, 'scripts/evidence/voice-eval/measure.cjs'))).toBe(true);
  });

  test('excludes evidence at every depth inside a stage and retains nearby public artifacts', () => {
    const { repo } = makeRepository({ extraTracked: { ...nestedEvidence, ...publicStageFiles } });
    const target = targetFor(repo);

    const result = prepare(repo, target);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    for (const relative of Object.keys(nestedEvidence)) {
      expect(fs.existsSync(path.join(target, relative))).toBe(false);
    }
    for (const [relative, contents] of Object.entries(publicStageFiles)) {
      expect(fs.readFileSync(path.join(target, relative), 'utf8')).toBe(contents);
    }
    expect(fs.readFileSync(path.join(target, 'LICENSE'), 'utf8')).toContain('AFFERO');
  });

  test('a change to nested held-back evidence does not block a clean source copy', () => {
    const { repo } = makeRepository({ extraTracked: nestedEvidence });
    for (const relative of Object.keys(nestedEvidence)) {
      write(repo, relative, 'changed private run evidence\n');
    }

    const result = prepare(repo, targetFor(repo));

    expect(result).toMatchObject({ status: 0, stderr: '' });
    for (const relative of Object.keys(nestedEvidence)) {
      expect(fs.existsSync(path.join(targetFor(repo), relative))).toBe(false);
    }
  });

  test('an ignored corpus on disk does not reach the public tree', () => {
    // The reason this is a script and not `cp -r`.
    const { repo } = makeRepository({
      ignored: {
        'scripts/evidence/voice-eval/corpus.avetov.json': '["real post text"]\n',
        '.env': 'DATABASE_URL=postgres://real\n',
      },
    });
    const target = targetFor(repo);

    const result = prepare(repo, target);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(target, 'scripts/evidence/voice-eval/corpus.avetov.json'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.env.example'))).toBe(true);
  });

  test('a tracked environment file is refused rather than copied quietly', () => {
    // Belt and braces: the copy is safe by construction, and the check still
    // asks the artifact rather than trusting the construction.
    const { repo } = makeRepository({ extraTracked: { '.env.production': 'SECRET=1\n' } });
    const target = targetFor(repo);

    const result = prepare(repo, target);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('environment file in the public tree');
    expect(result.stderr).toContain('.env.production');
  });

  test('a tracked corpus is refused by name', () => {
    const { repo } = makeRepository({
      extraTracked: { 'scripts/evidence/voice-eval/corpora.json': '{"avatar":"Name"}\n' },
    });

    const result = prepare(repo, targetFor(repo));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('author corpus in the public tree');
  });

  test('a tree without LICENSE is refused: the product is AGPL-3.0', () => {
    const { repo } = makeRepository({ license: false });

    const result = prepare(repo, targetFor(repo));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('LICENSE is missing');
  });

  test('a change to held-back evidence does not block the copy', () => {
    // `pnpm test` rewrites `public-funnel-runtime/database.json` on every run.
    // Refusing over a file that is never copied would make every release wait
    // on a difference it does not have — and it is the same rule that decides
    // what travels, written once and used twice.
    const { repo } = makeRepository();
    fs.writeFileSync(
      path.join(repo, '.codex/stages/stage-a/evidence/screenshot.txt'),
      'rewritten by a test run\n'
    );

    const result = prepare(repo, targetFor(repo));

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('a modified tree is refused, so the copy is always some reviewed commit', () => {
    const { repo } = makeRepository();
    fs.writeFileSync(path.join(repo, 'app.txt'), 'uncommitted change\n');

    const result = prepare(repo, targetFor(repo));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('differs from HEAD');
    expect(result.stderr).toContain('app.txt');
  });

  test('a non-empty target is refused rather than overlaid', () => {
    const { repo } = makeRepository();
    const target = targetFor(repo);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'leftover.txt'), 'from an earlier attempt\n');

    const result = prepare(repo, target);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exists and is not empty');
  });

  test('it prepares a directory and nothing else — no repository, no commit', () => {
    // Publication stays a separate step that needs its own authority.
    const { repo } = makeRepository();
    const target = targetFor(repo);

    const result = prepare(repo, target);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(target, '.git'))).toBe(false);
    expect(result.stdout).toContain('Nothing was published');
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).not.toMatch(/^\s*(git (push|remote|init|commit)|gh repo create)\b/m);
  });

  test('it refuses without a target instead of guessing one', () => {
    const { repo } = makeRepository();

    const result = spawnSync(
      'bash',
      [path.join(repo, 'scripts/operations/prepare-public-tree.sh')],
      { cwd: repo, encoding: 'utf8', env: { ...process.env, ...gitEnv } }
    );

    expect(result.status).toBe(64);
    expect(result.stderr).toContain('Usage:');
  });
});

describeIfWritable('refreshing an existing public clone', () => {
  /**
   * The first publication is one command; every one after it is a refresh, and
   * a refresh is where the damage lives. It has to delete — a file dropped here
   * must disappear there, or the public repository serves something this one no
   * longer has — and deleting next to somebody's `.git` is worth a guard rather
   * than a habit.
   */
  const cloneOf = (repo) => {
    const clone = path.join(workspace, `clone-${path.basename(repo)}`);
    spawnSync('git', ['clone', '-q', repo, clone], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
    return clone;
  };

  test('it deletes what the source no longer has', () => {
    const { repo, git } = makeRepository({ extraTracked: { 'gone.txt': 'removed later\n' } });
    const clone = cloneOf(repo);
    expect(fs.existsSync(path.join(clone, 'gone.txt'))).toBe(true);

    fs.rmSync(path.join(repo, 'gone.txt'));
    git('add', '-A');
    git('commit', '-qm', 'drop the file');

    const result = prepare(repo, clone, ['--update']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(clone, 'gone.txt'))).toBe(false);
    expect(fs.existsSync(path.join(clone, 'app.txt'))).toBe(true);
  });

  test('it leaves the clone its own history', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);
    const before = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).stdout;

    const result = prepare(repo, clone, ['--update']);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(clone, '.git'))).toBe(true);
    expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).stdout).toBe(before);
    expect(result.stdout).toContain('Nothing was committed and nothing was pushed');
  });

  test('it refuses a clone with uncommitted work rather than discarding it', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);
    fs.writeFileSync(path.join(clone, 'app.txt'), 'edited in the clone\n');

    const result = prepare(repo, clone, ['--update']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('uncommitted changes');
    expect(fs.readFileSync(path.join(clone, 'app.txt'), 'utf8')).toBe('edited in the clone\n');
  });

  test('it refuses a target that is not a working copy', () => {
    const { repo } = makeRepository();
    const plain = path.join(workspace, `plain-${path.basename(repo)}`);
    fs.mkdirSync(plain, { recursive: true });

    const result = prepare(repo, plain, ['--update']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a Git working copy');
  });

  test('a failed check leaves the clone untouched', () => {
    // The checks run against the layout, before anything is copied. A refresh
    // that copied first and checked afterwards would deliver the finding and
    // the damage together.
    const { repo, git } = makeRepository();
    const clone = cloneOf(repo);
    write(repo, '.env.production', 'SECRET=1\n');
    git('add', '-A');
    git('commit', '-qm', 'add a tracked secret');

    const result = prepare(repo, clone, ['--update']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('environment file in the public tree');
    expect(result.stderr).toContain('The clone was not touched');
    expect(fs.existsSync(path.join(clone, '.env.production'))).toBe(false);
  });

  test('the final artifact guard refuses a nested evidence leak before refreshing the clone', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);
    const headBefore = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).stdout;
    const statusBefore = spawnSync('git', ['status', '--porcelain'], { cwd: clone, encoding: 'utf8' }).stdout;
    const realGit = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    expect(path.isAbsolute(realGit)).toBe(true);
    const shims = path.join(workspace, `checkout-shim-${path.basename(repo)}`);
    fs.mkdirSync(shims);
    const leak = '.codex/stages/stage-a/child/evidence/injected.txt';
    const shim = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });
if (result.status === 0 && args[0] === 'checkout-index') {
  const prefix = args.find((arg) => arg.startsWith('--prefix=')).slice('--prefix='.length);
  const file = path.join(prefix, ${JSON.stringify(leak)});
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'synthetic private evidence\\n');
}
process.exit(result.status === null ? 1 : result.status);
`;
    fs.writeFileSync(path.join(shims, 'git'), shim, { mode: 0o755 });

    const result = spawnSync('bash', [path.join(repo, 'scripts/operations/prepare-public-tree.sh'), '--update', clone], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, ...gitEnv, PATH: `${shims}${path.delimiter}${process.env.PATH}` },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`stage evidence in the public tree: ${leak}`);
    expect(result.stderr).toContain('The clone was not touched');
    expect(fs.existsSync(path.join(clone, leak))).toBe(false);
    expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).stdout).toBe(headBefore);
    expect(spawnSync('git', ['status', '--porcelain'], { cwd: clone, encoding: 'utf8' }).stdout).toBe(statusBefore);
  });

  test('without --update it refuses a non-empty target and says what to pass', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);

    const result = prepare(repo, clone);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exists and is not empty');
    expect(result.stderr).toContain('--update');
  });
});

describeIfWritable('the refresh prepares what the release gate will need', () => {
  /**
   * The clone numbers its commits separately, so the suite receipt — which
   * names one commit — would never match there. The refresh therefore leaves
   * two things behind: a commit message carrying the private commit id, and the
   * receipt itself, which vouches for bytes that are the same on both sides.
   */
  const cloneOf = (repo) => {
    const clone = path.join(workspace, `gate-clone-${path.basename(repo)}`);
    spawnSync('git', ['clone', '-q', repo, clone], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
    return clone;
  };

  const headOf = (repo) =>
    spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();

  const writeReceipt = (repo, commit) => {
    fs.mkdirSync(path.join(repo, 'var/release'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'var/release/suite-receipt.json'),
      JSON.stringify({ commit, command: 'pnpm test' })
    );
  };

  test('it leaves a message naming the commit the tree came from', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);

    const result = prepare(repo, clone, ['--update']);
    const message = fs.readFileSync(path.join(clone, '.git/PREPARE_PUBLIC_COMMIT_MSG'), 'utf8');

    expect(result.status).toBe(0);
    expect(message).toContain(`Source-Commit: ${headOf(repo)}`);
    // A trailer is the last block, or it is not a trailer.
    expect(message.trimEnd().split('\n').pop()).toMatch(/^Source-Commit: [0-9a-f]{40}$/);
    expect(result.stdout).toContain('Keep the Source-Commit trailer');
  });

  test('it carries a receipt that covers this commit', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);
    writeReceipt(repo, headOf(repo));

    const result = prepare(repo, clone, ['--update']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('carried over');
    expect(fs.existsSync(path.join(clone, 'var/release/suite-receipt.json'))).toBe(true);
  });

  test('refresh excludes nested evidence while preserving source identity, license, receipt, origin and history', () => {
    const { repo } = makeRepository({ extraTracked: { ...nestedEvidence, ...publicStageFiles } });
    const clone = cloneOf(repo);
    const originBefore = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: clone, encoding: 'utf8' }).stdout;
    const headBefore = headOf(clone);
    writeReceipt(repo, headOf(repo));
    const receipt = fs.readFileSync(path.join(repo, 'var/release/suite-receipt.json'));

    const result = prepare(repo, clone, ['--update']);

    expect(result).toMatchObject({ status: 0, stderr: '' });
    for (const relative of Object.keys(nestedEvidence)) {
      expect(fs.existsSync(path.join(clone, relative))).toBe(false);
    }
    for (const [relative, contents] of Object.entries(publicStageFiles)) {
      expect(fs.readFileSync(path.join(clone, relative), 'utf8')).toBe(contents);
    }
    expect(fs.readFileSync(path.join(clone, 'LICENSE'), 'utf8')).toContain('AFFERO');
    expect(fs.readFileSync(path.join(clone, 'var/release/suite-receipt.json'))).toEqual(receipt);
    expect(fs.readFileSync(path.join(clone, '.git/PREPARE_PUBLIC_COMMIT_MSG'), 'utf8').trimEnd()).toMatch(new RegExp(`Source-Commit: ${headOf(repo)}$`));
    expect(spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: clone, encoding: 'utf8' }).stdout).toBe(originBefore);
    expect(headOf(clone)).toBe(headBefore);
  });

  test('it refuses to carry a receipt for a different commit', () => {
    // Carrying it would put a receipt next to a tree it never ran against, and
    // the gate would then accept the release on that evidence.
    const { repo } = makeRepository();
    const clone = cloneOf(repo);
    writeReceipt(repo, 'c'.repeat(40));

    const result = prepare(repo, clone, ['--update']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('covers another commit and was not carried over');
    expect(fs.existsSync(path.join(clone, 'var/release/suite-receipt.json'))).toBe(false);
  });

  test('with no receipt it says so rather than staying silent', () => {
    const { repo } = makeRepository();
    const clone = cloneOf(repo);

    expect(prepare(repo, clone, ['--update']).stdout).toContain('no local suite receipt');
  });

  test('the receipt does not become part of the published tree', () => {
    // `var/release` is ignored, so it travels beside the tree without becoming
    // one of the files anybody clones.
    const { repo } = makeRepository();
    const clone = cloneOf(repo);
    writeReceipt(repo, headOf(repo));

    prepare(repo, clone, ['--update']);
    const tracked = spawnSync('git', ['status', '--porcelain'], { cwd: clone, encoding: 'utf8' }).stdout;

    expect(tracked).not.toContain('var/release');
  });
});
