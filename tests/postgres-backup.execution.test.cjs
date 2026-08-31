const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backupScript = path.join(root, 'scripts/operations/postgres-backup.sh');

/**
 * `postgres-backup.sh` runs every guard it has against output it gets from
 * `docker`. Its sibling contract test reads the script as text, so it notices a
 * deleted check and nothing about a check that stopped working — a wrong
 * argument order, an inverted condition, a refusal that fires too late. This
 * suite executes the script instead, with a stub `docker` first on the child's
 * PATH and a backup root under the OS temp directory.
 *
 * No daemon, no database, no host path: the stub is an ordinary shell script
 * that answers the handful of calls this script makes. The PATH override is
 * passed to the child process only and is never written into this process's
 * environment.
 */
let workspace = null;
try {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-backup-exec-'));
} catch {
  // A sandbox with no writable temp directory cannot host this suite. That is
  // not a failure of the backup script, so say so and move on.
  workspace = null;
}

const DOCKER_STUB = `#!/usr/bin/env bash
# Stands in for the docker CLI for one test run. It answers exactly the calls
# postgres-backup.sh makes and refuses anything else loudly, so a new call in
# the script cannot be silently absorbed here.
set -Eeuo pipefail

log() { printf '%s\\n' "$1" >>"$CF_STUB_LOG"; }

case "\${1:-}" in
  inspect)
    if [[ "\${2:-}" == '--format' ]]; then
      log 'inspect-image'
      printf '%s\\n' "$CF_STUB_IMAGE"
    else
      log 'inspect'
    fi
    exit 0
    ;;
  exec) ;;
  *)
    printf 'stub docker: unexpected command %s\\n' "\${1:-}" >&2
    exit 127
    ;;
esac

request="$*"

if [[ "$request" == *'LISTMONK_DB_USER'* ]]; then
  log 'read-listmonk-user'
  printf %s "\${CF_STUB_LISTMONK_USER:-}"
  exit 0
fi

if [[ "$request" == *'LISTMONK_DB_NAME'* ]]; then
  log 'read-listmonk-database'
  printf %s "\${CF_STUB_LISTMONK_DB:-}"
  exit 0
fi

if [[ "$request" == *'MASTRA_DATABASE_NAME'* ]]; then
  log 'read-mastra-database'
  printf %s "$CF_STUB_MASTRA_DB"
  exit 0
fi

if [[ "$request" == *'PRODUCT_RUNTIME_USER'* ]]; then
  log 'read-product-runtime-user'
  printf %s "\${CF_STUB_PRODUCT_RUNTIME_USER:-}"
  exit 0
fi

if [[ "$request" == *'MASTRA_RUNTIME_USER'* ]]; then
  log 'read-mastra-runtime-user'
  printf %s "\${CF_STUB_MASTRA_RUNTIME_USER:-}"
  exit 0
fi

if [[ "$request" == *'POSTGRES_DB'* ]]; then
  log 'read-product-database'
  printf %s "$CF_STUB_PRODUCT_DB"
  exit 0
fi

if [[ "$request" == *'POSTGRES_USER"'* && "$request" == *'printf %s'* ]]; then
  log 'read-source-user'
  printf %s "$CF_STUB_SOURCE_USER"
  exit 0
fi

if [[ "$request" == *'pg_dumpall --globals-only'* ]]; then
  log 'pg_dumpall'
  cat -- "$CF_STUB_GLOBALS_FILE"
  exit 0
fi

if [[ "$request" == *'pg_dump -Fc'* ]]; then
  database="\${*: -1}"
  log "pg_dump \${database}"
  if [[ "$database" == "\${CF_STUB_EMPTY_DUMP_FOR:-}" ]]; then
    exit 0
  fi
  printf 'stub custom-format archive for %s\\n' "$database"
  exit 0
fi

if [[ "$request" == *'pg_restore --list'* ]]; then
  cat >/dev/null
  log 'pg_restore-list'
  exit "\${CF_STUB_PG_RESTORE_STATUS:-0}"
fi

printf 'stub docker: unexpected exec %s\\n' "$request" >&2
exit 127
`;

const COMPLETE_GLOBALS = [
  '--',
  '-- PostgreSQL database cluster dump',
  '--',
  '',
  "SET default_transaction_read_only = 'off';",
  'CREATE ROLE contentfactory;',
  '',
  '--',
  '-- PostgreSQL database cluster dump complete',
  '--',
  '',
].join('\n');

