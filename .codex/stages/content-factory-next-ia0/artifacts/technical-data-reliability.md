---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0/stage-manifest.json
stream_owner: technical_data_reliability
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: /root
public_facade: n/a
bounded_acceptance: focused red-green suites; root owns final epic acceptance
non_goals:
  - production data apply
  - deployment or live Listmonk/Temporal calls
  - existing Temporal workflow/activity mutation
evidence:
  - none
task_id: content-factory-next-ia0.technical-data-reliability
epic_id: content-factory-next-ia0
stage_id: content-factory-next-ia0
session_id: n/a
milestone: errors-retention-cancellation-event-newsletter-retry
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: high
model_reasoning_rationale: high-risk data minimization, billing state transition, and durable retry
repo: content-factory-next
branch: codex/remaining-technical-debt
base_branch: codex/remaining-epic-coordination
base_commit: ba9c6375
worktree: /tmp/cf-ia0-technical
write_zone:
  - apps/backend/src/**
  - apps/orchestrator/src/**
  - libraries/nestjs-libraries/src/**
  - scripts/operations/**
  - docs/operations/**
  - related tests
  - apps/frontend/src/components/admin/admin-product-events.component.tsx (root-approved scope expansion)
  - tests/product-events.frontend.test.cjs (root-approved scope expansion)
success_criteria:
  - new and retained Errors contain no raw post body, secrets, or user details
  - cleanup and retention provide idempotent dry-run/apply with an owner-run production step
  - every successful cancellation transition eventually emits one tenant-deduplicated private event and Stripe failure emits none
  - consented Listmonk failure persists a pending transition and starts or later reconciles a versioned bounded Temporal retry without an address in workflow input or logs
  - absent, revoked, stale, or already-delivered consent never reaches Listmonk from the retry activity
  - one atomic lease owns each pending delivery; active first-page failures cannot starve newer pending transitions and expired leases are recoverable
selected_docs:
  - graphify-out/GRAPH_REPORT.md plus focused Errors, NewsletterInterface, StripeService, and Temporal queries
  - '@temporalio/workflow@1.15.0 first-party tag v1.15.0 commit 6148da040c662ce7b7bf404f1b2b27c9a2f6b66b: workflow.ts and retry-policy.ts'
  - '@temporalio/client@1.15.0 first-party tag v1.15.0 commit 6148da040c662ce7b7bf404f1b2b27c9a2f6b66b: workflow-options.ts and workflow-client.ts'
  - docs/design/component-authoring-rules.md
selected_skills:
  - superpowers:test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: remaining-epic-implementation
depends_on_streams:
  - content-factory-next-ia0.test-portability
parallel_decision: sequential in shared technical worktree after ba9c6375
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: The technical worktree and thematic branch are retained as required local deliverables; deleting either needs separate user approval. No temporary runtime resources remain.
risk_level: high
risk_tags:
  - data
  - retry
  - idempotency
  - state-transition
  - rollback
  - api
  - ui
affected_surfaces:
  - data
  - backend
  - api
  - ui
  - user-flow
invariants:
  - idempotency
  - state-transition
  - rollback
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Added owner-run Errors retention runbook and replaced manual newsletter recovery with the versioned Temporal retry contract.
verification:
  - 'pnpm exec jest tests/legacy-errors.retention.test.cjs --runInBand --coverage=false: passed (6 tests)'
  - 'pnpm exec jest tests/subscription-cancel-event.test.cjs tests/product-events.backend.test.cjs tests/product-events.frontend.test.cjs tests/error-collection.privacy.test.cjs tests/external-services.purge.test.cjs tests/design.guard.test.cjs tests/foundation.test.cjs tests/design.contrast.test.cjs --runInBand --coverage=false: passed (8 suites, 152 tests)'
  - 'pnpm exec jest tests/newsletter.subscription.test.cjs tests/newsletter.retry.workflow.test.cjs tests/newsletter.consent.frontend.test.cjs tests/user-identity.auth.test.cjs tests/registration.approval.test.cjs tests/telegram.auth.flow.test.cjs tests/external-services.purge.test.cjs --runInBand --coverage=false: passed (7 suites, 178 tests)'
  - 'pnpm docs:check: passed (74 files)'
  - 'git diff --check: passed'
  - 'pnpm exec jest tests/subscription-cancel-event.test.cjs tests/product-events.backend.test.cjs tests/product-events.frontend.test.cjs tests/newsletter.subscription.test.cjs tests/newsletter.retry.workflow.test.cjs tests/prisma-schema-apply-guard.migrate-diff.test.cjs tests/prisma-schema-apply-guard.execution.test.cjs tests/external-services.purge.test.cjs --runInBand --coverage=false: passed (8 suites, 234 tests)'
  - 'DATABASE_URL=postgresql://local:local@127.0.0.1:1/local pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma: passed without a database connection'
  - 'pnpm docs:check: passed (74 files)'
  - 'git diff --check plus exact EOF check for five review-named files: passed'
  - 'pnpm exec jest tests/newsletter.subscription.test.cjs tests/newsletter.retry.workflow.test.cjs tests/newsletter.consent.frontend.test.cjs tests/prisma-schema-apply-guard.migrate-diff.test.cjs tests/prisma-schema-apply-guard.execution.test.cjs tests/external-services.purge.test.cjs --runInBand --coverage=false: passed (6 suites, 176 tests)'
  - 'pnpm exec prisma generate plus DATABASE_URL=postgresql://local:local@127.0.0.1:1/local pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma: passed without a database connection'
  - 'pnpm docs:check and git diff --check: passed'
changed_files:
  - .codex/stages/content-factory-next-ia0/artifacts/technical-data-reliability.md
  - apps/backend/src/api/routes/stripe.controller.ts
  - apps/backend/src/api/routes/billing.controller.ts
  - apps/backend/src/app.module.ts
  - apps/backend/src/services/auth/auth.service.ts
  - apps/backend/src/services/newsletter/newsletter-delivery-retry.module.v1.ts
  - apps/backend/src/services/newsletter/newsletter-delivery-retry.service.v1.ts
  - apps/frontend/src/components/admin/admin-product-events.component.tsx
  - apps/orchestrator/src/activities/newsletter.activity.v1.ts
  - apps/orchestrator/src/app.module.ts
  - apps/orchestrator/src/workflows/index.ts
  - apps/orchestrator/src/workflows/newsletter.subscription.retry.workflow.v1.ts
  - docs/operations/legacy-errors-retention.md
  - docs/operations/newsletter.md
  - libraries/nestjs-libraries/src/database/prisma/admin-stats/admin-stats.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts
  - libraries/nestjs-libraries/src/database/prisma/errors/errors.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/dtos/product-events/product-event.dto.ts
  - libraries/nestjs-libraries/src/services/stripe.service.ts
  - scripts/operations/cleanup-legacy-errors.cjs
  - tests/legacy-errors.retention.test.cjs
  - tests/newsletter.retry.workflow.test.cjs
  - tests/newsletter.subscription.test.cjs
  - tests/product-events.backend.test.cjs
  - tests/product-events.frontend.test.cjs
  - tests/prisma-schema-apply-guard.migrate-diff.test.cjs
  - tests/subscription-cancel-event.test.cjs
explicit_defers:
  - Owner must run the Errors cleanup dry-run/apply and arrange daily retention after deployment; no database was touched here.
  - Owner must apply the additive User newsletter delivery columns and indexes with the production migrate-diff guard before enabling the new backend; no database was touched here.
  - Live Temporal and Listmonk integration is not available in this local stream; root final acceptance and deployment smoke remain separate.
---

# Summary

Implemented the three bounded tasks, then closed both P1 review findings in
four corrective commits:

- `4d676eda` and `4147ad53`: minimized new/old publishing Errors, preserved both unknown classifications, removed user/post content from admin responses, and added a transactional 90-day dry-run/apply cleanup.
- `067b1d12`, `ebd3a3ca`, and `e45e2132`: emit the private
  `cancel_subscription` event after successful Stripe transitions. Direct
  delivery is best-effort; updated/deleted webhooks retry a failed event-store
  write and propagate failure to Stripe. A safe per-transition token in Stripe
  metadata gives direct delivery, webhook retry, and later deletion one key,
  while cancel → uncancel → cancel receives a new key. Internal actor lookup
  projects only id and role; no email or user id enters Stripe metadata.
- `c30d2027`, `5c2a2d72`, and `a7e23e2b`: persist a pending delivery with the
  account and route every provider call through the Temporal activity; account
  registration no longer races it with a direct Listmonk call. Before starting
  Temporal, Prisma atomically leases the exact user/pending transition. Active
  leases are excluded from the next 100-row scan, so repeatedly failing early
  rows cannot starve later consent. Start failure releases the lease, provider
  failure retains it through the eight bounded attempts, and a three-hour
  expiry recovers crashed workers. Lease id and workflow id are stable for one
  pending transition; completion and revocation clear state with compare-and-set
  predicates over pending timestamp and lease id.
- `cea96d6f`: removes the five review-named trailing blank lines; two were
  already part of the newsletter correction and three were committed here.

# Scope / Routing

The test-portability commit `ba9c6375` remained intact. Root explicitly expanded the write zone to the existing admin Product Events component and its focused test because its hard-coded four-name list otherwise hid `cancel_subscription` from the totals table. No visual redesign or other frontend change was made.

The Graphify report was stale at commit `cda692c6`, so it was used only for focused structural navigation. Queries identified `ErrorsRepository`, `NewsletterInterface`, `StripeService`, and `TemporalRegister`; repository files were then read directly.

Temporal decisions used the already-resolved exact L1 first-party sources for SDK tag `v1.15.0` at `6148da040c662ce7b7bf404f1b2b27c9a2f6b66b`. Existing workflow/activity contracts were not edited. Mechanical registration in the orchestrator module and workflow export is covered by root's later build rather than a source-text test.

# Verification

Each correction was first seen failing for the expected gap: missing webhook
recovery, swallowed webhook storage failure, subscription-wide cancellation
deduplication, missing persisted pending state, no automatic recovery after a
simultaneous Listmonk/Temporal outage, stale compare-and-set protection, and a
completed workflow id blocking a later consent, concurrent direct/activity
delivery, non-atomic ownership, first-page starvation, and unrecoverable stale
leases. The focused green commands are recorded in the header. Node was
`v22.23.2` and `TMPDIR=/tmp` for all verification. Prisma generated and
validated the schema locally; the validation
used a syntactically valid loopback URL only to satisfy configuration and did
not connect to a database. Real `prisma migrate diff` output for the four
nullable columns and two indexes passed the repository's production SQL guard with
`--allow-table User`.

# Delivery / Cleanup

Returned to root on `codex/remaining-technical-debt` after the P1 correction.
Integration and the single final epic acceptance remain root-owned. No Beads
status, merge, push, deployment, production database, credentials, paid
service, or live account was touched.

# Risks / Follow-ups / Explicit Defers

- Product-event storage is secondary to the completed synchronous Stripe
  transition, but no longer unrecoverable: the synchronous request logs and
  returns after a storage outage, while the signed Stripe webhook performs the
  same stable transition-key write and fails outward until Stripe can retry it.
  The path still depends on Stripe delivering the updated/deleted webhook.
- The Errors cleanup is destructive only in owner-run `--apply` mode, guarded by `CF_CONFIRM_LEGACY_ERRORS_CLEANUP=apply`, performed in one Prisma transaction, and verified after apply. The local stream ran only in-memory tests.
- Temporal and Listmonk behavior is contract-tested without live servers. The
  transition-specific workflow id, `USE_EXISTING`,
  `ALLOW_DUPLICATE_FAILED_ONLY`, bounded activity retry, lease-aware pending
  scan, atomic claim, expiry recovery, consent reload, and compare-and-set
  completion are explicit. Final integration/build and deployment smoke remain
  root-owned.
- The new nullable User columns and indexes are additive and their exact Prisma
  SQL passes the guard, but the owner must apply them before enabling the new
  backend. Until then registration with newsletter consent would reference a
  column absent from the deployed schema; the runbook calls out this ordering.
- The narrower Errors admin response is runtime-safe in the existing component: `organization.users` is optional-chained and `post.content` is not read. Its local frontend interface remains wider than the response but does not cause a runtime access failure.

# Orchestrator acceptance

Root previously received correction event
`4214b62f-2194-4bcd-bccc-2d6b9d1411ee`; this return resolves its P2 lease and
starvation findings without reopening Beads. Existing upstream Temporal contracts remain
untouched, cancellation events are private and transition-deduplicated, and the
destructive Errors step remains explicitly owner-run. Residual webhook
delivery, owner-run schema apply, and absence of live service checks are
recorded above and do not widen the repository-only scope.
