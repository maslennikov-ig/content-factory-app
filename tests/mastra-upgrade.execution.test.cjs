const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Premortem kcxz.4, P2/M1/M2/M3/M9: the owner-run in-place upgrade of the
// separate Mastra database from @mastra/pg 1.8.5 (29 tables) to 1.27.1 (45).
// The real execution proof is scripts/operations/verify-mastra-storage-upgrade.sh
// (disposable PostgreSQL); this suite keeps its contract from drifting.

const root = path.resolve(__dirname, '..');
const upgradeScript = path.join(
  root,
  'deploy/production/upgrade-mastra-storage.sh'
);
const upgradeSql = path.join(
  root,
  'deploy/production/mastra-storage-upgrade-1.27.1.sql'
);
const baseSql = path.join(root, 'deploy/production/mastra-storage-base-1.8.5.sql');
const snapshotSql = path.join(
  root,
  'deploy/production/mastra-storage-snapshot-jsonb.sql'
);
const productionShapeSql = path.join(
  root,
  'deploy/production/mastra-storage-production-shape.sql'
);
const expectedDelta = path.join(
  root,
  'deploy/production/mastra-storage-upgrade-1.27.1.delta'
);
const splitScript = path.join(root, 'deploy/production/migrate-mastra-storage.sh');
const proofScript = path.join(
  root,
  'scripts/operations/verify-mastra-storage-upgrade.sh'
);
const runbook = path.join(root, 'docs/operations/production-deploy.md');

const EXPECTED_TABLES = [
  'mastra_agent_versions',
  'mastra_agents',
  'mastra_ai_spans',
  'mastra_background_tasks',
  'mastra_channel_config',
  'mastra_channel_installations',
  'mastra_dataset_items',
  'mastra_dataset_versions',
  'mastra_datasets',
  'mastra_evals',
  'mastra_experiment_results',
  'mastra_experiments',
  'mastra_favorites',
  'mastra_knowledge_activity',
  'mastra_knowledge_cursors',
  'mastra_knowledge_mentions',
  'mastra_knowledge_nodes',
  'mastra_knowledge_records',
  'mastra_knowledge_semantic_outbox',
  'mastra_mcp_client_versions',
  'mastra_mcp_clients',
  'mastra_mcp_server_versions',
  'mastra_mcp_servers',
  'mastra_messages',
  'mastra_notifications',
  'mastra_observational_memory',
  'mastra_prompt_block_versions',
  'mastra_prompt_blocks',
  'mastra_resources',
  'mastra_schedule_triggers',
  'mastra_schedules',
  'mastra_scorer_definition_versions',
  'mastra_scorer_definitions',
  'mastra_scorers',
  'mastra_skill_blobs',
  'mastra_skill_versions',
  'mastra_skills',
  'mastra_thread_state',
  'mastra_threads',
  'mastra_tool_provider_connections',
  'mastra_traces',
  'mastra_workflow_definitions',
  'mastra_workflow_snapshot',
  'mastra_workspace_versions',
  'mastra_workspaces',
];

const read = (file) => fs.readFileSync(file, 'utf8');

function shellTableList(file) {
  const block = read(file).match(/<<'TABLES'\n([\s\S]*?)\nTABLES\n/);
  return block ? block[1].split('\n') : null;
}

