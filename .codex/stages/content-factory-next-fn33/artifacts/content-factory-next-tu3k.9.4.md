---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: Z3_doors
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: экраны заготовок (Z5), окно поста (Z6), сервис заготовок (Z2 — подписи)
public_facade: пять дверей `/content-intelligence/pieces` и DTO к ним
bounded_acceptance: маршруты совпадают с `PIECE_ROUTES` по методу и пути; отказ до первого байта — HTTP с кодом контракта, после — последней строкой NDJSON; у каждой двери с телом есть DTO, а удаление берёт оба идентификатора из пути
non_goals:
  - реализация `PieceService` и `PieceError` (Z2) — здесь только заглушка подписей
  - контракт `voice-wiring.contract.ts` (Z4, только чтение)
  - экраны списка и страницы заготовки (Z5)
  - создание заготовки — осталось на двери входа `POST /content-intelligence/intake`
evidence:
  - content-piece-routes
task_id: content-factory-next-tu3k.9.4
epic_id: content-factory-next-tu3k.9
stage_id: content-factory-next-fn33
session_id: волна «заготовка и адаптации» 07.09.2026
milestone: заготовка и адаптации
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: medium
model_reasoning_rationale: пять дверей против готового контракта и двух образцов рядом; сложность в границе отказа и в правах, а не в объёме
repo: content-factory-next
branch: worktree-agent-ab2de459db20dea3f
base_branch: wave/pieces-2026-09-07
base_commit: e2d366cb
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ab2de459db20dea3f
write_zone:
  - apps/backend/src/api/routes/content-piece.controller.ts
  - apps/backend/src/api/api.module.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/{piece.service.ts,errors.ts}
  - docs/product/roles-matrix.md
  - tests/content-piece.routes.test.cjs
success_criteria:
  - пять маршрутов и ни одного сверх `PIECE_ROUTES`
  - `prepareAdapt` отказывает обычным HTTP до первого байта, `adapt` — последней строкой `{name:'error'}`
  - чтение открыто участнику области, запись — редактору, и раскладка ролей это печатает
  - удаление адаптации не принимает тела и не имеет пути без `adaptationId`
  - `tsc --noEmit` по бэкенду ноль с заглушкой сервиса
selected_docs:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: tu3k.9
depends_on_streams:
  - content-factory-next-tu3k.9.1
  - content-factory-next-tu3k.9.3
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-ab2de459db20dea3f не влита, не отправлена; worktree жив; в нём заведена ссылка node_modules на корневой репозиторий (в .gitignore, в коммит не попала)
risk_level: medium
risk_tags:
  - api-surface
  - permissions
affected_surfaces:
  - backend
  - docs
invariants:
  - tenancy
  - authorization
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: roles-matrix.md — три строки дверей записи, абзац про пять дверей раздела и счётчик дверей с политикой (был «сто тридцать» при 134 в таблице, стал «сто тридцать семь» при 137)
verification:
  - "pnpm exec jest tests/content-piece.routes.test.cjs tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs tests/ai-usage.consumer-guard.test.cjs tests/ai-doors-throttle.test.cjs tests/backend-no-dynamic-alias-import.guard.test.cjs tests/brand-voice.wiring-contract.test.cjs": "passed — 7 наборов, 149 тестов, 0 падений"
  - "pnpm exec jest tests/auth.registration-throttle.test.cjs tests/product-events.backend.test.cjs tests/public-growth-event.test.cjs": "passed — 3 набора, 107 тестов, 0 падений (соседи по правленому ограничителю частоты)"
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": "passed — exit 0 с заглушкой сервиса"
changed_files:
  - apps/backend/src/api/routes/content-piece.controller.ts
  - apps/backend/src/api/api.module.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/errors.ts
  - libraries/nestjs-libraries/src/throttler/throttler.provider.ts
  - docs/product/roles-matrix.md
  - tests/content-piece.routes.test.cjs
  - tests/ai-doors-throttle.test.cjs
explicit_defers:
  - реализация `PieceService` и `PieceError` — заглушки заменяются файлами Z2 при слиянии
  - язык дверей берётся из `?language=`, потому что ни один запрос контракта его не несёт; если Z2/Z5 решат иначе, это одна строка
  - `PIECE_INTERVIEW_EXHAUSTED` дверь не различает: до первого байта он придёт как обычный HTTP, в стриме — последней строкой, и обе дороги уже открыты
  - тексты отказов, кроме двух на двери удаления, приходят от сервиса; второго набора слов дверь не заводит
---

# Summary

