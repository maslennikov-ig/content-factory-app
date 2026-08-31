#!/usr/bin/env bash
#
# Refuse a release that has no evidence its own test suite passed.
#
# The gate half of `record-suite-receipt.sh`; read that script for why a receipt
# exists at all. What this one adds is the refusal: `push-image.sh` calls it
# before it uploads anything, so a release cannot outrun the suite the way five
# of them did between 25.08.2026 and 30.08.2026.
#
# The check is one comparison. A receipt names the commit its run covered, and
# `make-source-archive.sh` has already refused unless the working tree is that
# commit, so at this point in the release order HEAD identifies the bytes going
# into the image. Receipt commit equals HEAD, or there is no evidence.
#
# One exception, and it is not a loosening. Since 31.08.2026 the image is built
# in the clone of the public repository, which numbers its commits separately:
# the same bytes get a different id there, and comparing against HEAD would
# refuse every release. A published commit therefore carries a `Source-Commit`
# trailer naming the private commit it was copied from — written by
# `scripts/operations/prepare-public-tree.sh --update`, which also carries the
# receipt across — and this gate compares against that instead.
#
# What the trailer is worth: it defends against a mistake, not against forgery.
# Anyone who can write the trailer can write anything. Proving the tree really
# came from that commit needs the private repository, which is precisely what a
# reader of the public one does not have.
#
# There is no override, and that is the point. A gate with a way past it is the
# checklist line this replaces.
#
# Usage: scripts/release/check-suite-receipt.sh
# Exit status: 0 when a receipt covers HEAD (or HEAD's source commit), 1 otherwise.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

receipt="$root/var/release/suite-receipt.json"
head_commit="$(git rev-parse HEAD)"
short="$(git rev-parse --short=12 HEAD)"

# `%(trailers:key=…)` reads only a real trailer block, so a mention of
# `Source-Commit` in the body does not count as one.
source_commit="$(git log -1 --format='%(trailers:key=Source-Commit,valueonly)' HEAD | tr -d '[:space:]')"
covered_commit="$head_commit"
covered_short="$short"
published=0
if [ -n "$source_commit" ]; then
  if ! printf '%s' "$source_commit" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "REFUSING: HEAD carries a Source-Commit trailer that is not a full" >&2
    echo "commit id: $source_commit" >&2
    exit 1
  fi
  published=1
  covered_commit="$source_commit"
  covered_short="${source_commit:0:12}"
fi

refuse() {
  echo >&2
  echo "REFUSING: no evidence that the suite passed for $covered_short." >&2
  echo "$1" >&2
  echo >&2
  echo "Record one, then release again:" >&2
  echo "  scripts/release/record-suite-receipt.sh" >&2
  exit 1
}

if [ ! -f "$receipt" ]; then
  refuse "No receipt at var/release/suite-receipt.json."
fi

receipt_commit="$(python3 -c '
import json, sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        print(json.load(handle).get("commit", ""))
except (OSError, ValueError):
    pass
' "$receipt")"

if [ -z "$receipt_commit" ]; then
  refuse "The receipt at var/release/suite-receipt.json names no commit."
fi

if [ "$receipt_commit" != "$covered_commit" ]; then
  if [ "$published" -eq 1 ]; then
    refuse "The receipt covers ${receipt_commit:0:12}, and HEAD ($short) was
published from $covered_short."
  fi
  refuse "The receipt covers ${receipt_commit:0:12}, and HEAD is $short."
fi

if [ "$published" -eq 1 ]; then
  echo "HEAD $short was published from $covered_short; the receipt covers that commit:"
else
  echo "Suite receipt covers $short:"
fi
python3 -c '
import json, sys

with open(sys.argv[1], encoding="utf-8") as handle:
    receipt = json.load(handle)

jest = receipt.get("jest") or {}
node_test = receipt.get("nodeTest") or {}
unknown = "(not recorded)"

print("  recorded", receipt.get("recordedAt", unknown), "on", receipt.get("node", unknown))
print("  " + jest.get("suites", unknown) + " / " + jest.get("tests", unknown))
print("  node --test: " + node_test.get("pass", unknown) + ", " + node_test.get("fail", unknown))
print("  python: " + receipt.get("python", unknown))
' "$receipt"
