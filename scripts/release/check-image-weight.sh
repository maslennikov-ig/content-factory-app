#!/usr/bin/env bash
#
# Refuse a release whose image suddenly got heavier than the one before it.
#
# Why weight is worth a gate of its own. On 30.08.2026 thirteen published tags
# turned out to carry personal source texts and a Python environment with model
# weights, dragged in by a build context `.dockerignore` did not cover. Every
# named guard passed: they check the paths somebody already thought of. The only
# signal that separated a poisoned image from a healthy one was its size —
# 1.79 GB compressed against 0.73 GB. Nobody looked, and four days of releases
# went out that way.
#
# So this checks the one thing that moves whenever anything unexpected enters
# the image, without knowing what that thing is. A named guard closes the paths
# we know; weight closes the ones we do not.
#
# Usage: scripts/release/check-image-weight.sh <mode> <new-tag> [previous-tag]
#
#   local     Compare the sizes the local docker reports for two images on this
#             machine. Runs before the push, costs nothing and needs no network.
#             When the previous tag is not on this machine there is nothing to
#             compare against, so it says so and passes: the registry check below
#             still stands between the image and the host.
#
#   registry  Compare the compressed sizes the registry reports, read from the
#             manifest alone — no `docker pull`, a couple of seconds. This is the
#             authoritative check, because compressed bytes are what a release
#             actually costs and what the incident was measured in.
#
# The two modes never compare across each other. Docker's local number and the
# registry's come from different places and need not agree — the local one has
# meant the unpacked tree on some docker versions and the stored content on
# others. Each mode therefore measures both sides with its own method, and only
# the ratio between them decides anything.
#
# Without an explicit previous tag each mode picks the release before this one on
# its own side: the newest other local image, or the newest other registry
# version by creation time.
#
# Environment:
#   CF_IMAGE_WEIGHT_MAX_GROWTH  percent, default 25
#   CF_REGISTRY                 default ghcr.io
#   CF_REGISTRY_NAMESPACE       default maslennikov-ig
#
# Exit status: 0 when the new image is within the allowance or there is nothing
# to compare it with, 1 when it is heavier than allowed or the check could not
# be carried out in registry mode.
set -euo pipefail

mode="${1:-}"
tag="${2:-}"
previous_tag="${3:-}"

if [ -z "$mode" ] || [ -z "$tag" ]; then
  echo "usage: scripts/release/check-image-weight.sh <local|registry> <new-tag> [previous-tag]" >&2
  exit 1
fi

case "$mode" in
  local | registry) ;;
  *)
    echo "unknown mode '$mode': expected 'local' or 'registry'" >&2
    exit 1
    ;;
esac

max_growth="${CF_IMAGE_WEIGHT_MAX_GROWTH:-25}"
registry="${CF_REGISTRY:-ghcr.io}"
namespace="${CF_REGISTRY_NAMESPACE:-maslennikov-ig}"
repository="content-factory-next"

# Bytes to a human number, so the message reads the way the incident was
# reported rather than in eleven digits.
human() {
  python3 -c 'import sys; print(f"{int(sys.argv[1]) / 1e9:.2f} GB")' "$1"
}

# --- local mode -------------------------------------------------------------

local_size() {
  docker image inspect "$repository:$1" --format '{{.Size}}' 2>/dev/null
}

# The newest local image of this repository that is not the tag under test.
local_previous_tag() {
  docker images "$repository" --format '{{.CreatedAt}}|{{.Tag}}' 2>/dev/null \
    | grep -v "|$tag\$" \
    | grep -v '|<none>$' \
    | sort -r \
    | head -1 \
    | cut -d'|' -f2
}

# --- registry mode ----------------------------------------------------------

# The package is private, so a manifest read needs a credential. Called only
# after an unauthenticated read has already failed, so an operator who is
# already logged in keeps their own configuration untouched.
#
# The token is piped into `--password-stdin`: it never appears in argv, in shell
# history, or in the operator's own ~/.docker/config.json. DOCKER_CONFIG points
# at a temporary directory the trap removes on exit. When push-image.sh calls
# this, its own login is still in force and none of it runs.
registry_login_attempted=
# Script-scope, not function-local: the trap fires after the function has
# returned, and a `local` name is gone by then — under `set -u` that turns the
# cleanup into an error message on every run.
registry_config_dir=
trap 'if [ -n "$registry_config_dir" ]; then rm -rf "$registry_config_dir"; fi' EXIT

registry_login() {
  [ -z "$registry_login_attempted" ] || return 1
  registry_login_attempted=1

  local token="${CF_REGISTRY_TOKEN:-}"
  if [ -z "$token" ]; then
    command -v gh >/dev/null 2>&1 || return 1
    token="$(gh auth token 2>/dev/null)" || return 1
  fi
  [ -n "$token" ] || return 1

  registry_config_dir="$(mktemp -d)"
  chmod 700 "$registry_config_dir"
  export DOCKER_CONFIG="$registry_config_dir"

  printf '%s' "$token" \
    | docker login "$registry" -u "${CF_REGISTRY_USER:-$namespace}" \
        --password-stdin >/dev/null 2>&1
}

# Compressed bytes of one tag: the config blob plus every layer, summed over the
# real platform manifests. `docker manifest inspect -v` carries each platform
# manifest base64-encoded in `Raw`; the attestation entries carry no
# architecture and are skipped, since they are metadata, not the image.
registry_size() {
  registry_size_once "$1" || { registry_login && registry_size_once "$1"; }
}

