const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const migrationScript = path.join(
  root,
  'deploy/production/migrate-mastra-storage.sh'
);
// The only real proof of the migration contract: it runs the script above
// against disposable PostgreSQL containers. Referenced here, and from step 4 of
// the Mastra split in docs/operations/production-deploy.md, so it cannot be
// deleted or renamed without something saying so.
const proofScript = path.join(
  root,
  'scripts/operations/verify-mastra-storage-migration.sh'
);

const EXPECTED_TABLES = [
  'mastra_agent_versions',
  'mastra_agents',
  'mastra_ai_spans',
  'mastra_dataset_items',
  'mastra_dataset_versions',
  'mastra_datasets',
  'mastra_evals',
  'mastra_experiment_results',
  'mastra_experiments',
  'mastra_mcp_client_versions',
  'mastra_mcp_clients',
  'mastra_mcp_server_versions',
  'mastra_mcp_servers',
  'mastra_messages',
  'mastra_observational_memory',
  'mastra_prompt_block_versions',
  'mastra_prompt_blocks',
  'mastra_resources',
  'mastra_scorer_definition_versions',
  'mastra_scorer_definitions',
  'mastra_scorers',
  'mastra_skill_blobs',
  'mastra_skill_versions',
  'mastra_skills',
  'mastra_threads',
  'mastra_traces',
  'mastra_workflow_snapshot',
  'mastra_workspace_versions',
  'mastra_workspaces',
];

const DOCKER_STUB = `#!/usr/bin/env bash
set -Eeuo pipefail
request="$*"

if [[ "$request" == *'--dbname "$MASTRA_DATABASE_NAME" --tuples-only'* ]]; then
  printf 'target-tables\n' >>"$CF_STUB_LOG"
  printf '%s' "$CF_STUB_TARGET_TABLES"
  exit 0
fi

if [[ "$request" == *'FROM pg_catalog.pg_depend'* ]]; then
  printf 'source-dependencies\n' >>"$CF_STUB_LOG"
  printf '%s' "$CF_STUB_SOURCE_DEPENDENCIES"
  exit 0
fi

if [[ "$request" == *'FROM pg_catalog.pg_tables'* ]]; then
  printf 'source-tables\n' >>"$CF_STUB_LOG"
  printf '%s\n' "$CF_STUB_SOURCE_TABLES"
  exit 0
fi

if [[ "$request" == *'FROM pg_catalog.pg_trigger'* ]]; then
  printf 'source-functions\n' >>"$CF_STUB_LOG"
  printf '%s\n' 'CREATE OR REPLACE FUNCTION public.mastra_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;'
  exit 0
fi

if [[ "$request" == *'pg_dump --schema-only'* ]]; then
  printf 'schema-dump\n' >>"$CF_STUB_LOG"
  while IFS= read -r table; do
    printf 'CREATE TABLE public.%s (id text);\n' "$table"
  done <<<"$CF_STUB_SOURCE_TABLES"
  exit 0
fi

if [[ "$request" == *'pg_dump --data-only'* ]]; then
  if [[ "$request" != *'--disable-triggers'* ]]; then
    printf 'stub docker: data copy did not disable target triggers\n' >&2
    exit 127
  fi
  printf 'data-copy\n' >>"$CF_STUB_LOG"
  exit 0
fi

if [[ "$request" == *'--dbname "$MASTRA_DATABASE_NAME" --single-transaction'* ]]; then
  payload="$(cat)"
  if [[ "$payload" == *'CREATE TABLE public.mastra_agents'* ]]; then
    printf 'apply-source-ddl\n' >>"$CF_STUB_LOG"
  else
    printf 'stub docker: unknown psql payload\n' >&2
    exit 127
  fi
  exit 0
fi

printf 'stub docker: unexpected request %s\n' "$request" >&2
exit 127
`;

function runMigration({
  sourceTables = EXPECTED_TABLES,
  sourceDependencies = [],
  targetTables = [],
} = {}) {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cf-mastra-migration-')
  );
  const bin = path.join(workspace, 'bin');
  const log = path.join(workspace, 'docker.log');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'docker'), DOCKER_STUB, { mode: 0o755 });
  fs.writeFileSync(log, '');

  const result = spawnSync('bash', [migrationScript, '--copy-existing'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      CF_STUB_LOG: log,
      CF_STUB_SOURCE_TABLES: sourceTables.join('\n'),
      CF_STUB_SOURCE_DEPENDENCIES: sourceDependencies.join('\n'),
      CF_STUB_TARGET_TABLES: targetTables.join('\n'),
      MASTRA_DATABASE_NAME: 'contentfactory_mastra',
      MASTRA_RUNTIME_USER: 'cf_mastra_runtime',
    },
  });
  const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
  fs.rmSync(workspace, { recursive: true, force: true });
  return { result, calls };
}

