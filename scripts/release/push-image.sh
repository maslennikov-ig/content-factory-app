#!/usr/bin/env bash
#
# Push a built release image to the container registry.
#
# Why a registry at all: the old path was `docker save | zstd | ssh 'docker
# load'`, which moves the whole 4.1 GB image on every release, even when only a
# documentation line changed. A registry stores each layer under its own digest,
# so a push uploads only the layers that are new and a pull downloads only the
# layers the host is missing. The base image and the node_modules layers, which
# are almost all of the size, never move again after the first release.
#
# The credential is read from `gh auth token` (or CF_REGISTRY_TOKEN) and piped
# straight into `docker login --password-stdin`. It never appears in argv, in
# the shell history, or in the operator's own ~/.docker/config.json: DOCKER_CONFIG
# points at a temporary directory that the trap removes on exit.
#
# Usage: scripts/release/push-image.sh <tag>
#   <tag> is the short commit sha the image was built with, i.e. the local image
#   must already exist as content-factory-next:<tag>.
#
# Environment:
#   CF_REGISTRY           default ghcr.io
#   CF_REGISTRY_NAMESPACE default maslennikov-ig
#   CF_REGISTRY_USER      default the namespace
#   CF_REGISTRY_TOKEN     default `gh auth token`; needs the write:packages scope
#
# Output: the pushed manifest digest, which scripts/release/pull-image-on-host.sh
# takes as its expected value.
set -euo pipefail

tag="${1:-}"
if [ -z "$tag" ]; then
  echo "usage: scripts/release/push-image.sh <tag>" >&2
  exit 1
fi

registry="${CF_REGISTRY:-ghcr.io}"
namespace="${CF_REGISTRY_NAMESPACE:-maslennikov-ig}"
user="${CF_REGISTRY_USER:-$namespace}"

local_image="content-factory-next:$tag"
remote_image="$registry/$namespace/content-factory-next:$tag"

if ! docker image inspect "$local_image" >/dev/null 2>&1; then
  echo "No local image $local_image. Build it first:" >&2
  echo "  docker build --target runtime -t $local_image -f Dockerfile ." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# First, and cheapest to answer: did this commit's own test suite pass? Five
# releases went out between 25.08.2026 and 30.08.2026 with fourteen guards red,
# because `pnpm test` was a line in a checklist rather than a step that refuses.
"$script_dir/check-suite-receipt.sh"
echo

# Before anything is uploaded: is this image suddenly heavier than the release
# before it? Free and offline when the previous image is still on this machine,
# which on the build machine it normally is. See check-image-weight.sh for why
# weight is a gate at all.
"$script_dir/check-image-weight.sh" local "$tag"
echo

token="${CF_REGISTRY_TOKEN:-}"
if [ -z "$token" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "No CF_REGISTRY_TOKEN and no gh CLI to take one from." >&2
    exit 1
  fi
  token="$(gh auth token)"
fi

config_dir="$(mktemp -d)"
chmod 700 "$config_dir"
trap 'rm -rf "$config_dir"' EXIT
export DOCKER_CONFIG="$config_dir"

printf '%s' "$token" | docker login "$registry" -u "$user" --password-stdin >/dev/null
unset token

docker tag "$local_image" "$remote_image"
docker push "$remote_image"

# The digest the registry accepted. `docker push` prints it too, but reading it
# back from the local store is what the host will be compared against.
digest="$(docker image inspect "$remote_image" \
  --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | grep "^$registry/$namespace/content-factory-next@" \
  | head -1 \
  | cut -d@ -f2)"

# The authoritative weight check: compressed bytes against compressed bytes,
# read from manifests without pulling anything. It runs even when the local
# check above had no earlier image to compare with, and it runs before the tag
# is handed to the host — a refusal here stops the release with the image still
# only in the registry, where it can be deleted.
#
# Before the logout, deliberately. The package is private, so reading a manifest
# needs the credential this script is still holding; after the logout the
# temporary DOCKER_CONFIG is empty and every manifest read comes back
# `unauthorized` — a gate that fails for the wrong reason on every release.
"$script_dir/check-image-weight.sh" registry "$tag"

docker logout "$registry" >/dev/null

echo
echo "Pushed $remote_image"
echo "  digest $digest"
echo
echo "Pull it on the host without changing what runs there:"
echo "  scripts/release/pull-image-on-host.sh $tag $digest"