Пять дверей заготовки: список, страница, адаптация стримом, удаление одной
адаптации, архив. Написаны против интерфейса `PieceService`, который
параллельно пишет поток Z2; чтобы контроллер типизировался до слияния, в
`content-intelligence/pieces/` лежит **заглушка** из подписей и пустого класса
отказа — оба файла с первой строкой
`// ЗАГЛУШКА Z3: заменяется реализацией Z2 при слиянии`.

Шестой двери — создания — здесь нет намеренно: заготовка рождается на входе
одной мыслью (`POST /content-intelligence/intake`), как и объявляет
`PIECE_ROUTES.create`. Набор это проверяет отдельным тестом, чтобы дубль
создания не появился позже «за компанию».

Граница отказа проходит по первому байту и повторяет дверь входа дословно.
Пока стрим не начался, `prepareAdapt` отказывает обычным HTTP с кодом и
статусом из `PIECE_ERROR_CODES`; как только пошли строки NDJSON, статус уже не
изменить, и всё остальное приходит последней строкой
`{name:'error', error:true, code, message}`.

# Scope / Routing

## Двери и роли

| Метод | Путь | Политика | Кому |
|---|---|---|---|
| `GET` | `/content-intelligence/pieces` | — | любой участник области |
| `GET` | `/content-intelligence/pieces/:id` | — | любой участник области |
| `POST` | `/content-intelligence/pieces/:id/adapt` | `POSTS_PER_MONTH`, `EDITOR` | редактор |
| `DELETE` | `/content-intelligence/pieces/:id/adaptations/:adaptationId` | `EDITOR` | редактор |
| `POST` | `/content-intelligence/pieces/:id/archive` | `EDITOR` | редактор |

Оба чтения без политики — как список материалов: библиотеку области читает
любой её участник, и роль редактора начинается там, где начинается запись
(решение владельца 05.09.2026, `content-factory-next-fn33.90`). Следствие для
раскладки ролей: строк в таблице три, а не пять, потому что таблица перечисляет
двери **с политикой**; пять дверей названы абзацем под ней, и страж
`roles-matrix.guard` от этого зелёный (строка без дверей его валит).

У адаптации две политики через И, тарифный предел первым — область, у которой
кончились посты на месяц, должна услышать про месяц, а не про роль. Причина та
же, что у входа и у черновика из материала.

## Заглушка: что именно заменить при слиянии

Два файла, оба целиком:

- `libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts`
  — шесть подписей (`list`, `detail`, `prepareAdapt`, `adapt`,
  `deleteAdaptation`, `archive`), тип `PieceAdaptPlanV1` и тела
  `throw new Error('replaced at merge')`;
- `libraries/nestjs-libraries/src/content-intelligence/pieces/errors.ts` —
  класс `PieceError` с `code`, `status`, `subject`.

Провайдера в модуле библиотеки заглушка **не** объявляет: `PieceService`
регистрирует Z2 в `AgentModule`, и второй провайдер того же имени был бы гонкой
двух реализаций. `AgentModule` глобальный и уже импортирован в `AppModule`,
поэтому в `api.module.ts` менять импорты не пришлось — контроллер получит
настоящий сервис ровно тогда, когда Z2 добавит его в провайдеры.

Контроллер не зависит ни от конструктора `PieceError`, ни от `instanceof`: он
читает `code`, `status`, `message` и `subject` утиной типизацией, тем же
`safeHttpError`, что вход и бриф. Набор дверей по той же причине собирает отказы
не настоящим классом, а `Object.assign(new Error(msg), {code, status})` — тогда
порядок аргументов в конструкторе Z2 набор не ломает.

## Решения, которые стоит знать соседям

**Язык — из `?language=`.** Ни `PiecesQueryV1`, ни `PieceAdaptRequestV1`, ни
`PieceArchiveRequestV1` языка не несут, а сервис принимает его четвёртым
аргументом. Взят тот же разбор, что у двери брифа: `'en' → 'en'`, всё
остальное — `'ru'`. Если экран решит слать язык телом, это одна строка в DTO и
одна в маршруте.

**Два текста отказа живут в контроллере, и только два.** На двери удаления:
`ADAPTATION_PUBLISHED` («Происхождение опубликованного текста не стирается…») и
`ADAPTATION_NOT_FOUND`. Они запасные — если сервис прислал своё предложение,
доходит его слово. Остальные коды называет сервис, и второй набор слов для них
разошёлся бы с первым на первой же правке.

