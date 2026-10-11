#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
# Dockerfile.dev has a single stage. Both local consumers use that same image.
docker build -t localhost/content-factory -f Dockerfile.dev .
docker tag localhost/content-factory localhost/content-factory-devcontainer
