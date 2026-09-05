'use strict';

/**
 * `CONTENT_FACTORY_RELEASE` cannot be set by remembering to set it.
 *
 * It was wrong on 26.08, 01.09, 02.09 and 03.09.2026 — four releases, each
 * found afterwards, each recorded in `production-deploy.md` as its own
 * discovery. It is the most repeated defect in that document, and it is not a
 * cosmetic one: `initialize.sentry.ts` and the three frontend Sentry configs
 * pass it as `release`, so while it is stale every error report names a commit
 * that is not running. A stack trace against the wrong code is worse than no
 * marker at all, because someone believes it.
 *
 * The cause was always the same shape: the switch was two hand-typed `sed`
 * lines, and doing one of two things is what people do. So the fix is not a
 * louder line in the runbook — it is that both values come from one variable
 * in one script, and the script reads back what the CONTAINER actually runs
 * and refuses to call the release finished if they disagree.
 *
 * This guard RUNS the script. Until 05.09.2026 it read the script as text and
 * matched regular expressions against it, which the audit of 03.09 called what
 * it was: an `echo` with the right words satisfied it, a `sed` that edited
 * nothing satisfied it, and a `grep` re-reading the file the script had just
 * written satisfied it exactly as well as reading the container would. Three
 * of the four cases below — a tag that is not a tag, a `.env` with no
 * `CF_IMAGE=` line, a container that kept its old environment — passed the
 * text version of this file while the script was still wrong.
 *
 * `tests/helpers/release-host-stub.cjs` puts a fake `ssh` and a fake `docker`
 * first on `PATH` and gives the script a temporary directory to treat as
 * `/srv/content-factory-next`. Nothing here touches a real host.
 */

const fs = require('node:fs');
const path = require('node:path');

const { createFakeHost, REPOSITORY } = require('./helpers/release-host-stub.cjs');

const root = path.resolve(__dirname, '..');
const SCRIPT = 'scripts/release/switch-host-image.sh';
const RUNBOOK = 'docs/operations/production-deploy.md';

const TAG = 'abc123def456';
const IMAGE = `${REPOSITORY}:${TAG}`;

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** A host that is ready for the switch: the image is already pulled. */
const readyHost = (overrides = {}) =>
  createFakeHost({ images: [IMAGE], ...overrides });

let host = null;
afterEach(() => {
  if (host) host.cleanup();
  host = null;
});

test('the switch script exists and is executable', () => {
  const full = path.join(root, SCRIPT);
  expect(fs.existsSync(full)).toBe(true);
  // eslint-disable-next-line no-bitwise
  expect(fs.statSync(full).mode & 0o111).toBeGreaterThan(0);
});

describe('a finished switch leaves one string in all three places', () => {
  test('the run succeeds and both files carry the new tag', () => {
    host = readyHost();
    const result = host.run(SCRIPT, [TAG]);

    expect({ status: result.status, stderr: result.stderr }).toEqual({
      status: 0,
      stderr: '',
    });
    expect(host.remoteFile('.env')).toContain(`CF_IMAGE="${IMAGE}"`);
    expect(host.remoteFile('app.env')).toContain(
      `CONTENT_FACTORY_RELEASE="${TAG}"`
    );
  });

  test('the marker is read from the container, not from the file just written', () => {
    host = readyHost();
    host.run(SCRIPT, [TAG]);

    // The distinction is the whole defect: reading back your own edit proves
    // the edit, never the process serving requests.
    const askedTheContainer = host
      .dockerCalls()
      .some((call) => /compose exec .*cf-app printenv CONTENT_FACTORY_RELEASE/.test(call));
    expect(askedTheContainer).toBe(true);
  });

  test('a container still holding the old marker fails the release', () => {
    // Both files end up correct — this is exactly what 26.08, 01.09, 02.09 and
    // 03.09 looked like from the shell — but the running process, and so every
    // Sentry report, still names the previous commit.
    host = readyHost({
      containerKeepsOldEnvironment: true,
      runningImage: IMAGE,
      containerMarker: 'staleeee00000',
    });
    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('do not agree');
    expect(result.stderr).toContain('staleeee00000');
    expect(host.remoteFile('app.env')).toContain(
      `CONTENT_FACTORY_RELEASE="${TAG}"`
    );
  });

  test('a container running a different tag fails the release', () => {
    host = readyHost({
      containerKeepsOldEnvironment: true,
      runningImage: `${REPOSITORY}:other0000000`,
      containerMarker: TAG,
    });
    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('other0000000');
  });
});

