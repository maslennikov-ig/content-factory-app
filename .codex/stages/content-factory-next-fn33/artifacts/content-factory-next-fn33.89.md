---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person opening «Разбор» on a row of «Что уже написали»
public_facade: the grounding dialog of the archive
bounded_acceptance: a draft assembled from a brief that named facts from memory has a context snapshot, and «Разбор» lists those facts
non_goals:
  - the context builder itself
  - the archive layout
evidence:
  - none
task_id: content-factory-next-fn33.89
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: a brief draft remembers what it stood on
milestone_status: delivered
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: bounded fix with a focused red-green target
repo: content-factory-next
branch: worktree-agent-ac8079e5073a62a65
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ac8079e5073a62a65
write_zone:
  - apps/frontend/src/components/brand-voice
  - apps/frontend/src/components/content-intelligence (materials/archive/recut)
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice
  - libraries/nestjs-libraries/src/content-intelligence/materials
  - libraries/nestjs-libraries/src/content-intelligence/brief
  - apps/frontend/src/components/launches (calendar, menu, helpers)
  - apps/frontend/src/app/global.scss (calendar cell caption only)
  - apps/frontend/src/components/new-launch/editor.tsx (date format only)
  - tests, locales
success_criteria:
  - ContentPiece carries contentContextSnapshotId when the brief named facts
  - no snapshot is invented when the brief named none
  - a builder failure costs the provenance, never the draft
selected_docs:
  - none (local repository behavior only)
selected_skills:
  - none
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: fn33-wave-04-09
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for root to merge
risk_level: medium
risk_tags:
  - data
  - api
  - ui
affected_surfaces:
  - backend
  - data
  - ui
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: behavior matches docs/product/content-section-map.md and the voice specification; no decision changed
verification:
  - pnpm exec jest tests/content-brief.routes.test.cjs: passed (25)
  - pnpm exec jest tests/content-archive.screen.test.cjs: passed (6)
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.repository.ts
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - tests/content-brief.routes.test.cjs
explicit_defers:
  - none
---

# Summary

The brief wrote a `ContentPiece` with an empty `contentContextSnapshotId`, so «Разбор» answered a draft minutes old with a sentence about the product’s history. The draft path now builds a snapshot through the same builder every other writing path uses, and only when the brief actually named facts from memory — a snapshot built with no explicit ids is filled by word overlap and would name facts the text never used. The empty-state sentence was rewritten to say what is true of the row instead of guessing why.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/content-brief.routes.test.cjs: passed (25)
- pnpm exec jest tests/content-archive.screen.test.cjs: passed (6)
- pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
