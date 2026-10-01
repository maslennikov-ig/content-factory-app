const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pullScript = path.join(root, 'scripts/release/pull-image-on-host.sh');
const measureScript = path.join(
  root,
  'scripts/release/measure-image-unpacked.py'
);
const digest = `sha256:${'a'.repeat(64)}`;
const workspaces = [];

function executable(filename, source) {
  fs.writeFileSync(filename, source, { mode: 0o700 });
}

function sandbox(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-pull-capacity-'));
  workspaces.push(directory);
  const bin = path.join(directory, 'bin');
  const scripts = path.join(directory, 'release');
  const dockerRoot = path.join(directory, 'Docker root');
  fs.mkdirSync(bin);
  fs.mkdirSync(scripts);
  fs.mkdirSync(dockerRoot);
  fs.copyFileSync(pullScript, path.join(scripts, 'pull-image-on-host.sh'));
  if (fs.existsSync(measureScript)) {
    fs.copyFileSync(
      measureScript,
      path.join(scripts, path.basename(measureScript))
    );
  }
  const events = path.join(directory, 'events');
  executable(
    path.join(scripts, 'check-image-weight.sh'),
    '#!/bin/bash\nset -eu\nprintf "weight\\n" >>"$CF_TEST_EVENTS"\n'
  );
  executable(
    path.join(bin, 'ssh'),
    `#!/bin/bash
set -eu
printf 'ssh\n' >>"$CF_TEST_EVENTS"
if [ "\${CF_TEST_SSH_FAILURE:-}" = 1 ]; then exit 42; fi
while [ "\${1:-}" = -o ]; do shift 2; done
[ "$1" = fixture.invalid ] || exit 93
shift
[ "$#" = 1 ] || exit 94
exec bash -c "$1"
`
  );
  executable(
    path.join(bin, 'docker'),
    `#!/bin/bash
set -eu
case "\${1:-} \${2:-}" in
  'info --format')
    if [ "$3" = '{{.DockerRootDir}}' ]; then
      printf 'info\n' >>"$CF_TEST_EVENTS"
      printf '%s\n' "$CF_TEST_DOCKER_ROOT"
    elif [ "$3" = '{{.Driver}}' ]; then
      printf 'driver\n' >>"$CF_TEST_EVENTS"
      if [ "\${CF_TEST_DRIVER_FAILURE:-}" = 1 ]; then
        printf '%s\n' "\${CF_TEST_DRIVER_PARTIAL:-}"
        exit 44
      fi
      driver="$CF_TEST_DOCKER_DRIVER"
      if [ -f "$CF_TEST_DF_COUNT" ] && [ "\${CF_TEST_LATER_DRIVER:-}" != '' ]; then driver="$CF_TEST_LATER_DRIVER"; fi
      printf '%s\n' "$driver"
    else
      exit 99
    fi
    ;;
  'login ghcr.io')
    cat >/dev/null
    printf 'login\n' >>"$CF_TEST_EVENTS"
    ;;
  'pull ghcr.io/maslennikov-ig/content-factory-next:candidate')
    printf 'pull\n' >>"$CF_TEST_EVENTS"
    ;;
  'logout ghcr.io')
    printf 'logout\n' >>"$CF_TEST_EVENTS"
    ;;
  'image inspect')
    if [ "$3" = ghcr.io/maslennikov-ig/content-factory-next:candidate ] && [ "\${4:-}" = --format ] && [[ "$5" == *RepoDigests* ]]; then
      printf 'HOST_DIGEST=ghcr.io/maslennikov-ig/content-factory-next@${digest}\n'
    elif [ "$3" = ghcr.io/maslennikov-ig/content-factory-next:candidate ] && [ "\${4:-}" = --format ] && [[ "$5" == *HOST_IMAGE_ID* ]]; then
      printf 'HOST_IMAGE_ID=sha256:fixture\n'
    elif [ "\${4:-}" = --format ] && [[ "$5" == *RootFS.Layers* ]]; then
      printf '%s\n' "$CF_TEST_DIFF_IDS"
    elif [ "\${CF_TEST_LOCAL_ID:-}" != '' ]; then
      printf '%s\n' "$CF_TEST_LOCAL_ID"
    else
      exit 1
    fi
    ;;
  'image save')
    [ "$3" = "$CF_TEST_LOCAL_ID" ] || exit 95
    printf 'save\n' >>"$CF_TEST_EVENTS"
    cat "$CF_TEST_ARCHIVE"
    exit "\${CF_TEST_SAVE_EXIT:-0}"
    ;;
  *) printf 'Unexpected docker command: %s\n' "$*" >&2; exit 96 ;;
esac
`
  );
  executable(
    path.join(bin, 'df'),
    `#!/bin/bash
set -eu
# This is the real GNU shape: --output selects inode fields WITHOUT -i.
[ "$#" = 3 ] && [ "$1" = -B1 ] && [ "$2" = --output=avail,iavail ] && [ "$3" = "$CF_TEST_DOCKER_ROOT" ] || exit 97
printf 'df\n' >>"$CF_TEST_EVENTS"
if [ "\${CF_TEST_DF_FAILURE:-}" = 1 ]; then exit 43; fi
count=0
if [ -f "$CF_TEST_DF_COUNT" ]; then count=$(cat "$CF_TEST_DF_COUNT"); fi
count=$((count + 1)); printf '%s' "$count" >"$CF_TEST_DF_COUNT"
available="$CF_TEST_AVAILABLE_BYTES"
if [ "$count" -gt 1 ] && [ "\${CF_TEST_LATER_BYTES:-}" != '' ]; then available="$CF_TEST_LATER_BYTES"; fi
printf '       Avail    IFree\n%s %s\n' "$available" "$CF_TEST_AVAILABLE_INODES"
`
  );
  executable(
    path.join(bin, 'stat'),
    `#!/bin/bash
set -eu
[ "$#" = 4 ] && [ "$1" = -f ] && [ "$2" = -c ] && [ "$3" = %S ] && [ "$4" = "$CF_TEST_DOCKER_ROOT" ] || exit 98
printf '%s\n' "$CF_TEST_BLOCK_BYTES"
`
  );
  const environment = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CF_DEPLOY_HOST: 'fixture.invalid',
    CF_REGISTRY_TOKEN: 'synthetic-fixture-token',
    CF_PULL_UNPACKED_BYTES: '1000000000',
    CF_PULL_UNPACKED_ENTRIES: '1000',
    CF_TEST_EVENTS: events,
    CF_TEST_DF_COUNT: path.join(directory, 'df-count'),
    CF_TEST_DOCKER_ROOT: dockerRoot,
    CF_TEST_DOCKER_DRIVER: 'overlay2',
    CF_TEST_AVAILABLE_BYTES: '12000000000',
    CF_TEST_AVAILABLE_INODES: '100000',
    CF_TEST_BLOCK_BYTES: '4096',
    ...overrides,
  };
  if (!Object.hasOwn(overrides, 'CF_PULL_DOWNLOAD_BYTES')) {
    delete environment.CF_PULL_DOWNLOAD_BYTES;
  }
  function run() {
    const result = spawnSync(
      'bash',
      [path.join(scripts, 'pull-image-on-host.sh'), 'candidate', digest],
      { env: environment, encoding: 'utf8', timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    return {
      ...result,
      events: fs.existsSync(events)
        ? fs.readFileSync(events, 'utf8').trim().split('\n')
        : [],
    };
  }
  return { directory, environment, run };
}

afterAll(() => {
  for (const directory of workspaces) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function rejectedBeforeCredentials(result) {
  expect(result.status).not.toBe(0);
  expect(result.events).not.toContain('weight');
  expect(result.events).not.toContain('login');
  expect(result.events).not.toContain('pull');
}

describe('the real pull script refuses unsafe host capacity before credentials', () => {
  test.each([
    ['below the operating floor', { CF_TEST_AVAILABLE_BYTES: '5999999999' }],
    ['unsafe projected after pull', { CF_TEST_AVAILABLE_BYTES: '9000000000' }],
    ['unknown bytes', { CF_TEST_AVAILABLE_BYTES: '-' }],
    ['unknown inodes', { CF_TEST_AVAILABLE_INODES: '-' }],
    ['insufficient inodes', { CF_TEST_AVAILABLE_INODES: '11999' }],
    ['failed filesystem probe', { CF_TEST_DF_FAILURE: '1' }],
    ['failed SSH probe', { CF_TEST_SSH_FAILURE: '1' }],
    ['missing DockerRootDir', { CF_TEST_DOCKER_ROOT: '' }],
    ['unknown block allocation', { CF_TEST_BLOCK_BYTES: '0' }],
    [
      'larger actual filesystem blocks',
      {
        CF_TEST_BLOCK_BYTES: '65536',
        CF_TEST_AVAILABLE_BYTES: '9050000000',
      },
    ],
  ])('%s', (_label, overrides) => {
    rejectedBeforeCredentials(sandbox(overrides).run());
  });

  test.each(['0', '-1', '1.5', '1e9', '1000000000001', '1$(false)'])(
    'rejects invalid caller-supplied bytes %s',
    (value) => {
      rejectedBeforeCredentials(
        sandbox({ CF_PULL_UNPACKED_BYTES: value }).run()
      );
    }
  );

  test.each(['0', '-1', '1.5', '10000001'])(
    'rejects invalid caller-supplied entries %s',
    (value) => {
      rejectedBeforeCredentials(
        sandbox({ CF_PULL_UNPACKED_ENTRIES: value }).run()
      );
    }
  );

  test('a partial supplied measurement cannot fall back to an unrelated local estimate', () => {
    rejectedBeforeCredentials(sandbox({ CF_PULL_UNPACKED_ENTRIES: '' }).run());
  });

  test('no supplied measurement and no own local image is an explicit refusal', () => {
    const result = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    }).run();
    rejectedBeforeCredentials(result);
  });

  test('the exact required bytes/inodes are accepted, with a second pre-login read', () => {
    const result = sandbox({
      CF_TEST_AVAILABLE_BYTES: '9008192000',
      CF_TEST_AVAILABLE_INODES: '12000',
    }).run();
    expect(result.status).toBe(0);
    expect(result.events.filter((event) => event === 'df')).toHaveLength(2);
    expect(result.events.indexOf('df')).toBeLessThan(
      result.events.indexOf('weight')
    );
    expect(result.events.indexOf('weight')).toBeLessThan(
      result.events.indexOf('login')
    );
    expect(result.events).toContain('pull');
    expect(result.stdout).toContain('matches the pushed digest');
    expect(result.stdout).toContain('required_bytes=9008192000');
    expect(result.stdout).toContain('required_inodes=12000');
    expect(result.stdout).toContain('capacity_model=conservative');
  });

  test('space lost during the registry weight gate is rechecked before host login', () => {
    const result = sandbox({ CF_TEST_LATER_BYTES: '9000000000' }).run();
    expect(result.status).not.toBe(0);
    expect(result.events).toContain('weight');
    expect(result.events.filter((event) => event === 'df')).toHaveLength(2);
    expect(result.events).not.toContain('login');
    expect(result.events).not.toContain('pull');
  });
});

describe('verified stored-layer bytes refine only the observed overlay2 budget', () => {
  test('the exact combined budget accepts without lowering the operating/transient floors', () => {
    const result = sandbox({
      CF_PULL_DOWNLOAD_BYTES: '250000000',
      CF_TEST_AVAILABLE_BYTES: '8504096000',
      CF_TEST_AVAILABLE_INODES: '12000',
    }).run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('download_bytes=250000000');
    expect(result.stdout).toContain('required_bytes=8504096000');
    expect(result.stdout).toContain('required_inodes=12000');
    expect(result.stdout).toContain(
      'capacity_model=overlay2-verified-download'
    );
    expect(result.events.filter((event) => event === 'driver')).toHaveLength(2);
    expect(result.events).toContain('pull');
  });

  test.each([
    ['below operating floor', { CF_TEST_AVAILABLE_BYTES: '5999999999' }],
    ['below combined budget', { CF_TEST_AVAILABLE_BYTES: '8504095999' }],
    ['insufficient inodes', { CF_TEST_AVAILABLE_INODES: '11999' }],
    ['unknown bytes', { CF_TEST_AVAILABLE_BYTES: '-' }],
    ['unknown inodes', { CF_TEST_AVAILABLE_INODES: '-' }],
    [
      'larger actual allocation',
      { CF_TEST_BLOCK_BYTES: '65536', CF_TEST_AVAILABLE_BYTES: '8504096000' },
    ],
  ])('%s refuses before credentials', (_label, overrides) => {
    rejectedBeforeCredentials(
      sandbox({ CF_PULL_DOWNLOAD_BYTES: '250000000', ...overrides }).run()
    );
  });

  test.each(['', '0', '01', '-1', '1.5', '1e9', '1000000000001', '1$(false)'])(
    'invalid supplied download bytes %s refuse before credentials',
    (value) => {
      rejectedBeforeCredentials(
        sandbox({ CF_PULL_DOWNLOAD_BYTES: value }).run()
      );
    }
  );

  test('download bytes alone cannot silently combine with another measurement', () => {
    const result = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
      CF_PULL_DOWNLOAD_BYTES: '250000000',
    }).run();
    rejectedBeforeCredentials(result);
    expect(result.stderr).toContain('Supply both bounded positive');
  });

  test.each(['', 'overlayfs', 'btrfs', 'unknown'])(
    'the %s driver retains the conservative budget',
    (driver) => {
      const result = sandbox({
        CF_PULL_DOWNLOAD_BYTES: '250000000',
        CF_TEST_DOCKER_DRIVER: driver,
        CF_TEST_AVAILABLE_BYTES: '8504096000',
      }).run();
      rejectedBeforeCredentials(result);
      expect(result.stdout).toContain('required_bytes=9008192000');
      expect(result.stdout).toContain('capacity_model=conservative');
    }
  );

  test('failed driver discovery can use sufficient conservative headroom', () => {
    const result = sandbox({
      CF_PULL_DOWNLOAD_BYTES: '250000000',
      CF_TEST_DRIVER_FAILURE: '1',
      CF_TEST_AVAILABLE_BYTES: '9008192000',
      CF_TEST_AVAILABLE_INODES: '12000',
    }).run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('capacity_model=conservative');
    expect(result.events.filter((event) => event === 'driver')).toHaveLength(2);
  });

  test('partial driver stdout from a failed read never earns overlay2 credit', () => {
    const result = sandbox({
      CF_PULL_DOWNLOAD_BYTES: '250000000',
      CF_TEST_DRIVER_FAILURE: '1',
      CF_TEST_DRIVER_PARTIAL: 'overlay2',
      CF_TEST_AVAILABLE_BYTES: '8504096000',
    }).run();
    rejectedBeforeCredentials(result);
    expect(result.stdout).toContain('required_bytes=9008192000');
    expect(result.stdout).toContain('capacity_model=conservative');
  });

  test('a changed driver is rechecked before host login', () => {
    const result = sandbox({
      CF_PULL_DOWNLOAD_BYTES: '250000000',
      CF_TEST_LATER_DRIVER: 'overlayfs',
      CF_TEST_AVAILABLE_BYTES: '8504096000',
    }).run();
    expect(result.status).not.toBe(0);
    expect(result.events).toContain('weight');
    expect(result.events.filter((event) => event === 'driver')).toHaveLength(2);
    expect(result.events).not.toContain('login');
    expect(result.events).not.toContain('pull');
  });
});