// Statements of the upgrade SQL without comment lines, split on the blank line
// the generator puts between statements.
function statements() {
  return read(upgradeSql)
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n')
    .split(/\n\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const newTables = () =>
  [
    ...read(upgradeSql).matchAll(
      /^CREATE TABLE IF NOT EXISTS "public"\."(mastra_[a-z_]+)"/gm
    ),
  ]
    .map((match) => match[1])
    .sort();

// docker stand-in: answers the read-only preflight queries from environment
// variables and records the single-transaction apply with its payload.
const DOCKER_STUB = `#!/usr/bin/env bash
set -Eeuo pipefail
request="$*"
state="$CF_STUB_DIR/applied"

if [[ "$request" == *'--single-transaction'* ]]; then
  cat >"$CF_STUB_DIR/payload.sql"
  if [[ "$request" != *'--username "$POSTGRES_USER"'* ]]; then
    printf 'stub docker: apply not run as POSTGRES_USER\\n' >&2
    exit 127
  fi
  printf 'apply\\n' >>"$CF_STUB_LOG"
  touch "$state"
  exit 0
fi
if [[ "$request" == *'SELECT definition'* ]]; then
  printf 'definition\\n'
  exit 0
fi
if [[ "$request" == *'FROM pg_catalog.pg_tables'* ]]; then
  printf 'tables\\n' >>"$CF_STUB_LOG"
  if [[ -e "$state" ]]; then
    printf '%s\\n' "$CF_STUB_TABLES_AFTER"
  elif [[ -n "$CF_STUB_TABLES" ]]; then
    printf '%s\\n' "$CF_STUB_TABLES"
  fi
  exit 0
fi
if [[ "$request" == *'pg_catalog.pg_index i'* ]]; then
  printf '%s\\n' "\${CF_STUB_INVALID:-0}"
  exit 0
fi
if [[ "$request" == *'pg_get_userbyid(datdba)'* ]]; then
  printf 't\\n'
  exit 0
fi
if [[ "$request" == *'trigger_set_timestamps'* ]]; then
  printf '1:1\\n'
  exit 0
fi
if [[ "$request" == *'FROM pg_catalog.pg_roles'* ]]; then
  printf '1\\n'
  exit 0
fi
if [[ "$request" == *"column_name = 'snapshot'"* ]]; then
  printf '%s\\n' "\${CF_STUB_SNAPSHOT_TYPE:-jsonb}"
  exit 0
fi
if [[ "$request" == *'pg_input_is_valid'* ]]; then
  printf '%s\\n' "\${CF_STUB_SNAPSHOT_ROWS:-0:0}"
  exit 0
fi
if [[ "$request" == *'experiments='* ]]; then
  printf 'experiments=0\\n'
  exit 0
fi
printf 'stub docker: unexpected request %s\\n' "$request" >&2
exit 127
`;

function runUpgrade({
  tables = [],
  tablesAfter = EXPECTED_TABLES,
  args = [],
  snapshotType = 'jsonb',
  snapshotRows = '0:0',
  invalid = '0',
} = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mastra-upgrade-'));
  const bin = path.join(workspace, 'bin');
  const log = path.join(workspace, 'docker.log');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker'), DOCKER_STUB, { mode: 0o755 });
  fs.writeFileSync(log, '');

  const result = spawnSync('bash', [upgradeScript, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      CF_STUB_DIR: workspace,
      CF_STUB_LOG: log,
      CF_STUB_TABLES: tables.join('\n'),
      CF_STUB_TABLES_AFTER: tablesAfter.join('\n'),
      CF_STUB_SNAPSHOT_TYPE: snapshotType,
      CF_STUB_SNAPSHOT_ROWS: snapshotRows,
      CF_STUB_INVALID: invalid,
      MASTRA_DATABASE_NAME: 'contentfactory_mastra',
      MASTRA_RUNTIME_USER: 'cf_mastra_runtime',
    },
  });
  const calls = read(log).split('\n').filter(Boolean);
  const payloadFile = path.join(workspace, 'payload.sql');
  const payload = fs.existsSync(payloadFile) ? read(payloadFile) : null;
  fs.rmSync(workspace, { recursive: true, force: true });
  return { result, calls, payload };
}

describe('Mastra storage upgrade SQL (premortem M1)', () => {
  test('has no CONCURRENTLY and guards every ADD COLUMN, CREATE INDEX and CREATE TABLE', () => {
    const sql = read(upgradeSql);
    const body = statements().join('\n');

    expect(body).not.toMatch(/CONCURRENTLY/i);
    const addColumns = body.match(/\bADD COLUMN\b.*$/gim) ?? [];
    expect(addColumns).toHaveLength(44);
    expect(addColumns.filter((line) => !/ADD COLUMN IF NOT EXISTS /.test(line))).toEqual([]);
    const indexes = body.match(/^CREATE (UNIQUE )?INDEX\b.*$/gim) ?? [];
    expect(indexes).toHaveLength(34);
    expect(
      indexes.filter((line) => !/^CREATE (UNIQUE )?INDEX IF NOT EXISTS /.test(line))
    ).toEqual([]);
    const tables = body.match(/^CREATE TABLE\b.*$/gim) ?? [];
    expect(tables).toHaveLength(16);
    expect(tables.filter((line) => !/^CREATE TABLE IF NOT EXISTS /.test(line))).toEqual([]);

    // The script owns the transaction; the file must not end it early.
    expect(body).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK|END TRANSACTION)\s*;/im);
    // Re-creating the function would hand PUBLIC EXECUTE back (premortem M4).
    expect(body).not.toMatch(/DROP\s+FUNCTION/i);
    expect(body).not.toMatch(/DROP\s+TABLE/i);
    expect(body).toContain('CREATE OR REPLACE FUNCTION "public".trigger_set_timestamps()');
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION "public".trigger_set_timestamps() FROM PUBLIC;'
    );
    // The only removal is the index the new unique index replaces.
    expect(body.match(/^DROP .*$/gim)).toEqual([
      'DROP INDEX IF EXISTS "public"."idx_experiment_results_exp_item";',
    ]);
  });

  test('the snapshot pre-step converts only text, refuses invalid rows and never ends the transaction', () => {
    const sql = read(snapshotSql);
    const code = sql
      .split('\n')
      .filter((line) => !line.startsWith('--'))
      .join('\n');

    expect(code).toContain(
      'LOCK TABLE public.mastra_workflow_snapshot IN ACCESS EXCLUSIVE MODE;'
    );
    expect(code).toContain("WHERE NOT pg_input_is_valid(snapshot, 'jsonb')");
    expect(code).toContain(
      'ALTER COLUMN snapshot TYPE jsonb USING snapshot::jsonb;'
    );
    // The refusal comes before the only change.
    expect(code.indexOf('rows whose snapshot is not valid jsonb')).toBeLessThan(
      code.indexOf('ALTER TABLE')
    );
    expect(code.match(/^\s*ALTER TABLE\b/gm)).toHaveLength(1);
    expect(code).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK|END TRANSACTION)\s*;/im);
    expect(code).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE)\b/);
  });

  test('pins the SHA-256 of every reviewed artifact the script applies', () => {
    const source = read(upgradeScript);
    const sha = (file) =>
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

    expect(source).toContain(`readonly base_sql_sha256='${sha(baseSql)}'`);
    expect(source).toContain(`readonly upgrade_sql_sha256='${sha(upgradeSql)}'`);
    expect(source).toContain(`readonly snapshot_sql_sha256='${sha(snapshotSql)}'`);
    expect(source).toContain(
      `readonly expected_delta_sha256='${sha(expectedDelta)}'`
    );
  });

  test('the reviewed delta removes one index and only adds otherwise', () => {
    const lines = read(expectedDelta).trimEnd().split('\n');
    expect(lines.filter((line) => line.startsWith('-'))).toEqual([
      '-index:mastra_experiment_results:idx_experiment_results_exp_item:CREATE UNIQUE INDEX idx_experiment_results_exp_item ON public.mastra_experiment_results USING btree ("experimentId", "itemId")',
    ]);
    expect(lines.every((line) => /^[+-](column|index|constraint):/.test(line))).toBe(
      true
    );
    // No added column is NOT NULL on a table that existed before (M7/M6):
    // every NOT NULL addition belongs to one of the 16 new tables.
    const created = new Set(newTables());
    const notNullOnOldTables = lines
      .filter((line) => line.startsWith('+column:') && line.includes(':NO:'))
      .map((line) => line.split(':')[1])
      .filter((table) => !created.has(table));
    expect(notNullOnOldTables).toEqual([]);
  });
});

