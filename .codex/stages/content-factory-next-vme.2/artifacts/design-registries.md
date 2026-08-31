---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.2/stage-manifest.json
stream_owner: subagent:design-registries
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance for content-factory-next-vme.2
public_facade: /auth/login and /demo public header actions
bounded_acceptance: shrink-only colour registries and shared Button/ButtonLink interaction contract
non_goals:
  - screen component or scene changes
  - adding geometry or typography allowances for migrated screens
  - browser matrix, build, full suite, delivery, production, credentials, live calls, publishing, or external messaging
evidence:
  - focused-red-green
  - mutation-check
  - shrink-only-ledgers
  - static-public-header-manifest
task_id: content-factory-next-vme.2.design-registries
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.2
session_id: n/a
milestone: design registries and public header shared actions
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: inherited bounded implementation stream
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 9aec733687980bed767623dc9612c27ea5df19bf
worktree: /tmp/cf-vme2
write_zone:
  - apps/frontend/src/app/colors.scss
  - apps/frontend/tailwind.config.cjs
  - apps/frontend/src/components/ui/button.tsx
  - apps/frontend/src/components/public-saas/public-shell.tsx
  - tests/design.guard.test.cjs
  - tests/design.contrast.test.cjs
  - tests/foundation.test.cjs
  - tests/interface-review-public-header.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - .codex/stages/content-factory-next-vme.2/evidence/public-header/**
  - .codex/stages/content-factory-next-vme.2/artifacts/design-registries.md
success_criteria:
  - LEGACY_WORD_ALIAS_ALLOWED, customColor allowance, and RAW_PALETTE_ALLOWED strictly shrink without additions
  - at least one unused compatibility role leaves colors.scss and the Tailwind bridge
  - public login and demo links share geometry, pressed, focus, transition, and disabled semantics with Button
  - aria-disabled links cannot navigate and leave the tab order
selected_docs:
  - AGENTS.md
  - docs/design/component-authoring-rules.md
  - .codex/stages/content-factory-next-vme.2/spec.md
  - .codex/stages/content-factory-next-vme.2/plan.md
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: registries-and-public-header
depends_on_streams:
  - settings-admin-channel-picker
  - analytics-billing
  - developer-public-preview-oauth
parallel_decision: sequential stream after accepted screen consumers
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared isolated worktree retained for root browser acceptance; no server, browser, child branch, external session, credential, or temporary runtime resource required cleanup.
risk_level: medium
risk_tags:
  - ui
  - accessibility
  - shared-component
  - design-ledger
affected_surfaces:
  - public-header
  - button
  - design-registries
invariants:
  - shrink-only-allowlists
  - cf-colour-tokens
  - disabled-link-no-navigation
  - existing-button-calls-unchanged
docs_impact: stage evidence only
docs_reviewed: updated
docs_review_notes: Added this delegated-stream artifact and the text-only public-header evidence manifest; durable product and operator contracts were unchanged.
"credentials/live_calls": false
verification:
  - "Initial RED on Node 22.23.2: design.guard reported 5 stale customColor consumers, 8 stale named legacy consumers, 1 stale raw-palette consumer, and concurrent geometry-ledger drift."
  - "Focused public-header RED: both tests failed because the action links had independent geometry and ButtonLink did not exist."
  - "Focused public-header GREEN: 2/2 passed after PublicShell adopted ButtonLink and the shared class/disabled contract."
  - "Mutation RED: replacing the sign-in ButtonLink with an independent Link made the shared geometry assertion fail; restoration returned the test to GREEN."
  - "Final affected suite on Node 22.23.2 passed 86/86 across design guard, public header, public SaaS, typography, contrast, and foundation."
  - "Frontend TypeScript check passed with no diagnostics."
  - "Design guard passed 22/22 after the accepted screen owners removed the remaining off-rhythm occurrences; no allowance was added."
changed_files:
  - apps/frontend/src/app/colors.scss
  - apps/frontend/tailwind.config.cjs
  - apps/frontend/src/components/ui/button.tsx
  - apps/frontend/src/components/public-saas/public-shell.tsx
  - tests/design.guard.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - tests/interface-review-public-header.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/public-header/manifest.json
  - .codex/stages/content-factory-next-vme.2/artifacts/design-registries.md
completion_event: 5a5a3299-fed8-4f2f-854d-67f2c97a367b
explicit_defers:
  - none
---

# Summary

Три цветовых реестра сокращены строго по фактическим потребителям:

- `CUSTOM_ALLOWED`: 25 → 20. Удалены уже мигрированные `layout/settings`, `email-notifications`, `shortlink-preference`, `signatures`, `teams`.
- `LEGACY_WORD_ALIAS_ALLOWED`: 38 → 30. Удалены уже мигрированные `main.billing`, `layout/settings`, `email-notifications`, `github`, `metric`, `shortlink-preference`, `signatures`, `teams`.
- `RAW_PALETTE_ALLOWED`: 52 → 51. Удалён мигрированный `platform-analytics/platform.analytics`.

Ни один allowlist не расширен. Полностью неиспользуемая роль `customColor1`
удалена вместе с `--color-custom1` из `colors.scss` и Tailwind bridge.

Дополнительно снят только устаревший долг из разрешённых root-файлов:
геометрия 1121 → 1056, типографика 883 → 800. Новые геометрические
нарушения не были легализованы.

## Общий контракт действий

`Button` и новый `ButtonLink` используют один `buttonClassName`: высоту,
горизонтальные отступы, радиус, pressed, focus-visible, transition,
reduced-motion и disabled/aria-disabled классы. Существующие вызовы `Button`
не менялись. Ссылки `/auth/login` и `/demo` в `PublicShell` теперь используют
этот контракт. При `aria-disabled` ссылка получает `tabIndex=-1`, отменяет
навигацию и не вызывает пользовательский обработчик.

# Verification

TDD RED/GREEN и отдельный mutation RED записаны выше. Итоговый затронутый
набор прошёл 86/86, TypeScript — без диагностик. После принятых экранных
исправлений `design.guard` прошёл 22/22; ни одно новое разрешение не добавлено.

Evidence manifest перечисляет маршруты, обе темы и ширины 1440/1024/768/390.
Скриншоты и browser matrix не заявлены: ими владеет root. Живые вызовы,
credentials, публикация, commit, merge, push, PR и deploy не выполнялись.

# Risks / Follow-ups

Остаточных блокеров и явных отсрочек у потока нет. Root принял результат после
проверки shrink-only counts, общего ButtonLink-контракта и повторного focused
прогона 50/50. Браузерная матрица остаётся корневым gate.