// A genuine Docker-save-shaped tar containing nested layer tars, produced by
// Python's standard tar writer. No daemon, container, registry or network.
function archiveFixture(directory, variant = 'valid') {
  const filename = path.join(directory, `${variant}.tar`);
  const made = spawnSync(
    'python3',
    [
      '-c',
      `
import gzip, hashlib, io, json, sys, tarfile
filename, variant = sys.argv[1:]
layers=[]
compressions=(False,) if variant=='raw-only' else (True,) if variant=='gzip-only' else (False, True)
for compressed in compressions:
    output=io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as archive:
        roots={'root-dir':'.', 'root-slash-dir':'./', 'root-file':'.',
               'root-slash-file':'./', 'root-symlink':'.', 'root-nonempty-dir':'.',
               'traversal-dir':'../', 'traversal-file':'../escape',
               'root-bad-gzip-trailer':'.'}
        if variant in roots:
            entry=tarfile.TarInfo(roots[variant])
            entry.type=tarfile.DIRTYPE
            data=b''
            if variant in ('root-file', 'root-slash-file', 'traversal-file'):
                entry.type=tarfile.REGTYPE; data=b'x'
            elif variant=='root-symlink':
                entry.type=tarfile.SYMTYPE; entry.linkname='usr'
            elif variant=='root-nonempty-dir': data=b'x'
            entry.size=len(data); archive.addfile(entry, io.BytesIO(data))
        entry=tarfile.TarInfo('usr/share/fixture/data'); data=(b'b' if compressed else b'a')*5000
        entry.size=len(data); archive.addfile(entry, io.BytesIO(data))
        link=tarfile.TarInfo('usr/share/fixture/link'); link.type=tarfile.SYMTYPE
        link.linkname='data'; archive.addfile(link)
    raw=output.getvalue()
    stored=gzip.compress(raw) if compressed else raw
    if compressed and variant=='root-bad-gzip-trailer': stored=stored[:-8]+bytes(8)
    name='blobs/sha256/'+hashlib.sha256(stored).hexdigest()
    if variant=='classic': name=hashlib.sha256(stored).hexdigest()+'/layer.tar'
    layers.append((name, raw, stored))
config=json.dumps({'rootfs':{'type':'layers','diff_ids':[
    'sha256:'+hashlib.sha256(raw).hexdigest() for _,raw,_ in layers
]}}).encode()
config_sha=hashlib.sha256(config).hexdigest()
config_name='blobs/sha256/'+config_sha
if variant=='classic': config_name=config_sha+'.json'
manifest=[{'Config':config_name,'RepoTags':['content-factory-next:candidate'],
           'Layers':[name for name,_,_ in layers]}]
if variant=='missing': manifest[0]['Layers'].append('missing/layer.tar')
if variant=='mismatch': manifest[0]['Config']='missing-config.json'
if variant=='multiple': manifest.append(manifest[0])
if variant=='bad-diff-id':
    config=json.dumps({'rootfs':{'diff_ids':['sha256:'+'b'*64 for _ in layers]}}).encode()
    config_sha=hashlib.sha256(config).hexdigest()
    config_name='blobs/sha256/'+config_sha
    manifest[0]['Config']=config_name
if variant=='corrupt-config': config+=b' '
with tarfile.open(filename, 'w') as archive:
    if variant in ('root-dir', 'root-slash-dir', 'root-bad-gzip-trailer',
                   'outer-root-file', 'outer-traversal-dir'):
        name='./' if variant=='root-slash-dir' else '.'
        if variant=='outer-traversal-dir': name='../'
        entry=tarfile.TarInfo(name); entry.type=tarfile.DIRTYPE
        data=b''
        if variant=='outer-root-file': entry.type=tarfile.REGTYPE; data=b'x'
        entry.size=len(data); archive.addfile(entry, io.BytesIO(data))
    for name,_,stored in layers:
        entry=tarfile.TarInfo(name); entry.size=len(stored)
        archive.addfile(entry, io.BytesIO(stored))
    for name,data in ((config_name,config),('manifest.json',json.dumps(manifest).encode())):
        entry=tarfile.TarInfo(name); entry.size=len(data)
        archive.addfile(entry, io.BytesIO(data))
if variant=='truncated':
    with open(filename,'r+b') as output: output.truncate(3000)
print(json.dumps({'config_sha':config_sha, 'diff_ids':json.loads(config)['rootfs']['diff_ids'], 'bytes':sum(len(raw) for _,raw,_ in layers),
                  'entries':(6 if variant in ('root-dir', 'root-slash-dir') else 5)*len(layers),
                  'stored_bytes':sum(len(stored) for _,_,stored in layers)}))
`,
      filename,
      variant,
    ],
    { encoding: 'utf8', timeout: 5000 }
  );
  expect(made.status).toBe(0);
  return { filename, ...JSON.parse(made.stdout) };
}

