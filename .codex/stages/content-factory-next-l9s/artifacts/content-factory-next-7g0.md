---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave4-7g0
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: production PostgreSQL backup, recovery, and host-scheduler runbook
bounded_acceptance: Repository-owned backup and restore scripts prove a quiesced multi-database dump, cluster globals, checksum validation, empty disposable-only restore, runtime-role access, and local recovery without touching production.
non_goals:
  - Installing files, enabling a timer, or editing /root/full_backup.sh on <боевой хост>.
  - Contacting production, existing Docker containers, existing Docker volumes, remote services, or secrets.
task_id: content-factory-next-7g0
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: production PostgreSQL backup and disposable restore proof
milestone_status: accepted
agent_type: deploy_specialist
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: Backup and restore change production recovery boundaries, but its repository implementation and disposable proof remain contained.
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-4
base_branch: main
base_commit: 60f7eb88
worktree: /home/me/code/content-factory-next
write_zone:
  - scripts/operations/**
  - deploy/production/backup/**
  - docs/operations/**
  - tests/postgres-backup*.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-7g0.md
success_criteria:
  - Atomic, checksummed dump includes product, temporal, temporal_visibility, and cluster globals.
  - Restore validates the manifest checksum, only accepts a labelled empty disposable target, and restores objects under the source runtime role.
  - Host entry points quiesce cf-app and cf-temporal, then restart only services they stopped and surface a restart failure.
  - Local proof restores sentinels and a harmless role, proves runtime-role read/write/delete access, measures durations, and cleans its own resources.
selected_docs:
  - AGENTS.md
  - deploy/production/docker-compose.yaml
  - docs/operations/production-deploy.md
  - docs/operations/runtime.md
  - .codex/stages/content-factory-next-l9s/plan.md
  - .codex/stages/content-factory-next-l9s/summary.md
selected_skills:
  - superpowers-test-driven-development
  - superpowers-systematic-debugging
  - technical-premortem
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none
parallel_group: wave4
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The disposable proof removed its uniquely named containers, network, volumes, and temporary artifact directory; the shared workspace has no stream-owned branch or commit.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - backup
  - recovery
  - deployment
  - data-integrity
affected_surfaces:
  - deployment
  - docker
  - postgres
  - operations-docs
invariants:
  - no-production-mutation
  - no-secret-logging
  - checksum-before-restore
  - disposable-target-only
docs_impact: ops-deploy-docs
docs_reviewed: yes
docs_review_notes: The runbook documents owner-only activation, exclusive schedule choices, planned writer downtime for a consistent point, restart failure behavior, restore ownership, empty-target barriers, retention, and local recovery proof.
verification:
  - 'TDD RED: pnpm exec jest tests/postgres-backup.contract.test.cjs --runInBand failed 5/5 because the backup scripts and deployment files did not yet exist.'
  - 'TDD GREEN: pnpm exec jest tests/postgres-backup.contract.test.cjs --runInBand passed 5/5.'
  - 'bash -n scripts/operations/postgres-backup.sh scripts/operations/postgres-backup-restore.sh scripts/operations/verify-postgres-backup-restore.sh deploy/production/backup/run-postgres-backup.sh passed.'
  - 'scripts/operations/verify-postgres-backup-restore.sh passed with postgres:17-alpine, PostgreSQL 17.10, dump 1s, restore 2s; three sentinels and cf_backup_proof_role were restored.'
  - 'The same proof ran an unlabelled-target negative case; restore rejected it before mutation. Docker queries after proof found no cf-postgres-backup-prefixed container, network, or volume.'
  - 'python3 scripts/docs/check_docs.py passed with 63 documentation files.'
  - 'git diff --check passed.'
  - 'Root acceptance: focused Jest passed 5/5, bash syntax passed, documentation links passed for 63 files, and the real disposable dump/restore proof independently passed on PostgreSQL 17.10 with dump 1s and restore 2s.'
  - 'Root cleanup acceptance: Docker container, network, and volume inventories for the cf-postgres-backup prefix were identical before and after the proof.'
  - 'Independent review rejected the initial implementation: restored objects were bootstrap-owned, labelled targets could contain unrelated data, and sequential dumps ran while product and Temporal writers were active.'
  - 'Review-fix TDD RED: expanded pnpm exec jest tests/postgres-backup.contract.test.cjs --runInBand failed 3 assertions for source-role restore, true emptiness, quiesce guard, writer lifecycle, and negative proof coverage.'
  - 'Review-fix GREEN: pnpm exec jest tests/postgres-backup.contract.test.cjs --runInBand passed 7/7.'
  - 'Review-fix disposable proof: postgres:17-alpine, PostgreSQL 17.10, dump 1s, restore 2s. It rejected an unquiesced dump before artifact publication, unlabelled restore target, and labelled target with an unrelated database and role; it then restored all three databases and verified source-role read plus write/delete access.'
  - 'Review-fix final checks: bash syntax, documentation links (63), git diff --check, artifact validation, and no proof-prefixed Docker resource after cleanup passed.'
  - 'Root re-acceptance after review fixes: current-tree Jest passed 7/7, bash syntax and 63-file docs links passed, artifact validation and diff check passed, and the full PostgreSQL 17.10 proof independently passed with dump 1s/restore 2s and unchanged proof-resource inventory.'
  - 'Final guard TDD RED: the exact focused contract failed one assertion because a target bootstrap role equal to source_user could collide during globals import; GREEN added an earlier refusal and the current contract passed 7/7.'
  - 'Fresh proof after the final guard passed: postgres:17-alpine PostgreSQL 17.10, dump 1s, restore 2s, followed by cleanup.'
changed_files:
  - scripts/operations/postgres-backup.sh
  - scripts/operations/postgres-backup-restore.sh
  - scripts/operations/verify-postgres-backup-restore.sh
  - deploy/production/backup/run-postgres-backup.sh
  - deploy/production/backup/content-factory-next-postgres-backup.service
  - deploy/production/backup/content-factory-next-postgres-backup.timer
  - deploy/production/backup/full_backup.sh.snippet
  - docs/operations/postgres-backup.md
  - docs/operations/production-deploy.md
  - tests/postgres-backup.contract.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-7g0.md
explicit_defers:
  - Owner action only: install repository files, insert the provided snippet into /root/full_backup.sh or enable the supplied systemd timer, and perform any production recovery on <боевой хост>.
---

# Summary

The repository now contains a PostgreSQL logical backup mechanism for the
production compose topology. It dumps `product.dump`, `temporal.dump`,
`temporal_visibility.dump`, and `globals.sql` into an atomic timestamped
artifact. `manifest.env` and every dump are in `checksums.sha256`; an error or
partial dump cannot be published.

Restore verifies checksums before consuming manifest values. It then accepts
only a Docker container explicitly labelled
`com.contentfactory.postgres-restore-target=disposable` that has no user
database and no non-built-in role besides its bootstrap role. `pg_restore`
runs through that bootstrap superuser under the recovered source role, so the
restored application and Temporal objects are usable by their runtime role.
The bootstrap role must also differ from the source role before globals import.

Every host-owned entry point requires both writers to be running, stops
`cf-app` and `cf-temporal` before the sequential logical dumps, and sets
`CF_BACKUP_QUIESCED=1`. Its EXIT handler restarts only services it marked before
stopping, verifies their running state, preserves a dump failure, and returns a
restart failure when the dump itself succeeded.

# Scope / Routing

Only the assigned operations scripts, backup deployment evidence, operations
documentation, focused contract test, and stage artifact changed. The host
integration is a wrapper, a `/root/full_backup.sh` insertion snippet, and a
not-yet-enabled systemd service/timer. No production or remote action occurred.

# Verification

The independent review returned three must-fix findings: bootstrap ownership
made a superuser-only proof insufficient, the empty-target check was too
narrow, and independent database dumps ran with writers active. The focused
contract first failed 3 new assertions, then passed 7/7 after the fixes.

The final local proof used the installed `postgres:17-alpine` image, which
reported PostgreSQL 17.10. It created unique temporary Docker resources, seeded
all three databases and a harmless role, proved that a dump without the
quiesce guard publishes no artifact, rejected unlabeled and labelled-dirty
targets before mutation, and restored into a separate empty labelled target.
The restored source role read each sentinel and inserted/deleted a probe from
each restored table. The measured run was dump 1 second and restore 2 seconds;
the proof removed all resources it created.

One final RED→GREEN guard was added after root acceptance: a target whose
bootstrap role equals the source role is now refused before globals import, so
`CREATE ROLE` or `ALTER ROLE` from the artifact cannot partially mutate it.

# Delivery / Cleanup

Returned to the root orchestrator without commit, push, deployment, host
installation, production access, secret wiring, or external call. The proof's
post-run Docker checks found no resources with its unique prefix.

# Known Limitation Of The Automated Coverage

Recorded on 2026-08-17 while closing `content-factory-next-egu`. The
verification list above is accurate about what was run; this section is about
what those runs can and cannot catch on a later change.

`tests/postgres-backup.contract.test.cjs` is a contract test. It reads the
scripts as text, asserts that the required commands, guards, and refusal
messages are present, and runs `bash -n`. It never executes them. It therefore
catches a deleted or renamed check and catches nothing about a check that
stopped working — a wrong argument order, an inverted condition, a refusal that
fires at the wrong moment.

That gap is now closed for `postgres-backup.sh` itself.
`tests/postgres-backup.execution.test.cjs` runs the script end to end with a
stub `docker` first on the child process's `PATH` and a backup root under the
OS temp directory. No daemon, no database, no host path; the `PATH` override
never reaches this process's environment, the workspace is removed afterwards,
and the suite skips rather than fails if it cannot create a temp root. It
drives the quiesce guard, a truncated and an empty `globals.sql`, a
`POSTGRES_DB` of `temporal` and of `temporal_visibility`, an empty archive, an
unreadable archive, the sweep of an abandoned `.partial.*` beside a live one,
and a full successful run whose published artifact is re-verified with
`sha256sum --check` from outside the script. Run against the pre-fix script it
fails 5 of 9 — including the truncated dump exiting 0, i.e. publishing itself,
and the `temporal` name failing as `sha256sum: temporal.dump: No such file or
directory`, exactly the unhelpful diagnostic the issue described.

The limitation that remains, narrowed again by `content-factory-next-o80`:
`postgres-backup-restore.sh` and `deploy/production/backup/run-postgres-backup.sh`
are no longer contract-tested only. Both are now executed against a stub
`docker` under the same rules, in
`tests/postgres-backup.restore.execution.test.cjs` and
`tests/postgres-backup.wrapper.execution.test.cjs`. What stays true is the part
that was always the real limit: a stub `docker` proves the script's logic around
`pg_dump`, `pg_restore` and `psql`, never those programs' own behaviour — not the
archive format, not `--exit-on-error`, not whether a restored role can actually
write. Restore behaviour is therefore still proven only by
`scripts/operations/verify-postgres-backup-restore.sh`, which needs docker, does
not run in CI, and is started by a person; any change to the restore script
still needs it run by hand, green suites or not.

The same close added the coverage that was missing on the Telegram side rather
than only recording it: `tests/telegram.update.consumer.test.cjs` now drives
`fenceLease` through a `$transaction` double that stages writes and discards
them on a rejected callback, and asserts the ordered call log. It proves the
fence runs first, inside the same transaction, on the transactional client, and
that a lost lease commits neither a receipt, an effect, a retry counter, nor a
write-off. What it still cannot model is PostgreSQL's row lock: only a real
database can show that a takeover blocks on the lease row. The pre-existing
clock-skew test was left in place with a comment saying what it actually
proves — the receipt's unique index, not the fence.

# Risks / Follow-ups / Explicit Defers

Installation and activation on `<боевой хост>` remain the explicit owner action.
The owner must select either the existing `/root/full_backup.sh` integration or
the supplied timer, never both. The scheduled logical backup intentionally
creates a brief writer outage to preserve the product/Temporal consistency
point. Recovery must first be tested against a newly created labelled empty
disposable PostgreSQL target.
