#!/usr/bin/env bash
#
# Print what in the working tree differs from HEAD, for the purposes of a
# release. Empty output means the tree and the commit are the same version.
#
# Why this is a file of its own. `make-source-archive.sh` refuses to run on a
# tree that differs from HEAD, because the Dockerfile builds from the working
# tree (`COPY . /app`) while the source archive is built from a commit — a
# modified tree ships an image whose archive describes something else. The suite
# receipt rests on exactly the same fact from the other side: it names one
# commit, and it may only do so if the tree it was recorded from was that
# commit. Two hand-written copies of one exclusion list would drift, and the day
# they disagreed the release would either refuse for no reason or vouch for
# something it had not run.
#
# The three tooling directories never reach the archive (`export-ignore` in
# .gitattributes) and never reach the image (.dockerignore), so their state
# cannot make the two disagree. `pnpm test` writes into `.codex` on every run,
# which is exactly why that exclusion has to be shared rather than remembered.
#
# Everything else must match HEAD exactly, untracked files included: `COPY .
# /app` would bake an untracked file into the image that the archive does not
# carry.
#
# Usage: scripts/release/tree-differences.sh
# Output: `git status --porcelain` lines, or nothing at all.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# `var/source` and `var/release` are this script's own outputs — the archive and
# the suite receipt. Nothing wider under `var` may be excluded: `var/docker`
# holds tracked files that do reach the image (`entrypoint.sh`, `nginx.conf`,
# `ecosystem.config.js`), and hiding a change to those is exactly the failure
# this check exists to prevent.
git status --porcelain --untracked-files=normal -- \
  . \
  ':(exclude,top).beads' \
  ':(exclude,top).codex' \
  ':(exclude,top).claude' \
  ':(exclude,top)var/source' \
  ':(exclude,top)var/release'
