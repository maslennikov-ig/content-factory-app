---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-omx/stage-manifest.json
stream_owner: omx_frontend
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root
public_facade: n/a
bounded_acceptance: focused frontend RED-GREEN plus design guards
non_goals:
  - schema, API, backend register and integration seams
  - database execution, full build, full suite, deploy or external receiver
evidence:
  - none
task_id: content-factory-next-omx.frontend
epic_id: content-factory-next-omx
stage_id: content-factory-next-omx
session_id: n/a
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: frontend behavior and state-integrity stream assigned by root
repo: content-factory-next
branch: work/product-events
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-product-events
write_zone:
  - libraries/helpers/src/utils/use.fire.events.ts
  - apps/frontend/src/components/layout/check.payment.tsx
  - apps/frontend/src/components/billing/lifetime.deal.tsx
  - apps/frontend/src/components/admin/admin-product-events.component.tsx
  - apps/frontend/src/app/(app)/(site)/admin/product-events/page.tsx
  - apps/frontend/src/components/layout/impersonate.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/product-events.frontend.test.cjs
  - .codex/stages/content-factory-next-omx/artifacts/frontend.md
success_criteria:
  - first-party relative event delivery with privacy-limited payload
  - purchase and lifetime events only after confirmed success with stable deduplication
  - superadmin product-events report with activation-first hierarchy and complete states
  - semantic cf tokens, shared controls, keyboard/focus and responsive structure
  - complete native product-events copy in all 16 supported locales
selected_docs:
  - PRODUCT.md
  - DESIGN.md
  - docs/design/component-authoring-rules.md
  - .codex/stages/content-factory-next-omx/plan.md
  - .codex/stages/content-factory-next-omx/design-evidence.md
selected_skills:
  - superpowers:test-driven-development
  - impeccable
  - superpowers:systematic-debugging
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: content-factory-next-omx
depends_on_streams:
  - omx_backend API contract
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: accepted in shared worktree; no temporary files, process or external resource created
risk_level: medium
risk_tags:
  - authorization
  - state-transition
  - idempotency
  - ui
  - user-flow
  - api
affected_surfaces:
  - ui
  - user-flow
  - api
invariants:
  - state-transition
  - idempotency
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: stream implementation and fixed-reference comparison recorded here
verification:
  - 'RED: TMPDIR=/tmp pnpm exec jest tests/product-events.frontend.test.cjs --runInBand --coverage=false (Node 22.23.2)': 'failed as expected, 4 failed / 6 passed'
  - 'GREEN: TMPDIR=/tmp pnpm exec jest tests/product-events.frontend.test.cjs --runInBand --coverage=false (Node 22.23.2)': 'passed, 10 / 10'
  - 'CORRECTION RED: TMPDIR=/tmp pnpm exec jest tests/product-events.frontend.test.cjs --runInBand --coverage=false (Node 22.23.2)': 'failed as expected, 4 failed / 11 passed'
  - 'CORRECTION GREEN: TMPDIR=/tmp pnpm exec jest tests/product-events.frontend.test.cjs --runInBand --coverage=false (Node 22.23.2)': 'passed, 15 / 15'
  - 'LOCALE RED: TMPDIR=/tmp pnpm exec jest tests/branding.test.cjs --runInBand --coverage=false (Node 22.23.2)': 'failed as expected, 306 missing locale/key pairs reported by root'
  - 'LOCALE GREEN: TMPDIR=/tmp pnpm exec jest tests/branding.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/i18n.ui-literals.test.cjs tests/product-events.frontend.test.cjs --runInBand --coverage=false (Node 22.23.2)': 'passed, 35 / 35'
  - 'TMPDIR=/tmp pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/choice-control.contract.test.cjs --runInBand --coverage=false': 'passed, 61 / 61 after focused off-rhythm correction'
  - 'pnpm exec prettier --write <owned focused files>': passed
  - 'git diff --check -- <owned files>': passed
changed_files:
  - libraries/helpers/src/utils/use.fire.events.ts
  - apps/frontend/src/components/layout/check.payment.tsx
  - apps/frontend/src/components/billing/lifetime.deal.tsx
  - apps/frontend/src/components/admin/admin-product-events.component.tsx
  - apps/frontend/src/app/(app)/(site)/admin/product-events/page.tsx
  - apps/frontend/src/components/layout/impersonate.tsx
  - libraries/react-shared-libraries/src/translation/locales/ar/translation.json
  - libraries/react-shared-libraries/src/translation/locales/bn/translation.json
  - libraries/react-shared-libraries/src/translation/locales/de/translation.json
  - libraries/react-shared-libraries/src/translation/locales/en/translation.json
  - libraries/react-shared-libraries/src/translation/locales/es/translation.json
  - libraries/react-shared-libraries/src/translation/locales/fr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/he/translation.json
  - libraries/react-shared-libraries/src/translation/locales/it/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ja/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ka_ge/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ko/translation.json
  - libraries/react-shared-libraries/src/translation/locales/pt/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - libraries/react-shared-libraries/src/translation/locales/tr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/vi/translation.json
  - libraries/react-shared-libraries/src/translation/locales/zh/translation.json
  - tests/product-events.frontend.test.cjs
  - .codex/stages/content-factory-next-omx/artifacts/frontend.md
