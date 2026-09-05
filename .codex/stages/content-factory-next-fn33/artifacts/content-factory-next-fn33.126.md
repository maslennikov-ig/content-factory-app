---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root-integration-wave/walker-p3-2026-09-05
public_facade: n/a
bounded_acceptance: tests/admin-accounts-search-count.test.cjs зелёный — `matching` под разбивку, `total` неподвижен
non_goals:
  - схема Prisma не меняется
  - боевые данные не переименовываются и не мигрируются
evidence:
  - admin-accounts-search-count-jest
task_id: content-factory-next-fn33.126
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
  - tests/admin-accounts-search-count.test.cjs зелёный — `matching` под разбивку, `total` неподвижен
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
  - api
  - ui
affected_surfaces:
  - backend
  - api
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей нет, матрица ролей не меняется
verification:
  - pnpm exec jest tests/admin-accounts-search-count.test.cjs: passed
  - pnpm exec jest tests/account-blocked-state.test.cjs tests/admin-account-delete.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/interface-review/settings-admin/admin-users.scene.tsx
  - tests/admin-accounts-search-count.test.cjs
  - tests/account-blocked-state.test.cjs
explicit_defers:
  - none
---

# Summary

Разбивка списка аккаунтов считает найденное, а не всю базу.

# Scope / Routing

`countAccounts` принимал только статус, а `listAccounts` фильтровал ещё и по поиску —
два условия разошлись, и число страниц бралось из всей базы. Условие теперь одно,
`accountsWhere(status, search)`, и его читают оба запроса.

Ответ вырос на одно поле: `matching` — сколько строк выбирает текущая вкладка и поиск,
и только на нём строится разбивка. `total` и `pending` остались фактами об инстансе
(шапка «Ожидают: X / Y») и от ввода в поле поиска не двигаются: если бы `total` стал
фильтрованным, шапка врала бы про инстанс.

Считается безусловным четвёртым `count`, а не веткой «если есть поиск»: ветка должна была
бы каждый раз угадывать, который из двух других счётчиков сейчас значит то же самое.

Отклонение от зоны записи: `interface-review/settings-admin/admin-users.scene.tsx` —
одна строка `matching` в подставном ответе, иначе `tsc` фронтенда красный.

# Verification

Все команды под Node 22.23.2 из `.nvmrc`, в своём worktree.

- `pnpm exec jest tests/admin-accounts-search-count.test.cjs` — passed
- `pnpm exec jest tests/account-blocked-state.test.cjs tests/admin-account-delete.test.cjs` — passed
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — passed
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — passed

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a73dec396ef7357d8`; слияние и очистка за корнем.

# Risks / Follow-ups / Explicit Defers

Ответ `/admin/users` вырос на поле `matching`; фронтенд без него разбивку не построит — выкатывать бэкенд и фронтенд вместе. Один дополнительный `count` на запрос списка.
