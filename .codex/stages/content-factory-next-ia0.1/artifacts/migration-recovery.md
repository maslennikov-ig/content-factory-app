---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0.1/stage-manifest.json
stream_owner: migration_recovery
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root
public_facade: n/a
bounded_acceptance: focused migration/recovery/cleanup tests only; root owns final acceptance
non_goals:
  - landing-page design
  - production or operator execution
  - production or non-disposable schema/data mutation
  - merge, push, PR, deploy, secrets, paid calls, Beads close
evidence:
  - none
task_id: content-factory-next-ia0.1.migration-recovery
epic_id: content-factory-next-ia0.1
stage_id: content-factory-next-ia0.1
session_id: content-factory-next-ia0.1
milestone: migration-and-recovery-audit-repair
milestone_status: accepted
agent_type: db_migration_specialist
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: high-risk database migration and recovery contract
repo: content-factory-next
branch: codex/remaining-epic-acceptance
base_branch: codex/remaining-epic-acceptance
base_commit: 80300ed6899490dca5e0f6ec82492bbc9776828e
worktree: /home/me/code/content-factory-next
write_zone:
  - deploy/production/migrate-mastra-storage.sh
  - scripts/operations/postgres-backup-restore.sh
  - scripts/operations/verify-postgres-backup-restore.sh
  - scripts/operations/cleanup-legacy-errors.cjs
  - docs/operations/production-deploy.md
  - docs/operations/postgres-backup.md
  - docs/operations/newsletter.md
  - focused Mastra/backup/restore/legacy-error tests
  - scripts/operations/verify-mastra-storage-migration.sh
  - .codex/stages/content-factory-next-ia0.1/artifacts/migration-recovery.md
success_criteria:
  - source database supplies Mastra DDL and exact 29-table set is proven before target mutation or copy
  - restore revokes PUBLIC CONNECT and restores product/Mastra runtime CONNECT isolation
  - runbook names four nullable User columns, two indexes, and exact --allow-table User path
  - legacy cleanup uses a batched Prisma transaction instead of a five-second interactive callback
  - real PostgreSQL 17 proof preserves Mastra trigger/function/data and refuses missing or extra source tables before target mutation
selected_docs:
  - AGENTS.md
  - docs/operations/production-deploy.md
  - docs/operations/postgres-backup.md
  - docs/operations/newsletter.md
  - @mastra/pg@1.8.5 first-party commit a78b4232ff84f51ee60cc102f0799ee726f7f100
  - PostgreSQL 17 pg_dump documentation
selected_skills:
  - superpowers:test-driven-development
  - technical-premortem
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: ia0.1-implementation-streams
depends_on_streams:
  - none
parallel_decision: parallel write-isolated stream assigned by root
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
orchestrator_acceptance_notes: root inspected the source-DDL flow, exact 29-table gates, restore ACL transaction, runtime-role guards, cleanup batching, runbook diff, focused RED/GREEN record, real disposable PostgreSQL proofs, trigger-safe data copy correction, and cleanup inventory; accepted before the single release acceptance
cleanup_status: cleaned
cleanup_notes: All authorized local PostgreSQL proofs removed their disposable containers, networks, volumes, and artifacts; exact post-run inventories were empty.
risk_level: high
risk_tags:
  - migration
  - security
  - authorization
  - atomicity
  - rollback
  - data
affected_surfaces:
  - database
  - data
