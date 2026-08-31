---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-omx/stage-manifest.json
stream_owner: omx_backend
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: authenticated product-event sender and superadmin analytics screen
public_facade: POST /product-events and GET /admin/product-events
bounded_acceptance: tenant-safe idempotent product events, server register/channel emission, private admin aggregation
non_goals:
  - Applying a Prisma schema or connecting to a database.
  - Production, server, external-service, deploy, push, merge, or commit actions.
  - Frontend hook or admin-interface implementation.
evidence:
  - repository
  - beads
task_id: content-factory-next-omx.backend
epic_id: content-factory-next-omx
stage_id: content-factory-next-omx
session_id: n/a
milestone: product-events backend and data stream
milestone_status: accepted
agent_type: backend_developer
subagent_model: inherited
reasoning_effort: inherited
model_reasoning_rationale: Root assigned a bounded backend/data stream with strict TDD.
repo: /tmp/cf-product-events
branch: work/product-events
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-product-events
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/product-events/product-events.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/product-events/product-events.service.ts
  - libraries/nestjs-libraries/src/dtos/product-events/product-event.dto.ts
  - apps/backend/src/api/routes/product-events.controller.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/backend/src/api/api.module.ts
  - libraries/nestjs-libraries/src/database/prisma/database.module.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - apps/backend/src/api/routes/integrations.controller.ts
  - apps/backend/src/api/routes/no.auth.integrations.controller.ts
  - tests/product-events.backend.test.cjs
  - .codex/stages/content-factory-next-omx/artifacts/backend.md
success_criteria:
  - POST trusts only authenticated user and organization identifiers.
  - Authenticated clients can emit only purchase and lifetime_claimed.
  - Raw request envelopes reject malformed, unknown, dangerous, and server-owned fields.
  - Properties reject personal data, prototype keys, and excessive JSON shapes.
  - Tenant-scoped duplicate keys succeed without a second row.
  - Registration and confirmed channel creation emit durable server events.
  - Superadmin aggregation exposes opaque identifiers only.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-omx/plan.md
selected_skills:
  - superpowers:test-driven-development
  - technical-premortem
  - superpowers:receiving-code-review
  - superpowers:verification-before-completion
selected_agents:
  - backend_developer
catalog_candidates:
  - none
parallel_group: product-events-backend-frontend
depends_on_streams:
  - none
parallel_decision: parallel disjoint backend and frontend write zones
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted in the shared task worktree; no child branch, temporary file, database, server, or external resource was created.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - privacy
  - tenancy
  - idempotency
  - auth
  - persistence
affected_surfaces:
  - prisma-schema
  - authenticated-api
  - registration
  - integration-callback
  - admin-api
invariants:
  - authenticated-identities-only
  - no-personal-event-properties
  - tenant-scoped-idempotency
  - superadmin-only-report
docs_impact: stage-artifact-only
docs_reviewed: yes
docs_review_notes: Product and API decisions are fixed in the stage plan; no durable documentation outside this artifact is assigned.
verification:
  - 'RED: source /home/me/.nvm/nvm.sh && nvm use 22.23.2 --silent && TMPDIR=/tmp pnpm exec jest tests/product-events.backend.test.cjs --runInBand --coverage=false: 1 failed, nested email key expected false and received true.'
  - 'Expanded RED, same command: 1 suite, 21 tests; 19 failed for the missing privacy, ID trust, duplicate, aggregation, registration transaction, OAuth propagation/emission, admin authorization, throttling, and schema behaviors; 2 baseline/legacy cases passed.'
  - 'Raw JSON RED: same focused target with the authenticated receiver filter failed 2 cases because the controller still sent a request wrapper through DTO transformation; this reproduced the dangerous constructor-key path.'
  - 'Raw contract refinement RED: the same 22-test target filtered to unsafe raw JSON resolved a numeric deduplication key as recorded instead of rejecting it; explicit string validation made it green without adding a new test count.'
  - 'GREEN: source /home/me/.nvm/nvm.sh && nvm use 22.23.2 --silent && TMPDIR=/tmp pnpm exec jest tests/product-events.backend.test.cjs --runInBand --coverage=false: passed, 22 tests.'
  - 'Security review RED, same focused command: 1 suite, 36 tests; 12 failed and 24 passed. Failures proved client-forged register/channel_added, malformed or spoofed raw envelopes, ID-materializing cohort aggregation, and refresh-driven false channel_added.'
  - 'Security review GREEN, same focused command: 1 suite passed, 36 tests passed. Client/server allowlists, explicit envelope validation, DB-side organization counts, and refresh exclusion all passed.'
  - 'Prisma format: source /home/me/.nvm/nvm.sh && nvm use 22.23.2 --silent && TMPDIR=/tmp pnpm exec prisma format --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma: passed.'
  - 'Prisma validation without a database connection: DATABASE_URL pointed to the closed local port 1 and pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma reported the schema valid.'
  - 'Focused Prettier write/check and owned-path git diff --check: passed.'
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/product-events/product-events.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/product-events/product-events.service.ts
  - libraries/nestjs-libraries/src/dtos/product-events/product-event.dto.ts
  - apps/backend/src/api/routes/product-events.controller.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/backend/src/api/api.module.ts
  - libraries/nestjs-libraries/src/database/prisma/database.module.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - apps/backend/src/api/routes/integrations.controller.ts
  - apps/backend/src/api/routes/no.auth.integrations.controller.ts
  - tests/product-events.backend.test.cjs
  - .codex/stages/content-factory-next-omx/artifacts/backend.md