describe('streamed own-image measurement', () => {
  test('auto gzip stored bytes retain the conservative budget without verified published compression', () => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    });
    const archive = archiveFixture(fixture.directory, 'gzip-only');
    const required =
      6_000_000_000 +
      archive.bytes +
      archive.entries * 4096 +
      2 * archive.stored_bytes +
      1_000_000_000;
    const conservative =
      7_000_000_000 + 2 * (archive.bytes + archive.entries * 4096);
    expect(required).toBeLessThan(conservative);
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    fixture.environment.CF_TEST_AVAILABLE_BYTES = String(required);
    fixture.environment.CF_TEST_AVAILABLE_INODES = String(
      10_000 + 2 * archive.entries
    );
    const result = fixture.run();
    rejectedBeforeCredentials(result);
    expect(result.stdout).toContain('download_bytes=unknown');
    expect(result.stdout).toContain(
      `stored_layer_bytes=${archive.stored_bytes}`
    );
    expect(result.stdout).toContain(`required_bytes=${conservative}`);
    expect(result.stdout).toContain('capacity_model=conservative');
    expect(result.events.filter((event) => event === 'driver')).toHaveLength(1);
  });

  test.each(['raw-only', 'gzip-only', 'valid'])(
    '%s keeps the two-number default and optionally adds actual stored layer bytes',
    (variant) => {
      const fixture = sandbox();
      const archive = archiveFixture(fixture.directory, variant);
      for (const includeDownload of [false, true]) {
        const result = spawnSync(
          'python3',
          [
            '-B',
            measureScript,
            '--expected-diff-ids',
            JSON.stringify(archive.diff_ids),
            ...(includeDownload ? ['--include-download-bytes'] : []),
          ],
          {
            input: fs.readFileSync(archive.filename),
            encoding: 'utf8',
            timeout: 5000,
          }
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(
          `${archive.bytes} ${archive.entries}${
            includeDownload ? ` ${archive.stored_bytes}` : ''
          }`
        );
      }
    }
  );

  test('the unchanged invocation measures raw and compressed layer tars, including implicit directories', () => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    });
    const archive = archiveFixture(fixture.directory);
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    const result = fixture.run();
    expect(result.status).toBe(0);
    expect(result.events).toContain('save');
    expect(result.stdout).toContain(`unpacked_bytes=${archive.bytes}`);
    expect(result.stdout).toContain(`unpacked_entries=${archive.entries}`);
  });

  test('a classic Docker-save archive and an index image ID remain measurable', () => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    });
    const archive = archiveFixture(fixture.directory, 'classic');
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${'b'.repeat(64)}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    const result = fixture.run();
    expect(result.status).toBe(0);
    expect(result.events).toContain('save');
    expect(result.stdout).toContain(`unpacked_bytes=${archive.bytes}`);
  });

  test.each(['root-dir', 'root-slash-dir'])(
    'zero-size root directories in %s raw/gzip layers and outer tar remain measurable',
    (variant) => {
      const fixture = sandbox({
        CF_PULL_UNPACKED_BYTES: '',
        CF_PULL_UNPACKED_ENTRIES: '',
      });
      const archive = archiveFixture(fixture.directory, variant);
      fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
      fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
      fixture.environment.CF_TEST_ARCHIVE = archive.filename;
      const result = fixture.run();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`unpacked_bytes=${archive.bytes}`);
      expect(result.stdout).toContain(`unpacked_entries=${archive.entries}`);
      expect(result.events).toContain('pull');
    }
  );

  test.each([
    'root-file',
    'root-slash-file',
    'root-symlink',
    'root-nonempty-dir',
    'traversal-dir',
    'traversal-file',
    'outer-root-file',
    'outer-traversal-dir',
  ])('the unsafe %s path still refuses before credentials', (variant) => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    });
    const archive = archiveFixture(fixture.directory, variant);
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    const result = fixture.run();
    rejectedBeforeCredentials(result);
    expect(result.stderr).toContain('Unsupported archive path');
  });

  test('root directories do not bypass verification of the gzip trailer', () => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    });
    const archive = archiveFixture(fixture.directory, 'root-bad-gzip-trailer');
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    const result = fixture.run();
    rejectedBeforeCredentials(result);
    expect(result.stderr).toMatch(/CRC check failed|Incorrect length of data/);
  });

  test('an export for different inspected diff IDs refuses before credentials', () => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
    });
    const archive = archiveFixture(fixture.directory);
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify([
      `sha256:${'b'.repeat(64)}`,
    ]);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    rejectedBeforeCredentials(fixture.run());
  });

  test.each([
    'missing',
    'mismatch',
    'multiple',
    'bad-diff-id',
    'corrupt-config',
    'truncated',
  ])(
    'an unsupported or incomplete %s export refuses before credentials',
    (variant) => {
      const fixture = sandbox({
        CF_PULL_UNPACKED_BYTES: '',
        CF_PULL_UNPACKED_ENTRIES: '',
      });
      const archive = archiveFixture(fixture.directory, variant);
      fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
      fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
      fixture.environment.CF_TEST_ARCHIVE = archive.filename;
      rejectedBeforeCredentials(fixture.run());
    }
  );

  test('a failed docker save cannot publish a measurement from its partial stdout', () => {
    const fixture = sandbox({
      CF_PULL_UNPACKED_BYTES: '',
      CF_PULL_UNPACKED_ENTRIES: '',
      CF_TEST_SAVE_EXIT: '1',
    });
    const archive = archiveFixture(fixture.directory);
    fixture.environment.CF_TEST_LOCAL_ID = `sha256:${archive.config_sha}`;
    fixture.environment.CF_TEST_DIFF_IDS = JSON.stringify(archive.diff_ids);
    fixture.environment.CF_TEST_ARCHIVE = archive.filename;
    rejectedBeforeCredentials(fixture.run());
  });
});
