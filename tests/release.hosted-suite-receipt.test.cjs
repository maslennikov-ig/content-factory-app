'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const release = path.join(__dirname, '../scripts/release');
const repo = 'maslennikov-ig/content-factory-app';
const source = 'a'.repeat(40);
const clock = (seconds) => `2026-11-12T15:18:${seconds}Z`;
const runId = 123;
const artifactId = 789;
const success = { status: 'completed', conclusion: 'success' };
const totals = { suites: 1, passedSuites: 1, pendingSuites: 0, tests: 2, passed: 2, pending: 0, todo: 0 };
const log = 'Test Suites: 0 skipped, 1 passed, 1 total\nTests:       0 skipped, 0 todo, 2 passed, 2 total\n'
  + '# pass 1\n# fail 0\nRan 1 test in 0.1s\nOK\n';

let directory;
afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

function setup(change = () => {}) {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hosted-receipt-'));
  const checkout = path.join(directory, 'checkout');
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(checkout);
  fs.mkdirSync(bin);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    CF_HOSTED_FIXTURE: directory, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  const spawn = (command, args, extra = {}) =>
    spawnSync(command, args, { cwd: checkout, env, encoding: 'utf8', ...extra });
  const git = (...args) => {
    const result = spawn('git', args);
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  git('remote', 'add', 'origin', `git@github.com:${repo}.git`);
  git('commit', '--allow-empty', '-qm', `Public tree\n\nSource-Commit: ${source}`);
  const commit = git('rev-parse', 'HEAD');
  const identity = { id: 5, full_name: repo };
  const run = { ...success, id: runId, run_attempt: 2, path: '.github/workflows/build.yml',
    event: 'push', head_branch: 'main', head_sha: commit, repository: identity, head_repository: identity };
  const completed = { ...success, run_id: runId, run_attempt: 2, head_sha: commit };
  const jobs = { jobs: [{ ...completed, name: 'Full test suite (required)',
    started_at: clock('10'), completed_at: clock('50') }, { ...completed, name: 'The suite, one year on' }] };
  const artifact = { id: artifactId, name: 'full-suite-results', expired: false, created_at: clock('30'),
    workflow_run: { id: runId, head_sha: commit, head_branch: 'main', repository_id: 5, head_repository_id: 5 } };
  const verification = { commit, files: 1, coverageFiles: 1,
    totals: { full: { ...totals, shards: 4 }, calendar: { ...totals, shards: 2 } } };
  const files = {
    'coverage/complete/verification.json': verification,
    'coverage/complete/coverage-final.json': { '/work/source.js': { path: '/work/source.js' } },
    'coverage/expected-tests.json': ['/work/tests/example.test.cjs'],
    'suite.log': log,
  };
  change({ run, jobs, artifact, files, verification });
  const archive = path.join(directory, 'artifact.zip');
  const zipped = spawn('python3', ['-c', [
    'import json, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1], "w") as archive:',
    '    for name, value in json.load(sys.stdin).items():',
    '        archive.writestr(name, value if isinstance(value, str) else json.dumps(value))',
  ].join('\n'), archive], { input: JSON.stringify(files) });
  if (zipped.status !== 0) throw new Error(zipped.stderr);
  const bytes = fs.readFileSync(archive);
  artifact.size_in_bytes = bytes.length;
  artifact.digest ??= `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  fs.writeFileSync(path.join(directory, 'api.json'), JSON.stringify({
    [`runs/${runId}`]: run,
    [`runs/${runId}/jobs?filter=all&per_page=100`]: jobs,
    [`runs/${runId}/artifacts?name=full-suite-results&per_page=100`]: { artifacts: [artifact] },
  }));
  fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const [command, flag, host, route] = process.argv.slice(2);
const prefix = 'repos/${repo}/actions/';
if (command !== 'api' || flag !== '--hostname' || host !== 'github.com' || !route.startsWith(prefix)) process.exit(2);
const dir = process.env.CF_HOSTED_FIXTURE;
const key = route.slice(prefix.length);
const api = JSON.parse(fs.readFileSync(path.join(dir, 'api.json')));
if (key === 'artifacts/${artifactId}/zip') process.stdout.write(fs.readFileSync(path.join(dir, 'artifact.zip')));
else if (api[key]) process.stdout.write(JSON.stringify(api[key]));
else process.exit(3);
`, { mode: 0o755 });
  return {
    git, commit, receipt: path.join(checkout, 'var/release/suite-receipt.json'),
    archive: path.join(checkout, `var/release/hosted-suite-${artifactId}.zip`),
    import: () => spawn('python3', [path.join(release, 'hosted-suite-receipt.py'), 'import', String(runId)]),
    check: () => spawn('bash', [path.join(release, 'check-suite-receipt.sh'), '--hosted']),
  };
}

