#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly application_root="/srv/content-factory-next"
# The deployment directory holds a copy of deploy/production/docker-compose.yaml;
# a repository checkout there is not a substitute. Set CF_COMPOSE_FILE when the
# host keeps that copy elsewhere. Any other file has no cf-app or cf-temporal.
readonly compose_file="${CF_COMPOSE_FILE:-$application_root/docker-compose.yaml}"
app_stopped=0
temporal_stopped=0
listmonk_stopped=0
listmonk_running=0

compose() {
  docker compose --project-directory "$application_root" --file "$compose_file" "$@"
}

service_is_running() {
  local service="$1"
  local container_id running
  container_id="$(compose ps -q "$service" 2>/dev/null)" || return 1
  [[ -n "$container_id" ]] || return 1
  running="$(docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null)" || return 1
  [[ "$running" == 'true' ]]
}

require_running_service() {
  service_is_running "$1" || {
    printf 'Expected writer service is not running: %s\n' "$1" >&2
    exit 1
  }
}

report_service_left_stopped() {
  printf 'Backup wrapper could not return a stopped service to work: %s\n' "$1" >&2
}

restart_expected_writers() {
  local backup_status=$?
  local restart_status=0
  trap - EXIT
  set +e
  if [[ "$listmonk_stopped" -eq 1 ]]; then
    if ! compose start cf-listmonk || ! service_is_running cf-listmonk; then
      restart_status=1
      report_service_left_stopped cf-listmonk
    fi
  fi
  if [[ "$temporal_stopped" -eq 1 ]]; then
    if ! compose start cf-temporal || ! service_is_running cf-temporal; then
      restart_status=1
      report_service_left_stopped cf-temporal
    fi
  fi
  if [[ "$app_stopped" -eq 1 ]]; then
    if ! compose start cf-app || ! service_is_running cf-app; then
      restart_status=1
      report_service_left_stopped cf-app
    fi
  fi
  if [[ "$backup_status" -ne 0 ]]; then
    if [[ "$restart_status" -ne 0 ]]; then
      printf 'Backup failed with status %s and a stopped service was not returned to work; the exit code reports the backup failure, not the restart failure.\n' \
        "$backup_status" >&2
    fi
    exit "$backup_status"
  fi
  exit "$restart_status"
}

[[ -f "$compose_file" ]] || {
  printf 'Compose file is missing: %s. Set CF_COMPOSE_FILE to the deployed docker-compose.yaml.\n' "$compose_file" >&2
  exit 1
}
[[ -x "$application_root/scripts/operations/postgres-backup.sh" ]] || {
  printf 'Dump script is missing or not executable: %s/scripts/operations/postgres-backup.sh\n' "$application_root" >&2
  exit 1
}

require_running_service cf-app
require_running_service cf-temporal
if service_is_running cf-listmonk; then
  listmonk_running=1
fi
trap 'restart_expected_writers' EXIT

app_stopped=1
compose stop cf-app
temporal_stopped=1
compose stop cf-temporal
if [[ "$listmonk_running" -eq 1 ]]; then
  listmonk_stopped=1
  compose stop cf-listmonk
fi
CF_BACKUP_QUIESCED=1 "$application_root/scripts/operations/postgres-backup.sh"
