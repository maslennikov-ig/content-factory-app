#!/usr/bin/env bash
#
# Pull a release image onto the production host and prove it is the image that
# was pushed. Changes nothing that runs: no CF_IMAGE edit, no compose command,
# no container restart. Switching the running version stays a separate,
# deliberate step, exactly as in the runbook.
#
# The credential question this script answers: the host is shared with about a
# dozen unrelated production containers, so a long-lived write-capable token
# must not live there. Nothing is stored. The token is piped over the ssh
# connection into `docker login --password-stdin` on the far side, docker writes
# it into a temporary DOCKER_CONFIG that the trap deletes, and root's own
# ~/.docker/config.json is never touched. Between releases the host holds no
# registry credential at all, so there is nothing on it to leak or to rotate.
#
# Usage: scripts/release/pull-image-on-host.sh <tag> [expected-digest]
#   With the digest from scripts/release/push-image.sh the script fails loudly
#   when the host ends up with anything other than the image that was pushed.
#
# Environment:
#   CF_DEPLOY_HOST        required, e.g. root@203.0.113.10. No default: the host
#                         is one machine shared with a dozen unrelated
#                         production containers, and a repository that names it
#                         hands out a map of somebody else's server along with
#                         this runbook. It lives in the operator's environment.
#   CF_REGISTRY           default ghcr.io
#   CF_REGISTRY_NAMESPACE default maslennikov-ig
#   CF_REGISTRY_USER      default the namespace
#   CF_REGISTRY_TOKEN     default `gh auth token`; read:packages is enough here
#   CF_PULL_UNPACKED_BYTES, CF_PULL_UNPACKED_ENTRIES
#                         optional paired measurements of THIS candidate from
#                         its full uncompressed layers, including parent dirs.
#                         Otherwise stream docker save of our exact local image.
#                         No compressed/inspect Size estimate is accepted.
#   CF_PULL_DOWNLOAD_BYTES optional verified stored-layer bytes of THIS candidate,
#                         only alongside the paired unpacked measurements. The
#                         refined model requires an observed overlay2 host.
set -euo pipefail

tag="${1:-}"
expected_digest="${2:-}"
if [ -z "$tag" ] || [ "$#" -gt 2 ]; then
  echo "usage: scripts/release/pull-image-on-host.sh <tag> [expected-digest]" >&2
  exit 1
fi
case "$tag" in
  *[!A-Za-z0-9._-]* | -* | .*)
    echo "Refusing a non-simple image tag." >&2
    exit 2
    ;;
esac
if [ "${#tag}" -gt 128 ]; then
  echo "Refusing an image tag longer than 128 characters." >&2
  exit 2
fi

deploy_host="${CF_DEPLOY_HOST:-}"
if [ -z "$deploy_host" ]; then
  echo "CF_DEPLOY_HOST is not set. It names the production host and is" >&2
  echo "deliberately absent from this repository:" >&2
  echo "  CF_DEPLOY_HOST=root@<host> scripts/release/pull-image-on-host.sh $tag" >&2
  exit 1
fi
registry="${CF_REGISTRY:-ghcr.io}"
namespace="${CF_REGISTRY_NAMESPACE:-maslennikov-ig}"
user="${CF_REGISTRY_USER:-$namespace}"
remote_image="$registry/$namespace/content-factory-next:$tag"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Both caller measurements and archive output cross the same integer boundary.
# The ceilings bound arithmetic and refuse an accidental unit/format mismatch.
positive_integer() {
  case "$1" in "" | *[!0-9]* | 0*) return 1 ;; esac
  [ "${#1}" -le 13 ] && [ "$1" -le "$2" ]
}
unpacked_bytes="${CF_PULL_UNPACKED_BYTES:-}"
unpacked_entries="${CF_PULL_UNPACKED_ENTRIES:-}"
download_bytes="${CF_PULL_DOWNLOAD_BYTES:-}"
stored_layer_bytes=
command -v timeout >/dev/null || {
  echo "The capacity guard requires timeout." >&2
  exit 1
}
if [ "${CF_PULL_DOWNLOAD_BYTES+x}" = x ] &&
   ! positive_integer "$download_bytes" 1000000000000; then
  echo "CF_PULL_DOWNLOAD_BYTES must be a bounded positive integer when supplied." >&2
  exit 1
