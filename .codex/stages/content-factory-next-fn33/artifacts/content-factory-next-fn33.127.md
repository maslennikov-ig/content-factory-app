---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: post window, screen reader
public_facade: PicksSocialsView label prop
bounded_acceptance: the channel section is named in the reader's language; the two arrows are reported, not changed
non_goals:
  - touching components/launches, which is outside the assigned write zone
  - translating the visible restriction message
evidence:
  - post-window-aria-language
task_id: content-factory-next-fn33.127
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: walker cleanup wave, accessible names
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: small change, but the write zone forced a delivery decision
repo: content-factory-next
branch: worktree-agent-aa87be6131f0092ac
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa87be6131f0092ac
write_zone:
  - apps/frontend/src/components/new-launch/picks.socials.component.tsx
  - tests/post-window-aria-language.test.cjs
success_criteria:
  - the channel section's accessible name comes from t('channels')
  - the interface-review stand, which has no translator, still gets an English name
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
docs_review_notes: follows the prop pattern the same view already uses for its restriction message
verification:
  - pnpm exec jest tests/post-window-aria-language.test.cjs: passed
  - pnpm exec jest tests/compose-channel-pick.test.cjs tests/desert-lab-screen-review.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/new-launch/picks.socials.component.tsx
  - tests/post-window-aria-language.test.cjs
explicit_defers:
  - content-factory-next-fn33.127 — «Move up» and «Move down» live in apps/frontend/src/components/launches/up.down.arrow.tsx, outside the assigned write zone; left for the owner of that path
---

# Summary

One of the bead's three names is fixed. The channel section's `aria-label` was
the literal `"Channels"`; it is now a `label` prop, defaulted to `Channels` and
filled by the connected component with `t('channels', 'Channels')` — the key
already exists in all sixteen locales, Russian «Каналы».

The prop rather than a `useT` inside the view: this same view is rendered by
the interface-review stand, which has no translation context, and by tests that
render it bare. The view already takes its restriction message that way, so
this is the pattern it already has, not a new one.

# Scope / Routing

«Move up» and «Move down» are hard-coded in
`apps/frontend/src/components/launches/up.down.arrow.tsx`. That path is not in
the assigned write zone — the zone names `new-launch/**` — so it was left
untouched, per the stream rules. The remaining work is two `aria-label` lines
plus two new keys in sixteen locales; the keys were deliberately not added
either, because a key with no caller would still cost an entry in
`tests/locale-untranslated-allowlist.json` for the eight non-Latin locales, and
that file is edited by parallel streams.

# Verification

The new test was red on both moving assertions before the change and is green
after. The existing picker tests (`compose-channel-pick`,
`desert-lab-screen-review`) stay green, including the stand's English default.

# Risks / Follow-ups / Explicit Defers

Two of three names are still English for a screen reader. Follow-up, one file:
`up.down.arrow.tsx` needs `useT` and `t('move_up', 'Move up')` /
`t('move_down', 'Move down')`, with the two keys added to the sixteen locales
and to the untranslated allowlist.
