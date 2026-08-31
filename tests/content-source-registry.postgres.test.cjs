const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { Client } = require('pg');

const databaseUrl = process.env.SOURCE_REGISTRY_POSTGRES_URL;
if (databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    parsed = null;
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const targetOverrideKeys = new Set([
    'host',
    'hostaddr',
    'service',
    'servicefile',
  ]);
  const hasTargetOverride = parsed
    ? [...parsed.searchParams.keys()].some((key) =>
        targetOverrideKeys.has(key.toLowerCase())
      )
    : false;
  if (
    !parsed ||
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname) ||
    hasTargetOverride ||
    process.env.CF_DOCKER_CI_DISPOSABLE_POSTGRES !== '1'
  ) {
    throw new Error(
      'SOURCE_REGISTRY_POSTGRES_URL must identify an explicitly marked loopback disposable PostgreSQL database'
    );
  }
}

test(
  'PostgreSQL serializable lease crossing rolls back snapshot and forbids late completion',
  {
    skip: databaseUrl
      ? false
      : 'SOURCE_REGISTRY_POSTGRES_URL is not configured',
  },
  async (t) => {
    const schema = `source_registry_${randomUUID().replaceAll('-', '')}`;
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    t.after(async () => {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TABLE "${schema}".runs (
        id text PRIMARY KEY,
        source_id text NOT NULL,
        lease_id text,
        status text NOT NULL,
        lease_expires_at timestamptz,
        result_snapshot_id text
      );
      CREATE INDEX runs_active_lease
        ON "${schema}".runs (source_id, status, lease_expires_at);
      CREATE TABLE "${schema}".snapshots (
        id text PRIMARY KEY,
        run_id text NOT NULL REFERENCES "${schema}".runs(id),
        body_hash text NOT NULL
      );
    `);
    await admin.query(
      `INSERT INTO "${schema}".runs
        (id, source_id, lease_id, status, lease_expires_at)
       VALUES ($1, $2, $3, 'RUNNING', clock_timestamp() + interval '150 milliseconds')`,
      ['run-a', 'source-a', 'lease-a']
    );

    const worker = new Client({ connectionString: databaseUrl });
    await worker.connect();
    try {
      await worker.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await worker.query(
        `INSERT INTO "${schema}".snapshots (id, run_id, body_hash)
         VALUES ($1, $2, $3)`,
        ['snapshot-late', 'run-a', 'hash-a']
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      const completed = await worker.query(
        `UPDATE "${schema}".runs
         SET status = 'SUCCEEDED', result_snapshot_id = $1,
             lease_id = NULL, lease_expires_at = NULL
         WHERE id = $2 AND source_id = $3 AND lease_id = $4
           AND status = 'RUNNING' AND lease_expires_at > clock_timestamp()`,
        ['snapshot-late', 'run-a', 'source-a', 'lease-a']
      );
      assert.equal(completed.rowCount, 0);
      await worker.query('ROLLBACK');
    } finally {
      await worker.end();
    }

    const snapshots = await admin.query(
      `SELECT id FROM "${schema}".snapshots WHERE run_id = $1`,
      ['run-a']
    );
    const run = await admin.query(
      `SELECT status, lease_id, result_snapshot_id
       FROM "${schema}".runs WHERE id = $1`,
      ['run-a']
    );
    assert.deepEqual(snapshots.rows, []);
    assert.deepEqual(run.rows, [
      { status: 'RUNNING', lease_id: 'lease-a', result_snapshot_id: null },
    ]);
  }
);
