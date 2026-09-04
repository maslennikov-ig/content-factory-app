---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: администратор области, повысивший человека по ошибке
public_facade: Настройки -> Команды, PUT /settings/team/:id и DELETE /settings/team/:id
bounded_acceptance: администратор понижает и удаляет равного администратора, пока в области остаётся хотя бы один администратор; себя не меняет никто
non_goals:
  - отдельный признак «владелец области» вне ролей
  - право участника или редактора действовать на равного
  - /admin/users и его двери
evidence:
  - none
task_id: content-factory-next-fn33.50
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: повышение до администратора обратимо
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: изменение правила авторизации, границы — весь смысл задачи
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - apps/frontend/src/components/settings/teams.component.tsx
  - docs/product/roles-matrix.md
  - tests
success_criteria:
  - равный администратор понижается и удаляется, если администраторов больше одного
  - последний администратор не понижается и не удаляется
  - равенство без роли администратора права не даёт (USER и EDITOR)
  - своя строка по-прежнему без контролов
  - матрица ролей называет правило, страж зелёный
selected_docs:
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - organizationRoleLevel и isOrganizationAdmin как единственная лестница ролей
parallel_group: fn33-wave-04-09-2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: ветка оставлена корню на слияние
risk_level: high
risk_tags:
  - authorization
  - state-transition
  - ui
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - authorization
  - state-transition
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — абзац про равных администраторов у /settings/team и оговорка в разделе уровней
verification:
  - pnpm exec jest tests/team-role-change.test.cjs tests/organization.last-admin.test.cjs tests/team-screen.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs tests/superadmin-role.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - apps/frontend/src/components/settings/teams.component.tsx
  - docs/product/roles-matrix.md
  - tests/team-role-change.test.cjs
  - tests/team-screen.test.cjs
explicit_defers:
  - content-factory-next-fn33.82 — та же находка, закрывается этим же изменением
---

# Summary

Повышение до администратора перестало быть односторонней дверью. Правило «строго
ниже себя» заменено на «ниже себя, либо равный, если ты администратор и в области
остаётся хотя бы один администратор» — та же оговорка, что уже защищала
последнего администратора от удаления. Себя по-прежнему не меняет никто.
Равенство само по себе права не даёт: `USER` и `EDITOR` равны по уровню и
никем не управляют.

Экран команды показывает выпадающий список роли и «Удалить» на строке равного
администратора; своя строка и строка выше — по-прежнему текст.

# Scope / Routing

Зона записи — служба организаций, экран команды, матрица ролей и тесты.
`deleteTeamMember` уже разрешал равный уровень; добавлено только требование
роли администратора, чтобы обе двери читались одинаково. Новых зависимостей и
внешней документации не потребовалось: правило целиком внутреннее.

# Verification

Красный до исправления: три новых теста в `tests/team-role-change.test.cjs`
(равного понижаем, последнего администратора нет, повышение равного до
администратора никого не спрашивает) и «an equal administrator keeps both
controls» в `tests/team-screen.test.cjs`. После — зелено, вместе с прежними
границами и стражем матрицы.

# Delivery / Cleanup

Возвращено корню как ветка worktree; слияние и закрытие bead — за корнем.

# Risks / Follow-ups / Explicit Defers

Оговорка «останется хотя бы один администратор» в смене роли сегодня почти
недостижима: понижать равного может только администратор, а значит их минимум
двое. Проверка написана всё равно — недостижимость держится на списке выдаваемых
ролей, а не на этом методе.
Допущение для владельца: правило по умолчанию выбрано этим потоком (равный
администратор управляем), отдельного признака «владелец области» не заводили.
