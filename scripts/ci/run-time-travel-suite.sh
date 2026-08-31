#!/usr/bin/env bash
#
# Run the Jest suite again with the calendar moved forward, and fail on any
# test that only passes because of today's date.
#
# The case that bought this. On 31.08.2026 five backup tests went red at
# 12:00 UTC on code nobody had touched. The fixture pinned an artifact name at
# 20260817T120000Z; retention counted fourteen days back from the real clock;
# at noon the cutoff walked past the fixture and the run swept the artifact it
# had just published. The morning run was green and the afternoon run was not.
# A suite that only ever runs on today's date cannot see that coming, and the
# same shape had already been seen once before, on 21.08.2026.
#
# What this covers and what it does not. The shift is a process-level one: it
# moves `new Date()` and `Date.now()` for everything Jest runs, and leaves
# explicit moments and real timers alone. It does not move the filesystem, and
# it does not reach a `date` call inside a shell script a test spawns.
#
# That second edge is held from the other side rather than papered over. A
# wrapper faking `date` for child processes would have to decide, per call,
# whether a spec means "now" or a fixed instant, and be right every time.
# Instead `tests/shell-clock.guard.test.cjs` forbids the shape that would need
# one: a shell script may stamp a name or a receipt with the real clock, but a
# moment it compares has to come from a variable a caller can pin — which is
# what CF_BACKUP_NOW is in scripts/operations/postgres-backup.sh.
#
# Usage: scripts/ci/run-time-travel-suite.sh [days]
set -Eeuo pipefail
IFS=$'\n\t'

days="${1:-${CF_TIME_TRAVEL_DAYS:-400}}"

[[ "$days" =~ ^[0-9]+$ ]] || {
  printf 'Days must be a non-negative integer, got: %s\n' "$days" >&2
  exit 64
}
[[ "$days" -gt 0 ]] || {
  printf 'Zero days would run the ordinary suite and prove nothing.\n' >&2
  exit 64
}

readonly script_dir="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)"
readonly repo_root="$(cd -- "$script_dir/../.." && pwd)"
readonly setup_file="$repo_root/tests/helpers/time-travel.setup.cjs"

[[ -f "$setup_file" ]] || {
  printf 'The time-travel setup is missing: %s\n' "$setup_file" >&2
  exit 1
}

cd -- "$repo_root"

printf 'Running the suite with the calendar %s day(s) forward.\n' "$days"
printf 'A failure here is a test that depends on today, not a broken feature.\n\n'

# `--setupFiles` takes a list, so anything after it is read as another setup
# module: a test path placed there comes back as "module not found in the
# setupFiles option", which reads like a broken check rather than a misplaced
# argument. Passing it last leaves nothing for it to swallow.
CF_TIME_TRAVEL_DAYS="$days" npx jest "${@:2}" "--setupFiles=$setup_file"
