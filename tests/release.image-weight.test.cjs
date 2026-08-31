const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const weightScript = path.join(root, 'scripts/release/check-image-weight.sh');
const pushScript = path.join(root, 'scripts/release/push-image.sh');
const pullScript = path.join(root, 'scripts/release/pull-image-on-host.sh');

/**
 * The weight gate is the only guard in the release order that does not know
 * what it is looking for. On 30.08.2026 thirteen published tags carried
 * personal source texts and a Python environment with model weights; every
 * named guard passed, and the sole difference between a poisoned tag and a
 * healthy one was 1.79 GB compressed against 0.73 GB.
 *
 * So the thing worth testing is the decision, not the plumbing: at which ratio
 * does the script let a release through and at which does it stop it. That runs
 * here against a stub `docker` on the child's PATH — no daemon, no registry, no
 * network, and no dependency on which sizes this machine's images happen to
 * have today.
 */
let workspace = null;
try {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-image-weight-'));
} catch {
  // A sandbox with no writable temp directory cannot host this suite. That says
  // nothing about the script, so skip rather than fail.
  workspace = null;
}

// Answers exactly the two calls the script makes and refuses anything else
// loudly, so a new docker call in the script cannot be silently absorbed here.
// Sizes come from CF_STUB_SIZE_<tag>; a tag with no size is an image this stub
// does not have, which is how "not on this machine" is expressed.
const DOCKER_STUB = `#!/usr/bin/env bash
set -Eeuo pipefail

size_for() {
  local key="CF_STUB_SIZE_$1"
  printf '%s' "\${!key:-}"
}

case "\${1:-} \${2:-}" in
  'image inspect')
    tag="\${3##*:}"
    size="$(size_for "$tag")"
    if [ -z "$size" ]; then
      printf 'Error: No such image: %s\\n' "\${3}" >&2
      exit 1
    fi
    printf '%s\\n' "$size"
    exit 0
    ;;
  'images '*)
    printf '%s\\n' "\${CF_STUB_LOCAL_IMAGES:-}"
    exit 0
    ;;
  'login '*)
    cat >/dev/null
    printf 'logged-in\\n' >"\${CF_STUB_LOGIN_MARK:-/dev/null}"
    exit 0
    ;;
  'manifest inspect')
    tag="\${4##*:}"
    size="$(size_for "$tag")"
    if [ -z "$size" ]; then
      printf 'no such manifest: %s\\n' "\${4}" >&2
      exit 1
    fi
    # The package is private: without a credential the registry answers
    # unauthorized, exactly as ghcr.io does.
    if [ -n "\${CF_STUB_REQUIRE_LOGIN:-}" ] && [ ! -s "\${CF_STUB_LOGIN_MARK:-/nonexistent}" ]; then
      printf 'unauthorized\\n' >&2
      exit 1
    fi
    # The shape the script reads: a list of platform entries, each carrying its
    # platform manifest base64-encoded in Raw. One real platform and one
    # attestation entry with no architecture, exactly as ghcr.io returns.
    raw="$(printf '{"config":{"size":10000},"layers":[{"size":%s}]}' "$((size - 10000))" | base64 -w0)"
    printf '[{"Descriptor":{"platform":{"architecture":"amd64","os":"linux"}},"Raw":"%s"},' "$raw"
    printf '{"Descriptor":{"platform":{"architecture":"unknown","os":"unknown"}},"Raw":"%s"}]\\n' "$raw"
    exit 0
    ;;
esac

printf 'stub docker: unexpected command %s\\n' "$*" >&2
exit 127
`;

// Two jobs. `gh api` lists registry versions and is refused here, so a case
// that names its previous tag never reaches the network. `gh auth token` hands
// over the credential the private registry needs, and only when a case asks for
// one — otherwise the script must cope with having none.
const GH_STUB = `#!/usr/bin/env bash
if [ "\${1:-}" = 'auth' ] && [ "\${2:-}" = 'token' ] && [ -n "\${CF_STUB_GH_TOKEN:-}" ]; then
  printf '%s' "$CF_STUB_GH_TOKEN"
  exit 0
fi
exit 1
`;

const HEALTHY = 740_000_000;

let stubBin;

/** One run of the weight script with a stubbed docker and named sizes. */
function runWeight(mode, tag, previousTag, sizes, extraEnv = {}) {
  const sizeEnv = {};
  for (const [name, bytes] of Object.entries(sizes)) {
    sizeEnv[`CF_STUB_SIZE_${name}`] = String(bytes);
  }

  return spawnSync('bash', [weightScript, mode, tag, ...(previousTag ? [previousTag] : [])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // Scoped to this child only; nothing is exported into the test process.
      PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
      ...sizeEnv,
      ...extraEnv,
    },
  });
}

