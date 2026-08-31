---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-q4p/stage-manifest.json
stream_owner: telemetry
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner
public_facade: POST /public-growth-events transient throttle and trusted growth receipt contract
bounded_acceptance: aggregate-conflict retry, transient caller throttling, keyed trusted dedupe and 90-day raw telemetry cleanup
non_goals:
  - distributed abuse budget or persistent caller identity
  - AI usage lifecycle changes or provider accounting
  - production database apply, scheduler installation, credentials or live traffic
  - protected landing files, existing receipt mutation or unrelated schema work
evidence:
  - none
task_id: content-factory-next-q4p.5
epic_id: content-factory-next-q4p
stage_id: content-factory-next-q4p
session_id: content-factory-next-q4p
milestone: privacy-safe growth telemetry concurrency and retention repair
milestone_status: accepted
agent_type: backend_developer
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: concurrency, idempotency, privacy, public throttling and transactional deletion form one high-risk backend boundary
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: main
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - .env.example
  - apps/backend/src/api/routes/public-growth-events.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/**
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/prisma/migrations/**
  - scripts/operations/*saas-retention*
  - docs/operations/saas-readiness.md
  - docs/architecture/data-model.md
  - tests/*growth*
  - tests/*retention*
  - .codex/stages/content-factory-next-q4p/artifacts/telemetry.md
success_criteria:
  - A daily aggregate P2002 is retried and cannot be mistaken for a duplicate trusted receipt.
  - Only the PublicGrowthTrustedEvent name/deduplicationKey unique target returns recorded false; P2034 retries are bounded.
  - The public receiver uses the shared process-random transient tracker, preserves 120/minute and standard 429, and logs no request identity.
  - Trusted organization-derived dedupe is a stable domain-separated HMAC and production fails closed without a PUBLIC_GROWTH_DEDUPE_KEY of at least 32 bytes.
  - An operator-owned daily process dry-runs by default and atomically deletes only raw trusted growth and AI usage rows older than 90 days.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-q4p/spec.md
  - .codex/stages/content-factory-next-q4p/plan.md
  - .codex/stages/content-factory-next-q4p/stage-manifest.json
  - .codex/stages/content-factory-next-q4p/artifacts/signup.md
  - graphify-out/GRAPH_REPORT.md plus focused PublicGrowthEventsController/PublicGrowthRepository query
  - prisma@6.5.0 exact docs-resolve result, exact installed runtime error shape and official Prisma v6 error/transaction references
  - docs/operations/production-deploy.md Prisma schema-apply guard procedure
selected_skills:
  - superpowers:using-superpowers
  - orchestrator-stage
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: telemetry-after-signup
depends_on_streams:
  - signup supplied and root accepted createTransientClientTracker
  - ai-usage supplied the AiUsageRecord model and released .env.example ownership
parallel_decision: sequential after shared tracker acceptance
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; the temporary docs-fallback note was deleted and no runtime process, database, branch, worktree or external session was created
risk_level: high
risk_tags:
  - concurrency
  - idempotency
  - privacy
  - data
  - public-api
  - operations
affected_surfaces:
  - api
  - backend
  - database
  - data
  - ops-deploy
invariants:
  - idempotency
  - atomicity
  - data-retention
  - privacy
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: readiness and data-model docs now define the stable HMAC key, fixed raw retention boundary, daily operator invocation and aggregate exclusion
verification:
  - 'Graph review: graphify query mapped PublicGrowthEventsController, PublicGrowthRepository, the focused growth test and downstream service nodes before broad source inspection.'
  - 'RED: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/public-growth-event.test.cjs tests/saas-retention.test.cjs failed 9 intended tests and passed 27; aggregate P2002 returned recorded false, P2034 escaped, tracker was constant, HMAC/fail-closed behavior and retention script were absent.'
  - 'GREEN core: the same two focused suites passed 36/36 tests after the minimal repository, service, guard and cleanup implementation.'
  - 'RED policy extension: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/saas-retention.test.cjs failed 1 intended test and passed 3 because the operator CLI did not yet expose a fixed-policy parser.'
  - 'GREEN policy extension: the same retention suite passed 4/4 tests after fixing the CLI to 90 days and rejecting overrides.'
  - 'Premortem RED: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand --coverage=false tests/public-growth-event.test.cjs tests/saas-retention.test.cjs failed 2 intended tests and passed 38; a short HMAC key was accepted and apply confirmation was not an independently testable contract. The same run already proved ambiguous target-less P2002 was retried three times and propagated rather than classified as duplicate.'
  - 'Premortem GREEN: the same two suites passed 40/40 after enforcing a 32-byte key and routing main through the tested apply-confirmation function.'
  - 'Fail-closed example correction RED: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand --coverage=false tests/public-growth-event.test.cjs failed the intended environment-example assertion and passed 36 tests because the shared placeholder was a reusable non-empty value that passed the 32-byte guard.'
  - 'Fail-closed example correction GREEN: the same focused test passed 37/37 after changing only PUBLIC_GROWTH_DEDUPE_KEY="" in .env.example.'
  - 'Focused growth/retention set: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand --coverage=false tests/public-growth-event.test.cjs tests/registration.growth-event.test.cjs tests/workspace-activation.growth-event.test.cjs tests/saas-retention.test.cjs passed 4 suites and 48 tests; the existing metric-outage case intentionally printed its caught console.error diagnostic.'
  - 'Backend type contract: Node 22.23.2, TMPDIR=/tmp, pnpm exec tsc --noEmit --project apps/backend/tsconfig.json --pretty false passed.'
  - 'Documentation links: python3 scripts/docs/check_docs.py passed, 78 files checked.'
  - 'Docs decision: docs-resolve found exact prisma@6.5.0 L1 but topic-insufficient; exact installed PrismaClientKnownRequestError preserved code/meta.target and official Prisma v6 docs confirm P2002 unique-target metadata plus retry for P2034 write conflict/deadlock. docs-persist reported skipped because L1 already covers the exact version.'
  - 'Focused git diff --check for tracked assigned paths passed; untracked new-file whitespace was separately inspected before return.'
changed_files:
  - .env.example
  - apps/backend/src/api/routes/public-growth-events.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.service.ts
  - scripts/operations/cleanup-saas-retention.cjs
  - docs/operations/saas-readiness.md
  - docs/architecture/data-model.md
  - tests/public-growth-event.test.cjs
  - tests/saas-retention.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/telemetry.md
explicit_defers:
  - root owns final combined acceptance, Beads mutation and independent high-risk review
  - the operator must configure the real HMAC key and install/read back the daily scheduler in an explicitly authorized environment
  - the transient tracker remains instance-local and resets with the process; distributed abuse accounting remains content-factory-next-saas.5
---

# Summary

Trusted growth writes now distinguish the receipt unique target from every
other `P2002`. A daily aggregate race rolls back the transaction and retries
the whole receipt-plus-aggregate unit; it never returns a false duplicate or
loses the trusted event. `P2034` write conflicts use the same three-attempt
bound, while an actual receipt duplicate remains a successful no-op.

The public receiver now adopts the signup stream's transient per-client HMAC
tracker. Throttle storage receives only a one-minute ephemeral digest, the
route keeps 120 requests per minute and the standard Nest `429`, and exhaustion
logs one fixed route-only warning without address, digest or User-Agent.

Trusted organization-derived keys are stored only as HMAC-SHA256 using a
versioned domain and required stable `PUBLIC_GROWTH_DEDUPE_KEY` of at least 32
bytes. Only controlled `NODE_ENV=test` execution receives a deterministic test
key; other environments throw before repository persistence when configuration
is absent or weak. The error contains only the variable/length requirement, and
this path has no key, organization or digest logger. The shared environment
example leaves the value empty, so copying it cannot silently install one
predictable key across instances.

The new operator cleanup dry-runs by default and fixes the policy at 90 days.
Apply requires `CF_CONFIRM_SAAS_RETENTION=apply`, deletes expired
`PublicGrowthTrustedEvent` and `AiUsageRecord` rows in one Prisma transaction,
then verifies no expired rows remain. It never queries or deletes
`PublicGrowthDaily`.

# Scope / Routing

The request entry point remains `POST /public-growth-events`; only its guard
tracker and exhaustion visibility changed. Public payload validation remains
in the existing DTO/service and still rejects trusted names. Trusted callers
continue through `PublicGrowthService` to `PublicGrowthRepository`, where HMAC
derivation is centralized in the domain service and transaction/idempotency
semantics remain centralized in the repository.

Corrected on 2026-08-19 by `content-factory-next-1ii`; the original paragraph
claimed no schema change was necessary and that both raw models already carried
a `createdAt` index. Neither half held.

This stream wrote no *further* schema change, but the slice it belongs to did:
commit `284e7707` adds `PublicGrowthDaily`, `PublicGrowthTrustedEvent`,
`AiUsageRecord`, the `AiUsageMode` and `AiUsageStatus` enums,
`Subscription.includedAiMonthlyOperations` and `AiProviderSetting.usageMode`.
An offline `prisma migrate diff --from-schema-datamodel` from `main` to this
branch prints fifteen own statements, and they have to be applied before the
new backend starts, or Prisma answers `P2021`. The statements and their apply
order are written down in `docs/operations/production-deploy.md`, section
«Пример: Cloud-first SaaS-срез».

Of the two raw models only `PublicGrowthTrustedEvent` had a `createdAt` index.
`AiUsageRecord` had two composite indexes, both leading with `organizationId`,
which cannot answer the organization-unfiltered `createdAt < cutoff` of the
retention delete. `content-factory-next-1ii` added the missing
`@@index([createdAt])`, one further additive statement.

No database command or apply was run in this stage, and the schema guard was
not changed.

The exact Prisma resolver returned an insufficient L1 topic result. The
fallback used the installed 6.5.0 runtime error class plus official Prisma v6
error and transaction documentation. This supports field-target inspection for
`P2002` and bounded application retry for `P2034`; an unknown/aggregate P2002
is deliberately never accepted as proof of a receipt duplicate.

# Verification

Strict RED→GREEN was observed for the original nine missing behaviors and for
the fixed 90-day CLI policy. Final focused verification passed 48/48 tests
across public growth, registration growth, workspace activation growth and
retention. Backend TypeScript passed without emitting. The expanded focused
run contains one expected console diagnostic from the existing test that
proves registration survives a caught metrics outage; it is not an uncaught
failure.

Success-path evidence proves one receipt and one aggregate increment after an
aggregate race. High-risk failure evidence proves three P2034 attempts then
propagation with no receipt, three target-less P2002 attempts without duplicate
classification, transaction rollback when aggregate persistence fails,
missing/empty/short HMAC key refusal before persistence, zero-write dry-run,
explicit apply confirmation, no post-failure retention verification after a
delete error, strict cutoff retention, exclusion of unknown/daily tables and
route-only throttle logging. Each retry opens a new `$transaction` callback;
no aborted transaction client is retained. The public route remains
unauthenticated by design and still cannot submit trusted events; no permission
or tenant boundary was loosened.

Premortem dispositions are closed locally: receipt uniqueness requires the
exact two-field target, ambiguous target metadata is retryable then visible;
weak key errors contain no sensitive value; cleanup is fixed at 90 days and
atomic; the warning is a constant route string. The index disposition was
wrong and is corrected above: only `PublicGrowthTrustedEvent` had a `createdAt`
index, `AiUsageRecord` did not, and the slice's own additions need DDL before
the new backend starts. Rollback is file-only: revert this stream's
local code, tests, docs and placeholder. No scheduler or migration was installed
and no database rows were changed, so there is no data rollback step.

# Root acceptance

The root orchestrator accepted this stream after reviewing the exact receipt-conflict classification, fresh-transaction retry boundary, transient tracker, stable keyed-HMAC contract, fixed retention policy, operator safety controls, and focused evidence. Before acceptance, the predictable non-empty `.env.example` placeholder was corrected to an empty fail-closed value and protected by a focused contract test. Independent cohesive review and release acceptance remain root-owned.

# Delivery / Cleanup

Changes remain in the shared worktree for root inspection. No Beads mutation,
commit, merge, push, pull request, deploy, database apply, scheduler install,
credential action, paid call, live traffic or real-user message was performed.
The temporary docs note was removed; no runtime cleanup remains.

# Risks / Follow-ups / Explicit Defers

Root still owns the combined stage acceptance and the independent review
required for high-risk concurrency/privacy/data behavior. A deployed instance
must provide one stable secret and must prove its daily job plus JSON/exit-status
readback; neither can be verified locally without environment authority.

Key rotation within the 90-day receipt window changes the HMAC and can count a
previously seen trusted event again, so the readiness runbook requires a
separate transition rather than silent replacement. The transient public
tracker intentionally resets across processes and does not provide a
distributed abuse budget.
