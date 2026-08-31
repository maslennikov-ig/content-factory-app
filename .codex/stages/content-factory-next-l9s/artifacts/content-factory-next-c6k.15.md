---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave4-c6k.15
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: TelegramUpdatesService polling loop and Telegram channel connection dialog
public_facade: existing Telegram integration endpoints and provider UI
bounded_acceptance: Telegram retries survive process replacement, every retry/effect/write-off mutation is fenced by the current lease row, clock-skew takeover cannot duplicate effects, and an expired connection request visibly restarts with a fresh word.
non_goals:
  - Database-server clock expressions or raw SQL.
  - Production schema mutation, deployment, Telegram traffic, or real account connection.
  - Unrelated Telegram UI or provider refactoring.
evidence:
  - focused_tdd_red_green
  - two_owner_clock_skew_behavior
  - prisma_validate_generate
  - backend_frontend_typecheck
  - git_diff_check
task_id: content-factory-next-c6k.15
epic_id: content-factory-next-c6k
stage_id: content-factory-next-l9s
milestone: durable fenced Telegram retry state and connection-expiry proof
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: high
model_reasoning_rationale: Persistent retry state, lease ownership, and receipt idempotency cross a concurrency and data-integrity boundary.
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-4
base_branch: codex/2026-08-16-l9s-wave-4
base_commit: 60f7eb88
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - tests/telegram.update.consumer.test.cjs
  - tests/telegram.connection.expiry.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-c6k.15.md
success_criteria:
  - A replacement TelegramUpdatesService continues the persisted attempt count and writes the same update off at the configured maximum.
  - Only the current lease owner may apply an update, increment its failure state, clear it, or write it off.
  - Post-poll and mid-batch rechecks plus the unique receipt transaction prevent duplicate effects under two process clocks.
  - Success, write-off, and cursor advancement clear matching durable failure state.
  - The 15-minute connection expiry stops polling, shows Start again, generates a fresh word, and restarts the request.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-l9s/prompt.md
  - .codex/stages/content-factory-next-l9s/plan.md
  - .codex/stages/content-factory-next-l9s/summary.md
  - .codex/stages/content-factory-next-l9s/stage-manifest.json
  - graphify-out/GRAPH_REPORT.md
  - Bead content-factory-next-c6k.15
selected_skills:
  - superpowers:test-driven-development
  - superpowers:test-driven-development/writing-good-tests.md
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree only; no temporary branch, runtime, database, external request, or production mutation was created.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - postgres
  - concurrency
  - lease
  - retry
  - idempotency
  - frontend-expiry
affected_surfaces:
  - telegram_update_polling
  - telegram_receipts_and_effects
  - telegram_connection_dialog
invariants:
  - receipt_update_id_idempotency
  - no_raw_sql
  - lease_fenced_transactions
  - process_update_compatibility
docs_impact: schema-and-runtime-behavior
docs_reviewed: no-change-needed
docs_review_notes: The internal retry table does not change a public or operator-facing contract. Rollout still follows the existing schema-first deployment rule; no durable document currently catalogs internal Telegram tables. The additive table must exist before the new service code starts.
verification:
  - 'TDD RED restart: focused Jest failed because a replacement service did not write update 501 off and made zero durable failure-state calls.'
  - 'TDD RED stale owner: focused Jest failed because the old implementation never fenced failure persistence and still created receipt 503 after ownership loss.'
  - 'TDD RED stale cleanup: focused Jest failed because a cursor at update 41 did not delete failure rows at or below 41.'
  - 'GREEN backend behavior: pnpm exec jest tests/telegram.update.consumer.test.cjs --runInBand passed 17 tests.'
  - 'GREEN UI behavior: pnpm exec jest tests/telegram.connection.expiry.test.cjs --runInBand passed 1 test.'
  - 'Clock decision: process clocks remain because the two-owner test advances owner B by 60 seconds, proves owner A stops after the long poll and at the mid-batch renewal, exercises one duplicate receipt, and observes exactly one effect per update.'
  - 'Prisma: prisma validate and prisma generate with schema.prisma passed on Prisma 6.5.0.'
  - 'Frontend typecheck: pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json passed.'
  - 'Backend affected check: pnpm exec tsc --noEmit -p apps/backend/tsconfig.json --noImplicitAny false passed; the strict command is blocked by pre-existing TS7011 at agent.graph.service.ts:114, outside this write zone and unchanged since upstream commit a0054ac2d.'
  - 'Formatting and whitespace: scoped Prettier/Prisma format and git diff --check passed.'
  - 'Root acceptance: both focused suites passed 18/18; Prisma 6.5.0 validate and generate passed; frontend typecheck and affected backend typecheck with the recorded pre-existing noImplicitAny exception passed.'
  - 'Root diagnostic recheck: strict backend tsc reported only the unchanged TS7011 at libraries/nestjs-libraries/src/agent/agent.graph.service.ts:114.'
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts
  - tests/telegram.update.consumer.test.cjs
  - tests/telegram.connection.expiry.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-c6k.15.md
explicit_defers:
  - Root-owned wave acceptance and stage-manifest registration remain outside this returned stream; no implementation debt is deferred.
---

# Summary

`TelegramUpdateFailureState` is an additive Prisma model keyed by Telegram `updateId`. It stores the durable attempt count and the owner that most recently advanced it. The polling service no longer uses an in-memory `Map`.

Every leased update transaction first performs a conditional no-op update of the single lease row for this service owner. PostgreSQL holds that row lock until the transaction finishes, so lease takeover cannot interleave with receipt/effect application, failure increment, success cleanup, or write-off. A lost owner exits without mutating another owner's state. Receipt creation and all update effects remain one transaction; the unique receipt key rejects an overlapping owner's duplicate before any effect executes.

The lease timestamp remains based on process time. The deterministic two-owner test uses a 60-second skew (greater than the 45-second lease), lets the fast owner take over during a long poll and after the first committed item of a batch, and proves the slow owner stops at both rechecks. The overlapping receipt is attempted three times for two update ids, while only two metric effects occur.

# Data rollout and recovery

The schema change creates one new table and two indexes; it does not alter or backfill existing rows. Apply the additive schema before starting code that references `telegramUpdateFailureState`. A code rollback is safe with the table left in place. Recovery is roll-forward or code rollback; dropping the table is unnecessary and would discard only retry progress, not receipts or engagement data. No database, Docker volume, or production environment was mutated in this stream.

# Verification

Focused behavior passed 18/18 tests across backend and UI. Prisma validation and client generation passed, frontend typechecking passed, and the backend graph compiled with the pre-existing unrelated `noImplicitAny` diagnostic disabled. Strict backend typechecking remains blocked only by `libraries/nestjs-libraries/src/agent/agent.graph.service.ts:114`, which is outside scope and unchanged from upstream history.

The concurrency proof is deterministic at the Prisma contract boundary rather than a live PostgreSQL integration. Root acceptance may additionally run the repository's selected integration/build checks. The schema must be applied before runtime rollout; otherwise Prisma will report the missing table and the poll loop will retry with operator-visible errors.

# Risks / Follow-ups

The strict backend typecheck remains blocked by the pre-existing `agent.graph.service.ts:114` diagnostic outside this write-zone. Root owns manifest registration and wave-wide acceptance. No product implementation debt is deferred.
