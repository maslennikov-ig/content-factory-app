#!/usr/bin/env bash
#
# Keep what a rollback needs on the production host, and nothing else that a
# release left behind: two of OUR release images — the one that runs and the
# one the rollback targets — and a short tail of the configuration copies each
# switch makes. Delete the rest by name.
#
# Why a script and not a line in the runbook. The runbook has asked for this
# since 24.08.2026 and it kept being skipped, because it is the last step of a
# release, it is a judgement call about which tags are safe, and a judgement
# call at the end of a long procedure is a step that does not happen. On
# 03.09.2026 the host held three of our images again. A step that is mechanical
# does not need to be remembered.
#
# What makes it safe to run without asking each time. The host is shared: n8n,
# trend-pars, psk-dom-bot, cortex, glitchtip and a dozen more of the owner's
# containers live beside ours. So this script can only ever remove an image
# whose repository is exactly ours, it names every tag it removes, and it
# refuses outright rather than guessing:
#
#   - `docker system prune` and `docker image prune` are never used, in any
#     form, including the "safe" ones. They are repository-wide by nature.
#   - Only `<registry>/<namespace>/content-factory-next` tags are candidates.
#     Anything else on the host is invisible to this script.
#   - The image the app container actually runs is read from the container, not
#     from `.env`, and is never a candidate. `CONTENT_FACTORY_RELEASE` has been
#     wrong three releases running; the container cannot be.
#   - That running image must belong to our repository. If it does not, the
#     script refuses without removing anything: the running tag then names
#     nothing in our row of tags, and the "rollback target" it would keep would
#     be chosen from a different row than the one serving requests.
#   - The rollback target is the newest remaining tag after the running one,
#     and it is never a candidate either.
#   - The app container must be healthy first. Deleting the previous image
#     while the new one is failing removes the way back.
#
# The configuration copies are the second half because they are the same
# problem: `switch-host-image.sh` writes `.env.bak-before-<tag>` and
# `app.env.bak-before-<tag>` every release and nothing ever removed one. By
# 03.09.2026 there were 78 of them. They are not an exposure — every `.env`
# copy is `600` and the `docker-compose.yaml` copies hold `${VAR}` references
# rather than values, both checked that day — but 78 copies of files that do
# contain secrets is 78 chances for one of them to be mis-permissioned later,
# and a directory nobody can read is a directory nobody checks.
#
# Usage: CF_DEPLOY_HOST=root@<host> scripts/release/retain-host-artifacts.sh [--dry-run]
#
# Environment:
#   CF_DEPLOY_HOST   required, same as the other release scripts. No default:
#                    the host is not named in this repository.
#   CF_KEEP          how many of our tags to keep, default 2. Below 2 is
#                    refused — one tag means no rollback target.
#   CF_KEEP_BACKUPS  how many configuration copies to keep per family, default
#                    3. A copy naming the running image or the rollback target
#                    is kept whatever this says.
#   CF_REGISTRY           default ghcr.io
#   CF_REGISTRY_NAMESPACE default maslennikov-ig
set -euo pipefail

host="${CF_DEPLOY_HOST:-}"
keep="${CF_KEEP:-2}"
keep_backups="${CF_KEEP_BACKUPS:-3}"
remote_dir="${CF_REMOTE_DIR:-/srv/content-factory-next}"
registry="${CF_REGISTRY:-ghcr.io}"
namespace="${CF_REGISTRY_NAMESPACE:-maslennikov-ig}"
repository="${registry}/${namespace}/content-factory-next"
dry_run=0

for argument in "$@"; do
  case "$argument" in
    --dry-run) dry_run=1 ;;
    *)
      echo "Unknown argument: $argument" >&2
      exit 2
      ;;
  esac
done

if [ -z "$host" ]; then
  cat >&2 <<'MESSAGE'
CF_DEPLOY_HOST is not set. It names the production host and is
deliberately absent from this repository:
  CF_DEPLOY_HOST=root@<host> scripts/release/retain-host-artifacts.sh
MESSAGE
  exit 2
fi

if ! [ "$keep" -ge 2 ] 2>/dev/null; then
  echo "CF_KEEP must be 2 or more: one tag leaves no rollback target." >&2
  exit 2
fi

if ! [ "$keep_backups" -ge 1 ] 2>/dev/null; then
  echo "CF_KEEP_BACKUPS must be 1 or more." >&2
  exit 2
fi

run() { ssh -o BatchMode=yes "$host" "$@"; }

# 1. The app has to be healthy before anything is removed. The previous image
#    is the way back, and the way back matters most exactly when the new one
#    turned out to be broken.
health="$(run "docker inspect cf-next-app --format '{{.State.Health.Status}}' 2>/dev/null || echo missing")"
if [ "$health" != "healthy" ]; then
  echo "cf-next-app is '$health', not healthy. Nothing removed." >&2
  echo "The previous image is the rollback target; it stays until the new one is proven." >&2
  exit 1
fi

# 2. What actually runs, read from the container itself.
running_image="$(run "docker inspect cf-next-app --format '{{.Config.Image}}'")"
running_tag="${running_image##*:}"
running_repository="${running_image%:*}"
echo "Running: ${running_image}"