fi
if [ -n "$unpacked_bytes" ] || [ -n "$unpacked_entries" ] || [ -n "$download_bytes" ]; then
  if ! positive_integer "$unpacked_bytes" 1000000000000 ||
     ! positive_integer "$unpacked_entries" 10000000; then
    echo "Supply both bounded positive CF_PULL_UNPACKED_BYTES and CF_PULL_UNPACKED_ENTRIES." >&2
    exit 1
  fi
else
  candidate_id=
  for candidate in "$remote_image" "content-factory-next:$tag"; do
    candidate_id="$(timeout 15s docker image inspect "$candidate" --format '{{.Id}}' 2>/dev/null || true)"
    [ -z "$candidate_id" ] || break
  done
  if [[ ! "$candidate_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "No measurable own local candidate; supply verified unpacked layer measurements." >&2
    exit 1
  fi
  # Docker's containerd image ID can name an index rather than the config.
  # Pin the export by that ID and bind its config/layers to inspected diff IDs.
  candidate_layers="$(timeout 15s docker image inspect "$candidate_id" --format '{{json .RootFS.Layers}}')"
  if [ "${#candidate_layers}" -gt 65536 ]; then
    echo "Candidate layer metadata exceeds the measurement bound." >&2
    exit 1
  fi
  if ! measurement="$(
    timeout 600s docker image save "$candidate_id" |
      timeout 600s python3 "$script_dir/measure-image-unpacked.py" --expected-diff-ids "$candidate_layers" --include-download-bytes
  )"; then
    echo "Unpacked image measurement failed; no capacity estimate is substituted." >&2
    exit 1
  fi
  read -r unpacked_bytes unpacked_entries stored_layer_bytes extra <<<"$measurement"
  if [ -n "${extra:-}" ] ||
     ! positive_integer "$unpacked_bytes" 1000000000000 ||
     ! positive_integer "$unpacked_entries" 10000000 ||
     ! positive_integer "$stored_layer_bytes" 1000000000000; then
    echo "Unpacked image measurement is incomplete or out of bounds." >&2
    exit 1
  fi
  # Local diff IDs do not prove the registry's compressed representation.
  # Only an explicit caller-verified download measurement may earn that credit.
fi
printf 'Capacity candidate: unpacked_bytes=%s unpacked_entries=%s download_bytes=%s stored_layer_bytes=%s\n' \
  "$unpacked_bytes" "$unpacked_entries" "${download_bytes:-unknown}" "${stored_layer_bytes:-unknown}"

# Read only DockerRootDir's actual filesystem. The first bounded SSH runs
# BEFORE check-image-weight.sh, which may itself log in to the registry.
# Reuse the exact check immediately before the host login to reject space
# lost while the registry weight gate was running.
capacity_prelude="$(printf 'unpacked_bytes=%q\nunpacked_entries=%q\ndownload_bytes=%q\n' \
  "$unpacked_bytes" "$unpacked_entries" "$download_bytes")"
capacity_body="$(
  cat <<'CAPACITY'
set -eu
bounded_integer() {
  case "$1" in "" | *[!0-9]* | 0*) return 1 ;; esac
  [ "${#1}" -le 15 ] && [ "$1" -le "$2" ]
}
docker_root="$(timeout 10s docker info --format '{{.DockerRootDir}}')"
case "$docker_root" in /*) ;; *) echo "Unknown DockerRootDir; refusing pull." >&2; exit 1 ;; esac
[ -d "$docker_root" ] || { echo "DockerRootDir is not a readable directory." >&2; exit 1; }
# Discovery failure gives no credit for the smaller legacy-overlay2 model.
if ! storage_driver="$(timeout 10s docker info --format '{{.Driver}}' 2>/dev/null)"; then
  storage_driver=
fi
# GNU df: --output and -i are mutually exclusive. Both selected fields are
# numeric and no path/source column can shift the values, even for spaces.
filesystem="$(LC_ALL=C timeout 5s df -B1 --output=avail,iavail "$docker_root")"
filesystem_row="$(printf '%s\n' "$filesystem" | sed -n '2p')"
read -r available_bytes available_inodes extra <<VALUES
$filesystem_row
VALUES
block_bytes="$(timeout 5s stat -f -c '%S' "$docker_root")"
if [ -n "${extra:-}" ] ||
   ! bounded_integer "${available_bytes:-}" 999999999999999 ||
   ! bounded_integer "${available_inodes:-}" 1000000000000 ||
   ! bounded_integer "$block_bytes" 1048576; then
  echo "Unknown or out-of-bounds Docker filesystem capacity; refusing pull." >&2
  exit 1
fi
[ "$block_bytes" -ge 4096 ] || block_bytes=4096
# No reuse/cleanup credit. The verified overlay2 model keeps one full extracted
# snapshot plus two measured stored-layer copies, then transient/operating space.
# Unknown driver/download retains the original full-double-unpacked reservation.
capacity_model=conservative
required_bytes=$((6000000000 + 2 * (unpacked_bytes + unpacked_entries * block_bytes) + 1000000000))
if [ "$storage_driver" = overlay2 ] && [ -n "$download_bytes" ]; then
  capacity_model=overlay2-verified-download
  required_bytes=$((6000000000 + unpacked_bytes + unpacked_entries * block_bytes + 2 * download_bytes + 1000000000))
fi
required_inodes=$((10000 + 2 * unpacked_entries))
printf 'Capacity host: capacity_model=%s available_bytes=%s available_inodes=%s required_bytes=%s required_inodes=%s\n' \
  "$capacity_model" "$available_bytes" "$available_inodes" "$required_bytes" "$required_inodes"
if [ "$available_bytes" -lt "$required_bytes" ] || [ "$available_inodes" -lt "$required_inodes" ]; then
  echo "Insufficient Docker filesystem capacity for pull plus operating headroom; nothing pulled." >&2
  exit 1
fi
CAPACITY
)"
timeout 30s ssh -o BatchMode=yes -o ConnectTimeout=10 "$deploy_host" "$capacity_prelude"$'\n'"$capacity_body"

# The host is the point of no return for disk: it keeps two of our tags at a
# time on a shared 79 GB disk, next to a dozen unrelated production containers.
# push-image.sh already weighed this tag, but the runbook allows this script to
# be run on its own, so the same gate stands here. Manifests only, no pull.
"$script_dir/check-image-weight.sh" registry "$tag"
echo

token="${CF_REGISTRY_TOKEN:-}"
if [ -z "$token" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "No CF_REGISTRY_TOKEN and no gh CLI to take one from." >&2
    exit 1
  fi
  token="$(gh auth token)"
fi

# Values are quoted into the remote command; the body below is literal, so
# nothing in it expands on this side.
remote_prelude="$(printf 'registry=%q\nuser_name=%q\nimage=%q\n' \
  "$registry" "$user" "$remote_image")"
remote_prelude+=$'\n'"$capacity_prelude"

remote_body="$(
  cat <<'REMOTE'
config_dir="$(mktemp -d)"
chmod 700 "$config_dir"
trap 'rm -rf "$config_dir"' EXIT
export DOCKER_CONFIG="$config_dir"

docker login "$registry" -u "$user_name" --password-stdin >/dev/null
docker pull "$image"
docker logout "$registry" >/dev/null

docker image inspect "$image" --format 'HOST_DIGEST={{index .RepoDigests 0}}'
docker image inspect "$image" --format 'HOST_IMAGE_ID={{.Id}}'
REMOTE
)"
remote_body="$capacity_body"$'\n'"$remote_body"

transcript="$(mktemp)"
trap 'rm -f "$transcript"' EXIT

# The token is the whole of the remote command's stdin: --password-stdin reads
# to EOF, and nothing after the login needs stdin.
printf '%s' "$token" | ssh "$deploy_host" "$remote_prelude"$'\n'"$remote_body" | tee "$transcript"
unset token

host_digest="$(grep '^HOST_DIGEST=' "$transcript" | head -1 | cut -d@ -f2)"

echo
echo "Host now has $remote_image"
echo "  digest $host_digest"

if [ -n "$expected_digest" ]; then
  if [ "$host_digest" = "$expected_digest" ]; then
    echo "  matches the pushed digest"
  else
    echo "  DOES NOT match the pushed digest $expected_digest" >&2
    exit 1
  fi
fi

echo
echo "Nothing on the host was switched over. To run this version:"
echo "  ssh $deploy_host"
echo "  cd /srv/content-factory-next"
echo "  sed -i 's|^CF_IMAGE=.*|CF_IMAGE=\"$remote_image\"|' .env"
echo "  docker compose up -d cf-app"
