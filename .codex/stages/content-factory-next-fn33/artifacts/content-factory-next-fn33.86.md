---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person choosing a platform to recut into
public_facade: the recut panel
bounded_acceptance: an unconnected platform is disabled and says why
non_goals:
  - connecting a channel
  - the server-side refusal, which stays
evidence:
  - none
task_id: content-factory-next-fn33.86
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: a platform with no channel is refused before the click
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
  - the rule mirrors ContentMaterialService.createDraft through PLATFORM_PROVIDERS
  - an empty channel list reads as «not asked yet», not «none anywhere»
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
  - pnpm exec jest tests/brand-voice.wiring-contract.test.cjs: passed (22)
changed_files:
  - apps/frontend/src/components/brand-voice/voice-materials.adapter.ts
  - apps/frontend/src/components/brand-voice/voice-materials.container.tsx
  - apps/frontend/src/components/brand-voice/voice-materials.screen.tsx
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
explicit_defers:
  - none
---

# Summary

All four platforms were offered alike, the preview behaved as though the choice had worked, and the refusal arrived only after «Открыть в редакторе». The screen now reads the same channel list the editor already loads and disables what the route would refuse.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/brand-voice.materials-tab.test.cjs: passed (24)
- pnpm exec jest tests/brand-voice.wiring-contract.test.cjs: passed (22)

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
