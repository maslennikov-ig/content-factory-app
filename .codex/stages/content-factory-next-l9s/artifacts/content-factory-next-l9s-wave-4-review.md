---
schema_version: orchestration-artifact/v3
artifact_type: independent-review
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: content-factory-next-l9s.wave4.review
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: root wave-4 acceptance
public_facade: wave-4 diff 60f7eb88..bccb4228
bounded_acceptance: read-only correctness review of Telegram durable retry fencing and PostgreSQL backup/restore recovery scripts
non_goals:
  - implementation edits
  - Beads writes
  - production access
  - existing Docker resource mutation
evidence:
  - source_review
  - diff_review
  - focused_acceptance_rerun
task_id: content-factory-next-l9s.wave4.review
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: wave-4 independent correctness review
milestone_status: accepted
agent_type: correctness_reviewer
subagent_model: gpt-5.5
reasoning_effort: high
model_reasoning_rationale: independent review must not use Sol after Sol-authored wave-4 code; recovery and concurrency defects have high data-integrity impact
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-4
base_branch: main
base_commit: 60f7eb88
reviewed_head: bccb4228725e9d8557d844742bd9266036ea756b
worktree: /home/me/code/content-factory-next
write_zone:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-4-review.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only review. No source mutation, Docker resource, branch, stash, production action, or external call was created.
risk_level: high
verification_tier: slice_acceptance
risk_tags:
  - backup
  - recovery
  - data-integrity
  - postgres
  - concurrency
affected_surfaces:
  - postgres-backup
  - postgres-restore
  - operations-docs
  - telegram-updates
invariants:
  - restore-usability
  - disposable-target-only
  - consistent-recovery-point
  - lease-fencing
docs_impact: operations backup runbook updated
docs_reviewed: yes
docs_review_notes: The runbook now documents owner-only activation, one wrapper for both host entry points, planned writer downtime, quiesced product/Temporal recovery point, restart-failure behavior, restored source-role ownership/access, and empty disposable target barriers.
verification:
  - "Reviewed git diff 60f7eb88..60aec41f and artifacts content-factory-next-c6k.15.md and content-factory-next-7g0.md."
  - "Ran prescribed command: source \"$HOME/.nvm/nvm.sh\" && nvm use --silent && pnpm exec jest tests/telegram.update.consumer.test.cjs tests/telegram.connection.expiry.test.cjs tests/postgres-backup.contract.test.cjs --runInBand && pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && pnpm exec tsc --noEmit -p apps/backend/tsconfig.json --noImplicitAny false && python3 scripts/docs/check_docs.py && git diff --check 60f7eb88..60aec41f."
  - "Focused Jest passed: 3 suites, 23 tests."
  - "Prisma schema validation passed."
  - "Frontend and backend TypeScript commands exited 0."
  - "Documentation links passed: 63 files checked."
  - "git diff --check 60f7eb88..60aec41f exited 0."
  - "Artifact validation passed: python3 scripts/orchestration/validate_artifact.py .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-4-review.md."
  - "Re-reviewed fix commit bccb4228 against prior head 60aec41f and base 60f7eb88."
  - "Prescribed re-review command passed on bccb4228: source \"$HOME/.nvm/nvm.sh\" && nvm use --silent && pnpm exec jest tests/telegram.update.consumer.test.cjs tests/telegram.connection.expiry.test.cjs tests/postgres-backup.contract.test.cjs --runInBand && pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && pnpm exec tsc --noEmit -p apps/backend/tsconfig.json --noImplicitAny false && python3 scripts/docs/check_docs.py && git diff --check 60f7eb88..bccb4228."
  - "Re-review Jest passed: 3 suites, 25 tests."
  - "Re-review Prisma schema validation passed."
  - "Re-review frontend and backend TypeScript commands exited 0."
  - "Re-review documentation links passed: 63 files checked."
  - "Re-review git diff --check 60f7eb88..bccb4228 exited 0."
  - "Real disposable PostgreSQL proof passed on postgres:17-alpine / PostgreSQL 17.10 with dump 2s and restore 2s, including unquiesced, unlabeled, dirty-target, source-role read/write/delete, and cleanup checks."
  - "Post-proof Docker inventory had no cf-postgres-backup-prefixed containers, volumes, or networks."
