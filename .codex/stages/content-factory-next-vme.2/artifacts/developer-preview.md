---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.2/stage-manifest.json
stream_owner: subagent:developer-preview
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance for content-factory-next-vme.2
public_facade: /interface-review/developer-preview/[scene]
bounded_acceptance: production product-owned surfaces and offline synthetic scene matrix for qzw and den
non_goals:
  - full public preview route, full extension composer, full provider picker, or native WebView lifecycle
  - endpoint, provider, OAuth, bridge-global, public API, key, secret, redirect, or external platform contract changes
  - browser evidence, build, full suite, delivery, production, credentials, paid calls, provider connections, or publishing
evidence:
  - focused-red-green
  - state-matrix
  - protocol-contract
  - credential-isolation
task_id: content-factory-next-vme.2.developer-preview
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.2
session_id: n/a
milestone: developer public API preview extension OAuth and provider product chrome
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
  - apps/frontend/src/components/developer/**
  - apps/frontend/src/components/public-api/**
  - apps/frontend/src/components/preview/**
  - apps/frontend/src/components/provider-preview/**
  - apps/frontend/src/app/(extension)/**
  - apps/frontend/src/app/(app)/oauth/**
  - apps/frontend/src/app/(provider)/**
  - apps/frontend/src/app/(stand)/interface-review/developer-preview/**
  - apps/frontend/src/components/interface-review/developer-preview/**
  - tests/interface-review-developer-preview.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/developer-preview/**
  - .codex/stages/content-factory-next-vme.2/artifacts/developer-preview.md
success_criteria:
  - seven independent synthetic scenes render production surface components
  - every scene covers the canonical data matrix or records a contract-backed exclusion
  - OAuth endpoints and provider bridge globals remain unchanged
  - extension and provider-add routes retain their existing runtime delegates
  - no fixture contains credential-like material or executes network, OAuth, provider, key, secret, redirect, or publish actions
selected_docs:
  - AGENTS.md
  - docs/design/component-authoring-rules.md
  - .codex/stages/content-factory-next-vme.2/spec.md
  - .codex/stages/content-factory-next-vme.2/plan.md
  - apps/frontend/src/components/interface-review/fixture-contract.tsx
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: developer-public-preview-oauth
depends_on_streams:
  - safe-review-host
parallel_decision: shared-worktree write isolation defined by the stage manifest
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared isolated worktree retained for dependent streams; no child branch, server, browser, external session, credential, or temporary runtime resource required cleanup.
risk_level: medium
risk_tags:
  - ui
  - accessibility
  - public-contract
  - provider-contract
  - credential-isolation
affected_surfaces:
  - developer
  - public-api
  - preview
  - extension
  - oauth-authorize
  - provider-preview
  - provider-add
invariants:
  - canonical-nine-state-matrix
  - protocol-boundaries-preserved
  - synthetic-data-only
docs_impact: stage evidence only
docs_reviewed: updated
docs_review_notes: Added the delegated-stream artifact and text-only evidence manifest; durable product and operator contracts were unchanged.
"credentials/live_calls": false
verification:
  - "RED on Node 22.23.2: interface-review-developer-preview failed because all seven independent production scenes were absent; common fixture contract remained green."
  - "Initial GREEN on Node 22.23.2: interface-review-fixture plus interface-review-developer-preview passed 29/29 for production scenes and protocol boundaries."
  - "Reachability correction RED on Node 22.23.2: focused suite failed because the group-owned browser route did not exist."
  - "Reachability correction GREEN on Node 22.23.2: all seven stable route URLs resolved foundation query context and the focused suites passed 37/37."
  - "Affected form, choice, OAuth, provider, foundation, and contrast contracts passed 101/101."
  - "TypeScript transpile syntax check parsed 35 source files in the owned runtime roots without diagnostics."
  - "Design guard rerun showed no developer-preview additions; remaining additions and stale entries belong to concurrent settings-admin/analytics-billing work and the sequential registry owner."
  - "Desert-lab screen review passed 127 other checks but failed the pre-existing concurrent channel-picker ring assertion in apps/frontend/src/components/new-launch/picks.socials.component.tsx outside this write zone."
changed_files:
  - apps/frontend/src/components/developer/developer.component.tsx
  - apps/frontend/src/components/developer/developer.surface.tsx
  - apps/frontend/src/components/public-api/public.component.tsx
  - apps/frontend/src/components/public-api/public-api.surface.tsx
  - apps/frontend/src/components/preview/post.preview.tsx
  - apps/frontend/src/components/preview/post.preview.dialog.tsx
  - apps/frontend/src/components/preview/preview.surface.tsx
  - apps/frontend/src/components/provider-preview/preview.provider.component.tsx
  - apps/frontend/src/components/provider-preview/provider-preview.surface.tsx
  - apps/frontend/src/app/(extension)/modal/[style]/[platform]/page.tsx
  - apps/frontend/src/app/(extension)/modal/extension.surface.tsx
  - apps/frontend/src/app/(app)/oauth/authorize/page.tsx
  - apps/frontend/src/app/(app)/oauth/authorize/oauth-authorize.surface.tsx
  - apps/frontend/src/app/(provider)/provider/[p]/bridge.tsx
  - apps/frontend/src/app/(provider)/provider/add/page.tsx
  - apps/frontend/src/app/(provider)/provider/add/provider-add.surface.tsx
  - apps/frontend/src/app/(stand)/interface-review/developer-preview/[scene]/page.tsx
  - apps/frontend/src/components/interface-review/developer-preview/developer.scene.tsx
  - apps/frontend/src/components/interface-review/developer-preview/public-api.scene.tsx
  - apps/frontend/src/components/interface-review/developer-preview/preview.scene.tsx
  - apps/frontend/src/components/interface-review/developer-preview/extension.scene.tsx
  - apps/frontend/src/components/interface-review/developer-preview/oauth-authorize.scene.tsx
  - apps/frontend/src/components/interface-review/developer-preview/provider-preview.scene.tsx
  - apps/frontend/src/components/interface-review/developer-preview/provider-add.scene.tsx
  - tests/interface-review-developer-preview.test.cjs
  - .codex/stages/content-factory-next-vme.2/evidence/developer-preview/manifest.json
  - .codex/stages/content-factory-next-vme.2/artifacts/developer-preview.md
completion_event: 4e570b87-31db-4b5d-964e-09973f94a359
explicit_defers:
  - Full public preview runtime remains outside the assigned route zone and requires authenticated internal data plus user/Copilot wrappers.
  - Full extension composer requires StandaloneModal, integrations, slot lookup, and publish-capable behavior outside this write zone.
  - Full provider picker requires MobileIntegration, AddProviderComponent, integration data, and external provider redirects outside this write zone.
  - Native pre-load injection and evaluateJavaScript lifecycle require the native WebView host; this stream preserves and statically verifies its pull globals.
---

# Summary

Developer, Public API, Preview, Extension, OAuth authorize, provider preview и
provider add получили отдельные чистые production surface-компоненты. Семь
независимых synthetic scenes рендерят именно эти компоненты через общий offline
fixture-contract и доступны по стабильным URL под
`/interface-review/developer-preview/...`. Runtime controllers по-прежнему владеют существующими
запросами, а scenes не импортируют их и не выполняют действий.

# State matrix and exclusions

- Developer покрывает все девять data-состояний.
- Public API исключает `empty`: отсутствие организационного доступа является
  `restricted` для пользователя без административного ключа.
- Preview исключает `selected`: это read-only поверхность с действиями, а не
  выбираемое состояние.
- Extension исключает `success`: завершение принадлежит publish-capable parent
  composer runtime.
- OAuth authorize исключает `empty`, `selected`, `success`, `restricted` по
  действующему validation/action/redirect контракту.
- Provider preview исключает `empty`, `selected`, `success`, `restricted`,
  `disabled`: pull bridge предоставляет только seed/read/validate/max-length.
- Provider add исключает `success`, `restricted`, `disabled`: результат
  подключения и доступность принадлежат provider payload/redirect runtime.

# Runtime boundaries

Локально воспроизводится только принадлежащий Content Factory chrome. Не
заявлены воспроизведёнными полный public preview route, extension composer,
provider picker или native WebView lifecycle. Endpoint literals, OAuth redirect,
provider settings components, external platform markup и bridge globals не
менялись.

# Verification

Первый focused RED зафиксировал отсутствие семи scenes. Отдельный correction
RED затем доказал отсутствие browser route; после добавления group-owned route
основной прогон прошёл 37/37, дополнительный затронутый набор — 101/101. Никакие ключи,
секреты, credentials, OAuth/provider/live/publish вызовы, screenshots, build,
full suite, commit, merge, push, PR или deploy не выполнялись. Результат принят
root после проверки семи стабильных routes, повторного focused-прогона 37/37 и
валидации артефакта и evidence manifest.

# Risks / Follow-ups

Полный route/runtime evidence намеренно не заявлен для public preview,
extension composer, provider picker и native WebView. Если корневая приёмка
потребует именно эти границы, root должен сначала определить отдельную
ownership-safe blocker-задачу; текущий поток не расширяет зону и не запускает
живые действия.
