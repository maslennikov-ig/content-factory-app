---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.2/stage-manifest.json
stream_owner: subagent:fixture-foundation
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: settings-admin-channel-picker, analytics-billing, developer-public-preview-oauth
public_facade: apps/frontend/src/components/interface-review/fixture-contract.tsx
bounded_acceptance: focused fixture contract and route safety behavior
non_goals:
  - product Settings, Admin, Analytics, Billing, Developer, Preview, Extension, OAuth, or channel-picker scenes
  - production auth, credentials, persistence, provider connections, browser evidence, build, full suite, delivery
evidence:
  - none
task_id: content-factory-next-vme.2.fixture-foundation
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.2
session_id: n/a
milestone: safe reproducible local interface review host
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: inherited bounded foundation stream
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 32316ec6
worktree: /tmp/cf-vme2
write_zone:
  - apps/frontend/src/app/(stand)/**
  - apps/frontend/src/components/interface-review/** common infrastructure only
  - tests/interface-review-fixture.test.cjs
  - .codex/stages/content-factory-next-vme.2/artifacts/fixture-foundation.md
success_criteria:
  - local route is unavailable in production and when environment is unspecified
  - browser output blocks all network connections, forms, external scripts and images, frames, and objects while allowing local Next hydration
  - scenes resolve the durable nine data states, light/dark, RU/EN, and 1440/1024/768/390 exactly
  - each consumer can define a frozen synthetic scene without editing a shared registry
selected_docs:
  - AGENTS.md
  - docs/design/component-authoring-rules.md
  - .codex/stages/content-factory-next-vme.2/spec.md
  - .codex/stages/content-factory-next-vme.2/plan.md
  - .codex/stage-artifact-template.md
selected_skills:
  - superpowers:test-driven-development
  - superpowers:test-driven-development/writing-good-tests.md
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: safe-review-host-before-screen-consumers
depends_on_streams:
  - none
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared isolated worktree retained for dependent streams; no child branch, process, server, external session, credential, or temporary runtime resource required cleanup.
risk_level: medium
risk_tags:
  - security
  - authorization
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Added this delegated-stream artifact; no durable product or operator document changes were needed for local review infrastructure.
verification:
  - "PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/interface-review-fixture.test.cjs --runInBand (RED: missing fixture boundary)": failed
  - "PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/interface-review-fixture.test.cjs --runInBand (RED: scene theme was metadata-only)": failed
  - "PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/interface-review-fixture.test.cjs --runInBand (RED: local Next hydration was blocked)": failed
  - "PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/interface-review-fixture.test.cjs --runInBand (GREEN: 10 tests)": passed
  - "PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit --pretty false -p apps/frontend/tsconfig.json 2>&1 | rg 'fixture-contract\\.tsx|error TS2322' (RED: scalar branch remained unknown)": failed
  - "PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit --pretty false -p apps/frontend/tsconfig.json (GREEN)": passed
  - "git diff --check -- apps/frontend/src/app/(stand) apps/frontend/src/components/interface-review tests/interface-review-fixture.test.cjs .codex/stages/content-factory-next-vme.2/artifacts/fixture-foundation.md": passed
changed_files:
  - apps/frontend/src/app/(stand)/layout.tsx
  - apps/frontend/src/app/(stand)/interface-review/page.tsx
  - apps/frontend/src/components/interface-review/fixture-contract.tsx
  - apps/frontend/src/components/interface-review/review-access.ts
  - tests/interface-review-fixture.test.cjs
  - .codex/stages/content-factory-next-vme.2/artifacts/fixture-foundation.md
explicit_defers:
  - Browser screenshots and product scene modules remain assigned to the three consumer streams and root acceptance.
---

# Summary

Создан один локальный синтетический review-host `/interface-review` и общий
fixture-contract. Девять data-состояний отделены от hover/focus/active,
контекст URL строго задаёт тему, язык и один из четырёх размеров. Сцены
определяются независимо и получают только глубоко замороженные JSON-подобные
данные.

# Scope / Routing

Общий layout не подключает production auth, tenant data или provider contexts.
Каждый следующий поток добавляет собственный route/scene module и вызывает
`defineInterfaceReviewScene`, `resolveInterfaceReviewContext` и
`InterfaceReviewFrame`; общий реестр не нужен. Foundation landing route
поддерживает только `default`, а surface-модули объявляют собственную честную
подматрицу из обязательных девяти состояний.

# Verification

Первый корректный RED наблюдал отсутствие fixture-boundary. После минимального
GREEN отдельный RED поймал визуально не применённую dark theme при layout без
`searchParams`; тема и `lang` перенесены на оболочку сцены. Итоговый focused
прогон: 1 suite, 10 tests, все прошли на Node 22.23.2. Интеграционный TS2322
был воспроизведён frontend TypeScript-проверкой: составное сужение `unknown`
не сохранялось в recursive return type. Именованный type predicate сохраняет
тот же runtime-контракт, а полный frontend `tsc --noEmit` проходит.

# Delivery / Cleanup

Результат принят оркестратором после повторного focused Jest 10/10, валидации
артефакта и scoped diff check. Он интегрирован вручную в общий изолированный
worktree. Коммиты, merge, push, PR, deploy, серверы и внешние подключения не
выполнялись; отдельные ресурсы очистки не создавались.

# Risks / Follow-ups / Explicit Defers

CSP в выдаваемом HTML запрещает `connect-src` даже для same-origin API,
отправку форм, внешние scripts/images, frames и objects. Для реальной проверки
интеракций разрешены только same-origin Next scripts и необходимый inline
hydration bootstrap; внешний script остаётся заблокирован. Production и
неопределённое окружение получают `notFound`; разрешены только `development` и
`test`. Фундамент не заявляет browser screenshots или покрытие продуктовых
поверхностей — их выполняют назначенные consumer streams и корневая приёмка.
