#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly image='postgres:17-alpine'
readonly suffix="$(date -u +%Y%m%d%H%M%S)-$$-${RANDOM}"
readonly network_name="cf-mastra-migration-proof-${suffix}"
readonly success_container="cf-mastra-migration-success-${suffix}"
readonly missing_container="cf-mastra-migration-missing-${suffix}"
readonly extra_container="cf-mastra-migration-extra-${suffix}"
readonly dependency_container="cf-mastra-migration-dependency-${suffix}"
readonly retry_container="cf-mastra-migration-retry-${suffix}"
readonly success_volume="cf-mastra-migration-success-data-${suffix}"
readonly missing_volume="cf-mastra-migration-missing-data-${suffix}"
readonly extra_volume="cf-mastra-migration-extra-data-${suffix}"
readonly dependency_volume="cf-mastra-migration-dependency-data-${suffix}"
readonly retry_volume="cf-mastra-migration-retry-data-${suffix}"
readonly owner_user='cfproof'
readonly source_database='contentfactory'
readonly target_database='contentfactory_mastra'
readonly runtime_user='cf_mastra_runtime'
readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly migration_script="$script_dir/../../deploy/production/migrate-mastra-storage.sh"
# This list is one of three hand-written copies of the same deployment
# contract; the provenance, the pinned `@mastra/pg` version it is true for, and
# what to do when that version changes are recorded once, at the list in
# `deploy/production/migrate-mastra-storage.sh`.
# `tests/mastra-migration.execution.test.cjs` fails if the copies drift apart.
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

work_dir=''
network_created=0
containers_created=()
volumes_created=()

fail() {
  printf '%s\n' "$1" >&2
  return 1
}

cleanup() {
  local status=$?
  local resource
  set +e
  for resource in "${containers_created[@]}"; do
    docker rm -f "$resource" >/dev/null 2>&1 || status=1
  done
  if [[ "$network_created" -eq 1 ]]; then
    docker network rm "$network_name" >/dev/null 2>&1 || status=1
  fi
  for resource in "${volumes_created[@]}"; do
    docker volume rm "$resource" >/dev/null 2>&1 || status=1
  done
  if [[ -n "$work_dir" ]]; then
    rm -rf -- "$work_dir" || status=1
  fi

  for resource in "${containers_created[@]}"; do
    if docker container inspect "$resource" >/dev/null 2>&1; then
      printf 'Cleanup left disposable container %s.\n' "$resource" >&2
      status=1
    fi
  done
  if [[ "$network_created" -eq 1 ]] && docker network inspect "$network_name" >/dev/null 2>&1; then
    printf 'Cleanup left disposable network %s.\n' "$network_name" >&2
    status=1
  fi
  for resource in "${volumes_created[@]}"; do
    if docker volume inspect "$resource" >/dev/null 2>&1; then
      printf 'Cleanup left disposable volume %s.\n' "$resource" >&2
      status=1
    fi
  done

  if [[ "$status" -eq 0 ]]; then
    printf 'Cleanup inventory empty: containers=%s,%s,%s,%s,%s network=%s volumes=%s,%s,%s,%s,%s artifacts=%s.\n' \
      "$success_container" "$missing_container" "$extra_container" \
      "$dependency_container" "$retry_container" \
      "$network_name" "$success_volume" "$missing_volume" "$extra_volume" \
      "$dependency_volume" "$retry_volume" "$work_dir"
  fi
  exit "$status"
}

# `pg_isready` over the unix socket answers the short-lived server the official
# image starts for initdb and then shuts down, so a cold run could see "ready"
# and then fail its first real query with `connection to server on socket ...
# failed`. That temporary server does not listen on TCP: a real query over
# 127.0.0.1 is the only wait that means the container is actually serving.
wait_for_database() {
  local container="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
      --host 127.0.0.1 --username "$owner_user" --dbname "$source_database" \
      --tuples-only --no-align --command 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "Disposable PostgreSQL container $container did not become ready."
}

psql_pipe() {
  local container="$1"
  local database="$2"
  docker exec -i "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$owner_user" --dbname "$database"
}

psql_query() {
  local container="$1"
  local database="$2"
  local statement="$3"
  docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$owner_user" --dbname "$database" --tuples-only --no-align \
    --command "$statement"
}

