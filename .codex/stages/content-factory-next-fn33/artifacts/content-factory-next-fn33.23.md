---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-B
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: /admin/users (администратор инстанса)
public_facade: POST /admin/users/:id/delete
bounded_acceptance: удаление снимает членства везде, единоличную область удаляет, общую оставляет, себя и администратора инстанса не трогает
non_goals:
  - удаление области вместе с её содержимым (нужны каскады в схеме — отдельное решение)
  - письмо человеку при удалении
evidence:
  - none
task_id: content-factory-next-fn33.23
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений живого прогона 04.09.2026
milestone: действия администратора инстанса над аккаунтами
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: разбор каскадов Prisma и порядка удаления в транзакции
repo: content-factory-next
branch: worktree-agent-ad8ec9510fe7f572c
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad8ec9510fe7f572c
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/admin-account-delete.test.cjs
success_criteria:
  - действие «Удалить» с подтверждением для любого не-суперадминистратора
  - единоличная область удаляется, общая остаётся
  - строка в матрице ролей, запись в лог, письмо не шлём
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
risk_level: high
risk_tags:
  - authorization
  - data
  - atomicity
  - ui
affected_surfaces:
  - backend
  - data
  - ui
invariants:
  - state-transition
  - rollback
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: новый раздел «Что администратор инстанса может сделать с аккаунтом» в docs/product/roles-matrix.md
verification:
  - pnpm exec jest tests/admin-account-delete.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/admin-account-delete.test.cjs
explicit_defers:
  - удаление единоличной области вместе с содержимым — нужен отдельный bead с изменением схемы
---

# Summary

У администратора инстанса появилось действие «Удалить» — разрушающая кнопка с
подтверждением, доступная для любого аккаунта, кроме себя и кроме другого
администратора инстанса. Удаление снимает членства во всех областях; область,
где человек единственный участник, удаляется вместе с ним; область с другими
участниками остаётся. Всё в одной сериализуемой транзакции с тем же ограниченным
повтором `P2034`, что и отказ (повтор вынесен в общий метод, а не скопирован).

# Scope / Routing

Отклонение от «Сделать:» — одно и крупное. Bead просил второе подтверждение
«вместе с областью и её данными», если в единоличной области есть контент. Так
сделать нельзя без изменения схемы: у почти всех связей `Organization` в
`schema.prisma` нет `onDelete` (каскад есть только у `AiProviderSetting`,
`ProductEvent` и ещё нескольких), а миграций в репозитории нет — схема
накатывается точечно. `organization.delete` для непустой области ответил бы
ошибкой внешнего ключа, а «удалить руками» — это полсотни `deleteMany` в
правильном порядке, вслепую, без проверки на живой базе.

Поэтому удаление отказывается там, где отказала бы база, и говорит, почему:
`409` с кодом `account_delete_workspace_has_content` (единоличная область ещё
держит содержимое) или `account_delete_user_has_content` (за человеком остались
его собственные записи — комментарии, записи маркетплейса, одобренное
приложение). Экран показывает это словами, а не конвертом JSON. Доказательство
пустоты области переиспользовано из отказа, а не скопировано; для человека
заведено такое же — `EMPTY_USER_RELATIONS`, только по связям без каскада.

# Verification

- `pnpm exec jest tests/admin-account-delete.test.cjs` — 11 тестов, зелено; на
  коде до правки падали все 11.
- `pnpm exec jest tests/roles-matrix.guard.test.cjs` — 44 теста, зелено.
- `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs
  tests/foundation.test.cjs` — 48 тестов, зелено.
- `pnpm exec jest tests/locale-translated.test.cjs tests/locale-key-set.test.cjs`
  — зелено; шесть новых ключей есть во всех шестнадцати языках, в семи
  нелатинских — своим письмом, а не английским текстом.
- `pnpm exec tsc --noEmit` для бэкенда и фронтенда — ноль ошибок.

# Delivery / Cleanup

Отдельный коммит на ветке потока после `e28c40b8`.

# Risks / Follow-ups / Explicit Defers

- Владельцу: подтвердить, что отказ вместо второго подтверждения приемлем, и
  завести отдельный bead на удаление области с данными (изменение схемы —
  каскады по `Organization`; на боевом это ALTER на каждый внешний ключ).
- Заблокированный `57141f9d` удалится этой кнопкой только если его область
  пуста; если он успел что-то создать, будет `409` с текстом.
- Письмо при удалении не шлётся (допущение bead).
