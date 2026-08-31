#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly image="${CF_POSTGRES_PROOF_IMAGE:-postgres:17-alpine}"
readonly suffix="$(date -u +%Y%m%d%H%M%S)-$$-${RANDOM}"
readonly network_name="cf-postgres-backup-proof-${suffix}"
readonly source_container="cf-postgres-backup-source-${suffix}"
readonly target_container="cf-postgres-backup-target-${suffix}"
readonly source_volume="cf-postgres-backup-source-data-${suffix}"
readonly target_volume="cf-postgres-backup-target-data-${suffix}"
readonly source_user="cfbackup"
readonly product_database="contentfactory"
readonly mastra_database="contentfactory_mastra"
readonly newsletter_database="listmonk"
readonly newsletter_user="listmonk"
readonly product_runtime_user="cf_product_runtime"
readonly mastra_runtime_user="cf_mastra_runtime"
readonly artifact_id="20260817T000000Z"
readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
work_dir="$(mktemp -d)"

cleanup() {
  local status=$?
  set +e
  docker rm -f "$source_container" "$target_container" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
  docker volume rm "$source_volume" "$target_volume" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
  if [[ "$status" -eq 0 ]]; then
    printf 'Cleanup proof: disposable containers, network, volumes, and artifacts were removed.\n'
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
  local user="$2"
  local database="$3"
  local attempt
  for attempt in $(seq 1 60); do
    if docker exec "$container" psql --no-psqlrc --set ON_ERROR_STOP=1 \
      --host 127.0.0.1 --username "$user" --dbname "$database" \
      --tuples-only --no-align --command 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf 'Disposable PostgreSQL container did not become ready.\n' >&2
  return 1
}

exec_sql() {
  local container="$1"
  local database="$2"
  local statement="$3"
  docker exec "$container" psql --set ON_ERROR_STOP=1 --username "$source_user" --dbname "$database" --command "$statement" >/dev/null
}

trap cleanup EXIT

docker image inspect "$image" >/dev/null
docker network create "$network_name" >/dev/null
docker volume create "$source_volume" >/dev/null
docker volume create "$target_volume" >/dev/null

docker run -d --name "$source_container" --network "$network_name" --volume "$source_volume:/var/lib/postgresql/data" \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER="$source_user" --env POSTGRES_DB="$product_database" \
  --env MASTRA_DATABASE_NAME="$mastra_database" \
  --env PRODUCT_RUNTIME_USER="$product_runtime_user" --env MASTRA_RUNTIME_USER="$mastra_runtime_user" \
  --env LISTMONK_DB_NAME="$newsletter_database" --env LISTMONK_DB_USER="$newsletter_user" \
  "$image" >/dev/null
docker run -d --name "$target_container" --network "$network_name" --volume "$target_volume:/var/lib/postgresql/data" \
  --label com.contentfactory.postgres-restore-target=disposable \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER=postgres --env POSTGRES_DB=postgres \
  "$image" >/dev/null

wait_for_database "$source_container" "$source_user" "$product_database"
wait_for_database "$target_container" postgres postgres

exec_sql "$source_container" "$product_database" 'CREATE TABLE backup_sentinel (value text primary key); INSERT INTO backup_sentinel VALUES ('"'"'sentinel_product'"'"'); CREATE ROLE cf_backup_proof_role NOLOGIN;'
exec_sql "$source_container" "$product_database" "CREATE ROLE $product_runtime_user LOGIN; CREATE ROLE $mastra_runtime_user LOGIN;"
docker exec "$source_container" createdb --username "$source_user" "$mastra_database"
exec_sql "$source_container" "$mastra_database" 'CREATE TABLE backup_sentinel (value text primary key); INSERT INTO backup_sentinel VALUES ('"'"'sentinel_mastra'"'"');'
docker exec "$source_container" createdb --username "$source_user" temporal
docker exec "$source_container" createdb --username "$source_user" temporal_visibility
exec_sql "$source_container" temporal 'CREATE TABLE backup_sentinel (value text primary key); INSERT INTO backup_sentinel VALUES ('"'"'sentinel_temporal'"'"');'
exec_sql "$source_container" temporal_visibility 'CREATE TABLE backup_sentinel (value text primary key); INSERT INTO backup_sentinel VALUES ('"'"'sentinel_visibility'"'"');'
exec_sql "$source_container" "$product_database" "CREATE ROLE $newsletter_user LOGIN;"
docker exec "$source_container" createdb --username "$source_user" --owner "$newsletter_user" "$newsletter_database"
docker exec "$source_container" psql --set ON_ERROR_STOP=1 --username "$newsletter_user" --dbname "$newsletter_database" \
  --command "CREATE TABLE backup_sentinel (value text primary key); INSERT INTO backup_sentinel VALUES ('sentinel_listmonk');" >/dev/null

if CF_POSTGRES_CONTAINER="$source_container" \
CF_BACKUP_ARTIFACT_ROOT="$work_dir/artifacts" \
CF_BACKUP_RETENTION_DAYS=36500 \
CF_BACKUP_ID="$artifact_id" \
  "$script_dir/postgres-backup.sh" >/dev/null 2>&1; then
  printf 'Unquiesced backup was accepted unexpectedly.\n' >&2
  exit 1
fi
[[ ! -e "$work_dir/artifacts/$artifact_id" ]] || {
  printf 'Unquiesced backup published an artifact unexpectedly.\n' >&2
  exit 1
}

