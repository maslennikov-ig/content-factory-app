'use strict';

/**
 * A fake production host, so a release script can be RUN rather than read.
 *
 * The two release guards used to match regular expressions against the text of
 * `switch-host-image.sh` and `retain-host-artifacts.sh`. That catches a line
 * being deleted and nothing else: an `echo` printing the right words satisfies
 * it, a `sed` that edits nothing satisfies it, and a `grep` reading the file
 * somebody just wrote satisfies it exactly as well as reading the container.
 * For scripts that hold a standing permission to delete images on a shared
 * host, that is not evidence of behaviour.
 *
 * So this helper builds a host instead. `ssh` becomes a shell script that
 * executes the remote command locally, in a temporary directory that plays the
 * part of `/srv/content-factory-next`; `docker` becomes a shell script that
 * answers from a small state directory and records every invocation. Both are
 * put first on `PATH`, and the script under test is run unmodified.
 *
 * Nothing here can reach a real host: the scripts refuse without
 * `CF_DEPLOY_HOST`, and the value handed to them is `stub@fake-host`, which
 * only the stub `ssh` ever sees. There is no network call in this file, and
 * every path it writes to is under the system temporary directory.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..', '..');

const SSH_STUB = `#!/usr/bin/env bash
# Plays the remote host: drops the ssh options and the destination, records the
# command, and runs it here.
while [ "$1" = "-o" ]; do shift 2; done
shift
printf '%s\\n' "$*" >> "$CF_STUB_DIR/ssh.log"
exec bash -c "$*"
`;

const DOCKER_STUB = `#!/usr/bin/env bash
# Answers from $CF_STUB_DIR/state and records every call. Anything this file
# does not know about is a failure, not a silent success: a script that starts
# calling docker in a new way must be looked at rather than assumed harmless.
state="$CF_STUB_DIR/state"
printf '%s\\n' "$*" >> "$CF_STUB_DIR/docker.log"

case "$1" in
  image)
    [ "$2" = "inspect" ] || { echo "stub: docker image $2?" >&2; exit 1; }
    name="$3"
    grep -Fxq "$name" "$state/images" || exit 1
    shift 3
    if [ "$1" = "--format" ]; then
      printf '%s\\n' "$2" | sed 's/{{\\.Id}}/sha256:stub/'
    else
      echo "present: $name"
    fi
    exit 0
    ;;
  inspect)
    case "$*" in
      *State.Health.Status*) cat "$state/health"; exit 0 ;;
      *Config.Image*)        cat "$state/running_image"; exit 0 ;;
      *RestartCount*)        echo "restarts: 0"; exit 0 ;;
    esac
    echo "stub: docker inspect $*?" >&2
    exit 1
    ;;
  images)
    cat "$state/images_list"
    exit 0
    ;;
  rmi)
    shift
    for name in "$@"; do
      grep -Fxq "$name" "$state/images" || { echo "No such image: $name" >&2; exit 1; }
    done
    printf '%s\\n' "$@" >> "$state/rmi.log"
    for name in "$@"; do
      grep -Fxv "$name" "$state/images" > "$state/images.next" || true
      mv "$state/images.next" "$state/images"
    done
    printf 'Untagged: %s\\n' "$@"
    exit 0
    ;;
  stats)
    printf 'cf-next-app\\t900MiB / 1.8GiB\\t50.00%%\\n'
    exit 0
    ;;
  compose)
    case "$*" in
      *"up -d cf-app"*)
        # A restart picks up whatever the files now say — unless the test asked
        # for a container that kept its old environment, which is the shape of
        # all four marker drifts.
        if [ ! -f "$state/container_keeps_old_environment" ]; then
          grep '^CF_IMAGE=' "$CF_STUB_DIR/srv/.env" | cut -d= -f2- | tr -d '"' \\
            > "$state/running_image"
          grep '^CONTENT_FACTORY_RELEASE=' "$CF_STUB_DIR/srv/app.env" \\
            | cut -d= -f2- | tr -d '"' > "$state/container_marker"
        fi
        cp "$state/health_after_up" "$state/health"
        echo "Container cf-next-app  Started"
        exit 0
        ;;
      *"printenv CONTENT_FACTORY_RELEASE"*)
        cat "$state/container_marker"
        exit 0
        ;;
      *"ps --format"*)
        printf 'cf-next-app\\tUp 1 minute (healthy)\\n'
        exit 0
        ;;
    esac
    echo "stub: docker compose $*?" >&2
    exit 1
    ;;
esac

echo "stub: docker $*?" >&2
exit 1
`;

const REPOSITORY = 'ghcr.io/maslennikov-ig/content-factory-next';

/**
 * @param {object} [options]
 * @param {string[]} [options.images]        full image names present on the host
 * @param {string} [options.runningImage]    what the container reports it runs
 * @param {string} [options.containerMarker] CONTENT_FACTORY_RELEASE inside the container
 * @param {string} [options.health]          healthy | starting | unhealthy | missing
 * @param {string} [options.healthAfterUp]   what health becomes after `compose up`
 * @param {boolean} [options.containerKeepsOldEnvironment]
 * @param {string|null} [options.envFile]    contents of .env, null to omit the file
 * @param {string} [options.appEnvFile]      contents of app.env
 * @param {Array<[string, string]>} [options.imagesList] rows for `docker images`
 * @param {string[]} [options.extraFiles]    additional file names in the remote dir
 */