changed_files:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-4-review.md
explicit_defers:
  - "Owner-only production activation remains deferred; repository recovery implementation is accepted for local scope."
---

# Verdict: ACCEPT

Follow-up `bccb4228` closes the three prior backup/restore findings. I found no open P0-P3 issue in the re-reviewed wave-4 diff through `bccb4228`.

## Findings

No open P0-P3 findings remain.

## Closed Initial Findings

### P1 closed: restored databases could be unusable by the application role

Evidence: `scripts/operations/postgres-backup-restore.sh:100-105` creates each database with `--owner "$source_user"`, but imports every archive as the target bootstrap user with `pg_restore --username "$POSTGRES_USER" --no-owner --no-privileges`. With `--no-owner`, restored tables, indexes, sequences, and functions are owned by the restore session user, not by `source_user`. The proof then validates data only as `postgres` at `scripts/operations/verify-postgres-backup-restore.sh:103` and checks the role only as `postgres` at line 110; it never proves that the restored application role can read or write the restored product or Temporal objects.

Impact: A production restore can pass the current proof while the app role from `manifest.env` cannot access its restored tables/sequences. That turns a successful recovery artifact into an outage at application startup or first DB access.

Suggested fix: Restore objects under the recovered application role, for example by running `pg_restore` through the bootstrap superuser with `--role "$source_user"` or by restoring as `source_user` where the target authentication permits it. Then extend the disposable proof to connect as `source_user` and perform at least read and write sentinel checks in `product_database`, `temporal`, and `temporal_visibility`.

Expected value: Proves the backup is not only importable by a superuser, but usable by the runtime role the production app and Temporal stack will actually use.

Tradeoff: The restore script needs slightly more precise role handling, and the proof must model runtime access rather than only superuser inspection.

Confidence: high.

Classification: must-fix.

Closure evidence: `scripts/operations/postgres-backup-restore.sh:104-109` now runs `pg_restore` as the target bootstrap superuser with `--role "$source_user"`, after refusing a bootstrap role equal to the source role at lines 71-76. The proof reads each sentinel and performs an insert/delete probe as `source_user` in all three restored databases at `scripts/operations/verify-postgres-backup-restore.sh:123-135`. The real disposable proof passed on PostgreSQL 17.10.

### P2 closed: restore target was not actually required to be empty before mutation

Evidence: `scripts/operations/postgres-backup-restore.sh:74-88` refuses only when one of the three destination database names already exists or when the source role already exists. A labelled target that already contains another user database, user role, schema state, or previous disposable recovery residue still passes these guards and is mutated by `globals.sql` at lines 90-92.

Impact: This violates the assigned recovery invariant that restore accepts only a labelled, empty disposable target. A stale or wrongly labelled container can silently accumulate a restore, making the proof less fail-closed and raising the chance of overwriting or mixing recovery state during an incident.

Suggested fix: Before any mutation, enumerate target state and fail unless it contains only template databases plus `postgres`, and only the expected bootstrap/system roles. Keep the disposable label, but do not treat it as the only emptiness barrier. Add a negative proof case with an unrelated existing database or user role.

Expected value: Makes accidental restore targets fail before `globals.sql` or `createdb` can change them.

Tradeoff: The empty-target predicate must account for PostgreSQL built-in roles and the bootstrap role, which is a small but explicit compatibility surface.

Confidence: high.

Classification: must-fix.

Closure evidence: `scripts/operations/postgres-backup-restore.sh:78-92` now refuses any non-template user database and any non-built-in role other than the bootstrap role before `globals.sql` is imported at lines 94-96. The proof creates an unrelated database and role on the labelled target, verifies restore refusal, then removes both before the positive restore at `scripts/operations/verify-postgres-backup-restore.sh:106-120`.

### P2 closed: scheduled live backup did not provide the consistent recovery point required by the runbook

Evidence: `scripts/operations/postgres-backup.sh:81-99` performs `pg_dumpall --globals-only` and then dumps the product, `temporal`, and `temporal_visibility` databases one by one. The supplied host wrapper and timer simply execute that script (`deploy/production/backup/content-factory-next-postgres-backup.service:11`, timer lines 15-18). The new runbook describes enabling this as a daily backup option at `docs/operations/postgres-backup.md:24-35`, while the existing runtime runbook says full recovery needs consistent snapshots of app PostgreSQL, Temporal persistence/search storage, media, and config, and warns that restoring only one side can leave Temporal history and product data inconsistent (`docs/operations/runtime.md:57-66`).

