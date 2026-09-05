---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root-integration-wave/walker-p3-2026-09-05
public_facade: n/a
bounded_acceptance: tests/content-leads.subscription-controls.test.cjs — страж на confirm плюс проверка ответов «Да»/«Нет»
non_goals:
  - схема Prisma не меняется
  - боевые данные не переименовываются и не мигрируются
evidence:
  - content-leads-subscription-controls-jest
task_id: content-factory-next-fn33.129
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: зачистка живого прогона владельца
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка нескольких поверхностей с тестами и шестнадцатью локалями
repo: content-factory-next
branch: worktree-agent-a73dec396ef7357d8
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a73dec396ef7357d8
write_zone:
  - apps/frontend/src/components/admin/**
  - apps/frontend/src/components/content-intelligence/**
  - libraries/nestjs-libraries/src/database/prisma/{users,organizations}
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - tests/content-leads.subscription-controls.test.cjs — страж на confirm плюс проверка ответов «Да»/«Нет»
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка остаётся на слияние корню
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей нет, матрица ролей не меняется
verification:
  - pnpm exec jest tests/content-leads.subscription-controls.test.cjs: passed
  - pnpm exec jest tests/raw-control.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - tests/content-leads.subscription-controls.test.cjs
explicit_defers:
  - none
---

# Summary

Отписка спрашивает окном продукта; в разделе «Контент» не осталось confirm.

# Scope / Routing

`window.confirm` заменён на `deleteDialog` из `@contentfactory/react/helpers/delete.dialog` —
то же окно, что у остальных необратимых удалений. Заголовок «Отписаться от ленты?», ответы
«Да, отписаться» / «Нет, отмена», по-русски и по-английски через локальный словарь `copy`
этого файла (раздел «Контент» переводится так, а не через i18next).

Страж: ни один компонент `apps/frontend/src/components/content-intelligence/` не зовёт
`confirm`. Комментарии перед поиском срезаются — иначе страж запрещал бы записать причину,
по которой браузерное окно ушло.

Проверено и поведение: нажатие только спрашивает, `POST …/archive` уходит лишь после «Да».

# Verification

Все команды под Node 22.23.2 из `.nvmrc`, в своём worktree.

- `pnpm exec jest tests/content-leads.subscription-controls.test.cjs` — passed
- `pnpm exec jest tests/raw-control.guard.test.cjs` — passed
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — passed

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a73dec396ef7357d8`; слияние и очистка за корнем.

# Risks / Follow-ups / Explicit Defers

Окно продукта рисуется через `DecisionEverywhere` в оболочке приложения; на странице без оболочки вопрос не покажется — на этом экране оболочка есть.
