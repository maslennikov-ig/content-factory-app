---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: a person opening «С чего начать» for the first time
public_facade: /onboarding page and GET /onboarding/progress
bounded_acceptance: all nine audit items answered, each with done or a stated reason
non_goals:
  - redrawing the walkthrough
  - a new button size or a new control height
  - touching the legacy channel-connecting modal beyond the invalid nesting
evidence:
  - onboarding-walkthrough-guard
  - onboarding-access
  - content-locale-single-decision-guard
  - design-guard
  - locale-key-set
  - locale-translated
  - frontend-typecheck
  - backend-typecheck
task_id: content-factory-next-za05
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: cleanup wave, stream B
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: nine small items across frontend, backend and sixteen locale bundles
repo: content-factory-next
branch: worktree-agent-a8e448f85ada45206
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4257143f6b05351118fe8c4ba0e9ffb06
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a8e448f85ada45206
write_zone:
  - apps/frontend/src/components/onboarding/**
  - libraries/nestjs-libraries/src/database/prisma/onboarding/**
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/*.cjs
  - tests/design-geometry-allowlist.json
success_criteria:
  - the progress bar states nothing before the workspace has answered
  - no interactive element is nested inside another
  - the voice step counts only the corpus the screens show
  - the dead locale keys are gone from all sixteen bundles
selected_docs:
  - DESIGN.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: scratch scripts live outside the worktree
risk_level: medium
risk_tags:
  - ui
  - user-flow
  - data
affected_surfaces:
  - ui
  - user-flow
  - backend
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no rule changed; the 44px touch floor DESIGN.md already states is now recorded as an unmet gap in the button primitive rather than worked around
verification:
  - "pnpm exec jest tests/onboarding-walkthrough.guard.test.cjs tests/onboarding-access.test.cjs tests/content-locale-single-decision.guard.test.cjs tests/content-section-tabs.boundary.guard.test.cjs: passed"
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed"
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed"
changed_files:
  - apps/frontend/src/components/onboarding/onboarding.copy.ts
  - apps/frontend/src/components/onboarding/onboarding.walkthrough.tsx
  - apps/frontend/src/components/onboarding/onboarding.modal.tsx
  - libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.repository.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/onboarding-walkthrough.guard.test.cjs
  - tests/onboarding-access.test.cjs
  - tests/design-geometry-allowlist.json
explicit_defers:
  - "the button primitive has no 44px touch target on mobile — root should open a bead against libraries/react-shared-libraries/src/form/button.tsx; not invented here"
---

# Summary

All nine items answered. Seven changed code, one was already fixed before this
stream started, one is a design-system gap recorded rather than papered over.

1. **Dead key `skipStep`.** Removed from the type and both languages. Nothing
   read it: the walkthrough has no skip, because a step you can dismiss without
   doing the work is the thing the walkthrough replaced.
2. **The eighth copy of the locale decision.** `resolveOnboardingLocale` now
   delegates to `resolveContentLocale` instead of respelling
   `String(language ?? 'ru').toLowerCase().startsWith('ru')`. The name stays —
   callers here ask for an onboarding locale — but the decision is made once.
3. **`?tab=voice`.** Already fixed before this stream, by
   `content-factory-next-fn33.107`: the map reads `?tab=avatars` and
   `?tab=brief`, both of which are in `CONTENT_TABS`. Verified against the tab
   list rather than taken on trust. No change.
4. **«Помощь → С чего начать».** The door is in Settings, so the sentence says
   Settings. Two strings in each language: the one that tells you how to come
   back, and the one on the all-done screen that said the page lives in the
   help menu.
5. **«0 из 6» before the server answered.** The bar now waits: until the first
   answer it prints «считаем…» / "counting…", carries `aria-busy` with no
   `aria-valuenow`, and no step is marked as the one you are on. An error still
   counts as an answer — the page already says in words that the ticks are
   missing. `EMPTY_PROGRESS` stays the reading default; the change is that not
   knowing is no longer printed as a fact about someone's workspace.
6. **A `<button>` inside an `<a>`**, in the walkthrough footer and in the
   modal's handover. Both are one anchor now, drawing `buttonClassName` — the
   branch the primitive already keeps for a control that has to stay a link.
   Nested interactive elements are invalid HTML and give a keyboard user two
   stops for one action.
7. **40/32 with no mobile 44.** The step's action link had spelled out the
   accent fill, the padding, the focus ring and a `min-h-[40px]` by hand; it
   now draws `buttonClassName({ variant: 'primary' })`, so the action scale
   comes from the primitive rather than from a second copy of it. The 44px
   touch floor is **not** solved: `Button` and `buttonClassName` offer 40 and
   32 and no touch wrapper, unlike `checkbox.field.tsx` and `toggle.tsx` which
   do have one. Inventing a third height at this call site is exactly what
   `DESIGN.md` forbids — «Высотой владеет общий primitive, а не его call site»
   — so the gap is recorded as design-system debt for the primitive instead.
   See the defer above.
8. **Dead locale keys.** Eleven, not five. The bead named
   `watch_tutorial{,_title,_description}` and `onboarding_step_plan/draft`, but
   `plan` and `draft` are two of a block of eight (`_plan`, `_plan_body`,
   `_draft`, `_draft_body`, `_review`, `_review_body`, `_publish`,
   `_publish_body`) describing the four paragraphs the walkthrough replaced.
   Every one was checked for use in `apps/` and `libraries/` and none is read.
   Removing two of eight would have left a half-deleted block that reads as
   deliberate. `onboarding_step_next` is alive and stays.
9. **The voice sample count.** It asked for every `BrandVoiceSample` row in the
   organisation — including soft-deleted ones, which every other reader skips,
   and `STYLE_REFERENCE` rows past their retention date, whose text
   `purgeExpiredReferences` erases in place while keeping the row so the corpus
   history stays readable. Either kind ticked the voice step for a workspace
   whose «Аватары» tab has nothing left to measure. Now
   `deletedAt: null, text: { not: '' }`.

# Scope / Routing

`tests/onboarding-access.test.cjs` had to change with item 8: it asserted that
`en.watch_tutorial` no longer says "watch". With the key deleted that assertion
would fail on `undefined` rather than pass more strongly, so it was rewritten
to the stronger statement — the eleven keys are absent from all sixteen
bundles, and `onboarding_step_next` is present in each.

`tests/design-geometry-allowlist.json` moved by one: the modal's handover
button gave up a hand-typed `text-[14px]` when it became an anchor drawing the
primitive. Totals recounted (1006 → 1005) and the reason written into the
ledger's own note, the way the earlier reductions there are.

Nothing was written outside the write zone. `i18n.lock` still holds checksums
for three of the removed keys; it is a lock for the external translation tool,
no test reads it, and it is not in this stream's zone — noted for root.

# Verification

- `tests/onboarding-walkthrough.guard.test.cjs` — two new tests for item 9,
  run against the real repository class with a fake Prisma that records the
  `where` it is handed. Red first: `Expected: {"not": ""} / Received:
  undefined` and `expect(where.deletedAt).toBeNull()` both failed on the
  unfixed repository. 14 passed after.
- Onboarding, locale-decision and tab-boundary guards: 9 suites, 91 passed.
- Design guard, contrast, foundation, locale key set, locale translated: all
  passed after the ledger update.
- `tsc --noEmit` on both `apps/frontend` and `apps/backend`: 0 errors.

# Delivery / Cleanup

One commit on the stream branch. Scratch scripts live outside the worktree.

# Risks / Follow-ups / Explicit Defers

- **Design-system debt (item 7).** `Button`/`buttonClassName` have no mobile
  touch target, while `DESIGN.md` requires 44px «там, где элемент используется
  на мобильном» and other primitives already provide it. This is one change in
  one primitive plus a sweep of what it moves; it is not a call-site fix and
  was deliberately not attempted here. Root should file it.
- Eleven keys left the bundles. If any deployment reads a translation bundle
  from somewhere other than this repository, it will simply fall back — nothing
  renders them.
- The removed `onboarding_step_*` block is the last trace of the four-paragraph
  screen. If anyone wants that text back it is in Git, not in the bundles.
