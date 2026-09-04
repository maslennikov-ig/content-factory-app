---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person whose avatar was filled in by hand
public_facade: the voice ribbon above the post form
bounded_acceptance: POST /voice/text-check answers 200 with a spoken silence
non_goals:
  - building a measurement for a hand-filled voice
evidence:
  - none
task_id: content-factory-next-fn33.70
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: «нечего сравнивать» is an answer, not a refusal
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
  - no invented numbers: total is 0, not eight of eight
  - the reason is NO_PROFILE and the hint is a sentence
  - the ribbon already renders summary and silenceHint
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
  - api
  - user-flow
affected_surfaces:
  - backend
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: behavior matches docs/product/content-section-map.md and the voice specification; no decision changed
verification:
  - pnpm exec jest tests/brand-voice.routes.test.cjs: passed (74)
  - pnpm exec jest tests/brand-voice tests/voice-eval: passed (1056)
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts
  - tests/brand-voice.routes.test.cjs
explicit_defers:
  - none
---

# Summary

The hand-filled path promises «Ничего не читаем и не разбираем», and the check answered 404 at every opening of the post window with advice that path’s own chooser cannot follow. The silence is now the contract’s own: `UNKNOWN` / `NO_PROFILE` with a `silenceHint`.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/brand-voice.routes.test.cjs: passed (74)
- pnpm exec jest tests/brand-voice tests/voice-eval: passed (1056)

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
