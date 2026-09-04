---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-N-translations-and-gaps
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: browser tab title on every app route
public_facade: apps/frontend/src/app/page-title.ts
bounded_acceptance: the tab title is rendered in the language of the request
non_goals:
  - translating the "· Content Factory" half (a product name)
  - auth/**, admin/**, oauth/** routes (other streams in this wave)
evidence:
  - none
task_id: content-factory-next-fn33.77
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-fixes-2026-09-04
milestone: translations and small gaps outside other streams' zones
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: one shared helper plus a mechanical rewrite of sixteen routes
repo: content-factory-next
branch: worktree-agent-a4c37b91494b5f279
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4c37b91494b5f279
write_zone:
  - apps/frontend/src/app/**
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - no app route under (site)/(preview) exports a static English title
  - every key a route asks for reads as Russian in the ru locale
selected_docs:
  - libraries/react-shared-libraries/src/translation/get.translation.service.backend.ts
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-N
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state left in the repository
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: no new door or action; only the name of an existing page
verification:
  - pnpm exec jest tests/page-title-language.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/app/page-title.ts
  - apps/frontend/src/app/(app)/(site)/*/page.tsx (13 routes)
  - apps/frontend/src/app/(app)/(site)/agents/layout.tsx
  - apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/page-title-language.test.cjs
explicit_defers:
  - the auth/**, admin/** and oauth/** routes keep their English titles; those directories belong to other streams in this wave and need a follow-up bead
---

# Summary

Every route exported a static `metadata` with an English `title`, and a static
export is evaluated once with no request in scope, so it can never know the
language: the tab said "Calendar · Content Factory" beside a fully Russian
page. Sixteen routes now export `generateMetadata = pageTitle(key, fallback)`,
one line each, and the shared helper resolves the title with `getT()` — the
same cookie and header the rendered page reads.

# Scope / Routing

A `generateMetadata` body copied into every route would be one decision retyped
sixteen times, so it lives in `apps/frontend/src/app/page-title.ts` beside the
existing `app/theme` helper. Eleven of the thirteen keys already existed
(`calendar`, `settings`, `integrations`, `media`, `billing`, …); only
`where_to_start`, `avatar` and `lifetime_deal` are new.

The "· Content Factory" half comes from the `template` in the root layout and
stays as it is: it is the product name.

# Verification

- `pnpm exec jest tests/page-title-language.test.cjs` — 5 passed. Red before the
  fix: 3 of 5 failed with the route and locale changes stashed.
- `pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs` — 5 passed.
- `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/roles-matrix.guard.test.cjs` — 93 passed.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 errors.

# Delivery / Cleanup

Committed on the stream branch, waiting for the root to merge.

# Risks / Follow-ups / Explicit Defers

The check was structural and type-level; no browser was opened, because the
stand's ports belong to the main copy. The behaviour rests on `generateMetadata`
being allowed to read `cookies()`/`headers()`, which is how the app layout
already resolves its language.

Deferred: `auth/**`, `admin/**` and `oauth/**` route titles. The test lists
those prefixes by name, so the omission is recorded rather than hidden, and it
will keep new routes elsewhere from regressing.
