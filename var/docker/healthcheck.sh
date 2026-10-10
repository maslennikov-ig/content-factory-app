#!/bin/sh
# API liveness and native worker readiness are separate required conditions.
set -eu
curl -fsS --max-time 1 http://127.0.0.1:5000/api/ >/dev/null
curl -fsS --max-time 3 "http://127.0.0.1:${ORCHESTRATOR_PORT:-3002}/health/status" >/dev/null
