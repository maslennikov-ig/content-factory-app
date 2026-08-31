const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { spawn } = require('node:child_process');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github/workflows/build.yml');
const runnerPath = path.join(root, 'scripts/ci/run-docker-backed-ci.sh');
const nodeResultGuardPath = path.join(
  root,
  'scripts/ci/assert-node-test-tap-result.cjs'
);
const cleanupPaths = new Set();

const tempWorkspace = () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-docker-ci-'));
  cleanupPaths.add(workspace);
  return workspace;
};

const executable = (file, source) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, { mode: 0o755 });
};

const executeRunSteps = (job, cwd, env) => {
  const output = [];

  for (const step of job?.steps ?? []) {
    if (typeof step.run !== 'string') continue;
    const result = spawnSync(
      '/bin/bash',
      ['-Eeuo', 'pipefail', '-c', step.run],
      {
        cwd,
        env,
        encoding: 'utf8',
      }
    );
    output.push(result.stdout, result.stderr);
    if (result.status !== 0) {
      return { status: result.status, output: output.join('') };
    }
  }

  return { status: 0, output: output.join('') };
};

const makeFixture = ({
  pendingTests = 0,
  missingImages = [],
  failingNativeFile = '',
  blockNative = false,
} = {}) => {
  expect(fs.existsSync(runnerPath)).toBe(true);
  expect(
    fs.existsSync(path.join(root, 'scripts/ci/assert-docker-jest-result.cjs'))
  ).toBe(true);
  expect(fs.existsSync(nodeResultGuardPath)).toBe(true);
  const workspace = tempWorkspace();
  const bin = path.join(workspace, 'bin');
  const log = path.join(workspace, 'commands.log');
  const imageLog = path.join(workspace, 'images.log');
  const dockerLog = path.join(workspace, 'docker.log');
  const stateDir = path.join(workspace, 'docker-state');
  const tempDir = path.join(workspace, 'tmp');
  const signalReady = path.join(workspace, 'signal-ready');
  const fixtureRunner = path.join(
    workspace,
    'scripts/ci/run-docker-backed-ci.sh'
  );
  const resultGuard = path.join(
    workspace,
    'scripts/ci/assert-docker-jest-result.cjs'
  );
  const nodeResultGuard = path.join(
    workspace,
    'scripts/ci/assert-node-test-tap-result.cjs'
  );

  fs.mkdirSync(path.dirname(fixtureRunner), { recursive: true });
  fs.copyFileSync(runnerPath, fixtureRunner);
  fs.chmodSync(fixtureRunner, 0o755);
  fs.copyFileSync(
    path.join(root, 'scripts/ci/assert-docker-jest-result.cjs'),
    resultGuard
  );
  fs.copyFileSync(nodeResultGuardPath, nodeResultGuard);
  fs.mkdirSync(stateDir);
  fs.mkdirSync(tempDir);

  executable(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
case "\${1:-}:\${2:-}" in
  info:|compose:version) exit 0 ;;
  image:inspect)
    printf '%s\n' "$*" >> "$CF_DOCKER_IMAGE_LOG"
    [[ ":$CF_DOCKER_MISSING_IMAGES:" != *":\${3:-}:"* ]]
    ;;
  pull:*)
    printf '%s\n' "$*" >> "$CF_DOCKER_IMAGE_LOG"
    exit 0
    ;;
  network:create)
    printf '%s\n' "$*" >> "$CF_DOCKER_COMMAND_LOG"
    touch "$CF_DOCKER_STATE/network"
    printf '%s\n' "\${3:-}"
    ;;
  volume:create)
    printf '%s\n' "$*" >> "$CF_DOCKER_COMMAND_LOG"
    touch "$CF_DOCKER_STATE/volume"
    printf '%s\n' "\${3:-}"
    ;;
  run:*)
    printf '%s\n' "$*" >> "$CF_DOCKER_COMMAND_LOG"
    publish_count=0
    publish_value=''
    expect_publish_value=0
    for argument in "$@"; do
      if [[ "$expect_publish_value" -eq 1 ]]; then
        publish_count=$((publish_count + 1))
        publish_value="$argument"
        expect_publish_value=0
        continue
      fi
      case "$argument" in
        --publish) expect_publish_value=1 ;;
        --publish=*)
          publish_count=$((publish_count + 1))
          publish_value="\${argument#--publish=}"
          ;;
      esac
    done
    if [[ "$expect_publish_value" -ne 0 || "$publish_count" -ne 1 || "$publish_value" != '127.0.0.1::5432' ]]; then
      printf 'invalid PostgreSQL publish binding\n' >&2
      exit 93
    fi
    touch "$CF_DOCKER_STATE/container"
    printf 'fixture-container-id\n'
    ;;
  port:*) printf '127.0.0.1:55432\n' ;;
  exec:*) exit 0 ;;
  rm:*)
    printf '%s\n' "$*" >> "$CF_DOCKER_COMMAND_LOG"
    rm -f "$CF_DOCKER_STATE/container"
    ;;
  network:rm)
    printf '%s\n' "$*" >> "$CF_DOCKER_COMMAND_LOG"
    rm -f "$CF_DOCKER_STATE/network"
    ;;
  volume:rm)
    printf '%s\n' "$*" >> "$CF_DOCKER_COMMAND_LOG"
    rm -f "$CF_DOCKER_STATE/volume"
    ;;
  *) printf 'unexpected docker request: %s\\n' "$*" >&2; exit 91 ;;
