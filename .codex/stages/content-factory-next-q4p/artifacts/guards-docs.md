---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-q4p/stage-manifest.json
stream_owner: guards-docs
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner for content-factory-next-q4p
public_facade: public SaaS copy, AI usage settings copy, public-claim guard, and durable SaaS product contract
bounded_acceptance: exact undecided claims are rejected, public and AI copy use shared translations across all shipped locales, and R6/R14 wording is corrected
non_goals:
  - public-shell, protected landing files, route behavior, provider execution, usage persistence, telemetry implementation, schema, pricing, legal claims, or deployment
  - per-provider-call spend accounting, sizing, or reconciliation
  - browser, build, broad suite, Beads mutation, Git delivery, or external/live action
evidence:
  - focused-tests
  - locale-inventory
  - owned-diff-check
task_id: content-factory-next-q4p.4
epic_id: content-factory-next-q4p
stage_id: content-factory-next-q4p
session_id: n/a
milestone: claims guard, complete locale ownership, demo persistence wording, and operation-counter semantics
milestone_status: accepted
agent_type: frontend_specialist
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: bounded frontend localization and public-contract repair assigned by root
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - PRODUCT.md
  - docs/product/cloud-saas-growth-spec.md
  - apps/frontend/src/components/public-saas/public-copy.ts
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/cloud-saas-contract.test.cjs
  - tests/public-saas-demo.test.cjs
  - tests/ai.provider.component.test.cjs
  - tests/locale-key-set.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/guards-docs.md
success_criteria:
  - exact free tier, Start for free, Бесплатный тариф, and Pricing from $19/mo claims are rejected without publishing pricing
  - public-copy and AI usage-mode copy resolve through useT without a hardcoded RU/EN or silent English fallback
  - all 16 shipped locales own 59 public SaaS keys, including signIn, and 7 AI usage keys; the existing AI description key is also localized for the new mode choice
  - synthetic demo state remains local while the spec admits allowlisted growth events can persist through the backend to PostgreSQL
  - included quota is documented as a counter of admitted product-operation attempts, with failed and incomplete attempts consuming allowance, not a provider-call or spend cap
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-q4p/spec.md
  - .codex/stages/content-factory-next-q4p/plan.md
  - .codex/stages/content-factory-next-q4p/stage-manifest.json
  - graphify-out/GRAPH_REPORT.md
  - docs/design/component-authoring-rules.md
  - PRODUCT.md
  - DESIGN.md
  - docs/product/cloud-saas-growth-spec.md
selected_skills:
  - impeccable
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: content-factory-next-q4p-writers
depends_on_streams:
  - content-factory-next-q4p.3 AI usage-mode component changes and delegated R6 durable wording
parallel_decision: shared worktree with manifest-owned file isolation; public-shell remained routing-owned
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; no server, browser, temporary worktree, external account, persistent runtime, or temporary file was created
risk_level: medium
verification_tier: inner
risk_tags:
  - localization
  - public-contract
  - quota-and-cost
  - accessibility
affected_surfaces:
  - ui
  - documentation
  - regression-tests
invariants:
  - locale-schema
  - public-contract
  - no-mode-fallback
  - test-matrix
docs_impact: behavior
docs_reviewed: changed
docs_review_notes: PRODUCT and cloud SaaS spec state admitted-attempt quota semantics, including failed and incomplete rows; the spec also separates local demo state from growth-event PostgreSQL persistence
verification:
  - 'RED claim/public/locale: pnpm exec jest tests/cloud-saas-contract.test.cjs tests/locale-key-set.test.cjs tests/ai.provider.component.test.cjs --runInBand --coverage=false rejected all four missing claim matches, returned built-in Product instead of the translator sentinel, and reported all 67 required keys missing in all 16 locales'
  - 'RED provider after correcting its pre-existing variable-context mock: pnpm exec jest tests/ai.provider.component.test.cjs --runInBand --coverage=false failed the mode and exhausted-state assertions because the component rendered AI_USAGE_COPY instead of translator sentinels'
  - 'RED localized guard: pnpm exec jest tests/cloud-saas-contract.test.cjs --runInBand --coverage=false failed because the stub did not inspect public_saas_* locale values; the first GREEN attempt then exposed and corrected Unicode false positives for Turkish words ending in sla'
  - 'GREEN final: under Node 22.23.2, pnpm 10.6.1 and TMPDIR=/tmp, pnpm exec jest tests/cloud-saas-contract.test.cjs tests/locale-key-set.test.cjs tests/ai.provider.component.test.cjs tests/public-saas-demo.test.cjs --runInBand --coverage=false passed 4 suites and 30 tests'
  - 'locale inventory: 16/16 locale JSON files parse; each has 59 public_saas_* keys and 7 ai_usage_* keys, with localized ai_provider_description_org'
  - 'formatting: Prettier wrote and rechecked only owned frontend, focused tests, and locale JSON files'
  - 'self-review: no PUBLIC_COPY, AI_USAGE_COPY, or useVariables language branch remains in the two production copy owners; public-shell consumes the added signIn key without an edit from this stream'
  - 'R6 correction RED: pnpm exec jest tests/cloud-saas-contract.test.cjs --runInBand --coverage=false failed because both durable contracts still described completed operations rather than admitted attempts'
  - 'R6 correction GREEN: under Node 22.23.2 and TMPDIR=/tmp, pnpm exec jest tests/cloud-saas-contract.test.cjs --runInBand --coverage=false passed 1 suite and 12 tests after documenting failed, crash-left admitted, and other incomplete attempts as allowance-consuming'