function createFakeHost(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-release-stub-'));
  const bin = path.join(dir, 'bin');
  const state = path.join(dir, 'state');
  const srv = path.join(dir, 'srv');
  fs.mkdirSync(bin);
  fs.mkdirSync(state);
  fs.mkdirSync(srv);

  fs.writeFileSync(path.join(bin, 'ssh'), SSH_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'docker'), DOCKER_STUB, { mode: 0o755 });

  const {
    images = [],
    runningImage = `${REPOSITORY}:old000000000a`,
    containerMarker = 'old000000000a',
    health = 'healthy',
    healthAfterUp = 'healthy',
    containerKeepsOldEnvironment = false,
    envFile = `CF_IMAGE="${REPOSITORY}:old000000000a"\nPOSTGRES_USER="cf"\n`,
    appEnvFile = 'DATABASE_URL="postgres://x"\nCONTENT_FACTORY_RELEASE="old000000000a"\n',
    imagesList = [],
    extraFiles = [],
  } = options;

  const write = (name, value) =>
    fs.writeFileSync(path.join(state, name), value);

  write('images', images.map((name) => `${name}\n`).join(''));
  write('running_image', `${runningImage}\n`);
  write('container_marker', `${containerMarker}\n`);
  write('health', `${health}\n`);
  write('health_after_up', `${healthAfterUp}\n`);
  write('rmi.log', '');
  write(
    'images_list',
    imagesList.map(([createdAt, tag]) => `${createdAt}\t${tag}\n`).join('')
  );
  if (containerKeepsOldEnvironment) {
    write('container_keeps_old_environment', '');
  }

  if (envFile !== null) {
    fs.writeFileSync(path.join(srv, '.env'), envFile, { mode: 0o600 });
  }
  fs.writeFileSync(path.join(srv, 'app.env'), appEnvFile, { mode: 0o600 });
  fs.writeFileSync(path.join(srv, 'docker-compose.yaml'), 'services: {}\n');
  for (const name of extraFiles) {
    fs.writeFileSync(path.join(srv, name), 'copy\n', { mode: 0o600 });
  }

  const readFile = (full) =>
    fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const lines = (value) => value.split('\n').filter(Boolean);

  return {
    dir,
    remoteDir: srv,
    /** Files the remote directory holds right now. */
    remoteFiles: () => fs.readdirSync(srv).sort(),
    remoteFile: (name) => readFile(path.join(srv, name)),
    /** Every image name `docker rmi` was asked to remove. */
    removed: () => lines(readFile(path.join(state, 'rmi.log'))),
    dockerCalls: () => lines(readFile(path.join(dir, 'docker.log'))),
    sshCalls: () => lines(readFile(path.join(dir, 'ssh.log'))),
    /**
     * Runs a release script against this host.
     * @returns {{status: number|null, stdout: string, stderr: string}}
     */
    run(script, args = [], env = {}) {
      const result = spawnSync(
        'bash',
        [path.join(repositoryRoot, script), ...args],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          timeout: 30000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            CF_STUB_DIR: dir,
            CF_DEPLOY_HOST: 'stub@fake-host',
            CF_REMOTE_DIR: srv,
            CF_HEALTH_TIMEOUT: '2',
            ...env,
          },
        }
      );
      return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      };
    },
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { createFakeHost, REPOSITORY };
