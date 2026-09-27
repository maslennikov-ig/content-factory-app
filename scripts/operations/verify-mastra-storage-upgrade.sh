#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

# Real proof of deploy/production/upgrade-mastra-storage.sh against a
# disposable PostgreSQL 17 container on the local Docker daemon. Nothing here
# reaches a shared, stand or production database: the container, its volume
# and every role in it are created by this script and removed on exit.
#
# Cases (premortem kcxz.4, P4):
#   upgrade      29-table 1.8.5 schema + seeded rows -> 45 tables, canonical
#                fingerprint == committed, 0 invalid indexes, seeded rows
#                identical, runtime DML on a new table, runtime CREATE refused,
#                check-postgres-role-isolation.sh green; second run is a no-op
#   interrupted  a failure midway leaves exactly the 29-table schema; rerun
#                after removing the cause reaches 45
#   drift        a target whose change would differ from the reviewed delta
#                is rolled back at 29
#   refused      an extra table is refused before any change
#   production   production's own 29-table shape (schema-only copy, synthetic
#                rows, text `snapshot`) reaches 45 with a jsonb `snapshot`,
#                rows semantically identical, isolation green, second run
#                no-op; a snapshot row that is not valid jsonb refuses the run
#                untouched, both in the preflight and inside the transaction
#   fresh        an empty target is refused without --from-empty and reaches
#                the same 45-table fingerprint with it
#
# --from-dump <mastra.dump> runs one case instead (runbook R2): a production
# backup's Mastra archive restored into the disposable container, upgraded
# twice, rows unchanged (snapshots compared as jsonb), 0 invalid indexes,
# 45 tables. The archive is read
# only; everything restored dies with the container.

from_dump=''
if [[ "${1:-}" == '--from-dump' ]]; then
  from_dump="${2:?--from-dump needs a mastra.dump path}"
  [[ -r "$from_dump" ]] || { printf 'Cannot read %s\n' "$from_dump" >&2; exit 1; }
fi
readonly from_dump

readonly image='postgres:17-alpine'
readonly suffix="$(date -u +%Y%m%d%H%M%S)-$$-${RANDOM}"
readonly container="cf-mastra-upgrade-proof-${suffix}"
readonly volume="cf-mastra-upgrade-proof-data-${suffix}"
readonly owner_user='cfproof'
readonly product_database='contentfactory'
readonly mastra_database='contentfactory_mastra'
readonly product_runtime_user='cf_runtime'
readonly mastra_runtime_user='cf_mastra_runtime'
readonly listmonk_database='listmonk'
readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly repo_root="$(cd -- "$script_dir/../.." && pwd)"
readonly upgrade_script="$repo_root/deploy/production/upgrade-mastra-storage.sh"
readonly bootstrap_script="$repo_root/deploy/production/bootstrap-app-db.sh"
readonly isolation_script="$repo_root/scripts/operations/check-postgres-role-isolation.sh"
readonly base_sql="$repo_root/deploy/production/mastra-storage-base-1.8.5.sql"
readonly production_shape_sql="$repo_root/deploy/production/mastra-storage-production-shape.sql"
readonly snapshot_sql="$repo_root/deploy/production/mastra-storage-snapshot-jsonb.sql"

# Canonical fingerprints (the runbook's read-only definition query, sha256 of
# its output) of the committed reference schemas. The 45-table value is the
# same for an upgraded database and for a fresh install (--from-empty), because
# both apply the same two files. Production's own 29-table fingerprint differs
# from the reference one (it carries history the reference does not); there
# the upgrade script proves the delta instead, and the `production` case below
# pins both ends of that path on a schema-only copy of production.
readonly expected_base_fingerprint='541482bda91b5e6cc2e70b1f7ea928d80b45772471aa87a75bb3e40e8dcb0c53'
readonly expected_upgraded_fingerprint='38dd03cc29b0958c09426a531e72dcfd70d9ddb3aa8186666d6ea1c5aa26322d'
readonly expected_production_fingerprint='310d75fcf3e36475d5524559d1437522685534915f85f45d1e7c3b219acac8f7'
readonly expected_production_upgraded_fingerprint='a8cdfd9101f62ed7316e5744611007ba055adc50be740cba23fe71b007d47d97'