const describeIfWritable = workspace ? describe : describe.skip;

describeIfWritable('the release weight gate, executed against a stub docker', () => {
  beforeAll(() => {
    stubBin = path.join(workspace, 'bin');
    fs.mkdirSync(stubBin, { recursive: true });
    fs.writeFileSync(path.join(stubBin, 'docker'), DOCKER_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(stubBin, 'gh'), GH_STUB, { mode: 0o755 });
  });

  afterAll(() => {
    if (workspace) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('the harness reaches the real script: an unknown mode is refused', () => {
    const result = runWeight('sideways', 'new', 'old', {});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown mode 'sideways'");
  });

  test.each(['local', 'registry'])(
    '%s mode passes a release of the same weight as the one before it',
    (mode) => {
      const result = runWeight(mode, 'new', 'old', { new: HEALTHY, old: HEALTHY });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('в допуске');
    }
  );

  test.each(['local', 'registry'])('%s mode refuses the shape of the 30.08 incident', (mode) => {
    // 1.79 GB against 0.73 GB: the one signal that separated the thirteen
    // poisoned tags from the healthy ones.
    const result = runWeight(mode, 'new', 'old', { new: 1_790_000_000, old: 730_000_000 });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REFUSING');
    expect(result.stderr).toContain('145% heavier');
    expect(result.stderr).toContain('Something entered the build context');
  });

  test('growth right at the allowance passes and one byte over it does not', () => {
    const previous = 1_000_000_000;

    const atLimit = runWeight('registry', 'new', 'old', { new: 1_250_000_000, old: previous });
    expect(atLimit.status).toBe(0);
    expect(atLimit.stdout).toContain('в допуске');

    const overLimit = runWeight('registry', 'new', 'old', { new: 1_250_000_001, old: previous });
    expect(overLimit.status).toBe(1);
    expect(overLimit.stderr).toContain('REFUSING');
  });

  test('the allowance is configurable and a tighter one catches a smaller growth', () => {
    const sizes = { new: 800_000_000, old: 740_000_000 };

    expect(runWeight('registry', 'new', 'old', sizes).status).toBe(0);
    expect(
      runWeight('registry', 'new', 'old', sizes, { CF_IMAGE_WEIGHT_MAX_GROWTH: '5' }).status
    ).toBe(1);
  });

  test('a lighter release is not treated as a problem', () => {
    const result = runWeight('registry', 'new', 'old', { new: 500_000_000, old: HEALTHY });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('в допуске');
  });

  test('local mode steps aside when the previous image is not on this machine', () => {
    const result = runWeight('local', 'new', 'old', { new: HEALTHY });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('is not on this machine');
    expect(result.stdout).toContain('registry check after the push still covers');
  });

  test('registry mode does not step aside: an unreadable previous manifest stops the release', () => {
    const result = runWeight('registry', 'new', 'old', { new: HEALTHY });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nothing to compare against');
  });

  test('a missing new image stops the release in either mode rather than passing', () => {
    expect(runWeight('local', 'new', 'old', { old: HEALTHY }).status).toBe(1);
    expect(runWeight('registry', 'new', 'old', { old: HEALTHY }).status).toBe(1);
  });

  test('with no tag named, local mode takes the newest other image on the machine', () => {
    const result = runWeight(
      'local',
      'new',
      null,
      { new: 1_790_000_000, older: 730_000_000, oldest: 1_780_000_000 },
      {
        CF_STUB_LOCAL_IMAGES: [
          '2026-08-30 13:35:05 +0300 MSK|new',
          '2026-08-29 18:45:41 +0300 MSK|older',
          '2026-08-24 09:06:55 +0300 MSK|oldest',
          '2026-08-23 08:46:05 +0300 MSK|<none>',
        ].join('\n'),
      }
    );

    // `older`, not `oldest`: comparing against the wrong end of the history
    // would have let the incident through, since the tag before it was poisoned
    // too.
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('older');
    expect(result.stdout).not.toContain('oldest');
  });

  test('a pass with nothing to compare against says which reason it passed for', () => {
    // Registry mode reaches this when gh cannot name an earlier version, which
    // is a check that did not run and must not read as a check that succeeded.
    const registry = runWeight('registry', 'new', null, { new: HEALTHY });
    expect(registry.status).toBe(0);
    expect(registry.stdout).toContain('nothing to compare');
    expect(registry.stdout).toContain('registry did not name an earlier version');
    expect(registry.stdout).not.toContain('в допуске');

    const local = runWeight('local', 'new', null, { new: HEALTHY }, { CF_STUB_LOCAL_IMAGES: '' });
    expect(local.status).toBe(0);
    expect(local.stdout).toContain('No other image of this repository on this machine');
  });

  test('the private registry is read by logging in when the ambient config cannot', () => {
    // The package is private. Run standalone — from the runbook, or from
    // pull-image-on-host.sh — the script starts with whatever credential the
    // operator happens to have, which may be none.
    const loginMark = path.join(workspace, 'login-mark');
    fs.rmSync(loginMark, { force: true });

    const result = runWeight('registry', 'new', 'old', { new: HEALTHY, old: HEALTHY }, {
      CF_STUB_REQUIRE_LOGIN: '1',
      CF_STUB_LOGIN_MARK: loginMark,
      CF_STUB_GH_TOKEN: 'stub-token',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('в допуске');
    expect(fs.readFileSync(loginMark, 'utf8')).toContain('logged-in');
  });

  test('with no credential to be had, the check fails rather than passing blindly', () => {
    const result = runWeight('registry', 'new', 'old', { new: HEALTHY, old: HEALTHY }, {
      CF_STUB_REQUIRE_LOGIN: '1',
      CF_STUB_LOGIN_MARK: path.join(workspace, 'never-written'),
      CF_REGISTRY_TOKEN: '',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('в допуске');
  });

  test('a refused registry check says how to remove the tag it just found', () => {
    const result = runWeight('registry', 'new', 'old', { new: 1_790_000_000, old: 730_000_000 });

    expect(result.stderr).toContain('The tag is already in the registry');
    expect(result.stderr).toContain('gh api -X DELETE');
  });
});

describe('the release order calls the weight gate', () => {
  // Reading the scripts as text, not running them: these two talk to a registry
  // and to the production host, and neither belongs in a test run. What matters
  // here is only that the gate is wired in and wired in before the step it is
  // meant to stop.
  const push = fs.readFileSync(pushScript, 'utf8');
  const pull = fs.readFileSync(pullScript, 'utf8');

  // The call is quoted for the script directory, so match the invocation rather
  // than one spelling of it.
  const callTo = (mode) => new RegExp(`check-image-weight\\.sh"?\\s+${mode}\\b`);

  test('push-image.sh weighs the image locally before it uploads anything', () => {
    const check = push.search(callTo('local'));
    const upload = push.indexOf('docker push');

    expect(check).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(check);
  });

  test('push-image.sh weighs the published tag before it hands it to the host', () => {
    const check = push.search(callTo('registry'));
    // The last mention: the header names the next script too, and that comment
    // is not the handover.
    const handover = push.lastIndexOf('pull-image-on-host.sh');

    expect(check).toBeGreaterThan(-1);
    expect(handover).toBeGreaterThan(check);
  });

  test('push-image.sh weighs the tag while it still holds the credential', () => {
    // The package is private, so reading a manifest needs the login this script
    // is holding. Placed after `docker logout` the gate reads `unauthorized` and
    // fails on every release — a check that goes red for a reason that has
    // nothing to do with what it guards is worse than no check.
    const check = push.search(callTo('registry'));
    const logout = push.indexOf('docker logout');

    expect(check).toBeGreaterThan(-1);
    expect(logout).toBeGreaterThan(check);
  });

  test('pull-image-on-host.sh weighs the tag before the host pulls it', () => {
    const check = pull.search(callTo('registry'));
    const ssh = pull.indexOf('ssh "$deploy_host"');

    expect(check).toBeGreaterThan(-1);
    expect(ssh).toBeGreaterThan(check);
  });

  test('both call sites run the gate unguarded, so a refusal ends the release', () => {
    // `set -e` is what turns a non-zero gate into a stopped release. A call
    // written as `... || true`, or inside an `if`, would report the problem and
    // carry on regardless.
    for (const [name, text] of [
      ['push-image.sh', push],
      ['pull-image-on-host.sh', pull],
    ]) {
      expect(text).toContain('set -euo pipefail');
      for (const line of text.split('\n')) {
        if (!line.includes('check-image-weight.sh')) continue;
        if (line.trim().startsWith('#')) continue;
        expect(`${name}: ${line}`).toEqual(expect.not.stringContaining('||'));
        expect(`${name}: ${line}`).toEqual(expect.not.stringContaining('if '));
      }
    }
  });
});