explicit_defers:
  - Prisma schema application and generated migration are root/operator follow-up actions outside this stream.
---

# Summary

The backend now owns four code-allowlisted product events. The trusted server
path can record all four; authenticated clients can record only `purchase` and
`lifetime_claimed`, so they cannot forge registration or activation cohorts.
POST derives user and organization IDs only from request context, validates a
raw plain-object envelope with exactly the three public fields, validates a
small JSON properties object recursively, and uses a route-specific Nest rate
limit. Prisma stores opaque IDs and JSON properties with tenant-scoped
deduplication; a duplicate returns a successful no-op.

Registration creates the account and `register` event in one Prisma
transaction, including approval/email-activation paths with no session. The
authenticated OAuth start stores the initiating user beside the shared state.
The confirmed integration callback emits `channel_added` with the integration
ID as its stable deduplication key. Old state without a user continues the
connection and skips only analytics. Two-step providers emit only after page
selection succeeds. Refreshing an existing integration never emits a new
`channel_added` event.

The superadmin endpoint returns a bounded 50-row recent list, four event
aggregates, and cohort activation. Repository queries use explicit scalar
selects and never join User or Organization personal fields. Cohort totals are
two database-side Organization counts with independent `productEvents.some`
filters; organization IDs are never loaded into application memory or sent
back through a giant `IN` filter.

# Technical premortem

Verdict: GO WITH CONDITIONS. The retained failure mechanisms are tenant/user spoofing, personal-data capture, non-atomic registration analytics, duplicate retry rows, a false channel event from an untrusted callback marker, and accidental admin relation joins. The checks are the focused behavioral suite, an atomic registration transaction, an integration-id dedupe key after confirmed upsert, explicit safe `select` clauses, and superadmin refusal.

Recovery before any future schema application is a code revert. After an additive application, rollback may leave the unused `ProductEvent` table in place; no destructive rollback or data repair is required for disabling the feature.

# Verification

Strict RED then GREEN completed on Node 22.23.2 / pnpm 10.6.1 with
`TMPDIR=/tmp`. The final focused suite passed 36/36. Prisma format and validate
passed without a database connection. Focused Prettier and owned-path diff
checks passed. Root-owned build, full suite, and release gates were not run.

# Risks / Follow-ups

Old or in-flight OAuth state has no initiating user identifier. It must continue the integration successfully and skip only the analytics write.

The schema was not applied and no migration was generated in this stream.
Deployment must generate/apply the additive migration before starting code that
writes product events, then regenerate Prisma Client. A missing table during a
channel callback is logged and does not break the integration; registration is
atomic and therefore fails/rolls back if the table is unavailable.

No live DB proves transaction execution or query plans here. Root acceptance
should retain the focused suite and build/type checks; a future authorized
integration environment should verify one registration rollback and one
tenant-scoped retry against PostgreSQL.

# Delivery / Cleanup

All changes remain uncommitted in the shared worktree for root acceptance. No
frontend file, Beads record, lockfile, root handoff, root plan/manifest, server,
database, external service, commit, or remote was changed by this stream.
