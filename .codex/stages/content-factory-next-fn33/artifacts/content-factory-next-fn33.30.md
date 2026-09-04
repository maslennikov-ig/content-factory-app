---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-B
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: человек, чью регистрацию отклонили
public_facade: POST /admin/users/:id/reject
bounded_acceptance: письмо ставится в очередь после успешного отказа; ошибка очереди отказ не откатывает
non_goals:
  - письмо при удалении аккаунта (решение владельца — не слать)
  - причина отказа и ссылки в письме
evidence:
  - none
task_id: content-factory-next-fn33.30
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений живого прогона 04.09.2026
milestone: действия администратора инстанса над аккаунтами
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: порядок чтения адреса до удаления и поведение при отказе очереди
repo: content-factory-next
branch: worktree-agent-ad8ec9510fe7f572c
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad8ec9510fe7f572c
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests/users-service-rejection-email.test.cjs
success_criteria:
  - короткое письмо без причины и без ссылок, на языке аккаунта
  - адрес и язык читаются до удаления
  - при ошибке очереди отказ остаётся
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-wave-04092026
depends_on_streams:
  - content-factory-next-fn33.22
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка живёт до слияния корнем
risk_level: low
risk_tags:
  - user-flow
affected_surfaces:
  - backend
invariants:
  - none
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: строка про письмо при отказе — в docs/product/roles-matrix.md
verification:
  - pnpm exec jest tests/users-service-rejection-email.test.cjs: passed
  - pnpm exec jest tests/backend-locale-strings.test.cjs: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests/users-service-rejection-email.test.cjs
explicit_defers:
  - none
---

# Summary

Отказ ожидающему аккаунту перестал быть молчаливым. Человеку уходит одно
короткое письмо: «Запрос на аккаунт в Content Factory отклонён администратором»,
без причины и без единой ссылки — администратор инстанса отказывает по своим
основаниям, а ссылка звала бы ту же регистрацию обратно. Два новых ключа в
каталоге бэкенда, все шестнадцать языков.

Порядок важен и закреплён тестом: адрес и язык читаются до удаления (после
удаления читать нечего), письмо ставится в очередь после удаления, а отказ
очереди только пишется в лог — аккаунт уже удалён, и повторять удаление
администратора просить нельзя. Путь письма тот же, что у одобрения:
`NotificationService.sendEmail` → `EmailService` → воркфлоу `send_email_v2`.
Настоящих писем не отправлялось: в тестах очередь замокана.

# Scope / Routing

Зона записи — сервис аккаунтов, каталог строк бэкенда, тест. Внешняя
документация не требуется: используется уже существующий в репозитории путь
отправки письма.

# Verification

- `pnpm exec jest tests/users-service-rejection-email.test.cjs` — 6 тестов,
  зелено (язык, отсутствие ссылок, ошибка очереди, 404, лог).
- `pnpm exec jest tests/backend-locale-strings.test.cjs` — новые ключи есть во
  всех шестнадцати локалях.
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — ноль ошибок.

# Delivery / Cleanup

Коммит `e28c40b8` вместе с `fn33.22`: обе правки — один и тот же метод сервиса.

# Risks / Follow-ups / Explicit Defers

Владельцу подтвердить текст письма (умолчание из bead взято дословно). Если
почтового провайдера на инстансе нет, письмо просто не уйдёт — отказ от этого не
меняется.