Impact: With writers running, product DB state and Temporal state can be captured at different logical times. A backup can restore cleanly at the SQL level but contain mismatched workflow history and product rows, which is exactly the failure mode the runtime document warns about.

Suggested fix: Either automate a quiesced backup window that stops or fences `cf-app` and `cf-temporal` writers before the multi-database dump, or replace the scheduled script with a host-level PostgreSQL/volume snapshot strategy that captures a single consistent point. If repository scope remains logical dumps only, the runbook must explicitly state that the timer is not production recovery-safe unless writers are stopped and the proof should cover that precondition.

Expected value: Aligns the backup mechanism with the documented recovery invariant instead of producing a best-effort set of importable dumps.

Tradeoff: Quiescing introduces downtime or requires snapshot infrastructure; documenting the limitation is cheaper but would not meet the current production-backup acceptance bar.

Confidence: medium-high.

Classification: must-fix.

Closure evidence: `scripts/operations/postgres-backup.sh:53-56` refuses direct dumps unless `CF_BACKUP_QUIESCED=1`. Both host entry points route to `deploy/production/backup/run-postgres-backup.sh`: the systemd service uses it as `ExecStart`, and the `/root/full_backup.sh` snippet invokes the same wrapper. The wrapper requires `cf-app` and `cf-temporal` to be running, marks each before stopping, stops app then Temporal, passes `CF_BACKUP_QUIESCED=1`, and restarts Temporal then app in its EXIT handler while preserving dump failures and surfacing restart failure on successful dumps. The runbook now documents the planned writer outage and one quiesced product/Temporal recovery point at `docs/operations/postgres-backup.md:37-44`.

# Summary

Telegram durable retry state is additive in Prisma, removes the in-memory failure map, and fences processing, retry increments, cleanup, and write-off behind the current lease owner. The focused tests are mock-heavy, but the implemented receipt-first transaction plus conditional lease update is coherent for the reviewed concurrency cases.

The PostgreSQL backup stream is now acceptable for the repository-local scope. It refuses unquiesced direct dumps, routes owner-installed host scheduling through a quiescing wrapper, restores under the recovered source role, refuses dirty disposable targets before mutation, and proves runtime-role access in a real local PostgreSQL restore.

# Verification

Prescribed command completed successfully:

`source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/telegram.update.consumer.test.cjs tests/telegram.connection.expiry.test.cjs tests/postgres-backup.contract.test.cjs --runInBand && pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && pnpm exec tsc --noEmit -p apps/backend/tsconfig.json --noImplicitAny false && python3 scripts/docs/check_docs.py && git diff --check 60f7eb88..60aec41f`

Initial result: 3 Jest suites passed, 23 tests passed; Prisma schema validation passed; frontend and backend TypeScript commands exited 0; documentation links passed for 63 files; `git diff --check 60f7eb88..60aec41f` exited 0.

Re-review command after `bccb4228`:

`source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/telegram.update.consumer.test.cjs tests/telegram.connection.expiry.test.cjs tests/postgres-backup.contract.test.cjs --runInBand && pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && pnpm exec tsc --noEmit -p apps/backend/tsconfig.json --noImplicitAny false && python3 scripts/docs/check_docs.py && git diff --check 60f7eb88..bccb4228`

Result: 3 Jest suites passed, 25 tests passed; Prisma schema validation passed; frontend and backend TypeScript commands exited 0; documentation links passed for 63 files; `git diff --check 60f7eb88..bccb4228` exited 0.

Real disposable restore proof:

`scripts/operations/verify-postgres-backup-restore.sh`

Result: `Local dump/restore proof passed. Image: postgres:17-alpine. Version: postgres (PostgreSQL) 17.10. Dump: 2s. Restore: 2s.` Cleanup removed the proof containers, network, volumes, and artifact directory; post-proof Docker inventory had no `cf-postgres-backup-` resources.

# Risks / Follow-ups

Owner-only production installation remains correctly deferred. No new implementation defer is required for the reviewed repository-local backup/restore scope.
