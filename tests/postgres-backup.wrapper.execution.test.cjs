const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const wrapperScript = path.join(root, 'deploy/production/backup/run-postgres-backup.sh');

/**
 * `run-postgres-backup.sh` is the host entry point: it refuses to start unless
 * both expected writers are running, stops them, runs the dump, and returns
 * them to work from an EXIT trap in reverse order. Its contract test reads the
 * file as text, which catches a deleted line and nothing about a restart that
 * happens in the wrong order, an exit code that reports the wrong failure, or a
 * writer that never came back being reported as success.
 *
 * This suite executes the wrapper with a stub `docker` first on the child's
 * PATH. The stub keeps the running state of each service in a file, so `compose
 * stop` and `compose start` actually change what the next `docker inspect`
 * reports, and a service that fails to come back can be modelled both ways:
 * `compose start` returning non-zero, and returning zero while the container
 * stays down.
 *
 * One rewrite is unavoidable. The wrapper hardcodes
 * `readonly application_root=/srv/content-factory-next` with no environment
 * override, and a test may not create that path. Every case below except the
 * first therefore runs a copy whose single `application_root` line points at
 * the case's own temp directory; `installWrapper` asserts that exactly one line
 * matched, so a change to the shape of that declaration fails here rather than
 * quietly testing a copy that no longer resembles the original.
 */
let workspace = null;
try {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-wrapper-exec-'));
} catch {
  // A sandbox with no writable temp directory cannot host this suite. That is
  // not a failure of the wrapper, so say so and move on.
  workspace = null;
}

function preservesExecutableBit(directory) {
  if (!directory) return false;
  const probe = path.join(directory, '.executable-bit-probe');
  try {
    fs.writeFileSync(probe, 'probe', { mode: 0o755 });
    fs.chmodSync(probe, 0o644);
    return (fs.statSync(probe).mode & 0o111) === 0;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { force: true });
  }
}

const DOCKER_STUB = `#!/usr/bin/env bash
# Stands in for the docker CLI for one test run. It answers exactly the calls
# run-postgres-backup.sh makes and refuses anything else loudly, so a new call
# in the wrapper cannot be silently absorbed here.
set -Eeuo pipefail

log() { printf '%s\\n' "$1" >>"$CF_STUB_LOG"; }
running_file() { printf '%s/%s.running' "$CF_STUB_STATE" "$1"; }
listed() { [[ " \${2:-} " == *" \${1} "* ]]; }

if [[ "\${1:-}" != 'compose' ]]; then
  if [[ "\${1:-}" == 'inspect' && "\${2:-}" == '--format' ]]; then
    service="\${4#cid-}"
    log "inspect-running \${service}"
    if [[ -f "$(running_file "$service")" ]]; then
      printf 'true\\n'
    else
      printf 'false\\n'
    fi
    exit 0
  fi
  printf 'stub docker: unexpected command %s\\n' "\${1:-}" >&2
  exit 127
fi

shift
# The wrapper always passes --project-directory and --file before the action.
while [[ "\${1:-}" == --* ]]; do shift 2; done

case "\${1:-}" in
  ps)
    [[ "\${2:-}" == '-q' ]] || {
      printf 'stub docker: unexpected compose ps arguments %s\\n' "$*" >&2
      exit 127
    }
    service="\${3:?}"
    log "compose-ps \${service}"
    # A service with no container at all prints nothing, exactly as
    # \`docker compose ps -q\` does.
    if [[ -f "$CF_STUB_STATE/\${service}.exists" ]]; then
      printf 'cid-%s\\n' "$service"
    fi
    exit 0
    ;;
  stop)
    service="\${2:?}"
    log "compose-stop \${service}"
    rm -f -- "$(running_file "$service")"
    exit 0
    ;;
  start)
    service="\${2:?}"
    log "compose-start \${service}"
    if listed "$service" "\${CF_STUB_START_REFUSES:-}"; then
      printf 'stub docker: compose start refused for %s\\n' "$service" >&2
      exit 1
    fi
    # A service that reports a successful start and is not running a moment
    # later: the container came up and died.
    if ! listed "$service" "\${CF_STUB_START_DEAD:-}"; then
      : >"$(running_file "$service")"
    fi
    exit 0
    ;;
  *)
    printf 'stub docker: unexpected compose action %s\\n' "\${1:-}" >&2
    exit 127
    ;;
esac
`;

// Stands in for postgres-backup.sh, which has its own execution suite. What
// matters here is that the wrapper reached it, with the quiesce flag set, and
// what the wrapper does with its exit code.
const DUMP_STUB = `#!/usr/bin/env bash
set -Eeuo pipefail
printf 'dump CF_BACKUP_QUIESCED=%s\\n' "\${CF_BACKUP_QUIESCED:-unset}" >>"$CF_STUB_LOG"
exit "\${CF_STUB_DUMP_STATUS:-0}"
`;

const APPLICATION_ROOT_LINE = /^readonly application_root=.*$/m;

