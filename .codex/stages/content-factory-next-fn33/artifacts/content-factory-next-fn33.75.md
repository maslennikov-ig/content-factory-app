---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-j-password-and-settings-tabs
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: settings screen
public_facade: n/a
bounded_acceptance: an unknown ?tab= name opens the first tab instead of an empty panel
non_goals:
  - an on-screen note naming the tab that does not exist
evidence:
  - none
task_id: content-factory-next-fn33.75
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes 2026-09-04
milestone: settings tabs follow the address
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: same file and same state as fn33.42, done in one pass
repo: content-factory-next
branch: worktree-agent-a35d3874222a017e0
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a35d3874222a017e0
write_zone:
  - apps/frontend/src/components/layout/settings.component.tsx
  - tests/settings-tab-address.test.cjs
success_criteria:
  - "/settings?tab=global and ?tab=content-intelligence open the profile tab"
  - the tab rail always shows exactly one selected tab
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
  - content-factory-next-fn33.42
parallel_decision: sequential
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
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/frontend/src/components/layout/settings.component.tsx
  - tests/settings-tab-address.test.cjs
explicit_defers:
  - none
---

# Summary

`SETTINGS_TABS` is now the list of names the screen can draw, and
`resolveSettingsTab` maps anything else onto the first of them. A stale or
hand-edited link opens Profile instead of leaving the rail unselected and the
panel empty.

The same function guards the tab strip, so nothing anywhere can put this screen
into a state it cannot draw. A test compares the list against every
`arr.push({ tab: … })` in the file in both directions, so a tab added later
without a matching name cannot slip past.

# Scope / Routing

The bead allowed either the first tab or an explanatory note. The first tab was
chosen: it makes the screen work rather than explaining why it does not, and a
note about a name the person never typed themselves (an old link, usually) has
little to say. **This is an assumption the owner may want to overturn** — it is
the one judgement call in this bead.

# Verification

Covered by `tests/settings-tab-address.test.cjs`, red before the fix.

# Delivery / Cleanup

Returned on the stream branch. Nothing pushed.

# Risks / Follow-ups / Explicit Defers

None. If the owner prefers a note, it is a small addition on top of the same
resolver.
