const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const release = path.resolve(__dirname, '../scripts/release');
const sandboxes = [];

function sandbox(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-local-capacity-'));
  sandboxes.push(directory);
  const events = path.join(directory, 'events');
  const fixtureRelease = path.join(directory, 'release');
  fs.mkdirSync(fixtureRelease);
  for (const name of ['build-local-image.sh', 'check-local-build-capacity.py']) {
    fs.copyFileSync(path.join(release, name), path.join(fixtureRelease, name));
  }
  for (const name of ['check-suite-receipt.sh', 'make-source-archive.sh']) {
    fs.writeFileSync(path.join(fixtureRelease, name), `#!/bin/bash
printf '%s\\n' '${name}' >>"$CF_TEST_EVENTS"
[ "\${CF_TEST_GATE_FAIL:-}" != '${name}' ]
`, { mode: 0o700 });
  }
  fs.writeFileSync(path.join(directory, 'git'), `#!/bin/bash
case "$1 $2" in
 'rev-parse --show-toplevel') printf '%s\\n' '${directory}' ;;
 'remote get-url') echo "\${CF_TEST_ORIGIN:-https://github.com/maslennikov-ig/content-factory-app.git}" ;;
 *) exit 99 ;;
esac
`, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >>"$CF_TEST_EVENTS"
case "$1 $2" in
 'context show') echo default ;;
 'context inspect') echo unix:///var/run/docker.sock ;;
 'buildx inspect') printf 'Driver: %s\\nEndpoint: default\\n' "\${CF_TEST_DRIVER:-docker}" ;;
 'image inspect') printf 'sha256:%064d\\n' 1 ;;
 'run --rm')
   [ "\${CF_TEST_PROBE_FAIL:-0}" = 0 ] || exit 42
   printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\noverlay 999999999 123 %s 90%% /\\nFilesystem Inodes IUsed IFree IUse%% Mounted on\\noverlay 999999999 123 200000 90%% /\\n' "\${CF_TEST_FREE_KB:-20971520}"
   ;;
 'rm -f') exit 0 ;;
 'build --target') exit 0 ;;
 *) exit 99 ;;
esac
`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, CF_TEST_EVENTS: events, ...overrides };
  delete env.DOCKER_HOST;
  delete env.DOCKER_CONTEXT;
  if (overrides.DOCKER_HOST) env.DOCKER_HOST = overrides.DOCKER_HOST;
  return {
    run: (build = false) => spawnSync(build ? 'bash' : 'python3', build
      ? [path.join(fixtureRelease, 'build-local-image.sh'), 'candidate', '--min-free-gib', '12']
      : [path.join(fixtureRelease, 'check-local-build-capacity.py'), '--min-free-gib', '12'],
    { env, encoding: 'utf8', timeout: 10000 }),
    events: () => fs.existsSync(events) ? fs.readFileSync(events, 'utf8') : '',
  };
}

afterAll(() => sandboxes.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

test('WSL free disk is ignored; the daemon filesystem gates the build', () => {
  const s = sandbox({ CF_TEST_FREE_KB: '9000000' });
  const result = s.run(true);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).result).toBe('INSUFFICIENT_CAPACITY');
  expect(s.events()).not.toContain('build --target');
  expect(s.events()).toContain('--read-only');
  expect(s.events()).toContain('--pull=never');
  expect(s.events()).not.toMatch(/prune|ssh|push|login/);
});

test('enough daemon headroom allows exactly the requested local runtime build', () => {
  const s = sandbox();
  expect(s.run(true).status).toBe(0);
  expect(s.events()).toContain('build --target runtime -t content-factory-next:candidate -f Dockerfile .');
  expect(s.events().indexOf('check-suite-receipt.sh')).toBeLessThan(s.events().indexOf('build --target'));
  expect(s.events().indexOf('make-source-archive.sh')).toBeLessThan(s.events().indexOf('build --target'));
});

test.each([
  { CF_TEST_DRIVER: 'docker-container' },
  { DOCKER_HOST: 'ssh://remote.invalid' },
  { CF_TEST_PROBE_FAIL: '1' },
])('unsupported or failed measurement blocks before build: %j', (env) => {
  const s = sandbox(env);
  const result = s.run(true);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).result).toBe('UNKNOWN');
  expect(s.events()).not.toContain('build --target');
});

test.each([
  { CF_TEST_ORIGIN: 'https://github.com/maslennikov-ig/content-factory-next.git' },
  { CF_TEST_GATE_FAIL: 'check-suite-receipt.sh' },
  { CF_TEST_GATE_FAIL: 'make-source-archive.sh' },
])('public-tree, suite and source gates run before the expensive build: %j', (env) => {
  const s = sandbox(env);
  expect(s.run(true).status).toBe(1);
  expect(s.events()).not.toContain('build --target');
  expect(s.events()).not.toContain('run --rm');
});
