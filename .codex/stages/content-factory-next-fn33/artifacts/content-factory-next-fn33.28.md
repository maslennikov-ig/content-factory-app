---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream_e_style_and_copy
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: the post composer window
public_facade: i18next catalogue, launch store initial state
bounded_acceptance: the four assigned quick fixes land without touching the design stage the root owns
non_goals:
  - the design pass on the composer window (root, via /design)
  - bead points (6) voice ribbon and (7) "Research current draft" — they go to design
  - channel selection logic, picks.socials, the store beyond the stage default
task_id: content-factory-next-fn33.28
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: the composer says what it means
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: several small changes across copy, a product default and a panel rewrite
repo: content-factory-next
branch: worktree-agent-ad9dddf6377b4a572
base_branch: main
base_commit: 1fcb1c99
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad9dddf6377b4a572
write_zone:
  - apps/frontend/src/components/new-launch/manage.modal.tsx (button caption only)
  - apps/frontend/src/components/launches/general.preview.component.tsx
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - apps/frontend/src/components/new-launch/editor.tsx (context panel)
  - apps/frontend/src/components/new-launch/store.ts (stage default only)
  - libraries/react-shared-libraries/src/translation/locales/**
  - docs/product/content-section-map.md
success_criteria:
  - the disabled action button names the action, not the furniture
  - no English literal left in the preview header
  - a new post opens on PLAN; an existing post without a stage keeps none
  - the context panel shows words and a user-format date, technical strings behind a disclosure
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
  - docs/product/content-section-map.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-stream-e
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: branch left for the root to integrate
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: "docs/product/content-section-map.md §9 point 1 records the owner's 04.09.2026 decision on the default stage"
verification:
  - "pnpm exec jest tests/content-intelligence.consumer-frontend.test.cjs (before the panel change): 2 failed as designed, printing the old 'Context status: READY · VALID' and the ISO timestamp"
  - "pnpm exec jest tests/content-intelligence.consumer-frontend.test.cjs: passed (11)"
  - "pnpm exec jest tests/editorial-stage: passed (34)"
  - "pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/i18n.ui-literals.test.cjs tests/design.*: passed (66)"
  - "pnpm exec jest (ten suites reading the changed files): passed (238)"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed"
changed_files:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/launches/general.preview.component.tsx
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/components/new-launch/store.ts
  - docs/product/content-section-map.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/content-intelligence.consumer-frontend.test.cjs
  - tests/editorial-stage.editor-wiring.test.cjs
explicit_defers:
  - "bead point (4): the tags control and the stage field are not one primitive. The fix is in launches/tags.component.tsx, outside the assigned write zone — see below."
  - "bead points (6) and (7): assigned to the design stage."
---

# Summary

(1) The composer's disabled action button read "Check the circles above". It
named a shape on the screen and left out the reason, and it was the first thing
a new member saw. It now reads "Pick a channel" in all sixteen catalogues. The
key was renamed with it: `check_circles_above` described the old sentence, and a
key that lies is the next author's trap.

(2) "Global Edit" in the preview header was the one literal in that component
that never reached the catalogue. It is now `preview_all_channels` — "All
channels" / «Все каналы», which is what the globe tab beside it means.

(3) A new post opens on `PLAN`. Owner's decision, recorded in
`docs/product/content-section-map.md` §9 point 1. An existing post is unchanged:
`add.edit.modal.tsx` writes the stored value — including none — over the initial
one, and "no stage recorded" stays selectable for a post given a stage by
mistake.

(5) The "verified context" panel printed `Context status: UNAVAILABLE` and
`2026-08-21T10:00:00.000Z` in monospace, above the writing area. Both are how a
server describes itself. Each of the five statuses now has a sentence in the
catalogue, the freshness date is written through the same `isUSCitizen` switch
the calendar and the date picker use, and the brand-profile identifier, the
expiry and the "checked" flag moved into a native `<details>` disclosure. Native
because the browser already owns the button role, the expanded state and
Enter/Space, and the product has no disclosure primitive to reuse — inventing
one here is what the authoring rules forbid.

The now-dead `context_status` key was removed from all sixteen catalogues.

# Scope / Routing

Documentation: no external or version-sensitive behaviour, so no `docs-resolve`
call. `dayjs` is already the repository's date library and the format string is
copied from `launches/helpers/date.picker.tsx`, not invented.

Two test files outside the stated write zone were changed, both of them the
tests for the surfaces this bead changes:

- `tests/editorial-stage.editor-wiring.test.cjs` pinned `editorialStage: null`
  as the store's initial value. That is exactly the behaviour the owner
  reversed, so the assertion was rewritten to pin `PLAN` and the reason was
  written into the test.
- `tests/content-intelligence.consumer-frontend.test.cjs` compiles the context
  panel in isolation with stubs for `useT` and `useVariables`. The panel now
  needs `dayjs` and `isUSCitizen`, so the stub preamble gained both, with
  `isUSCitizen` pinned false — there is no `localStorage` under Node. Four
  assertions were added for the new behaviour.

# Verification

See the `verification` block. The panel assertions were shown red against the
unmodified `editor.tsx` (stashed, run, restored) before being made green.

# Delivery / Cleanup

Committed on `worktree-agent-ad9dddf6377b4a572` as `226d9114`. Not pushed, not
merged.

# Risks / Follow-ups / Explicit Defers

- **Point (4) not done, and it needs a decision.** The two controls in that row
  are not "two hand-rolled controls": the stage is already the shared `Select`,
  and the tags control is a hand-rolled `div` popover in
  `apps/frontend/src/components/launches/tags.component.tsx` — 44px against the
  primitive's 40px, its own border, its own open state, and no role, no keyboard
  and no focus management at all. Bringing it to one primitive means rebuilding
  it on the choice family (`Menu`), which is a behaviour change and a file
  outside this stream's write zone. Left for a bead of its own.
- The new design guard does not see that control: it paints the accent on the
  wrapper while the `onClick` sits on a child. Named here so it is not mistaken
  for a clean bill of health.
- "All channels" for `Global Edit` is a wording choice, not a translation. If
  the owner meant the mode rather than its reach, the key is one line.
