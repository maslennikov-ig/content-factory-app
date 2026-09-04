---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/users-service-admin-audit.test.cjs, tests/roles-matrix.guard.test.cjs, соседние наборы users.service, tsc backend
non_goals:
  - изменение самих действий администратора
  - формат журнала и его хранение
evidence:
  - none
task_id: content-factory-next-fn33.106
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: две мелкие несостыковки кода и документа, одна упирается в чужой файл
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - docs/product/roles-matrix.md
  - tests/roles-matrix.guard.test.cjs
  - tests/users-service-admin-audit.test.cjs
success_criteria:
  - blockAccount и approveAccount пишут в лог автора
  - порядок вкладок в матрице совпадает с settings.component.tsx
  - страж падает, если один из двух порядков сдвинулся
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-r
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - authorization
  - ui
affected_surfaces:
  - backend
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — порядок вкладок настроек приведён к коду
verification:
  - pnpm exec jest tests/users-service-admin-audit.test.cjs tests/account-blocked-state.test.cjs tests/users-service-approval-email.test.cjs tests/user-language-door.test.cjs tests/users-service-rejection-email.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - docs/product/roles-matrix.md
  - tests/roles-matrix.guard.test.cjs
  - tests/users-service-admin-audit.test.cjs
explicit_defers:
  - одна строка в apps/backend/src/api/routes/admin.controller.ts (~203) вне зоны записи: `approveAccount(id)` -> `approveAccount(id, user.id)`
---

# Summary

`blockAccount` теперь пишет в лог автора так же, как `rejectPendingAccount` и `deleteAccount`. `approveAccount` получил необязательный `adminId` и пишет автора, когда его передали; без него в строке стоит `unknown` — честнее, чем строка, которая выглядит полной записью и ею не является.

Порядок вкладок настроек в матрице ролей приведён к коду: «Разработчики» стоят между «Подписями» и «Одобренными приложениями», а не последними. Порядок теперь сверяется стражем: список вкладок вынимается из `settings.component.tsx` в порядке `arr.push`, названия — из строки «Порядок вкладок на экране:» в матрице.

# Scope / Routing

Зона: `users.service.ts` (только два лога), матрица ролей, два набора тестов.

# Verification

Красный до правки: лог давал «Account walker approved» и «Account walker blocked» без автора. Страж порядка проверен искусственным сдвигом документа — падает, порядок восстановлен.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Не сделано и требует решения корня: дверь одобрения `apps/backend/src/api/routes/admin.controller.ts` (~203) вызывает `this._usersService.approveAccount(id)` без автора, а файл вне моей зоны записи. Пока эта строка не станет `approveAccount(id, user.id)`, лог одобрения в работе будет писать `by unknown`. Правка на одну строку, набор `tests/users-service-admin-audit.test.cjs` её уже описывает со стороны службы.
