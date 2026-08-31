---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:content-intelligence-ui
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root-orchestrator
public_facade: settings tab and development-only interface-review scenes
bounded_acceptance: production brand/source/provenance settings with full state and accessibility coverage
non_goals:
  - backend-schema-module-registration-live-fetch-model-publish-deploy
evidence:
  - focused-red-green
  - frontend-typecheck
  - design-and-accessibility-guards
  - deterministic-local-browser-matrix
task_id: content-factory-next-9e9.content-intelligence-ui
stage_id: content-factory-next-9e9
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: feee9cc3
worktree: /tmp/cf-vme2
write_zone:
  - apps/frontend/src/components/content-intelligence
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence
  - tests/content-intelligence.interface.test.cjs
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui
  - .codex/stages/content-factory-next-9e9/artifacts/content-intelligence-ui.md
selected_skills:
  - impeccable
  - lazyweb
  - superpowers:test-driven-development
  - playwright
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Local browser session and port-4217 development server are closed; session snapshots/logs were removed and only selected stage evidence remains.
risk_level: medium
risk_tags:
  - accessibility
  - responsive-design
  - localization
  - api-contract
affected_surfaces:
  - frontend
  - settings
  - interface-review
invariants:
  - cf-design-tokens-only
  - ru-en-light-dark-responsive
  - no-fixture-network
  - visible-provenance-and-fallback
  - admin-only-mutations-member-readable
verification:
  - 'Initial RED: the focused target failed because the production view, adapter and review route did not exist.'
  - 'Correction RED: source/context adapter contracts failed on the missing pure adapter; all 27 scene-state cases failed before section-local rendering; focus fallback and draft-material mapping each failed before implementation.'
  - 'P1 round-2 RED: malformed contexts rendered READY, context GET and lifecycle helpers were absent, robots-disallowed sources could activate/sync, restricted provenance kept Inspect enabled, Retry landed on BODY, and real 390px controls measured 32/40px.'
  - 'GREEN focused Jest: tests/content-intelligence.interface.test.cjs passed 70/70.'
  - 'UI guard set: design guard, contrast, typography, foundation, choice-control, shared-form-control and user-identity settings passed 118/118.'
  - 'Frontend TypeScript: pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --pretty false passed.'
  - 'Browser: all three scenes × nine states returned 200; representative 390/768/1024/1440 RU/EN light/dark captures plus a 200% zoom proof are in the stage evidence directory.'
  - 'Browser hit targets: at 390px, sources passed 20/20 and brand passed 17/17 visible interactive boxes at >=44x44px; restricted provenance exposed no enabled Inspect; 1024px retained 32/40px desktop density.'
  - 'Browser isolation: Playwright reported no non-static request; expected development HMR websocket retries were blocked by connect-src none.'
  - 'Whitespace and artifact validation: scoped git diff --check and validate_artifact.py passed.'
changed_files:
  - apps/frontend/src/components/content-intelligence/brand.review-scene.tsx
  - apps/frontend/src/components/content-intelligence/content-intelligence.adapter.ts
  - apps/frontend/src/components/content-intelligence/content-intelligence.review-scenes.tsx
  - apps/frontend/src/components/content-intelligence/content-intelligence.settings.tsx
  - apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx
  - apps/frontend/src/components/content-intelligence/provenance.review-scene.tsx
  - apps/frontend/src/components/content-intelligence/sources.review-scene.tsx
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx
  - tests/content-intelligence.interface.test.cjs
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/README.md
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/brand-390-dark-ru.png
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/error-768-light-en.png
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/provenance-1440-dark-ru.png
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/provenance-390-light-en-restricted.png
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/sources-1024-light-en.png
  - .codex/stages/content-factory-next-9e9/evidence/content-intelligence-ui/sources-390-dark-ru-zoom-200.png
  - .codex/stages/content-factory-next-9e9/artifacts/content-intelligence-ui.md
explicit_defers:
  - manual-VoiceOver-or-NVDA-spoken-announcement-check
  - no-live-url-rss-fetch-model-call-publish-deploy-or-production-data
