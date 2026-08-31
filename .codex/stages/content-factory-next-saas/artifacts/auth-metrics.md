---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-saas/stage-manifest.json
stream_owner: relay_billing
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner and public SaaS registration consumer
public_facade: compatible registration DTO and POST /public-growth-events
bounded_acceptance: focused registration, growth-event, newsletter, product-event, Prisma and backend type checks
non_goals:
  - public landing-page UI or its registration form
  - real starter-template catalogue or invented seed content
  - hybrid-AI schema and provider behavior
  - production schema application, external calls, merge, push, PR or deploy
evidence:
  - none
task_id: content-factory-next-saas.auth-metrics
epic_id: content-factory-next-saas
stage_id: content-factory-next-saas
session_id: content-factory-next-saas
milestone: compatible registration and privacy-safe conversion aggregates
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: bounded backend implementation stream inherited the root model and reasoning policy
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/backend/src/api/api.module.ts
  - apps/backend/src/api/routes/auth.controller.ts
  - apps/backend/src/api/routes/no.auth.integrations.controller.ts
  - apps/backend/src/api/routes/public-growth-events.controller.ts
  - apps/backend/src/services/auth/auth.service.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/growth/**
  - libraries/nestjs-libraries/src/database/prisma/organizations/**
  - libraries/nestjs-libraries/src/database/prisma/public-growth/**
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - tests/*registration*
  - tests/*growth-event*
  - .codex/stages/content-factory-next-saas/artifacts/auth-metrics.md
success_criteria:
  - registration remains compatible with legacy company while workspaceName takes precedence and a neutral Workspace fallback never derives from email
  - absent or blank starter intent is an idempotent no-op and every non-blank starterTemplate is rejected
  - public events accept only the closed name and coarse-dimension vocabulary and persist no request metadata, PII or visitor identifier
  - registration_completed and workspace_activated are server-only, hashed-key deduplicated and aggregated transactionally
  - existing approval, newsletter and channel_added paths remain compatible
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-saas/spec.md
  - .codex/stages/content-factory-next-saas/plan.md
  - .codex/stages/content-factory-next-saas/stage-manifest.json
  - docs/architecture/auth-and-tenancy.md
  - docs/architecture/data-model.md
  - graphify-out/GRAPH_REPORT.md and focused CreateOrgUserDto/AuthService/OrganizationRepository/ProductEventsController queries
selected_skills:
  - superpowers:brainstorming
  - technical-premortem
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cloud-saas-growth-writers
depends_on_streams:
  - public-ux consumes the finalized public payload vocabulary
  - hybrid-ai schema writer starts after this stream stops
parallel_decision: parallel with write isolation; schema writer sequenced after delivery
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; no child branch, migration directory, external session or runtime process was created
risk_level: high
risk_tags:
  - public-api
  - privacy
  - data
  - atomicity
  - retry
  - idempotency
  - migration
affected_surfaces:
  - api
  - backend
  - database
  - data
  - user-flow
invariants:
  - idempotency
  - rollback
  - state-transition
  - test-matrix
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: the stage spec already owns this temporary public/auth contract; the bounded implementation and deploy defer are recorded here for root closeout
verification:
  - TMPDIR=/tmp pnpm exec jest tests/registration.workspace-contract.test.cjs --runInBand RED: failed 11 of 13 before the compatible DTO, naming precedence and blank intent existed
  - TMPDIR=/tmp pnpm exec jest tests/registration.workspace-contract.test.cjs --runInBand GREEN: 13 tests passed
  - TMPDIR=/tmp pnpm exec jest tests/public-growth-event.test.cjs --runInBand RED: failed 21 of 21 before the DTO, repository, service and controller existed
  - TMPDIR=/tmp pnpm exec jest tests/public-growth-event.test.cjs --runInBand vocabulary RED: failed 4 tests before aligning small/medium/large/wide and public-demo-v1
  - TMPDIR=/tmp pnpm exec jest tests/public-growth-event.test.cjs --runInBand GREEN: 29 tests passed
  - TMPDIR=/tmp pnpm exec jest tests/registration.growth-event.test.cjs --runInBand RED: failed the two new registration-event/provider-forwarding behaviors
  - TMPDIR=/tmp pnpm exec jest tests/registration.growth-event.test.cjs --runInBand committed-side-effect RED: failed when post-create organization joining prevented the trusted event
  - TMPDIR=/tmp pnpm exec jest tests/workspace-activation.growth-event.test.cjs --runInBand RED: 3 tests failed before the trusted activation consumer existed
  - TMPDIR=/tmp pnpm exec jest tests/registration.workspace-contract.test.cjs tests/registration.growth-event.test.cjs tests/workspace-activation.growth-event.test.cjs tests/public-growth-event.test.cjs tests/registration.approval.test.cjs tests/newsletter.subscription.test.cjs tests/product-events.backend.test.cjs --runInBand: 7 suites and 183 tests passed
  - DATABASE_URL=local-placeholder TMPDIR=/tmp pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma: passed
  - TMPDIR=/tmp pnpm exec jest tests/prisma-schema-apply-guard.execution.test.cjs tests/prisma-schema-apply-guard.migrate-diff.test.cjs --runInBand: 2 suites and 57 tests passed using real Prisma migrate diff output
  - TMPDIR=/tmp pnpm exec tsc -p apps/backend/tsconfig.build.json --noEmit --incremental false: passed
changed_files:
  - apps/backend/src/api/api.module.ts
  - apps/backend/src/api/routes/no.auth.integrations.controller.ts
  - apps/backend/src/api/routes/public-growth-events.controller.ts
  - apps/backend/src/services/auth/auth.service.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/growth/public-growth-event.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.service.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - tests/registration.workspace-contract.test.cjs
  - tests/registration.growth-event.test.cjs
  - tests/public-growth-event.test.cjs
  - tests/workspace-activation.growth-event.test.cjs
  - .codex/stages/content-factory-next-saas/artifacts/auth-metrics.md
explicit_defers:
  - content-factory-next-or3.2 remains open: blank is the only allowlisted idempotent no-op until content-intelligence/onboarding defines a real catalogue and transactional seed consumer
  - production migration generation/application remains root and operator owned; this stream made only additive schema edits, created no raw SQL or migration directory, and proved the real migrate-diff guard
  - the anonymous limiter deliberately uses one shared privacy-neutral key; per-visitor fairness would require an IP, cookie or persistent identifier forbidden by this contract
completion_event: 8404d0fa-9cf4-42df-b96c-16a4ca8362fa
---

# Summary

Registration now accepts either the legacy `company`, the optional
`workspaceName`, or neither. Organization naming is deterministic:
`workspaceName` wins, then `company`, then `Workspace`; email is never used as
a workspace name. `starterTemplate` accepts only `blank`. That value is an
explicit idempotent no-op inside the existing create path, so the future
catalogue can add a real transactional consumer without breaking today's
request contract or inventing decorative seed content.

The new unauthenticated `POST /public-growth-events` accepts four public names
and only optional bounded dimensions: `ru|en`,
`small|medium|large|wide`, `public-demo-v1`, and
`plan|draft|review|schedule`. Any extra property, trusted event name, PII,
request metadata, arbitrary property bag or persistent visitor identifier is
rejected. Persistence stores only a UTC day, the closed tuple, and a count.

`registration_completed` is emitted only after a newly created organization
commits. `workspace_activated` is emitted only after the existing trusted
`channel_added` write for a real integration. Both use a server-supplied
organization key that is SHA-256 hashed before storage; a unique receipt and
the daily increment share one Prisma transaction. Duplicate receipts return
`recorded: false`; aggregate storage errors roll back the receipt and throw.

# Scope / Routing

The registration path is `CreateOrgUserDto -> AuthService ->
OrganizationService -> OrganizationRepository`. Local registrations pass the
new fields directly; provider registrations now forward the same compatible
intent. The repository remains the naming and starter-intent boundary, and its
single organization create remains the account transaction.

The public metrics path is `PublicGrowthEventsController -> strict parser ->
PublicGrowthService -> PublicGrowthRepository`. A route-local throttler guard
uses the constant key `public-growth-events`, so it does not read or retain IP,
User-Agent, cookies or a visitor identifier. The public route cannot name
`registration_completed` or `workspace_activated`.

The trusted paths call `PublicGrowthService.recordTrusted` from AuthService and
the existing integration callback. Registration metric failure is logged but
does not turn an already committed account into a failed registration.
Integration metric failure retains the Redis callback state, allowing the
existing callback retry to repeat the deduplicated write. Authentication and
permission behavior outside these entry points is unchanged.

# Verification

Each observable contract started with a focused failure. The final affected
compatibility run passed 7 suites and 183 tests, covering registration naming,
blank validation, local and provider creation, approval, newsletter consent,
trusted product events, public privacy rejection, daily aggregation,
deduplication and rollback. The two schema-application guard suites passed 57
tests against actual Prisma `migrate diff` output. Prisma validation and the
backend no-emit TypeScript check also passed.

No full suite, build, browser flow, production database, real account,
credential, external service or paid call was used. Root owns the one final
stage acceptance.

# Delivery / Cleanup

Changes are present in the shared worktree for root inspection and manual
integration. No commit, merge, push, PR, deploy, Beads mutation, raw SQL,
migration directory or production action was performed. No temporary runtime
resource needs cleanup.

Root accepted completion event `8404d0fa-9cf4-42df-b96c-16a4ca8362fa`
after rerunning the four new focused suites (50/50 passed) and the v3 artifact
validator. Cleanup remains not applicable; no runtime or temporary resource was
created.

# Risks / Follow-ups / Explicit Defers

`content-factory-next-or3.2` must remain open. The repository contains no real
starter-template model, catalogue or onboarding/content-intelligence consumer;
creating one here would fabricate product behavior. `blank` is intentionally
the only accepted intent and performs no seed writes, making retries harmless.

The public rate budget is shared across anonymous callers. This prevents the
metrics endpoint from becoming an unbounded write surface without retaining a
network or browser identifier, but one noisy caller can consume the shared
budget. Splitting it per visitor would violate the current privacy contract and
is therefore deferred until a separately reviewed anonymous-budget design
exists.

The additive Prisma models still require the normal operator-owned migration
and deployment procedure before production can serve the endpoint. This stream
validated schema shape and the real migrate-diff guard only; it did not create
or apply SQL.