explicit_defers:
  - none
---

# Summary

`useFireEvents` now sends only `POST /product-events` with `name`, optional safe properties and a required deduplication key. It never supplies user or organization identity. The purchase seam fires only after `CheckPayment` returns `status === 2`, using the confirmed check identifier. The lifetime seam fires only after `success`, using `lifetime:<sha256(claim-code)>`; the raw code is not sent or stored in the event call.

The new `/admin/product-events` surface is superadmin-only. It asks the cohort activation question first, then shows exact count/latest-time rows for all four events and a feed explicitly labelled `Latest events (up to 50)` containing opaque IDs only. The period uses the shared keyboard-operable `RadioGroup`. Loading skeleton, empty, recoverable error/retry, access refusal and long-ID wrapping are explicit.

All 19 statically collected product-events strings and the three dynamic period labels now have dedicated translations in each of the 16 supported locales. Locale JSON remains key-parity complete; non-English locales do not use the English product-events copy as filler.

# Scope / Routing

The stream stayed inside the assigned frontend write zone and its root-approved locale expansion. It depends on the fixed backend response shape in the stage plan. No client calls were added for `register` or `channel_added`; those remain trusted server-side events. The initially named `apps/frontend/public/locales/**` path did not exist; the retained branding gate identified `libraries/react-shared-libraries/src/translation/locales/*/translation.json` as the authoritative 16-locale root, and root explicitly expanded the write zone to it.

Impeccable influenced the implementation toward one calm bordered working surface, section separators, restrained accent use, semantic `cf-*` colors, mono `cf-label-sm`/`cf-caption` for identifiers/dates/counts, mobile-first stacking, 44px mobile period targets and reduced-motion-safe loading.

# Verification

The exact RED failed for the intended missing behaviors: absent hook, no purchase event after status 2, no lifetime event after success and absent admin component. The same target then passed 10/10. Tests render real hook/components into jsdom and exercise success/failure transitions, payloads, access, SWR states, retry, response shape, shared radio semantics and long content.

The first design-guard run exposed seven new off-rhythm arbitrary pixel values. Root cause was confined to new row padding/micro-spacing and the navigation link. Replacing them with the established 4/8/12px rhythm made the same four-file design/foundation/choice target pass 61/61.

The retained locale RED reported 306 missing locale/key pairs. After adding the 19 statically collected keys plus all three dynamic period keys to every locale, the focused branding/parity/translation/UI-literal/frontend set passed 35/35.

Manual visual/browser verification was not run: this worktree has no started frontend/API process, and the concurrent backend stream owns the endpoint implementation. No database, server or external action was authorized. Root integration should visually exercise the report with the real endpoint at 390/768/1024/1440px, both themes and 200% zoom.

# Fixed Lazyweb Reference Comparison

Stable set: https://www.lazyweb.com/agentic-search/12991b9d-7210-46c8-9233-3563b1bc3ece

- Mixpanel `screens:50cc43d8d5884720b33163cc`: borrowed one explicit analysis object and a useful empty state. Rejected full-funnel semantics because the four events are not a proven ordered journey.
- Dub `screens:e18d93010d980b48c8ba3f67`: borrowed compact period context and a restrained data surface. Rejected an equal KPI-card wall and decorative switches.
- Calendly `screens:b503c11084cbdbac759625be`: borrowed period beside volume/popular-event detail. Rejected export/customization controls outside the admin question.
- Amplitude `screens:3acadd638824c564d9f534e0`: borrowed overview-to-precise-table hierarchy. Rejected query-builder complexity and excess navigation.

Final structural comparison: activation is first, event totals second, latest events (up to 50) last; the report is one panel with dividers rather than nested/equal cards. Period controls wrap, latest rows collapse to one column, long identifiers break safely, numeric columns are right-aligned/tabular, all state surfaces use semantic tokens, and motion is disabled under reduced-motion preference. A time-series trend is deliberately rejected for this slice: the accepted API has no faithful daily aggregation, so drawing one from a bounded latest-event feed would be misleading. A future trend requires a separate server aggregation contract and its own product scope.

# Delivery / Cleanup

Returned to root in the shared worktree. No commit, push, server, browser process, cache, temporary file or external receiver was created. Root owns acceptance and integration with the concurrent backend stream.

# Risks / Follow-ups / Explicit Defers

- Integration assumption: the backend implements the fixed `/product-events` and `/admin/product-events?from&to` contracts and bounds `recent` to at most 50 items. The UI makes that limit explicit; the contract was not exercised against a running server.
- Confirmed billing success remains user-visible even if the non-critical event request fails; event POST is idempotent, but no client retry queue was introduced in this scope.
- Visual checks at the required breakpoints/themes/zoom remain root integration work because no browser/API runtime was started.
- No accessibility regression was found in semantic structure, shared keyboard choice control, focus classes, table headings, status/alert announcements or long-content behavior; a live screen-reader pass was not performed.
- Locale uncertainty: translations were written directly for all supported languages and pass parity plus English-filler detection, but they did not receive an independent native-speaker editorial review in this stream.
