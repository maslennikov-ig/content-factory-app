---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-rmp/stage-manifest.json
stream_owner: rmp_frontend
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: content-factory-next-rmp acceptance
public_facade: Settings sign-in methods tab
bounded_acceptance: connected and available identity rows, authenticated link callbacks, removal guard, responsive and localized states
non_goals:
  - real OAuth provider connection
  - browser credential entry
  - application deployment
evidence:
  - focused_tests
  - source_review
  - design_review
task_id: content-factory-next-rmp.frontend
epic_id: content-factory-next-aay
stage_id: content-factory-next-rmp
session_id: goal-content-factory-next-aay
milestone: linked identities Settings slice
milestone_status: accepted
agent_type: frontend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: high
model_reasoning_rationale: the UI completes an authentication mutation flow and must preserve account access
repo: content-factory-next
branch: work/user-identity
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-user-identity
write_zone:
  - apps/frontend/src/components/settings
  - apps/frontend/src/components/layout/settings.component.tsx
  - libraries/react-shared-libraries/src/translation/locales
  - tests/user-identity.settings.test.cjs
  - tests/telegram.auth.provider.test.cjs
success_criteria:
  - users can distinguish connected and available methods and take one clear action
  - callback return mounts the sign-in methods consumer and is single-use
  - the last method has a disabled removal action with an inline explanation
  - every shipped locale covers the new UI and narrow layouts keep usable controls
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
  - .codex/stages/content-factory-next-rmp/implementation.md
selected_skills:
  - impeccable
  - lazyweb
  - superpowers:test-driven-development
selected_agents:
  - rmp_frontend
  - rmp_locales_a
  - rmp_locales_b
catalog_candidates:
  - none
parallel_group: rmp-settings
depends_on_streams:
  - content-factory-next-rmp.backend
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared-worktree streams completed; no dev server, browser session, provider session, or external resource was created.
risk_level: high
risk_tags:
  - security
  - ui
  - user-flow
  - idempotency
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
docs_review_notes: Stage implementation and reference matrix record the final interaction contract; all locale catalogues were updated.
verification:
  - focused UI and Telegram Jest RED: failed as expected
  - focused UI and Telegram Jest 30/30: passed
  - design guard 11/11: passed
  - locale and branding focused tests 16/16: passed
  - independent UI reference review: passed
changed_files:
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
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
  - tests/telegram.auth.provider.test.cjs
  - tests/user-identity.settings.test.cjs
explicit_defers:
  - none
---

# Summary

The final UI follows the selected Okta, Google, Zapier, and Gusto patterns while
adding an explicit inline lockout guard. All new strings are present in every
shipped locale, and the callback tab wiring is covered at runtime-test level.

# Delivery / Cleanup

Delivery was direct shared-worktree integration. No browser, OAuth session, or
separate branch remains.

# Verification

The focused UI and Telegram pair passed 30/30. Design guard passed 11/11;
locale and branding checks passed 16/16; the final independent comparison found
no material P0–P3 divergence from the four selected references.

# Risks / Follow-ups

Real provider callbacks and visual browser verification require local provider
configuration and remain explicit manual checks, not claimed evidence.
