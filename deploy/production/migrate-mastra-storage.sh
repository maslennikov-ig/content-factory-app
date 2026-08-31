#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly postgres_container="${CF_POSTGRES_CONTAINER:-cf-next-postgres}"
copy_existing=0

usage() {
  printf 'Usage: %s [--copy-existing]\n' "$0" >&2
}

if [[ "${1:-}" == '--copy-existing' ]]; then
  copy_existing=1
  shift
fi
[[ "$#" -eq 0 ]] || {
  usage
  exit 2
}

: "${MASTRA_DATABASE_NAME:?Load the production .env before running this owner-only migration.}"
: "${MASTRA_RUNTIME_USER:?Load the production .env before running this owner-only migration.}"

for identifier in "$MASTRA_DATABASE_NAME" "$MASTRA_RUNTIME_USER"; do
  [[ "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
done

readonly temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
readonly schema_sql="$temp_dir/mastra-schema.sql"
# Where the 29 names come from: they are the `public.mastra_*` tables that
# `@mastra/pg` creates for this deployment, read off a real source database and
# true for the version pinned in `package.json` as `"@mastra/pg": "^1.8.5"`
# (resolved to 1.8.5 in `pnpm-lock.yaml`). The caret means a minor bump can add
# or rename a table, and this list, the identical list in
# `scripts/operations/verify-mastra-storage-migration.sh`, and the one in
# `tests/mastra-migration.execution.test.cjs` would all become wrong at once.
# `tests/mastra-migration.execution.test.cjs` fails when the three copies drift
# apart, but nothing can tell you the upstream table set changed.
# When `@mastra/pg` moves: re-read `SELECT tablename FROM pg_tables WHERE
# schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\' ORDER BY
# tablename COLLATE "C"` on a database created by the new version, update all
# three copies together with the version in this comment, and re-run
# `scripts/operations/verify-mastra-storage-migration.sh`. Do not widen the
# contract to a prefix match: the exact set is what stops a half-created source
# schema from being copied into production.
readonly expected_tables="$(cat <<'TABLES'
mastra_agent_versions
mastra_agents
mastra_ai_spans
mastra_dataset_items
mastra_dataset_versions
mastra_datasets
mastra_evals
mastra_experiment_results
mastra_experiments
mastra_mcp_client_versions
mastra_mcp_clients
mastra_mcp_server_versions
mastra_mcp_servers
mastra_messages
mastra_observational_memory
mastra_prompt_block_versions
mastra_prompt_blocks
mastra_resources
mastra_scorer_definition_versions
mastra_scorer_definitions
mastra_scorers
mastra_skill_blobs
mastra_skill_versions
mastra_skills
mastra_threads
mastra_traces
mastra_workflow_snapshot
mastra_workspace_versions
mastra_workspaces
TABLES
)"

source_tables="$(docker exec "$postgres_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname "$POSTGRES_DB" --tuples-only --no-align --command "$1"' \
  sh "SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\\'
      ORDER BY tablename COLLATE \"C\";")"

[[ "$source_tables" == "$expected_tables" ]] || {
  printf 'Source Mastra table set differs from the 29-table deployment contract; refusing before target mutation or data copy.\n' >&2
  diff -u <(printf '%s\n' "$expected_tables") <(printf '%s\n' "$source_tables") >&2 || true
  exit 1
}

