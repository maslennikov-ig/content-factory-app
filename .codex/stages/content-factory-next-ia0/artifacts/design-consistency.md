---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0/stage-manifest.json
stream_owner: design_consistency
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: Content Factory editorial UI
public_facade: existing cf primitives
bounded_acceptance: ten design consistency cards and focused guards
non_goals:
  - backend behavior
  - production account access
task_id: content-factory-next-ia0.design-consistency
epic_id: content-factory-next-ia0
stage_id: content-factory-next-ia0
session_id: content-factory-next-ia0
milestone: design consistency
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: frontend consistency stream
repo: content-factory-next
branch: codex/remaining-design-consistency
base_branch: codex/remaining-epic-coordination
base_commit: 07170871a4c6228e008d59319ac786a6171d66ee
worktree: /tmp/cf-ia0-design
write_zone:
  - design-ui-worktree
success_criteria:
  - ten scoped design cards delivered or explicitly bounded
  - shrink-only ledgers and focused guards remain honest
  - runnable route checked in both themes and control widths
selected_docs:
  - PRODUCT.md
  - DESIGN.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - impeccable
  - lazyweb
  - playwright
  - superpowers-test-driven-development
selected_agents:
  - none
catalog_candidates:
  - existing-cf-primitives
parallel_group: content-factory-next-ia0
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: The design worktree and thematic branch are retained as required local deliverables; deleting either needs separate user approval.
risk_level: high
risk_tags:
  - ui
  - user-flow
  - rollback
affected_surfaces:
  - ui
  - user-flow
invariants:
  - test-matrix
  - rollback
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: DESIGN, platform provenance, section-six bounds, and browser evidence were updated.
verification:
  - focused-red-green: passed
  - focused-design-and-form-guards: passed
  - frontend-typescript: passed
  - mobile-choice-hit-test-windows-chrome-390px: passed
  - browser-auth-route: passed
  - desert-screen-review: blocked-integration-context
changed_files:
  - .gitattributes
  - DESIGN.md
  - apps/frontend/src/components/admin/admin-product-events.component.tsx
  - apps/frontend/src/components/admin/admin-stats.component.tsx
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/auth/activate.tsx
  - apps/frontend/src/components/auth/forgot.tsx
  - apps/frontend/src/components/billing/embedded.billing.tsx
  - apps/frontend/src/components/developer/developer.component.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - apps/frontend/src/components/launches/generator/generator.tsx
  - apps/frontend/src/components/launches/helpers/media.settings.component.tsx
  - apps/frontend/src/components/launches/import-debug-post.modal.tsx
  - apps/frontend/src/components/launches/information.component.tsx
  - apps/frontend/src/components/launches/merge.post.tsx
  - apps/frontend/src/components/launches/new.post.tsx
  - apps/frontend/src/components/launches/separate.post.tsx
  - apps/frontend/src/components/launches/time.table.tsx
  - apps/frontend/src/components/layout/new-modal.tsx
  - apps/frontend/src/components/layout/support.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - apps/frontend/src/components/new-launch/delay.component.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - apps/frontend/src/components/new-launch/modal.wrapper.component.tsx
  - apps/frontend/src/components/new-launch/providers/high.order.provider.tsx
  - apps/frontend/src/components/new-launch/providers/instagram/instagram.audio.tsx
  - apps/frontend/src/components/new-launch/providers/instagram/instagram.collaborators.tsx
  - apps/frontend/src/components/new-launch/providers/linkedin/linkedin.provider.tsx
  - apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx
  - apps/frontend/src/components/new-launch/providers/x/x.provider.tsx
  - apps/frontend/src/components/new-launch/select.current.tsx
  - apps/frontend/src/components/post-url-selector/post.url.selector.tsx
  - apps/frontend/src/components/settings/teams.component.tsx
  - apps/frontend/src/components/settings/github.component.tsx
  - apps/frontend/src/components/videos/providers/image-text-slides.provider.tsx
  - docs/design/desert-lab/platform-card.md
  - docs/design/section-6-surface-review.md
  - libraries/react-shared-libraries/src/form/checkbox.tsx
  - libraries/react-shared-libraries/src/form/control-height.ts
  - libraries/react-shared-libraries/src/form/button.tsx
  - libraries/react-shared-libraries/src/form/input.tsx
  - libraries/react-shared-libraries/src/form/select.tsx
  - libraries/react-shared-libraries/src/form/textarea.tsx
  - libraries/react-shared-libraries/src/choice/control.button.tsx
  - libraries/react-shared-libraries/src/choice/radio.group.tsx
  - libraries/react-shared-libraries/src/platform/platform.badge.tsx
  - libraries/react-shared-libraries/src/platform/platform.asset.ts
  - libraries/react-shared-libraries/src/platform/platform.card.tsx
  - apps/frontend/public/icons/platforms/listmonk.svg
  - apps/frontend/public/icons/platforms/lemmy.svg
  - apps/frontend/public/icons/platforms/devto.svg
  - apps/frontend/public/icons/platforms/mastodon.svg
  - libraries/react-shared-libraries/src/form/slider.tsx
  - tests/desert-lab-screen-review.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - tests/design.guard.test.cjs
  - tests/raw-control-allowlist.json
  - tests/shared-form-control.contract.test.cjs
  - .codex/stages/content-factory-next-ia0/evidence/design-consistency/README.md
  - .codex/stages/content-factory-next-ia0/artifacts/design-consistency.md
