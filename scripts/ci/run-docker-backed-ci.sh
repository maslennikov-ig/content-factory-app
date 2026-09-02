#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

required=0
case "${1:-}" in
  '') ;;
  --require-docker) required=1 ;;
  *)
    printf 'Usage: %s [--require-docker]\n' "${0##*/}" >&2
    exit 64
    ;;
esac

readonly script_dir="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)"
readonly repo_root="$(cd -- "$script_dir/../.." && pwd)"
readonly proof_images=('postgres:17-alpine' 'nginx:alpine')
proof_result=''
native_results=()
container_name=''
network_name=''
volume_name=''

cleanup() {
  local result
  if [[ -n "$container_name" ]]; then
    docker rm --force "$container_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$network_name" ]]; then
    docker network rm "$network_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$volume_name" ]]; then
    docker volume rm "$volume_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$proof_result" ]]; then
    rm -f -- "$proof_result"
  fi
  for result in "${native_results[@]}"; do
    rm -f -- "$result"
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

unavailable() {
  local reason="$1"
  if [[ "$required" -eq 1 ]]; then
    printf 'ERROR: Docker-backed CI cannot continue: %s\n' "$reason" >&2
    return 1
  fi
  printf 'SKIP: Docker-backed verification was not run locally: %s\n' "$reason"
  return 0
}

if ! command -v docker >/dev/null 2>&1; then
  unavailable 'Docker CLI is not installed or is not on PATH.'
  exit $?
fi

if ! docker info >/dev/null 2>&1; then
  unavailable 'Docker daemon is unavailable or inaccessible.'
  exit $?
fi

if ! docker compose version >/dev/null 2>&1; then
  unavailable 'Docker Compose plugin is unavailable.'
  exit $?
fi

for proof_image in "${proof_images[@]}"; do
  if ! docker image inspect "$proof_image" >/dev/null 2>&1; then
    if [[ "$required" -eq 0 ]]; then
      unavailable "required local image $proof_image is unavailable; no image was pulled."
      exit $?
    fi
    printf 'Docker-backed CI: pulling required proof image %s.\n' "$proof_image"
    if ! docker pull "$proof_image"; then
      printf 'ERROR: Docker-backed CI cannot continue: required image %s could not be pulled.\n' "$proof_image" >&2
      exit 1
    fi
  fi
done

proof_result="$(mktemp "${TMPDIR:-/tmp}/cf-docker-jest.XXXXXX.json")"
native_results+=(
  "$(mktemp "${TMPDIR:-/tmp}/cf-docker-native-source-registry.XXXXXX.tap")"
  "$(mktemp "${TMPDIR:-/tmp}/cf-docker-native-post-context.XXXXXX.tap")"
  "$(mktemp "${TMPDIR:-/tmp}/cf-docker-native-editorial-stage.XXXXXX.tap")"
)

readonly resource_suffix="$(date +%s)-$$-$RANDOM"
container_name="cf-docker-ci-${resource_suffix}-postgres"
network_name="cf-docker-ci-${resource_suffix}-network"
volume_name="cf-docker-ci-${resource_suffix}-volume"

docker network create "$network_name" >/dev/null
docker volume create "$volume_name" >/dev/null
docker run --detach \
  --name "$container_name" \
  --network "$network_name" \
  --mount "source=${volume_name},target=/var/lib/postgresql/data" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_DB=postgres \
  postgres:17-alpine >/dev/null

ready=0
for _ in {1..60}; do
  if docker exec "$container_name" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  printf 'ERROR: disposable PostgreSQL 17 did not become ready.\n' >&2
  exit 1
fi

postgres_port="$(docker port "$container_name" 5432/tcp | awk -F: 'NR == 1 { print $NF }')"
if [[ ! "$postgres_port" =~ ^[0-9]+$ ]]; then
  printf 'ERROR: disposable PostgreSQL 17 did not expose a valid local port.\n' >&2
  exit 1
fi
readonly postgres_url="postgresql://postgres:postgres@127.0.0.1:${postgres_port}/postgres"
export SOURCE_REGISTRY_POSTGRES_URL="$postgres_url"
export POST_CONTENT_CONTEXT_POSTGRES_URL="$postgres_url"
export EDITORIAL_STAGE_POSTGRES_URL="$postgres_url"
export CF_DOCKER_CI_DISPOSABLE_POSTGRES=1

cd -- "$repo_root"
pnpm exec jest --runInBand --runTestsByPath \
  tests/browser-error-relay.test.cjs \
  tests/error-collector.compose.test.cjs \
  tests/postgres-role-isolation.execution.test.cjs \
  --json --outputFile "$proof_result"
node scripts/ci/assert-docker-jest-result.cjs "$proof_result"

run_native_proof() {
  local test_file="$1"
  local result_file="$2"
  local status=0

  node --test --test-reporter=tap "$test_file" >"$result_file" 2>&1 || status=$?
  if ! node scripts/ci/assert-node-test-tap-result.cjs "$result_file"; then
    cat "$result_file" >&2
    return 1
  fi
  if [[ "$status" -ne 0 ]]; then
    cat "$result_file" >&2
    return "$status"
  fi
}

run_native_proof \
  tests/content-source-registry.postgres.test.cjs \
  "${native_results[0]}"
run_native_proof \
  tests/post.content-context.test.cjs \
  "${native_results[1]}"
run_native_proof \
  tests/editorial-stage.tag-migration.test.cjs \
  "${native_results[2]}"

scripts/operations/verify-mastra-storage-migration.sh
scripts/operations/verify-postgres-backup-restore.sh

printf 'Docker-backed CI proof passed: three Jest suites, three native PostgreSQL proofs, and both operational proofs completed.\n'
