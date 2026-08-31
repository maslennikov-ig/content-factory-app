---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave3-rcg.4
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root wave-3 acceptance
public_facade: @contentfactory/react/form Button, Select, and Textarea
bounded_acceptance: Every app-source raw button/select/textarea is either migrated to the shared form layer or named exactly in a shrink-only AST exception ledger.
non_goals:
  - New shared radio, tab, listbox, navigation, or provider-adapter primitives.
  - Product-flow redesign or external/browser validation.
evidence:
  - focused_jest
  - mutation_proof
  - frontend_typecheck
  - ast_ledger
task_id: content-factory-next-rcg.4
epic_id: content-factory-next-rcg
stage_id: content-factory-next-l9s
milestone: migrate raw shared form controls and add a shrink-only AST guard
milestone_status: accepted
agent_type: frontend_developer
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: Shared form-control contract changes and broad consumer migration require exact semantic reconciliation and AST-backed regression prevention.
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-3
base_branch: codex/2026-08-16-l9s-wave-3
base_commit: 00a2e4ca
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/react-shared-libraries/src/form/button.tsx
  - libraries/react-shared-libraries/src/form/select.tsx
  - libraries/react-shared-libraries/src/form/textarea.tsx
  - apps/frontend/src/**
  - tests/raw-control.guard.test.cjs
  - tests/raw-control-allowlist.json
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.4.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared workspace only. Both temporary guard mutations were restored; no branch, commit, runtime resource, or external state was created.
risk_level: medium
verification_tier: inner_loop
risk_tags:
  - frontend-form-contract
  - accessibility
  - ast-guard
  - stateful-control-migration
affected_surfaces:
  - shared-react-form
  - frontend-action-controls
  - controlled-select-and-textarea
  - raw-control-test-guard
invariants:
  - raw-control-count-reconciled
  - raw-control-ledger-shrinks-only
  - standalone-controls-do-not-register-with-rhf
  - icon-only-buttons-require-an-accessible-name
  - semantic-and-provider-boundaries-remain-native
docs_impact: structural/tests-only
docs_reviewed: no-change-needed
docs_review_notes: PRODUCT.md, DESIGN.md, component-authoring rules, and the interface specification already define the visual and accessibility contract. This migration changes implementation ownership and test enforcement, not a user-facing product or operational contract.
verification:
  - "TDD RED: pnpm exec jest tests/raw-control.guard.test.cjs --runInBand failed because tests/raw-control-allowlist.json did not exist."
  - "TDD GREEN: the AST guard passed after exact ledger and migration work; it parses TSX/JSX with installed @typescript-eslint/parser rather than scanning text."
  - "Mutation RED: a temporary raw button in oauth/authorize (which imports shared Button) failed with exact file/tag/count, actual total 40 versus allowed 39, and the shared-import violation; the mutation was removed."
  - "Stale-ledger RED: temporarily declaring admin-stats button count 2 and total 40 failed with the exact stale group; the ledger was restored."
  - "Shared-form TDD RED: the contract test reported 30 migrated Button variant/class conflicts; role classes were removed and intended primary, secondary, destructive, or quiet variants were selected."
  - "Shared-form GREEN: server-render contract proof passed explicit type/ARIA, loading accessible name, icon-only square geometry, standalone native controls, textarea ref/native typing, and the migrated-button role-conflict audit."
  - "Shared-button geometry RED: server rendering showed both inherited h-[40px]/px-[16px] and a caller h-[36px]/px-[12px] on the same button."
  - "Shared-button geometry GREEN: local unprefixed h/w/p token ownership now omits only conflicting shared defaults; the server-render proof covers normal and icon-only callers, preserves min-h, and AST-confirms every migrated Button reaches this shared contract."
  - "RTL geometry RED/GREEN: ps/pe initially synthesized a physical opposite padding class; the resolver now treats logical padding as caller-owned horizontal geometry and preserves only orthogonal icon padding defaults."
  - "Design guard ledger shrink: removed the two stale text-white file allowances made unnecessary by destructive variant ownership."
  - "Final focused Jest: source $HOME/.nvm/nvm.sh && nvm use --silent && pnpm exec jest tests/raw-control.guard.test.cjs tests/design.guard.test.cjs tests/shared-form-control.contract.test.cjs --runInBand passed (3 suites, 16 tests)."
  - "TypeScript: source $HOME/.nvm/nvm.sh && nvm use --silent && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json passed."
  - "Whitespace: git diff --check passed."
  - "Root integration inspection confirmed apps/frontend/tailwind.config.cjs scans ../../libraries/**/*.{ts,tsx,html}, including every new shared-control class."
  - "Raw scan moved from button=100/select=4/textarea=9 (113 total) to button=35/select=1/textarea=3 (39 total)."
  - "Ledger categories: semantic-special-case=21, third-party-adapter=13, intrinsic-primitive=5."
  - "Geometry: no app-source arbitrary-pixel class was added or removed by this migration, so tests/design-geometry-allowlist.json remains at its exact current debt total."
  - "Root acceptance RED: pnpm test found a stale duplicate text-white allowlist, a calendar preview assertion coupled to raw <button>, and a manage-modal accent-ink contrast failure."
  - "Acceptance-fix GREEN: foundation, desert-lab review, contrast, raw-control, shared-form, and design guards passed together (6 suites, 72 tests); the shared audit now reads literal clsx, conditional, and template branches."
  - "Independent-review RED: the variant audit skipped default-primary and legacy secondary Buttons, leaving four caller-owned color-role conflicts in add-provider, new-post, and analytics controls."
  - "Independent-review GREEN: the audit resolves absent variant to primary, conservatively checks both branches of dynamic legacy secondary, normalizes state/important prefixes, and ignores text layout utilities; focused fixtures and migrated callsites pass."