let stubBin;
let caseCounter = 0;

/**
 * Writes the wrapper into `caseDir` with its deployment root pointed at
 * `caseDir`, and fails loudly if that single line no longer looks the way this
 * suite expects.
 */
function installWrapper(caseDir) {
  const source = fs.readFileSync(wrapperScript, 'utf8');
  const matches = source.match(new RegExp(APPLICATION_ROOT_LINE.source, 'gm'));
  expect(matches).toHaveLength(1);

  const installed = path.join(caseDir, 'run-postgres-backup.sh');
  fs.writeFileSync(
    installed,
    source.replace(APPLICATION_ROOT_LINE, `readonly application_root="${caseDir}"`),
    { mode: 0o755 }
  );
  return installed;
}

/** One host directory, one stub state, and a single run of the wrapper. */
function runWrapper({
  services = {
    'cf-app': 'running',
    'cf-temporal': 'running',
    'cf-listmonk': 'running',
  },
  installDumpScript = true,
  dumpExecutable = true,
  dumpStatus = 0,
  startRefuses = [],
  startDead = [],
  composeFile = 'present',
  useRepositoryScript = false,
} = {}) {
  caseCounter += 1;
  const caseDir = path.join(workspace, `case-${caseCounter}`);
  fs.mkdirSync(path.join(caseDir, 'scripts/operations'), { recursive: true });

  if (installDumpScript) {
    fs.writeFileSync(path.join(caseDir, 'scripts/operations/postgres-backup.sh'), DUMP_STUB, {
      mode: dumpExecutable ? 0o755 : 0o644,
    });
  }

  const composePath = path.join(caseDir, 'docker-compose.yaml');
  if (composeFile === 'present') {
    fs.writeFileSync(composePath, 'services: {}\n');
  }

  const stateDir = path.join(caseDir, 'state');
  fs.mkdirSync(stateDir);
  for (const [service, state] of Object.entries(services)) {
    if (state === 'absent') {
      continue;
    }
    fs.writeFileSync(path.join(stateDir, `${service}.exists`), '');
    if (state === 'running') {
      fs.writeFileSync(path.join(stateDir, `${service}.running`), '');
    }
  }

  const stubLog = path.join(caseDir, 'docker.log');
  fs.writeFileSync(stubLog, '');

  const script = useRepositoryScript ? wrapperScript : installWrapper(caseDir);
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // Scoped to this child only; nothing is exported into the test process.
      PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
      CF_COMPOSE_FILE: composeFile === 'present' ? composePath : path.join(caseDir, 'absent.yaml'),
      CF_STUB_LOG: stubLog,
      CF_STUB_STATE: stateDir,
      CF_STUB_DUMP_STATUS: String(dumpStatus),
      CF_STUB_START_REFUSES: startRefuses.join(' '),
      CF_STUB_START_DEAD: startDead.join(' '),
    },
  });

  return {
    result,
    dockerCalls: fs.readFileSync(stubLog, 'utf8').split('\n').filter(Boolean),
    isRunning: (service) => fs.existsSync(path.join(stateDir, `${service}.running`)),
  };
}

const describeIfWritable = workspace ? describe : describe.skip;
const executableBitSupported = preservesExecutableBit(workspace);
const describeIfExecutableBit = executableBitSupported ? describe : describe.skip;

