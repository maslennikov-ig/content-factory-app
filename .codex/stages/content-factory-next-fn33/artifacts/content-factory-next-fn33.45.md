---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person who collected samples and came back
public_facade: screen 01 of the voice wizard
bounded_acceptance: the corpus is named and there is a way back into it
non_goals:
  - the collection step itself
  - the analysis
evidence:
  - none
task_id: content-factory-next-fn33.45
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: a half-finished collection is said out loud
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
  - the numbers come from the overview’s own readiness, not a new route
  - «Продолжить сбор» lands on the collection step
  - a workspace that collected nothing is told nothing
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
  - pnpm exec jest tests/brand-voice.wizard.test.cjs: passed (29)
  - pnpm exec jest tests/brand-voice.wiring-contract.test.cjs: passed (22)
changed_files:
  - apps/frontend/src/components/brand-voice/voice-empty.screen.tsx
  - apps/frontend/src/components/brand-voice/voice-wizard.container.tsx
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - tests/brand-voice.wizard.test.cjs
explicit_defers:
  - none
---

# Summary

Eight saved samples were answered with «Аватара пока нет» and an invitation to start again, against the wizard’s own promise that samples are kept. No new route was needed: the overview already carries `readiness.sampleCount` and `readiness.charCount`.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/brand-voice.wizard.test.cjs: passed (29)
- pnpm exec jest tests/brand-voice.wiring-contract.test.cjs: passed (22)

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
