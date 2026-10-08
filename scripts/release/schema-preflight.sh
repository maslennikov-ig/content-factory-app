#!/usr/bin/env bash
# Execute on the deployment host only with current authorization for a read-only
# database preflight. No image pull, schema apply, app config edit or engine download.
# Usage: CF_SCHEMA_ENGINE_PATH=/absolute/verified/schema-engine \
#   scripts/release/schema-preflight.sh <candidate-tag>
set -euo pipefail

tag="${1:-}"
repository="${CF_REGISTRY:-ghcr.io}/${CF_REGISTRY_NAMESPACE:-maslennikov-ig}/content-factory-next"
env_file="${CF_APP_ENV_PATH:-/srv/content-factory-next/app.env}"
engine="${CF_SCHEMA_ENGINE_PATH:-}"
network="${CF_SCHEMA_NETWORK:-content-factory-next_internal}"
helper="$(cd "$(dirname "$0")" && pwd)/schema-preflight.cjs"

if [ "$#" -ne 1 ] || ! [[ "$tag" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo 'Supply exactly one candidate release tag.' >&2
  exit 2
fi
for source_file in "$env_file" "$engine" "$helper"; do
  if [[ "$source_file" != /* || "$source_file" = *','* ]] || [ ! -f "$source_file" ] || [ ! -r "$source_file" ]; then
    echo 'Preflight requires existing readable absolute env, engine and helper paths.' >&2
    exit 2
  fi
done
if [ ! -x "$engine" ]; then
  echo 'Schema engine must be executable.' >&2
  exit 2
fi
image="${repository}:${tag}"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo 'Candidate image is not available locally; no pull attempted.' >&2
  exit 1
fi

# Private directory contains only docker's container ID; no normalized env or SQL
# is persisted. --rm handles success; the trap handles interrupted/failed runs.
umask 077
owned_dir="$(mktemp -d "${TMPDIR:-/tmp}/cf-schema-preflight.XXXXXXXX")"
cleanup() {
  local cid=''
  if [ -f "$owned_dir/container.id" ]; then
    cid="$(cat "$owned_dir/container.id")"
    if [[ "$cid" =~ ^[a-f0-9]{64}$ ]]; then
      docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
  fi
  rm -rf -- "$owned_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! docker run --rm --pull never --cidfile "$owned_dir/container.id" \
  --network "$network" --read-only --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  --mount "type=bind,src=${env_file},dst=/run/cf-preflight.env,readonly" \
  --mount "type=bind,src=${engine},dst=/run/cf-schema-engine,readonly" \
  --mount "type=bind,src=${helper},dst=/run/cf-schema-preflight.cjs,readonly" \
  --entrypoint node "$image" /run/cf-schema-preflight.cjs \
  >"$owned_dir/result.json" 2>/dev/null; then
  # Only print the helper's allowlisted status, never raw Docker/Prisma stderr.
  result="$(cat "$owned_dir/result.json")"
  if [[ "$result" != *$'\n'* ]] && printf '%s\n' "$result" | LC_ALL=C grep -Eq '^\{"ok":false,"reason":"[a-z_]+","schemaApplied":false(,"diffExitCode":[0-9]+)?\}$'; then
    printf '%s\n' "$result"
  else
    echo '{"ok":false,"reason":"container_execution_failed","schemaApplied":false}'
  fi
  exit 1
fi
result="$(cat "$owned_dir/result.json")"
if [[ "$result" = *$'\n'* ]] || ! printf '%s\n' "$result" | LC_ALL=C grep -Eq '^\{"ok":true,"diffExitCode":0,"sqlLines":0,"schemaApplied":false,"prismaVersion":"6\.5\.0","engineVersion":"173f8d54f8d52e692c7e27e72a88314ec7aeff60","engineSha256":"431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2"\}$'; then
  echo '{"ok":false,"reason":"invalid_preflight_result","schemaApplied":false}'
  exit 1
fi
printf '%s\n' "$result"