setup_case() {
  local container="$1"
  local mode="$2"
  local table

  docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$owner_user" --dbname "$source_database" \
    --command "CREATE ROLE $runtime_user NOLOGIN;" >/dev/null
  docker exec "$container" createdb --username "$owner_user" "$target_database"

  {
    if [[ "$mode" == 'dependency' ]]; then
      # An enum a selected column uses. The 29 table names still match exactly,
      # so both name gates pass; a table-filtered pg_dump does not carry the
      # type, and applying that dump dies with `type "public.mastra_kind" does
      # not exist` after the target has already been touched.
      printf "CREATE TYPE public.mastra_kind AS ENUM ('agent', 'tool');\n"
    fi
    while IFS= read -r table; do
      if [[ "$mode" == 'missing' && "$table" == 'mastra_observational_memory' ]]; then
        continue
      fi
      if [[ "$table" == 'mastra_agents' && "$mode" == 'success' ]]; then
        printf 'CREATE TABLE public.%s (id text PRIMARY KEY, payload text NOT NULL, trigger_count integer NOT NULL DEFAULT 0);\n' "$table"
      elif [[ "$table" == 'mastra_agents' && "$mode" == 'dependency' ]]; then
        printf "CREATE TABLE public.%s (id text PRIMARY KEY, payload text, kind public.mastra_kind NOT NULL DEFAULT 'agent');\n" "$table"
      else
        printf 'CREATE TABLE public.%s (id text PRIMARY KEY, payload text);\n' "$table"
      fi
    done <<<"$expected_tables"
    if [[ "$mode" == 'extra' ]]; then
      printf 'CREATE TABLE public.mastra_unexpected (id text PRIMARY KEY, payload text);\n'
    fi
    if [[ "$mode" == 'success' ]]; then
      cat <<'SQL'
CREATE FUNCTION public.mastra_increment_trigger_count() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.trigger_count := NEW.trigger_count + 1;
  RETURN NEW;
END
$function$;
CREATE TRIGGER mastra_agents_increment_trigger_count
BEFORE INSERT ON public.mastra_agents
FOR EACH ROW EXECUTE FUNCTION public.mastra_increment_trigger_count();
INSERT INTO public.mastra_agents (id, payload) VALUES ('agent-1', 'source-agent');
INSERT INTO public.mastra_messages (id, payload) VALUES ('message-1', 'source-message');
SQL
    fi
  } | psql_pipe "$container" "$source_database" >/dev/null
}

run_migration() {
  local container="$1"
  local log_file="$2"
  CF_POSTGRES_CONTAINER="$container" \
  MASTRA_DATABASE_NAME="$target_database" \
  MASTRA_RUNTIME_USER="$runtime_user" \
    "$migration_script" --copy-existing >"$log_file" 2>&1
}

assert_pristine_target() {
  local container="$1"
  local table_count
  local function_count
  table_count="$(psql_query "$container" "$target_database" \
    "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\\';")"
  function_count="$(psql_query "$container" "$target_database" \
    "SELECT count(*) FROM pg_catalog.pg_proc function JOIN pg_catalog.pg_namespace schema ON schema.oid = function.pronamespace WHERE schema.nspname = 'public' AND function.proname LIKE 'mastra\_%' ESCAPE '\\';")"
  [[ "$table_count" == '0' && "$function_count" == '0' ]] ||
    fail "Rejected migration mutated target $target_database in $container."
}

command -v docker >/dev/null 2>&1 || fail 'Docker is required for the real Mastra migration proof.'
readonly docker_endpoint="${DOCKER_HOST:-$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')}"
case "$docker_endpoint" in
  unix://* | npipe://*) ;;
  *) fail "Refusing non-local Docker endpoint: $docker_endpoint" ;;
esac
docker info >/dev/null 2>&1 || fail 'The local Docker daemon is unavailable; real Mastra migration proof was not run.'
docker image inspect "$image" >/dev/null 2>&1 || fail "Local image $image is required; refusing an implicit registry pull."

for resource in "$success_container" "$missing_container" "$extra_container" \
  "$dependency_container" "$retry_container"; do
  ! docker container inspect "$resource" >/dev/null 2>&1 || fail "Disposable container name collision: $resource"
done
! docker network inspect "$network_name" >/dev/null 2>&1 || fail "Disposable network name collision: $network_name"
for resource in "$success_volume" "$missing_volume" "$extra_volume" \
  "$dependency_volume" "$retry_volume"; do
  ! docker volume inspect "$resource" >/dev/null 2>&1 || fail "Disposable volume name collision: $resource"
done

work_dir="$(mktemp -d)"
trap cleanup EXIT
docker network create "$network_name" >/dev/null
network_created=1

for resource in "$success_volume" "$missing_volume" "$extra_volume" \
  "$dependency_volume" "$retry_volume"; do
  docker volume create "$resource" >/dev/null
  volumes_created+=("$resource")
done

for case_name in success missing extra dependency retry; do
  case "$case_name" in
    success)
      container="$success_container"
      volume="$success_volume"
      ;;
    missing)
      container="$missing_container"
      volume="$missing_volume"
      ;;
    extra)
      container="$extra_container"
      volume="$extra_volume"
      ;;
    dependency)
      container="$dependency_container"
      volume="$dependency_volume"
      ;;
    retry)
      container="$retry_container"
      volume="$retry_volume"
      ;;
  esac
  docker run -d --name "$container" --network "$network_name" \
    --volume "$volume:/var/lib/postgresql/data" \
    --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER="$owner_user" \
    --env POSTGRES_DB="$source_database" --env MASTRA_DATABASE_NAME="$target_database" \
    --env MASTRA_RUNTIME_USER="$runtime_user" \
    "$image" >/dev/null
  containers_created+=("$container")
  wait_for_database "$container"
  setup_case "$container" "$case_name"