**`kind: 'video'` DTO пропускает, а `kind: 'videoclip'` — нет.** Видео и аудио
объявлены контрактом (`ADAPTATION_KINDS_LATER`), поэтому отказ по ним должен
быть кодом `ADAPTATION_KIND_UNSUPPORTED` с человеческим «позже», а не «неверное
значение поля» из проверяющего. Мусор вне шести видов не проходит вовсе.

**`origin: 'model'` дверь не принимает.** «Реши сама» — это `decideKeys`;
позволить клиенту прислать слова модели как ответ человека значило бы дать
модели цитировать саму себя от имени автора.

**У удаления нет тела.** Прямое следствие `content-factory-next-fn33.90.3`:
дверь удаления, принявшая пустое тело как «все», стёрла все посты области
стенда. Набор проверяет не только отсутствие `@Body`, но и то, что в
контроллере нет ни одного `@Delete` с путём без `adaptationId`.

## Выход за объявленную зону — два файла, оба названы

Задание объявило зону без ограничителя частоты, но его же раздел «Verification»
прямо велел поставить `adapt` под потолок ИИ-дверей, если она туда просится.
Она просится: один запрос — это разбор, интервью и генерация, тот же расход,
что у входа, а дверь без потолка — то, из-за чего заводился
`content-factory-next-5w6u`.

1. `libraries/nestjs-libraries/src/throttler/throttler.provider.ts` — одна
   строка в `AI_PATTERNS`:
   `/^\/content-intelligence\/pieces\/[^/]+\/adapt$/`. Остальные двери раздела
   под потолок не попадают: чтения — не `POST`, архив и удаление модели не
   касаются.
2. `tests/ai-doors-throttle.test.cjs` — строка в перечислении дверей под
   потолком и одна проверка, что архив заготовки под него не попал.

Владельца у этих двух файлов среди потоков волны нет (Z1 — схема, Z2 — сервис,
Z4 — контракт, Z5 — экраны, Z6 — окно поста). Если корневой сеанс решит, что
правка чужая, её можно снять двумя строками — двери от этого не изменятся.

# Verification

Node 22.23.2, из корня worktree. Ни сети, ни модели, ни стенда, ни базы.

- `pnpm exec jest` по семи наборам задания — **7 наборов, 149 тестов, 0
  падений**. Новый `tests/content-piece.routes.test.cjs` — 29 тестов;
- `pnpm exec jest` по трём соседям правленого ограничителя частоты
  (`auth.registration-throttle`, `product-events.backend`,
  `public-growth-event`) — **3 набора, 107 тестов, 0 падений**;
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — **0**, с заглушкой
  сервиса.

Первой ошибки нет ни в одной команде.

В worktree не было `node_modules`: заведена ссылка на каталог корневого
репозитория. Она в `.gitignore` и в коммит не попала.

Рецензент не звался (указание задания).

# Blockers / Owner input

Блокирующего нет. Контракта хватило на все пять дверей целиком: коды, статусы,
пути и события покрывают каждый случай, править `voice-wiring.contract.ts` не
пришлось.

Одно место, где контракт молчит и решение принято дверью, — **язык**: запросы
его не несут, сервис его требует, взят `?language=`. Это работа двери, а не
пробел контракта, но при слиянии Z2 и Z5 должны знать, откуда он берётся.

# Risks / Follow-ups / Explicit Defers

- **Заглушка сервиса — самое опасное место слияния.** Если корневой сеанс
  забудет заменить `pieces/piece.service.ts` и `pieces/errors.ts`, бэкенд
  соберётся и пройдёт типизацию, а любая дверь заготовок ответит
  `replaced at merge`. Обе первые строки файлов кричат об этом прямо, и оба
  пути названы выше.
- **Подписи должны совпасть дословно.** Расхождение в порядке аргументов или в
  типе `PieceAdaptPlanV1` увидит `tsc`, но только после слияния, — стоит
  прогнать `tsc --noEmit -p apps/backend/tsconfig.json` сразу после замены.
- **Ответы двух дверей записи (`{deleted:true}`, `{archived}`) контракт не
  описывает.** Сервис возвращает `void`, и экрану нужен хоть какой-то успех;
  если Z5 ждёт другую форму, менять её здесь одной строкой.
- **`PIECE_INTERVIEW_EXHAUSTED` дверь не различает**: сервис волен бросить его
  и до первого байта (тогда это `422`), и в стриме (тогда последняя строка).
  Обе дороги открыты, выбор — за Z2.
- **Счётчик дверей в раскладке ролей** был устаревшим до этой волны («сто
  тридцать» при 134 в таблице). Поправлен на 137, сумма колонки «Дверей»
  сходится с тем, что читает страж.