invariants:
  - rollback
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Mastra source-DDL, recovery ACL, User schema diff, and --allow-table User instructions corrected.
verification:
  - TMPDIR=/tmp pnpm exec jest tests/mastra-migration.execution.test.cjs --runInBand RED: failed as expected, 2 tests exposed docker compose exportSchemas path
  - TMPDIR=/tmp pnpm exec jest tests/mastra-migration.execution.test.cjs --runInBand GREEN: passed, 2 tests
  - TMPDIR=/tmp pnpm exec jest tests/postgres-backup.restore.execution.test.cjs --runInBand RED: failed as expected, missing ACL apply and missing runtime-role guard
  - TMPDIR=/tmp pnpm exec jest tests/postgres-backup.restore.execution.test.cjs --runInBand GREEN: passed, 17 tests before final bootstrap-role case
  - TMPDIR=/tmp pnpm exec jest tests/legacy-errors.cleanup-batching.test.cjs --runInBand RED: failed as expected on sequential awaits, then on interactive callback contract
  - TMPDIR=/tmp pnpm exec jest tests/legacy-errors.cleanup-batching.test.cjs --runInBand GREEN: passed, 1 test
  - TMPDIR=/tmp pnpm exec jest tests/prisma-schema-apply-guard.migrate-diff.test.cjs --runInBand: passed, 8 tests
  - TMPDIR=/tmp pnpm exec jest six assigned focused suites --runInBand: passed, 6 suites and 44 tests
  - bash -n assigned shell scripts and node --check cleanup script: passed
  - git diff --check on assigned files: passed
  - scripts/operations/verify-postgres-backup-restore.sh: passed against disposable postgres:17-alpine; dump 4s, restore 3s, cleanup proof passed
  - TMPDIR=/tmp pnpm exec jest tests/postgres-role-isolation.execution.test.cjs --runInBand: passed, 4 tests
  - post-proof docker container, volume, and network prefix inventory: empty
  - TMPDIR=/tmp scripts/operations/verify-mastra-storage-migration.sh GAP: first complete run exposed target trigger replay changing agent trigger_count from 1 to 2
  - TMPDIR=/tmp scripts/operations/verify-mastra-storage-migration.sh GREEN: PostgreSQL 17.10 exact 29 tables, trigger/function and representative data preserved; missing/extra cases refused with pristine targets
  - TMPDIR=/tmp pnpm exec jest tests/mastra-migration.execution.test.cjs --runInBand after trigger-copy fix: passed, 2 tests
  - real Mastra proof cleanup inventory: three named containers, one named network, three named volumes and /tmp artifact directory removed; exact-name inspection and prefix inventory empty
changed_files:
  - deploy/production/migrate-mastra-storage.sh
  - scripts/operations/postgres-backup-restore.sh
  - scripts/operations/verify-postgres-backup-restore.sh
  - scripts/operations/verify-mastra-storage-migration.sh
  - scripts/operations/cleanup-legacy-errors.cjs
  - docs/operations/production-deploy.md
  - docs/operations/postgres-backup.md
  - docs/operations/newsletter.md
  - tests/mastra-migration.execution.test.cjs
  - tests/postgres-backup.restore.execution.test.cjs
  - tests/postgres-backup.contract.test.cjs
  - tests/postgres-role-isolation.test.cjs
  - tests/legacy-errors.cleanup-batching.test.cjs
explicit_defers:
  - root owns the one final release acceptance
  - Docker-absent describe.skip policy is not changed because making Docker mandatory changes the CI contract; error-collector compose suite is also outside this write zone
---

# Summary

Mastra migration no longer trusts incomplete `exportSchemas()`. It reads the
real source database, requires the exact known set of 29 deployment tables,
exports referenced trigger functions plus table DDL from that source, verifies
the dumped table set again, and only then applies target DDL and copies data.
Data replay temporarily disables target triggers so source rows are not
transformed a second time after their trigger-bearing schema is installed.

Restore now requires the two runtime role names for split-role artifacts and,
after restoring all archives, reapplies database-level ACL in one transaction:
no restored database keeps `PUBLIC CONNECT`; product and Mastra runtimes can
connect only to their own database and are denied both Temporal databases and
Listmonk. The proof script now checks that matrix.

The production runbook names the actual four nullable `User` columns, the two
indexes, and the exact single `--allow-table User` route. Legacy error cleanup
uses Prisma's array transaction, removing the interactive transaction's
five-second callback window.

# Scope / Routing

