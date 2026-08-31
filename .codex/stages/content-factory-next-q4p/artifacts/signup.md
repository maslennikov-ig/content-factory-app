---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-q4p/stage-manifest.json
stream_owner: signup
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner and telemetry tracker consumer
public_facade: createTransientClientTracker request-to-digest contract
bounded_acceptance: focused auth throttle, registration DTO, approval routing and empty-instance role tests
non_goals:
  - distributed abuse budget or public-growth controller changes
  - production bootstrap execution, live traffic, credentials or database apply
  - protected landing files or unrelated auth refactors
evidence:
  - none
task_id: content-factory-next-q4p.2
epic_id: content-factory-next-q4p
stage_id: content-factory-next-q4p
session_id: content-factory-next-q4p
milestone: public signup hardening without self-service privilege bootstrap
milestone_status: accepted
agent_type: backend_developer
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: auth, abuse, privacy and role-boundary behavior required a high-risk backend stream
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/throttler/**
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/helpers/src/auth/registration.approval.ts
  - apps/backend/src/cors.options.ts
  - apps/frontend/src/components/public-saas/email-first-signup.tsx
  - docs/operations/saas-readiness.md
  - tests/*registration*
  - tests/*throttl*
  - tests/registration.approval.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/signup.md
success_criteria:
  - repeated LOCAL registration from one caller is refused without sharing a raw address or persistent visitor identity
  - forgot-password receives a bounded per-caller budget while public-post throttling keeps its prior behavior
  - new LOCAL passwords require twelve characters without changing login, hashes or non-LOCAL validation
  - approval body fallback reaches /auth/pending and the compatibility header remains browser-readable
  - no public registrant receives SUPERADMIN and operator bootstrap blocks public readiness
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-q4p/spec.md
  - .codex/stages/content-factory-next-q4p/plan.md
  - .codex/stages/content-factory-next-q4p/stage-manifest.json
  - graphify-out/GRAPH_REPORT.md and focused ThrottlerBehindProxyGuard query
  - docs/design/component-authoring-rules.md
  - @nestjs/throttler@6.5.0 exact docs-resolve L1 plus installed source and declarations
  - class-validator@0.14.4 installed declarations/source and official TypeStack conditional-validation docs
selected_skills:
  - orchestrator-stage
  - superpowers:test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cloud-saas-review-repair-writers
depends_on_streams:
  - telemetry starts after this stream returns the shared transient tracker
parallel_decision: write-isolated parallel stream followed by telemetry
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; no child branch, runtime process, external session or temporary resource was created
risk_level: high
risk_tags:
  - security
  - authorization
  - public-api
  - data
  - ui
  - user-flow
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - authorization
  - state-transition
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: readiness now blocks public traffic on operator bootstrap and ingress-level abuse-control proof
verification:
  - 'RED: TMPDIR=/tmp pnpm exec jest tests/auth.registration-throttle.test.cjs tests/registration.workspace-contract.test.cjs tests/public-saas-registration.test.cjs tests/registration.approval.test.cjs --runInBand --coverage=false failed 7 tests in 4 suites for the intended missing behaviors'
  - 'RED extension: TMPDIR=/tmp pnpm exec jest tests/auth.registration-throttle.test.cjs tests/registration.approval.test.cjs --runInBand --coverage=false failed the intended register, forgot, tracker, warning boundary, CORS and role expectations'
  - 'GREEN: TMPDIR=/tmp pnpm exec jest tests/auth.registration-throttle.test.cjs tests/registration.workspace-contract.test.cjs tests/public-saas-registration.test.cjs tests/registration.approval.test.cjs --runInBand --coverage=false passed 4 suites and 46 tests under Node 22.23.2'
  - 'Correction RED: TMPDIR=/tmp pnpm exec jest tests/auth.registration-throttle.test.cjs --runInBand --coverage=false failed the two intended mixed canonical/trailing-slash budget tests because /auth/register/ and /auth/forgot/ bypassed authThrottlePath'
  - 'Correction GREEN: TMPDIR=/tmp pnpm exec jest tests/auth.registration-throttle.test.cjs --runInBand --coverage=false passed 1 suite and 6 tests under Node 22.23.2 after canonicalizing one or more trailing slashes before the auth throttle lookup'
  - 'Release-integration correction: the first full test command exposed two stale valid-registration fixtures that still used an eight-character LOCAL password and one ad-hoc loader that could not resolve the new tracker module. Under Node 22.23.2 and TMPDIR=/tmp, the corrected newsletter/global-validation fixtures passed 2 suites and 74 tests, while the real tracker loader passed 1 suite and 49 tests.'
  - 'focused git diff --check for the assigned write zone: passed'
changed_files:
  - libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts
  - libraries/nestjs-libraries/src/throttler/throttler.provider.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/helpers/src/auth/registration.approval.ts
  - apps/backend/src/cors.options.ts
  - apps/frontend/src/components/public-saas/email-first-signup.tsx
  - docs/operations/saas-readiness.md
  - tests/auth.registration-throttle.test.cjs
  - tests/registration.workspace-contract.test.cjs
  - tests/public-saas-registration.test.cjs
  - tests/registration.approval.test.cjs
  - tests/newsletter.subscription.test.cjs
  - tests/global.validation-pipe.test.cjs
  - tests/product-events.backend.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/signup.md
explicit_defers:
  - content-factory-next-q4p.5 owns the deferred distributed abuse budget and public-growth adoption of the shared tracker
  - operator bootstrap and ingress header-overwrite readback require an explicitly authorized deployment environment and were not run locally
---

# Summary

`POST /auth/register` now allows one request per caller per 60-second bucket;
`POST /auth/forgot` allows five. The existing global guard owns both paths, so
no controller edit was needed and the public-post path keeps its existing
organization tracker and default budget. Exhaustion throws the standard Nest
throttling exception (`429`) and writes a route-only warning.

A review correction now canonicalizes one or more trailing slashes before the
auth-only lookup. Express-compatible `/auth/register/` and `/auth/forgot/`
requests therefore spend the same caller bucket as their canonical paths;
query stripping, public-post handling and unrelated routes are unchanged.

The reusable tracker normalizes the Caddy-supplied connection address and
returns only an HMAC-SHA256 digest using a process-random, memory-only key and a
one-minute bucket. User-Agent, cookies and persistent identifiers are never
read; raw addresses are neither returned nor sent to throttle storage.

New `provider === LOCAL` DTOs require 12 password characters. The existing
3-character validation remains for compatible non-LOCAL bodies, while login
DTOs and stored hashes are untouched. Public signup reads `{ approval: true }`
from a cloned JSON response when the header is absent, and CORS also exposes
the compatibility header.

Self-service access resolution no longer gives the first organization a
`SUPERADMIN`. Approval and existing activation rules apply uniformly. The SaaS
readiness runbook now requires an operator-only bootstrap plus role readback
before public traffic, and adds the missing abuse-controls row without claiming
a distributed abuse budget.

# Scope / Routing

Entry points remain the global `ThrottlerBehindProxyGuard`, the existing
registration DTO, `resolveNewUserAccess`, and the public email-first component.
No auth controller, organization repository/service, public-growth code,
protected landing file, persistence schema or live environment was changed.

Documentation decision: `orch-prompts docs-resolve` now returns an exact L1 hit
for `@nestjs/throttler@6.5.0`. It confirms `getTracker(req, context)`, named and
default `@Throttle` object overrides, and the guard exception path. Installed
exact declarations/source confirmed the protected `handleRequest` and
`throwThrottlingException` boundaries used here. For
`class-validator@0.14.4`, the exact L1 result was topic-insufficient; installed
exact declarations/source plus official TypeStack documentation confirmed the
`ValidateIf(object, value)` conditional semantics. `ValidateBy` preserves the
old non-LOCAL minimum while adding the LOCAL-only 12-character rule.

# Verification

The first focused run failed on repeated registration, missing transient
tracker, short LOCAL password, body-only approval, and first-account role. A
second RED extension also demonstrated the missing forgot budget and CORS
compatibility header. After implementation, the same four focused suites passed
all 46 tests under the required Node and TMPDIR settings. Focused diff whitespace
validation also passed.

Self-review confirmed that throttle storage receives only digests, warnings
contain only method and route, public-post behavior remains on the old branch,
and no persistence or auth-controller side effect was added.

# Delivery / Cleanup

The changes are present in the shared worktree for root inspection and manual
integration. No commit, Beads mutation, merge, push, PR, deploy, mail, database
apply, credential action or external/live call was performed. No temporary
runtime resources require cleanup.

Root accepted the current stream after the independent reviewer verified the
canonical and trailing-slash route budgets, the privacy-safe tracker, approval
handoff, password boundary and operator bootstrap requirement. Telemetry
consumes the tracker through its exported contract; final release verification
remains root-owned.

The first release command later exposed only stale test integration: two
fixtures describing valid new LOCAL registrations still used eight characters,
and one product-events loader had not mapped the new tracker dependency. Root
accepted those test-only corrections after 74/74 and 49/49 focused checks; no
runtime contract changed.

# Risks / Follow-ups / Explicit Defers

The tracker key is intentionally process-random, so enforcement is
instance-local and resets on process restart; this is the specified privacy
boundary, not the deferred distributed abuse budget. Production fairness also
depends on the repository Caddy contract replacing `X-Real-IP` and
`X-Forwarded-For`; the runbook therefore blocks public traffic until that
ingress behavior is read back. Root still owns final acceptance and the
independent auth/security review required by the high-risk stage.
