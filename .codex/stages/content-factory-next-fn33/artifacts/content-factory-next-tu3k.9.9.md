---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: Z5_screens
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: вкладка «Контент → Заготовки», страница /content/pieces/[id], вход «Новая заготовка», стенд обзора
public_facade: n/a
bounded_acceptance: набор `tests/content-pieces.screen.test.cjs` плюс тронутые наборы раздела «Контент», входа и стражи дизайна; tsc фронтенда
non_goals:
  - сервер заготовок и адаптаций, чтение состояния из поста (потоки Z2, Z3)
  - перекраска окна поста и строки боковой панели «Чистый лист» / «Новая заготовка» (поток Z6, файлы launches/* и new-launch/*)
  - контракт и фикстура (поток Z4) — читаются, не правятся
  - схема базы и перенос старых строк
evidence:
  - pieces_screen_suite_green
  - frontend_typecheck_clean
task_id: content-factory-next-tu3k.9.9
epic_id: content-factory-next-tu3k.9
stage_id: content-factory-next-fn33
session_id: волна «заготовка и адаптации» 06.09.2026
milestone: заготовка и адаптации
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: таблица состояний, где неверное слово в клетке — это неправда экрана о том, вышел пост или нет
repo: content-factory-next
branch: worktree-agent-a7b1449f767b74a74
base_branch: wave/pieces-2026-09-07
base_commit: 2ae8e461
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a7b1449f767b74a74
write_zone:
  - apps/frontend/src/components/content-intelligence/pieces/**
  - apps/frontend/src/components/content-intelligence/shared/**
  - apps/frontend/src/components/content-intelligence/intake/**
  - apps/frontend/src/components/content-intelligence/{content-section.screen.tsx,content-section.copy.ts,content-section.tabs.ts}
  - apps/frontend/src/app/(app)/(site)/content/**
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/**
  - docs/design/component-inventory.md
  - tests/content-pieces.screen.test.cjs
  - tests/{content-intake.screen,content-section.route}.test.cjs
success_criteria:
  - полоса площадок рисует ровно колонки ответа, и каждая клетка называет своё состояние словом
  - строка без cells читается как «пока не знаем», а не «ещё нет» поверх существующих постов
  - пустая клетка спокойна: пунктир, никаких счётчиков «заполнено N из M» и тревожного цвета
  - клетка без канала выключена и объясняет себя до нажатия
  - фильтр «Ещё нет в…» оставляет строки без адаптации на площадке и не забирает те, про которые ответ молчит
  - кнопка входа читается «Сделать заготовку» без каналов и «Сделать и написать для «X»» с одним
  - вкладка `materials` называется «Заготовки», стоит первой, адреса `?tab=materials` и `?tab=archive` живы
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/design/component-inventory.md
  - docs/product/content-section-map.md §11
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: волна tu3k.9
depends_on_streams:
  - Z4 (контракт и фикстура — получены до старта, коммит cda33a86)
  - Z2 (чтение состояния публикации в клетки списка)
  - Z3 (двери GET/POST/DELETE /content-intelligence/pieces/*)
  - Z6 (окно поста и строки боковой панели)
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка живёт в worktree, не сливалась и не пушилась; в корне worktree стоит symlink node_modules на основной чекаут, он не отслеживается Git
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: docs/design/component-inventory.md
docs_reviewed: updated
docs_review_notes: добавлен блок «Заготовка и адаптации» со строкой клетки AdaptationCell и строками экранов, общего блока результата и хука окна поста
verification:
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec jest tests/content-pieces.screen.test.cjs": passed (11/11)
  - "pnpm exec jest tests/content-pieces.screen.test.cjs tests/content-intake.screen.test.cjs tests/content-section.route.test.cjs tests/content-section-tabs.boundary.guard.test.cjs tests/brand-voice.materials-tab.test.cjs tests/design.guard.test.cjs tests/design.typography.test.cjs tests/design.contrast.test.cjs tests/i18n.ui-literals.test.cjs tests/brand-voice.wiring-contract.test.cjs": passed (175/175)
changed_files:
  - apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts
  - apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts
  - apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx
  - apps/frontend/src/components/content-intelligence/pieces/pieces.container.tsx
  - apps/frontend/src/components/content-intelligence/pieces/adaptation.cell.tsx
  - apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx
  - apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx
  - apps/frontend/src/components/content-intelligence/pieces/pieces.review-scene.tsx
  - apps/frontend/src/components/content-intelligence/shared/draft-result.tsx
  - apps/frontend/src/components/content-intelligence/shared/use-open-post.tsx
  - apps/frontend/src/components/content-intelligence/intake/intake.adapter.ts
  - apps/frontend/src/components/content-intelligence/intake/intake.copy.ts
  - apps/frontend/src/components/content-intelligence/intake/intake.screen.tsx
  - apps/frontend/src/components/content-intelligence/intake/intake.container.tsx
  - apps/frontend/src/components/content-intelligence/intake/questions.card.tsx
  - apps/frontend/src/components/content-intelligence/content-section.tabs.ts
  - apps/frontend/src/components/content-intelligence/content-section.copy.ts
  - apps/frontend/src/components/content-intelligence/content-section.screen.tsx
  - apps/frontend/src/app/(app)/(site)/content/pieces/[id]/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx
  - docs/design/component-inventory.md
  - tests/content-pieces.screen.test.cjs
  - tests/content-intake.screen.test.cjs
  - tests/content-section.route.test.cjs
explicit_defers:
  - строка «Заготовка сохранена — cnt-NN» показывает код и адрес, но не суть: событие `piece` контракта несёт `core`, а экран его не разбирает — суть человек видит на странице заготовки, а не в ленте входа
  - выбор вида адаптации (`kind`) на странице берёт первый из `kinds` площадки; выбора вида человеком в этой волне нет
  - `ContentReadOnlyNote` зовётся с `surface="brief"`: значения «заготовки» в его объединении нет, а `content-write-right.tsx` вне зоны записи
  - удаление адаптации отказывается на экране до запроса, когда состояние `published`; ответ `ADAPTATION_PUBLISHED` от двери тоже разбирается — обе ветки печатают одну фразу
  - архив заготовки (`POST /archive`) адаптером объявлен и не вызывается ни одним экраном: кнопки «В архив» в макете §11 нет
  - переводы `translation.json` не тронуты: строк раздела в них не появилось, а боковая панель — работа потока Z6
---

# Summary

Заготовки собраны со стороны экрана целиком: таблица во вкладке «Заготовки»
(первой в разделе), страница заготовки по адресу `/content/pieces/[id]`, общий
блок результата, интервью с ответом модели и вход, ставший «Новой заготовкой».

Таблица — код и заголовок в закреплённой первой колонке, формат, дата и дальше
по колонке на площадку. Клетка называет своё состояние словом и датой:
«опубликовано · 06.09.26», «запланировано · 08.09 10:00», «черновик», «не
ушло», «ещё нет» пунктиром, «нет канала» выключенной с причиной и «пока не
знаем» там, где ответ клеток не дал. Нажатие на занятую клетку открывает пост
в том же окне, что календарь; нажатие на пустую ведёт на страницу заготовки с
уже выбранной площадкой. Строка раскрывается на месте: суть, квитанция «Что
модель поняла», адаптации поимённо и находки проверки на штампы. Ниже 720 px
таблицы нет — карточки.

Страница заготовки: суть слева (или текст одного канала с предупреждением, что
это не суть), квитанция справа, под сутью — находки, считанные при создании,
причём вердикт `rewrite` ничего не запрещает и говорит это вслух. Ниже —
адаптации, «Куда адаптировать» с выключенной площадкой без канала и ссылкой на
каналы, строка «Позже: видео, аудио» и стрим адаптации с карточкой интервью.

Вход стал «Новой заготовкой»: канал больше не обязателен, надпись на кнопке
меняется от выбора, а после стрима видна строка «Заготовка сохранена — cnt-NN»
со ссылкой на страницу.

# Scope / Routing

Зона записи — папка `pieces/`, новая папка `shared/`, вход, три файла рамки
раздела, маршрут страницы, стенд обзора, строка инвентаря и наборы. Сервера
дверей ещё нет: адаптер написан против типов контракта Z4, а сцены обзора и
набор идут на `pieces.fixture.ts`. Ни одна форма ответа не выдумана.

Два места собраны не заново, а вынесены:

- `shared/draft-result.tsx` — блок результата, живший внутри экрана входа.
  Странице заготовки он нужен слово в слово, и второй такой блок рядом с
  первым разошёлся бы на третьем поле.
- `shared/use-open-post.tsx` — открыть окно поста по `postId`. Флаги окна
  (`EDITOR_MODAL`) не переписаны: хук зовёт то, что уже лежит в
  `brand-voice/voice-materials.adapter.ts`, — их перенос в `compose.modal.ts`
  делает поток Z6 вместе с перекраской окна.

Карточка интервью не третья: `SuggestedQuestionsCard` добавлена в тот же файл,
что и `QuestionsCard` входа, и слов не знает — они приходят пропсом, поэтому
ей одинаково служат словарь входа и словарь заготовок.

Новый компонент ровно один — `AdaptationCell`, и его строка добавлена в
`docs/design/component-inventory.md` тем же коммитом.

# Verification

Все команды из `verification` выполнены в worktree на Node 22.23.2:
`tsc --noEmit` фронтенда — ноль ошибок; десять наборов jest, 175 тестов,
зелёные. Браузер и стенд не запускались, платных вызовов не было (владелец:
«скорость важнее тестов и UX-проверок»).

Три существующих набора обновлены минимально и по делу: полоса вкладок теперь
начинается с «Заготовок», первый вид вкладки — таблица заготовок, а кнопка
входа читается «Сделать заготовку».

Отдельно стоит сказать, чего проверка не покрывает: контейнеры (`pieces`,
`piece`) наборами не заведены — стрим адаптации, круги интервью и отказ
`ADAPTATION_PUBLISHED` проверены только типами и чтением. Это осознанный
пробел под ту же команду про скорость; когда двери Z3 появятся, дорога целиком
проверяется одним набором на настоящем NDJSON, как это сделано у входа.

# Delivery / Cleanup

Ветка `worktree-agent-a7b1449f767b74a74`, три коммита, не отправлена. Слияние
и приёмка — за корневым сеансом. В корне worktree создан symlink `node_modules`
на основной чекаут (иначе `tsc` и `jest` не запускаются); Git его не видит.

# Risks / Follow-ups / Explicit Defers

## Что экран читает из контракта, а что нет

Читает: `PiecesResponseV1` целиком (`state`, `columns`, `pieces`, `notice`);
у строки — `id`, `code`, `title`, `format`, `date`, `excerpt`, `coreExtracted`,
`origin`, `cells`, `archivedAt`; у клетки — `platform`, `state`, `date`,
`postId`, `more`; `PieceDetailV1` целиком (`core`, `legacyBody`, `adaptations`,
`targets`, `later`, `notice`), внутри сути — `text`, `brief`, `slop`,
`writtenBy`, `authorNumbers`; вопросы интервью с `suggested`, `why`, `options`;
события `adapt-started`, `questions`, `adaptation`, `done`, `error` и события
входа `piece`, `piece-questions`.

Не читает, хотя контракт даёт:

- `PieceCellV1.url` и `adaptationId` — клетка открывает пост окном по
  `postId`, а не ссылкой наружу; `integrationId` в клетке тоже не нужен, канал
  виден в раскрытой строке;
- `PieceColumnV1.channels` и `adaptations` — порядок колонок берётся из ответа
  как есть, а число каналов площадки на шапке не печатается: это счётчик,
  которого §11.7 просит избегать;
- `PieceRowV1.createdAt` и `voiceVersion` — сортировка серверная, а версия
  голоса на этом экране ничего не решает;
- `ZagotovkaCoreV1.answers` — ответы человека видны в квитанции как
  происхождение строк, отдельным списком не печатаются;
- `AdaptationV1.checks`, `mediaId`, `title` — проверка адаптации по кнопке в
  этой волне не показывается;
- `PIECE_ERROR_CODES` разбирается только там, где отказ виден человеку
  (`ADAPTATION_PUBLISHED`); остальные печатают сообщение сервера как есть.

Чего в контракте не хватило (записываю, не правлю):

- у ответа списка нет счётчика всего и страницы: список показывает то, что
  прислали, и пагинации у него нет. Для пространства с сотнями заготовок это
  станет вопросом к Z3;
- `PieceCellV1.more` даёт число, но не имена остальных каналов площадки —
  поимённо они видны только в раскрытой строке, то есть после второго запроса;
- у `PieceQuestionV1` нет признака «этот вопрос уже задавали»: круги считает
  клиент, и при перезагрузке страницы счёт начинается заново.

## Швы

**К Z2 и Z3 (сервер).** Экран ждёт `GET /content-intelligence/pieces` с
параметрами `q`, `missingOn`, `state`, `includeArchived`; `GET .../:id`;
`POST .../:id/adapt` NDJSON по `PieceAdaptEventV1`;
`DELETE .../:id/adaptations/:adaptationId`; `POST .../:id/archive`. Отбор по
`q`, `missingOn` и `state` применяется ещё и на клиенте — нарочно: пока дверь
параметра не знает, фильтр всё равно работает, а когда узнает, второй проход
ничего не меняет. Единственное настоящее требование к Z2: **ключ `cells` либо
есть, либо его нет**. Пустой массив клеток означает «читали и не нашли»,
отсутствие ключа — «ещё не читали», и экран рисует их по-разному.

**К Z6 (окно поста).** Клетка и страница открывают окно через
`shared/use-open-post.tsx`, который зовёт готовые `EDITOR_MODAL`,
`editorChannels`, `editorDate` из `brand-voice/voice-materials.adapter.ts`.
Свой набор флагов не заведён. Когда Z6 вынесет флаги в `compose.modal.ts`,
менять надо один файл — этот хук; вход одной мыслью после этой волны тоже
ходит через него, своей копии `openEditor` у него больше нет.

**К Z6 (боковая панель).** Строки «Создать пост» → «Чистый лист» и «Из мысли»
→ «Новая заготовка» этот поток не трогал: файлы `launches/*` и `new-launch/*`
вне зоны. Заголовок самого экрана входа уже читается «Новая заготовка», так
что после Z6 надпись в панели и заголовок за ней совпадут.
