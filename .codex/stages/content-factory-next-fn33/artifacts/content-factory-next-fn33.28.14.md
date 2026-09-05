---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D-compose-2026-09-04
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: след происхождения поста (ContentOutputContext)
public_facade: n/a
bounded_acceptance: jest-content-context-provenance-swap
non_goals:
  - механика подмены снимка и снятие отметки проверки — они работают верно
  - срок хранения снимков сам по себе
evidence:
  - jest-content-context-provenance-swap
task_id: content-factory-next-fn33.28.14
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: след происхождения не противоречит сам себе
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: запись в транзакции, где порядок запросов — часть правила
repo: content-factory-next
branch: worktree-agent-aa343c0adcd1a2d38
base_branch: wave/compose-2026-09-04
base_commit: ff7cfe3cff549afcefa95d207f5111d23e299f19
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa343c0adcd1a2d38
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts
  - tests/**
success_criteria:
  - после подмены снимка у поста остаётся одна запись происхождения
  - удаление идёт в той же транзакции, что и запись
  - чистка ограничена одним постом одного пространства
selected_docs:
  - none
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
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: medium
risk_tags:
  - data
  - tenancy
  - atomicity
affected_surfaces:
  - backend
  - data
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: карта раздела описывает снятие и замену контекста; состав следа она не перечисляет
verification:
  - "pnpm exec jest jest-content-context-provenance-swap": passed
  - "pnpm exec jest jest-post-context-review": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts
  - jest-content-context-provenance-swap
explicit_defers:
  - "уже накопленные лишние строки на боевом не чистятся: нужна отдельная разовая правка данных, см. ниже"
---

# Summary

У поста один снимок — значит и один след происхождения.

`writeContentContextDraftProvenance` вела запись одним `upsert` по тройке
(организация, пост, снимок) и прежнюю строку не убирала. Подмена снимка просто
заводила вторую: у поста оставались две записи `ContentOutputContext`, обе со
статусом `VALID`, и прежняя продолжала утверждать, что пост собран из
`ccs-compose-1` и проверен, — хотя `Post.contentContextSnapshotId` уже
`ccs-compose-2`, а отметка проверки с него снята правильно.

Добавлен `deleteMany` записей этого поста под любым ДРУГИМ снимком, до
`upsert`. Порядок — часть правила: обратный оставил бы окно, в котором строк
две. Всё в той же транзакции, что и запись, — клиент сюда приходит
транзакционный.

Удаление сформулировано как «любой другой снимок», а не «вот этот прежний»:
имени прежнего в этом месте нет, и знать его запись не обязана. Заодно это
чинит случай, до которого рецензия не дошла, — пост, у которого строк
накопилось больше двух.

Соседний `DraftEvidence` чистился правильно и раньше (`deleteMany` по посту,
затем `createMany`); здесь то же самое, только уже, потому что строку текущего
снимка перезаписывает `upsert`.

# Scope / Routing

`content-context.finalize.ts` добавлен в зону записи координатором ради этого
пункта. Схема Prisma не менялась.

# Verification

Красное до правки: 3 падения из 5 в
`tests/content-context.provenance-swap.test.cjs`. После правки 5/5.

Набор новый и работает на подменённой базе: предмет проверки — какие запросы
уходят и в каком порядке. Настоящие таблицы проверяет
`post.content-context.test.cjs` против живой базы; его я не запускал — он
поднимает базу сам, а правила потока запрещают трогать общие базы.

Отдельно закреплено, что чистка ограничена одним постом одного пространства:
`deleteMany` без `organizationId` был бы тихой межарендной правкой.

`post.context-review.test.cjs` зелёный (24/24), `tsc --noEmit` по бэкенду —
ноль.

# Risks / Follow-ups / Explicit Defers

- **Нужно от root при выпуске.** Правка чинит запись, но не уже накопленные
  строки. На боевом у постов, которым снимок подменяли, лишние
  `ContentOutputContext` останутся. Разовая чистка — отдельное решение
  владельца с данными на боевом; я её не готовил и не запускал. Пока она не
  сделана, старые снимки таких постов не удалятся по сроку хранения:
  внешний ключ мёртвой строки их держит.
- `post.content-context.test.cjs` (node:test против живой базы) я не прогонял.
  Если у него есть проверка на число строк `ContentOutputContext` после
  подмены, она теперь должна стать строже, а не сломаться, — но подтвердить это
  может только прогон против базы.
