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

const prepare = (repo, target) =>
  spawnSync('bash', [path.join(repo, 'scripts/operations/prepare-public-tree.sh'), target], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...gitEnv },
  });

const targetFor = (repo) => path.join(repo, '..', `out-${path.basename(repo)}`);

const describeIfWritable = workspace ? describe : describe.skip;

describeIfWritable('preparing the public tree', () => {
  afterAll(() => {
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  });

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
    // The exclusion is anchored at `.codex/stages/*/evidence/`. A looser pattern
    // — anything containing `evidence` — would silently drop the measurement
    // tools the product's voice work runs on.
    const { repo } = makeRepository();
    const target = targetFor(repo);

    expect(prepare(repo, target).status).toBe(0);
    expect(fs.existsSync(path.join(target, 'scripts/evidence/voice-eval/measure.cjs'))).toBe(true);
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
