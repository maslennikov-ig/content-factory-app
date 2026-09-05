---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-G
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave «решения владельца 05.09.2026»
public_facade: n/a
bounded_acceptance: окно существующего поста под USER не принимает ввод ни одним органом управления
non_goals:
  - логика сохранения поста не менялась
  - причина запрета считается прежним composeBlockReason
evidence:
  - jest-compose-read-only
  - jest-compose-suites
  - tsc-frontend
task_id: content-factory-next-fn33.90.10
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
  - поле текста не принимает ввод, панель начертаний и «Вставить медиа» не показываются
  - тег, повтор, этап и дата выключены и не открывают списки
  - «Обновить» выглядит выключенной — 50%, а не 80% непрозрачности
  - заголовок окна над существующим постом не «Создать пост»
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
  - user-flow
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: строки /posts в матрице уже описывают порог
verification:
  - pnpm exec jest tests/new-launch tests/launches tests/menu tests/content-brief tests/content-archive tests/media tests/settings tests/role tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated tests/raw-control.guard tests/hint.guard tests/design.typography tests/design.geometry: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec jest tests/compose-read-only.test.cjs: passed
changed_files:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/components/new-launch/compose-block-reason.tsx
  - apps/frontend/src/components/media/media.component.tsx
  - apps/frontend/src/components/launches/tags.component.tsx
  - apps/frontend/src/components/launches/repeat.component.tsx
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - apps/frontend/src/components/launches/helpers/date.picker.tsx
  - tests/compose-read-only.test.cjs
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
explicit_defers:
  - none
---

# Summary

Режим «только чтение с объяснением» доведён от двух кнопок до всех органов
управления окна.

Он уже существовал: `composeBlockReason` считал причину, `canWritePosts`
выключал «Сохранить как черновик» и «Обновить». Всё, что ведёт к ним, оставалось
живым — Tiptap принимал ввод (`editable` теперь снимается и пересчитывается),
панель начертаний и «Вставить медиа» рисовались (`readOnly` в `Editor` и
`MultiMediaComponent`), тег, повтор, этап и дата открывали списки (у всех
четырёх появился `disabled`, и выключенная кнопка списка не открывает).

Отдельно — вид: у главной кнопки стоял `disabled:opacity-80` поверх общего
`disabled:opacity-50`, и разницы в 20% никто не видел. Свой оттенок снят,
работает общее правило кнопки. Заголовок окна получил три случая вместо одного:
«Создать пост» остался ровно у нового поста.

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