// The same dump cut off mid-statement: still non-empty, still valid-looking,
// and exactly what the old non-emptiness check would have published.
const TRUNCATED_GLOBALS = [
  '--',
  '-- PostgreSQL database cluster dump',
  '--',
  '',
  "SET default_transaction_read_only = 'off';",
  'CREATE ROL',
].join('\n');

let stubBin;
let caseCounter = 0;

/** One isolated backup root plus the environment for a single run. */
function runBackup({
  globals = COMPLETE_GLOBALS,
  productDatabase = 'contentfactory',
  sourceUser = 'contentfactory',
  mastraDatabase = 'contentfactory_mastra',
  backupId = '20260817T120000Z',
  // Pinning the artifact's name without pinning the moment it is judged
  // against is what broke this suite on 31.08.2026: the fixture is stamped
  // 17.08, retention counts fourteen days back from the real clock, and at
  // 12:00 UTC that day the cutoff walked past the fixture. The run then swept
  // the artifact it had just published, and five tests died at once — on code
  // that had not changed. Both clocks come from here now.
  backupNow = '2026-08-17T12:00:00Z',
  quiesced = true,
  pgRestoreStatus = 0,
  emptyDumpFor = '',
  listmonkDatabase = '',
  listmonkUser = 'listmonk',
  productRuntimeUser = 'cf_product_runtime',
  mastraRuntimeUser = 'cf_mastra_runtime',
  seedPartials = [],
  seedCompleted = [],
  seedBare = [],
} = {}) {
  caseCounter += 1;
  const caseDir = path.join(workspace, `case-${caseCounter}`);
  const artifactRoot = path.join(caseDir, 'artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });

  // A published artifact, as the retention sweep recognises one: a UTC name
  // plus both receipts. Missing either, the sweep skips it on purpose — that
  // is how a directory it does not own survives.
  for (const name of seedCompleted) {
    const seeded = path.join(artifactRoot, name);
    fs.mkdirSync(seeded);
    fs.writeFileSync(path.join(seeded, 'product.dump'), 'older run');
    fs.writeFileSync(path.join(seeded, 'manifest.env'), 'backup_id=' + name);
    fs.writeFileSync(path.join(seeded, 'checksums.sha256'), '');
  }

  // A UTC-named directory with no receipts: something the sweep must leave
  // alone however old it is, because it did not publish it.
  for (const name of seedBare) {
    fs.mkdirSync(path.join(artifactRoot, name));
  }

  for (const { name, ageDays } of seedPartials) {
    const seeded = path.join(artifactRoot, name);
    fs.mkdirSync(seeded);
    fs.writeFileSync(path.join(seeded, 'product.dump'), 'abandoned');
    // Age is measured against the clock that will judge it. `find -mtime`
    // reads the filesystem, so the reference comes from the filesystem too —
    // the directory's own fresh mtime — and not from whatever this process
    // believes the date to be. The two agree in an ordinary run and part
    // company under the time-travel check, where only the process clock moves.
    const filesystemNow = fs.statSync(seeded).mtimeMs;
    const when = new Date(filesystemNow - ageDays * 24 * 60 * 60 * 1000);
    fs.utimesSync(seeded, when, when);
  }

  const globalsFile = path.join(caseDir, 'globals.fixture.sql');
  fs.writeFileSync(globalsFile, globals);
  const stubLog = path.join(caseDir, 'docker.log');
  fs.writeFileSync(stubLog, '');

  const result = spawnSync('bash', [backupScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // Scoped to this child only; nothing is exported into the test process.
      PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
      CF_POSTGRES_CONTAINER: 'cf-stub-postgres',
      CF_BACKUP_ARTIFACT_ROOT: artifactRoot,
      CF_BACKUP_ID: backupId,
      CF_BACKUP_NOW: backupNow,
      ...(quiesced ? { CF_BACKUP_QUIESCED: '1' } : {}),
      CF_STUB_LOG: stubLog,
      CF_STUB_IMAGE: 'postgres:17-alpine',
      CF_STUB_PRODUCT_DB: productDatabase,
      CF_STUB_SOURCE_USER: sourceUser,
      CF_STUB_MASTRA_DB: mastraDatabase,
      CF_STUB_GLOBALS_FILE: globalsFile,
      CF_STUB_PG_RESTORE_STATUS: String(pgRestoreStatus),
      CF_STUB_EMPTY_DUMP_FOR: emptyDumpFor,
      CF_STUB_LISTMONK_DB: listmonkDatabase,
      CF_STUB_LISTMONK_USER: listmonkDatabase ? listmonkUser : '',
      CF_STUB_PRODUCT_RUNTIME_USER: productRuntimeUser,
      CF_STUB_MASTRA_RUNTIME_USER: mastraRuntimeUser,
    },
  });

  const entries = fs.existsSync(artifactRoot)
    ? fs.readdirSync(artifactRoot).sort()
    : [];

  return {
    result,
    artifactRoot,
    entries,
    partials: entries.filter((entry) => entry.startsWith('.partial.')),
    dockerCalls: fs.readFileSync(stubLog, 'utf8').split('\n').filter(Boolean),
  };
}