esac
`
  );
  executable(
    path.join(bin, 'pnpm'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
printf 'pnpm %s\\n' "$*" >> "$CF_DOCKER_CI_LOG"
output=''
while (( $# > 0 )); do
  if [[ "$1" == '--outputFile' ]]; then
    output="$2"
    shift 2
    continue
  fi
  shift
done
[[ -n "$output" ]]
printf '%s' "$CF_FAKE_JEST_RESULT" > "$output"
`
  );
  executable(
    path.join(bin, 'node'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "\${1:-}" == *assert-docker-jest-result.cjs || "\${1:-}" == *assert-node-test-tap-result.cjs ]]; then
  exec "$CF_REAL_NODE" "$@"
fi
if [[ "$*" != *'--test'* ]]; then
  printf 'unexpected node request: %s\n' "$*" >&2
  exit 92
fi
native_file="\${!#}"
printf 'node %s | SOURCE_REGISTRY_POSTGRES_URL=%s | POST_CONTENT_CONTEXT_POSTGRES_URL=%s | disposable_marker=%s\n' \
  "$*" "\${SOURCE_REGISTRY_POSTGRES_URL:-}" "\${POST_CONTENT_CONTEXT_POSTGRES_URL:-}" \
  "\${CF_DOCKER_CI_DISPOSABLE_POSTGRES:-}" >> "$CF_DOCKER_CI_LOG"
if [[ "\${CF_BLOCK_NATIVE:-}" == 1 ]]; then
  touch "$CF_SIGNAL_READY"
  trap 'exit 143' TERM
  while true; do sleep 1; done
fi
if [[ "\${CF_FAIL_NATIVE_FILE:-}" == "\${native_file##*/}" ]]; then
  printf 'TAP version 13\nnot ok 1 - fixture failure\n1..1\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n'
  exit 1
fi
printf 'TAP version 13\nok 1 - fixture proof\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
`
  );

  for (const script of [
    'verify-mastra-storage-migration.sh',
    'verify-postgres-backup-restore.sh',
  ]) {
    executable(
      path.join(workspace, 'scripts/operations', script),
      `#!/usr/bin/env bash
