---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave3-rcg.3
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: apps/frontend admin routes and the existing app-local surface facade
public_facade: @contentfactory/react/layout
bounded_acceptance: Shared PageShell, PageHeader, Panel, and a 4px-rhythm spacing scale compose both admin users and admin errors without a second app-local Panel/PageHeader implementation or conflicting panel-body padding utilities.
non_goals:
  - Raw-control migration or interaction redesign; this remains owned by rcg.4.
  - Changes to API, SWR state, permission behaviour, or admin routes.
  - A broad migration beyond the two proof consumers.
evidence:
  - focused_jest
  - mutation_proof
  - frontend_typecheck
  - geometry_ledger
task_id: content-factory-next-rcg.3
epic_id: content-factory-next-rcg
stage_id: content-factory-next-l9s
milestone: promote the surveyed shared layout primitives and prove them in admin consumers
milestone_status: accepted
agent_type: frontend_developer
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: Shared layout extraction across a compatibility facade and two production consumers requires careful geometry, accessibility, and type-contract preservation.
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-3
base_branch: codex/2026-08-16-l9s-wave-3
base_commit: 69e5a815
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/react-shared-libraries/src/layout/**
  - apps/frontend/src/components/ui/surface.tsx
  - apps/frontend/src/app/(app)/(site)/admin/users/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/errors/page.tsx
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/admin/admin-errors.component.tsx
  - tests/layout-primitives.test.cjs
  - tests/design-geometry-allowlist.json
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.3.md
success_criteria:
  - The recorded layout survey is reflected in the shared primitive set.
  - The shared library exports a page header, panel surface, PageShell, and explicit spacing scale through @contentfactory/react/layout, with a constrained single-padding Panel body contract.
  - The app-local Panel and PageHeader remain import-compatible through thin re-exports.
  - Admin users and errors use PageShell, PageHeader, and Panel as production proof consumers.
selected_docs:
  - AGENTS.md
  - PRODUCT.md
  - DESIGN.md
  - docs/design/component-authoring-rules.md
  - docs/design/content-factory-interface-specification.md
  - Bead content-factory-next-rcg.3
selected_skills:
  - superpowers:test-driven-development
  - superpowers:test-driven-development/writing-good-tests.md
  - impeccable
  - impeccable/reference/product.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared workspace only. The temporary PageShell-removal mutation was restored; no branch, commit, runtime, or external cleanup was created.
risk_level: medium
verification_tier: inner_loop
risk_tags:
  - frontend-layout
  - shared-component
  - compatibility-facade
  - geometry-invariant
affected_surfaces:
  - admin-users
  - admin-errors
  - shared-react-layout
invariants:
  - one-panel-and-page-header-implementation
  - all-shared-primitive-pixel-values-follow-the-4px-rhythm
  - page-shell-does-not-create-a-second-main-landmark
  - geometry-debt-ledger-only-shrinks
docs_impact: structural/tests-only
docs_reviewed: no-change-needed
docs_review_notes: Existing design contracts already define the 4px rhythm, surface hierarchy, typography, accessibility, and responsive behaviour. This extraction does not change a product or operational contract.
verification:
  - TDD RED: the new layout-primitives target failed because shared panel/header/shell files, thin re-exports, and both admin migrations did not exist.
  - TDD GREEN: pnpm exec jest tests/layout-primitives.test.cjs --runInBand passed 3 tests after the minimal shared implementation and migrations.
  - Mutation RED: temporarily replacing the admin-errors PageShell with div failed the migrated-screen proof on the missing PageShell render; the file was restored.
  - Follow-up TDD RED: the strengthened layout test failed because Panel had no contentPadding contract and both admin consumers supplied a conflicting p-[12px] contentClassName.
  - Follow-up GREEN: Panel now maps default, compact, and none through one static table; focused layout Jest passed 3 tests.
  - Follow-up mutation RED: temporarily removing contentPadding="compact" from admin-errors failed the compact-consumer proof; the file was restored.
  - Final focused Jest: source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/layout-primitives.test.cjs tests/design.guard.test.cjs --runInBand passed 2 suites and 12 tests.
  - TypeScript: pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json passed.
  - Format and whitespace: scoped Prettier check and git diff --check passed.
  - Geometry: exact source total, ledger sum, and declared total are all 1221. Only admin-errors.component.tsx changed in the ledger, with 13px shrinking from 7 to 6.
  - Tailwind configuration scans ../../libraries/**/*.{ts,tsx,html}, so shared primitive classes are included in frontend generation.
changed_files:
  - libraries/react-shared-libraries/src/layout/index.ts
  - libraries/react-shared-libraries/src/layout/page-header.tsx
  - libraries/react-shared-libraries/src/layout/page-shell.tsx
  - libraries/react-shared-libraries/src/layout/panel.tsx
  - libraries/react-shared-libraries/src/layout/spacing.ts
  - apps/frontend/src/components/ui/surface.tsx
  - apps/frontend/src/app/(app)/(site)/admin/users/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/errors/page.tsx
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/admin/admin-errors.component.tsx
  - tests/layout-primitives.test.cjs
  - tests/design-geometry-allowlist.json
explicit_defers:
  - rcg.4 owns raw button, input, select, and checkbox migration; their current semantics were not changed here.
---

# Summary

The survey recorded in `content-factory-next-rcg.3` found 280 component TSX files, 75 repeated surface-shell occurrences across 39 files, 34 header-band shapes across 21 files, four identical page shells, and spacing led by 16px (214), 8px (211), 12px (192), and 24px (70). The resulting smallest shared set is `PageShell`, `PageHeader`, `Panel`, and `layoutSpacing` with only documented 4px-rhythm values.

`apps/frontend/src/components/ui/surface.tsx` now retains existing app-local imports by re-exporting the shared `Panel` and `PageHeader`; it no longer owns a second implementation. `Panel` owns exactly one body-padding mode through `contentPadding: default | compact | none`; `contentClassName` is reserved for non-padding body classes. Both admin routes use `PageShell`, while their components use a level-one `PageHeader` and compact `Panel` around the existing filters. Data fetching, permissions, loading, empty/error paths, keyboard handling, and responsive wrapping remain on their original children.

# Verification

The first focused test run failed for the expected missing files and consumers. After implementation, the layout target and the design guard passed together (2 suites, 12 tests). Removing one migrated `PageShell` temporarily made the migrated-screen test fail; restoration returned the focused target to green. The root follow-up added a second RED/GREEN loop: the test rejected the former competing default and compact padding classes, and temporary removal of the errors panel's `contentPadding="compact"` failed the focused consumer proof.

`pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json`, scoped Prettier verification, and `git diff --check` passed. The Tailwind content scan includes `../../libraries/**/*.{ts,tsx,html}`, which covers the new shared classes. The exact off-rhythm geometry total reduced from 1222 to 1221, with the sole updated allowance `admin-errors.component.tsx: 13px 7 -> 6`.

# Risks / Follow-ups

The shared components depend on the existing Tailwind content glob; typechecking confirms module resolution but does not inspect generated CSS. Root-level integration or browser acceptance can confirm emitted shared-library classes in a running frontend. No raw-control semantics were migrated; rcg.4 remains responsible for that bounded follow-up.
