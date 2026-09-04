---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-m
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: an administrator using the calendar from a keyboard
public_facade: the three-dot control in the channel column
bounded_acceptance: the trigger is a named button and the panel a role="menu"
non_goals:
  - the actions themselves
  - the language switcher in the header, which has the same defect elsewhere
evidence:
  - none
task_id: content-factory-next-fn33.91
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: the channel menu is a menu
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
  - Menu / MenuButton / MenuList from the shared primitive
  - each row is a menuitem on the shared control, not a div with onClick
  - the trigger has an accessible name from the dictionary
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
  - pnpm exec jest tests/calendar.reader-notation.test.cjs: passed (11)
  - pnpm exec jest tests/design.guard.test.cjs: passed (23)
changed_files:
  - apps/frontend/src/components/launches/menu/menu.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/design-geometry-allowlist.json
explicit_defers:
  - none
---

# Summary

The trigger was a bare `div` with an `onClick`: Tab never reached it, Enter never opened it, a screen reader had nothing to announce — over a menu that disables and deletes channels. `MenuOption` was not reused: it is `menuitemradio` and these are actions, so a local `MenuAction` renders `menuitem` on the same shared control and carries the same roving-tab-stop attribute `MenuList` looks for. Ten hand-typed 10px paddings left the geometry ledger with it.

# Scope / Routing

Write zone as listed above; no file outside it was touched except the sixteen
locale dictionaries, the design geometry ledger and this artifact. No external
documentation was needed: every decision here is a local repository behaviour.

# Verification

- pnpm exec jest tests/calendar.reader-notation.test.cjs: passed (11)
- pnpm exec jest tests/design.guard.test.cjs: passed (23)

Each new assertion was seen failing against the unfixed source before it passed.

# Delivery / Cleanup

Returned on `worktree-agent-ac8079e5073a62a65` for the root to merge into `wave/fixes-2026-09-04`.

# Risks / Follow-ups / Explicit Defers

None beyond the shared notes in the stream report.
