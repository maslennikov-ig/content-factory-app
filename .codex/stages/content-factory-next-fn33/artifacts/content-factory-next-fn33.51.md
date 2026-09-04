---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: администратор, меняющий роли подряд
public_facade: GET /settings/team, список участников
bounded_acceptance: строки участников стоят на месте после смены роли
non_goals:
  - подсветка только что изменённой строки
  - сортировка по имени или роли на экране
evidence:
  - none
task_id: content-factory-next-fn33.51
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: список команды не переставляется
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: medium
model_reasoning_rationale: одна строка запроса, но последствие — чужая роль по ошибке
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - tests
success_criteria:
  - getTeam упорядочен по времени вступления, с id как разрешителем ничьей
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-wave-04-09-2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: ветка оставлена корню на слияние
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - backend
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: порядок списка не описан в матрице ролей
verification:
  - pnpm exec jest tests/team-list-order.test.cjs: passed
  - pnpm exec jest tests/tenant-isolation.guard.test.cjs: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - tests/team-list-order.test.cjs
explicit_defers:
  - подсветку изменённой строки не делал: bead называет её «заодно», а порядок решает проблему целиком
---

# Summary

Запрос списка участников не задавал порядок, и Postgres возвращал строки в том
виде, в каком их оставила последняя запись: после смены роли строка уезжала, а
на её место вставал другой человек. Теперь порядок — время вступления, а `id`
разрешает ничью для строк, записанных в одно мгновение (так делает сид стенда).

# Scope / Routing

Один `orderBy` в `getTeam`. Экран не сортирует ничего сам — иначе правда о
порядке жила бы в двух местах.

# Verification

Новый `tests/team-list-order.test.cjs` читает аргументы запроса и падает без
исправления.

# Delivery / Cleanup

Возвращено корню как ветка worktree.

# Risks / Follow-ups / Explicit Defers

Подсветка только что изменённой строки не сделана — отдельная задача, если
владелец захочет.