No files outside the assigned write zone were edited. The shared
`tests/legacy-errors.retention.test.cjs` ownership collision was reported to
root; the other stream updated that file, while this stream added a separate
cleanup batching test. No Beads state, production host/database, credential,
remote, PR or deployment was changed. The only database mutations were inside
explicitly authorized disposable local PostgreSQL containers, all removed by
their proof cleanup.

External/versioned evidence was needed. `docs-resolve` returned
`fallback-needed`; the installed exact `@mastra/pg@1.8.5` package and its
first-party commit show 9 exported domains versus 14 constructor domains.
Local package inspection produced 17 exporter tables; the five omitted domains
add 9, observational memory adds 1, and the deployed legacy
`mastra_traces`/`mastra_evals` add 2, for the exact 29-name contract. PostgreSQL
17 documentation states that `pg_dump --table` does not include dependencies;
therefore referenced trigger functions are exported explicitly from the source
catalog before the table-filtered dump.

# Verification

Focused final command with Node 22.23.2, pnpm 10.6.1 and `TMPDIR=/tmp`:

```text
PASS tests/postgres-backup.restore.execution.test.cjs
PASS tests/postgres-role-isolation.test.cjs
PASS tests/legacy-errors.retention.test.cjs
PASS tests/mastra-migration.execution.test.cjs
PASS tests/legacy-errors.cleanup-batching.test.cjs
PASS tests/postgres-backup.contract.test.cjs
Test Suites: 6 passed, 6 total
Tests: 44 passed, 44 total
```

The focused real Prisma migrate-diff guard also passed 8/8. The disposable
`postgres:17-alpine` backup/restore proof passed, including its cleanup proof
(dump 4s, restore 3s). The Docker-backed runtime-role isolation suite passed
4/4. A separate real Mastra migration proof on PostgreSQL 17.10 passed: exact
29-table schema, trigger function, trigger and representative rows arrived in
the empty target; the missing-table and extra-table cases both stopped with a
pristine target. Its first complete run exposed trigger replay changing a row
counter from 1 to 2; `--disable-triggers` made the row-preservation check green.
The proof fails explicitly rather than skipping when Docker, a local endpoint,
or the already-local `postgres:17-alpine` image is unavailable. Shell syntax,
Node syntax and assigned-file whitespace checks passed. Broad/package/full
suite was not run because final acceptance is root-owned.

# Delivery / Cleanup

Changes are present directly in the shared worktree for root review. No commit,
merge or push was performed. The Mastra proof removed these exact resources:
containers `cf-mastra-migration-{success,missing,extra}-20260819065638-11456-3326`,
network `cf-mastra-migration-proof-20260819065638-11456-3326`, volumes
`cf-mastra-migration-{success,missing,extra}-data-20260819065638-11456-3326`, and
artifact directory `/tmp/tmp.nmhXii7Nxb`. Its exact-name checks and a separate
prefix inventory found no leftovers from this stream.

# Risks / Follow-ups / Explicit Defers

Technical premortem verdict: **GO WITH CONDITIONS**. The repository changes are
reversible by restoring these files; no persistent database rollback is needed
because the local proof databases were disposable and cleaned. During a future
authorized rollout, failure of either 29-table comparison must stop the
migration before target mutation. Failure of the schema-apply transaction
leaves target DDL unchanged. Failure of data copy rolls that copy back while
source tables remain untouched; target triggers are disabled and re-enabled
inside that same data-copy transaction. Retry is safe only after confirming
target tables are empty. Restore ACL is applied after archives in one
transaction; any ACL failure prevents the completion message.

The authorized real Docker restore proof and Docker-backed role suite passed,
covering actual `pg_dump`/`pg_restore` semantics and the runtime-role safety
preflights. The Docker-absent silent-skip behavior is not cheaply correctable
without a CI environment contract: turning it into a failure can break
legitimate non-Docker runners, while keeping it is the audited blind spot. Root
should decide that contract separately; no test was weakened or skipped for
green.
