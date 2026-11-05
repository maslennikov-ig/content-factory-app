#!/usr/bin/env bash
#
# Run the whole test suite and, if it passes, record that it passed for this
# exact commit.
#
# Why a receipt and not a checklist line. `AGENTS.md` has named `pnpm test` in
# release acceptance from the start. Between 25.08.2026 and 30.08.2026 fourteen
# tests were red and five releases went to production anyway: the guards covered
# activation atomicity, the immutable published snapshot and the serializable
# pin, and none of them was guarding anything. Nobody skipped the step on
# purpose — a step a person can skip is not a gate, and the release order had no
# way to tell the difference between "ran and passed" and "did not run".
#
# GitHub Actions could not tell either. It stopped starting jobs at all on
# 25.08.2026, about two hours after the commit that turned the tests red, and
# every run since shows the same red mark it showed before — so the mark stopped
# carrying information.
#
# This script is the half that produces evidence; `check-suite-receipt.sh` is
# the half that refuses without it, and `push-image.sh` calls that one.
#
# Usage: scripts/release/record-suite-receipt.sh
# Output: var/release/suite-receipt.json, only on a green run.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# A receipt names one commit, so it may only be recorded from a tree that is
# that commit. The exclusion list is shared with `make-source-archive.sh`, which
# refuses on the same grounds — see `tree-differences.sh`.
differences="$("$script_dir/tree-differences.sh")"
if [ -n "$differences" ]; then
  echo "The working tree differs from HEAD, so a receipt could not name what it" >&2
  echo "ran. Commit or clean these first:" >&2
  echo "$differences" >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
out_dir="$root/var/release"
receipt="$out_dir/suite-receipt.json"
mkdir -p "$out_dir"

# Every attempt has a fresh HEAD-bound directory. Failed attempts and a prior
# receipt remain evidence, but an old green receipt must not stay active.
mkdir -p "$out_dir/suite-runs"
run_dir="$(mktemp -d "$out_dir/suite-runs/$commit.XXXXXX")"
if [ -e "$receipt" ]; then mv "$receipt" "$run_dir/previous-suite-receipt.json"; fi
log="$run_dir/suite.log"
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Running the full suite for $(git rev-parse --short=12 HEAD). This takes minutes."
echo

status=0
CF_RELEASE_JEST_MODE=full CF_RELEASE_SUITE_HEAD="$commit" CF_RELEASE_JEST_ARTIFACT_DIR="$run_dir/jest" \
  pnpm test 2>&1 | tee "$log" || {
    pipeline=("${PIPESTATUS[@]}")
    status="${pipeline[0]}"
    if [ "$status" -eq 0 ]; then status="${pipeline[1]}"; fi
  }

if [ "$status" -ne 0 ]; then
  echo >&2
  echo "The suite did not pass, so no receipt was written and the release cannot" >&2
  echo 'proceed. `pnpm test` is three runs — jest, then node --test, then python' >&2
  echo "unittest — and a green jest summary says nothing about the other two." >&2
  exit "$status"
fi

# The three summaries, verbatim. A receipt that said only "ok" would not show
# which of the three halves actually ran: on 30.08.2026 jest reported 221 green
# suites while the node --test half was failing fourteen tests, and reading the
# first summary as the answer is precisely the mistake being closed here.
jest_suites="$(grep -m1 '^Test Suites:' "$log" || echo 'Test Suites: (not reported)')"
jest_tests="$(grep -m1 '^Tests:' "$log" || echo 'Tests: (not reported)')"
node_pass="$(grep -m1 '^# pass' "$log" || echo '# pass (not reported)')"
node_fail="$(grep -m1 '^# fail' "$log" || echo '# fail (not reported)')"
python_line="$(grep -m1 -E '^(OK|FAILED)' "$log" || echo '(not reported)')"

# Re-read all four native artifacts and their exact discovery membership after
# the complete command. A shard's first summary cannot stand in for the whole.
verified="$(node scripts/ci/jest-shards.cjs verify-local "$run_dir/jest" "$commit")" || {
  echo 'Incomplete Jest artifacts; no receipt was written.' >&2
  exit 1
}
if [ "$verified" != "$(printf '%s\n%s' "$jest_suites" "$jest_tests")" ]; then
  echo 'Jest summary does not match the verified complete population; no receipt was written.' >&2
  exit 1
fi

# A signal can leave an apparently successful pipeline without complete output.
# Never create a receipt unless all three runs actually reported success.
if ! [[ "$jest_suites" =~ [0-9]+\ passed ]] || ! [[ "$jest_tests" =~ [0-9]+\ passed ]] ||
   ! [[ "$node_pass" =~ ^\#\ pass\ [1-9][0-9]*$ ]] || [[ "$node_fail" != '# fail 0' ]] ||
   ! [[ "$python_line" =~ ^OK(\ \(.*\))?$ ]]; then
  echo 'The suite did not report all three successful summaries; no receipt was written.' >&2
  exit 1
fi

# Source identity must still be the one that started the run. Use the same
# authoritative exclusion list as the initial check and source archive.
if [ "$(git rev-parse HEAD)" != "$commit" ]; then
  echo 'HEAD changed during the suite; no receipt was written.' >&2
  exit 1
fi
differences="$("$script_dir/tree-differences.sh")"
if [ -n "$differences" ]; then
  echo 'The working tree differs from HEAD after the suite; no receipt was written.' >&2
  echo "$differences" >&2
  exit 1
fi

# Build JSON without shell interpolation and publish the complete receipt with
# one rename on the same filesystem. No partial receipt can be observed.
node - "$run_dir/receipt.tmp" "$commit" "${run_dir#"$root/"}" \
  "$jest_suites" "$jest_tests" "$node_pass" "$node_fail" "$python_line" <<'JSON'
const fs = require('node:fs');
const [file, commit, artifacts, suites, tests, pass, fail, python] = process.argv.slice(2);
fs.writeFileSync(file, JSON.stringify({
  commit, command: 'pnpm test', node: process.version, recordedAt: new Date().toISOString(), artifacts,
  jest: { suites, tests }, nodeTest: { pass, fail }, python,
}, null, 2) + '\n', { flag: 'wx' });
JSON
mv "$run_dir/receipt.tmp" "$receipt"

echo
echo "Suite receipt written for $(git rev-parse --short=12 HEAD)"
echo "  $receipt"
echo "  $jest_suites / $jest_tests"
echo "  node --test: $node_pass, $node_fail"
echo "  python: $python_line"
