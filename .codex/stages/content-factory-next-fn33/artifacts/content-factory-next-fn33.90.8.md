---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-G
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave «решения владельца 05.09.2026»
public_facade: n/a
bounded_acceptance: «Занести текст» под USER выключена с объяснением до первого отказа
non_goals:
  - предел тарифа по-прежнему узнаётся из ответа сервера
  - экран свидетельств (content-facts*) вне зоны записи
evidence:
  - jest-content-archive-role
  - jest-content-facts-read-only
  - tsc-frontend
task_id: content-factory-next-fn33.90.8
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
  - право записи в архив читается из сеанса общей функцией writeRightFromRole
  - отказ по тарифу по-прежнему приходит из ответа и перекрывает роль
  - объяснение называет редактора и администратора, а не «владельца»
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
docs_review_notes: строка /content-intelligence/materials/archive/import в матрице уже верна
verification:
  - pnpm exec jest tests/new-launch tests/launches tests/menu tests/content-brief tests/content-archive tests/media tests/settings tests/role tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated tests/raw-control.guard tests/hint.guard tests/design.typography tests/design.geometry: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec jest tests/content-archive.role.test.cjs: passed
  - pnpm exec jest tests/content-facts.read-only.test.cjs: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-write-right.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - tests/content-archive.role.test.cjs
  - tests/content-archive.screen.test.cjs
  - tests/content-facts.read-only.test.cjs
explicit_defers:
  - content-factory-next-fn33.90.7 — «Бриф» живёт в apps/frontend/src/components/brand-voice/voice-brief.container.tsx, вне зоны записи потока
---

# Summary

`content-write-right.tsx` получил `writeRightFromRole`: половина права,
которую сеанс знает заранее.

Модуль сознательно не угадывал право вперёд сервера, и для тарифа это остаётся
верным — счётчик живёт не в браузере. Роль не счётчик: с 05.09.2026 это одна
функция, сервер приходит к ней через `Sections.EDITOR`, а сеанс несёт роль.
Прочитать её на кадр раньше — не догадка, а то же самое чтение. Архив seed-ит
своё право из сеанса и перестаёт открывать форму тому, кому «Занести» ответит
403 после заполненного заголовка и текста. Заодно исправлена формулировка
объяснения: роли «владелец» в продукте нет.

Два существующих набора рисовали архив без сеанса и потому попадали под новый
запрет — им проставлена администраторская роль, потому что они про слова и
тариф, а не про роль.

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