registry_size_once() {
  docker manifest inspect -v "$registry/$namespace/$repository:$1" 2>/dev/null \
    | python3 -c '
import base64, json, sys

try:
    entries = json.load(sys.stdin)
except ValueError:
    sys.exit(1)
if isinstance(entries, dict):
    entries = [entries]

total = 0
counted = 0
for entry in entries:
    platform = (entry.get("Descriptor") or {}).get("platform") or {}
    if platform.get("architecture") in (None, "unknown"):
        continue
    manifest = json.loads(base64.b64decode(entry["Raw"]))
    total += (manifest.get("config") or {}).get("size", 0)
    total += sum(layer.get("size", 0) for layer in manifest.get("layers") or [])
    counted += 1

if not counted:
    sys.exit(1)
print(total)
'
}

# The newest registry version that carries a tag other than the one under test.
registry_previous_tag() {
  command -v gh >/dev/null 2>&1 || return 1
  # `--paginate` alone concatenates one JSON array per page; `--jq '.[]'` turns
  # the whole run into one object per line, so the last page is not lost to a
  # page boundary. That boundary is not hypothetical: on 30.08.2026 a request
  # without pagination reported 33 of 34 versions and hid one poisoned tag.
  gh api --paginate --jq '.[]' \
    "/users/$namespace/packages/container/$repository/versions" 2>/dev/null \
    | python3 -c '
import json, sys

tag = sys.argv[1]
versions = [json.loads(line) for line in sys.stdin if line.strip()]

candidates = [
    version
    for version in versions
    if tag not in ((version.get("metadata") or {}).get("container") or {}).get("tags", [])
    and ((version.get("metadata") or {}).get("container") or {}).get("tags")
]
if not candidates:
    sys.exit(1)
newest = max(candidates, key=lambda version: version["created_at"])
print(newest["metadata"]["container"]["tags"][0])
' "$tag"
}

# --- the comparison ---------------------------------------------------------

if [ "$mode" = local ]; then
  measure=local_size
  find_previous=local_previous_tag
  unit='вес по docker image inspect'
  subject="$repository:$tag"
else
  measure=registry_size
  find_previous=registry_previous_tag
  unit='сжатый вес'
  subject="$registry/$namespace/$repository:$tag"
fi

new_size="$($measure "$tag" || true)"
if [ -z "$new_size" ]; then
  if [ "$mode" = local ]; then
    echo "No local image $repository:$tag to weigh. Build it first." >&2
    exit 1
  fi
  echo "Registry has no manifest for $subject, so its weight cannot be read." >&2
  exit 1
fi

if [ -z "$previous_tag" ]; then
  previous_tag="$($find_previous || true)"
fi

if [ -z "$previous_tag" ]; then
  # A check that passes must say which of the two reasons it passed for. The
  # first release of all has nothing behind it; a registry that would not name
  # the release before this one is a check that did not run, and calling that
  # "within the allowance" is how a gate becomes decoration.
  echo "Weight check: nothing to compare $subject against ($unit $(human "$new_size"))."
  if [ "$mode" = registry ]; then
    echo "  The registry did not name an earlier version — no gh, no access, or this is the first release."
    echo "  If there is an earlier tag, name it: $0 registry $tag <предыдущий-sha>"
  else
    echo "  No other image of this repository on this machine."
  fi
  exit 0
fi

previous_size="$($measure "$previous_tag" || true)"
if [ -z "$previous_size" ]; then
  if [ "$mode" = local ]; then
    # Nothing is wrong with the release; this machine simply no longer keeps the
    # image before it. The registry check covers the same ground before the host
    # ever sees the image.
    echo "Weight check: previous tag $previous_tag is not on this machine, so the local comparison is skipped."
    echo "  The registry check after the push still covers this release."
    exit 0
  fi
  echo "Registry has no readable manifest for $previous_tag, so there is nothing to compare against." >&2
  exit 1
fi

# Integer arithmetic only: comparing new * 100 against previous * (100 + max)
# keeps the decision exact, where a floating ratio would put a release on the
# wrong side of the line at the boundary.
allowed=$(( previous_size * (100 + max_growth) / 100 ))
growth_percent=$(( (new_size - previous_size) * 100 / previous_size ))

echo "Weight check ($unit):"
# The tag column is padded and the labels trail the number: printf pads by bytes,
# so a Cyrillic label in a fixed-width column comes out ragged.
printf '  %-14s %s (новый)\n' "$tag" "$(human "$new_size")"
printf '  %-14s %s (предыдущий)\n' "$previous_tag" "$(human "$previous_size")"
printf '  %-14s %s\n' 'разница' "${growth_percent}% при допуске ${max_growth}%"

if [ "$new_size" -le "$allowed" ]; then
  echo "  в допуске"
  exit 0
fi

echo >&2
echo "REFUSING: $subject is ${growth_percent}% heavier than $previous_tag, over the ${max_growth}% allowance." >&2
echo "Something entered the build context that the previous release did not carry." >&2
echo "Find it before publishing:" >&2
echo "  docker history $repository:$tag --no-trunc --format '{{.Size}}\\t{{.CreatedBy}}' | sort -h | tail -20" >&2
echo "  pnpm jest tests/evidence-material.build-context.test.cjs" >&2
if [ "$mode" = registry ]; then
  echo >&2
  echo "The tag is already in the registry. Remove it before it reaches the host:" >&2
  echo "  gh api --paginate /users/$namespace/packages/container/$repository/versions \\" >&2
  echo "    --jq '.[] | select(.metadata.container.tags[]? == \"$tag\") | .id'" >&2
  echo "  gh api -X DELETE /users/$namespace/packages/container/$repository/versions/<id>" >&2
fi
exit 1
