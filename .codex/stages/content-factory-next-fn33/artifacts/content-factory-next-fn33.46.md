---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person switching an avatar on
public_facade: the activation block of screen 05
bounded_acceptance: the name given at activation is the name the list shows
non_goals:
  - renaming, which stays in the row’s own menu
evidence:
  - none
task_id: content-factory-next-fn33.46
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: an avatar is asked for its name where it starts writing
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
  - both the hand-filled and the model paths ask
  - activation is blocked while the name is empty
  - a second activation never overwrites a name somebody already gave
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
  - api
affected_surfaces:
  - backend
  - ui
invariants:
  - tenancy
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: behavior matches docs/product/content-section-map.md and the voice specification; no decision changed
verification:
  - pnpm exec jest tests/brand-voice.routes.test.cjs: passed (74)
  - pnpm exec jest tests/brand-voice.wizard.test.cjs: passed (29)
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts
  - apps/frontend/src/components/brand-voice/voice-proposal.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-wizard.container.tsx
explicit_defers:
  - none
---

# Summary

Nothing on the way in asked, so an avatar arrived in the list as «Без имени» and the strip told its owner «тексты пишет Без имени». `avatarName` travels with the activation and is written only over an avatar that has none.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/brand-voice.routes.test.cjs: passed (74)
- pnpm exec jest tests/brand-voice.wizard.test.cjs: passed (29)

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