describe('Mastra owner-run upgrade script (premortem P2)', () => {
  const previousTables = EXPECTED_TABLES.filter(
    (table) => !newTables().includes(table)
  );

  test('applies once, as POSTGRES_USER, in one transaction, over the exact 29 names', () => {
    const { result, calls, payload } = runUpgrade({ tables: previousTables });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(calls.filter((call) => call === 'apply')).toHaveLength(1);
    expect(result.stdout).toContain('Mastra storage upgrade applied: 29 -> 45 tables.');
    expect(payload).toContain('\\set ON_ERROR_STOP on');
    expect(payload).toContain(read(upgradeSql));
    expect(payload).not.toContain(read(baseSql));
    // Postconditions run inside the same transaction, before COMMIT.
    expect(payload).toContain('Mastra upgrade changed the schema differently from the reviewed delta; rolled back.');
    expect(payload).toContain('did not reach the 45-table contract; rolled back.');
    expect(payload).toContain('invalid indexes; rolled back.');
    expect(payload.indexOf(read(upgradeSql))).toBeLessThan(
      payload.indexOf('$cf_postcondition$')
    );
    // The snapshot pre-step runs between the two schema captures, before the
    // upgrade, and its own change is proven before COMMIT.
    const original = payload.indexOf('CREATE TEMP TABLE cf_mastra_original');
    const preStep = payload.indexOf(read(snapshotSql));
    const before = payload.indexOf('CREATE TEMP TABLE cf_mastra_before');
    expect(original).toBeGreaterThan(-1);
    expect(original).toBeLessThan(preStep);
    expect(preStep).toBeLessThan(before);
    expect(before).toBeLessThan(payload.indexOf(read(upgradeSql)));
    expect(payload).toContain(
      'Mastra snapshot pre-step changed more than the snapshot column type; rolled back.'
    );

    const source = read(upgradeScript);
    expect(source).toContain('--single-transaction');
    expect(source).toContain('--username "$POSTGRES_USER"');
    // Named only in the comment that forbids them, never executed.
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/prisma|disableInit|node |pnpm /);
    expect(source).toContain('Never replace this with Mastra\'s own init');
  });

  test('is a no-op with exit 0 over the exact 45 names', () => {
    const { result, calls, payload } = runUpgrade({ tables: EXPECTED_TABLES });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('already has the exact 45-table contract; nothing applied.');
    expect(calls).not.toContain('apply');
    expect(payload).toBeNull();
  });

  test.each([
    ['one table short of 29', () => previousTables.slice(1)],
    ['29 plus an unknown table', () => [...previousTables, 'mastra_unexpected'].sort()],
    ['halfway between 29 and 45', () => [...previousTables, 'mastra_thread_state'].sort()],
    ['45 minus one table', () => EXPECTED_TABLES.slice(1)],
  ])('refuses %s before any change', (_name, tables) => {
    const { result, calls } = runUpgrade({ tables: tables() });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'is neither the 29-table (@mastra/pg 1.8.5) nor the 45-table (@mastra/pg 1.27.1) contract'
    );
    expect(calls).not.toContain('apply');
  });

  test('refuses an empty target unless --from-empty, and --from-empty over existing tables', () => {
    const empty = runUpgrade({ tables: [] });
    expect(empty.result.status).toBe(1);
    expect(empty.result.stderr).toContain('re-run with --from-empty');
    expect(empty.calls).not.toContain('apply');

    const occupied = runUpgrade({ tables: previousTables, args: ['--from-empty'] });
    expect(occupied.result.status).toBe(1);
    expect(occupied.result.stderr).toContain('Refusing --from-empty');
    expect(occupied.calls).not.toContain('apply');
  });

  test('--from-empty applies the base schema and then the same upgrade in one payload', () => {
    const { result, payload } = runUpgrade({ tables: [], args: ['--from-empty'] });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Mastra storage created from empty: 0 -> 45 tables.');
    expect(payload.indexOf(read(baseSql))).toBeGreaterThan(-1);
    expect(payload.indexOf(read(baseSql))).toBeLessThan(
      payload.indexOf(read(upgradeSql))
    );
  });

  test('converts a text snapshot column inside the transaction when every row is valid jsonb', () => {
    const text = runUpgrade({
      tables: previousTables,
      snapshotType: 'text',
      snapshotRows: '3:0',
    });
    expect(text.result.stderr).toBe('');
    expect(text.result.status).toBe(0);
    expect(text.result.stdout).toContain(
      'snapshot column: text, 3 rows, all valid jsonb; converted to jsonb inside the upgrade transaction.'
    );
    expect(text.calls.filter((call) => call === 'apply')).toHaveLength(1);
    expect(text.payload).toContain(read(snapshotSql));
  });

  test('refuses invalid-jsonb snapshots, other snapshot types and pre-existing invalid indexes before any change', () => {
    const badRows = runUpgrade({
      tables: previousTables,
      snapshotType: 'text',
      snapshotRows: '3:2',
    });
    expect(badRows.result.status).toBe(1);
    expect(badRows.result.stderr).toContain(
      'mastra_workflow_snapshot has 2 rows whose snapshot is not valid jsonb (of 3)'
    );
    expect(badRows.calls).not.toContain('apply');

    const json = runUpgrade({ tables: previousTables, snapshotType: 'json' });
    expect(json.result.status).toBe(1);
    expect(json.result.stderr).toContain('is json, neither jsonb nor text');
    expect(json.calls).not.toContain('apply');

    const invalid = runUpgrade({ tables: previousTables, invalid: '2' });
    expect(invalid.result.status).toBe(1);
    expect(invalid.result.stderr).toContain('invalid indexes before the upgrade');
    expect(invalid.calls).not.toContain('apply');
  });
});

