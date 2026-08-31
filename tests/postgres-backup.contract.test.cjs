const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backupScript = path.join(root, 'scripts/operations/postgres-backup.sh');
const restoreScript = path.join(root, 'scripts/operations/postgres-backup-restore.sh');
const proofScript = path.join(root, 'scripts/operations/verify-postgres-backup-restore.sh');
const deployDir = path.join(root, 'deploy/production/backup');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function expectShellSyntax(file) {
  const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
}

describe('production PostgreSQL backup contract', () => {
  test('creates an atomic, checksummed dump for the product and both Temporal databases', () => {
    const source = read(backupScript);

    expect(source).toContain('product.dump');
    expect(source).toContain('temporal.dump');
    expect(source).toContain('temporal_visibility.dump');
    expect(source).toContain('globals.sql');
    expect(source).toContain('pg_dumpall --globals-only');
    expect(source).toContain('pg_dump -Fc');
    expect(source).toContain('checksums.sha256');
    expect(source).toContain('manifest.env');
    expect(source).toContain('.partial.');
    expect(source).toContain("trap 'cleanup_partial' EXIT");
    expect(source).toContain('sha256sum --check');
    expect(source).toContain('CF_BACKUP_RETENTION_DAYS');
  });

  test('never passes or logs PostgreSQL passwords and validates an archive before restoring', () => {
    const backup = read(backupScript);
    const restore = read(restoreScript);
    const proof = read(proofScript);
    const combined = `${backup}\n${restore}\n${proof}`;

    expect(combined).not.toMatch(/PGPASSWORD/);
    expect(combined).not.toMatch(/POSTGRES_PASSWORD/);
    expect(restore).toContain('sha256sum --check');
    expect(restore).toContain('pg_restore --exit-on-error');
    expect(restore).toContain('psql --set ON_ERROR_STOP=1');
    expect(restore).toContain('Restore target contains a user database');
    expect(restore).toContain('Restore target contains a non-built-in role');
    expect(restore).toContain('com.contentfactory.postgres-restore-target');
    expect(restore).toContain('REVOKE CONNECT ON DATABASE');
    expect(restore).toContain('PRODUCT_RUNTIME_USER');
    expect(restore).toContain('MASTRA_RUNTIME_USER');
    expect(proof).toContain('acl_matrix_ok');
    expect(proof).toContain('has_database_privilege');
    expect(backup).toContain('checksum_files+=(manifest.env)');
    expect(backup).toContain('checksum_files+=(listmonk.dump)');
    expect(backup).toContain(
      'sha256sum "${checksum_files[@]}" >checksums.sha256'
    );
  });

  test('restores as the source role and rejects any dirty labelled target before globals', () => {
    const restore = read(restoreScript);

    expect(restore).toContain('--role "$2"');
    expect(restore).toContain("datname NOT IN ('postgres', 'template0', 'template1')");
    expect(restore).toContain("rolname <> '$target_user'");
    expect(restore).toContain("rolname NOT LIKE 'pg_%'");
    expect(restore).toContain('before importing globals');
    expect(restore).toContain('Restore bootstrap role must differ from the source role');
  });

  test('requires a quiesced backup and makes host entry points stop and restart only expected writers', () => {
    const backup = read(backupScript);
    const wrapper = read(path.join(deployDir, 'run-postgres-backup.sh'));

    expect(backup).toContain('CF_BACKUP_QUIESCED');
    expect(backup).toContain('Refusing backup without CF_BACKUP_QUIESCED=1');
    expect(wrapper).toContain('/srv/content-factory-next');
    expect(wrapper).toContain('cf-app');
    expect(wrapper).toContain('cf-temporal');
    expect(wrapper).toContain('.State.Running');
    expect(wrapper).toContain("trap 'restart_expected_writers' EXIT");
    expect(wrapper).toContain('CF_BACKUP_QUIESCED=1');
    expect(wrapper).toContain('compose stop cf-app');
    expect(wrapper).toContain('compose stop cf-temporal');
    expect(wrapper).toContain('compose start cf-temporal');
    expect(wrapper).toContain('compose start cf-app');
    expect(wrapper).toContain('restart_status=0');
    expect(wrapper).toContain('service_is_running cf-temporal');
    expect(wrapper).toContain('service_is_running cf-app');
    expect(wrapper).toContain('exit "$restart_status"');
    expect(wrapper.indexOf('app_stopped=1')).toBeLessThan(wrapper.indexOf('compose stop cf-app'));
    expect(wrapper.indexOf('temporal_stopped=1')).toBeLessThan(wrapper.indexOf('compose stop cf-temporal'));
  });

  test('ships a host wrapper and an inactive-by-default systemd schedule', () => {
    const wrapper = read(path.join(deployDir, 'run-postgres-backup.sh'));
    const service = read(path.join(deployDir, 'content-factory-next-postgres-backup.service'));
    const timer = read(path.join(deployDir, 'content-factory-next-postgres-backup.timer'));
    const integration = read(path.join(deployDir, 'full_backup.sh.snippet'));

    expect(wrapper).toContain('postgres-backup.sh');
    expect(service).toContain('ExecStart=');
    expect(timer).toContain('OnCalendar=');
    expect(timer).toContain('Persistent=true');
    expect(integration).toContain('/root/full_backup.sh');
    expect(integration).toContain('run-postgres-backup.sh');
  });

  test('uses only uniquely named disposable Docker resources for the local restore proof', () => {
    const source = read(proofScript);

    expect(source).toContain('mktemp -d');
    expect(source).toContain('docker network create');
    expect(source).toContain('docker volume create');
    expect(source).toContain('docker rm -f');
    expect(source).toContain('docker network rm');
    expect(source).toContain('docker volume rm');
    expect(source).toContain('sentinel_product');
    expect(source).toContain('sentinel_temporal');
    expect(source).toContain('sentinel_visibility');
    expect(source).toContain('cf_backup_proof_role');
    expect(source).toContain('--label com.contentfactory.postgres-restore-target=disposable');
    expect(source).toContain('Unlabelled restore target was accepted unexpectedly.');
    expect(source).toContain('Unquiesced backup was accepted unexpectedly.');
    expect(source).toContain('Dirty labelled restore target was accepted unexpectedly.');
    expect(source).toContain('--username "$source_user"');
  });

  test('refuses a truncated globals dump instead of publishing it', () => {
    const backup = read(backupScript);

    // The three custom-format archives are validated by `pg_restore --list`.
    // `globals.sql` is plain SQL, so a dump cut in the middle is still a
    // non-empty file that only fails during an actual recovery. `pg_dumpall`
    // writes this line last, verified against pg_dumpall 17.10.
    expect(backup).toContain('-- PostgreSQL database cluster dump complete');
    expect(backup).toContain('Cluster globals dump is truncated');
    // Non-emptiness on its own is what let a truncated dump through.
    expect(backup).not.toContain('Cluster globals dump is empty');
  });

  test('refuses a product database named after a Temporal one before dumping anything', () => {
    const backup = read(backupScript);

    expect(backup).toContain('POSTGRES_DB collides with reserved database');
    // The refusal has to come before the dump loop, or the run still fails
    // late and inside sha256sum.
    expect(backup.indexOf('POSTGRES_DB collides with reserved database')).toBeLessThan(
      backup.indexOf('pg_dumpall --globals-only')
    );
  });

  test('sweeps partial directories an EXIT trap could never clean up', () => {
    const backup = read(backupScript);

    // SIGKILL, an OOM kill, or a power cut never reach the trap, and the
    // retention sweep only matches published UTC-named artifacts.
    expect(backup).toContain('expire_abandoned_partials');
    expect(backup).toContain("-name '.partial.*'");
    expect(backup).toContain('-mtime +0');
    expect(backup).toContain('require_command find');
    expect(backup.indexOf('expire_completed_backups\nexpire_abandoned_partials')).toBeGreaterThan(-1);
  });

  test('restores the GRANTs the dump carries', () => {
    const restore = read(restoreScript);
    const [pgRestoreCommand] = restore.match(/exec pg_restore [^']*/) || [];

    expect(pgRestoreCommand).toBeDefined();
    // Globals are imported first, so every role a GRANT names already exists.
    // Dropping privileges left a database only its owner could read, which is
    // invisible while one role holds everything.
    expect(pgRestoreCommand).not.toContain('--no-privileges');
    // Ownership still comes from `--role`, not from the archive.
    expect(pgRestoreCommand).toContain('--no-owner');
  });

  test('backs up and restores the separate Mastra database', () => {
    const backup = read(backupScript);
    const restore = read(restoreScript);

    expect(backup).toContain('MASTRA_DATABASE_NAME');
    expect(backup).toContain('mastra.dump');
    expect(backup).toContain('mastra_database=');
    expect(restore).toContain('mastra_database');
    expect(restore).toContain("dump_file='mastra.dump'");
    expect(restore).toContain('mastra.dump');
  });

  test('every CONNECT statement skips a database the artifact did not restore', () => {
    const restore = read(restoreScript);
    const sql = restore.match(/<<'SQL'\n([\s\S]*?)\nSQL\n/)[1];
    const blocks = sql
      .split('\\gexec')
      .filter((block) => /CONNECT ON DATABASE/.test(block));

    // Two REVOKEs and one GRANT, in one transaction, over the same VALUES
    // lists. The GRANT was the only one without the guard: an asymmetry in
    // three adjacent blocks is the kind of thing that stops being unreachable
    // the moment the list of databases changes.
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block).toContain(
        'EXISTS (SELECT FROM pg_database WHERE datname = database_name)'
      );
    }
  });

  test('the artifact, not the operator shell, names the roles the restore grants CONNECT to', () => {
    const backup = read(backupScript);
    const restore = read(restoreScript);

    expect(backup).toContain('PRODUCT_RUNTIME_USER');
    expect(backup).toContain('MASTRA_RUNTIME_USER');
    expect(backup).toContain("printf 'product_runtime_user=%s\\n'");
    expect(backup).toContain("printf 'mastra_runtime_user=%s\\n'");
    // The manifest first; the environment only for artifacts written before it
    // carried them.
    expect(restore).toContain(
      'read_optional_manifest_value product_runtime_user'
    );
    expect(restore).toContain(
      'read_optional_manifest_value mastra_runtime_user'
    );
    expect(
      restore.indexOf('read_optional_manifest_value product_runtime_user')
    ).toBeLessThan(restore.indexOf('${PRODUCT_RUNTIME_USER:-}'));
  });

  test('both docker-backed proofs wait for a server that answers over TCP', () => {
    // `pg_isready` on the unix socket answers the short-lived server the
    // official image starts for initdb and then shuts down, so a cold run could
    // report ready and then fail its first query. That server has no TCP
    // listener.
    for (const source of [
      read(proofScript),
      read(path.join(root, 'scripts/operations/verify-mastra-storage-migration.sh')),
    ]) {
      expect(source).not.toContain('pg_isready --username');
      expect(source).toContain('--host 127.0.0.1');
      expect(source).toContain("--command 'SELECT 1'");
    }
  });

  test('is shell-syntax valid', () => {
    for (const file of [backupScript, restoreScript, proofScript, path.join(deployDir, 'run-postgres-backup.sh')]) {
      expectShellSyntax(file);
    }
  });
});