changed_files:
  - PRODUCT.md
  - docs/product/cloud-saas-growth-spec.md
  - apps/frontend/src/components/public-saas/public-copy.ts
  - apps/frontend/src/components/settings/ai-provider.component.tsx
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
  - tests/cloud-saas-contract.test.cjs
  - tests/public-saas-demo.test.cjs
  - tests/ai.provider.component.test.cjs
  - tests/locale-key-set.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/guards-docs.md
explicit_defers:
  - content-factory-next-saas.5 retains per-provider-call accounting, sizing, spend caps, and reconciliation
  - root acceptance owns browser reflow for long translated copy, type/build integration, broad tests, protected-file audit, and artifact validation
completion_event: 3e65b0be-ff50-4a75-9a38-3be89675021d
supersedes_completion_event: 8d1a628d-8eb8-4730-ac6c-d5211e910467
---

# Summary

The public SaaS and AI usage-mode surfaces now resolve their copy from the
shared `useT()` contract. All 16 shipped locales contain real localized values
for 59 public keys and 7 AI usage keys; `signIn` is included for the
routing-owned public shell. The existing AI provider description key now
describes the explicit included/workspace-key choice in every locale.

The undecided-claim guard rejects the four reported claims and inspects only
`public_saas_*` values in locale bundles, so moving public copy out of TSX does
not create a guard blind spot. Unicode-aware SLA boundaries avoid false matches
inside translated words while retaining the standalone SLA prohibition.

# State and contract ownership

`usePublicCopy()` remains the single adapter used by public routes and
components. It maps the established camel-case component keys to flat
`public_saas_*` translation keys; it no longer reads `useVariables()` or chooses
between embedded English and Russian objects. The AI settings component keeps
the mode state and backend contract introduced by the AI stream, but every new
label and restriction state now comes from the shared translator with no
literal fallback.

No interaction, focus order, disabled-state transition, API payload, or visual
token changed in this stream. Existing native/select/input semantics remain in
place. Long translated strings are the main integration-sensitive UI change.

# Documentation decisions

The synthetic demo state machine is local and does not call tenant, AI,
Temporal, OAuth, publishing, or paid-service paths. Its allowlisted growth
events are a separate backend path and may be persisted to PostgreSQL; the spec
and narrowed test title now say that accurately.

Included quota counts attempts of product AI operations when they are admitted
to run. Failed rows, rows left `admitted` after a crash, and other incomplete
attempts still consume allowance. A single product operation may perform
multiple provider calls and retries, so the current ledger is neither a strict
call limit nor a spend cap. Per-call accounting and reconciliation remain
explicitly deferred to `content-factory-next-saas.5`.

# Verification

The focused final command passed 4 suites and 30 tests under the required Node,
pnpm, and `TMPDIR` environment. JSON parsing and exact key inventory confirmed
16 locales with 59 public and 7 AI usage keys each. The owned-file whitespace
check passed; wider acceptance remains root-owned.

The reviewer correction added a focused durable-contract assertion. Its RED
proved both documents still claimed completed-operation semantics; the corrected
suite then passed 12/12 tests with admitted-attempt semantics.

# Root acceptance

The root orchestrator accepted corrective event
`3e65b0be-ff50-4a75-9a38-3be89675021d` after the independent reviewer verified
the admitted-attempt wording against the implementation. It supersedes event
`8d1a628d-8eb8-4730-ac6c-d5211e910467`. Responsive browser checks, the cohesive
build, and release acceptance remain root-owned.

# Risks / Follow-ups

Residual risk is visual rather than stateful: Arabic/Hebrew direction is owned
by the existing locale system, and several translated paragraphs are longer
than English. Root browser acceptance should exercise 390 px reflow and the AI
settings select/status block in representative LTR and RTL locales. No browser
or full build was run in this focused stream.
