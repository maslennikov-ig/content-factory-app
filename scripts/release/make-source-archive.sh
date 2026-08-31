#!/usr/bin/env bash
#
# Build the Corresponding Source archive that the image ships and the product
# serves.
#
# AGPL-3.0 section 13 obliges this deployment to offer every network user the
# Corresponding Source of the exact version they are talking to. A repository
# branch is not that version — it moves on — so the product carries its own
# source: this script writes `git archive` of the deployed commit into
# var/source/, the Dockerfile copies it into the image, and
# apps/backend/src/api/routes/source.controller.ts serves it without a session.
#
# The whole point is that the archive and the image are the same commit. The
# Dockerfile builds from the working tree (`COPY . /app`), not from a commit, so
# a modified tree would ship an image whose source archive describes something
# else — a false claim of compliance, which is worse than no offer at all. The
# script therefore refuses to run on a tree that differs from HEAD.
#
# Only tracked files reach `git archive`, so `.env` cannot get in. `.beads`,
# `.codex` and `.claude` are dropped by `export-ignore` in .gitattributes.
#
# Usage: scripts/release/make-source-archive.sh
# Output: var/source/content-factory-source.tar.gz and var/source/source.json
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# What counts as a difference lives in `tree-differences.sh`, shared with the
# suite receipt: that receipt names one commit and may only be recorded from a
# tree that is that commit, which is this rule seen from the other side. Two
# copies of one exclusion list would drift.
dirty="$("$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tree-differences.sh")"

if [ -n "$dirty" ]; then
  echo "The working tree differs from HEAD, so the image and the source archive" >&2
  echo "would not be the same version. Commit or clean these first:" >&2
  echo "$dirty" >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
short="$(git rev-parse --short=12 HEAD)"

out_dir="$root/var/source"
archive_name="content-factory-source.tar.gz"
archive="$out_dir/$archive_name"
manifest="$out_dir/source.json"

mkdir -p "$out_dir"
rm -f "$archive" "$manifest"

# `--format=tar.gz` gzips without recording a name or a timestamp, and entry
# times come from the commit, so the same commit always produces byte-identical
# output. That is what makes the published archive verifiable after a deploy:
# run this script again on the same commit and compare the checksum.
git archive \
  --format=tar.gz \
  --prefix="content-factory-$short/" \
  -o "$archive" \
  "$commit"

bytes="$(wc -c <"$archive" | tr -d ' ')"
checksum="$(sha256sum "$archive" | cut -d' ' -f1)"
built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat >"$manifest" <<JSON
{
  "commit": "$commit",
  "shortCommit": "$short",
  "archive": "$archive_name",
  "downloadName": "content-factory-$short.tar.gz",
  "bytes": $bytes,
  "sha256": "$checksum",
  "builtAt": "$built_at"
}
JSON

echo "Corresponding Source archive for $short"
echo "  $archive"
echo "  $bytes bytes, sha256 $checksum"
echo
echo "Build the image from the same commit:"
echo "  docker build --target runtime -t content-factory-next:$short -f Dockerfile ."