describeIfWritable('the backup wrapper, executed against a stub docker', () => {
  beforeAll(() => {
    stubBin = path.join(workspace, 'bin');
    fs.mkdirSync(stubBin, { recursive: true });
    fs.writeFileSync(path.join(stubBin, 'docker'), DOCKER_STUB, { mode: 0o755 });
  });

  afterAll(() => {
    if (workspace) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('the harness reaches the repository script: a missing compose file is refused', () => {
    // This one case runs the file as it ships, unrewritten: the compose guard
    // is reached before the deployment root is used for anything.
    const { result, dockerCalls } = runWrapper({
      composeFile: 'absent',
      useRepositoryScript: true,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Compose file is missing');
    expect(result.stderr).toContain('Set CF_COMPOSE_FILE');
    expect(dockerCalls).toEqual([]);
  });

  test('a missing dump script is refused before any writer is touched', () => {
    const { result, dockerCalls } = runWrapper({ installDumpScript: false });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Dump script is missing or not executable');
    expect(dockerCalls).toEqual([]);
  });

  describeIfExecutableBit(
    'executable-bit capability (skipped: temp filesystem does not preserve chmod)',
    () => {
      test('a dump script that is present but not executable is refused by the same guard', () => {
        const { result, dockerCalls } = runWrapper({ dumpExecutable: false });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Dump script is missing or not executable');
        expect(dockerCalls).toEqual([]);
      });
    }
  );

  test('a stopped cf-app is reported by name and nothing is stopped', () => {
    const { result, dockerCalls } = runWrapper({
      services: { 'cf-app': 'stopped', 'cf-temporal': 'running' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected writer service is not running: cf-app');
    expect(dockerCalls).toEqual(['compose-ps cf-app', 'inspect-running cf-app']);
  });

  test('a cf-temporal with no container at all is reported by name and nothing is stopped', () => {
    const { result, dockerCalls } = runWrapper({
      services: { 'cf-app': 'running', 'cf-temporal': 'absent' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected writer service is not running: cf-temporal');
    // cf-app was found running and must still not have been stopped: the
    // wrapper checks both writers before it stops either.
    expect(dockerCalls).toEqual([
      'compose-ps cf-app',
      'inspect-running cf-app',
      'compose-ps cf-temporal',
    ]);
    expect(dockerCalls.join('\n')).not.toContain('compose-stop');
  });

  test('a complete run stops both writers, dumps, and restarts them in reverse order', () => {
    const { result, dockerCalls, isRunning } = runWrapper();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(dockerCalls).toEqual([
      'compose-ps cf-app',
      'inspect-running cf-app',
      'compose-ps cf-temporal',
      'inspect-running cf-temporal',
      'compose-ps cf-listmonk',
      'inspect-running cf-listmonk',
      'compose-stop cf-app',
      'compose-stop cf-temporal',
      'compose-stop cf-listmonk',
      'dump CF_BACKUP_QUIESCED=1',
      'compose-start cf-listmonk',
      'compose-ps cf-listmonk',
      'inspect-running cf-listmonk',
      'compose-start cf-temporal',
      'compose-ps cf-temporal',
      'inspect-running cf-temporal',
      'compose-start cf-app',
      'compose-ps cf-app',
      'inspect-running cf-app',
    ]);
    expect(isRunning('cf-app')).toBe(true);
    expect(isRunning('cf-temporal')).toBe(true);
    expect(isRunning('cf-listmonk')).toBe(true);
  });

  test('a failing dump still restarts both writers and reports the dump status', () => {
    const { result, dockerCalls, isRunning } = runWrapper({ dumpStatus: 7 });

    expect(result.status).toBe(7);
    expect(dockerCalls).toContain('compose-start cf-temporal');
    expect(dockerCalls).toContain('compose-start cf-listmonk');
    expect(dockerCalls).toContain('compose-start cf-app');
    expect(isRunning('cf-app')).toBe(true);
    expect(isRunning('cf-temporal')).toBe(true);
    expect(isRunning('cf-listmonk')).toBe(true);
  });

  test('quiesces and restores the Listmonk writer around its database dump', () => {
    const { result, dockerCalls, isRunning } = runWrapper({
      services: {
        'cf-app': 'running',
        'cf-temporal': 'running',
        'cf-listmonk': 'running',
      },
    });

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('compose-stop cf-listmonk');
    expect(dockerCalls).toContain('compose-start cf-listmonk');
    expect(isRunning('cf-listmonk')).toBe(true);
  });

  test('backs up app and Temporal before Listmonk has a container', () => {
    const { result, dockerCalls, isRunning } = runWrapper({
      services: {
        'cf-app': 'running',
        'cf-temporal': 'running',
        'cf-listmonk': 'absent',
      },
    });

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('dump CF_BACKUP_QUIESCED=1');
    expect(dockerCalls).not.toContain('compose-stop cf-listmonk');
    expect(dockerCalls).not.toContain('compose-start cf-listmonk');
    expect(isRunning('cf-app')).toBe(true);
    expect(isRunning('cf-temporal')).toBe(true);
  });

  test('a writer that starts and dies is reported by name, and the other is still restarted', () => {
    const { result, dockerCalls, isRunning } = runWrapper({ startDead: ['cf-temporal'] });

    // `compose start` succeeded; only the running check catches this.
    expect(dockerCalls).toContain('compose-start cf-temporal');
    expect(result.stderr).toContain(
      'Backup wrapper could not return a stopped service to work: cf-temporal'
    );
    expect(result.status).toBe(1);
    expect(isRunning('cf-temporal')).toBe(false);
    // A failure on the first restart must not abandon the second.
    expect(isRunning('cf-app')).toBe(true);
  });

  test('a writer whose start command fails is reported by the same check', () => {
    const { result, isRunning } = runWrapper({ startRefuses: ['cf-app'] });

    expect(result.stderr).toContain(
      'Backup wrapper could not return a stopped service to work: cf-app'
    );
    expect(result.status).toBe(1);
    expect(isRunning('cf-app')).toBe(false);
    expect(isRunning('cf-temporal')).toBe(true);
  });

  test('the dump status wins over a restart failure, and both are said out loud', () => {
    const { result, isRunning } = runWrapper({
      dumpStatus: 7,
      startRefuses: ['cf-app'],
    });

    expect(result.status).toBe(7);
    expect(result.stderr).toContain(
      'Backup wrapper could not return a stopped service to work: cf-app'
    );
    expect(result.stderr).toContain(
      'the exit code reports the backup failure, not the restart failure'
    );
    expect(isRunning('cf-app')).toBe(false);
  });
});
