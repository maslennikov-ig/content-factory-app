#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly artifact_input="${1:?Usage: postgres-backup-restore.sh ARTIFACT_DIRECTORY}"
readonly target_container="${CF_POSTGRES_RESTORE_CONTAINER:?Set CF_POSTGRES_RESTORE_CONTAINER to an empty target PostgreSQL container.}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$1" >&2
    exit 1
  }
}

read_manifest_value() {
  local key="$1"
  local value
  value="$(sed -n "s/^${key}=//p" "$artifact_dir/manifest.env")"
  [[ -n "$value" && "$(printf '%s\n' "$value" | wc -l)" -eq 1 ]] || {
    printf 'Backup manifest is missing a valid %s value.\n' "$key" >&2
    exit 1
  }
  printf '%s' "$value"
}

read_optional_manifest_value() {
  local key="$1"
  local count value
  count="$(grep -c "^${key}=" "$artifact_dir/manifest.env" || true)"
  [[ "$count" -le 1 ]] || {
    printf 'Backup manifest contains duplicate %s values.\n' "$key" >&2
    exit 1
  }
  value="$(sed -n "s/^${key}=//p" "$artifact_dir/manifest.env")"
  printf '%s' "$value"
}

validate_name() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
}

require_command docker
require_command realpath
require_command sha256sum

artifact_dir="$(realpath -e -- "$artifact_input")"
[[ -d "$artifact_dir" && -f "$artifact_dir/manifest.env" && -f "$artifact_dir/checksums.sha256" ]] || {
  printf 'Backup artifact is incomplete.\n' >&2
  exit 1
}

(
  cd "$artifact_dir"
  sha256sum --check checksums.sha256
)

source_user="$(read_manifest_value source_user)"
product_database="$(read_manifest_value product_database)"
mastra_database="$(read_optional_manifest_value mastra_database)"
temporal_database="$(read_manifest_value temporal_database)"
visibility_database="$(read_manifest_value visibility_database)"
newsletter_database="$(read_optional_manifest_value newsletter_database)"
newsletter_user="$(read_optional_manifest_value newsletter_user)"
validate_name "$source_user"
validate_name "$product_database"
if [[ -n "$mastra_database" ]]; then
  validate_name "$mastra_database"
  for existing_database in "$product_database" "$temporal_database" "$visibility_database"; do
    [[ "$mastra_database" != "$existing_database" ]] || {
      printf 'Mastra database collides with an existing application database.\n' >&2
      exit 1
    }
  done
fi
validate_name "$temporal_database"
validate_name "$visibility_database"
if [[ -n "$newsletter_database" || -n "$newsletter_user" ]]; then
  [[ -n "$newsletter_database" && -n "$newsletter_user" ]] || {
    printf 'Backup manifest has an incomplete Listmonk database identity.\n' >&2
    exit 1
  }
  validate_name "$newsletter_database"
  validate_name "$newsletter_user"
  [[ "$newsletter_user" != "$source_user" ]] || {
    printf 'Listmonk role must be separate from the application role.\n' >&2
    exit 1
  }
  for existing_database in "$product_database" "$mastra_database" "$temporal_database" "$visibility_database"; do
    [[ "$newsletter_database" != "$existing_database" ]] || {
      printf 'Listmonk database collides with an existing application database.\n' >&2
      exit 1
    }
  done
fi

