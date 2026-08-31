---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:conversion-report-implementation
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: content-factory-next-or3 root integration and acceptance
public_facade: protected admin conversion aggregate report
bounded_acceptance: super-admin-only bounded PublicGrowthDaily report with six totals and five zero-safe ratios
non_goals:
  - public read endpoint or admin UI
  - receipt user organization identity or dimension reporting
  - public or trusted event vocabulary changes
  - schema migration database push production action or delivery
evidence:
  - local_code_map
task_id: content-factory-next-or3.conversion-report-implementation
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: privacy-safe conversion aggregate report
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-sol
reasoning_effort: medium
model_reasoning_rationale: bounded privacy and authorization contract with focused TDD
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - apps/backend/src/api/routes/admin.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth
  - tests/public-growth
  - tests/admin-public-growth
  - .codex/stages/content-factory-next-or3/artifacts/conversion-report-implementation.md
success_criteria:
  - only a super-admin can call the aggregate report
  - the query requires exact bounded UTC dates and rejects invalid reversed or overlong ranges
  - the response contains exactly six fixed totals and five fixed zero-safe ratios
  - the report reads PublicGrowthDaily only and exposes no receipts identities dimensions or arbitrary fields
  - existing public and trusted telemetry behavior remains green
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-or3/spec.md
  - .codex/stages/content-factory-next-or3/plan.md
  - .codex/stages/content-factory-next-or3/artifacts/conversion-privacy-map.md
selected_skills:
  - test-driven-development
  - verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: content-factory-next-or3-implementation
depends_on_streams:
  - content-factory-next-or3.conversion-privacy-map
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: accepted in shared worktree; no database container, browser, server, credential, external request, child branch, or disposable runtime required cleanup
risk_level: high
risk_tags:
  - privacy
  - auth
  - data
affected_surfaces:
  - api
  - backend
invariants:
  - privacy
  - compatibility
  - test-matrix
verification:
  - RED: focused report suite failed 10 tests because repository service and protected controller methods did not exist
  - GREEN: pnpm exec jest --runInBand tests/admin-public-growth-report.test.cjs tests/public-growth-event.test.cjs passed 57 of 57
  - compatibility: targeted existing admin product-events authorization test passed 1 of 1
  - backend build passed under Node 22.23.2 and pnpm 10.6.1
  - Prettier check and git diff check passed for the bounded write zone
  - orchestration artifact v3 validation passed
changed_files:
  - apps/backend/src/api/routes/admin.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.service.ts
  - tests/admin-public-growth-report.test.cjs
  - .codex/stages/content-factory-next-or3/artifacts/conversion-report-implementation.md
explicit_defers:
  - root integrated acceptance owns any real disposable PostgreSQL and full Nest route proof because this stream introduced no schema and had no isolated report database harness inside its write zone
  - production abuse-budget and operations readiness remains owned by content-factory-next-saas.5
---

# Summary

Added `GET /admin/public-growth-report?from=YYYY-MM-DD&to=YYYY-MM-DD` to the
existing authenticated admin controller. The controller rejects a non-super
admin before reading data. Both dates are required, parsed as exact UTC calendar
dates, and the range is rejected when malformed, reversed, or longer than 366
days.

The repository performs one Prisma `PublicGrowthDaily.groupBy` over the six
fixed conversion names. It sums across every stored dimension but returns no
dimension. The service fills missing names with zero and emits only:

- six totals: `landing_view`, `demo_started`, `demo_completed`,
  `signup_started`, `registration_completed`, and `workspace_activated`;
- five ratios: demo start per landing, demo completion per demo start, signup
  start per landing, registration completion per signup start, and workspace
  activation per registration completion.

Every zero denominator produces numeric `0`. The report never reads
`PublicGrowthTrustedEvent`, and its response has no receipt, deduplication key,
user or organization identity, visitor data, request metadata, dimension, or
arbitrary property. No public route was added. The existing four public and two
trusted vocabularies, writes, HMAC receipts, retention, and rate limiting were
not changed.

# Verification

The focused RED run failed because `getAggregateTotals`, `getAdminReport`, and
`getPublicGrowthReport` were absent. After the minimal implementation:

- `pnpm exec jest --runInBand tests/admin-public-growth-report.test.cjs tests/public-growth-event.test.cjs`
  passed 57/57;
- the targeted pre-existing admin product-events authorization test passed 1/1;
- `pnpm --filter ./apps/backend run build` passed with Node 22.23.2 and pnpm
  10.6.1;
- Prettier and `git diff --check` passed for the changed files.
- `validate_artifact.py` accepted this v3 delegated-stream artifact.

The tests prove exact query bounds, aggregation across dimensions, all six
totals, all five ratios, zero denominators, controller route metadata,
super-admin rejection before repository access, fixed response shape, absence
of sensitive/dimensional fields, no trusted-receipt query, and no public GET.

# Risks / Follow-ups

- Root acceptance should decide whether to add a disposable PostgreSQL and
  full Nest HTTP proof. This stream did not create one because there is no
  isolated report database harness inside the bounded write zone, and no schema
  or migration changed.
- Production rate-limit effectiveness and abuse-budget readiness remain the
  existing `content-factory-next-saas.5` dependency; this report does not claim
  that operational acceptance.
- A supplemental broad `tests/product-events.backend.test.cjs` run encountered
  two unrelated missing-alias failures in concurrently edited starter-template
  registration tests. The exact admin-controller compatibility case from that
  file was rerun alone and passed.
