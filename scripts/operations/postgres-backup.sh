#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly container_name="${CF_POSTGRES_CONTAINER:-cf-next-postgres}"
readonly artifact_root="${CF_BACKUP_ARTIFACT_ROOT:-/var/backups/content-factory-next/postgres}"
readonly retention_days="${CF_BACKUP_RETENTION_DAYS:-14}"
readonly backup_id="${CF_BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
readonly temporal_database="temporal"
readonly visibility_database="temporal_visibility"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$1" >&2
    exit 1
  }
}

validate_name() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
}

cleanup_partial() {
  if [[ -n "${partial_dir:-}" && -d "$partial_dir" ]]; then
    rm -rf -- "$partial_dir"
  fi
}

expire_completed_backups() {
  local cutoff candidate candidate_name
  cutoff="$(date -u -d "-${retention_days} days" +%Y%m%dT%H%M%SZ)"

  shopt -s nullglob
  for candidate in "$artifact_root_real"/*; do
    candidate_name="${candidate##*/}"
    [[ -d "$candidate" ]] || continue
    [[ "$candidate_name" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
    [[ -f "$candidate/manifest.env" && -f "$candidate/checksums.sha256" ]] || continue
    [[ "$candidate_name" < "$cutoff" ]] || continue
    rm -rf -- "$candidate"
  done
}

# `cleanup_partial` runs from an EXIT trap, which SIGKILL, a power cut, or an
# OOM kill never reach, and `expire_completed_backups` only matches the UTC
# name of a published artifact. Without this sweep an abandoned `.partial.*`
# stays on the backup volume forever, holding a full copy of every database.
# A run that has not been touched for a whole day is abandoned by definition:
# the dump itself is minutes, and a live run keeps writing into its directory.
expire_abandoned_partials() {
  find "$artifact_root_real" -mindepth 1 -maxdepth 1 -type d \
    -name '.partial.*' -mtime +0 -exec rm -rf -- {} +
}

require_command docker
require_command sha256sum
require_command realpath
require_command date
require_command find

[[ "${CF_BACKUP_QUIESCED:-}" == '1' ]] || {
  printf 'Refusing backup without CF_BACKUP_QUIESCED=1.\n' >&2
  exit 1
}

[[ "$retention_days" =~ ^[0-9]+$ ]] || {
  printf 'CF_BACKUP_RETENTION_DAYS must be a non-negative integer.\n' >&2
  exit 1
}
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || {
  printf 'CF_BACKUP_ID must use YYYYMMDDTHHMMSSZ.\n' >&2
  exit 1
}

mkdir -p -- "$artifact_root"
artifact_root_real="$(realpath -e -- "$artifact_root")"
final_dir="$artifact_root_real/$backup_id"
partial_dir="$artifact_root_real/.partial.$backup_id.$$"

[[ ! -e "$final_dir" && ! -e "$partial_dir" ]] || {
  printf 'Backup artifact directory already exists; refusing to overwrite it.\n' >&2
  exit 1
}

docker inspect "$container_name" >/dev/null
product_database="$(docker exec "$container_name" sh -ceu 'printf %s "$POSTGRES_DB"')"
source_user="$(docker exec "$container_name" sh -ceu 'printf %s "$POSTGRES_USER"')"
mastra_database="$(docker exec "$container_name" sh -ceu 'printf %s "$MASTRA_DATABASE_NAME"')"
newsletter_database="$(docker exec "$container_name" sh -ceu 'printf %s "${LISTMONK_DB_NAME:-}"')"
newsletter_user="$(docker exec "$container_name" sh -ceu 'printf %s "${LISTMONK_DB_USER:-}"')"
# The restore has to reapply the CONNECT boundary, and the two runtime roles it
# names belong to the cluster that was dumped, not to whoever happens to be
# recovering it. Read them from the same container as every other identity and
# put them in the manifest, so a restore months later does not depend on the
# operator's shell having the right PRODUCT_RUNTIME_USER exported.
product_runtime_user="$(docker exec "$container_name" sh -ceu 'printf %s "${PRODUCT_RUNTIME_USER:-}"')"
mastra_runtime_user="$(docker exec "$container_name" sh -ceu 'printf %s "${MASTRA_RUNTIME_USER:-}"')"
validate_name "$product_database"
validate_name "$source_user"
validate_name "$mastra_database"
if [[ -n "$product_runtime_user" || -n "$mastra_runtime_user" ]]; then
  [[ -n "$product_runtime_user" && -n "$mastra_runtime_user" ]] || {
    printf 'Split-role backup requires both PRODUCT_RUNTIME_USER and MASTRA_RUNTIME_USER in the source container.\n' >&2
    exit 1
  }
  validate_name "$product_runtime_user"
  validate_name "$mastra_runtime_user"
fi
if [[ -n "$newsletter_database" || -n "$newsletter_user" ]]; then
  [[ -n "$newsletter_database" && -n "$newsletter_user" ]] || {
    printf 'Listmonk backup requires both LISTMONK_DB_NAME and LISTMONK_DB_USER.\n' >&2
    exit 1
  }
  validate_name "$newsletter_database"
  validate_name "$newsletter_user"
  [[ "$newsletter_user" != "$source_user" ]] || {
    printf 'LISTMONK_DB_USER must be separate from POSTGRES_USER.\n' >&2
    exit 1
  }
fi

# A product database literally named `temporal` matches the dump-file `case`
# twice, so it is written to `product.dump` on both passes and `temporal.dump`
# is never created. The run then fails at the very end, inside `sha256sum`,
# saying only that a file is missing. Refuse here instead, before anything is
# dumped, and say why.
for reserved_database in "$temporal_database" "$visibility_database" "$mastra_database"; do
  [[ "$product_database" != "$reserved_database" ]] || {
    printf 'POSTGRES_DB collides with reserved database %s; refusing an ambiguous backup.\n' "$reserved_database" >&2
    exit 1
  }
done

for reserved_database in "$product_database" "$temporal_database" "$visibility_database"; do
  [[ "$mastra_database" != "$reserved_database" ]] || {
    printf 'MASTRA_DATABASE_NAME collides with an existing application database.\n' >&2
    exit 1
  }
done

if [[ -n "$newsletter_database" ]]; then
  for existing_database in "$product_database" "$mastra_database" "$temporal_database" "$visibility_database"; do
    [[ "$newsletter_database" != "$existing_database" ]] || {
      printf 'LISTMONK_DB_NAME collides with an existing application database.\n' >&2
      exit 1
    }
  done
fi

mkdir -- "$partial_dir"
trap 'cleanup_partial' EXIT

# globals.sql is a credential carrier: --globals-only reads pg_authid, so the
# file contains the SCRAM password verifier of every role. It must never leave
# this host unencrypted.
docker exec "$container_name" sh -ceu \
  'exec pg_dumpall --globals-only --username "$POSTGRES_USER" --no-password' \
  >"$partial_dir/globals.sql"

databases=("$product_database" "$mastra_database" "$temporal_database" "$visibility_database")
if [[ -n "$newsletter_database" ]]; then
  databases+=("$newsletter_database")
fi

for database in "${databases[@]}"; do
  case "$database" in
    "$product_database") dump_file='product.dump' ;;
    "$mastra_database") dump_file='mastra.dump' ;;
    "$temporal_database") dump_file='temporal.dump' ;;
    "$visibility_database") dump_file='temporal_visibility.dump' ;;
    "$newsletter_database") dump_file='listmonk.dump' ;;
  esac
  docker exec "$container_name" sh -ceu \
    'exec pg_dump -Fc --username "$POSTGRES_USER" --no-password "$1"' \
    sh "$database" >"$partial_dir/$dump_file"
  [[ -s "$partial_dir/$dump_file" ]] || {
    printf 'Dump archive is empty; refusing to publish a partial backup.\n' >&2
    exit 1
  }
  docker exec -i "$container_name" sh -ceu \
    'exec pg_restore --list --file=-' <"$partial_dir/$dump_file" >/dev/null
