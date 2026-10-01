#!/usr/bin/env bash
# Product-only replacement for the shared host's plaintext-then-GPG branch.
# Installation and execution on the shared host are explicit owner actions.
set -Eeuo pipefail
umask 077

fail() { printf 'Content Factory encrypted backup: %s\n' "$*" >&2; exit 1; }

[[ $# -eq 2 ]] || fail 'usage: encrypted-product-backup.sh EXISTING_OUTPUT_DIRECTORY RECIPIENT_FINGERPRINT'
output_directory="$1"
recipient_fingerprint="$2"
[[ "$recipient_fingerprint" =~ ^[A-Fa-f0-9]{40}$ ]] || fail 'a full recipient fingerprint is required'
[[ -d "$output_directory" && ! -L "$output_directory" ]] || fail 'output must be an existing real directory'

for utility in docker gpg realpath mktemp ln rm; do
  command -v "$utility" >/dev/null 2>&1 || fail "required command unavailable: $utility"
done

output_directory="$(realpath -e -- "$output_directory")"
readonly container_name='cf-next-postgres'
readonly artifact_path="$output_directory/postgres_cf-next-postgres.sql.gpg"
[[ ! -e "$artifact_path" && ! -L "$artifact_path" ]] || fail 'refusing to replace an existing artifact'

# This is the only environment value read from the container; no credentials
# or database rows are written to a plaintext intermediate or diagnostic log.
source_user="$(docker exec "$container_name" sh -ceu 'printf %s "$POSTGRES_USER"')"
[[ "$source_user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail 'unsafe PostgreSQL username'

partial_path="$(mktemp "$output_directory/.postgres_cf-next-postgres.sql.gpg.XXXXXX")"
cleanup() { rm -f -- "$partial_path"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! docker exec "$container_name" pg_dumpall -U "$source_user" |
  gpg --batch --yes --encrypt --sign -r "$recipient_fingerprint" > "$partial_path"; then
  fail 'dump or encryption failed; no artifact published'
fi
[[ -s "$partial_path" ]] || fail 'encryption produced an empty file; no artifact published'

# A hard link publishes the completed inode atomically without overwriting a
# file created by another process after the check above. -T also refuses a
# destination directory rather than creating a file inside it.
ln -T -- "$partial_path" "$artifact_path" || fail 'artifact publication refused'
printf 'Content Factory encrypted backup published: %s\n' "$artifact_path"
