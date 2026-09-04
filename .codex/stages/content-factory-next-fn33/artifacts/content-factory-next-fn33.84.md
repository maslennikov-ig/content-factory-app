---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person who just recut a material
public_facade: the material row and the archive row
bounded_acceptance: a DRAFT derivation is counted and named on both views
non_goals:
  - the recut arithmetic
  - the editor
evidence:
  - none
task_id: content-factory-next-fn33.84
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: a recut version is visible where it was made
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
  - MaterialRowV1 carries draftCount and the service fills it
  - both the library table and the archive row print it
  - the provenance list says «Черновик» instead of a bare date
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
  - ui
  - api
affected_surfaces:
  - backend
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: behavior matches docs/product/content-section-map.md and the voice specification; no decision changed
verification:
  - pnpm exec jest tests/content-material.routes.test.cjs: passed (29)
  - pnpm exec jest tests/brand-voice.materials-tab.test.cjs: passed (24)
  - pnpm exec jest tests/content-archive.screen.test.cjs: passed (6)
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/materials/content-material.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
  - apps/frontend/src/components/brand-voice/voice-materials.screen.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.adapter.ts
explicit_defers:
  - none
---

# Summary

A recut writes a `DRAFT` derivation, and the library counted only `PUBLISHED` and `QUEUED`; five drafts existed in the database and nowhere on the screen. `draftCount` is its own number rather than a share of `postCount`: a text that went out and a text still in the editor are different facts about a piece.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/content-material.routes.test.cjs: passed (29)
- pnpm exec jest tests/brand-voice.materials-tab.test.cjs: passed (24)
- pnpm exec jest tests/content-archive.screen.test.cjs: passed (6)

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