explicit_defers:
  - section-six-analytics-and-provider-metrics-require-owned-backend-state
  - billing-checkout-is-stripe-owned
  - preview-and-extension-are-external-runtime-surfaces
  - retained-platform-rasters-lack-first-party-vector-provenance
  - calendar-runtime-route-needs-a-seeded-local-account
---

# Summary

Delivered all ten scoped design cards. Shared `PlatformBadge`, `CheckboxField`,
`Input`, `RadioGroup`, and `Button` now own the migrated UI behavior. Typography,
geometry, raw-control, raw-palette, legacy-alias, radius, and platform-mark
checks keep the remaining inherited debt explicit and shrink-only.

The combined review follow-up removed the global dense-button pseudo hit area.
Only dense `RadioOption` now expands its mobile hit area, and the primitive
reserves the matching 6px block margins so adjacent rows and wrapped lines do
not overlap. Dense menu options stay at their 32px visual and hit geometry.
The failing contract was observed before the fix; seven focused suites (95
tests), frontend TypeScript, and a 390px hit test in Windows Chrome passed. The
same TypeScript run exposed and closed two regressions introduced earlier in
this stream: an invalid ignored `size={40}` compatibility prop and a dropped
React Hook Form `register` binding.

# Scope / Routing

`nhq` follow-up: TypeScript JSX AST now follows imported `Button`, `Input`,
`Select`, `Textarea`, `RadioOption`, and `Tab` through arbitrarily long opening
tags. RED named the previously missed live consumers (including
`manage.modal` and `developer`); GREEN follows removal of their visual 30/34/
36/42/44/52px overrides. Only primitive-owned 40px and dense 32px remain.

`uck/g1d/5fn`: typography and palette ledgers shrink; a new named legacy colour
alias guard was shown RED against inherited occurrences, then GREEN after two
semantic-token migrations. `nhq`: DESIGN records primitive-owned 40/32px visual
heights and a 44px mobile hit area. `rgf`: the guard rejects product radii above
the documented 12px scale. `55n`: six manual channel treatments use
`PlatformBadge`; Calendar shows four marks and an accessible `+N` remainder.

`gur`: four approved platform SVGs are copied byte-for-byte from immutable
first-party commits and hash-checked in `platform.card.test.cjs`; every other
badge, including YouTube, retains its PNG. `platform-card.md` records the raw
URL, license, attribution and Mastodon trademark condition, then accounts for
every remaining PNG identifier exactly once with its authoritative source and
bounded current outcome (including login gates, community-only sources and
obsolete inherited `gmb`). One shared resolver is used by badge and card:
approved vectors render at 56px in the card, retained rasters at 48px in the
56px field, and YouTube stays PNG. `34r`: section-six inventory
uses only `deferred` or `migrated`, with no partial state. `3gn/8ix`:
legacy checkbox is deleted, remaining consumers use `CheckboxField`, and raw
native inputs decreased from 47 to 33; only range/file/primitive/third-party
boundaries remain with exact reasons in the ledger.

# Verification

- RED: `pnpm exec jest tests/design.guard.test.cjs --runInBand` first exposed
  named legacy aliases; RED: `pnpm exec jest tests/raw-control.guard.test.cjs
  --runInBand` exposed each stale raw-control count after migration; RED again
  named eleven live long-tag primitive height overrides via the TypeScript AST.
