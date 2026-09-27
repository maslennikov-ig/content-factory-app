#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# Owner-only, in-place upgrade of the separate Mastra database from the
# `@mastra/pg` 1.8.5 schema (the 29-table contract of migrate-mastra-storage.sh)
# to the `@mastra/pg` 1.27.1 schema (45 tables).
#
# migrate-mastra-storage.sh is the one-time split and cannot do this: it refuses
# any existing target table and any CONCURRENTLY index by design. This script
# applies the committed, reviewed SQL next to it, as POSTGRES_USER, inside one
# `psql --single-transaction`, and proves the change it made before COMMIT:
#
#   * the target is exactly the 29 names (upgrade) or empty with --from-empty
#     (fresh install: committed base schema, then the same upgrade SQL);
#     exactly the 45 names is a no-op; anything else is refused untouched;
#   * a TEXT `mastra_workflow_snapshot.snapshot` (production's legacy shape)
#     is converted to jsonb first, in the same transaction, by the reviewed
#     mastra-storage-snapshot-jsonb.sql; a row that is not valid jsonb refuses
#     the whole run, and the only schema change that step may make is that one
#     column type;
#   * after the upgrade the table set is exactly the 45 names, no index is
#     INVALID, and the schema delta (columns, indexes, constraints, column
#     order ignored) equals mastra-storage-upgrade-1.27.1.delta line for line.
#     Any mismatch raises inside the transaction, so the database stays at 29.
#
# Never replace this with Mastra's own init (`disableInit: false`) or with
# `prisma db push` in production. The runbook step is R3 in
# docs/operations/production-deploy.md, section "Обновление хранилища Mastra".

readonly postgres_container="${CF_POSTGRES_CONTAINER:-cf-next-postgres}"
readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly base_sql="$script_dir/mastra-storage-base-1.8.5.sql"
readonly upgrade_sql="$script_dir/mastra-storage-upgrade-1.27.1.sql"
readonly snapshot_sql="$script_dir/mastra-storage-snapshot-jsonb.sql"
readonly expected_delta="$script_dir/mastra-storage-upgrade-1.27.1.delta"
# The four files above are reviewed artifacts. An edited copy is refused
# rather than applied; tests/mastra-upgrade.execution.test.cjs keeps these
# constants equal to the committed files.
readonly base_sql_sha256='58e12875d7e3bd64f18471f5c85c094680264225e8b29be71c7c3f204de4b4ac'
readonly upgrade_sql_sha256='b7254fb6cd3f6630a1ba60b1667e630cfdd3f32e79b2a00ac1c969d53e2fedf5'
readonly snapshot_sql_sha256='d2293dfa92d6c84e6f23f3d28874f779f70fbf9d3b157ada2e044f3b70a3d713'
readonly expected_delta_sha256='e6bf59581c9f893061538bf1e6af84ad8e65b2a50e5a8edbc05a8a9c92133485'

from_empty=0

usage() {
  printf 'Usage: %s [--from-empty]\n' "$0" >&2
}

if [[ "${1:-}" == '--from-empty' ]]; then
  from_empty=1
  shift
fi
[[ "$#" -eq 0 ]] || {
  usage
  exit 2
}

: "${MASTRA_DATABASE_NAME:?Load the production .env before running this owner-only upgrade.}"
: "${MASTRA_RUNTIME_USER:?Load the production .env before running this owner-only upgrade.}"

