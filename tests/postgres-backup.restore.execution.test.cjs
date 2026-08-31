const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const restoreScript = path.join(root, 'scripts/operations/postgres-backup-restore.sh');

/**
 * `postgres-backup-restore.sh` decides whether it is allowed to write into a
 * container by reading what `docker` tells it: a label, an environment
 * variable, and two `psql` result sets. Its contract test reads the script as
 * text, so it notices a deleted check and nothing about a check that stopped
 * working — a wrong argument order, an inverted condition, a refusal that fires
 * after globals are already imported. This suite executes the script instead,
 * with a stub `docker` first on the child's PATH and a backup artifact built in
 * the OS temp directory.
 *
 * The stub answers the two `psql` queries the way `--tuples-only --no-align`
 * does: one row per line, and nothing at all when there are no rows. That is
 * the whole reason those refusals can be executed rather than asserted.
 *
 * No daemon, no database, no host path. The PATH override is passed to the
 * child process only and is never written into this process's environment.
 */
let workspace = null;
try {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-restore-exec-'));
} catch {
  // A sandbox with no writable temp directory cannot host this suite. That is
  // not a failure of the restore script, so say so and move on.
  workspace = null;
}

const DOCKER_STUB = `#!/usr/bin/env bash
# Stands in for the docker CLI for one test run. It answers exactly the calls
# postgres-backup-restore.sh makes and refuses anything else loudly, so a new
# call in the script cannot be silently absorbed here.
set -Eeuo pipefail

log() { printf '%s\\n' "$1" >>"$CF_STUB_LOG"; }

case "\${1:-}" in
  inspect)
    if [[ "\${2:-}" == '--format' ]]; then
      log 'inspect-label'
      printf '%s\\n' "$CF_STUB_TARGET_LABEL"
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

if [[ "$request" == *'printf %s "$POSTGRES_USER"'* ]]; then
  log 'read-target-user'
  printf %s "$CF_STUB_TARGET_USER"
  exit 0
fi

# Both queries run through psql with --tuples-only --no-align: one row per
# line, and no output at all when the result set is empty.
if [[ "$request" == *'FROM pg_database'* ]]; then
  log 'query-databases'
  printf '%s' "$CF_STUB_EXISTING_DATABASES"
  exit 0
fi

if [[ "$request" == *'FROM pg_roles'* ]]; then
  log 'query-roles'
  printf '%s' "$CF_STUB_EXISTING_ROLES"
  exit 0
fi

if [[ "$request" == *'exec createdb'* ]]; then
  log "createdb \${*: -1} owner \${*: -2:1}"
  exit "\${CF_STUB_CREATEDB_STATUS:-0}"
fi

if [[ "$request" == *'exec pg_restore'* ]]; then
  payload="$(cat)"
  log "pg_restore \${*: -2:1} role \${*: -1} payload \${payload}"
  exit "\${CF_STUB_PG_RESTORE_STATUS:-0}"
fi

if [[ "$request" == *'exec psql'* && "$request" == *'--dbname postgres'* ]]; then
  payload="$(cat)"
  if [[ "$payload" == *'REVOKE CONNECT ON DATABASE'* ]]; then
    [[ "$payload" == *'GRANT CONNECT ON DATABASE'* ]] || exit 127
    args=("$@")
    count="\${#args[@]}"
    log "apply-database-acls product=\${args[count-8]};mastra=\${args[count-7]};temporal=\${args[count-6]};visibility=\${args[count-5]};listmonk=\${args[count-4]};product-role=\${args[count-3]};mastra-role=\${args[count-2]};listmonk-role=\${args[count-1]}"
  else
    log "import-globals payload \${payload}"
  fi
  exit "\${CF_STUB_PSQL_STATUS:-0}"
fi

printf 'stub docker: unexpected exec %s\\n' "$request" >&2
exit 127
`;

// Each dump carries its own text, so the log says which file reached which
// database rather than only how many calls were made.
const DEFAULT_FILES = {
  'globals.sql': 'CREATE ROLE contentfactory;',
  'product.dump': 'archive-of-product',
  'temporal.dump': 'archive-of-temporal',
  'temporal_visibility.dump': 'archive-of-visibility',
};

const DEFAULT_MANIFEST = {
  format_version: '1',
  backup_id: '20260817T120000Z',
  created_at_utc: '2026-08-17T12:00:00Z',
  source_container: 'cf-next-postgres',
  postgres_image: 'postgres:17-alpine',
  source_user: 'contentfactory',
  product_database: 'contentfactory',
  temporal_database: 'temporal',
  visibility_database: 'temporal_visibility',
};