const describeIfWritable = workspace ? describe : describe.skip;

describeIfWritable('the backup script, executed against a stub docker', () => {
  beforeAll(() => {
    stubBin = path.join(workspace, 'bin');
    fs.mkdirSync(stubBin, { recursive: true });
    const stubPath = path.join(stubBin, 'docker');
    fs.writeFileSync(stubPath, DOCKER_STUB, { mode: 0o755 });
  });

  afterAll(() => {
    if (workspace) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('the harness reaches the real script: an unquiesced run is still refused', () => {
    const { result, entries } = runBackup({ quiesced: false });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing backup without CF_BACKUP_QUIESCED=1');
    expect(entries).toEqual([]);
  });

  test('a complete run publishes one checksummed artifact and leaves no partial behind', () => {
    const { result, artifactRoot, entries, partials, dockerCalls } = runBackup();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(entries).toEqual(['20260817T120000Z']);
    expect(partials).toEqual([]);
    expect(result.stdout).toContain('PostgreSQL backup completed');

    const published = path.join(artifactRoot, '20260817T120000Z');
    expect(fs.readdirSync(published).sort()).toEqual([
      'checksums.sha256',
      'globals.sql',
      'manifest.env',
      'mastra.dump',
      'product.dump',
      'temporal.dump',
      'temporal_visibility.dump',
    ]);

    // The script's own `sha256sum --check` already passed inside the run; this
    // re-checks the published artifact from outside it.
    const verified = spawnSync('sha256sum', ['--check', 'checksums.sha256'], {
      cwd: published,
      encoding: 'utf8',
    });
    expect(verified.status).toBe(0);

    const manifest = fs.readFileSync(path.join(published, 'manifest.env'), 'utf8');
    expect(manifest).toContain('product_database=contentfactory');
    expect(manifest).toContain('mastra_database=contentfactory_mastra');
    expect(manifest).toContain('postgres_image=postgres:17-alpine');

    // Each database was dumped exactly once, under its own file.
    expect(dockerCalls.filter((call) => call.startsWith('pg_dump '))).toEqual([
      'pg_dump contentfactory',
      'pg_dump contentfactory_mastra',
      'pg_dump temporal',
      'pg_dump temporal_visibility',
    ]);
  });

  // The restore has to reapply the CONNECT boundary, and the two role names it
  // needs belong to the cluster that was dumped. Taking them from whatever the
  // recovering operator happens to have exported is how a restore months later
  // silently grants the boundary to the wrong pair of roles.
  test('the manifest carries the two runtime role names the restore needs', () => {
    const { result, artifactRoot, dockerCalls } = runBackup();
    const manifest = fs.readFileSync(
      path.join(artifactRoot, '20260817T120000Z', 'manifest.env'),
      'utf8'
    );

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('read-product-runtime-user');
    expect(dockerCalls).toContain('read-mastra-runtime-user');
    expect(manifest).toContain('product_runtime_user=cf_product_runtime');
    expect(manifest).toContain('mastra_runtime_user=cf_mastra_runtime');
  });

  test('a source container with only one runtime role is refused before anything is dumped', () => {
    const { result, entries, dockerCalls } = runBackup({
      mastraRuntimeUser: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Split-role backup requires both PRODUCT_RUNTIME_USER and MASTRA_RUNTIME_USER'
    );
    expect(entries).toEqual([]);
    expect(dockerCalls).not.toContain('pg_dumpall');
  });

  test('a pre-split source container still produces a manifest, without the role names', () => {
    const { result, artifactRoot } = runBackup({
      productRuntimeUser: '',
      mastraRuntimeUser: '',
    });
    const manifest = fs.readFileSync(
      path.join(artifactRoot, '20260817T120000Z', 'manifest.env'),
      'utf8'
    );

    expect(result.status).toBe(0);
    expect(manifest).not.toContain('product_runtime_user=');
    expect(manifest).not.toContain('mastra_runtime_user=');
  });

  test('a truncated globals dump is refused rather than published', () => {
    const { result, entries, partials } = runBackup({
      globals: TRUNCATED_GLOBALS,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cluster globals dump is truncated');
    // Nothing published, and the EXIT trap took the partial with it.
    expect(entries).toEqual([]);
    expect(partials).toEqual([]);
  });

  test('an enabled Listmonk database is checksummed and published with the core databases', () => {
    const { result, artifactRoot, dockerCalls } = runBackup({
      listmonkDatabase: 'listmonk',
    });

    expect(result.status).toBe(0);
    const published = path.join(artifactRoot, '20260817T120000Z');
    expect(fs.readdirSync(published)).toContain('listmonk.dump');
    expect(fs.readFileSync(path.join(published, 'manifest.env'), 'utf8')).toContain(
      'newsletter_database=listmonk'
    );
    expect(fs.readFileSync(path.join(published, 'manifest.env'), 'utf8')).toContain(
      'newsletter_user=listmonk'
    );
    expect(dockerCalls).toContain('pg_dump listmonk');
  });

  test('an empty globals dump is refused by the same check', () => {
    const { result, entries } = runBackup({ globals: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cluster globals dump is truncated');
    expect(entries).toEqual([]);
  });

  test('a product database named temporal is refused before anything is dumped', () => {
    const { result, entries, dockerCalls } = runBackup({
      productDatabase: 'temporal',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'POSTGRES_DB collides with reserved database temporal'
    );
    expect(entries).toEqual([]);
    // The whole point of refusing early: not one byte was dumped, so the run
    // does not fail late and unreadably inside sha256sum.
    expect(dockerCalls).not.toContain('pg_dumpall');
    expect(dockerCalls.filter((call) => call.startsWith('pg_dump '))).toEqual([]);
  });

  test('temporal_visibility is refused by the same guard', () => {
    const { result } = runBackup({ productDatabase: 'temporal_visibility' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'POSTGRES_DB collides with reserved database temporal_visibility'
    );
  });

  test('a partial directory abandoned by a killed run is swept, a live one is not', () => {
    const { result, entries, artifactRoot } = runBackup({
      seedPartials: [
        // What SIGKILL leaves behind: the EXIT trap never ran.
        { name: '.partial.20260101T000000Z.4242', ageDays: 3 },
        // A run that started moments ago must survive its neighbour's sweep.
        { name: '.partial.20260817T115900Z.4243', ageDays: 0 },
      ],
    });

    expect(result.status).toBe(0);
    expect(entries).toEqual([
      '.partial.20260817T115900Z.4243',
      '20260817T120000Z',
    ]);
    expect(
      fs.existsSync(path.join(artifactRoot, '.partial.20260101T000000Z.4242'))
    ).toBe(false);
  });

  /**
   * `expire_completed_backups` had no executable test — only a contract check
   * that the function is called. The retention window was therefore free to be
   * wrong, and on 31.08.2026 it was: counted against the real clock while the
   * artifact carried a pinned name, it walked past the fixture and deleted the
   * backup the same run had just written. A green suite said nothing.
   *
   * So this exercises the window itself, from both sides. Fourteen days back
   * from the pinned moment is 03.08.2026: an artifact from July goes, one from
   * five days before the run stays, and the run's own artifact stays with it.
   */
  test('retention expires what is past the window and keeps what is inside it', () => {
    const { result, entries } = runBackup({
      seedCompleted: [
        // Well past fourteen days before the run.
        '20260701T000000Z',
        // Five days before the run: inside the window by a wide margin.
        '20260812T120000Z',
      ],
    });

    expect(result.status).toBe(0);
    expect(entries).toEqual([
      '20260812T120000Z',
      '20260817T120000Z',
    ]);
  });

  test('a directory the sweep does not own survives a run that expires its neighbour', () => {
    // Two directories, same age, both well past the window; only one carries
    // the receipts. The sweep is scoped to artifacts it published, and this is
    // how that scoping is proven rather than asserted: widen it and the
    // receiptless neighbour goes too.
    const { result, entries } = runBackup({
      seedCompleted: ['20260701T000000Z'],
      seedBare: ['20260701T000001Z'],
    });

    expect(result.status).toBe(0);
    expect(entries).toEqual([
      '20260701T000001Z',
      '20260817T120000Z',
    ]);
  });

  test('an unreadable archive is refused before the artifact is published', () => {
    const { result, entries, partials } = runBackup({ pgRestoreStatus: 1 });

    expect(result.status).not.toBe(0);
    expect(entries).toEqual([]);
    expect(partials).toEqual([]);
  });

  test('an empty archive is refused with the reason named', () => {
    const { result, entries } = runBackup({ emptyDumpFor: 'temporal' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Dump archive is empty');
    expect(entries).toEqual([]);
  });
});
