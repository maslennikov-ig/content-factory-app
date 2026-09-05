---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: application header
public_facade: LanguageComponent
bounded_acceptance: the header flag is a button named «Сменить язык», operable from the keyboard, and the window it opens is too
non_goals:
  - redesigning the language window
  - changing where the language choice is stored
evidence:
  - language-choice-frontend
task_id: content-factory-next-fn33.120
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: walker cleanup wave, language surface
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: contained component change against an existing primitive
repo: content-factory-next
branch: worktree-agent-aa87be6131f0092ac
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa87be6131f0092ac
write_zone:
  - apps/frontend/src/components/layout/language.component.tsx
  - tests/language-choice.frontend.test.cjs
success_criteria:
  - the header control exposes role button and the name «Сменить язык»
  - Enter and Space open the window natively, with no key handler
  - each language inside the window is a button and states whether it is current
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: walker-p3-cleanup
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state outside the worktree
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: reuses the shared Button primitive, no new authoring rule
verification:
  - pnpm exec jest tests/language-choice.frontend.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/raw-control.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/layout/language.component.tsx
  - tests/language-choice.frontend.test.cjs
explicit_defers:
  - none
---

# Summary

The header flag was a `div` with an `onClick`, sitting in a row of real
buttons: no keyboard could reach it, and a screen reader read only the flag's
`title` — the current language, never the action. It is now the shared `Button`
primitive, `variant="quiet"`, named by `t('change_language')`, with
`aria-haspopup="dialog"`.

The language tiles inside the window were the same `div`-with-`onClick`
pattern, so a keyboard that could finally open the window still could not
choose anything in it. They are now buttons on the same primitive
(`layout="content"`), and the current one says so through `aria-pressed`
instead of only wearing a border. Mantine's `Text` left with them.

# Scope / Routing

Write zone as assigned. Widened by one component inside the same file — the
tiles — because a control that opens an unusable window is half a fix; recorded
here rather than left silent.

# Verification

The three new tests were red before the change (no element with role `button`),
green after. Design, contrast, foundation and raw-control guards run green; the
raw-control ledger does not move, because the fix uses the primitive rather
than a native element.

# Delivery / Cleanup

Returned on the stream branch for the root to merge.

# Risks / Follow-ups / Explicit Defers

The tiles moved from the legacy `newTableHeader`/`newTableBorder` pair to the
`secondary` variant, so the window's plate colour changes slightly in both
themes. Assumption taken without the owner: the design system's own surface is
the correct paint for a tile in a modal.
