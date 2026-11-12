#!/usr/bin/env bash
# Production image gates require the verified public Build for this exact HEAD.
# In the private tree, this also checks a receipt from the local test recorder.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != --hosted ]; }; then
  echo 'Usage: scripts/release/check-suite-receipt.sh [--hosted]' >&2
  exit 2
fi

source_commit="$(git log -1 --format='%(trailers:key=Source-Commit,valueonly)' HEAD)"
if [ "${1:-}" = --hosted ] || [ -n "$source_commit" ]; then
  exec python3 "$script_dir/hosted-suite-receipt.py" check
fi

receipt="$root/var/release/suite-receipt.json"
head_commit="$(git rev-parse HEAD)"
short="$(git rev-parse --short=12 HEAD)"

refuse() {
  echo >&2
  echo "REFUSING: no evidence that the suite passed for $short." >&2
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

# A matching commit alone is not evidence: an interrupted run may have left
# placeholder summaries. Validate every reported result before publishing.
if ! python3 - "$receipt" <<'PY_CHECK'
import json, re, sys
try:
    with open(sys.argv[1], encoding='utf-8') as handle:
        value = json.load(handle)
    jest = value.get('jest') or {}
    node = value.get('nodeTest') or {}
    valid = (value.get('command') == 'pnpm test'
        and re.search(r'\b[1-9]\d* passed\b', jest.get('suites', ''))
        and re.search(r'\b[1-9]\d* passed\b', jest.get('tests', ''))
        and re.fullmatch(r'# pass [1-9]\d*', node.get('pass', ''))
        and node.get('fail') == '# fail 0'
        and re.fullmatch(r'OK(?: \(.*\))?', value.get('python', '')))
    sys.exit(0 if valid else 1)
except (OSError, ValueError, TypeError, AttributeError):
    sys.exit(1)
PY_CHECK
then
  refuse 'The receipt does not contain successful summaries for all three test runs.'
fi

if [ "$receipt_commit" != "$head_commit" ]; then
  refuse "The receipt covers ${receipt_commit:0:12}, and HEAD is $short."
fi

echo "Local suite receipt covers $short:"
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