---

# Summary

Content intelligence is now a clear settings section with three connected,
user-visible boundaries:

- an organization-owned brand profile with an explicit applied version,
  neutral fallback, immutable published history and manual zero-model draft
  editing;
- a source registry with exact controller fields, separate rights confirmation,
  server-capability-driven Validate → Activate → Sync controls, freshness, RSS
  ownership diagnostics and preserved returned draft material;
- a production context inspector that calls the exact encoded GET endpoint,
  maps the canonical `content-context/v1` envelope,
  joins `facts.evidenceCitationIds` to the separate evidence array, names fact
  conflicts and rejected citations, and fails closed on `EVIDENCE_REQUIRED`.

The settings adapter uses SWR through `useFetch`. Exact source create and rights
DTOs, controller-shaped source/context mappers, and encoded endpoints live in a
pure executable local adapter. Context success is shown only after the server
response is strictly validated; malformed contracts, status/policy/error-code
inconsistency, and missing evidence citations fail closed. Mutations and reads
have section-local feedback, surface
success only after the server response and relevant cache refresh, and retain
controlled edits through `409`/`404` feedback. A per-section sequence fence
prevents an older async completion from overwriting a newer result. Returned
`source-draft-material/v1` evidence is retained and displayed instead of being
discarded. Membership role comes from the authenticated user context: members
keep read access while profile/source mutations are disabled and explained.

# Product and design decisions

The selected Lazyweb evidence is preserved at the stable private URL:
<https://www.lazyweb.com/agentic-search/41b95e71-68b0-4bbb-8df0-259a853dafac>.
It informed the sample-to-tone/manual voice structure, visible voice and
knowledge selection, and the Add URL/RSS status/schedule/ownership diagnostics.
It was used as product evidence, not copied visual styling.

Impeccable kept the surface inside the existing Desert Lab system: shared
fields/buttons, `cf` tokens, quiet dense rows instead of a wall of cards,
visible state labels with icons, no decorative shadow/gradient, and responsive
wrapping for long RU/EN content. The production surface contains no invented
success or synthetic data.

# State and accessibility contract

Each of the three review routes executes loading, empty, default, selected,
success, error, restricted, disabled and long-content from deeply frozen local
fixtures. It supports both themes, RU/EN and declared widths 1440/1024/768/390.
Labels are programmatically bound to controlled fields; navigation is native
in-page navigation; the actual links, buttons, inputs and selects have 44px
mobile targets while desktop density remains 32/40px. Error content
uses `role=alert`, success uses an `aria-live` status, and every state icon is
accompanied by text. Focus returns to the initiating control after async
completion, or to the section status when that control becomes disabled.

Read errors replace only the affected section, so stale data cannot look
current while unrelated settings remain usable. Mutation errors preserve the
section's controlled draft and context ID so users can correct and retry.

# Verification and evidence

Focused tests execute the pure production adapter and real view/route
components, not mock markup. They cover exact create/rights DTOs, controller
envelopes, all 27 scene-state combinations, server capability gates, returned
draft material, controlled-value retention, keyboard focus restoration,
neutral fallback, revision conflict, fact conflict, tombstoned evidence and
unknown-citation rejection, exact robots-policy lifecycle gates and context GET.

Browser evidence is indexed in
[`evidence/content-intelligence-ui/README.md`](../evidence/content-intelligence-ui/README.md).
The only browser-console errors were expected development HMR connections
rejected by the strict fixture CSP. The request log contained no non-static
request.

# Risks / Follow-ups

Production context inspection now uses the registered
`GET /content-intelligence/contexts/:id`; 404/error feedback stays local, keeps
the editable ID and restores focus without retaining a false successful
context. The source mapper expects the settled
`{sources, capabilities:{directFetch,validate,sync}}` envelope including the
visible `robotsState` policy gate. VoiceOver/NVDA were unavailable in this
environment, so spoken-announcement verification remains a manual P2 check.
No backend, schema, shared contract, other test, Beads state, dependency, credential,
external service, publish, deploy or production data was touched by this
stream.