for identifier in "$MASTRA_DATABASE_NAME" "$MASTRA_RUNTIME_USER"; do
  [[ "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
done

for pair in \
  "$base_sql=$base_sql_sha256" \
  "$upgrade_sql=$upgrade_sql_sha256" \
  "$snapshot_sql=$snapshot_sql_sha256" \
  "$expected_delta=$expected_delta_sha256"; do
  file="${pair%=*}"
  want="${pair##*=}"
  [[ -s "$file" ]] || {
    printf 'Reviewed upgrade artifact is missing: %s\n' "$file" >&2
    exit 1
  }
  have="$(sha256sum "$file" | cut -d' ' -f1)"
  [[ "$have" == "$want" ]] || {
    printf 'Reviewed upgrade artifact was changed after review; refusing: %s\n' "$file" >&2
    exit 1
  }
done

# Where the 45 names come from: the `public.mastra_*` tables of a database
# created by `@mastra/pg` 1.8.5 (plus the legacy `mastra_evals`/`mastra_traces`)
# and upgraded in place by the version pinned in `package.json` as
# `"@mastra/pg": "^1.27.1"` (resolved to 1.27.1 in `pnpm-lock.yaml`). The same
# list is kept in `scripts/operations/verify-mastra-storage-upgrade.sh` and
# `tests/mastra-upgrade.execution.test.cjs`; the test fails when they drift.
# When `@mastra/pg` moves: capture the new DDL log on the stand, write a new
# upgrade SQL file (never edit the reviewed one), re-read this list from the
# upgraded database, update all three copies and the version in this comment,
# and re-run `scripts/operations/verify-mastra-storage-upgrade.sh`.
readonly expected_tables="$(cat <<'TABLES'
mastra_agent_versions
mastra_agents
mastra_ai_spans
mastra_background_tasks
mastra_channel_config
mastra_channel_installations
mastra_dataset_items
mastra_dataset_versions
mastra_datasets
mastra_evals
mastra_experiment_results
mastra_experiments
mastra_favorites
mastra_knowledge_activity
mastra_knowledge_cursors
mastra_knowledge_mentions
mastra_knowledge_nodes
mastra_knowledge_records
mastra_knowledge_semantic_outbox
mastra_mcp_client_versions
mastra_mcp_clients
mastra_mcp_server_versions
mastra_mcp_servers
mastra_messages
mastra_notifications
mastra_observational_memory
mastra_prompt_block_versions
mastra_prompt_blocks
mastra_resources
mastra_schedule_triggers
mastra_schedules
mastra_scorer_definition_versions
mastra_scorer_definitions
mastra_scorers
mastra_skill_blobs
mastra_skill_versions
mastra_skills
mastra_thread_state
mastra_threads
mastra_tool_provider_connections
mastra_traces
mastra_workflow_definitions
mastra_workflow_snapshot
mastra_workspace_versions
mastra_workspaces
TABLES
)"

# The 29-name source contract is not a fourth hand-written list: it is the 45
# names minus the tables the upgrade SQL creates.
readonly new_tables="$(grep -oE '^CREATE TABLE IF NOT EXISTS "public"\."mastra_[a-z_]+"' "$upgrade_sql" |
  sed -E 's/.*"(mastra_[a-z_]+)"$/\1/' | LC_ALL=C sort)"
readonly previous_tables="$(LC_ALL=C comm -23 \
  <(printf '%s\n' "$expected_tables") <(printf '%s\n' "$new_tables"))"
[[ "$(printf '%s\n' "$expected_tables" | wc -l)" -eq 45 &&
  "$(printf '%s\n' "$new_tables" | wc -l)" -eq 16 &&
  "$(printf '%s\n' "$previous_tables" | wc -l)" -eq 29 ]] || {
  printf 'Upgrade contract is inconsistent: expected 45 = 29 + 16 table names.\n' >&2
  exit 1
}

# Every read and write runs inside the owner container as POSTGRES_USER; the
# host-validated database name is handed over explicitly, no credential
# crosses argv.
query() {
  docker exec --env CF_MASTRA_DATABASE="$MASTRA_DATABASE_NAME" \
    "$postgres_container" sh -ceu \
    'exec psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
      --dbname "$CF_MASTRA_DATABASE" --tuples-only --no-align --command "$1"' \
    sh "$1"
}

readonly table_sql="SELECT tablename FROM pg_catalog.pg_tables
  WHERE schemaname = 'public' AND tablename LIKE 'mastra\\_%' ESCAPE '\\'
  ORDER BY tablename COLLATE \"C\";"
readonly invalid_index_sql="SELECT count(*) FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'mastra\\_%' ESCAPE '\\'
    AND NOT (i.indisvalid AND i.indisready);"
# Canonical read-only fingerprint, identical to the runbook's
# (docs/operations/production-deploy.md), so the printed hash is comparable.
readonly fingerprint_sql="SELECT definition
FROM (
  SELECT 'column:'||table_name||':'||column_name||':'||ordinal_position||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'') AS definition
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name LIKE 'mastra_%'
  UNION ALL
  SELECT 'index:'||tablename||':'||indexname||':'||indexdef
  FROM pg_indexes
  WHERE schemaname='public' AND tablename LIKE 'mastra_%'
  UNION ALL
  SELECT 'constraint:'||c.relname||':'||con.conname||':'||pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class c ON c.oid=con.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'mastra_%'
) AS definitions
ORDER BY definition;"

