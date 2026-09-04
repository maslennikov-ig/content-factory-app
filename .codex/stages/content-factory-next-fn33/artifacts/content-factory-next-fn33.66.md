---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: администратор инстанса на /admin/users
public_facade: /admin/users, GET /admin/users, POST /admin/users/:id/unblock
bounded_acceptance: заблокированный аккаунт виден своей меткой, предлагает «Разблокировать», не считается в «Ожидают» и не одобряется
non_goals:
  - разбор уже выключенных аккаунтов на боевой базе
  - письма о разблокировке
  - применение схемы к какой-либо базе
evidence:
  - none
task_id: content-factory-next-fn33.66
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: блокировка отличима от ожидания одобрения
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: изменение схемы и состояния аккаунта — необратимая поверхность
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma (только колонка blockedAt)
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - docs/operations/user-blocked-at-schema-apply.sql
  - docs/product/roles-matrix.md
  - локали, тесты
success_criteria:
  - блокировка ставит blockedAt, одобрение и разблокировка чистят
  - «Ожидает одобрения» и счётчик «Ожидают» заблокированных не содержат
  - у заблокированного своя метка и действие «Разблокировать»
  - одобрение заблокированного аккаунта отвечает отказом
  - рядом со схемой лежит текст применения и он совпадает с prisma migrate diff
selected_docs:
  - docs/operations/user-language-schema-apply.sql (образец)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - accountState как единственное чтение двух колонок на экране
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
  - migration
  - data
  - state-transition
  - authorization
  - ui
affected_surfaces:
  - database
  - api
  - backend
  - ui
  - user-flow
invariants:
  - state-transition
  - rollback
docs_impact: migration
docs_reviewed: updated
docs_review_notes: docs/operations/user-blocked-at-schema-apply.sql — новый; docs/product/roles-matrix.md — дверь «Разблокировать» и абзац о двух состояниях
verification:
  - pnpm exec jest tests/account-blocked-state.test.cjs: passed
  - pnpm exec jest tests/admin-account-delete.test.cjs tests/pending-account-rejection.test.cjs tests/registration.approval.test.cjs: passed
  - pnpm exec jest tests/prisma-schema-apply-guard.migrate-diff.test.cjs tests/prisma-single-apply-path.test.cjs tests/funnel-proof-user-fixture.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json (после prisma-generate): passed
  - prisma migrate diff --from-schema-datamodel (старая схема) --to-schema-datamodel (новая) --script: совпал со сложенным SQL дословно
  - node scripts/operations/validate-prisma-migration-sql.cjs --mode update --allow-table User: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - docs/operations/user-blocked-at-schema-apply.sql
  - docs/product/roles-matrix.md
  - scripts/evidence/run-public-funnel-database-proof.cjs
  - tests/account-blocked-state.test.cjs
  - шестнадцать локалей (blocked, unblock, account_unblocked)
explicit_defers:
  - reject-дверь по-прежнему считает заблокированный аккаунт «ожидающим» (activated=false); экран его туда не пускает, серверную проверку не трогали — файл вне зоны записи
---

# Summary

**СХЕМА ИЗМЕНЕНА.** В `User` добавлена колонка `blockedAt DateTime?` (nullable,
без индекса, без значения по умолчанию). Текст применения —
`docs/operations/user-blocked-at-schema-apply.sql`, дословно совпадает с выводом
`prisma migrate diff`. Ни к одной базе он не применялся.

Блокировка теперь пишет отметку времени, одобрение и разблокировка её снимают.
Вкладка «Ожидает одобрения» и счётчик «Ожидают» читают `activated: false` вместе
с `blockedAt: null`, так что заблокированный там больше не появляется. На экране
у него своя метка «Заблокирован» опасного цвета и одно действие —
«Разблокировать» (`POST /admin/users/:id/unblock`). Одобрение заблокированного
аккаунта отвечает отказом: это две разные двери, и каждая говорит, что сделала.

# Scope / Routing

Схема тронута ровно одной колонкой, как разрешено задачей. Разблокировка сделана
отдельной дверью, а не переиспользованием approve: approve пишет человеку письмо
«ваш аккаунт готов, входите», а это неправда для того, у кого доступ забрали и
вернули. Письма разблокировка не шлёт вовсе — новых серверных строк не заведено.

Вне зоны записи тронут `scripts/evidence/run-public-funnel-database-proof.cjs`:
страж `tests/funnel-proof-user-fixture.guard.test.cjs` требует, чтобы фикстура
`CREATE TABLE "User"` содержала все колонки модели, иначе пруф не запустится.
Изменение — одна строка колонки.

# Verification

Красный до исправления: 9 из 10 тестов `tests/account-blocked-state.test.cjs`
падали на файлах из HEAD. После — зелено. Схема проверена офлайн:
`migrate diff` из старой схемы в новую печатает ровно
`ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);`, и валидатор
`validate-prisma-migration-sql.cjs` принимает выбранный файл.

# Delivery / Cleanup

Возвращено корню как ветка worktree. Локально выполнен `pnpm run prisma-generate`
(только генерация клиента в node_modules, к базе не обращается).

# Risks / Follow-ups / Explicit Defers

- Шаг выпуска: на боевой базе колонку надо применить ЭТИМ файлом до выката кода.
  До применения запрос списка упадёт на неизвестной колонке.
- Аккаунты, заблокированные ДО применения, останутся с `blockedAt = NULL`, то
  есть в «Ожидает одобрения». Разбирать их — решение владельца, отдельной задачей.
- `POST /admin/users/:id/reject` по-прежнему считает `activated=false` признаком
  ожидающего и потому теоретически достижим для заблокированного аккаунта с
  одной пустой областью. Экран этой кнопки заблокированному не показывает;
  серверную проверку не менял — `rejectPendingAccount` вне зоны записи.
