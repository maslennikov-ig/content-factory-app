#!/usr/bin/env bash
# Asks the built image whether nginx can load its own configuration.
#
# Reading `nginx.conf` proves nothing about this. nginx resolves the upstream of
# every literal `proxy_pass` while it loads the configuration and refuses to
# start when a name is missing — and the entrypoint runs under `set -e`, so a
# refusal takes the backend, the frontend and the orchestrator down with it, in
# a restart loop. The newsletter container is owner-run and deliberately absent
# until its database has been bootstrapped, which is exactly the state this
# check reproduces.
#
# `--network none` is the point of the command: no Docker DNS, no neighbouring
# containers, nothing for a literal host name to resolve to. A configuration
# that passes here starts on a host where nothing but the application is up.
#
# Usage: scripts/release/verify-nginx-config.sh [image]
set -euo pipefail

image="${1:-${CF_IMAGE:-content-factory-next:latest}}"

exec docker run --rm --network none --entrypoint nginx "$image" \
  -t -c /etc/nginx/nginx.conf