# One of three hand-written copies of the 45-name upgrade contract; the
# provenance and the pinned `@mastra/pg` version are recorded once, at the list
# in `deploy/production/upgrade-mastra-storage.sh`.
# `tests/mastra-upgrade.execution.test.cjs` fails if the copies drift apart.
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
readonly table_sql="SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mastra\\_%' ESCAPE '\\' ORDER BY tablename COLLATE \"C\";"
readonly invalid_index_sql="SELECT count(*) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname LIKE 'mastra\\_%' ESCAPE '\\' AND NOT (i.indisvalid AND i.indisready);"
# Tables the upgrade does not alter; their rows must survive byte for byte.
# Snapshots are compared as jsonb: a text column converted to jsonb keeps every
# value but normalises its spelling (whitespace, key order).
readonly seeded_digest_sql="SELECT string_agg(part, ' ' ORDER BY part) FROM (
  SELECT 'threads=' || md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) AS part FROM public.mastra_threads t
  UNION ALL SELECT 'messages=' || md5(coalesce(string_agg(m::text, E'\\n' ORDER BY m::text), '')) FROM public.mastra_messages m
  UNION ALL SELECT 'resources=' || md5(coalesce(string_agg(r::text, E'\\n' ORDER BY r::text), '')) FROM public.mastra_resources r
  UNION ALL SELECT 'snapshots=' || md5(coalesce(string_agg(v, E'\\n' ORDER BY v), '')) FROM (SELECT jsonb_build_array(to_jsonb(s) - 'snapshot', s.snapshot::jsonb)::text AS v FROM public.mastra_workflow_snapshot s) AS s
  UNION ALL SELECT 'evals=' || md5(coalesce(string_agg(e::text, E'\\n' ORDER BY e::text), '')) FROM public.mastra_evals e
  UNION ALL SELECT 'traces=' || md5(coalesce(string_agg(x::text, E'\\n' ORDER BY x::text), '')) FROM public.mastra_traces x
) AS parts;"

work_dir=''
container_created=0
volume_created=0

fail() {
  printf '%s\n' "$1" >&2
  return 1
}

