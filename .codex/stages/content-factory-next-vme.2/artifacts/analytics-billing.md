---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.2/stage-manifest.json
stream_owner: subagent:analytics-billing
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance for content-factory-next-vme.2
public_facade: /interface-review/analytics-billing/[scene]
bounded_acceptance: production and audience analytics plus product-owned billing chrome on offline synthetic fixtures
non_goals:
  - Stripe CheckoutProvider or PaymentElement markup changes
  - provider metric invention or provider payload contract changes
  - billing lifetime claim flow
  - route pages, new-layout, launches statistics, shared fixture files, browser evidence, build, full suite, delivery, production, credentials, paid calls, or live connections
evidence:
  - focused-red-green
  - state-matrix
  - external-boundary
  - credential-isolation
task_id: content-factory-next-vme.2.analytics-billing
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.2
session_id: n/a
milestone: analytics platform analytics and billing chrome
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: inherited bounded implementation stream
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: dd68e15f
worktree: /tmp/cf-vme2
write_zone:
  - apps/frontend/src/components/analytics/**
  - apps/frontend/src/components/platform-analytics/**
  - apps/frontend/src/components/billing/**
  - apps/frontend/src/components/interface-review/analytics-billing/**
  - apps/frontend/src/app/(stand)/interface-review/analytics-billing/**
  - tests/interface-review-analytics-billing.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/analytics-billing/**
  - .codex/stages/content-factory-next-vme.2/artifacts/analytics-billing.md
success_criteria:
  - four independent synthetic scenes render the production View components
  - every scene covers the canonical data matrix or records a contract-backed exclusion
  - empty provider payload is explained without invented metrics
  - failed async analytics and billing loads resolve to recoverable error rather than endless loading
  - Stripe CheckoutProvider and PaymentElement stay in the production adapter and never mount in fixtures
  - four stable group-owned URLs resolve foundation state, theme, locale, and viewport query context
selected_docs:
  - AGENTS.md
  - docs/design/component-authoring-rules.md
  - .codex/stages/content-factory-next-vme.2/spec.md
  - .codex/stages/content-factory-next-vme.2/plan.md
  - apps/frontend/src/components/interface-review/fixture-contract.tsx
selected_skills:
  - graphify-project
  - impeccable
  - lazyweb existing stage evidence
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: analytics-billing
depends_on_streams:
  - safe-review-host
parallel_decision: shared-worktree write isolation defined by the stage manifest
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared isolated worktree retained for dependent streams; no child branch, server, browser, credential, external session, or temporary runtime resource required cleanup.
risk_level: medium
risk_tags:
  - ui
  - accessibility
  - billing-boundary
  - provider-contract
  - credential-isolation
affected_surfaces:
  - production-analytics
  - audience-analytics
  - billing-first-use
  - billing-manage
invariants:
  - canonical-nine-data-state-matrix
  - provider-payload-semantics-preserved
  - stripe-owned-markup-preserved
  - synthetic-data-only
docs_impact: stage evidence only
docs_reviewed: updated
docs_review_notes: Added the delegated-stream artifact and text-only evidence manifest; durable product and operator contracts were unchanged.
"credentials/live_calls": false
verification:
  - "Scene RED on Node 22.23.2: interface-review-analytics-billing failed because all four independent scene files were absent; foundation passed 10/10."
  - "Scene GREEN on Node 22.23.2: interface-review-fixture plus interface-review-analytics-billing passed 17/17."
  - "Async error RED on Node 22.23.2: the focused suite failed because production async state resolvers did not exist."
  - "Async error GREEN on Node 22.23.2: the analytics-billing suite passed 8/8 and proved failed or missing payloads become recoverable errors."
  - "Reachability RED on Node 22.23.2: the focused suite failed because the group-owned analytics-billing route was absent."
  - "Reachability GREEN on Node 22.23.2: all four stable URLs rendered query-controlled foundation context; fixture suites passed 23/23."
  - "Final affected suite on Node 22.23.2 passed 73/73: fixture, analytics-billing, choice-control, shared-form-control, and production analytics."
  - "Frontend TypeScript noEmit check passed after the concurrent foundation contract correction."
  - "Scoped git diff --check passed; new View, scene, and route files contain no hex, raw Tailwind palette, legacy customColor, or legacy named surface tokens."
  - "P1 geometry correction resolved review 7acdbd34-0f43-4d04-9ef6-560b52077419: all newly introduced 2px, 3px, 6px, 10px, and 18px values moved to the nearest documented rhythm while the adapter's pre-existing ledger-backed 3px/10px geometry stayed unchanged."
  - "Post-correction design guard passed 22/22, the focused analytics/billing suite passed 73/73, frontend TypeScript noEmit passed, and scoped git diff --check passed."
  - "ESLint was not accepted as evidence because repository configuration fails before linting with a circular JSON structure."
changed_files:
  - apps/frontend/src/components/platform-analytics/production.analytics.view.tsx
  - apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx
  - apps/frontend/src/components/platform-analytics/production.analytics.tsx
  - apps/frontend/src/components/platform-analytics/platform.analytics.tsx
  - apps/frontend/src/components/billing/billing-first-use.view.tsx
  - apps/frontend/src/components/billing/billing-manage.view.tsx
  - apps/frontend/src/components/billing/billing.component.tsx
  - apps/frontend/src/components/billing/first.billing.component.tsx
  - apps/frontend/src/components/billing/main.billing.component.tsx
  - apps/frontend/src/components/interface-review/analytics-billing/production-analytics.scene.tsx
  - apps/frontend/src/components/interface-review/analytics-billing/audience-analytics.scene.tsx
  - apps/frontend/src/components/interface-review/analytics-billing/billing-first-use.scene.tsx
  - apps/frontend/src/components/interface-review/analytics-billing/billing-manage.scene.tsx
  - apps/frontend/src/app/(stand)/interface-review/analytics-billing/[scene]/page.tsx
  - tests/interface-review-analytics-billing.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/analytics-billing/manifest.json
  - .codex/stages/content-factory-next-vme.2/artifacts/analytics-billing.md
completion_event: 08e5b2ab-8931-405f-8a6c-cd9ba2df302b
explicit_defers:
  - Root owns browser screenshots across light/dark, 1440/1024/768/390, and RU/EN query combinations.
  - The billing lifetime code-claim route remains outside s96 and this write zone.
  - Provider failures collapsed by the backend to an empty array remain indistinguishable; the View truthfully reports metrics unavailable and does not guess a cause.
---

# Summary

Production analytics, audience analytics, first-use billing and managed billing
now expose clean, plain-data View components. Runtime adapters retain SWR,
translation and choice/form controls; four frozen synthetic scenes render those
same Views through the common offline fixture contract. Stripe checkout is
passed only as an external production slot and is never mounted by a scene.

# State matrix and exclusions

- Production analytics supports loading, empty, default, selected, error and
  long-content. Success is excluded because the local computation is read-only;
  restricted because the endpoint has no surface-specific gate; disabled because
  the report has no disable-able action.
- Audience analytics supports loading, empty/unavailable, default, selected,
  error, disabled integration and long-content. Success and restricted are
  excluded because provider metrics are read-only and the endpoint has no
  surface-specific permission or billing gate.
- First-use billing supports every state except empty: the catalogue comes from
  static pricing. `{blocked:true}` is the real restricted contract; coupon
  application is the local success outcome.
- Managed billing supports every state except empty: a missing subscription is
  normalized to FREE. Restricted means Sections.ADMIN is required; current plan
  and pending mutations supply disabled behavior.

# Runtime boundaries

`CheckoutProvider`, `PaymentElement`, checkout confirmation and promotion-code
methods remain in `embedded.billing.tsx`. Scenes contain no Stripe object,
client secret, SWR, fetcher, callback, credential or external URL. Audience
metric labels and points are displayed as supplied; an empty payload produces
an unavailable explanation rather than zero or estimated KPI values.

# Verification

Three explicit RED/GREEN cycles covered scene existence/rendering, endless
loader resolution and route reachability. Final affected verification passed
73/73 on Node 22.23.2, frontend TypeScript passed, and scoped diff checking was
clean. The P1 rhythm correction then passed design guard 22/22, the same focused
suite 73/73, frontend TypeScript and scoped diff checking. Root затем повторил
fixture + analytics-billing 23/23, проверил routes, исключения и внешние границы
и принял поток. No browser, build, full suite, credentials, live calls,
screenshots, commit, merge, push, PR or deployment ran.

# Risks / Follow-ups

Browser matrix evidence remains root-owned. The backend currently maps several
provider failures to `[]`; the frontend deliberately does not infer which cause
occurred. ESLint remains unavailable because the repository config fails before
reading target files with a circular-structure error.
