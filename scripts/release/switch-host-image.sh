#!/usr/bin/env bash
#
# Switch the production host to a release image, and make the version marker
# unable to disagree with what runs.
#
# Why this script exists at all. The switch was two hand-typed `sed` lines in
# the runbook, and one of them — `CONTENT_FACTORY_RELEASE` in `app.env` — was
# wrong on 26.08, 01.09, 02.09 and 03.09.2026. Four releases out of the last
# several, each found afterwards, each meaning the error collector attributed
# every event of that period to code that was not running: the marker is what
# `initialize.sentry.ts` and the three frontend Sentry configs pass as
# `release`. A stack trace against the wrong commit is worse than no release
# marker, because it is believed.
#
# The fix is not a reminder. Both values are written here from ONE variable, in
# one command, and the script then reads back what the container actually runs
# and refuses to call the release finished if the three disagree. There is no
# ordering in which a person can set one and forget the other.
#
# Why not in `push-image.sh` or `pull-image-on-host.sh`. Publishing and placing
# the image are deliberately separate from switching — the image can sit on the
# host for a day while the old version keeps serving, and that separation is
# what makes the switch itself take seconds. A script that publishes must not
# touch a running host, and a script that pulls must change nothing that runs.
# The marker belongs where the switch happens, because it describes what runs.
#
# Usage: CF_DEPLOY_HOST=root@<host> scripts/release/switch-host-image.sh <tag>
#
# Environment:
#   CF_DEPLOY_HOST        required. No default: the host is not named in this
#                         repository. Same variable the other release scripts use.
#   CF_REMOTE_DIR         default /srv/content-factory-next
#   CF_REGISTRY           default ghcr.io
#   CF_REGISTRY_NAMESPACE default maslennikov-ig
#   CF_HEALTH_TIMEOUT     seconds to wait for `healthy`, default 180
set -euo pipefail

tag="${1:-}"
host="${CF_DEPLOY_HOST:-}"
remote_dir="${CF_REMOTE_DIR:-/srv/content-factory-next}"
registry="${CF_REGISTRY:-ghcr.io}"
namespace="${CF_REGISTRY_NAMESPACE:-maslennikov-ig}"
repository="${registry}/${namespace}/content-factory-next"
health_timeout="${CF_HEALTH_TIMEOUT:-180}"

if [ -z "$tag" ]; then
  echo "Usage: CF_DEPLOY_HOST=root@<host> $0 <tag>" >&2
  exit 2
fi

if [ -z "$host" ]; then
  cat >&2 <<'MESSAGE'
CF_DEPLOY_HOST is not set. It names the production host and is
deliberately absent from this repository:
  CF_DEPLOY_HOST=root@<host> scripts/release/switch-host-image.sh <tag>
MESSAGE
  exit 2
fi

image="${repository}:${tag}"
run() { ssh -o BatchMode=yes "$host" "$@"; }

# 1. The image has to be on the host already. `pull-image-on-host.sh` put it
#    there and proved its digest; this script does not pull, so that proof is
#    not quietly skipped by switching straight to a tag nobody verified.
if ! run "docker image inspect ${image} >/dev/null 2>&1"; then
  echo "The host has no ${image}." >&2
  echo "Run scripts/release/pull-image-on-host.sh ${tag} <digest> first." >&2
  exit 1
fi

echo "Switching to ${image}"

# 2. Copies before anything is edited. Never clobber an existing backup: a
#    second run of the same release must not overwrite the state the first run
#    was rolling back from.
run "cd ${remote_dir} && for f in .env app.env; do
  [ -f \"\$f.bak-before-${tag}\" ] || cp -a \"\$f\" \"\$f.bak-before-${tag}\";
done"

# 3. Both values from one variable, in one command. `|` as the separator
#    because the image name contains slashes. `CONTENT_FACTORY_RELEASE` is
#    appended when the file does not carry it yet, so a fresh install ends up
#    with a marker rather than without one.
run "cd ${remote_dir} &&
  sed -i 's|^CF_IMAGE=.*|CF_IMAGE=\"${image}\"|' .env &&
  if grep -q '^CONTENT_FACTORY_RELEASE=' app.env; then
    sed -i 's|^CONTENT_FACTORY_RELEASE=.*|CONTENT_FACTORY_RELEASE=\"${tag}\"|' app.env;
  else
    printf '\nCONTENT_FACTORY_RELEASE=\"%s\"\n' '${tag}' >> app.env;
  fi"

# 4. Switch.
run "cd ${remote_dir} && docker compose up -d cf-app"

# 5. Wait for health rather than declaring success at `Started`. A container
#    that starts and then dies is exactly the case the rollback target exists
#    for, and it must not be reported as a finished release.
echo -n "Waiting for cf-next-app to become healthy"
deadline=$((SECONDS + health_timeout))
status=""
while [ "$SECONDS" -lt "$deadline" ]; do
  status="$(run "docker inspect cf-next-app --format '{{.State.Health.Status}}' 2>/dev/null || echo missing")"
  [ "$status" = "healthy" ] && break
  echo -n "."
  sleep 5
done
echo

if [ "$status" != "healthy" ]; then
  echo "cf-next-app is '$status' after ${health_timeout}s." >&2
  echo "The previous image is still on the host; see «Откат» in the runbook." >&2
  exit 1
fi

# 6. The check the four drifts would have failed. What the container runs, what
#    `.env` names and what the error collector will report must be one string.
running_image="$(run "docker inspect cf-next-app --format '{{.Config.Image}}'")"
marker="$(run "cd ${remote_dir} && grep '^CONTENT_FACTORY_RELEASE=' app.env | cut -d= -f2- | tr -d '\"'")"
running_tag="${running_image##*:}"

if [ "$running_tag" != "$tag" ] || [ "$marker" != "$tag" ]; then
  cat >&2 <<MESSAGE
The three do not agree:
  requested tag       ${tag}
  container runs      ${running_tag}
  CONTENT_FACTORY_RELEASE  ${marker}
Every error report from now on would name the wrong commit. Fix before
calling this release done.
MESSAGE
  exit 1
fi

echo "Running ${running_image}"
echo "CONTENT_FACTORY_RELEASE=${marker} — agrees with the container"
run "docker inspect cf-next-app --format 'restarts: {{.RestartCount}}'"
run "docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' cf-next-app"

cat <<MESSAGE

Switched. Still to do, in this order:
  1. the checks in «Проверки после развёртывания»
  2. CF_DEPLOY_HOST=${host} scripts/release/retain-host-artifacts.sh
MESSAGE