describe('Mastra 45-name upgrade contract (premortem M2)', () => {
  test('keeps the hand-written copies of the 45-name upgrade contract identical and documents the pinned @mastra/pg', () => {
    expect(shellTableList(upgradeScript)).toEqual(EXPECTED_TABLES);
    expect(shellTableList(proofScript)).toEqual(EXPECTED_TABLES);
    expect(EXPECTED_TABLES).toHaveLength(45);

    const source = read(upgradeScript);
    const pinned = JSON.parse(read(path.join(root, 'package.json'))).dependencies[
      '@mastra/pg'
    ];
    expect(source.match(/"@mastra\/pg": "([^"]+)"/)?.[1]).toBe(pinned);
    expect(source).toContain('When `@mastra/pg` moves');
  });

  test('45 = the frozen 29-name split contract + the 16 tables the SQL creates', () => {
    const created = newTables();
    expect(created).toHaveLength(16);
    expect([...shellTableList(splitScript), ...created].sort()).toEqual(
      EXPECTED_TABLES
    );
  });

  test('the base schema creates exactly the 29 split-contract tables', () => {
    const created = [
      ...read(baseSql).matchAll(/^CREATE TABLE public\.(mastra_[a-z_]+) \(/gm),
    ]
      .map((match) => match[1])
      .sort();
    expect(created).toEqual(shellTableList(splitScript));
    expect(read(baseSql)).not.toMatch(/^\\(un)?restrict /m);
  });

  test("the production-shape fixture is production's 29 tables, schema only, pinned to production's fingerprint", () => {
    const shape = read(productionShapeSql);
    const created = [...shape.matchAll(/^CREATE TABLE public\.(mastra_[a-z_]+) \(/gm)]
      .map((match) => match[1])
      .sort();
    expect(created).toEqual(shellTableList(splitScript));
    expect(shape).not.toMatch(/^\\(un)?restrict /m);
    expect(shape).not.toMatch(/^(COPY|INSERT) /m);
    expect(shape).not.toMatch(/^(GRANT|REVOKE|ALTER .* OWNER TO) /m);
    expect(shape).toMatch(/^    snapshot text NOT NULL,$/m);

    const proof = read(proofScript);
    expect(proof).toContain('deploy/production/mastra-storage-production-shape.sql');
    expect(proof).toContain(
      "expected_production_fingerprint='310d75fcf3e36475d5524559d1437522685534915f85f45d1e7c3b219acac8f7'"
    );
    expect(proof).toContain(
      "expected_production_upgraded_fingerprint='a8cdfd9101f62ed7316e5744611007ba055adc50be740cba23fe71b007d47d97'"
    );
  });
});

describe('Mastra upgrade proof and runbook (premortem P4/P7/M3/M9)', () => {
  test('is proved by a local disposable-container run that is referenced, not orphaned', () => {
    const proof = read(proofScript);
    const doc = read(runbook);

    expect(doc).toContain('verify-mastra-storage-upgrade.sh');
    expect(proof).toContain('deploy/production/upgrade-mastra-storage.sh');
    expect(proof).toContain('check-postgres-role-isolation.sh');
    for (const refusal of [
      'Runtime role cannot INSERT into mastra_thread_state after the upgrade.',
      'Runtime role was able to CREATE TABLE in the Mastra database.',
      'Second upgrade run did not report a no-op.',
      'Interrupted upgrade left a partial schema behind.',
      'Upgrade accepted a target whose change differs from the reviewed delta.',
      'Upgrade accepted a table set that is neither 29 nor 45 names.',
      'Upgrade converted a snapshot column holding rows that are not valid jsonb.',
      'The in-transaction snapshot guard converted rows that are not valid jsonb.',
      'Production-shape rows changed during the upgrade.',
      'Upgraded production archive differs from the upgraded production-shape fingerprint.',
      'Fresh install fingerprint differs from the upgraded one.',
      'Seeded rows changed during the upgrade',
    ]) {
      expect(proof).toContain(refusal);
    }
    expect(proof).toContain('--host 127.0.0.1');
    expect(proof).toContain('refusing an implicit registry pull');

    const syntax = spawnSync('bash', ['-n', proofScript], { encoding: 'utf8' });
    expect(syntax.status).toBe(0);
    const scriptSyntax = spawnSync('bash', ['-n', upgradeScript], {
      encoding: 'utf8',
    });
    expect(scriptSyntax.status).toBe(0);
  });

  test('the runbook carries R1-R6, the ban on db push and init, and 45 in the fingerprint section', () => {
    const doc = read(runbook);
    const start = doc.indexOf('### Обновление хранилища Mastra: 29 → 45 таблиц');
    expect(start).toBeGreaterThan(-1);
    const section = doc.slice(start, doc.indexOf('\n### ', start + 1));

    for (const step of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) {
      expect(section).toContain(`**${step}.**`);
    }
    expect(section).toContain(
      '**Никогда не `prisma db push` и никогда не `disableInit=false`'
    );
    expect(section).toContain('./deploy/production/upgrade-mastra-storage.sh');
    expect(section).toContain('check-postgres-role-isolation.sh');
    expect(section).toContain('Mastra 29 → 45');

    const fingerprint = doc.slice(
      doc.indexOf('Для повторяемой проверки отдельной схемы Mastra'),
      doc.indexOf('Сырой `pg_dump` для этого сравнения')
    );
    expect(fingerprint).toContain('45');
    expect(fingerprint).toContain(
      '38dd03cc29b0958c09426a531e72dcfd70d9ddb3aa8186666d6ea1c5aa26322d'
    );
    expect(read(proofScript)).toContain(
      "expected_upgraded_fingerprint='38dd03cc29b0958c09426a531e72dcfd70d9ddb3aa8186666d6ea1c5aa26322d'"
    );

    // Fresh install creates the same schema as the upgraded production.
    expect(doc).toContain('./deploy/production/upgrade-mastra-storage.sh --from-empty');
    // The five files travel to the host together.
    for (const artifact of [
      'deploy/production/upgrade-mastra-storage.sh',
      'deploy/production/mastra-storage-base-1.8.5.sql',
      'deploy/production/mastra-storage-upgrade-1.27.1.sql',
      'deploy/production/mastra-storage-snapshot-jsonb.sql',
      'deploy/production/mastra-storage-upgrade-1.27.1.delta',
    ]) {
      expect(doc).toContain(`/tmp/cf-ops/${artifact}`);
    }
  });
});