dump_started="$SECONDS"
CF_BACKUP_QUIESCED=1 \
CF_POSTGRES_CONTAINER="$source_container" \
CF_BACKUP_ARTIFACT_ROOT="$work_dir/artifacts" \
CF_BACKUP_RETENTION_DAYS=36500 \
CF_BACKUP_ID="$artifact_id" \
  "$script_dir/postgres-backup.sh" >/dev/null
dump_elapsed="$((SECONDS - dump_started))"

# The two runtime role names belong to the cluster that was dumped, so from
# here on nothing exports them: every restore below has to read them out of the
# manifest. A restore months from now runs in a shell that knows nothing.
for manifest_key in product_runtime_user mastra_runtime_user; do
  grep -Eq "^${manifest_key}=[A-Za-z_][A-Za-z0-9_]*$" \
    "$work_dir/artifacts/$artifact_id/manifest.env" || {
    printf 'Backup manifest does not carry %s.\n' "$manifest_key" >&2
    exit 1
  }
done

if CF_POSTGRES_RESTORE_CONTAINER="$source_container" \
  "$script_dir/postgres-backup-restore.sh" "$work_dir/artifacts/$artifact_id" >/dev/null 2>&1; then
  printf 'Unlabelled restore target was accepted unexpectedly.\n' >&2
  exit 1
fi

docker exec "$target_container" createdb --username postgres cf_backup_dirty_database
docker exec "$target_container" psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres \
  --command 'CREATE ROLE cf_backup_dirty_role NOLOGIN;' >/dev/null
if CF_POSTGRES_RESTORE_CONTAINER="$target_container" \
  "$script_dir/postgres-backup-restore.sh" "$work_dir/artifacts/$artifact_id" >/dev/null 2>&1; then
  printf 'Dirty labelled restore target was accepted unexpectedly.\n' >&2
  exit 1
fi
docker exec "$target_container" dropdb --username postgres cf_backup_dirty_database
docker exec "$target_container" psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres \
  --command 'DROP ROLE cf_backup_dirty_role;' >/dev/null

restore_started="$SECONDS"
CF_POSTGRES_RESTORE_CONTAINER="$target_container" \
  "$script_dir/postgres-backup-restore.sh" "$work_dir/artifacts/$artifact_id" >/dev/null
restore_elapsed="$((SECONDS - restore_started))"

for check in \
  "$product_database:sentinel_product" \
  "$mastra_database:sentinel_mastra" \
  'temporal:sentinel_temporal' \
  'temporal_visibility:sentinel_visibility' \
  "$newsletter_database:sentinel_listmonk"; do
  database="${check%%:*}"
  expected="${check#*:}"
  database_user="$source_user"
  if [[ "$database" == "$newsletter_database" ]]; then
    database_user="$newsletter_user"
  fi
  actual="$(docker exec "$target_container" psql --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database" --tuples-only --no-align --command 'SELECT value FROM backup_sentinel;')"
  [[ "$actual" == "$expected" ]] || {
    printf 'Restored sentinel verification failed.\n' >&2
    exit 1
  }
  docker exec "$target_container" psql --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database" \
    --command "INSERT INTO backup_sentinel VALUES ('restored_owner_probe'); DELETE FROM backup_sentinel WHERE value = 'restored_owner_probe';" >/dev/null
done

role_present="$(docker exec "$target_container" psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_roles WHERE rolname = 'cf_backup_proof_role';")"
[[ "$role_present" == '1' ]] || {
  printf 'Restored role verification failed.\n' >&2
  exit 1
}

acl_matrix_ok="$(docker exec "$target_container" psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres --tuples-only --no-align --command "
  SELECT
    NOT EXISTS (
      SELECT
      FROM pg_database database
      CROSS JOIN LATERAL aclexplode(COALESCE(
        database.datacl,
        acldefault('d'::\"char\", database.datdba)
      )) privilege
      WHERE database.datname IN (
        '$product_database', '$mastra_database', 'temporal',
        'temporal_visibility', '$newsletter_database'
      )
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'CONNECT'
    )
    AND has_database_privilege('$product_runtime_user', '$product_database', 'CONNECT')
    AND NOT has_database_privilege('$product_runtime_user', '$mastra_database', 'CONNECT')
    AND NOT has_database_privilege('$product_runtime_user', 'temporal', 'CONNECT')
    AND NOT has_database_privilege('$product_runtime_user', 'temporal_visibility', 'CONNECT')
    AND NOT has_database_privilege('$product_runtime_user', '$newsletter_database', 'CONNECT')
    AND has_database_privilege('$mastra_runtime_user', '$mastra_database', 'CONNECT')
    AND NOT has_database_privilege('$mastra_runtime_user', '$product_database', 'CONNECT')
    AND NOT has_database_privilege('$mastra_runtime_user', 'temporal', 'CONNECT')
    AND NOT has_database_privilege('$mastra_runtime_user', 'temporal_visibility', 'CONNECT')
    AND NOT has_database_privilege('$mastra_runtime_user', '$newsletter_database', 'CONNECT');")"
[[ "$acl_matrix_ok" == 't' ]] || {
  printf 'Restored database ACL isolation verification failed.\n' >&2
  exit 1
}

postgres_version="$(docker exec "$source_container" postgres --version)"
printf 'Local dump/restore proof passed. Image: %s. Version: %s. Dump: %ss. Restore: %ss.\n' \
  "$image" "$postgres_version" "$dump_elapsed" "$restore_elapsed"
