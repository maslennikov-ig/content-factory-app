---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-C3
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: раздел «Контент» — архив «Что уже написали» и витрина фактов
public_facade: GET /content-intelligence/materials?q=..., GET /content-intelligence/facts?q=...
bounded_acceptance: целевые наборы jest по изменённой поверхности плюс tsc обоих приложений
non_goals:
  - смысловой (векторный) поиск — открытый вопрос владельца, не начат
  - поиск по постам — список с отбором есть, но его файлы вне зоны записи
  - изменение schema.prisma, индексов и расширений Postgres
evidence:
  - archive-routes-search
  - facts-search-suite
  - archive-screen-debounce
  - dto-length-refusal
  - tenant-isolation-guard
  - design-guards
task_id: content-factory-next-odb8.4
epic_id: content-factory-next-odb8
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026, решения владельца
milestone: поиск по архиву и фактам — текстовый, по словам
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: правка идёт через четыре слоя (DTO, контроллер, сервис, репозиторий) и два экрана сразу
repo: content-factory-next
branch: worktree-agent-abf0f2c7c815e2742
base_branch: wave/owner-decisions-2026-09-05
base_commit: 686d7f4b646b0ecf7f97e3458ef49499d6834871
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-abf0f2c7c815e2742
write_zone:
  - apps/backend/src/api/routes/content-material.controller.ts
  - apps/backend/src/api/routes/content-context.controller.ts
  - libraries/nestjs-libraries/src/content-intelligence/**
  - libraries/nestjs-libraries/src/dtos/content-intelligence/**
  - apps/frontend/src/components/content-intelligence/**
  - docs/product/content-section-map.md
  - tests/*.cjs
success_criteria:
  - параметр q принимается и проверяется DTO у материалов и у фактов
  - слова уходят в Prisma where рядом с organizationId, И по словам и ИЛИ по полям
  - поле поиска на двух экранах с задержкой 300 мс и переиспользованным «ничего не найдено»
  - страж межарендной изоляции и стражи оформления зелёные
selected_docs:
  - docs/product/content-section-map.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-C3
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: временные копии для проверки на красноту лежат в scratchpad, в дерево не попали
risk_level: medium
risk_tags:
  - tenancy
  - api
  - ui
affected_surfaces:
  - api
  - backend
  - ui
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/content-section-map.md — поиск построен (текстовый), смысловой назван открытым вопросом, названо непокрытое
verification:
  - pnpm exec jest tests/content-archive tests/content-facts tests/content-material tests/content-intelligence tests/tenant-isolation.guard.test.cjs tests/raw-control.guard.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/content-brief tests/content-context tests/content-search: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/search-terms.ts
  - libraries/nestjs-libraries/src/content-intelligence/materials/content-material.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/materials/content-material.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-fact.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-fact.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-material.dto.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-context.dto.ts
  - apps/backend/src/api/routes/content-material.controller.ts
  - apps/backend/src/api/routes/content-context.controller.ts
  - apps/frontend/src/components/content-intelligence/content-search-words.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.adapter.ts
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - apps/frontend/src/components/content-intelligence/content-facts.adapter.ts
  - apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx
  - docs/product/content-section-map.md
  - tests/content-archive.routes.test.cjs
  - tests/content-archive.screen.test.cjs
  - tests/content-material.routes.test.cjs
  - tests/content-facts.search.test.cjs
explicit_defers:
  - content-factory-next-odb8.4 — поиск по постам: q просится в GetPostsListDto, файлы вне зоны записи
  - content-factory-next-odb8.4 — смысловой поиск: открытый вопрос владельца, не начат
---

# Summary

Построен поиск по словам — тот вариант «а», который владелец выбрал 05.09.2026:
обычный текстовый, быстро и дёшево. Он есть в двух местах: архив «Что уже
написали» и витрина фактов.

Запрос режется на слова один раз и одним кодом на весь раздел
(`content-intelligence/search-terms.ts`). Каждое слово обязано встретиться, но
встретиться может в любом из полей строки: у материала — заголовок и текст, у
факта — утверждение, тема и значение. Всё это обычный `where` Prisma:
`contains` плюс `mode: 'insensitive'`, `AND` по словам, `OR` по полям. Ни
сырого SQL, ни расширений Postgres, ни правок схемы.

Три вещи, которые было легко сделать неправильно и которые сделаны намеренно:

- **Границу пространства слова не двигают.** `organizationId` стоит в том же
  `where`, рядом со словами, а не заменяется ими. Проверено отдельным тестом,
  который ищет по словам `organizationId` и `org-b`.
- **Поиск не переставляет коды материалов.** Код `cnt-03` — это место текста в
  общем списке от старых к новым. Сузь сам список — и при поиске он станет
  `cnt-01`, то есть перестанет быть кодом. Поэтому поиск спрашивает базу
  отдельным запросом за одними идентификаторами (`searchPieceIds`), а список
  читается целиком, как и раньше.
- **Витрина фактов перестала искать у себя.** До этого поле отбирало уже
  полученные строки, а каталог приходит с `take: 100` — то есть поиск честно не
  видел ничего за первой сотней и молчал об этом. Теперь слово уходит на сервер,
  а повторный клиентский отбор убран: он прятал бы факт, подошедший по теме или
  по значению, а не по тексту утверждения.

На экранах: поле `type="search"` рядом с остальными фильтрами, задержка 300 мс
(набранное и спрошенное — два разных значения), состояние «ничего не найдено»
переиспользовано, найденные слова помечены `<mark>` с токенами темы. Поле
остаётся на экране, когда ничего не нашлось: иначе человек с опечаткой теряет
вместе с ответом и то, чем мог бы её поправить.

# Scope / Routing

Зона записи соблюдена: `git status` не показывает ни одного файла вне неё.
`brand-voice/**` и декораторы `@CheckPolicies` не тронуты — они у параллельных
потоков. Словари ru/en живут в самих компонентах (`copy`), как у соседей по
разделу, поэтому `translation.json` не менялся и матрица ролей не затронута:
новых дверей и действий нет, `GET /facts` как был за `Sections.AI`, так и остался.

Один общий файл на два экрана — `content-search-words.tsx` (задержка ввода и
подсветка). Две копии этого разъехались бы задержкой, и одна однажды осталась бы
без подсветки.

Документация внешних зависимостей не понадобилась: `contains` + `mode:
'insensitive'` — давняя и неизменная часть Prisma, версия в репозитории
зафиксирована локом, поведение проверено тестами на поддельном клиенте и типами.

# Verification

Новые тесты сначала красные, проверено руками (`git stash` в этом worktree
запрещён, поэтому реализация временно снималась копией файла и возвращалась):

- `tests/content-archive.routes.test.cjs` — 9 из 11 новых падают, если убрать
  `searchPieceIds` и отбор по нему;
- `tests/content-material.routes.test.cjs` — оба новых падают без
  `ArchiveListQueryDto`;
- `tests/content-archive.screen.test.cjs` + `tests/content-facts.search.test.cjs`
  — 9 падают, если убрать поле поиска из архива и вернуть витрину на клиентский
  отбор.

Зелёные прогоны:

- 15 наборов (архив, факты, материалы, content-intelligence, межарендная
  изоляция, сырой SQL, три стража оформления): 279 тестов, 0 падений;
- бриф, контекст, веб-поиск: 40 тестов, 0 падений;
- `tsc --noEmit` бэкенда и фронтенда: 0 ошибок.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка не сливалась и не выкладывалась.

# Risks / Follow-ups / Explicit Defers

- **Посты остались без поиска.** У них свой список с отбором
  (`GET /posts/list`, `GetPostsListDto`), и `q` просится ровно туда, но эти
  файлы лежали вне зоны записи. Работа маленькая, отдельным потоком.
- **Происхождение занесённого текста не ищется** — площадка, ссылка, заметка
  лежат в `tags` как JSON, а Prisma не ищет в JSON без учёта регистра. Площадка
  при этом отбирается своим фильтром рядом, так что дыры в отборе нет.
- **Источник факта не ищется** — он достижим только через
  `evidenceLinks → evidence → snapshot`, и один запрос стал бы обходом трёх
  таблиц с `contains` по каждой.
- **Индекса под поиск нет.** `contains` без индекса — это проход по таблице
  рабочего пространства. На нынешних объёмах это дёшево и ровно то, что владелец
  просил; когда архив вырастет, вопрос вернётся вместе с вопросом о смысловом
  поиске.
- **Допущение, принятое за владельца** (консервативное, требует подтверждения):
  подсветка найденного показывается только в заголовке материала и в тексте
  утверждения — там, где человек читает строку, — а не во всех полях, по которым
  идёт отбор.
- **Живого прогона в браузере не было.** Проверено тестами на поддельном
  сервере; макета у архива по-прежнему нет.
