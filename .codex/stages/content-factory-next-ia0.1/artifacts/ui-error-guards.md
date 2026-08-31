---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0.1/stage-manifest.json
stream_owner: ui_error_guards
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner
public_facade: shared platform marks, Input primitive, calendar status UI, publishing error payload
bounded_acceptance: focused UI, error-ledger, design guard, contrast and foundation tests
non_goals:
  - landing-page design or conversion work
  - auth, layout or account creation
  - release acceptance and Beads closeout
evidence:
  - ui-error-guards-auth-blocker
task_id: content-factory-next-ia0.1.ui-error-guards
epic_id: content-factory-next-ia0.1
stage_id: content-factory-next-ia0.1
session_id: content-factory-next-ia0.1
milestone: UI error and guard audit repair
milestone_status: accepted
agent_type: frontend_specialist
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: bounded frontend implementation stream inherited the root model and reasoning policy
repo: content-factory-next
branch: codex/remaining-epic-acceptance
base_branch: unknown
base_commit: 80300ed6899490dca5e0f6ec82492bbc9776828e
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/frontend/public/icons/platforms/**
  - libraries/react-shared-libraries/src/platform/**
  - libraries/react-shared-libraries/src/form/input.tsx
  - libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts
  - apps/frontend/src/components/launches/calendar.tsx
  - focused UI, calendar, error-ledger and design tests
  - .codex/stages/content-factory-next-ia0.1/evidence/**
  - .codex/stages/content-factory-next-ia0.1/artifacts/ui-error-guards.md
success_criteria:
  - mastodon, devto and listmonk official vectors remain byte-identical and readable in dark theme
  - Input layout classes reach the outer flex child and standalone fields do not reserve an empty error gutter
  - calendar +N has an allowed accessible role and name
  - serialized Temporal cause.type survives safe error-ledger normalization
  - calendar error tooltip never renders serialized JSON
  - library colours, wider legacy aliases and named oversized radii cannot grow unnoticed
  - channel picker screenshot exists or its authenticated-route blocker is recorded honestly
selected_docs:
  - goal-objective.md
  - PRODUCT.md
  - DESIGN.md
  - docs/design/component-authoring-rules.md
  - ADR-0008
selected_skills:
  - impeccable
  - playwright
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: ia0.1-implementation-streams
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
orchestrator_acceptance_notes: root inspected the bounded UI/error diff, focused RED/GREEN and review-correction records, secret-safe calendar fallback, compatible Input field/control API, complete inherited-alias guard, unchanged-mark strategy, evidence blocker, cleanup, and durable YouTube provenance defer; accepted before the single release acceptance
cleanup_status: cleaned
cleanup_notes: shared worktree; no child branch or commit; accidental WSL `nul` diagnostic file was identified and removed, and no browser/runtime tail remained
risk_level: medium
risk_tags:
  - ui
  - accessibility
  - privacy
  - design-system
affected_surfaces:
  - ui
  - user-flow
  - backend-persistence-boundary
invariants:
  - trademark-integrity
  - error-privacy
  - test-matrix
docs_impact: evidence-only
docs_reviewed: no-change-needed
docs_review_notes: durable product direction is unchanged; this artifact records bounded behavior and browser evidence limits
verification:
  - "RED: TMPDIR=/tmp pnpm exec jest tests/shared-form-control.contract.test.cjs tests/platform.card.test.cjs tests/legacy-errors.retention.test.cjs tests/calendar.error-accessibility.test.cjs --runInBand — 4 suites failed, 5 assertions exposed the assigned defects"
  - "GREEN: same four-suite target — 4 suites, 67 tests passed"
  - "RED: TMPDIR=/tmp pnpm exec jest tests/design.guard.test.cjs --runInBand — 2 new blind-spot assertions failed"
  - "GREEN: same design guard target — 1 suite, 22 tests passed"
  - "FOCUSED ACCEPTANCE: TMPDIR=/tmp pnpm exec jest tests/calendar.error-accessibility.test.cjs tests/shared-form-control.contract.test.cjs tests/platform.card.test.cjs tests/legacy-errors.retention.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs --runInBand — 7 suites, 115 tests passed"
  - "CORRECTION RED: Node 22.23.2, pnpm 10.6.1, TMPDIR=/tmp pnpm exec jest tests/calendar.error-accessibility.test.cjs tests/shared-form-control.contract.test.cjs tests/design.guard.test.cjs --runInBand — 3 suites failed on plain secret exposure, fieldClassName compatibility, and incomplete legacy aliases"
  - "CORRECTION GREEN: same three-suite target — 3 suites, 43 tests passed"
  - git diff --check on stream-owned files passed
changed_files:
  - apps/frontend/src/components/billing/embedded.billing.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - apps/frontend/src/components/new-launch/delay.component.tsx
  - apps/frontend/src/components/new-launch/providers/instagram/instagram.audio.tsx
  - libraries/nestjs-libraries/src/database/prisma/errors/error-ledger.payload.ts
  - libraries/react-shared-libraries/src/form/input.tsx
  - libraries/react-shared-libraries/src/platform/platform.asset.ts
  - libraries/react-shared-libraries/src/platform/platform.badge.tsx
  - libraries/react-shared-libraries/src/platform/platform.card.tsx
  - tests/calendar.error-accessibility.test.cjs
  - tests/design.guard.test.cjs
  - tests/legacy-errors.retention.test.cjs
  - tests/platform.card.test.cjs
  - tests/shared-form-control.contract.test.cjs
  - .codex/stages/content-factory-next-ia0.1/evidence/ui-error-guards/README.md
  - .codex/stages/content-factory-next-ia0.1/artifacts/ui-error-guards.md
explicit_defers:
  - channel-picker screenshot: authenticated route redirects to /auth, no seeded local account exists, and no supported Windows Playwright runtime is installed
  - YouTube vector restoration: the existing SVG is cheap technically but lacks immutable exact primary provenance; mapping it would weaken the established trademark-source gate
completion_event: a3c5994a-f870-4a63-898a-42c1661fd711
---

# Summary

The three dark-fragile official vectors now sit on an adaptive neutral plate:
`cf-surface-raised` in light mode and `cf-ink` (the light foreground neutral)
in dark mode. Their SVG bytes and recorded digests are unchanged; Lemmy and
raster marks do not receive the special treatment. The existing YouTube SVG was
not promoted because repository history supplies no immutable primary-source
provenance.

`Input` keeps its historical `className` contract on the bordered control and
adds `fieldClassName` for outer layout. The coupon, Instagram audio and custom
delay rows migrate only their real `flex-1`/`w-full` layout classes; delay's
conditional accent border stays on the control. Standalone fields omit the
empty 16px error reserve but still show an explicitly supplied error. Form-owned
fields retain their reserved error line.

The calendar's translated `+N` remainder is an accessible named image. Calendar
error tooltips parse the bounded ledger JSON and show only `Unknown Error` or
`Publishing failed`; malformed or unexpected JSON falls back to a safe generic
message. Plain legacy strings are also exact-allowlisted to those two safe
messages, so arbitrary provider text or secret-bearing strings are never shown.

The error ledger now follows a serialized Temporal cause, preserving safe
`cause.type` and cause status metadata while continuing to discard request
bodies, credentials and raw provider detail.

The shared retention test also models migration-recovery's final array
`$transaction([...])` contract, without changing that stream's production
cleanup implementation.

# Verification

The focused RED/GREEN and correction commands are recorded in the artifact
header. They cover marks, Input compatibility, Calendar privacy/accessibility,
Temporal serialization, design guards, contrast and foundation contracts.

## Guard result

No existing allowlist line was added and the three existing shrink-only JSON
ledgers were not changed. A focused exact-count guard now covers shared-library
hex, white, custom aliases and every inherited colour key derived directly from
`tailwind.config.cjs` (including `newBgColorInner`, `newTableBorder` and
`btnPrimary`). Another exact count covers named `rounded-2xl`/`rounded-3xl`; the one inherited
`rounded-3xl` remains visible and any addition or removal forces the baseline to
be reviewed.

# Risks / Follow-ups

The remaining visual and asset risks have durable Beads successors
`content-factory-next-8e7` and `content-factory-next-6er`.

## Browser evidence

No screenshot is claimed. The only running Content Factory frontend belongs to
the old design worktree and redirects the channel route to `/auth`. There is no
seeded local account or supported Windows Playwright runtime. Details are in the
evidence README.
