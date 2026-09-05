---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-G
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave «решения владельца 05.09.2026»
public_facade: n/a
bounded_acceptance: «Загрузить» под USER выключена с объяснением, четыре 403 не уходят
non_goals:
  - Uppy и его словарь не менялись
  - серверные пределы загрузки не трогались
evidence:
  - jest-role-read-only-screens
  - jest-media-suites
  - tsc-frontend
task_id: content-factory-next-fn33.90.9
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: роль видна на экране до нажатия, а не после отказа
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: многофайловая правка интерфейса под ролью с тестами
repo: content-factory-next
branch: worktree-agent-a009cdcabe65ea0aa
base_branch: wave/owner-decisions-2026-09-05
base_commit: 9ea83528f5ba3836450951ca18b5e0abb64e003f
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a009cdcabe65ea0aa
write_zone:
  - apps/frontend/src/components/**
  - tests/**
  - libraries/react-shared-libraries/src/translation/locales/**
  - docs/product/roles-matrix.md
  - .codex/stages/content-factory-next-fn33/**
success_criteria:
  - кнопка «Загрузить» выключена и ссылается на объяснение через aria-describedby
  - перетаскивание файла и сторонняя библиотека Пользователю недоступны
  - список медиа остаётся читаемым
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-owner-decisions-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - authorization
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: строка /media в матрице уже описывает порог
verification:
  - pnpm exec jest tests/new-launch tests/launches tests/menu tests/content-brief tests/content-archive tests/media tests/settings tests/role tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated tests/raw-control.guard tests/hint.guard tests/design.typography tests/design.geometry: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec jest tests/role-read-only-screens.test.cjs: passed
changed_files:
  - apps/frontend/src/components/media/media.component.tsx
  - tests/role-read-only-screens.test.cjs
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
explicit_defers:
  - none
---

# Summary

«Загрузить» больше не отправляет четыре `POST /media/upload-server` подряд
ради четырёх 403 и английской плашки «Failed to upload probe.png».

Строку эту рисует Uppy сам, мимо перевода и мимо общего диалога отказа, поэтому
чинить её текст было бы починкой следствия. Экран знает свой порог до того, как
что-то нарисует: кнопка выключена, перетаскивание выключено, сторонняя
библиотека скрыта, рядом стоит `ReadOnlyMediaNote`, на который кнопка ссылается
через `aria-describedby`. Список читается как раньше — чтение библиотеки роли не
несёт.

# Scope / Routing

Зона записи: `apps/frontend/src/components/**` кроме `brand-voice/**`,
`copilot/**`, `content-intelligence/content-search*` и
`content-intelligence/content-facts*`; `tests/**`; локали; матрица ролей;
артефакты и манифест. Бэкенд не трогался. Единственный источник права на
клиенте — `isOrganizationEditor` / `isOrganizationAdmin` из
`libraries/nestjs-libraries/src/user/organization.roles.ts`; второго мнения о
том, кто такой редактор, поток не заводил.

# Verification

Команды перечислены в поле `verification` выше. Каждый новый набор до правки
был красным, после — зелёным.

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a009cdcabe65ea0aa`. Слияние и закрытие beads — за корнем.

# Risks / Follow-ups / Explicit Defers

Смотри поле `explicit_defers`.