# The CONNECT boundary belongs to the cluster that was dumped, so the artifact
# is the source of truth for the two runtime role names. The environment stays
# as a fallback for artifacts written before the manifest carried them.
product_runtime_user=''
mastra_runtime_user=''
if [[ -n "$mastra_database" ]]; then
  product_runtime_user="$(read_optional_manifest_value product_runtime_user)"
  mastra_runtime_user="$(read_optional_manifest_value mastra_runtime_user)"
  [[ -n "$product_runtime_user" ]] || product_runtime_user="${PRODUCT_RUNTIME_USER:-}"
  [[ -n "$mastra_runtime_user" ]] || mastra_runtime_user="${MASTRA_RUNTIME_USER:-}"
  [[ -n "$product_runtime_user" && -n "$mastra_runtime_user" ]] || {
    printf 'Split-role restore requires product_runtime_user and mastra_runtime_user in the backup manifest, or PRODUCT_RUNTIME_USER and MASTRA_RUNTIME_USER from the owner environment for an artifact written before the manifest carried them.\n' >&2
    exit 1
  }
  validate_name "$product_runtime_user"
  validate_name "$mastra_runtime_user"
  [[ "$product_runtime_user" != "$mastra_runtime_user" &&
    "$product_runtime_user" != "$source_user" &&
    "$mastra_runtime_user" != "$source_user" ]] || {
    printf 'Restore runtime roles must be distinct from each other and from the source owner.\n' >&2
    exit 1
  }
  if [[ -n "$newsletter_user" ]]; then
    [[ "$product_runtime_user" != "$newsletter_user" &&
      "$mastra_runtime_user" != "$newsletter_user" ]] || {
      printf 'Restore runtime roles must be distinct from the Listmonk role.\n' >&2
      exit 1
    }
  fi
fi

for required_file in globals.sql product.dump temporal.dump temporal_visibility.dump; do
  [[ -s "$artifact_dir/$required_file" ]] || {
    printf 'Backup artifact is missing a required dump.\n' >&2
    exit 1
  }
done
if [[ -n "$mastra_database" && ! -s "$artifact_dir/mastra.dump" ]]; then
  printf 'Backup artifact is missing the Mastra dump.\n' >&2
  exit 1
fi
if [[ -n "$mastra_database" ]] &&
  ! grep -Eq '^[0-9a-f]{64}  mastra\.dump$' "$artifact_dir/checksums.sha256"; then
  printf 'Mastra dump is not covered by the backup checksums.\n' >&2
  exit 1
fi
if [[ -n "$newsletter_database" && ! -s "$artifact_dir/listmonk.dump" ]]; then
  printf 'Backup artifact is missing the Listmonk dump.\n' >&2
  exit 1
fi
if [[ -n "$newsletter_database" ]] &&
  ! grep -Eq '^[0-9a-f]{64}  listmonk\.dump$' "$artifact_dir/checksums.sha256"; then
  printf 'Listmonk dump is not covered by the backup checksums.\n' >&2
  exit 1
fi

docker inspect "$target_container" >/dev/null
actual_target_label="$(docker inspect --format '{{index .Config.Labels "com.contentfactory.postgres-restore-target"}}' "$target_container")"
[[ "$actual_target_label" == 'disposable' ]] || {
  printf 'Restore target is not labelled as a disposable PostgreSQL container; refusing to mutate it.\n' >&2
  exit 1
}
target_user="$(docker exec "$target_container" sh -ceu 'printf %s "$POSTGRES_USER"')"
validate_name "$target_user"
[[ "$target_user" != "$source_user" ]] || {
  printf 'Restore bootstrap role must differ from the source role; refusing before importing globals.\n' >&2
  exit 1
}
[[ -z "$newsletter_user" || "$target_user" != "$newsletter_user" ]] || {
  printf 'Restore bootstrap role must differ from the Listmonk role.\n' >&2
  exit 1
}
[[ -z "$product_runtime_user" ||
  ("$target_user" != "$product_runtime_user" &&
    "$target_user" != "$mastra_runtime_user") ]] || {
  printf 'Restore bootstrap role must differ from both runtime roles.\n' >&2
  exit 1
}

existing_databases="$(docker exec "$target_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password --dbname postgres --tuples-only --no-align --command "$1"' \
  sh "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1');")"
[[ -z "$existing_databases" ]] || {
  printf 'Restore target contains a user database; refusing before importing globals.\n' >&2
  exit 1
}

existing_roles="$(docker exec "$target_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password --dbname postgres --tuples-only --no-align --command "$1"' \
  sh "SELECT rolname FROM pg_roles WHERE rolname <> '$target_user' AND rolname NOT LIKE 'pg_%';")"
[[ -z "$existing_roles" ]] || {
  printf 'Restore target contains a non-built-in role; refusing before importing globals.\n' >&2
  exit 1
}

