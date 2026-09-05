---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-S
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: n/a
bounded_acceptance: tests/team-invitation-id.test.cjs плюс соседние наборы приглашений и ролей
non_goals:
  - схема базы, уникальный индекс на inviteId
  - старые короткие inviteId, уже записанные на пользователях
evidence:
  - team-invitation-id-red-green
task_id: content-factory-next-fn33.100
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: одна замена источника случайности, но с разбором последствий гонки
repo: content-factory-next
branch: worktree-agent-ae080d20173abc0bb
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae080d20173abc0bb
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - tests/team-invitation-id.test.cjs
success_criteria:
  - обе двери, выдающие приглашение, берут отметку из 122 случайных бит
  - тест падает на makeId(5) и проходит после замены
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
risk_level: medium
risk_tags:
  - idempotency
  - authorization
affected_surfaces:
  - backend
invariants:
  - idempotency
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: дверей и ролей не прибавилось, матрица не меняется
verification:
  - pnpm exec jest tests/team-invitation-id.test.cjs: passed
  - pnpm exec jest tests/team-invitation-flow.test.cjs tests/invite.signing.test.cjs tests/registration.invitation.test.cjs tests/organization.last-admin.test.cjs tests/team-role-change.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - tests/team-invitation-id.test.cjs
explicit_defers:
  - none
---

# Summary

`inviteId` выдавался как `makeId(5)` — пять знаков из 62-буквенного алфавита, около 9·10⁸ значений. Обе двери, выдающие приглашение (`inviteTeamMember` и `addTeamMemberByEmail`), теперь берут `randomUUID()` — 122 случайных бита.

Почему это не косметика. `inviteId` — не имя, а отметка «на это приглашение уже ответили»: `addUserToOrg` и `createInvitedUser` отказывают, если такая отметка уже стоит на каком-то пользователе. Именно этот отказ не даёт одной ссылке породить два аккаунта, и он правильный. Но тратит отметку приглашённый, а не приглашающий: ссылка прочитана, маркер погашен, и только после этого всплывает совпадение — плоским «не удалось добавить», без второй попытки. Несколько тысяч приглашений за жизнь инстанса — уже область дней рождения для такого алфавита.

Схему не менял: уникального индекса на `inviteId` в схеме нет и он здесь не нужен — 122 бита решают задачу без миграции.

# Scope / Routing

Зона записи — `organizations/**` и новый тест. Внешняя документация не понадобилась: `node:crypto` `randomUUID` уже используется в этом же репозитории (`source-registry.service.ts`, `content-material.service.ts`, соседний `organization.repository.ts`), поведение не зависит от версии зависимости.

# Verification

Красный до правки: два случая из трёх падали, `Received string: "tzc9G"` и `"Ck1Qf"`. После правки шесть наборов зелёные, 63 проверки.

# Delivery / Cleanup

Возвращено корню; ветка потока остаётся.

# Risks / Follow-ups / Explicit Defers

Короткие `inviteId`, записанные на существующих пользователях, остаются как есть — они уже потрачены, и совпадение с новым UUID невозможно. Ничего чинить на боевой не требуется.