cleanup() {
  local status=$?
  set +e
  if [[ "$container_created" -eq 1 ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || status=1
  fi
  if [[ "$volume_created" -eq 1 ]]; then
    docker volume rm "$volume" >/dev/null 2>&1 || status=1
  fi
  if [[ -n "$work_dir" ]]; then
    rm -rf -- "$work_dir" || status=1
  fi
  if [[ "$container_created" -eq 1 ]] && docker container inspect "$container" >/dev/null 2>&1; then
    printf 'Cleanup left disposable container %s.\n' "$container" >&2
    status=1
  fi
  if [[ "$volume_created" -eq 1 ]] && docker volume inspect "$volume" >/dev/null 2>&1; then
    printf 'Cleanup left disposable volume %s.\n' "$volume" >&2
    status=1
  fi
  if [[ "$status" -eq 0 ]]; then
    printf 'Cleanup inventory empty: container=%s volume=%s artifacts=%s.\n' \
      "$container" "$volume" "$work_dir"
  fi
  exit "$status"
}

# A real query over TCP is the only wait that means the container is serving;
# the unix socket answers the temporary initdb server too.
wait_for_database() {
  local attempt
  for attempt in $(seq 1 60); do
    if docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
      --host 127.0.0.1 --username "$owner_user" --dbname "$product_database" \
      --tuples-only --no-align --command 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "Disposable PostgreSQL container $container did not become ready."
}

owner_sql() {
  docker exec -i "$container" psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 \
    --username "$owner_user" --dbname "$1" >/dev/null
}

owner_query() {
  docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$owner_user" --dbname "$1" --tuples-only --no-align \
    --command "$2"
}

runtime_query() {
  docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$mastra_runtime_user" --dbname "$mastra_database" \
    --tuples-only --no-align --command "$1"
}

fingerprint() {
  owner_query "$mastra_database" "$fingerprint_sql" | sha256sum | cut -d' ' -f1
}

table_count() {
  owner_query "$mastra_database" "$table_sql" | grep -c . || true
}

# Owner-side environment the three production scripts expect on the host.
export CF_POSTGRES_CONTAINER="$container"
export POSTGRES_USER="$owner_user"
export POSTGRES_DB="$product_database"
export PRODUCT_RUNTIME_USER="$product_runtime_user"
export MASTRA_DATABASE_NAME="$mastra_database"
export MASTRA_RUNTIME_USER="$mastra_runtime_user"
export LISTMONK_DB_NAME="$listmonk_database"
PRODUCT_RUNTIME_PASSWORD="proof-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
MASTRA_RUNTIME_PASSWORD="proof-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
export PRODUCT_RUNTIME_PASSWORD MASTRA_RUNTIME_PASSWORD

# Drop the Mastra database and let the production bootstrap recreate it with
# its roles, CONNECT boundaries and owner default privileges: every case starts
# from what production has, not from a hand-made approximation.
reset_mastra() {
  docker exec "$container" dropdb --username "$owner_user" --if-exists "$mastra_database" 2>&1 |
    grep -v "does not exist, skipping" >&2 || true
  "$bootstrap_script" >"$work_dir/bootstrap.log" 2>&1 || {
    sed -n '1,80p' "$work_dir/bootstrap.log" >&2
    fail 'Production bootstrap failed inside the disposable container.'
  }
}

load_base() {
  owner_sql "$mastra_database" <"$base_sql"
}

load_production_shape() {
  owner_sql "$mastra_database" <"$production_shape_sql"
}

snapshot_type() {
  owner_query "$mastra_database" "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mastra_workflow_snapshot' AND column_name = 'snapshot';"
}

seed_rows() {
  owner_sql "$mastra_database" <<'SQL'
INSERT INTO public.mastra_resources (id, "workingMemory", metadata, "createdAt", "updatedAt")
VALUES ('org-1:user-1', 'remembered', '{"k": "v"}', '2026-09-01 10:00:00', '2026-09-01 10:00:00');
INSERT INTO public.mastra_threads (id, "resourceId", title, metadata, "createdAt", "updatedAt")
VALUES ('thread-1', 'org-1:user-1', 'Черновик поста', '{"source": "proof"}', '2026-09-01 10:00:00', '2026-09-01 10:05:00');
INSERT INTO public.mastra_messages (id, thread_id, content, role, type, "createdAt", "resourceId")
VALUES
  ('message-1', 'thread-1', '{"format":2,"parts":[{"type":"text","text":"Привет"}]}', 'user', 'v2', '2026-09-01 10:00:01', 'org-1:user-1'),
  ('message-2', 'thread-1', '{"format":2,"parts":[{"type":"text","text":"Готово"}]}', 'assistant', 'v2', '2026-09-01 10:00:02', 'org-1:user-1');
INSERT INTO public.mastra_workflow_snapshot (workflow_name, run_id, "resourceId", snapshot, "createdAt", "updatedAt")
VALUES ('agentic-loop', 'run-1', 'org-1:user-1', '{"status": "suspended", "context": {}}', '2026-09-01 10:00:03', '2026-09-01 10:00:03');
INSERT INTO public.mastra_evals (input, output, result, agent_name, metric_name, instructions, global_run_id, run_id, created_at)
VALUES ('in', 'out', '{"score": 1}', 'legacy-agent', 'legacy-metric', 'none', 'global-1', 'run-1', '2025-12-01 00:00:00');
INSERT INTO public.mastra_traces (id, name, "traceId", scope, kind, "startTime", "endTime", "createdAt")
VALUES ('trace-1', 'legacy-span', 'trace-1', 'legacy', 1, 1, 2, '2025-12-01 00:00:00');
SQL
}

run_upgrade() {
  local log_file="$1"
  shift
  "$upgrade_script" "$@" >"$log_file" 2>&1
}

show_log() {
  sed -n '1,120p' "$1" >&2
}

command -v docker >/dev/null 2>&1 || fail 'Docker is required for the real Mastra upgrade proof.'
readonly docker_endpoint="${DOCKER_HOST:-$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')}"
case "$docker_endpoint" in
  unix://* | npipe://*) ;;
  *) fail "Refusing non-local Docker endpoint: $docker_endpoint" ;;
esac
docker info >/dev/null 2>&1 || fail 'The local Docker daemon is unavailable; real Mastra upgrade proof was not run.'
docker image inspect "$image" >/dev/null 2>&1 || fail "Local image $image is required; refusing an implicit registry pull."
! docker container inspect "$container" >/dev/null 2>&1 || fail "Disposable container name collision: $container"
! docker volume inspect "$volume" >/dev/null 2>&1 || fail "Disposable volume name collision: $volume"

work_dir="$(mktemp -d)"
trap cleanup EXIT
docker volume create "$volume" >/dev/null
volume_created=1
# Passwords are throwaway values for roles that die with the container; they
# reach the container through its environment exactly as in production.
docker run -d --name "$container" \
  --volume "$volume:/var/lib/postgresql/data" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_USER="$owner_user" \
  --env POSTGRES_DB="$product_database" \
  --env PRODUCT_RUNTIME_USER="$product_runtime_user" \
  --env PRODUCT_RUNTIME_PASSWORD \
  --env MASTRA_DATABASE_NAME="$mastra_database" \
  --env MASTRA_RUNTIME_USER="$mastra_runtime_user" \
  --env MASTRA_RUNTIME_PASSWORD \
  --env LISTMONK_DB_NAME="$listmonk_database" \
  "$image" >/dev/null
container_created=1
wait_for_database
docker exec "$container" createdb --username "$owner_user" temporal
docker exec "$container" createdb --username "$owner_user" temporal_visibility
# The isolation preflight requires at least one product table to prove the
# product runtime grants on; production always has them.
owner_sql "$product_database" <<<'CREATE TABLE public.product_sentinel (id bigint PRIMARY KEY);'

# --- production copy (--from-dump) ---------------------------------------
if [[ -n "$from_dump" ]]; then
  reset_mastra
  # --no-owner/--no-privileges: objects belong to the owner, as the upgrade
  # expects, and the runtime grants come from the bootstrap's default
  # privileges rather than from role names in the archive.
  docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges \
    --username "$owner_user" --dbname "$mastra_database" <"$from_dump"
  [[ "$(table_count)" == '29' ]] || fail "Restored archive has $(table_count) mastra tables, not 29."
  restored_fingerprint="$(fingerprint)"
  printf 'Restored fingerprint: %s\n' "$restored_fingerprint"
  printf 'Restored rows: %s\n' "$(owner_query "$mastra_database" "SELECT 'threads=' || (SELECT count(*) FROM public.mastra_threads) || ' messages=' || (SELECT count(*) FROM public.mastra_messages) || ' snapshots=' || (SELECT count(*) FROM public.mastra_workflow_snapshot)")"
  dump_before="$(owner_query "$mastra_database" "$seeded_digest_sql")"
  run_upgrade "$work_dir/dump-first.log" || {
    show_log "$work_dir/dump-first.log"
    fail 'Mastra upgrade failed on the production archive.'
  }
  grep -Fq 'Mastra storage upgrade applied: 29 -> 45 tables.' "$work_dir/dump-first.log" ||
    fail 'Upgrade of the production archive did not report 29 -> 45.'
  [[ "$(owner_query "$mastra_database" "$table_sql")" == "$expected_tables" ]] ||
    fail 'Upgraded production archive does not hold the exact 45-table contract.'
  [[ "$(owner_query "$mastra_database" "$invalid_index_sql")" == '0' ]] ||
    fail 'Upgrade of the production archive left invalid indexes.'
  [[ "$(owner_query "$mastra_database" "$seeded_digest_sql")" == "$dump_before" ]] ||
    fail 'Rows of the production archive changed during the upgrade.'
  printf 'Upgraded fingerprint: %s\n' "$(fingerprint)"
  # An archive of today's production schema must land exactly where the
  # schema-only production-shape case lands.
  if [[ "$restored_fingerprint" == "$expected_production_fingerprint" ]]; then
    [[ "$(fingerprint)" == "$expected_production_upgraded_fingerprint" ]] ||
      fail 'Upgraded production archive differs from the upgraded production-shape fingerprint.'
  fi
  [[ "$(snapshot_type)" == 'jsonb' ]] ||
    fail 'Upgraded production archive still has a non-jsonb snapshot column.'
  runtime_query 'SELECT count(*) FROM public.mastra_thread_state;' >/dev/null ||
    fail 'Runtime role cannot read a new table after upgrading the production archive.'
  run_upgrade "$work_dir/dump-second.log" || {
    show_log "$work_dir/dump-second.log"
    fail 'Second upgrade run on the production archive failed.'
  }
  grep -Fq 'nothing applied' "$work_dir/dump-second.log" ||
    fail 'Second upgrade run on the production archive did not report a no-op.'
  sed 's/^/production archive run 1 | /' "$work_dir/dump-first.log"
  sed 's/^/production archive run 2 | /' "$work_dir/dump-second.log"
  printf 'Production archive: 29 -> 45, rows unchanged, 0 invalid indexes, second run no-op.\n'
  exit 0
fi

# --- upgrade ---------------------------------------------------------------
reset_mastra
load_base
seed_rows
[[ "$(table_count)" == '29' ]] || fail 'Reference base schema is not 29 tables.'
base_fingerprint="$(fingerprint)"
[[ "$base_fingerprint" == "$expected_base_fingerprint" ]] ||
  fail "Reference base fingerprint changed: $base_fingerprint"
seeded_before="$(owner_query "$mastra_database" "$seeded_digest_sql")"

run_upgrade "$work_dir/upgrade-first.log" || {
  show_log "$work_dir/upgrade-first.log"
  fail 'Mastra upgrade failed on the 29-table reference schema.'
}
grep -Fq 'Mastra storage upgrade applied: 29 -> 45 tables.' "$work_dir/upgrade-first.log" ||
  fail 'Upgrade did not report 29 -> 45.'
[[ "$(owner_query "$mastra_database" "$table_sql")" == "$expected_tables" ]] ||
  fail 'Upgraded target does not contain the exact 45-table contract.'
upgraded_fingerprint="$(fingerprint)"
[[ "$upgraded_fingerprint" == "$expected_upgraded_fingerprint" ]] ||
  fail "Upgraded fingerprint differs from the committed one: $upgraded_fingerprint"
[[ "$(owner_query "$mastra_database" "$invalid_index_sql")" == '0' ]] ||
  fail 'Upgrade left invalid indexes.'
seeded_after="$(owner_query "$mastra_database" "$seeded_digest_sql")"
[[ "$seeded_after" == "$seeded_before" ]] ||
  fail "Seeded rows changed during the upgrade: $seeded_before -> $seeded_after"

# The runtime role reaches a table the upgrade created through the owner's
# default privileges, and still cannot create anything (premortem M4/M5).
runtime_query "INSERT INTO public.mastra_thread_state (\"threadId\", type, value, \"createdAt\", \"updatedAt\") VALUES ('thread-1', 'proof', '{}', now(), now());" >/dev/null ||
  fail 'Runtime role cannot INSERT into mastra_thread_state after the upgrade.'
[[ "$(runtime_query "SELECT count(*) FROM public.mastra_thread_state WHERE \"threadId\" = 'thread-1';")" == '1' ]] ||
  fail 'Runtime role cannot read its own mastra_thread_state row.'
runtime_query "DELETE FROM public.mastra_thread_state WHERE \"threadId\" = 'thread-1';" >/dev/null ||
  fail 'Runtime role cannot DELETE from mastra_thread_state after the upgrade.'
if runtime_query 'CREATE TABLE public.mastra_runtime_probe (id integer);' >"$work_dir/runtime-create.log" 2>&1; then
  fail 'Runtime role was able to CREATE TABLE in the Mastra database.'
fi
grep -Fq 'permission denied' "$work_dir/runtime-create.log" ||
  fail 'Runtime CREATE TABLE was not refused by a permission error.'
"$isolation_script" >"$work_dir/isolation-upgrade.log" 2>&1 || {
  show_log "$work_dir/isolation-upgrade.log"
  fail 'check-postgres-role-isolation.sh failed after the upgrade.'
}

run_upgrade "$work_dir/upgrade-second.log" || {
  show_log "$work_dir/upgrade-second.log"
  fail 'Second upgrade run over the 45-table target failed.'
}
grep -Fq 'already has the exact 45-table contract; nothing applied.' "$work_dir/upgrade-second.log" ||
  fail 'Second upgrade run did not report a no-op.'
[[ "$(fingerprint)" == "$expected_upgraded_fingerprint" ]] ||
  fail 'Second upgrade run changed the schema.'

# --- interrupted -----------------------------------------------------------
# A composite type with the name of a table the upgrade creates halfway makes
# CREATE TABLE fail after earlier statements already ran in the transaction.
reset_mastra
load_base
owner_sql "$mastra_database" <<<'CREATE TYPE public.mastra_thread_state AS (probe integer);'
if run_upgrade "$work_dir/interrupted.log"; then
  fail 'Upgrade succeeded although a statement midway had to fail.'
fi
grep -Fq 'transaction was rolled back' "$work_dir/interrupted.log" ||
  fail 'Interrupted upgrade did not report the rollback.'
[[ "$(table_count)" == '29' ]] || fail "Interrupted upgrade left $(table_count) tables instead of 29."
[[ "$(fingerprint)" == "$expected_base_fingerprint" ]] ||
  fail 'Interrupted upgrade left a partial schema behind.'
owner_sql "$mastra_database" <<<'DROP TYPE public.mastra_thread_state;'
run_upgrade "$work_dir/interrupted-rerun.log" || {
  show_log "$work_dir/interrupted-rerun.log"
  fail 'Rerun after an interrupted upgrade failed.'
}
[[ "$(fingerprint)" == "$expected_upgraded_fingerprint" ]] ||
  fail 'Rerun after an interrupted upgrade did not reach the committed fingerprint.'

# --- drift -----------------------------------------------------------------
# The upgrade drops idx_experiment_results_exp_item; a target that never had it
# would change differently from the reviewed delta and must stay at 29.
reset_mastra
load_base
owner_sql "$mastra_database" <<<'DROP INDEX public.idx_experiment_results_exp_item;'
drift_before="$(fingerprint)"
if run_upgrade "$work_dir/drift.log"; then
  fail 'Upgrade accepted a target whose change differs from the reviewed delta.'
fi
grep -Fq 'differently from the reviewed delta' "$work_dir/drift.log" ||
  fail 'Drift refusal did not name the reviewed delta.'
grep -Fq 'idx_experiment_results_exp_item' "$work_dir/drift.log" ||
  fail 'Drift refusal did not show the differing definition.'
[[ "$(table_count)" == '29' && "$(fingerprint)" == "$drift_before" ]] ||
  fail 'Drift refusal left the target changed.'

# --- refused ---------------------------------------------------------------
reset_mastra
load_base
owner_sql "$mastra_database" <<<'CREATE TABLE public.mastra_unexpected (id text PRIMARY KEY);'
extra_before="$(fingerprint)"
if run_upgrade "$work_dir/extra.log"; then
  fail 'Upgrade accepted a table set that is neither 29 nor 45 names.'
fi
grep -Fq 'neither the 29-table' "$work_dir/extra.log" ||
  fail 'Extra-table refusal did not name the contract.'
grep -Fq 'mastra_unexpected' "$work_dir/extra.log" ||
  fail 'Extra-table refusal did not identify mastra_unexpected.'
[[ "$(table_count)" == '30' && "$(fingerprint)" == "$extra_before" ]] ||
  fail 'Extra-table refusal changed the target.'

# --- production ------------------------------------------------------------
# Production's own shape: text snapshot, text thread metadata, legacy scorer
# column and duplicate indexes. Synthetic rows only; the text snapshot rows are
# spelled unlike jsonb would print them, so the comparison is by value.
reset_mastra
load_production_shape
seed_rows
owner_sql "$mastra_database" <<'SQL'
INSERT INTO public.mastra_workflow_snapshot (workflow_name, run_id, "resourceId", snapshot, "createdAt", "updatedAt")
VALUES ('agentic-loop', 'run-2', 'org-1:user-1', '{ "status":"success",  "context": {"b": 2, "a": [1, "два"]}, "result": null }', '2026-09-01 10:00:04', '2026-09-01 10:00:04');
SQL
[[ "$(table_count)" == '29' ]] || fail 'Production-shape schema is not 29 tables.'
[[ "$(snapshot_type)" == 'text' ]] || fail 'Production-shape schema lost its text snapshot column.'
[[ "$(fingerprint)" == "$expected_production_fingerprint" ]] ||
  fail "Production-shape fingerprint differs from production's recorded one: $(fingerprint)"
production_rows_before="$(owner_query "$mastra_database" "$seeded_digest_sql")"
run_upgrade "$work_dir/production-first.log" || {
  show_log "$work_dir/production-first.log"
  fail 'Mastra upgrade failed on the production-shape schema.'
}
grep -Fq 'snapshot column: text, 2 rows, all valid jsonb' "$work_dir/production-first.log" ||
  fail 'Production-shape upgrade did not report the snapshot conversion.'
grep -Fq 'Mastra storage upgrade applied: 29 -> 45 tables.' "$work_dir/production-first.log" ||
  fail 'Production-shape upgrade did not report 29 -> 45.'
[[ "$(owner_query "$mastra_database" "$table_sql")" == "$expected_tables" ]] ||
  fail 'Upgraded production shape does not hold the exact 45-table contract.'
[[ "$(snapshot_type)" == 'jsonb' ]] || fail 'Production-shape snapshot column is not jsonb after the upgrade.'
[[ "$(owner_query "$mastra_database" "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('mastra_workflow_snapshot_name_status_createdat_idx', 'mastra_workflow_snapshot_threadid_idx');")" == '2' ]] ||
  fail 'Production-shape upgrade did not build the two jsonb snapshot indexes.'
[[ "$(owner_query "$mastra_database" "$invalid_index_sql")" == '0' ]] ||
  fail 'Production-shape upgrade left invalid indexes.'
production_upgraded_fingerprint="$(fingerprint)"
[[ "$production_upgraded_fingerprint" == "$expected_production_upgraded_fingerprint" ]] ||
  fail "Upgraded production-shape fingerprint differs from the committed one: $production_upgraded_fingerprint"
[[ "$(owner_query "$mastra_database" "$seeded_digest_sql")" == "$production_rows_before" ]] ||
  fail 'Production-shape rows changed during the upgrade.'
[[ "$(owner_query "$mastra_database" "SELECT snapshot->'context'->'a'->>1 FROM public.mastra_workflow_snapshot WHERE run_id = 'run-2';")" == 'два' ]] ||
  fail 'Converted snapshot does not answer a jsonb path query.'
"$isolation_script" >"$work_dir/isolation-production.log" 2>&1 || {
  show_log "$work_dir/isolation-production.log"
  fail 'check-postgres-role-isolation.sh failed after the production-shape upgrade.'
}
run_upgrade "$work_dir/production-second.log" || {
  show_log "$work_dir/production-second.log"
  fail 'Second upgrade run over the upgraded production shape failed.'
}
grep -Fq 'nothing applied' "$work_dir/production-second.log" ||
  fail 'Second upgrade run over the upgraded production shape did not report a no-op.'
[[ "$(fingerprint)" == "$expected_production_upgraded_fingerprint" ]] ||
  fail 'Second upgrade run changed the upgraded production shape.'

# A snapshot that is not valid jsonb (plain text, and a NUL escape jsonb
# rejects) must stop the run before any change: in the read-only preflight,
# and inside the transaction if a row appears after the preflight.
reset_mastra
load_production_shape
seed_rows
owner_sql "$mastra_database" <<'SQL'
INSERT INTO public.mastra_workflow_snapshot (workflow_name, run_id, "resourceId", snapshot, "createdAt", "updatedAt")
VALUES
  ('agentic-loop', 'run-bad-1', 'org-1:user-1', 'not json at all', '2026-09-01 10:00:05', '2026-09-01 10:00:05'),
  ('agentic-loop', 'run-bad-2', 'org-1:user-1', '{"text": "a\u0000b"}', '2026-09-01 10:00:06', '2026-09-01 10:00:06');
SQL
invalid_before="$(fingerprint)"
invalid_rows_before="$(owner_query "$mastra_database" "SELECT md5(string_agg(s::text, E'\\n' ORDER BY s::text)) FROM public.mastra_workflow_snapshot s;")"
if run_upgrade "$work_dir/production-invalid.log"; then
  fail 'Upgrade converted a snapshot column holding rows that are not valid jsonb.'
fi
grep -Fq '2 rows whose snapshot is not valid jsonb (of 3)' "$work_dir/production-invalid.log" ||
  fail 'Invalid-snapshot refusal did not count the offending rows.'
if docker exec -i "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction \
  --username "$owner_user" --dbname "$mastra_database" <"$snapshot_sql" >"$work_dir/production-invalid-tx.log" 2>&1; then
  fail 'The in-transaction snapshot guard converted rows that are not valid jsonb.'
fi
grep -Fq 'has 2 rows whose snapshot is not valid jsonb; refusing to convert the column' "$work_dir/production-invalid-tx.log" ||
  fail 'The in-transaction snapshot guard did not explain its refusal.'
grep -Fq "('agentic-loop', 'run-bad-1'), ('agentic-loop', 'run-bad-2')" "$work_dir/production-invalid-tx.log" ||
  fail 'The in-transaction snapshot guard did not name the offending keys.'
[[ "$(table_count)" == '29' && "$(snapshot_type)" == 'text' && "$(fingerprint)" == "$invalid_before" ]] ||
  fail 'Invalid-snapshot refusal changed the schema.'
[[ "$(owner_query "$mastra_database" "SELECT md5(string_agg(s::text, E'\\n' ORDER BY s::text)) FROM public.mastra_workflow_snapshot s;")" == "$invalid_rows_before" ]] ||
  fail 'Invalid-snapshot refusal changed snapshot rows.'

# --- fresh -----------------------------------------------------------------
reset_mastra
if run_upgrade "$work_dir/fresh-no-flag.log"; then
  fail 'Upgrade accepted an empty target without --from-empty.'
fi
grep -Fq 're-run with --from-empty' "$work_dir/fresh-no-flag.log" ||
  fail 'Empty-target refusal did not point at --from-empty.'
[[ "$(table_count)" == '0' ]] || fail 'Empty-target refusal created tables.'
run_upgrade "$work_dir/fresh.log" --from-empty || {
  show_log "$work_dir/fresh.log"
  fail 'Fresh install (--from-empty) failed.'
}
grep -Fq 'Mastra storage created from empty: 0 -> 45 tables.' "$work_dir/fresh.log" ||
  fail 'Fresh install did not report 0 -> 45.'
[[ "$(fingerprint)" == "$expected_upgraded_fingerprint" ]] ||
  fail 'Fresh install fingerprint differs from the upgraded one.'
"$isolation_script" >"$work_dir/isolation-fresh.log" 2>&1 || {
  show_log "$work_dir/isolation-fresh.log"
  fail 'check-postgres-role-isolation.sh failed after the fresh install.'
}
if run_upgrade "$work_dir/fresh-again.log" --from-empty; then
  grep -Fq 'nothing applied' "$work_dir/fresh-again.log" ||
    fail 'Repeated --from-empty over 45 tables did something.'
else
  fail 'Repeated --from-empty over the 45-table target failed instead of a no-op.'
fi

sed 's/^/upgrade run 1 | /' "$work_dir/upgrade-first.log"
sed 's/^/upgrade run 2 | /' "$work_dir/upgrade-second.log"
postgres_version="$(docker exec "$container" postgres --version)"
printf 'Real Mastra upgrade proof passed. Image: %s. Version: %s. Upgrade: 29 -> 45 tables, fingerprint %s, invalid indexes 0, seeded rows identical, runtime DML ok, runtime CREATE refused, role isolation green, second run no-op. Interrupted: stayed at 29, rerun reached 45. Drift: rolled back at 29. Extra table: refused untouched. Production shape: %s -> %s, snapshot text -> jsonb, rows identical by value, isolation green, second run no-op; invalid-jsonb snapshot refused untouched (preflight and in-transaction). Fresh: refused without flag, --from-empty reached the same fingerprint, isolation green.\n' \
  "$image" "$postgres_version" "$expected_upgraded_fingerprint" \
  "$expected_production_fingerprint" "$expected_production_upgraded_fingerprint"
