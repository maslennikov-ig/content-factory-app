#!/usr/bin/env bash
#
# Lay out the tree that will become the public repository, and refuse if it
# carries anything that was decided to stay behind.
#
# The move copies a tree, not a history: commit `575404c7` holds screenshots
# with the owner's personal address, and `git push` of this repository would
# publish every commit including that one. Copying the tree solves it by
# construction — see docs/operations/public-repository-move.md.
#
# Why a script and not `cp -r`. The corpora of three real authors sit in this
# working directory as `scripts/evidence/voice-eval/corpus.*.json`, ignored by
# Git and present on disk. A filesystem copy takes them; between 26 and 30
# August 2026 that exact difference — "Git does not see it, but `COPY . /app`
# does" — shipped thirteen images carrying personal source texts. This script
# copies the index, so an ignored file cannot get in even by accident.
#
# What is deliberately left behind: `.codex/stages/*/evidence/` — 1102 files,
# 677 screenshots, and the only remaining place with the three authors' full
# names. The rest of `.codex` travels; process verification does not run
# without it.
#
# This script does not create a repository, does not commit and does not push.
# It produces a directory and a report, and publication stays a separate,
# explicitly authorised step.
#
# `--update` refreshes an existing clone of the public repository instead of
# writing a fresh directory: same layout, same checks, then `rsync --delete` so
# a file dropped here disappears there too. It refuses on a clone with
# uncommitted work, and the checks run before anything is copied — a finding
# and the damage should not arrive together.
#
# Usage: scripts/operations/prepare-public-tree.sh [--update] <target directory>
set -Eeuo pipefail

update=0
case "${1:-}" in
  --update) update=1; shift ;;
esac

target="${1:-}"
if [ -z "$target" ] || [ "$#" -gt 1 ]; then
  echo "Usage: ${0##*/} [--update] <target directory>" >&2
  echo "  --update  refresh an existing clone of the public repository in place" >&2
  exit 64
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ "$update" -eq 1 ]; then
  # Refreshing means deleting: a file removed here has to disappear there, or
  # the public repository goes on serving something this one no longer has.
  # That makes the clone's own `.git` the thing most worth protecting, and its
  # uncommitted work the thing most easily destroyed — so both are checked
  # rather than assumed.
  if [ ! -d "$target/.git" ]; then
    echo "REFUSING: $target is not a Git working copy." >&2
    echo "--update refreshes an existing clone; it does not create one." >&2
    exit 1
  fi
  if [ -n "$(git -C "$target" status --porcelain)" ]; then
    echo "REFUSING: $target has uncommitted changes, and refreshing would" >&2
    echo "discard them without asking:" >&2
    git -C "$target" status --porcelain >&2
    exit 1
  fi
  if ! command -v rsync >/dev/null 2>&1; then
    echo "REFUSING: --update needs rsync to delete what this tree no longer has." >&2
    exit 1
  fi
elif [ -e "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null || true)" ]; then
  echo "REFUSING: $target exists and is not empty." >&2
  echo "A partial overlay of two trees is not a tree anyone reviewed." >&2
  echo "To refresh an existing clone, pass --update." >&2
  exit 1
fi

# The index is copied, so the index has to be the commit. `tree-differences.sh`
# answers the same question for the release and excludes the three tooling
# directories, which do not reach the image — but `.codex` does travel here, so
# this check is stricter on purpose and shares nothing with it.
differences="$(git status --porcelain --untracked-files=no -- \
  . \
  ':(exclude,top)var/source' \
  ':(exclude,top)var/release')"
if [ -n "$differences" ]; then
  echo "REFUSING: the working tree differs from HEAD, so the copy would not be" >&2
  echo "any reviewed commit. Commit or restore these first:" >&2
  echo "$differences" >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
mkdir -p "$target"
target="$(cd "$target" && pwd)"

# On --update the tree is laid out elsewhere and copied over the clone only
# after it has passed every check below. Checking after the copy would deliver
# the finding and the damage together.
if [ "$update" -eq 1 ]; then
  layout="$(mktemp -d)"
  trap 'rm -rf "$layout"' EXIT
else
  layout="$target"
fi

# `git checkout-index` writes from the index, which is why nothing ignored can
# appear in the result. `git archive` would have been the obvious tool and is
# wrong here: it honours `export-ignore`, and .gitattributes marks the whole of
# `.codex` — which this move keeps.
mapfile -d '' files < <(git ls-files -z | grep -zv '^\.codex/stages/[^/]*/evidence/' || true)
if [ "${#files[@]}" -eq 0 ]; then
  echo "REFUSING: the file list came out empty." >&2
  exit 1
fi
printf '%s\0' "${files[@]}" | git checkout-index --stdin -z --prefix="$layout/"

held_back=$(( $(git ls-files | wc -l) - ${#files[@]} ))

# Everything below re-asks, of the directory that now exists, what the
# pre-publication check asked of the repository. A guard that only reads the
# source it was derived from proves nothing about the artifact.
fail=0
refuse() { echo "REFUSING: $1" >&2; fail=1; }

while IFS= read -r found; do
  case "${found##*/}" in
    *.example|*.example.*) continue ;;
  esac
  refuse "environment file in the public tree: ${found#$layout/}"
done < <(find "$layout" -type f \( -name '.env' -o -name '.env.*' -o -name 'app.env' \) 2>/dev/null)

while IFS= read -r found; do
  refuse "author corpus in the public tree: ${found#$layout/}"
done < <(find "$layout" -type f \( -name 'corpus.*.json' -o -name 'corpora.json' \) 2>/dev/null)

while IFS= read -r found; do
  refuse "stage evidence in the public tree: ${found#$layout/}"
done < <(find "$layout" -path '*/.codex/stages/*/evidence/*' -type f -print -quit 2>/dev/null)

while IFS= read -r found; do
  refuse "private key material in the public tree: ${found#$layout/}"
done < <(find "$layout" -type f \( -name 'id_rsa*' -o -name '*.pem' -o -name '*.p12' \) 2>/dev/null)

[ -f "$layout/LICENSE" ] || refuse "LICENSE is missing; the product is AGPL-3.0"

if [ "$fail" -ne 0 ]; then
  echo >&2
  if [ "$update" -eq 1 ]; then
    echo "The clone was not touched." >&2
  else
    echo "The prepared tree was left in place so the finding can be read:" >&2
    echo "  $layout" >&2
  fi
  exit 1
fi

if [ "$update" -eq 1 ]; then
  # `--delete` is the point: without it a file dropped here would live on in
  # the public repository forever. `.git/` is excluded because the clone's own
  # history is the one thing this tree has no copy of.
  rsync --archive --delete --exclude='.git/' "$layout/" "$target/"
fi

echo "Public tree prepared from $(git rev-parse --short=12 "$commit")"
echo "  $target"
echo "  $(printf '%s\n' "${files[@]}" | wc -l) files, $(du -sh "$layout" | cut -f1)"
echo "  $held_back stage-evidence files held back"
echo

if [ "$update" -eq 1 ]; then
  changed="$(git -C "$target" status --porcelain | wc -l)"
  echo "The clone now matches this tree: $changed path(s) differ from its last commit."
  echo "Nothing was committed and nothing was pushed. Review, then commit and push"
  echo "as a separate, explicitly authorised step."
else
  echo "Nothing was published. Review the tree, then create the repository and its"
  echo "first commit as a separate, explicitly authorised step."
fi