describe('the switch refuses before it can do harm', () => {
  test.each([
    // The substitution is aimed at the stub's own directory on purpose. Before
    // 05.09.2026 this tag really did create that file: the tag reached the
    // remote shell inside `docker image inspect …:${tag}`, and a shell expands
    // what it is given. Aiming it anywhere else would have made this file a
    // test that damages the machine it runs on when the fix is reverted.
    ['a command substitution', 'abc$(touch $CF_STUB_DIR/injected)'],
    ['a semicolon', 'abc123def456; rm -rf /srv'],
    ['a quote', 'abc123"def456'],
    ['a slash', 'ghcr.io/other/image:tag'],
    ['a backtick', 'abc`id`'],
    ['a leading dash', '--force'],
  ])('%s in the tag stops the script before any ssh', (_name, badTag) => {
    host = readyHost();
    const result = host.run(SCRIPT, [badTag]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Refusing the tag');
    // Nothing reached the host at all: the check is local, before `run()`.
    expect(host.sshCalls()).toEqual([]);
    expect(fs.existsSync(path.join(host.dir, 'injected'))).toBe(false);
  });

  test('an image the host does not have stops the switch', () => {
    // `pull-image-on-host.sh` proved the digest. Switching to a tag nobody
    // pulled would skip that proof.
    host = createFakeHost({ images: [] });
    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has no');
    expect(host.dockerCalls().join('\n')).not.toContain('up -d cf-app');
  });

  test('a `.env` without a CF_IMAGE line stops the switch instead of editing nothing', () => {
    // `sed` on a pattern that matches no line succeeds and says nothing. The
    // switch would then report the new tag while the old image kept running.
    host = readyHost({ envFile: 'POSTGRES_USER="cf"\n' });
    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No CF_IMAGE= line');
    expect(host.dockerCalls().join('\n')).not.toContain('up -d cf-app');
  });

  test('success is health, not "Started"', () => {
    host = readyHost({ healthAfterUp: 'starting' });
    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cf-next-app is 'starting'");
  }, 30000);

  test('a missing tag argument is a usage error', () => {
    host = readyHost();
    const result = host.run(SCRIPT, []);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage:');
    expect(host.sshCalls()).toEqual([]);
  });
});

describe('the states a second run must not destroy', () => {
  test('an existing backup is never overwritten', () => {
    // A second run of the same release must not replace the state the first
    // run would be rolled back to.
    host = readyHost({ extraFiles: [`.env.bak-before-${TAG}`] });
    fs.writeFileSync(
      path.join(host.remoteDir, `.env.bak-before-${TAG}`),
      'CF_IMAGE="the state a rollback would restore"\n'
    );

    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).toBe(0);
    expect(host.remoteFile(`.env.bak-before-${TAG}`)).toBe(
      'CF_IMAGE="the state a rollback would restore"\n'
    );
  });

  test('a first run leaves a copy of both files', () => {
    host = readyHost();
    host.run(SCRIPT, [TAG]);

    expect(host.remoteFiles()).toEqual(
      expect.arrayContaining([`.env.bak-before-${TAG}`, `app.env.bak-before-${TAG}`])
    );
  });

  test('a marker the file does not carry yet is appended', () => {
    host = readyHost({ appEnvFile: 'DATABASE_URL="postgres://x"\n' });
    const result = host.run(SCRIPT, [TAG]);

    expect(result.status).toBe(0);
    expect(host.remoteFile('app.env')).toContain(
      `CONTENT_FACTORY_RELEASE="${TAG}"`
    );
  });
});

describe('what the repository must not carry', () => {
  test('the host is never named in this repository', () => {
    const script = read(SCRIPT);
    expect(script).toContain('CF_DEPLOY_HOST');
    expect(script).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(script).not.toContain('factory.aidevteam.ru');
  });
});

describe('the runbook sends a reader to the script, not to two sed lines', () => {
  const runbook = read(RUNBOOK);

  test('the switch step names the script', () => {
    expect(runbook).toContain('switch-host-image.sh');
  });

  test('the hand-typed marker edit is gone from the instructions', () => {
    // The four incidents all came from this line being a separate thing to
    // remember. It may still appear in the historical entries that record
    // them, but not as an instruction.
    const instructionsAt = runbook.indexOf('## Обновление версии');
    const historyAt = runbook.indexOf('### После переключения');
    const instructions = runbook.slice(instructionsAt, historyAt);
    expect(instructions).not.toMatch(/sed -i 's\|\^CONTENT_FACTORY_RELEASE=/);
  });
});