# PostgreSQL 17 documents that `pg_dump -t` "makes no attempt to dump any other
# database objects that the selected table(s) might depend upon", so "there is
# no guarantee that the results of a specific-table dump can be successfully
# restored by themselves into a clean database"
# (https://www.postgresql.org/docs/17/app-pgdump.html). The 29-name gates above
# only prove the table names match; an enum used by a column, or an extension
# behind a column default, is absent from the dump and the apply dies with
# `type "public.mastra_kind" does not exist` after the target was already
# touched. Walk `pg_depend` from the selected tables and everything they own —
# indexes, defaults, constraints, triggers — to `pg_type`, `pg_proc` and
# `pg_extension`, and fail closed naming what the dump cannot carry. Trigger
# functions are exempt because they are exported explicitly below; anything
# else is an owner decision, not something this script should guess at during a
# deploy window.
source_dependencies="$(docker exec "$postgres_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname "$POSTGRES_DB" --tuples-only --no-align --command "$1"' \
  sh "WITH selected AS (
        SELECT table_object.oid
        FROM pg_catalog.pg_class table_object
        JOIN pg_catalog.pg_namespace schema ON schema.oid = table_object.relnamespace
        WHERE schema.nspname = 'public'
          AND table_object.relkind = 'r'
          AND table_object.relname LIKE 'mastra\_%' ESCAPE '\\'
      ), owned AS (
        SELECT 'pg_class'::regclass AS classid, oid AS objid FROM selected
        UNION ALL
        SELECT 'pg_class'::regclass, indexrelid
        FROM pg_catalog.pg_index WHERE indrelid IN (SELECT oid FROM selected)
        UNION ALL
        SELECT 'pg_attrdef'::regclass, oid
        FROM pg_catalog.pg_attrdef WHERE adrelid IN (SELECT oid FROM selected)
        UNION ALL
        SELECT 'pg_constraint'::regclass, oid
        FROM pg_catalog.pg_constraint WHERE conrelid IN (SELECT oid FROM selected)
        UNION ALL
        SELECT 'pg_trigger'::regclass, oid
        FROM pg_catalog.pg_trigger
        WHERE tgrelid IN (SELECT oid FROM selected) AND NOT tgisinternal
      ), exported_functions AS (
        SELECT DISTINCT tgfoid AS oid
        FROM pg_catalog.pg_trigger
        WHERE tgrelid IN (SELECT oid FROM selected) AND NOT tgisinternal
      ), referenced AS (
        SELECT DISTINCT dependency.refclassid, dependency.refobjid
        FROM pg_catalog.pg_depend dependency
        JOIN owned ON owned.classid = dependency.classid
          AND owned.objid = dependency.objid
        WHERE dependency.deptype <> 'p'
          AND dependency.refclassid IN (
            'pg_type'::regclass, 'pg_proc'::regclass, 'pg_extension'::regclass)
      ), external AS (
        SELECT
          referenced.refclassid,
          referenced.refobjid,
          (SELECT extension.extname
           FROM pg_catalog.pg_depend member
           JOIN pg_catalog.pg_extension extension ON extension.oid = member.refobjid
           WHERE member.classid = referenced.refclassid
             AND member.objid = referenced.refobjid
             AND member.deptype = 'e') AS extension_name
        FROM referenced
        WHERE NOT (
            referenced.refclassid = 'pg_type'::regclass
            AND EXISTS (
              SELECT FROM pg_catalog.pg_type candidate
              WHERE candidate.oid = referenced.refobjid
                AND (
                  candidate.typnamespace IN (
                    'pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                  OR candidate.typrelid IN (SELECT oid FROM selected)
                  OR EXISTS (
                    SELECT FROM pg_catalog.pg_type element
                    WHERE element.oid = candidate.typelem
                      AND element.typrelid IN (SELECT oid FROM selected))
                )
            )
          )
          AND NOT (
            referenced.refclassid = 'pg_proc'::regclass
            AND EXISTS (
              SELECT FROM pg_catalog.pg_proc candidate
              WHERE candidate.oid = referenced.refobjid
                AND (
                  candidate.pronamespace IN (
                    'pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                  OR candidate.oid IN (SELECT oid FROM exported_functions)
                )
            )
          )
      )
      SELECT DISTINCT CASE
        WHEN extension_name IS NOT NULL THEN 'extension ' || extension_name
        WHEN refclassid = 'pg_type'::regclass
          THEN 'type ' || (
            SELECT quote_ident(schema.nspname) || '.' || quote_ident(named.typname)
            FROM pg_catalog.pg_type named
            JOIN pg_catalog.pg_namespace schema ON schema.oid = named.typnamespace
            WHERE named.oid = refobjid)
        WHEN refclassid = 'pg_proc'::regclass
          THEN 'function ' || (
            SELECT quote_ident(schema.nspname) || '.' || quote_ident(named.proname)
              || '(' || pg_catalog.pg_get_function_identity_arguments(named.oid) || ')'
            FROM pg_catalog.pg_proc named
            JOIN pg_catalog.pg_namespace schema ON schema.oid = named.pronamespace
            WHERE named.oid = refobjid)
        ELSE 'extension ' || (
          SELECT extname FROM pg_catalog.pg_extension WHERE oid = refobjid)
      END AS missing_object
      FROM external
      ORDER BY 1;")"

[[ -z "$source_dependencies" ]] || {
  printf 'Source Mastra tables depend on objects a table-filtered pg_dump does not carry; refusing before target mutation or data copy.\n' >&2
  printf '%s\n' "$source_dependencies" >&2
  printf 'Create these objects in %s as the owner, or export them alongside the table DDL, then re-run this migration.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  exit 1
}

# This migration is not idempotent: the schema apply below is a plain
# `CREATE TABLE` run. A retry after a run that created the schema and then
# failed (a lost data copy, an interrupted deploy) dies inside PostgreSQL with
# `relation "mastra_agent_versions" already exists`, which tells the operator
# nothing about what to do next. Refuse here instead, in both modes, and say
# it. The check is also the merge guard the `--copy-existing` path used to do
# on its own: an existing target table means two histories, whether or not it
# holds rows yet.
existing_target_tables="$(docker exec "$postgres_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname "$MASTRA_DATABASE_NAME" --tuples-only --no-align --command "$1"' \
  sh "SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\\'
      ORDER BY tablename COLLATE \"C\";")"

[[ -z "$existing_target_tables" ]] || {
  printf 'Mastra target %s already contains Mastra tables; this migration is not idempotent and refuses to re-apply the schema or merge two histories.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  printf '%s\n' "$existing_target_tables" >&2
  printf 'The target is disposable and the source mastra_* tables are the rollback point. Drop and recreate the empty target database as the owner, then re-run this migration; the order is in docs/operations/production-deploy.md, step 4 of the Mastra split.\n' >&2
  exit 1
}

# A table-filtered pg_dump includes table-owned indexes, constraints and
# triggers, but PostgreSQL does not include objects those tables depend on.
# Export the exact trigger functions referenced by the selected source tables
# first, then append the table DDL. Both reads happen inside the owner container;
# no database credential crosses argv or enters the application container.
docker exec "$postgres_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname "$POSTGRES_DB" --tuples-only --no-align --command "$1"' \
  sh "SELECT pg_get_functiondef(function.oid) || ';'
      FROM pg_catalog.pg_proc function
      WHERE function.oid IN (
        SELECT DISTINCT trigger.tgfoid
        FROM pg_catalog.pg_trigger trigger
        JOIN pg_catalog.pg_class table_object ON table_object.oid = trigger.tgrelid
        JOIN pg_catalog.pg_namespace schema ON schema.oid = table_object.relnamespace
        WHERE NOT trigger.tgisinternal
          AND schema.nspname = 'public'
          AND table_object.relname LIKE 'mastra\_%' ESCAPE '\\'
      )
      ORDER BY function.oid;" >"$schema_sql"

docker exec "$postgres_container" sh -ceu '
  exec pg_dump --schema-only --no-owner --no-privileges --strict-names \
    --table="public.mastra_*" --username "$POSTGRES_USER" --no-password \
    "$POSTGRES_DB"
' >>"$schema_sql"

[[ -s "$schema_sql" ]] || {
  printf 'Mastra schema export was empty.\n' >&2
  exit 1
}
schema_tables="$(awk '
  /^CREATE TABLE / {
    name = $3
    gsub(/"/, "", name)
    sub(/^public\./, "", name)
    print name
  }
' "$schema_sql" | LC_ALL=C sort)"
[[ "$schema_tables" == "$expected_tables" ]] || {
  printf 'Source schema dump differs from the 29-table deployment contract; refusing before target mutation or data copy.\n' >&2
  diff -u <(printf '%s\n' "$expected_tables") <(printf '%s\n' "$schema_tables") >&2 || true
  exit 1
}
grep -Fq 'mastra_' "$schema_sql" || {
  printf 'Mastra schema export did not contain the expected storage objects.\n' >&2
  exit 1
}
if grep -Eiq 'CREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX[[:space:]]+CONCURRENTLY' "$schema_sql"; then
  printf 'Mastra schema export requires a non-transactional index; refusing it.\n' >&2
  exit 1
fi

# Schema ownership and every DDL statement stay with POSTGRES_USER. The runtime
# receives existing-object DML only; default privileges cover future owner-run
# Mastra migrations.
{
  printf '\\set ON_ERROR_STOP on\n'
  cat "$schema_sql"
  cat <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL ON SCHEMA public FROM %I', :'mastra_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'mastra_role') \gexec
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'mastra_role'
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SQL
} | docker exec -i "$postgres_container" sh -ceu '
  exec psql --username "$POSTGRES_USER" --no-password \
    --dbname "$MASTRA_DATABASE_NAME" --single-transaction \
    --set=owner_role="$POSTGRES_USER" \
    --set=mastra_role="$MASTRA_RUNTIME_USER"
'

if [[ "$copy_existing" -eq 1 ]]; then
  # The source product tables are deliberately retained for a rollback. Disable
  # target triggers while replaying the source rows so history is copied
  # byte-for-byte instead of being transformed a second time. Both programs
  # execute as the database owner inside the container; no credential crosses
  # argv.
  docker exec "$postgres_container" sh -ceu '
    set -o pipefail
    pg_dump --data-only --disable-triggers --no-owner --no-privileges \
      --table="public.mastra_*" --username "$POSTGRES_USER" --no-password \
      "$POSTGRES_DB" |
      psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
        --dbname "$MASTRA_DATABASE_NAME" --single-transaction
  '
fi

printf 'Mastra PostgreSQL storage migration completed.\n'
