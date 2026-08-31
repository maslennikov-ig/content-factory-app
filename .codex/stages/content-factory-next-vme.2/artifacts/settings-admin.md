---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.2/stage-manifest.json
stream_owner: subagent:settings-admin
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance for content-factory-next-vme.2
public_facade: /interface-review/settings-admin/[scene]
bounded_acceptance: production Settings, Admin Users and Stats views plus accessible offline channel-picker scenes
non_goals:
  - Admin Errors, Webhooks, Autopost, Sets, Approved Apps, Public API, provider protocols, endpoints, persistence, or runtime semantics
  - browser evidence, build, full suite, delivery, production data, credentials, live provider connections, or publishing
evidence:
  - focused-red-green
  - canonical-state-matrix
  - synthetic-offline-scenes
  - local-platform-assets
task_id: content-factory-next-vme.2.settings-admin
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.2
session_id: n/a
milestone: production Settings Admin Users Stats and accessible synthetic channel picker
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
  - apps/frontend/src/app/(app)/(site)/settings/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/users/page.tsx
  - apps/frontend/src/app/(app)/(site)/admin/stats/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/settings-admin/**
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/settings/**
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/admin/admin-stats.component.tsx
  - apps/frontend/src/components/interface-review/settings-admin/**
  - apps/frontend/src/components/new-launch/picks.socials.component.tsx
  - libraries/react-shared-libraries/src/platform/**
  - tests/interface-review-settings-admin.test.cjs
  - tests/user-identity.settings.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/settings-admin-channel/**
  - .codex/stages/content-factory-next-vme.2/artifacts/settings-admin.md
success_criteria:
  - Settings modal and page delegate to one production SettingsSurface without duplicating out-of-scope implementations
  - Admin Users and Stats expose pure production views while runtime wrappers preserve existing endpoints and actions
  - four independent synthetic scenes render production views with the canonical state matrix or contract-backed exclusions
  - channel-picker uses disabled buttons with an accessible explanation and only local Mastodon, Dev.to, Listmonk and YouTube assets
  - narrow Admin Users rows do not require a fixed five-column layout
selected_docs:
  - AGENTS.md
  - docs/design/component-authoring-rules.md
  - .codex/stages/content-factory-next-vme.2/spec.md
  - .codex/stages/content-factory-next-vme.2/plan.md
  - apps/frontend/src/components/interface-review/fixture-contract.tsx
selected_skills:
  - graphify-project
  - impeccable
  - lazyweb
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: settings-admin-channel-picker
depends_on_streams:
  - safe-review-host
parallel_decision: shared-worktree write isolation defined by the stage manifest
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared isolated worktree retained for dependent streams; no server, browser, child branch, external session, credential, or temporary runtime resource required cleanup.
risk_level: medium
risk_tags:
  - ui
  - accessibility
  - responsive-layout
  - credential-isolation
affected_surfaces:
  - settings
  - admin-users
  - admin-stats
  - channel-picker
invariants:
  - canonical-nine-state-matrix
  - synthetic-data-only
  - endpoint-contract-preserved
  - admin-errors-excluded
docs_impact: stage evidence only
docs_reviewed: updated
docs_review_notes: Added this delegated-stream artifact and text-only evidence manifest; durable product and operator contracts were unchanged.
"credentials/live_calls": false
verification:
  - "RED on Node 22.23.2: interface-review-settings-admin failed 10 tests because the four production scene modules were absent."
  - "RED correction on Node 22.23.2: long-content localization failed until the production Settings scene rendered actual long Russian content."
  - "RED correction on Node 22.23.2: four stable scene routes were unreachable before group-owned route modules were added."
  - "Compatibility RED on Node 22.23.2: user-identity.settings failed after SettingsPopup delegated to SettingsSurface; its focused loader map was updated with the new production boundary."
  - "GREEN on Node 22.23.2: interface-review-fixture, interface-review-settings-admin, user-identity.settings, desert-lab-screen-review, platform.card, and choice-control.contract passed 166/166."
  - "GREEN on Node 22.23.2: pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json completed without diagnostics."
  - "git diff --check over the assigned production, scene, route, and test paths completed without errors."
  - "Integration correction RED on Node 22.23.2: design.guard reported admin-users.component.tsx 6px occurs 3 times, allowed 2."
  - "Integration correction GREEN for this stream: the added Admin Users 6px occurrence was replaced with the existing 8px product rhythm; design.guard no longer reports any settings-admin addition and remains RED only for two stale analytics ledger entries owned by the analytics stream."
  - "Correction regression on Node 22.23.2: the six focused suites passed 166/166, frontend tsc completed without diagnostics, and scoped diff check completed without errors."
changed_files:
  - apps/frontend/src/app/(app)/(site)/admin/stats/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/settings-admin/settings/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/settings-admin/users/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/settings-admin/stats/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/settings-admin/channel-picker/page.tsx
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/settings/settings-surface.component.tsx
  - apps/frontend/src/components/settings/global.settings.tsx
  - apps/frontend/src/components/settings/email-notifications.component.tsx
  - apps/frontend/src/components/settings/shortlink-preference.component.tsx
  - apps/frontend/src/components/settings/metric.component.tsx
  - apps/frontend/src/components/settings/teams.component.tsx
  - apps/frontend/src/components/settings/signatures.component.tsx
  - apps/frontend/src/components/settings/github.component.tsx
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/admin/admin-stats.component.tsx
  - apps/frontend/src/components/new-launch/picks.socials.component.tsx
  - apps/frontend/src/components/interface-review/settings-admin/settings.scene.tsx
  - apps/frontend/src/components/interface-review/settings-admin/admin-users.scene.tsx
  - apps/frontend/src/components/interface-review/settings-admin/admin-stats.scene.tsx
  - apps/frontend/src/components/interface-review/settings-admin/channel-picker.scene.tsx
  - apps/frontend/src/components/interface-review/settings-admin/index.ts
  - tests/interface-review-settings-admin.test.cjs
  - tests/user-identity.settings.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/settings-admin-channel/manifest.json
  - .codex/stages/content-factory-next-vme.2/artifacts/settings-admin.md
completion_event: 7861112d-6d5f-41eb-b081-e7be7932575b
supersedes_completion_event: fd07faf4-839b-4830-b882-d60d3946f22e
explicit_defers:
  - Root owns browser interaction and screenshot acceptance across the declared theme, viewport, locale, and state matrix.
  - The sequential design-registry owner must shrink any obsolete allowlist entries; this stream did not edit shared design guard files.
  - Admin Errors remains explicitly excluded from this stream.
---

# Summary

Settings modal и route теперь используют одну production-оболочку
`SettingsSurface`. Admin Users и Admin Stats разделены на чистые view-компоненты
и runtime-контроллеры, сохранившие прежние запросы и действия. Четыре
независимые offline scenes рендерят именно production views через общий
fixture-contract и доступны по стабильным URL под
`/interface-review/settings-admin/...`.

Channel picker больше не блокирует выбор только через `pointer-events`: locked
и fixed варианты используют настоящие disabled-кнопки с `aria-describedby`.
Тёмная synthetic fixture содержит только локальные Mastodon, Dev.to, Listmonk
и YouTube assets; live provider connection отключён.

Integration correction удалила единственный добавленный этой миграцией
off-rhythm `6px`: промежуток между status badge и admin label теперь использует
существующий product rhythm `8px`. Два исходных `6px` не менялись.

# State matrix and exclusions

- Settings и Admin Users покрывают все девять canonical data states.
- Admin Stats покрывает восемь состояний; `success` исключён, потому что это
  read-only поверхность без успешной мутации.
- Channel picker покрывает `empty`, `default`, `selected`, `restricted`,
  `disabled`, `long-content`. `loading` и `error` принадлежат parent launch
  manager, а `success` — parent publishing flow.
- Hover, focus и active проверяются как browser interactions, а не как scene
  data states. Admin Errors строго исключён.

# Runtime boundaries

Runtime wrappers сохраняют существующие Admin endpoints, SWR-fetching, approve,
block и date-filter semantics. Scenes используют только синтетические данные,
не импортируют production controllers, не сохраняют данные и не выполняют
provider, credential, publish или network actions. SettingsSurface не копирует
Webhooks, Autopost, Sets, Approved Apps и Public API implementations.

# Verification

Первый focused RED зафиксировал отсутствие четырёх scenes. Затем отдельные RED
доказали, что long-content обязан содержать реальный русский текст, четыре
сцены должны быть доступны по стабильным routes, а старый Settings test-loader
должен знать новую production-границу. Итоговый разрешённый прогон на Node
22.23.2: 6 suites, 166 tests, все прошли. Frontend TypeScript-проверка и scoped
`git diff --check` завершились без ошибок. Build, full suite и browser не
запускались по границе задания.

# Risks / Follow-ups

Root принял ручную интеграцию после проверки routes, state exclusions и local
assets и повторного focused-прогона 101/101. Browser acceptance для тем, ширин,
языков, состояний и hover/focus/active остаётся корневым gate. Shared design registry
не менялся: его последовательный владелец должен удалить устаревшие allowlist
entries после интеграции. После correction design guard остаётся красным только
из-за двух stale analytics entries вне этой зоны. Production data, credentials, live connections,
publishing, screenshots, commit, merge, push, PR и deploy не выполнялись.
