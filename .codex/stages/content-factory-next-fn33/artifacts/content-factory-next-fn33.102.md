---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-S
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: the administrator count runs inside the writing Serializable transaction, so two simultaneous demotions cannot leave a workspace without an administrator
bounded_acceptance: tests/organization.last-admin-race.test.cjs, tests/organization.last-admin.test.cjs, tests/team-role-change.test.cjs, tsc backend
non_goals:
  - схема базы и ограничения на уровне таблицы
  - удаление аккаунта целиком (users.repository.ts, содержит свою копию помощника)
evidence:
  - last-admin-race-red-green
task_id: content-factory-next-fn33.102
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: гонка на записи с инвариантом области, нужен разбор уровня изоляции
repo: content-factory-next
branch: worktree-agent-ae080d20173abc0bb
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae080d20173abc0bb
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - tests/organization.last-admin-race.test.cjs
  - tests/organization.last-admin.test.cjs
  - tests/team-role-change.test.cjs
success_criteria:
  - подсчёт администраторов и запись роли/удаление членства — одна транзакция
  - две одновременные попытки понижения оставляют ровно одного администратора
  - конфликт сериализации повторяется, а не отдаётся наружу
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-S
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: high
risk_tags:
  - concurrency
  - atomicity
  - authorization
  - retry
affected_surfaces:
  - backend
  - data
invariants:
  - state-transition
  - idempotency
docs_impact: none
explicit_defers:
  - serializableWithRetry now exists twice (users.repository.ts, organization.repository.ts); extraction to a shared module is a separate bead
docs_reviewed: no-change-needed
docs_review_notes: дверей не прибавилось, правило «область держит администратора» уже в docs/product/roles-matrix.md
verification:
  - pnpm exec jest tests/organization.last-admin-race.test.cjs: passed
  - pnpm exec jest tests/organization.last-admin.test.cjs tests/team-role-change.test.cjs tests/team-invitation-membership.test.cjs tests/admin-account-delete.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - tests/organization.last-admin-race.test.cjs
  - tests/organization.last-admin.test.cjs
  - tests/team-role-change.test.cjs
---

# Summary

`countAdmins` был отдельным вызовом, запись роли или удаление членства — другим. Два администратора, понижая друг друга в один момент, оба насчитывали двоих, оба проходили проверку и оба писали: область оставалась без администратора, а обратной двери из этого состояния нет — только доступ к базе.

Подсчёт переехал внутрь транзакции, которая пишет. Новый закрытый помощник `keepingAnAdministrator` в `organization.repository.ts` читает членство, считает администраторов и пишет — одной транзакцией на уровне `Serializable`, с ограниченным повтором на `P2034`. `deleteTeamMember` и `updateTeamMemberRole` теперь оба идут через него. `countAdmins` удалён: единственным его читателем был сервис.

**Почему `Serializable`, а не `SELECT … FOR UPDATE`.** Правило репозитория запрещает сырой SQL, а средствами Prisma блокировки строк нет: `FOR UPDATE` доступен только через `$queryRaw`. Взять блокировку косвенно — обновив строку организации внутри транзакции — было бы работающим мьютексом, но это запись в чужую таблицу ради побочного эффекта, и её смысл виден только из комментария. `Serializable` описывает то же самое честно: подсчёт — это предикатное чтение по администраторам одной области, а запись попадает внутрь этого предиката, и это ровно тот цикл «чтение — запись», который снимает снимковая сериализуемость Postgres. Проигравшая транзакция возвращается как `P2034`, помощник её повторяет, повтор перечитывает уже зафиксированный счёт и отказывает по существу — той же фразой, которую человек может понять. Тот же приём уже применён в этом дереве: `users.repository.ts` (`serializableWithRetry`) и `posts.repository.ts` (`autoPost` V2).

**Что изменилось в поведении.** Отказ «область должна сохранить хотя бы одного администратора» при удалении участника раньше был обычным `Error` (пятисотка), теперь это `HttpException` 400 — та же фраза, но код, по которому экран может ответить. При понижении код и фраза не менялись.

Политика «кто над кем» осталась в сервисе целиком: сравнение рангов, запрет менять себе роль, запрет выдавать роль выше своей. Транзакция ей не нужна.

# Scope / Routing

Внешняя документация не понадобилась: уровень изоляции и код `P2034` уже используются в этом же репозитории (`users.repository.ts:483`), приём не новый и не зависит от версии сверх того, что уже собрано и типизировано.

# Verification

Красный до правки: гонка оставляла ноль администраторов (`Expected: 1, Received: 0`), шесть случаев из семи падали. После правки все семь зелёные, соседние наборы тоже.

# Delivery / Cleanup

Возвращено корню; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

- **Дубликат помощника.** `serializableWithRetry` теперь существует дважды: в `users.repository.ts` и в `organization.repository.ts`. Это одно решение в двух копиях, и его надо вынести в общий модуль `database/prisma/`. Не сделано здесь: `users.repository.ts` вне зоны записи этого потока. Отдельная задача для корня.
- Два существующих набора (`organization.last-admin`, `team-role-change`) правлены: их подставные репозитории теперь держат то же правило, что держит настоящий. Без этой правки они доказывали бы отказ, которого никто не делает.
- На боевой ничего применять не требуется: схема не менялась.
