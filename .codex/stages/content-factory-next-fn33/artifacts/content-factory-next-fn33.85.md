---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person refused a recut
public_facade: the notice above the material library
bounded_acceptance: the sentence is printed, the machine code is not, and the platform is named
non_goals:
  - the server’s own wording
  - error transport
evidence:
  - none
task_id: content-factory-next-fn33.85
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: a refusal in the reader’s words
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
  - failureNotice drops the code and translates a platform subject
  - the code stays on MaterialFailure for screens that branch on it
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
  - user-flow
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: behavior matches docs/product/content-section-map.md and the voice specification; no decision changed
verification:
  - pnpm exec jest tests/brand-voice.materials-tab.test.cjs: passed (24)
  - pnpm exec jest tests/brand-voice.brief-tab.test.cjs: passed
changed_files:
  - apps/frontend/src/components/brand-voice/voice-materials.adapter.ts
  - apps/frontend/src/components/brand-voice/voice-materials.container.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - tests/brand-voice.materials-tab.test.cjs
  - tests/brand-voice.brief-tab.test.cjs
explicit_defers:
  - none
---

# Summary

«MATERIAL_PLATFORM_UNSUPPORTED · … · vk» was three languages in one line, two of them ours. `failureNotice` is shared by the facts, leads, search, brief, materials and archive surfaces, so the change reaches all of them — deliberately, and the brief tab’s own expectation was updated with it.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/brand-voice.materials-tab.test.cjs: passed (24)
- pnpm exec jest tests/brand-voice.brief-tab.test.cjs: passed

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