print_state() {
  printf 'mastra tables: %s\n' "$(query "$table_sql" | grep -c . || true)"
  printf 'invalid mastra indexes: %s\n' "$(query "$invalid_index_sql")"
  printf 'canonical fingerprint: %s\n' \
    "$(query "$fingerprint_sql" | sha256sum | cut -d' ' -f1)"
}

current_tables="$(query "$table_sql")"

if [[ "$current_tables" == "$expected_tables" ]]; then
  invalid="$(query "$invalid_index_sql")"
  [[ "$invalid" == '0' ]] || {
    printf 'Mastra target %s has the 45 names but %s invalid indexes; refusing to call it upgraded.\n' \
      "$MASTRA_DATABASE_NAME" "$invalid" >&2
    exit 1
  }
  printf 'Mastra target %s already has the exact 45-table contract; nothing applied.\n' \
    "$MASTRA_DATABASE_NAME"
  print_state
  exit 0
fi

if [[ "$from_empty" -eq 1 ]]; then
  [[ -z "$current_tables" ]] || {
    printf 'Refusing --from-empty: Mastra target %s already contains Mastra tables.\n' \
      "$MASTRA_DATABASE_NAME" >&2
    exit 1
  }
elif [[ -z "$current_tables" ]]; then
  printf 'Mastra target %s has no Mastra tables. For a fresh install re-run with --from-empty; otherwise the wrong database is configured.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  exit 1
elif [[ "$current_tables" != "$previous_tables" ]]; then
  printf 'Mastra target %s is neither the 29-table (@mastra/pg 1.8.5) nor the 45-table (@mastra/pg 1.27.1) contract; refusing before any change.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  diff -u <(printf '%s\n' "$previous_tables") <(printf '%s\n' "$current_tables") >&2 || true
  exit 1
fi

# Preflight facts the SQL depends on. All read-only.
database_owned="$(query "SELECT pg_catalog.pg_get_userbyid(datdba) = current_user
  FROM pg_catalog.pg_database WHERE datname = current_database();")"
[[ "$database_owned" == 't' ]] || {
  printf 'Mastra target %s is not owned by POSTGRES_USER. Runtime grants on new tables come only from the owner default privileges; refusing.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  exit 1
}
runtime_present="$(query "SELECT count(*) FROM pg_catalog.pg_roles
  WHERE rolname = '$MASTRA_RUNTIME_USER';")"
[[ "$runtime_present" == '1' ]] || {
  printf 'Mastra runtime role is missing; run deploy/production/bootstrap-app-db.sh first.\n' >&2
  exit 1
}

if [[ "$from_empty" -eq 0 ]]; then
  snapshot_type="$(query "SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mastra_workflow_snapshot'
      AND column_name = 'snapshot';")"
  case "$snapshot_type" in
    jsonb) ;;
    text)
      # Production's legacy shape. Read-only check here for an early, clear
      # refusal; the same check runs again under the table lock inside the
      # transaction, so a row written in between cannot slip through.
      snapshot_rows="$(query "SELECT count(*) || ':' || count(*) FILTER (WHERE NOT pg_input_is_valid(snapshot, 'jsonb'))
        FROM public.mastra_workflow_snapshot;")"
      [[ "${snapshot_rows#*:}" == '0' ]] || {
        printf 'mastra_workflow_snapshot has %s rows whose snapshot is not valid jsonb (of %s); the column cannot be converted. Refusing before any change.\n' \
          "${snapshot_rows#*:}" "${snapshot_rows%%:*}" >&2
        exit 1
      }
      printf 'snapshot column: text, %s rows, all valid jsonb; converted to jsonb inside the upgrade transaction.\n' \
        "${snapshot_rows%%:*}"
      ;;
    *)
      printf 'mastra_workflow_snapshot.snapshot is %s, neither jsonb nor text; the upgrade builds jsonb expression indexes on it. Refusing before any change.\n' \
        "${snapshot_type:-missing}" >&2
      exit 1
      ;;
  esac
  function_state="$(query "SELECT count(*) FILTER (WHERE p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user))
    || ':' || count(*)
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trigger_set_timestamps' AND p.pronargs = 0;")"
  [[ "$function_state" == '1:1' ]] || {
    printf 'public.trigger_set_timestamps() is missing or not owned by POSTGRES_USER (%s); CREATE OR REPLACE would re-create it with PUBLIC EXECUTE. Refusing.\n' \
      "$function_state" >&2
    exit 1
  }
  invalid_before="$(query "$invalid_index_sql")"
  [[ "$invalid_before" == '0' ]] || {
    printf 'Mastra target has %s invalid indexes before the upgrade; repair them first.\n' \
      "$invalid_before" >&2
    exit 1
  }
  # The two UNIQUE indexes the upgrade adds are on new tables or on a new
  # nullable column, so existing rows cannot collide; the counts are printed
  # for the release record (premortem M8).
  printf 'rows before: %s\n' "$(query "SELECT
    'experiments=' || (SELECT count(*) FROM public.mastra_experiments)
    || ' experiment_results=' || (SELECT count(*) FROM public.mastra_experiment_results)
    || ' datasets=' || (SELECT count(*) FROM public.mastra_datasets)
    || ' dataset_items=' || (SELECT count(*) FROM public.mastra_dataset_items)
    || ' threads=' || (SELECT count(*) FROM public.mastra_threads)
    || ' messages=' || (SELECT count(*) FROM public.mastra_messages);")"
  printf 'before:\n'
  print_state
