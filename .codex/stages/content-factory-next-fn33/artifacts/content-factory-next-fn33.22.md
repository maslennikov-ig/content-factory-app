---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-B
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: /admin/users (администратор инстанса)
public_facade: POST /admin/users/:id/reject
bounded_acceptance: отказ проходит для области без меток и для области с метками на другом языке; в логе видно, кто отказал
non_goals:
  - createOrgAndUser и посев меток при регистрации (другой поток)
  - изменение schema.prisma
evidence:
  - none
task_id: content-factory-next-fn33.22
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений живого прогона 04.09.2026
milestone: действия администратора инстанса над аккаунтами
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка с доказательством пустоты в транзакции и разбором каскадов Prisma
repo: content-factory-next
branch: worktree-agent-ad8ec9510fe7f572c
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad8ec9510fe7f572c
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - tests/pending-account-rejection.test.cjs
success_criteria:
  - сравнение меток убрано, проверка «нет пользовательских данных» осталась
  - метки удаляются любые
  - отказ пишет в лог «Account <id> rejected by <adminId>»
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
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка живёт до слияния корнем
risk_level: medium
risk_tags:
  - authorization
  - atomicity
  - data
affected_surfaces:
  - backend
  - data
invariants:
  - state-transition
  - rollback
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: строка про отказ вошла в docs/product/roles-matrix.md вместе с fn33.23
verification:
  - pnpm exec jest tests/pending-account-rejection.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - tests/pending-account-rejection.test.cjs
explicit_defers:
  - none
---

# Summary

Доказательство пустоты области больше не сверяет метки. Раньше оно требовало,
чтобы метки области совпали один в один с посевом `CONTENT_WORKFLOW_TAGS`,
переведённым на язык аккаунта в момент отказа, — на боевом это делало отказ
невозможным сразу по двум причинам (область без меток; язык аккаунта `en` при
русском посеве). Осталась проверка, что в области нет пользовательских данных;
она вынесена в общую константу `EMPTY_ORGANIZATION_RELATIONS`, потому что её же
переиспользует удаление аккаунта (`fn33.23`). Метки удаляются любые.

Строгость по двум связям, которые пишет сама регистрация (`productEvents` только
`register` этого человека и нетронутый `aiProvider`), сохранена: ожидающий
аккаунт не мог их изменить, не войдя.

Отказ теперь пишет в лог, кто его сделал, как одобрение и блокировка: сервис
получил `adminId`, контроллер передаёт `user.id`.

# Scope / Routing

Зона записи — репозиторий/сервис/контроллер аккаунтов и их тесты. Внешняя
документация не нужна: правка целиком про наш собственный код и нашу схему
Prisma, версионного поведения зависимостей не касается.

# Verification

- `pnpm exec jest tests/pending-account-rejection.test.cjs` — 20 тестов, зелено.
  Три новых («область без меток», «метки на другом языке», «переименованная и
  мягко удалённая метка») на прежнем коде падали с 400.
- `pnpm exec jest` по девяти смежным наборам — 122 теста, зелено.
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — ноль ошибок.

# Delivery / Cleanup

Коммит `e28c40b8` на ветке потока, вместе с `fn33.30` (обе правки лежат в одном
методе сервиса). Слияние — за корнем.

# Risks / Follow-ups / Explicit Defers

Импорты `CONTENT_WORKFLOW_TAGS`, `CONTENT_WORKFLOW_TAG_KEYS`,
`resolveBackendLocale` и `translateBackendString` из `users.repository.ts`
удалены — они там больше нигде не нужны. Если параллельный поток по
`createOrgAndUser` добавит их использование, это будет конфликт слияния в шапке
файла, разрешаемый возвратом импорта.
