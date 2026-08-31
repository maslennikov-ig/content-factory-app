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
set -euo pipefail

tag="${1:-}"
expected_digest="${2:-}"
if [ -z "$tag" ]; then
  echo "usage: scripts/release/pull-image-on-host.sh <tag> [expected-digest]" >&2
  exit 1
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

remote_body="$(
  cat <<'REMOTE'
set -eu
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
