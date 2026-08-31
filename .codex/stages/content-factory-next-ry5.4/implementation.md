# Implementation log: content-factory-next-ry5.4

Status: accepted; canonical release receipt is `acceptance-receipt.json`.

## Decisions

- Collector placement: separate observability host/stack with isolated PostgreSQL.
- Retention: 30 days for events and files; no cold storage.
- Capture: backend, orchestrator and Next server/edge errors through one strict minimizer; no direct browser delivery, logs, traces, replay, profiling, AI integrations or source maps.
- Browser deferral: `content-factory-next-ry5.10`; direct delivery would expose IP/User-Agent at collector ingress regardless of payload cleanup.

## TDD evidence

- Initial SDK/privacy RED: 2 suites failed with 5 expected feature failures; baseline tests stayed green.
- Availability RED: a Next initializer exception escaped; corrected so collector setup cannot block startup.
- Own-origin RED: arbitrary DSN and attachments passed; corrected with exact origin matching and attachment removal.
- Build-contract RED: browser settings were not deliverable through the image path. Independent privacy review then rejected direct browser delivery entirely, so the browser entrypoint and public DSN contract were removed instead of papering over the leak.
- Strict-content RED: identifier-shaped personal/model strings passed through exception and frame names. Unknown types now become `Error`; function/module names never leave the process.
- Ambient-config RED: `SENTRY_SPOTLIGHT` created a second envelope sink and ambient tracing enabled spans. Explicit `spotlight:false` and zero sampling now override both.
- Collector RED: 6/6 cases failed before the separate Compose, private database, retention and runbook existed.

## Verification

- Root focused integration: 4 suites, 56/56 passed before the final privacy corrections.
- Final privacy target after corrections: 1 suite, 10/10 passed with a real Sentry 10.70 in-memory transport and no network.
- Collector Compose contract: 6/6 passed and `docker compose config --quiet` succeeded without pulling or starting containers.
- Root focused integration after all privacy corrections: 4 suites, 57/57.
- Workspace build: frontend, backend and orchestrator passed. The first local
  attempt exposed an out-of-root `node_modules` symlink; after a worktree-local
  frozen install, two genuine type errors were corrected before the green run.
- Full test: 72/72 Jest suites, 605/605 tests and 6/6 Python tests.
- Independent security review: ACCEPT, no open P0-P3.
- Independent correctness review: ACCEPT, no open P0-P3.
- Canonical release closeout runs build, full tests, brand scan, docs check,
  process verification and diff check and stores their exact result in
  `acceptance-receipt.json`.