fi

readonly temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
readonly apply_sql="$temp_dir/apply.sql"

grep -q '\$cf_delta\$' "$expected_delta" && {
  printf 'Expected delta contains the quoting tag; refusing.\n' >&2
  exit 1
}

readonly normalized_sql="SELECT definition FROM (
  SELECT 'column:'||table_name||':'||column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'') AS definition
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name LIKE 'mastra\\_%' ESCAPE '\\'
  UNION ALL
  SELECT 'index:'||tablename||':'||indexname||':'||indexdef
  FROM pg_indexes
  WHERE schemaname='public' AND tablename LIKE 'mastra\\_%' ESCAPE '\\'
  UNION ALL
  SELECT 'constraint:'||c.relname||':'||con.conname||':'||pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class c ON c.oid=con.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'mastra\\_%' ESCAPE '\\'
) AS definitions"

{
  printf '\\set ON_ERROR_STOP on\n'
  # The app keeps running during the upgrade; do not queue behind a long
  # reader forever. A lock timeout aborts the transaction; rerun.
  printf "SET lock_timeout = '30s';\n"
  if [[ "$from_empty" -eq 1 ]]; then
    cat "$base_sql"
  fi
  printf 'CREATE TEMP TABLE cf_mastra_original ON COMMIT DROP AS %s;\n' "$normalized_sql"
  cat "$snapshot_sql"
  printf 'CREATE TEMP TABLE cf_mastra_before ON COMMIT DROP AS %s;\n' "$normalized_sql"
  cat "$upgrade_sql"
  cat <<'SQL'
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'mastra_role'
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'mastra_role'
) \gexec
SQL
  printf 'CREATE TEMP TABLE cf_mastra_after ON COMMIT DROP AS %s;\n' "$normalized_sql"
  printf 'CREATE TEMP TABLE cf_mastra_expected_delta ON COMMIT DROP AS\n'
  printf '  SELECT line FROM unnest(string_to_array($cf_delta$'
  # Drop the final newline so the array has no empty trailing element.
  printf '%s' "$(cat "$expected_delta")"
  printf '$cf_delta$, E%s)) AS line;\n' "'\\n'"
  printf 'CREATE TEMP TABLE cf_mastra_expected_tables ON COMMIT DROP AS\n'
  printf '  SELECT name FROM unnest(string_to_array($cf_tables$%s$cf_tables$, E%s)) AS name;\n' \
    "$expected_tables" "'\\n'"
  cat <<'SQL'
DO $cf_postcondition$
DECLARE
  missing_tables text;
  extra_tables text;
  invalid_indexes integer;
  unexpected text;
  absent text;
  converted text;