test('imports the successful Build artifact and checks the stored archive on the exact public HEAD', () => {
  const fixture = setup();
  expect(fixture.import()).toMatchObject({ status: 0, stderr: '' });
  expect(JSON.parse(fs.readFileSync(fixture.receipt))).toMatchObject({
    commit: fixture.commit, sourceCommit: source, github: { runId, artifactId, attempt: 2 },
    nodeTest: { pass: '# pass 1', fail: '# fail 0' }, python: 'OK',
  });
  fs.unlinkSync(path.join(directory, 'api.json'));
  expect(fixture.check().status).toBe(0);
  fs.appendFileSync(fixture.archive, 'drift');
  expect(fixture.check().stderr).toContain('artifact size mismatch');
});

test('refuses old evidence after a new public commit even when the source trailer repeats', () => {
  const fixture = setup();
  expect(fixture.import().status).toBe(0);
  fixture.git('commit', '--allow-empty', '-qm', `Next tree\n\nSource-Commit: ${source}`);
  expect(fixture.check().stderr).toContain('does not match this public commit');
});

test('a failed-job retry can reuse the successful suite for the same run and commit', () => {
  const fixture = setup(({ jobs }) => {
    for (const job of jobs.jobs) job.run_attempt = 1;
  });
  expect(fixture.import().status).toBe(0);
  expect(JSON.parse(fs.readFileSync(fixture.receipt)).github).toMatchObject({ attempt: 2, suiteAttempt: 1 });
});

test('a matching private receipt cannot satisfy the image gates', () => {
  const fixture = setup();
  fs.mkdirSync(path.dirname(fixture.receipt), { recursive: true });
  fs.writeFileSync(fixture.receipt, JSON.stringify({ commit: source, command: 'pnpm test' }));
  expect(fixture.check()).toMatchObject({ status: 1, stderr: expect.stringContaining('hosted release evidence') });
});

test('a mention of Source-Commit in prose is insufficient', () => {
  const fixture = setup();
  fixture.git('commit', '--allow-empty', '-qm', `Public tree mentions Source-Commit: ${source} in prose.`);
  expect(fixture.import().stderr).toContain('one full Source-Commit trailer');
});

test.each([
  ['an unrelated SHA', ({ run }) => { run.head_sha = 'b'.repeat(40); }, 'exact commit'],
  ['a different event', ({ run }) => { run.event = 'pull_request'; }, 'exact commit'],
  ['an uncompleted attempt', ({ run }) => { run.status = 'in_progress'; }, 'exact commit'],
  ['a skipped required job', ({ jobs }) => { jobs.jobs[0].conclusion = 'skipped'; }, 'Required job did not pass'],
  ['an artifact from a prior attempt', ({ artifact }) => { artifact.created_at = clock('01'); }, 'successful attempt'],
  ['a mismatching artifact hash', ({ artifact }) => { artifact.digest = `sha256:${'1'.repeat(64)}`; }, 'digest mismatch'],
  ['missing calendar coverage', ({ verification }) => { delete verification.totals.calendar; }, 'calendar'],
  ['failed Node tests', ({ files }) => { files['suite.log'] = log.replace('# fail 0', '# fail 1'); }, 'Node tests failed'],
])('refuses %s without a receipt', (_case, change, message) => {
  const fixture = setup(change);
  const result = fixture.import();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
  expect(fs.existsSync(fixture.receipt)).toBe(false);
});