docker exec -i "$target_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password --dbname postgres' \
  <"$artifact_dir/globals.sql"

databases=("$product_database")
if [[ -n "$mastra_database" ]]; then
  databases+=("$mastra_database")
fi
databases+=("$temporal_database" "$visibility_database")
if [[ -n "$newsletter_database" ]]; then
  databases+=("$newsletter_database")
fi

for database in "${databases[@]}"; do
  restore_role="$source_user"
  case "$database" in
    "$product_database") dump_file='product.dump' ;;
    "$mastra_database") dump_file='mastra.dump' ;;
    "$temporal_database") dump_file='temporal.dump' ;;
    "$visibility_database") dump_file='temporal_visibility.dump' ;;
    "$newsletter_database")
      dump_file='listmonk.dump'
      restore_role="$newsletter_user"
      ;;
  esac
  docker exec "$target_container" sh -ceu \
    'exec createdb --username "$POSTGRES_USER" --no-password --owner "$1" "$2"' \
    sh "$restore_role" "$database"
  # No `--no-privileges`: globals were imported first, so every role a GRANT
  # names already exists, and dropping the GRANTs would silently restore a
  # database that only its owner can read. It looks harmless while one role
  # holds everything, and is a broken recovery the moment it does not.
  # `--no-owner` stays: ownership is set by `--role`, not by the archive.
  docker exec -i "$target_container" sh -ceu \
    'exec pg_restore --exit-on-error --username "$POSTGRES_USER" --no-password --dbname "$1" --role "$2" --no-owner' \
    sh "$database" "$restore_role" <"$artifact_dir/$dump_file"
done

# pg_dumpall --globals-only restores roles but carries no database GRANTs, and
# createdb starts every database with PUBLIC CONNECT. Reapply the database
# boundary after every archive is restored. Split-role artifacts require the
# two runtime identities from the owner environment; older artifacts still get
# PUBLIC CONNECT revoked while their source owner keeps implicit access.
docker exec -i "$target_container" sh -ceu \
  'exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname postgres --single-transaction \
    --set=product_database="$1" \
    --set=mastra_database="$2" \
    --set=temporal_database="$3" \
    --set=visibility_database="$4" \
    --set=listmonk_database="$5" \
    --set=product_role="$6" \
    --set=mastra_role="$7" \
    --set=listmonk_role="$8"' \
  sh \
  "$product_database" \
  "$mastra_database" \
  "$temporal_database" \
  "$visibility_database" \
  "$newsletter_database" \
  "$product_runtime_user" \
  "$mastra_runtime_user" \
  "$newsletter_user" <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', database_name)
FROM (VALUES
  (:'product_database'),
  (:'mastra_database'),
  (:'temporal_database'),
  (:'visibility_database'),
  (:'listmonk_database')
) AS databases(database_name)
WHERE database_name <> ''
  AND EXISTS (SELECT FROM pg_database WHERE datname = database_name) \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', database_name, role_name)
FROM (VALUES
  (:'product_database', :'product_role'),
  (:'mastra_database', :'mastra_role'),
  (:'listmonk_database', :'listmonk_role')
) AS allowed(database_name, role_name)
WHERE database_name <> '' AND role_name <> ''
  AND EXISTS (SELECT FROM pg_database WHERE datname = database_name) \gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM %I', database_name, role_name)
FROM (VALUES
  (:'product_database', :'mastra_role'),
  (:'mastra_database', :'product_role'),
  (:'temporal_database', :'product_role'),
  (:'temporal_database', :'mastra_role'),
  (:'visibility_database', :'product_role'),
  (:'visibility_database', :'mastra_role'),
  (:'listmonk_database', :'product_role'),
  (:'listmonk_database', :'mastra_role')
) AS denied(database_name, role_name)
WHERE database_name <> '' AND role_name <> ''
  AND EXISTS (SELECT FROM pg_database WHERE datname = database_name) \gexec
SQL

printf 'PostgreSQL restore completed into container: %s\n' "$target_container"