set -Eeuo pipefail
printf 'scripts/operations/${script}\\n' >> "$CF_DOCKER_CI_LOG"
`
    );
  }

  const totalTests = pendingTests > 0 ? pendingTests : 7;
  return {
    workspace,
    log,
    imageLog,
    env: {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      CF_DOCKER_CI_LOG: log,
      CF_DOCKER_IMAGE_LOG: imageLog,
      CF_DOCKER_COMMAND_LOG: dockerLog,
      CF_DOCKER_STATE: stateDir,
      CF_DOCKER_MISSING_IMAGES: missingImages.join(':'),
      CF_FAIL_NATIVE_FILE: failingNativeFile,
      CF_BLOCK_NATIVE: blockNative ? '1' : '',
      CF_SIGNAL_READY: signalReady,
      CF_REAL_NODE: process.execPath,
      CF_FAKE_JEST_RESULT: JSON.stringify({
        success: true,
        numFailedTests: 0,
        numPassedTests: totalTests - pendingTests,
        numPendingTests: pendingTests,
        numTotalTests: totalTests,
      }),
      TMPDIR: tempDir,
    },
    dockerLog,
    stateDir,
    tempDir,
    signalReady,
  };
};

afterEach(() => {
  for (const workspace of cleanupPaths) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  cleanupPaths.clear();
});

describe('native Node test result guard', () => {
  const withNodeTestFooter = (tap) =>
    tap.replace(
      /# skipped (\d+)\n$/,
      '# cancelled 0\n# skipped $1\n# todo 0\n'
    );

  test.each([
    {
      name: 'malformed TAP',
      tap: 'not TAP at all\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'inconsistent TAP totals',
      tap: 'TAP version 13\nok 1 - only\n1..1\n# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'a footer without top-level points',
      tap: 'TAP version 13\n1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'a not-ok point hidden by a green footer',
      tap: 'TAP version 13\nnot ok 1 - hidden failure\n1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'a skip directive hidden by a green footer',
      tap: 'TAP version 13\nok 1 - hidden skip # SKIP unavailable\n1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'duplicate top-level point numbers',
      tap: 'TAP version 13\nok 1 - first\nok 1 - duplicate\n1..2\n# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'missing top-level point numbers',
      tap: 'TAP version 13\nok 1 - first\nok 3 - missing second\n1..2\n# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'out-of-order top-level point numbers',
      tap: 'TAP version 13\nok 2 - second\nok 1 - first\n1..2\n# tests 2\n# pass 2\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'a TODO directive hidden by a green footer',
      tap: 'TAP version 13\nok 1 - hidden todo # TODO later\n1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n',
      expected: 'malformed TAP result',
    },
    {
      name: 'a skipped test',
      tap: 'TAP version 13\nok 1 - gated # SKIP no database\n1..1\n# tests 1\n# pass 0\n# fail 0\n# skipped 1\n',
      expected: 'skipped 1 test(s)',
    },
    {
      name: 'a failed test',
      tap: 'TAP version 13\nnot ok 1 - failed\n1..1\n# tests 1\n# pass 0\n# fail 1\n# skipped 0\n',
      expected: 'failed 1 test(s)',
    },
  ])('rejects $name', ({ tap, expected }) => {
    const workspace = tempWorkspace();
    const resultPath = path.join(workspace, 'result.tap');
    fs.writeFileSync(resultPath, withNodeTestFooter(tap));

    const result = spawnSync(process.execPath, [nodeResultGuardPath, resultPath], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(expected);
  });

  test('accepts exact nonzero totals with every discovered test passing', () => {
    const workspace = tempWorkspace();
    const resultPath = path.join(workspace, 'result.tap');
    fs.writeFileSync(
      resultPath,
      withNodeTestFooter(
      'TAP version 13\nok 1 - first\nok 2 - second\n1..2\n# tests 2\n# pass 2\n# fail 0\n# skipped 0\n'
      )
    );

    const result = spawnSync(process.execPath, [nodeResultGuardPath, resultPath], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(result.stdout.trim()).toBe(
      'Native Node test proof passed: 2 test(s), 0 failed, 0 skipped.'
    );
  });
});

describe('required Docker-backed CI execution', () => {
  test('the configured Docker job fails closed when Docker is unavailable', () => {
    const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
    const requiredJob =
      workflow.jobs['docker-backed-operations'] ?? workflow.jobs.build;
    const workspace = tempWorkspace();
    const bin = path.join(workspace, 'bin');
    fs.mkdirSync(bin);
    executable(path.join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
    executable(path.join(bin, 'docker'), '#!/bin/sh\nexit 69\n');

    const result = executeRunSteps(requiredJob, root, {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      GITHUB_ENV: path.join(workspace, 'github.env'),
    });

    expect(workflow.jobs).toHaveProperty('docker-backed-operations');
    expect(requiredJob.name).toBe('Docker-capable execution proofs (required)');
    expect(result.status).not.toBe(0);
  });

  test('local mode reports the exact reason instead of silently skipping', () => {
    const workspace = tempWorkspace();
    const result = spawnSync('/bin/bash', [runnerPath], {
      cwd: root,
      env: { ...process.env, PATH: workspace },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(
      'SKIP: Docker-backed verification was not run locally: Docker CLI is not installed or is not on PATH.'
    );
    expect(result.stderr).toBe('');
  });

  test.each([
    {
      file: 'tests/post.content-context.test.cjs',
      variable: 'POST_CONTENT_CONTEXT_POSTGRES_URL',
    },
    {
      file: 'tests/content-source-registry.postgres.test.cjs',
      variable: 'SOURCE_REGISTRY_POSTGRES_URL',
    },
  ])('$file rejects a non-disposable target before connecting', ({ file, variable }) => {
    const result = spawnSync(
      process.execPath,
      ['--test', file],
      {
        cwd: root,
        env: {
          ...process.env,
          [variable]:
            'postgresql://postgres:postgres@database.example.com/postgres',
          CF_DOCKER_CI_DISPOSABLE_POSTGRES: '',
        },
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      `${variable} must identify an explicitly marked loopback disposable PostgreSQL database`
    );
  });

  test.each(
    [
      {
        file: 'tests/post.content-context.test.cjs',
        variable: 'POST_CONTENT_CONTEXT_POSTGRES_URL',
      },
      {
        file: 'tests/content-source-registry.postgres.test.cjs',
        variable: 'SOURCE_REGISTRY_POSTGRES_URL',
      },
    ].flatMap((target) =>
      [
        '?host=remote.example.com',
        '?HOSTADDR=203.0.113.10',
        '?SeRvIcE=production',
        '?servicefile=%2Ftmp%2Fproduction.conf',
        '?host=remote.example.com&HOST=other.example.com',
      ].map((query) => ({ ...target, query }))
    )
  )('$file rejects effective-target override $query before connecting', ({
    file,
    variable,
    query,
  }) => {
    const result = spawnSync(process.execPath, ['--test', file], {
      cwd: root,
      env: {
        ...process.env,
        [variable]: `postgresql://postgres:postgres@127.0.0.1:1/postgres${query}`,
        CF_DOCKER_CI_DISPOSABLE_POSTGRES: '1',
      },
      encoding: 'utf8',
      // The child normally exits in under 500 ms. Keep enough headroom for the
      // full parallel Jest run, where Docker-backed suites can briefly contend
      // for CPU while this fail-closed guard starts Node.
      timeout: 5000,
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain(
      `${variable} must identify an explicitly marked loopback disposable PostgreSQL database`
    );
    expect(output).not.toMatch(/ENOTFOUND|ECONNREFUSED|ETIMEDOUT/);
  });

  test('native files name all three environment-gated skips', () => {
    const env = { ...process.env };
    delete env.SOURCE_REGISTRY_POSTGRES_URL;
    delete env.POST_CONTENT_CONTEXT_POSTGRES_URL;
    delete env.CF_DOCKER_CI_DISPOSABLE_POSTGRES;
    const result = spawnSync(
      process.execPath,
      [
        '--test',
        '--test-reporter=tap',
        'tests/content-source-registry.postgres.test.cjs',
        'tests/post.content-context.test.cjs',
      ],
      { cwd: root, env, encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(
      result.stdout.match(
        /# SKIP SOURCE_REGISTRY_POSTGRES_URL is not configured/g
      )
    ).toHaveLength(1);
    expect(
      result.stdout.match(
        /# SKIP POST_CONTENT_CONTEXT_POSTGRES_URL is not configured/g
      )
    ).toHaveLength(2);
  });

  test('required mode rejects a green Jest result containing skipped tests', () => {
    const fixture = makeFixture({ pendingTests: 2 });
    const result = spawnSync(
      '/bin/bash',
      [
        path.join(fixture.workspace, 'scripts/ci/run-docker-backed-ci.sh'),
        '--require-docker',
      ],
      { cwd: fixture.workspace, env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'ERROR: Docker-backed Jest execution skipped 2 test(s); required proof cannot pass.'
    );
    expect(fs.readFileSync(fixture.log, 'utf8')).not.toContain(
      'scripts/operations/'
    );
  });

  test('the runner ensures both proof images and executes all Docker suites', () => {
    const fixture = makeFixture();
    const result = spawnSync(
      '/bin/bash',
      [
        path.join(fixture.workspace, 'scripts/ci/run-docker-backed-ci.sh'),
        '--require-docker',
      ],
      { cwd: fixture.workspace, env: fixture.env, encoding: 'utf8' }
    );
    const commands = fs.readFileSync(fixture.log, 'utf8').trim().split('\n');
    const imageChecks = fs
      .readFileSync(fixture.imageLog, 'utf8')
      .trim()
      .split('\n');

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(imageChecks).toEqual([
      'image inspect postgres:17-alpine',
      'image inspect nginx:alpine',
    ]);
    expect(commands).toHaveLength(5);
    expect(commands[0]).toContain(
      'tests/browser-error-relay.test.cjs tests/error-collector.compose.test.cjs tests/postgres-role-isolation.execution.test.cjs'
    );
    expect(commands.slice(1, 3)).toEqual([
      expect.stringContaining(
        'node --test --test-reporter=tap tests/content-source-registry.postgres.test.cjs'
      ),
      expect.stringContaining(
        'node --test --test-reporter=tap tests/post.content-context.test.cjs'
      ),
    ]);
    expect(commands[1]).toContain(
      'SOURCE_REGISTRY_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres'
    );
    expect(commands[2]).toContain(
      'POST_CONTENT_CONTEXT_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres'
    );
    expect(commands[1]).toContain('disposable_marker=1');
    expect(commands[2]).toContain('disposable_marker=1');
    expect(commands.slice(3)).toEqual([
      'scripts/operations/verify-mastra-storage-migration.sh',
      'scripts/operations/verify-postgres-backup-restore.sh',
    ]);
    expect(fs.readdirSync(fixture.stateDir)).toEqual([]);
    expect(fs.readdirSync(fixture.tempDir)).toEqual([]);
    const dockerCommands = fs.readFileSync(fixture.dockerLog, 'utf8');
    expect(dockerCommands).toMatch(/network create cf-docker-ci-[a-z0-9]+/);
    expect(dockerCommands).toMatch(/volume create cf-docker-ci-[a-z0-9]+/);
    expect(dockerCommands).toContain('run --detach');
    const runArguments = dockerCommands
      .split('\n')
      .find((command) => command.startsWith('run --detach'))
      .split(/\s+/);
    const publishPositions = runArguments.flatMap((argument, index) =>
      argument === '--publish' ? [index] : []
    );
    expect(publishPositions).toHaveLength(1);
    expect(runArguments[publishPositions[0] + 1]).toBe(
      '127.0.0.1::5432'
    );
    expect(dockerCommands).toContain('rm --force');
    expect(dockerCommands).toContain('network rm');
    expect(dockerCommands).toContain('volume rm');
  });

  test('a native failure stops operational proofs and still removes every resource', () => {
    const fixture = makeFixture({
      failingNativeFile: 'post.content-context.test.cjs',
    });
    const result = spawnSync(
      '/bin/bash',
      [
        path.join(fixture.workspace, 'scripts/ci/run-docker-backed-ci.sh'),
        '--require-docker',
      ],
      { cwd: fixture.workspace, env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(fixture.log, 'utf8')).not.toContain(
      'scripts/operations/'
    );
    expect(fs.readdirSync(fixture.stateDir)).toEqual([]);
    expect(fs.readdirSync(fixture.tempDir)).toEqual([]);
  });

  test('the Docker fixture rejects any second PostgreSQL publish binding', () => {
    const fixture = makeFixture();
    const fixtureRunner = path.join(
      fixture.workspace,
      'scripts/ci/run-docker-backed-ci.sh'
    );
    const source = fs.readFileSync(fixtureRunner, 'utf8');
    const mutated = source.replace(
      '  --publish 127.0.0.1::5432 \\\n',
      '  --publish 127.0.0.1::5432 \\\n  --publish 0.0.0.0::5432 \\\n'
    );
    expect(mutated).not.toBe(source);
    fs.writeFileSync(fixtureRunner, mutated, { mode: 0o755 });

    const result = spawnSync(
      '/bin/bash',
      [fixtureRunner, '--require-docker'],
      { cwd: fixture.workspace, env: fixture.env, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(fs.readdirSync(fixture.stateDir)).toEqual([]);
    expect(fs.readdirSync(fixture.tempDir)).toEqual([]);
  });

  test('SIGTERM during a native proof removes every disposable resource', async () => {
    const fixture = makeFixture({ blockNative: true });
    const child = spawn(
      '/bin/bash',
      [
        path.join(fixture.workspace, 'scripts/ci/run-docker-backed-ci.sh'),
        '--require-docker',
      ],
      {
        cwd: fixture.workspace,
        env: fixture.env,
        detached: true,
        stdio: 'ignore',
      }
    );

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (fs.existsSync(fixture.signalReady)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(fs.existsSync(fixture.signalReady)).toBe(true);
    process.kill(-child.pid, 'SIGTERM');
    const exit = await new Promise((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });

    expect(exit.code === 143 || exit.signal === 'SIGTERM').toBe(true);
    expect(fs.readdirSync(fixture.stateDir)).toEqual([]);
    expect(fs.readdirSync(fixture.tempDir)).toEqual([]);
  });

  test('required mode pulls nginx before Jest when a clean runner lacks it', () => {
    const fixture = makeFixture({ missingImages: ['nginx:alpine'] });
    const result = spawnSync(
      '/bin/bash',
      [
        path.join(fixture.workspace, 'scripts/ci/run-docker-backed-ci.sh'),
        '--require-docker',
      ],
      { cwd: fixture.workspace, env: fixture.env, encoding: 'utf8' }
    );

    expect(result).toMatchObject({ status: 0, stderr: '' });
    expect(
      fs.readFileSync(fixture.imageLog, 'utf8').trim().split('\n')
    ).toEqual([
      'image inspect postgres:17-alpine',
      'image inspect nginx:alpine',
      'pull nginx:alpine',
    ]);
    expect(fs.readFileSync(fixture.log, 'utf8')).toContain(
      'tests/browser-error-relay.test.cjs'
    );
  });
});
