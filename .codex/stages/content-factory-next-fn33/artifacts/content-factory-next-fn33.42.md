---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-j-password-and-settings-tabs
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: settings screen
public_facade: n/a
bounded_acceptance: an internal /settings?tab=… link switches the panel without a page reload
non_goals:
  - writing the picked tab back into the address bar
evidence:
  - none
task_id: content-factory-next-fn33.42
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes 2026-09-04
milestone: settings tabs follow the address
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: small state fix, but it needed a rendering test to prove
repo: content-factory-next
branch: worktree-agent-a35d3874222a017e0
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a35d3874222a017e0
write_zone:
  - apps/frontend/src/components/layout/settings.component.tsx
  - tests/settings-tab-address.test.cjs
success_criteria:
  - «Сменить пароль» opens the sign-in methods panel in a live session
  - a tab picked with the tab strip is not undone by a re-render
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root to merge
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: internal navigation behaviour, no documented contract
verification:
  - "pnpm exec jest tests/settings-tab-address.test.cjs": passed
  - "pnpm exec jest tests/user-identity.settings.test.cjs tests/roles-matrix.guard.test.cjs tests/interface-review-settings-admin.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/layout/settings.component.tsx
  - tests/settings-tab-address.test.cjs
explicit_defers:
  - none
---

# Summary

The tab was read out of `?tab=` once, in the initial value of `useState`. Next
re-renders this screen instead of remounting it, so an internal link changed the
address and nothing else — every `/settings?tab=…` link on the screen was dead
in a live session while working perfectly on a fresh load.

A `useEffect` on `requestedTab` now re-applies the requested tab. A missing
`?tab=` is deliberately ignored rather than treated as «go back to the first
tab»: the tab strip changes state and never the address, so the person's own
choice must survive any re-render.

# Scope / Routing

Only this file, and only the tab-state lines — other streams are editing the
same screen elsewhere. No external documentation needed.

# Verification

`tests/settings-tab-address.test.cjs` renders the real screen in jsdom and
re-renders it with a changed `useSearchParams`. Red first: 4 of 5 tests failed
with the fix stashed (the fifth is the «picked by hand survives» rule, which the
old code already satisfied by accident of never syncing at all).

# Delivery / Cleanup

Returned on the stream branch. Nothing pushed.

# Risks / Follow-ups / Explicit Defers

The screen still does not write the picked tab into the address, so a tab chosen
by hand cannot be shared or reloaded. That is unchanged behaviour, not new debt
from this fix, but it is the natural next step if the owner asks for shareable
settings links.
