#!/usr/bin/env bash
# Local runtime-image build. Existing source/archive and release gates still apply.
set -euo pipefail

if [ "$#" -ne 3 ] || [ "$2" != --min-free-gib ]; then
  echo 'usage: scripts/release/build-local-image.sh <tag> --min-free-gib <planned-headroom>' >&2
  exit 2
fi
tag="$1"
if [[ ! "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
  echo 'Invalid local image tag' >&2
  exit 2
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel)"
cd "$root"
origin="$(git remote get-url origin)"
case "$origin" in
  https://github.com/maslennikov-ig/content-factory-app|https://github.com/maslennikov-ig/content-factory-app.git|git@github.com:maslennikov-ig/content-factory-app|git@github.com:maslennikov-ig/content-factory-app.git) ;;
  *) echo 'Build only from the prepared public tree; see production-deploy.md' >&2; exit 1 ;;
esac
"$script_dir/check-suite-receipt.sh"
"$script_dir/make-source-archive.sh" >/dev/null
python3 "$script_dir/check-local-build-capacity.py" --min-free-gib "$3"
exec docker build --target runtime -t "content-factory-next:$tag" -f Dockerfile .