changed_files:
  - libraries/react-shared-libraries/src/form/button.tsx
  - libraries/react-shared-libraries/src/form/select.tsx
  - libraries/react-shared-libraries/src/form/textarea.tsx
  - apps/frontend/src/app/(app)/oauth/authorize/page.tsx
  - apps/frontend/src/components/admin/admin-errors.component.tsx
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/agents/agent.chat.tsx
  - apps/frontend/src/components/billing/faq.component.tsx
  - apps/frontend/src/components/billing/finish.trial.tsx
  - apps/frontend/src/components/developer/developer.component.tsx
  - apps/frontend/src/components/launches/add.provider.component.tsx
  - apps/frontend/src/components/launches/ai.image.tsx
  - apps/frontend/src/components/launches/bot.picture.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - apps/frontend/src/components/launches/comments/comment.component.tsx
  - apps/frontend/src/components/launches/helpers/linkedin.component.tsx
  - apps/frontend/src/components/launches/helpers/media.settings.component.tsx
  - apps/frontend/src/components/launches/import-debug-post.modal.tsx
  - apps/frontend/src/components/launches/launches.component.tsx
  - apps/frontend/src/components/launches/new.post.tsx
  - apps/frontend/src/components/launches/time.table.tsx
  - apps/frontend/src/components/launches/up.down.arrow.tsx
  - apps/frontend/src/components/layout/impersonate.tsx
  - apps/frontend/src/components/layout/logout.component.tsx
  - apps/frontend/src/components/layout/mode.component.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - apps/frontend/src/components/new-launch/delay.component.tsx
  - apps/frontend/src/components/new-launch/dummy.code.component.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - apps/frontend/src/components/new-layout/sidebar.tsx
  - apps/frontend/src/components/onboarding/onboarding.modal.tsx
  - apps/frontend/src/components/platform-analytics/render.analytics.tsx
  - apps/frontend/src/components/post-url-selector/post.url.selector.tsx
  - apps/frontend/src/components/preview/comments.components.tsx
  - apps/frontend/src/components/public-api/public.component.tsx
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - apps/frontend/src/components/settings/signatures.component.tsx
  - tests/raw-control.guard.test.cjs
  - tests/raw-control-allowlist.json
  - tests/design.guard.test.cjs
  - tests/foundation.test.cjs
  - tests/desert-lab-screen-review.test.cjs
  - tests/shared-form-control.contract.test.cjs
explicit_defers:
  - "content-factory-next-rcg.5 — 21 exact semantic-special-case raw controls remain in the ledger for shared choice-control primitives."
---

# Summary

The shared `Button` now has a typed `iconOnly` square mode (`20`, `28`, or
`32`) with a required accessible name, forwards refs, preserves its HTML
attributes/loading/variants, and keeps the existing label exposed to assistive
technology while loading. Its local geometry resolver retains caller-owned
unprefixed height, width, and padding classes without emitting conflicting
shared defaults; `min-h` and `min-w` are intentionally unaffected. Logical
`ps`/`pe` padding never synthesizes a physical opposite side. `Select` and
`Textarea` now have a controlled
`standalone` mode: no wrapper/error gutter, no React Hook Form registration,
and native refs/attributes remain available. `Textarea` now correctly uses
`TextareaHTMLAttributes`.

74 of the 113 surveyed raw app controls were migrated. The remaining 39 are
all represented by exact source-file/tag/count ledger entries: 21 semantic
choice/navigation cases, 13 provider or third-party adapter boundaries, and 5
intrinsic local primitive implementations. The former `migrate-now` groups
that remain native were reclassified only where current source establishes
choice semantics: admin range/tab selectors and three public-API selectors.
The durable follow-up for all 21 semantic groups is `content-factory-next-rcg.5`.

Root acceptance additionally reconciled the duplicate `text-white` shrinking
allowlist, preserved the calendar preview's keyboard-visible shared Button
proof, and moved managed-action icon colour ownership to the selected Button
variant. The contract audit now visits literal branches inside `clsx`,
conditional expressions, and templates; dynamic variables remain outside its
static reach.

Independent review also closed a default-variant blind spot: absent `variant`
is audited as primary, legacy `secondary` values cover their possible branches,
and state/important prefixes cannot conceal a caller-owned color role. The
affected cancel actions are secondary; create and refresh actions are primary.

# Verification

The AST guard's initial missing-ledger RED, its green result, the new-control
mutation RED, stale-ledger RED, and shared-button geometry RED/GREEN are
recorded in frontmatter. Final focused Jest passed the raw-control, design,
and shared-form contract suites, frontend TypeScript passed, and `git diff
--check` passed. The final AST scan is exactly `35 button`, `1
select`, and `3 textarea`, matching the ledger total of `39`.

After root's full-suite feedback, the exact affected foundation, desert-lab
screen review, contrast, raw-control, shared-form, and design guard suites
passed together (72 tests); frontend TypeScript and `git diff --check` also
passed.

After independent review, the same suite set was rerun with the strengthened
default/legacy-variant audit, plus frontend TypeScript and `git diff --check`.

# Risks / Follow-ups

The remaining native semantic controls need the dedicated
`content-factory-next-rcg.5` choice-control work before migration; replacing
them with an action button would alter keyboard
and selection behavior. Shared-library Tailwind classes depend on the existing
frontend content glob covering `libraries/**/*.{ts,tsx,html}`; typechecking
does not prove emitted CSS, so root integration/browser acceptance should
confirm the rendered icon-only and standalone variants. No geometry ledger
entry changed because the migration preserved existing app-source class values.