- GREEN: `pnpm exec jest tests/raw-control.guard.test.cjs tests/design.guard.test.cjs tests/foundation.test.cjs tests/shared-form-control.contract.test.cjs tests/design.typography.test.cjs tests/design.contrast.test.cjs --runInBand` — 6 suites, 67 tests passed after the height guard.
- RED: `pnpm exec jest tests/platform.card.test.cjs --runInBand` caught the
  unvetted YouTube SVG mapping and the four trailing-byte digest mismatches;
  GREEN: the same target passes 38 assertions after immutable downloads.
- RED: the broad shared-control contract exposed runtime height ownership;
  GREEN: `tests/shared-form-control.contract.test.cjs` proves normal,
  important and responsive/state `h-*`/`min-h-*`/`max-h-*` are removed while
  non-height classes survive. `density` now owns 32/40px, and card/content
  geometry lives inside the primitive.
- `git diff --check` passed before each delivery commit.
- `git diff --check aa773fd8...HEAD` passes with a path-scoped
  `whitespace=-blank-at-eof` exception for the immutable Mastodon SVG; its
  SHA-256 remains `e92184e36e3bba38ee406bba10e7a85eab9f9b2a55dcb5725394f7db49151abc`.
- RED→GREEN: `design.guard` now scans app and shared-library JSX for imported
  shared controls, aliased local names, simple class bindings, Tailwind
  size/height utilities and inline style height/block-size properties;
  `shared-form-control` proves dense controls keep a 32px visual body and a
  primitive-owned 44px mobile envelope. Product Events uses 12px row gaps so
  neighbouring envelopes cannot overlap.
- P2 follow-up GREEN: alias and relative-import AST paths, simple class
  bindings, `size-*`, arbitrary height and inline height/block-size styles are
  rejected or sanitized by the shared controls.
- Final guard proof uses one AST scanner for both the live tree and synthetic
  fixtures. A deliberate alias-resolution regression made the fixture fail on
  the exact missing `SharedButton` lines; after restoring the production path,
  both focused suites passed 39 tests. The same runtime test now covers CSS
  arbitrary `min/max-height` and `min/max-block-size` spellings.
- Local Playwright evidence covers `/auth` only: dark at 1440/1024/768/390;
  light at 1440/768/390; plus keyboard focus, long RU/EN input values, and 200%
  zoom where listed in the evidence README. Audit correction: the purported
  light 1024 capture is withdrawn because it is a 390x844 byte-identical copy
  of the dark long-English capture. No authenticated screen is claimed.
- Audit repair: `pnpm exec jest tests/desert-lab-screen-review.test.cjs
  --runInBand` now passes 53/53 on the acceptance branch. Its durable branch
  assertion checks `main` without depending on the current feature checkout or
  detached-HEAD state.

# Delivery / Cleanup

Returned for root integration after the P2 touch-target and bypass guard
corrections. The latest delegated completion event is
`c2736a40-e16d-4ddd-8712-b76a3b6d9f31`; it supersedes
completion events
`8d8696bf-85ff-429e-add3-01fd3a2185db` and
`dc769277-48a5-4ab8-9922-a837f742912f` and
`42af7d1e-48cf-4021-aaa2-784e675c0bbd` and
`3259c811-091b-41e3-b30f-7893a91661b3` and
`d4d20cb8-7db8-4007-9cef-0fd5590c6b35` and
`b735b572-97e1-46a4-b020-765dc14e43ae` and
`b5f7ed3a-b0f1-4a25-9d70-266cea2516a7`. Cleanup is pending; screenshots are
tracked, public-safe, and enumerated in the evidence manifest.

Root completed the final single-scanner fixture correction in the same design
branch after the delegated turn reached its safe limit; no scope or delivery
boundary changed.

# Risks / Follow-ups

The section-six and raster decisions are bounded defers, not silent debt:
their owners and causes are in `docs/design/section-6-surface-review.md` and
`docs/design/desert-lab/platform-card.md`. The local app route cannot exercise
authenticated Calendar data without a seeded account; source review verifies
its four-mark and `+N` behavior but is not browser evidence. Successor Beads
created by the audit repair own the remaining section-six, palette and alias
work.