BEGIN
  -- The snapshot pre-step may change exactly one thing: the snapshot column
  -- from text to jsonb (or nothing when it already was jsonb).
  SELECT string_agg(line, E'\n' ORDER BY line COLLATE "C") INTO converted
  FROM (
    SELECT '+' || definition AS line FROM (
      SELECT definition FROM cf_mastra_before
      EXCEPT SELECT definition FROM cf_mastra_original) AS added
    UNION ALL
    SELECT '-' || definition FROM (
      SELECT definition FROM cf_mastra_original
      EXCEPT SELECT definition FROM cf_mastra_before) AS removed
  ) AS pre_step;
  IF converted IS NOT NULL AND converted <> E'+column:mastra_workflow_snapshot:snapshot:jsonb:jsonb:NO:\n-column:mastra_workflow_snapshot:snapshot:text:text:NO:' THEN
    RAISE EXCEPTION 'Mastra snapshot pre-step changed more than the snapshot column type; rolled back.'
      USING DETAIL = converted;
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name) INTO missing_tables
  FROM (SELECT name FROM cf_mastra_expected_tables
        EXCEPT SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname = 'public') AS missing;
  SELECT string_agg(tablename, ', ' ORDER BY tablename) INTO extra_tables
  FROM (SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\'
        EXCEPT SELECT name FROM cf_mastra_expected_tables) AS extra;
  IF missing_tables IS NOT NULL OR extra_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Mastra upgrade did not reach the 45-table contract; rolled back.'
      USING DETAIL = format('missing: %s; extra: %s', missing_tables, extra_tables);
  END IF;

  SELECT count(*) INTO invalid_indexes
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'mastra\_%' ESCAPE '\'
    AND NOT (i.indisvalid AND i.indisready);
  IF invalid_indexes <> 0 THEN
    RAISE EXCEPTION 'Mastra upgrade left % invalid indexes; rolled back.', invalid_indexes;
  END IF;

  WITH actual AS (
    SELECT '+' || definition AS line FROM (
      SELECT definition FROM cf_mastra_after
      EXCEPT SELECT definition FROM cf_mastra_before) AS added
    UNION ALL
    SELECT '-' || definition FROM (
      SELECT definition FROM cf_mastra_before
      EXCEPT SELECT definition FROM cf_mastra_after) AS removed
  )
  SELECT
    (SELECT string_agg(line, E'\n' ORDER BY line COLLATE "C")
     FROM (SELECT line FROM actual EXCEPT SELECT line FROM cf_mastra_expected_delta) AS u),
    (SELECT string_agg(line, E'\n' ORDER BY line COLLATE "C")
     FROM (SELECT line FROM cf_mastra_expected_delta EXCEPT SELECT line FROM actual) AS a)
  INTO unexpected, absent;
  IF unexpected IS NOT NULL OR absent IS NOT NULL THEN
    RAISE EXCEPTION 'Mastra upgrade changed the schema differently from the reviewed delta; rolled back.'
      USING DETAIL = format(E'unexpected:\n%s\nexpected but absent:\n%s',
        coalesce(unexpected, '(none)'), coalesce(absent, '(none)'));
  END IF;
END
$cf_postcondition$;
SQL
} >"$apply_sql"

docker exec -i --env CF_MASTRA_DATABASE="$MASTRA_DATABASE_NAME" \
  --env CF_MASTRA_ROLE="$MASTRA_RUNTIME_USER" "$postgres_container" sh -ceu '
  exec psql -X --quiet --username "$POSTGRES_USER" --no-password \
    --dbname "$CF_MASTRA_DATABASE" --single-transaction \
    --set=mastra_role="$CF_MASTRA_ROLE"
' <"$apply_sql" >"$temp_dir/apply.log" 2>&1 || {
  # psql prints NOTICEs for every IF NOT EXISTS skip; show only what matters.
  grep -v '^NOTICE:\|^psql:.*NOTICE:' "$temp_dir/apply.log" >&2 || true
  printf 'Mastra storage upgrade failed; the transaction was rolled back and %s is unchanged. Fix the cause and re-run.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  exit 1
}

after_tables="$(query "$table_sql")"
[[ "$after_tables" == "$expected_tables" ]] || {
  printf 'Mastra target %s does not have the 45-table contract after COMMIT; follow the recovery in docs/operations/production-deploy.md.\n' \
    "$MASTRA_DATABASE_NAME" >&2
  exit 1
}

if [[ "$from_empty" -eq 1 ]]; then
  printf 'Mastra storage created from empty: 0 -> 45 tables.\n'
else
  printf 'Mastra storage upgrade applied: 29 -> 45 tables.\n'
fi
printf 'after:\n'
print_state
