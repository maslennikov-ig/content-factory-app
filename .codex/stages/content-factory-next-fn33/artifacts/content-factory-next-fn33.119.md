---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: language picker
public_facade: getLanguageLabel
bounded_acceptance: Georgian is listed as `ქართული`; the Intl fallback still returns a label
non_goals:
  - changing which languages ship
  - touching the shared language menu component
evidence:
  - language-menu-guard
task_id: content-factory-next-fn33.119
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: walker cleanup wave, language surface
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: small, well-located behaviour fix with a written-down cause
repo: content-factory-next
branch: worktree-agent-aa87be6131f0092ac
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa87be6131f0092ac
write_zone:
  - apps/frontend/src/components/layout/language.presentation.ts
  - tests/language-menu.guard.test.cjs
success_criteria:
  - getLanguageLabel returns every written-out name unchanged
  - a language known only to Intl still arrives capitalised
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
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: behaviour matches the module's own documented intent; comment updated in place
verification:
  - pnpm exec jest tests/language-menu.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/layout/language.presentation.ts
  - tests/language-menu.guard.test.cjs
explicit_defers:
  - none
---

# Summary

`getLanguageLabel` raised the first letter of every language name, including the
sixteen written out in `NATIVE_LANGUAGE_NAMES`. Georgian has no title case, so
`ქართული` was displayed as `Ქართული` — a single mtavruli letter that reads as a
typo. A written-out name is now returned as written; the case rule stays on the
`Intl` fallback path, where a name really does arrive in prose form.

# Scope / Routing

Write zone as assigned. No documentation source was needed: the cause is stated
in the bead and confirmed in the module.

# Verification

New tests were red before the change (`ka` returned `Ქართული`, two failures),
green after. Guards for design, contrast, foundation and raw controls also run
green in the same worktree.

# Delivery / Cleanup

Returned on the stream branch for the root to merge.

# Risks / Follow-ups / Explicit Defers

None. A seventeenth language without a written-out name is still caught by the
existing guard.
