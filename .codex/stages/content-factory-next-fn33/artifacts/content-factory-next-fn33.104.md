---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/auth-middleware-membership.test.cjs, соседние наборы дверей, tsc backend
non_goals:
  - экран, который покажет этот отказ человеку
  - изменение фильтра исключений и поведения 401
evidence:
  - none
task_id: content-factory-next-fn33.104
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка в двери, через которую идёт каждый запрос
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - apps/backend/src/services/auth/auth.middleware.ts
  - tests/auth-middleware-membership.test.cjs
success_criteria:
  - пустой список членств отвечает 403 с кодом workspace_membership_none и текстом
  - участник с рабочей областью проходит дальше
  - остальные ошибки в блоке по-прежнему дают прежний отказ с выходом из сессии
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
risk_level: medium
risk_tags:
  - authorization
  - api
affected_surfaces:
  - api
  - backend
invariants:
  - state-transition
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: матрица ролей описывает двери и роли, а не отказ сессии без членства
verification:
  - pnpm exec jest tests/auth-middleware-membership.test.cjs: passed
  - pnpm exec jest tests/organization.create.test.cjs tests/logged-auth.route-scope.test.cjs tests/media.upload-failure.test.cjs tests/error-collection.filter-order.test.cjs tests/tenant-isolation.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - apps/backend/src/services/auth/auth.middleware.ts
  - tests/auth-middleware-membership.test.cjs
explicit_defers:
  - none
---

# Summary

`if (!organization)` стояло на массиве и никогда не срабатывало: пустой массив истинен. Участник, отключённый в единственной своей области, доходил до `setOrg.apiKey` на `undefined`, и человека отвечал уже сбой — пустой отказ, который к тому же выкидывал браузер из сессии, будто истёк вход.

Теперь пустой список членств — это ответ: 403 с кодом `workspace_membership_none` и фразой о том, что доступ надо восстановить или пригласить заново. Вход при этом действителен, поэтому выхода из сессии не происходит.

Второе, без чего первое не работало: `catch` в этом методе превращал любую ошибку в пустой отказ с выходом из сессии, включая только что написанный. Теперь отказ, который уже сказал почему (любой `HttpException`), проходит как есть, а всё остальное — испорченная подпись, неизвестный аккаунт, упавший вызов — по-прежнему считается негодной сессией.

# Scope / Routing

Один файл двери и новый набор. Текст отказа — по образцу `account_delete_last_admin`: английская фраза и код в теле; словари бэкенда не трогались.

# Verification

Красный до правки: код в теле отказа `undefined` вместо `workspace_membership_none`, статус приходил пустым отказом.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Изменение в `catch` расширяет поведение: `HttpException`, брошенный вызовами внутри блока, теперь дойдёт до клиента вместо 401. Ни `getUserById`, ни `getOrgsByUserId` таких исключений не бросают; при слиянии это стоит перечитать глазами.
