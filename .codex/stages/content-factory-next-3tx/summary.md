---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: n/a
stream_owner: root
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: owner-running-production-deploy
public_facade: scripts/operations/validate-prisma-migration-sql.cjs
bounded_acceptance: focused guard suites plus offline prisma migrate diff evidence
non_goals:
  - applying any SQL to the production database
  - connecting to the production database from this repository
evidence:
  - .codex/stages/content-factory-next-3tx/artifacts/guard-run.txt
  - .codex/stages/content-factory-next-3tx/artifacts/epic-tables-migrate-diff.sql
task_id: content-factory-next-3tx
epic_id: content-factory-next-aay
stage_id: content-factory-next-3tx
session_id: n/a
milestone: production schema apply barrier
milestone_status: in_progress
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: repair pass on an existing guard after review found it refused every foreign key
repo: content-factory-next
branch: work/schema-drift-guard
base_branch: main
base_commit: db4a5aee95b8e5cdccab4b3d132321bb4bd3fc7a
worktree: /tmp/cf-fix/schema-drift-guard
write_zone:
  - scripts/operations/validate-prisma-migration-sql.cjs
  - tests/prisma-schema-apply-guard.*.test.cjs
  - docs/operations/production-deploy.md
  - docs/prompts/codex-remaining-tasks.md
  - var/docker/entrypoint.sh
  - AGENTS.md
  - .codex/project-index.md
  - .codex/stages/content-factory-next-3tx/
success_criteria:
  - the documented bootstrap procedure completes on this repository's own schema
  - a new table with a cascading relation passes update mode when named by --allow-table
  - DROP, data change, Mastra-owned storage and unknown operations stay refused
  - the guard is exercised against real prisma migrate diff output, not fixtures
selected_docs:
  - prisma CLI 6.5.0 migrate diff (resolved in the previous pass, l1-hit)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: worktree owned by the repair run, no temporary state left in the tree
risk_level: high
risk_tags:
  - migration
  - data
  - rollback
affected_surfaces:
  - database
  - ops-deploy
invariants:
  - rollback
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: production-deploy.md rewritten around the barrier; entrypoint, AGENTS.md, project-index.md and the epic prompt corrected
verification:
  - pnpm exec jest tests/prisma-schema-apply-guard: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/foundation.test.cjs: passed
  - python3 -m unittest tests/test_docs_links.py: passed
  - python3 scripts/docs/check_docs.py: passed
  - bash scripts/orchestration/run_process_verification.sh: passed
  - git diff --check: passed
changed_files:
  - scripts/operations/validate-prisma-migration-sql.cjs
  - tests/prisma-schema-apply-guard.execution.test.cjs
  - tests/prisma-schema-apply-guard.migrate-diff.test.cjs
  - docs/operations/production-deploy.md
  - docs/prompts/codex-remaining-tasks.md
  - var/docker/entrypoint.sh
  - AGENTS.md
  - .codex/project-index.md
  - .codex/stages/content-factory-next-3tx/summary.md
  - .codex/stages/content-factory-next-3tx/artifacts/guard-run.txt
  - .codex/stages/content-factory-next-3tx/artifacts/epic-tables-migrate-diff.sql
explicit_defers:
  - read-only migrate diff run on the server, to learn whose ~25 DROP COLUMN the 17.08.2026 preview showed; owner action, cannot be done from here
---

# Summary

The barrier the first pass built refused every foreign key Prisma prints, so the
procedure it documented could not finish even once. `migrate diff --from-empty`
on this repository's schema prints 261 statements; 59 of them are
`ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and Prisma writes
`ON DELETE ... ON UPDATE ...` on every one. The destructive-keyword check read
those words as an operation on data and stopped the run. Those matches were the
only matches of a forbidden keyword in the whole diff.

The check now strips referential-action clauses from a copy of the statement
before looking for `DROP`, `DELETE`, `UPDATE` and the rest. Nothing else is
relaxed: `DROP TABLE`, `ALTER TABLE ... DROP COLUMN`, a `DROP` written beside a
cascade, Mastra-owned storage, unknown operations and `CREATE INDEX
CONCURRENTLY` are refused exactly as before.

Two further holes are closed. `bootstrap`, which takes no `--allow-table`, now
requires the diff to prove it came from `--from-empty`: every table it touches
must be created by that same diff. Pasting the first-install block into an
update therefore stops instead of running without an explicit table list. And
the suites no longer rely on hand-written SQL alone — a new file runs real
`prisma migrate diff` output through the guard, which is what would have caught
this defect on the first pass.

# Scope / Routing

Write zone above. No database was contacted: `--from-empty` and
`--from-schema-datamodel` compare two schema files, and the guard itself has no
database client. No Beads command was run in this pass.

# Verification

Offline, on this repository's own schema (`artifacts/guard-run.txt`):

- `migrate diff --from-empty --to-schema-datamodel` — exit 2, 1452 lines, 261
  statements, 18 of them `mastra_*`.
- guard, `--mode bootstrap`, whole diff against the 243 product statements —
  `SQL apply guard passed: 243 explicitly selected statement(s).`, exit 0.
  Before the fix the same input gave `destructive or data-changing operation`,
  exit 1.
- the two tables the epic adds (`UserIdentity`, `ProductEvent`, both with
  `onDelete: Cascade`) — 9 statements, exit 0 with both names in
  `--allow-table`; exit 1 with only one of them.

Suites:

- `pnpm exec jest tests/prisma-schema-apply-guard` — 2 suites, 56 tests, passed.
  Reverting only the referential-action fix turns 4 of the 7 new migrate-diff
  tests red, so they do hold the defect down.
- `pnpm exec jest tests/design.guard.test.cjs tests/foundation.test.cjs` — 30
  tests, passed (no interface files changed; run because documentation moved).
- `python3 -m unittest tests/test_docs_links.py` — 3 tests, passed.
- `python3 scripts/docs/check_docs.py` — 66 files, links OK.
- `bash scripts/orchestration/run_process_verification.sh` — OK.
- `git diff --check` — clean.

Not run here: `pnpm test` in full and `pnpm run build`. Acceptance across the
seven branches is owned by the run that integrates them.

# Delivery / Cleanup

Returned on `work/schema-drift-guard` as a second commit; the first commit is
left untouched so the two can be compared. Nothing pushed, nothing merged,
nothing applied to any database.

# Risks / Follow-ups / Explicit Defers

- The largest one is unchanged and cannot be closed from here: the preview of
  17.08.2026 showed about 25 `DROP COLUMN` and a primary key, and it is not
  known whose tables they are. If one lands on a product table, the update
  procedure stops at the validation step — correctly, but it stops. One
  read-only `migrate diff` on the server, output kept as an artifact, settles
  it. The runbook now says so in the update section.
- The bootstrap procedure has still never been executed against a real
  database. What is proven is that the SQL Prisma prints for this schema passes
  the barrier.
- `package.json` keeps `prisma-db-push` with `--accept-data-loss` for local
  development. It is reachable inside the container as `pnpm prisma-db-push`,
  and only the comment in `var/docker/entrypoint.sh` and the documentation warn
  against it. Removing it would break local setup; a container-aware refusal
  inside the script is a separate change.
- A statement carrying a comment between its keywords is unrecognised and
  refused. Prisma never writes one; a hand-edited file would be refused rather
  than parsed loosely. Recorded as intended behaviour with a test.