// The order the backup script checksums them in.
const CHECKSUM_ORDER = [
  'globals.sql',
  'product.dump',
  'mastra.dump',
  'temporal.dump',
  'temporal_visibility.dump',
  'listmonk.dump',
  'manifest.env',
];

let stubBin;
let caseCounter = 0;

/** One artifact directory plus one run of the script against it. */
function runRestore({
  files = {},
  manifest = {},
  dropManifestKeys = [],
  // Applied after checksums.sha256 is written, so the artifact is exactly what
  // a corrupted or tampered backup looks like on disk.
  corruptAfterChecksums = {},
  removeAfterChecksums = [],
  targetLabel = 'disposable',
  targetUser = 'restorebootstrap',
  existingDatabases = '',
  existingRoles = '',
  createdbStatus = 0,
  pgRestoreStatus = 0,
  psqlStatus = 0,
  productRuntimeUser = 'cf_product_runtime',
  mastraRuntimeUser = 'cf_mastra_runtime',
  artifactArgument = null,
} = {}) {
  caseCounter += 1;
  const caseDir = path.join(workspace, `case-${caseCounter}`);
  const artifactDir = path.join(caseDir, '20260817T120000Z');
  fs.mkdirSync(artifactDir, { recursive: true });

  const content = { ...DEFAULT_FILES, ...files };
  const manifestValues = { ...DEFAULT_MANIFEST, ...manifest };
  for (const key of dropManifestKeys) {
    delete manifestValues[key];
  }
  content['manifest.env'] = `${Object.entries(manifestValues)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;

  for (const [name, body] of Object.entries(content)) {
    fs.writeFileSync(path.join(artifactDir, name), body);
  }

  const checksums = CHECKSUM_ORDER.filter((name) => name in content)
    .map((name) => {
      const digest = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(artifactDir, name)))
        .digest('hex');
      return `${digest}  ${name}\n`;
    })
    .join('');
  fs.writeFileSync(path.join(artifactDir, 'checksums.sha256'), checksums);

  for (const [name, body] of Object.entries(corruptAfterChecksums)) {
    fs.writeFileSync(path.join(artifactDir, name), body);
  }
  for (const name of removeAfterChecksums) {
    fs.rmSync(path.join(artifactDir, name), { force: true });
  }

  const stubLog = path.join(caseDir, 'docker.log');
  fs.writeFileSync(stubLog, '');

  const runtimeEnvironment = {};
  if (productRuntimeUser !== null) {
    runtimeEnvironment.PRODUCT_RUNTIME_USER = productRuntimeUser;
  }
  if (mastraRuntimeUser !== null) {
    runtimeEnvironment.MASTRA_RUNTIME_USER = mastraRuntimeUser;
  }

  const result = spawnSync('bash', [restoreScript, artifactArgument ?? artifactDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // Scoped to this child only; nothing is exported into the test process.
      PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
      CF_POSTGRES_RESTORE_CONTAINER: 'cf-stub-restore-target',
      CF_STUB_LOG: stubLog,
      CF_STUB_TARGET_LABEL: targetLabel,
      CF_STUB_TARGET_USER: targetUser,
      CF_STUB_EXISTING_DATABASES: existingDatabases,
      CF_STUB_EXISTING_ROLES: existingRoles,
      CF_STUB_CREATEDB_STATUS: String(createdbStatus),
      CF_STUB_PG_RESTORE_STATUS: String(pgRestoreStatus),
      CF_STUB_PSQL_STATUS: String(psqlStatus),
      ...runtimeEnvironment,
    },
  });

  return {
    result,
    artifactDir,
    dockerCalls: fs.readFileSync(stubLog, 'utf8').split('\n').filter(Boolean),
  };
}

const describeIfWritable = workspace ? describe : describe.skip;

describeIfWritable('the restore script, executed against a stub docker', () => {
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

  test('the harness reaches the real script: an artifact without a manifest is refused', () => {
    const { result, dockerCalls } = runRestore({
      removeAfterChecksums: ['manifest.env'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Backup artifact is incomplete');
    expect(dockerCalls).toEqual([]);
  });

  test('a complete artifact is restored database by database, globals first', () => {
    const { result, dockerCalls } = runRestore();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'PostgreSQL restore completed into container: cf-stub-restore-target'
    );

    // Every guard runs before a single write, globals are imported before the
    // first createdb, and each dump file reaches the database the manifest
    // names for it — not the one that happens to come next in the loop.
    expect(dockerCalls).toEqual([
      'inspect',
      'inspect-label',
      'read-target-user',
      'query-databases',
      'query-roles',
      'import-globals payload CREATE ROLE contentfactory;',
      'createdb contentfactory owner contentfactory',
      'pg_restore contentfactory role contentfactory payload archive-of-product',
      'createdb temporal owner contentfactory',
      'pg_restore temporal role contentfactory payload archive-of-temporal',
      'createdb temporal_visibility owner contentfactory',
      'pg_restore temporal_visibility role contentfactory payload archive-of-visibility',
      'apply-database-acls product=contentfactory;mastra=;temporal=temporal;visibility=temporal_visibility;listmonk=;product-role=;mastra-role=;listmonk-role=',
    ]);
  });

  test('a target without the disposable label is refused before any exec', () => {
    const { result, dockerCalls } = runRestore({ targetLabel: '' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Restore target is not labelled as a disposable PostgreSQL container'
    );
    // An unlabelled container is never even asked for its bootstrap role.
    expect(dockerCalls).toEqual(['inspect', 'inspect-label']);
  });

  test('restores an optional Listmonk database owned by its restored role', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'listmonk.dump': 'archive-of-listmonk' },
      manifest: {
        newsletter_database: 'listmonk',
        newsletter_user: 'listmonk',
      },
    });

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain('createdb listmonk owner listmonk');
    expect(dockerCalls).toContain(
      'pg_restore listmonk role listmonk payload archive-of-listmonk'
    );
  });

  test('restores the separate Mastra database from a new backup artifact', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'mastra.dump': 'archive-of-mastra' },
      manifest: { mastra_database: 'contentfactory_mastra' },
    });

    expect(result.status).toBe(0);
    expect(dockerCalls).toContain(
      'createdb contentfactory_mastra owner contentfactory'
    );
    expect(dockerCalls).toContain(
      'pg_restore contentfactory_mastra role contentfactory payload archive-of-mastra'
    );
  });

  test('reapplies database ACL isolation after restoring a split-role artifact', () => {
    const { result, dockerCalls } = runRestore({
      files: {
        'mastra.dump': 'archive-of-mastra',
        'listmonk.dump': 'archive-of-listmonk',
      },
      manifest: {
        mastra_database: 'contentfactory_mastra',
        newsletter_database: 'listmonk',
        newsletter_user: 'listmonk',
      },
    });

    expect(result.status).toBe(0);
    const aclCall = dockerCalls.find((call) =>
      call.startsWith('apply-database-acls ')
    );
    expect(aclCall).toContain('product=contentfactory');
    expect(aclCall).toContain('mastra=contentfactory_mastra');
    expect(aclCall).toContain('product-role=cf_product_runtime');
    expect(aclCall).toContain('mastra-role=cf_mastra_runtime');
    expect(dockerCalls.indexOf(aclCall)).toBeGreaterThan(
      dockerCalls.findIndex((call) => call.startsWith('pg_restore listmonk '))
    );
  });

  test('a split-role artifact requires both runtime role names before docker is used', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'mastra.dump': 'archive-of-mastra' },
      manifest: { mastra_database: 'contentfactory_mastra' },
      mastraRuntimeUser: null,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Split-role restore requires product_runtime_user and mastra_runtime_user in the backup manifest'
    );
    expect(dockerCalls).toEqual([]);
  });

  // The CONNECT boundary belongs to the cluster that was dumped, so the two
  // role names are a property of the artifact, not of whoever is recovering it.
  test('the runtime role names come from the manifest, not from the operator shell', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'mastra.dump': 'archive-of-mastra' },
      manifest: {
        mastra_database: 'contentfactory_mastra',
        product_runtime_user: 'cf_product_runtime',
        mastra_runtime_user: 'cf_mastra_runtime',
      },
      productRuntimeUser: 'stale_product_role',
      mastraRuntimeUser: 'stale_mastra_role',
    });

    expect(result.status).toBe(0);
    const aclCall = dockerCalls.find((call) =>
      call.startsWith('apply-database-acls ')
    );
    expect(aclCall).toContain('product-role=cf_product_runtime');
    expect(aclCall).toContain('mastra-role=cf_mastra_runtime');
    expect(aclCall).not.toContain('stale_');
  });

  test('an artifact written before the manifest carried them still uses the environment', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'mastra.dump': 'archive-of-mastra' },
      manifest: { mastra_database: 'contentfactory_mastra' },
      productRuntimeUser: 'cf_product_runtime',
      mastraRuntimeUser: 'cf_mastra_runtime',
    });

    expect(result.status).toBe(0);
    const aclCall = dockerCalls.find((call) =>
      call.startsWith('apply-database-acls ')
    );
    expect(aclCall).toContain('product-role=cf_product_runtime');
    expect(aclCall).toContain('mastra-role=cf_mastra_runtime');
  });

  test('a manifest naming an unsafe runtime role is refused before docker is used', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'mastra.dump': 'archive-of-mastra' },
      manifest: {
        mastra_database: 'contentfactory_mastra',
        product_runtime_user: 'cf_runtime; DROP ROLE postgres',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsafe PostgreSQL identifier refused');
    expect(dockerCalls).toEqual([]);
  });

  test('a target carrying some other label is refused by the same guard', () => {
    const { result, dockerCalls } = runRestore({ targetLabel: 'production' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing to mutate it');
    expect(dockerCalls).toEqual(['inspect', 'inspect-label']);
  });

  test('a bootstrap role equal to the source role is refused before globals', () => {
    const { result, dockerCalls } = runRestore({ targetUser: 'contentfactory' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Restore bootstrap role must differ from the source role'
    );
    // Importing globals here would run CREATE ROLE or ALTER ROLE against the
    // role the target is currently connected as.
    expect(dockerCalls).toEqual(['inspect', 'inspect-label', 'read-target-user']);
  });

  test('a bootstrap role equal to either split runtime role is refused before globals', () => {
    const { result, dockerCalls } = runRestore({
      files: { 'mastra.dump': 'archive-of-mastra' },
      manifest: { mastra_database: 'contentfactory_mastra' },
      targetUser: 'cf_product_runtime',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Restore bootstrap role must differ from both runtime roles'
    );
    expect(dockerCalls).toEqual(['inspect', 'inspect-label', 'read-target-user']);
  });

  test('a target that already holds a user database is refused before globals', () => {
    const { result, dockerCalls } = runRestore({
      existingDatabases: 'contentfactory\n',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Restore target contains a user database');
    expect(dockerCalls).toEqual([
      'inspect',
      'inspect-label',
      'read-target-user',
      'query-databases',
    ]);
    expect(dockerCalls.join('\n')).not.toContain('import-globals');
  });

  test('a target that already holds a non-built-in role is refused before globals', () => {
    const { result, dockerCalls } = runRestore({ existingRoles: 'contentfactory\n' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Restore target contains a non-built-in role');
    expect(dockerCalls).toEqual([
      'inspect',
      'inspect-label',
      'read-target-user',
      'query-databases',
      'query-roles',
    ]);
  });

  test('an empty result set from either query is what lets a clean target through', () => {
    // The two refusals above are only meaningful if the same code path accepts
    // the empty output `psql --tuples-only` prints for no rows.
    const { result } = runRestore({ existingDatabases: '', existingRoles: '' });

    expect(result.status).toBe(0);
  });

  test('a corrupted dump is refused by the checksum check before docker is used', () => {
    const { result, dockerCalls } = runRestore({
      corruptAfterChecksums: { 'product.dump': 'archive-of-something-else' },
    });

    expect(result.status).not.toBe(0);
    // `sha256sum --check` names the file on stdout and warns on stderr.
    expect(result.stdout).toContain('product.dump: FAILED');
    expect(result.stderr).toContain('computed checksum did NOT match');
    expect(dockerCalls).toEqual([]);
  });

  test('the manifest is read only after the checksums verify', () => {
    // Both are broken at once: the manifest has no source_user, and a dump no
    // longer matches its checksum. Whichever the script reports first is the
    // one it looked at first.
    const { result, dockerCalls } = runRestore({
      dropManifestKeys: ['source_user'],
      corruptAfterChecksums: { 'temporal.dump': 'tampered' },
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('temporal.dump: FAILED');
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'Backup manifest is missing'
    );
    expect(dockerCalls).toEqual([]);
  });

  test('a manifest naming an unsafe identifier is refused before docker is used', () => {
    const { result, dockerCalls } = runRestore({
      manifest: { product_database: 'content factory; DROP DATABASE postgres' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsafe PostgreSQL identifier refused');
    expect(dockerCalls).toEqual([]);
  });

  test('an artifact whose dump is empty is refused before docker is used', () => {
    // Checksums match: an empty file is a valid file with a valid digest, so
    // only the explicit size check stands between it and a silent restore of
    // nothing.
    const { result, dockerCalls } = runRestore({ files: { 'temporal.dump': '' } });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Backup artifact is missing a required dump');
    expect(dockerCalls).toEqual([]);
  });

  test('a failing pg_restore stops the run instead of reporting a completed restore', () => {
    const { result, dockerCalls } = runRestore({ pgRestoreStatus: 1 });

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('PostgreSQL restore completed');
    // It stopped at the first archive rather than creating the rest.
    expect(dockerCalls.filter((call) => call.startsWith('createdb'))).toEqual([
      'createdb contentfactory owner contentfactory',
    ]);
  });
});