done

if ! run_migration "$success_container" "$work_dir/success.log"; then
  sed -n '1,240p' "$work_dir/success.log" >&2
  fail 'Mastra migration success case failed.'
fi

actual_tables="$(psql_query "$success_container" "$target_database" \
  "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\\' ORDER BY tablename COLLATE \"C\";")"
[[ "$actual_tables" == "$expected_tables" ]] || fail 'Target does not contain the exact 29-table contract.'

function_present="$(psql_query "$success_container" "$target_database" \
  "SELECT to_regprocedure('public.mastra_increment_trigger_count()') IS NOT NULL;")"
[[ "$function_present" == 't' ]] || fail 'Target trigger function was not migrated.'
trigger_present="$(psql_query "$success_container" "$target_database" \
  "SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname = 'mastra_agents_increment_trigger_count' AND NOT tgisinternal AND tgenabled = 'O';")"
[[ "$trigger_present" == '1' ]] || fail 'Target trigger was not migrated and re-enabled.'

agent_data="$(psql_query "$success_container" "$target_database" \
  "SELECT id || ':' || payload || ':' || trigger_count FROM public.mastra_agents;")"
[[ "$agent_data" == 'agent-1:source-agent:1' ]] ||
  fail "Representative agent data changed during migration: $agent_data"
message_data="$(psql_query "$success_container" "$target_database" \
  "SELECT id || ':' || payload FROM public.mastra_messages;")"
[[ "$message_data" == 'message-1:source-message' ]] || fail 'Representative message data was not copied.'

if run_migration "$missing_container" "$work_dir/missing.log"; then
  fail 'Migration accepted a missing deployment table.'
fi
grep -Fq 'Source Mastra table set differs from the 29-table deployment contract' "$work_dir/missing.log" ||
  fail 'Missing-table refusal did not report the table-set contract.'
grep -Fq 'mastra_observational_memory' "$work_dir/missing.log" ||
  fail 'Missing-table refusal did not identify mastra_observational_memory.'
assert_pristine_target "$missing_container"

if run_migration "$extra_container" "$work_dir/extra.log"; then
  fail 'Migration accepted an extra deployment table.'
fi
grep -Fq 'Source Mastra table set differs from the 29-table deployment contract' "$work_dir/extra.log" ||
  fail 'Extra-table refusal did not report the table-set contract.'
grep -Fq 'mastra_unexpected' "$work_dir/extra.log" ||
  fail 'Extra-table refusal did not identify mastra_unexpected.'
assert_pristine_target "$extra_container"

# The 29 table names match exactly here, so both name gates pass. Only the
# pg_depend walk stands between the operator and an apply that dies on a type
# the table-filtered dump never carried.
if run_migration "$dependency_container" "$work_dir/dependency.log"; then
  fail 'Migration accepted a table set whose dump omits a type it depends on.'
fi
grep -Fq 'depend on objects a table-filtered pg_dump does not carry' "$work_dir/dependency.log" ||
  fail 'Dependency refusal did not report the pg_dump dependency contract.'
grep -Fq 'type public.mastra_kind' "$work_dir/dependency.log" ||
  fail 'Dependency refusal did not name the missing type.'
if grep -Fq 'does not exist' "$work_dir/dependency.log"; then
  fail 'Dependency case reached the raw PostgreSQL apply error instead of failing closed.'
fi
assert_pristine_target "$dependency_container"

# A first run that created the schema and then lost its data copy leaves 29
# empty target tables. The retry has to say so, not die inside PostgreSQL with
# `relation "mastra_agent_versions" already exists`.
run_migration "$retry_container" "$work_dir/retry-first.log" ||
  fail 'Mastra migration retry case failed on its first run.'
if run_migration "$retry_container" "$work_dir/retry-second.log"; then
  fail 'Migration re-applied its schema over an already migrated target.'
fi
grep -Fq 'is not idempotent' "$work_dir/retry-second.log" ||
  fail 'Retry refusal did not explain that the migration is not idempotent.'
grep -Fq 'Drop and recreate the empty target database' "$work_dir/retry-second.log" ||
  fail 'Retry refusal did not tell the operator how to recover.'
if grep -Fq 'already exists' "$work_dir/retry-second.log"; then
  fail 'Retry reached the raw PostgreSQL "already exists" error instead of failing closed.'
fi
retry_tables="$(psql_query "$retry_container" "$target_database" \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mastra\_%' ESCAPE '\\';")"
[[ "$retry_tables" == '29' ]] ||
  fail "Refused retry changed the already migrated target: $retry_tables tables."

postgres_version="$(docker exec "$success_container" postgres --version)"
printf 'Real Mastra migration proof passed. Image: %s. Version: %s. Exact tables: 29. Trigger/function: preserved. Data: preserved. Missing/extra/dependency target mutation: none. Retry: refused before re-applying.\n' \
  "$image" "$postgres_version"
