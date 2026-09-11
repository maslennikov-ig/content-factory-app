---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-xbfj/stage-manifest.json
stream_owner: root-durable-quota
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-xbfj.5
stage_id: content-factory-next-xbfj
repo: content-factory-next
branch: codex/review-tail-2026-09-11
base_branch: main
base_commit: f20b0f32
worktree: /home/me/code/content-factory-next-review-tail
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Durable work is intentionally deferred; no schema, database or migration resource was changed.
risk_level: medium
risk_tags:
  - quota
  - tariff
  - migration
  - tenant-isolation
affected_surfaces:
  - backend
  - data
  - billing
invariants:
  - process-local-counter-is-explicit
  - tariff-decision-before-schema
  - tenant-scoped-accounting
verification:
  - 'Focused web research tests prove explicit quick/standard/deep reservation and leave level-less callers unreserved.'
  - 'Beads content-factory-next-m0iy.9 is created under the research epic with a discovered-from dependency on content-factory-next-or3.9.'
  - 'No Prisma schema, migration SQL, database connection or db push was used.'
changed_files:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - tests/web.research.service.test.cjs
  - .codex/stages/content-factory-next-xbfj/artifacts/durable-quota-defer.md
explicit_defers:
  - Durable tenant and tariff accounting is deferred to content-factory-next-m0iy.9 until content-factory-next-or3.9 selects the economy.
  - The current in-memory counter is not represented as production-wide durable usage.
---
# Summary

The review-tail keeps the existing process-local quota service and makes its
boundary honest: only a caller that supplies an explicit research level reserves
quick, standard or deep capacity. This preserves the free legacy facts,
autopost and copilot paths while the paid research lanes remain opt-in.

The durable follow-up `content-factory-next-m0iy.9` is tied to the owner's
tariff decision `content-factory-next-or3.9`. It will define the tenant-scoped
period counter, failed-admission semantics and the migration/rollback proof in
a separate stage.

# Verification

The focused web-research contract passes the implicit and explicit reservation
cases. No schema or live database action was performed.

# Risks / Follow-ups

Until the tariff decision and a durable implementation land, multiple backend
processes can each hold their own in-memory counter. Release documentation and
the handoff call this out; they do not present the current counter as a billing
ledger.