#    And it has to be OUR image. Everything below reasons about one row of
#    tags: the running tag heads the keep list, the rollback target is the next
#    tag in that row, and the configuration copies are kept by matching those
#    two names. If the container is running something else — a hotfix built
#    from another repository, a `docker run` by hand, an image that lost its
#    tag and shows as a digest — then `running_tag` names nothing in our row.
#    The keep list would then be one short, the tag we actually run would be a
#    removal candidate, and the "rollback target" would be a tag chosen from a
#    different row than the one serving requests. Refuse instead of guessing.
if [ "$running_repository" != "$repository" ]; then
  cat >&2 <<MESSAGE
cf-next-app runs ${running_image}.
That is not ${repository}, so which of our tags is running, and which one a
rollback would go back to, are both unknown. Nothing removed.
MESSAGE
  exit 1
fi

# 3. Our tags on the host, newest first.
mapfile -t tags < <(run "docker images --filter reference='${repository}' --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2")

if [ "${#tags[@]}" -eq 0 ]; then
  echo "No ${repository} images on the host."
fi

# The running tag is always first in the keep list, wherever it sorts.
keep_list=("$running_tag")
for tag in "${tags[@]}"; do
  [ "$tag" = "$running_tag" ] && continue
  [ "${#keep_list[@]}" -ge "$keep" ] && break
  keep_list+=("$tag")
done

remove_list=()
for tag in "${tags[@]}"; do
  keeping=0
  for kept in "${keep_list[@]}"; do
    [ "$tag" = "$kept" ] && keeping=1 && break
  done
  [ "$keeping" -eq 0 ] && remove_list+=("$tag")
done

echo "Keeping ${#keep_list[@]}: ${keep_list[*]}"

if [ "${#remove_list[@]}" -eq 0 ]; then
  echo "Images: the host already holds ${#tags[@]} of ours, nothing to remove."
elif [ "$dry_run" -eq 1 ]; then
  echo "Removing ${#remove_list[@]}: ${remove_list[*]}"
else
  echo "Removing ${#remove_list[@]}: ${remove_list[*]}"
  # 4. Remove by full name, one command, every name spelled out. No wildcard
  #    reaches this line and no prune is anywhere in this file.
  targets=()
  for tag in "${remove_list[@]}"; do targets+=("${repository}:${tag}"); done
  run "docker rmi ${targets[*]}" || {
    echo "docker rmi refused. Nothing else is attempted; look at the host." >&2
    exit 1
  }
fi

# 5. Prove the rollback target survived and the stack is whole.
rollback="${keep_list[1]:-}"
if [ -n "$rollback" ]; then
  run "docker image inspect ${repository}:${rollback} --format 'rollback target present: {{.Id}}'"
fi
run "docker compose -f ${remote_dir}/docker-compose.yaml ps --format '{{.Name}}\t{{.Status}}'" || true
run "df -h / | tail -1"

# 6. The configuration copies each switch leaves behind.
#
#    Only `*.bak*` siblings of the three files a release touches are ever
#    considered: the live `.env`, `app.env` and `docker-compose.yaml` are not
#    matched by any pattern here, and nothing outside this directory is.
echo
echo "Configuration copies (keeping ${keep_backups} per family, plus anything naming ${running_tag} or ${rollback})"

for family in ".env.bak" "app.env.bak" "docker-compose.yaml.bak"; do
  mapfile -t copies < <(run "cd ${remote_dir} && ls -1t ${family}* 2>/dev/null || true")
  [ "${#copies[@]}" -eq 0 ] && continue

  drop=()
  index=0
  for copy in "${copies[@]}"; do
    [ -z "$copy" ] && continue
    index=$((index + 1))
    # A copy that names the running image or the rollback target is what a
    # rollback would restore. It is kept whatever its position.
    case "$copy" in
      *"$running_tag"*|*"$rollback"*) continue ;;
    esac
    [ "$index" -le "$keep_backups" ] && continue
    drop+=("$copy")
  done

  if [ "${#drop[@]}" -eq 0 ]; then
    echo "  ${family}*: ${#copies[@]} copies, nothing to remove"
    continue
  fi

  echo "  ${family}*: ${#copies[@]} copies, removing ${#drop[@]}"
  printf '    %s\n' "${drop[@]}"

  if [ "$dry_run" -eq 0 ]; then
    # Names are passed one per line and quoted on the far side. No glob is
    # expanded by the remote shell: the list is the one printed above.
    printf '%s\n' "${drop[@]}" | run "cd ${remote_dir} && xargs -d '\n' -r rm -f --"
  fi
done

# 7. Whatever copies remain, a copy of an env file must not be readable beyond
#    root. None were wrong on 03.09.2026; this keeps it that way without
#    anyone having to look.
if [ "$dry_run" -eq 0 ]; then
  loosened="$(run "cd ${remote_dir} && find . -maxdepth 1 \( -name '.env.bak*' -o -name 'app.env.bak*' \) ! -perm 600 -print -exec chmod 600 {} + | wc -l")"
  echo "Tightened to 600: ${loosened}"
fi
