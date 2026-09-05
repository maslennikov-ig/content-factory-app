---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-a-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: content-factory-next-fn33.28.2 (окно поста, поток B)
public_facade: POST /posts/:id/context-review
bounded_acceptance: pnpm exec jest jest-post-context-review jest-roles-matrix-guard jest-tenant-isolation-guard jest-posts-save-refusal; pnpm exec tsc --noEmit -p apps/backend/tsconfig.json
non_goals:
  - окно поста и любой файл apps/frontend
  - удаление двери POST /copilot/research
  - применение схемы на боевой базе
evidence:
  - none
task_id: content-factory-next-fn33.28.1
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: сервер: явное решение человека открывает планирование поста с контекстом
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: правило доступа к состоянию поста плюс изменение схемы — цена ошибки выше средней
repo: content-factory-next
branch: worktree-agent-a6c520bbced0a64a2
base_branch: wave/compose-2026-09-04
base_commit: a1a606c20798c1ac02e00f859beacf90f2f238fe
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c520bbced0a64a2
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma (два nullable поля Post)
  - libraries/nestjs-libraries/src/database/prisma/posts/
  - apps/backend/src/api/routes/posts.controller.ts
  - docs/operations/post-context-review-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/content-section-map.md
  - docs/product/roles-matrix.md
  - jest-post-context-review
success_criteria:
  - пост с контекстом без отметки не уходит в план и не публикуется (409 CONTENT_CONTEXT_DRAFT_ONLY)
  - после POST /posts/:id/context-review план и публикация разрешены
  - повторный вызов двери идемпотентен, чужой пост — 404
  - contentContextReviewedAt/ById видны там, где окно берёт пост
selected_docs:
  - none (внешних версионных зависимостей не трогали)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-compose-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока живёт до слияния корнем
risk_level: high
risk_tags:
  - migration
  - authorization
  - tenancy
  - state-transition
  - idempotency
  - data
affected_surfaces:
  - database
  - backend
  - api
invariants:
  - tenancy
  - state-transition
  - idempotency
docs_impact: migration
docs_reviewed: updated
docs_review_notes: production-deploy.md (шаг схемы до образа), post-context-review-schema-apply.sql, content-section-map.md §9.6, roles-matrix.md (дверь без политики)
verification:
  - "pnpm exec jest jest-post-context-review": passed
  - "pnpm exec jest jest-roles-matrix-guard jest-tenant-isolation-guard jest-posts-save-refusal": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm run prisma-generate": passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts
  - apps/backend/src/api/routes/posts.controller.ts
  - docs/operations/post-context-review-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/content-section-map.md
  - docs/product/roles-matrix.md
  - jest-post-context-review
explicit_defers:
  - POST /copilot/research: после потока B у двери не остаётся ни одного вызова в репозитории; не удалена намеренно, решение владельца — оставить разделу «Контент»
  - текст отказа 409 остаётся английским, как у соседних отказов раздела; человеческий русский текст даёт окно по коду CONTENT_CONTEXT_DRAFT_ONLY (поток B)
---

# Summary

Пост, собранный из проверенного контекста, больше не заперт в черновике
навсегда. Граница осталась, но у неё появилась дверь: `POST
/posts/:id/context-review` записывает, кто и когда сказал «подтверждения
проверены», и после этого тот же пост можно ставить в план и публиковать.

Схема изменена: `Post` получил два nullable поля — `contentContextReviewedAt`
и `contentContextReviewedById`. Оператор для боевой базы лежит в
`docs/operations/post-context-review-schema-apply.sql` и применяется **до**
переключения образа волны.

# Scope / Routing

Зона записи — из задания; ни один файл вне неё не тронут. Фронтенд не
затрагивался: окно поста — поток B, контракт с ним (путь двери, ответ
`{ contentContextReviewedAt }`, поля в ответе поста, код отказа) соблюдён
дословно.

Решение по правилу: планирование разрешено, если среди уже существующих строк
запрошенного поста есть хотя бы одна с отметкой, а не если отмечены все.
Дверь ставит отметку на всю связку (`group`), но у ветки можно дописать новое
сообщение, у которого строки ещё нет, — требование «все» отменяло бы решение
человека при каждом дописанном звене.

# Verification

- `pnpm exec jest tests/post.context-review.test.cjs` — 17 тестов, зелено. До
  правок репозитория тот же набор падал 7 тестами из 13 (двери и разрешения
  ещё не было).
- `pnpm exec jest tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs tests/posts.save-refusal.test.cjs` — 57 тестов, зелено.
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — ноль ошибок.
- `pnpm run prisma-generate` — клиент перегенерирован после правки схемы.

Полный `pnpm test` не запускался (запрет общих правил потока).

# Delivery / Cleanup

Коммит на ветке потока, без push. Слияние и закрытие bead — за корнем.

# Risks / Follow-ups / Explicit Defers

- **Шаг схемы на боевой.** Без двух колонок падает обычная правка поста, а не
  редкий экран: порядок «колонки → образ» обязателен.
- Отметка переживает правку текста — решение владельца 04.09.2026, записано в
  карте раздела §9.6, чтобы не читалось как дыра.
- Дверь `POST /copilot/research` после потока B остаётся без вызовов; не
  удалена по указанию задачи.