// The names live three times: in the migration script, in the local proof, and
// in EXPECTED_TABLES above. Nothing at runtime reads one from another, so this
// is what stops a fourth table from being added to one copy only.
function shellTableList(file) {
  const block = fs
    .readFileSync(file, 'utf8')
    .match(/<<'TABLES'\n([\s\S]*?)\nTABLES\n/);
  return block ? block[1].split('\n') : null;
}

describe('Mastra owner-run migration', () => {
  test('applies source-database DDL only after proving all 29 deployment tables', () => {
    const { result, calls } = runMigration();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(calls).toEqual([
      'source-tables',
      'source-dependencies',
      'target-tables',
      'source-functions',
      'schema-dump',
      'apply-source-ddl',
      'data-copy',
    ]);
  });

  test('refuses a partial deployment table set before DDL or data copy', () => {
    const { result, calls } = runMigration({
      sourceTables: EXPECTED_TABLES.filter(
        (table) => table !== 'mastra_observational_memory'
      ),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Source Mastra table set differs from the 29-table deployment contract'
    );
    expect(calls).toEqual(['source-tables']);
  });

  // PostgreSQL 17 documents that `pg_dump -t` "makes no attempt to dump any
  // other database objects that the selected table(s) might depend upon", so
  // "there is no guarantee that the results of a specific-table dump can be
  // successfully restored by themselves into a clean database"
  // (https://www.postgresql.org/docs/17/app-pgdump.html). Both 29-name gates
  // pass in this case: the table names are exactly right and the dump is still
  // unusable.
  test('refuses a dependency the table-filtered dump cannot carry, naming it', () => {
    const { result, calls } = runMigration({
      sourceDependencies: ['extension pgcrypto', 'type public.mastra_kind'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'depend on objects a table-filtered pg_dump does not carry'
    );
    expect(result.stderr).toContain('extension pgcrypto');
    expect(result.stderr).toContain('type public.mastra_kind');
    expect(calls).toEqual(['source-tables', 'source-dependencies']);
  });

  test('refuses a retry over an already migrated target instead of failing inside PostgreSQL', () => {
    const { result, calls } = runMigration({
      targetTables: ['mastra_agent_versions', 'mastra_agents'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is not idempotent');
    expect(result.stderr).toContain('mastra_agent_versions');
    expect(result.stderr).toContain(
      'Drop and recreate the empty target database'
    );
    expect(calls).toEqual([
      'source-tables',
      'source-dependencies',
      'target-tables',
    ]);
  });

  test('keeps the three hand-written copies of the 29-name contract identical', () => {
    expect(shellTableList(migrationScript)).toEqual(EXPECTED_TABLES);
    expect(shellTableList(proofScript)).toEqual(EXPECTED_TABLES);
    expect(EXPECTED_TABLES).toHaveLength(29);
  });

  test('records where the 29 names came from and which @mastra/pg version they are true for', () => {
    const source = fs.readFileSync(migrationScript, 'utf8');
    const pinned = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    ).dependencies['@mastra/pg'];
    const documented = source.match(/"@mastra\/pg": "([^"]+)"/)?.[1];

    // The caret range means a minor bump can change the table set with nothing
    // in the scripts to explain it, so the comment has to name the version it
    // was read from and stay in step with package.json.
    expect(documented).toBe(pinned);
    expect(source).toContain('When `@mastra/pg` moves');
  });

  test('is proved by a local disposable-container run that is referenced, not orphaned', () => {
    const proof = fs.readFileSync(proofScript, 'utf8');
    const runbook = fs.readFileSync(
      path.join(root, 'docs/operations/production-deploy.md'),
      'utf8'
    );

    expect(fs.existsSync(proofScript)).toBe(true);
    expect(runbook).toContain('verify-mastra-storage-migration.sh');
    expect(proof).toContain('deploy/production/migrate-mastra-storage.sh');
    // Every refusal the script has to reach, so a case cannot quietly go away.
    expect(proof).toContain('Migration accepted a missing deployment table.');
    expect(proof).toContain('Migration accepted an extra deployment table.');
    expect(proof).toContain(
      'Migration accepted a table set whose dump omits a type it depends on.'
    );
    expect(proof).toContain(
      'Migration re-applied its schema over an already migrated target.'
    );
    // The unix-socket wait answers the temporary initdb server; TCP does not.
    expect(proof).not.toContain('pg_isready --username');
    expect(proof).toContain('--host 127.0.0.1');

    const syntax = spawnSync('bash', ['-n', proofScript], { encoding: 'utf8' });
    expect(syntax.status).toBe(0);
    expect(syntax.stderr).toBe('');
  });
});