done

# The three `.dump` files are custom-format archives, and `pg_restore --list`
# above already refuses a truncated one. `globals.sql` is plain SQL: a dump cut
# in the middle is still a non-empty file of valid-looking statements, and it
# would be published and only fail — halfway through `CREATE ROLE` — during an
# actual recovery. `pg_dumpall` writes this marker as its last line, so its
# presence at the end of the file is what "the dump finished" means.
readonly globals_completion_marker='-- PostgreSQL database cluster dump complete'
tail -n 5 -- "$partial_dir/globals.sql" |
  grep -Fqx -- "$globals_completion_marker" || {
  printf 'Cluster globals dump is truncated; refusing to publish a partial backup.\n' >&2
  exit 1
}

postgres_image="$(docker inspect --format '{{.Config.Image}}' "$container_name")"
{
  printf 'format_version=1\n'
  printf 'backup_id=%s\n' "$backup_id"
  printf 'created_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'source_container=%s\n' "$container_name"
  printf 'postgres_image=%s\n' "$postgres_image"
  printf 'source_user=%s\n' "$source_user"
  printf 'product_database=%s\n' "$product_database"
  printf 'mastra_database=%s\n' "$mastra_database"
  printf 'temporal_database=%s\n' "$temporal_database"
  printf 'visibility_database=%s\n' "$visibility_database"
  if [[ -n "$product_runtime_user" ]]; then
    printf 'product_runtime_user=%s\n' "$product_runtime_user"
    printf 'mastra_runtime_user=%s\n' "$mastra_runtime_user"
  fi
  if [[ -n "$newsletter_database" ]]; then
    printf 'newsletter_database=%s\n' "$newsletter_database"
    printf 'newsletter_user=%s\n' "$newsletter_user"
  fi
} >"$partial_dir/manifest.env"

(
  cd "$partial_dir"
  checksum_files=(globals.sql product.dump mastra.dump temporal.dump temporal_visibility.dump)
  if [[ -n "$newsletter_database" ]]; then
    checksum_files+=(listmonk.dump)
  fi
  checksum_files+=(manifest.env)
  sha256sum "${checksum_files[@]}" >checksums.sha256
  sha256sum --check checksums.sha256 >/dev/null
)

mv -- "$partial_dir" "$final_dir"
partial_dir=''
expire_completed_backups
expire_abandoned_partials
printf 'PostgreSQL backup completed: %s\n' "$final_dir"
