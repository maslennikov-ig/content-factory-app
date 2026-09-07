---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: Z2_core_adapt_intake
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: двери заготовок (Z3), экраны (Z5), окно поста (Z6)
public_facade: нет — сервисы, репозиторий и промпт; HTTP-дверь пишет Z3
bounded_acceptance: суть пишется одним вызовом роли `draft`, заготовка записывается один раз до цикла по каналам, адаптация под канал идёт одной генерацией, вопросы задаются только о том, чего нет в брифе и в карточке канала
non_goals:
  - контроллер, `api.module.ts` и DTO заготовок (Z3)
  - экраны списка и страницы заготовки (Z5)
  - окно поста (Z6)
  - контракт `voice-wiring.contract.ts` (Z4, только чтение)
  - схема и чтение публикации из поста (Z1, влито)
evidence:
  - content-pieces-service
  - backend-typecheck
task_id: content-factory-next-tu3k.9.3
epic_id: content-factory-next-tu3k.9
stage_id: content-factory-next-fn33
session_id: волна «заготовка и адаптации» 07.09.2026
milestone: заготовка и адаптации
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: одна правка проходит через промпт сути, порядок хода входа, новый сервис с семью методами, репозиторий, подсказки графа, DTO и два набора сразу
repo: content-factory-next
branch: worktree-agent-ad0b755a3fce02380
base_branch: wave/pieces-2026-09-07
base_commit: e2d366cb
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad0b755a3fce02380
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/pieces/**
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/channels/channel-questions.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-rules.{ru,en}.ts
  - libraries/nestjs-libraries/src/agent/{agent.module.ts,generator-run-input.ts,agent.graph.service.ts}
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-intake.dto.ts
  - tests/content-pieces.service.test.cjs
  - tests/content-intake.service.test.cjs
success_criteria:
  - три канала дают одну заготовку и три адаптации, суть — простой текст
  - отказ модели на сути не валит вход и помечается `writtenBy: 'fallback'`
  - дословная фраза человека видна в промпте сути и доезжает до неё
  - чужой текст не попадает в промпт сути ни одним полем
  - интервью не больше трёх вопросов за шаг, ответ хранится дословно
  - `adapt` в Telegram спрашивает про крючок, а с `skipInterview` пишет
  - адаптацию опубликованного поста снять нельзя
selected_docs:
  - docs/product/content-section-map.md §11
  - docs/product/content-memory-spec.md, «Где живёт бриф заготовки»
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts, «Заготовка и адаптации»
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-tu3k.9.2.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: tu3k.9
depends_on_streams:
  - content-factory-next-tu3k.9.1
  - content-factory-next-tu3k.9.2
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-ad0b755a3fce02380 не влита, не отправлена; worktree жив, в нём поставлен node_modules по замороженному lockfile
risk_level: medium
risk_tags:
  - paid-model-call-path
  - stream-contract
affected_surfaces:
  - backend
invariants:
  - tenancy
  - cost-ceiling
docs_impact: none
docs_reviewed: read-only
docs_review_notes: §11 карты раздела и подраздел «Где живёт бриф заготовки» описывают ровно то, что сделано; менять их не пришлось
verification:
  - "pnpm exec jest tests/content-pieces.service.test.cjs tests/content-intake.service.test.cjs tests/content-intake.flow.test.cjs tests/content-intake.kind.test.cjs tests/agent.intake-hints.test.cjs tests/ai-usage.consumer-guard.test.cjs tests/ai-role-routing.guard.test.cjs tests/tenant-isolation.guard.test.cjs tests/brand-voice.wiring-contract.test.cjs tests/backend-no-dynamic-alias-import.guard.test.cjs tests/text-quality.slop-check.test.cjs tests/text-quality.anti-copy.test.cjs": "passed — 12 наборов, 249 тестов, 0 падений"
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": "passed — 0"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": "passed — 0 (сверх задания: дверь входа стала принимать запрос без каналов)"
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/pieces/errors.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/core-write.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/core-questions.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/intake-events.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/channels/channel-questions.ts
  - libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-rules.ru.ts
  - libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-rules.en.ts
  - libraries/nestjs-libraries/src/agent/agent.module.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/agent/generator-run-input.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-intake.dto.ts
  - tests/content-pieces.service.test.cjs
  - tests/content-intake.service.test.cjs
explicit_defers:
  - событие `search-started` объявлено в `pieces/intake-events.ts`, а не в контракте — перенос за Z4/корнем
  - `pieces/core-write.ts` не значится в списке `tests/ai-usage.consumer-guard.test.cjs`, а платный вызов делает; файл набора вне зоны потока
  - `PIECE_INTERVIEW_EXHAUSTED` сервером не бросается: круги кончились — модель решает сама. Код остаётся дверям Z3
  - поиск по словам вместе с `includeArchived` не находит архивные строки: переиспользован `searchPieceIds`, а он фильтрует `archivedAt: null`
  - `PieceRepository.createCore` пока никем не зовётся: единственный создатель сути — дверь входа
---

# Summary

Волна поворачивает вход одной мыслью на 90°. До неё каждый выбранный канал
заводил свой `ContentPiece` с HTML одного канала в теле: три канала — три
«текста» там, где текст один. Теперь после брифа один раз пишется **суть** —
нейтральный текст без площадки и без манеры, — а каждый канал получает
**адаптацию**: строку `ContentDerivation` с видом, площадкой и текстом простым
текстом.

Что стало другим по сути:

- **Суть пишет один вызов роли `draft`** операцией `intake`, с промптом,
  который запрещает приглаживать слова человека. Аватар в неё не идёт: он
  применяется при адаптации, и только там.
- **Отказ модели на сути не стоит человеку черновика.** Суть тогда собирается
  из брифа детерминированно и помечается `writtenBy: 'fallback'`; черновики в
  каналах появляются как обычно.
- **Каналы стали необязательными.** «Только заготовка» — законный ход, и
  `INTAKE_CHANNEL_REQUIRED` со входа ушёл; отсутствие канала теперь отвергает
  дверь адаптации кодом `PIECE_CHANNEL_REQUIRED`.
- **Продукт спрашивает только о том, чего не знает.** Ворота брифа (тезис и
  факт) остались первыми и главными; поверх них — до трёх вопросов заготовки о
  том, что модель *предположила*, и до трёх вопросов под канал из карточки
  площадки. Оба круга терминальны, оба пропускаются одной кнопкой.
- **Экран больше не молчит во время поиска**: перед сверкой чисел и перед
  поиском опоры уходит событие `search-started` (`content-factory-next-tu3k.7`).

# Scope / Routing

## Порядок конструктора `PieceService` — договор с наборами и стендом

```ts
constructor(
  private readonly pieces: PieceRepository,          // 1
  private readonly generator: AgentGraphService,     // 2
  @Inject(IntegrationManager)
  private readonly integrationManager: IntegrationManager, // 3
  @Optional() now: () => Date = () => new Date(),    // 4
  @Optional() slopCheck: PieceSlopCheckPort | null = null // 5
)
```

Зависимости первыми, необязательные последними — как у `IntakeService`. Новый
параметр добавляется только в конец и только необязательным.

`AiUsageService` в списке нет намеренно: платного вызова у `PieceService` нет
ни одного. Генерацию оплачивает и учитывает сам `AgentGraphService`
(`executeAiStreamOperation`), а вопросы под канал считаются без модели.

## Публичный интерфейс, на который пишет Z3 — соблюдён дословно

```ts
list(organizationId, query: PiecesQueryV1, language): Promise<PiecesResponseV1>;
detail(organizationId, pieceId, language): Promise<PieceDetailV1>;
prepareAdapt(organizationId, pieceId, request: PieceAdaptRequestV1, language): Promise<PieceAdaptPlanV1>;
adapt(organizationId, plan: PieceAdaptPlanV1, actorUserId?): AsyncGenerator<PieceAdaptEventV1>;
deleteAdaptation(organizationId, pieceId, adaptationId): Promise<void>;
archive(organizationId, pieceId, archived): Promise<void>;
```

`PieceAdaptPlanV1` (экспортируется из `pieces/piece.service.ts`) несёт сверх
объявленного контрактом: `channel` (имя, провайдер, разобранная карточка
письма, предел знаков, редактор), `core` (`ZagotovkaCoreV1 | null`),
`legacyBody`, `title`. Всё это уже прочитано в `prepareAdapt`, и второе чтение
в `adapt` означало бы второй запрос за тем же.

**Регистрация — `AgentModule`** (тот же модуль, что у `IntakeService`),
провайдерами и с экспортом: `PieceRepository` и `PieceService`. Модуль
`@Global`, поэтому контроллер в `ApiModule` инжектирует их без импорта.

## Швы к Z3

- Отказы до первого байта бросает **`prepareAdapt`**, все шесть:
  `PIECE_NOT_FOUND`, `PIECE_ARCHIVED`, `PIECE_CHANNEL_REQUIRED`,
  `PIECE_CHANNEL_UNKNOWN`, `PIECE_CHANNEL_UNSUPPORTED`,
  `ADAPTATION_KIND_UNSUPPORTED`. Класс — `PieceError` из `pieces/errors.ts`, с
  полями `code`, `status` (из `PIECE_ERROR_CODES`) и `subject`; `safeHttpError`
  контроллера читает его так же, как `IntakeError`.
- `deleteAdaptation` бросает `ADAPTATION_NOT_FOUND` и `ADAPTATION_PUBLISHED`,
  `archive` — `PIECE_NOT_FOUND`. **Языка эти два метода не принимают** (подпись
  задана заданием), поэтому текст отказа русский; когда двери начнут передавать
  язык, он придёт сюда так же, как в `detail`.
- `adapt` — асинхронный генератор `PieceAdaptEventV1`. Всё после первого байта
  приходит последней строкой `{name:'error'}`; `questions` терминально.

## Швы к Z5 (события)

Стрим создания (`IntakeService.run`) теперь отдаёт объединение
`IntakeEventWithSearchV1` (объявлено в `pieces/intake-events.ts`):

| событие | когда | что нового |
| --- | --- | --- |
| `search-started` | перед сверкой чисел и перед поиском опоры | `{reason: 'claims' \| 'facts', count}` — **члена нет в контракте**, объявлен в `pieces/` |
| `piece-questions` | после `brief-filled`, вместо генерации | `{questions, round}`, терминально |
| `piece` | после записи заготовки, до цикла по каналам | `{pieceId, code, core}`; `code` — `cnt-NN`, готовая строка «Заготовка сохранена» |
| `draft` | как раньше | добавлено `adaptationId`; `pieceId` — теперь id ЗАГОТОВКИ, один на все каналы |

Стрим адаптации — `PieceAdaptEventV1` контракта без изменений:
`adapt-started` → (`questions` терминально) → `content-context` → `generator` →
`adaptation` → `done`.

## Точный текст системной части промпта сути (ru)

Английская версия — перевод по смыслу, тот же порядок правил.

```
Ты пишешь СУТЬ: нейтральный текст о том, что человек хочет рассказать, без площадки и без манеры. Это не пост и не пересказ брифа — это опора, из которой потом сделают тексты под разные площадки.
Правила, все обязательные:
1) фразы, числа, имена и примеры из слов человека переносятся ДОСЛОВНО, как написаны, с их опечатками и шероховатостями; не переформулируй и не улучшай их; достраивай только связки между ними;
2) ничего не добавляй сверх брифа и фактов с пометкой «подтверждено»: число, которого нет во входе, не пиши; пример, которого не было, не выдумывай;
3) запрещены сглаживание, вводные обороты, обобщения вместо частностей, выводы «в итоге» и «таким образом», призывы и вопросы читателю;
4) если слов человека мало — суть короткая; короткая правда лучше длинного пересказа; три предложения — нормальная суть;
5) начинай с той фразы человека, которая ближе всего к тезису, — дословно;
6) без разметки, эмодзи, заголовков и списков; абзацы через пустую строку; язык — язык ввода;
7) не используй обороты из списка: <40 оборотов из каталога штампов, через «; »>.
```

Пользовательская часть — три огороженных блока по образцу `untrustedBlock`:

```
СЛОВА ЧЕЛОВЕКА (дословно)
--- BLOCK START ---
<ввод человека одной строкой; для чужого поста блока нет вовсе>
--- BLOCK END ---

ОТВЕТЫ НА ВОПРОСЫ (дословно)
--- BLOCK START ---
<вопрос> → <ответ>      // только origin `person` и `confirmed`
--- BLOCK END ---

БРИФ (что модель поняла)
--- BLOCK START ---
тезис: … / позиция: … / возражение: … / адресат: …
факты подтверждённые: …
факты НЕ подтверждённые (в суть не идут): …
тема чужого поста: … / угол … / строение … / что чужой пост утверждает (пересказ, не его слова): …
--- BLOCK END ---
```

**Список запрещённых оборотов берётся из каталога проверки на штампы**, а не
пишется рядом вторым списком: `forbiddenPhrasesFor(locale)` в `core-write.ts`
читает `RU_FORBIDDEN_PHRASE_GROUPS` и `EN_FORBIDDEN_PHRASE_GROUPS`, которые
собраны из тех же массивов, по которым работают правила. Берётся **по кругу**,
по одной фразе из группы: сорок строк подряд заняли бы одни вводные слова, и
про канцелярит или рамку чат-бота модель не услышала бы вовсе. Сейчас в списке
40 оборотов из девяти правил (ru) и 37 из пяти (en).

# Decisions

Каждое решение — с причиной, потому что каждое можно было принять иначе.

1. **Чужой текст в промпт сути не идёт вообще, даже отрезками ≤8 слов.**
   Задание допускало «отрезки ≤8 слов, как уже делает вход», но восемь слов
   подряд — это ровно тот порог, который антикопия считает переносом, а набор
   обязан доказать, что чужого текста в промпте нет. Едут тема, угол, строение
   и утверждения, которые разбор уже пересказал СВОИМИ словами. Блок «СЛОВА
   ЧЕЛОВЕКА» для вставленного поста пуст: своих слов у человека там нет.
2. **Антикопия сути — один повторный заход внутри той же операции.** Как в
   графе (`repairForeignCopy`): если суть по чужому посту унесла восемь слов
   подряд, отрезки цитируются обратно и модель отвечает второй раз. Операция
   одна, платная единица одна; без чужого поста второго захода не бывает
   никогда. Поля под отчёт антикопии в `ZagotovkaCoreV1` нет, поэтому находка
   не сохраняется — она предотвращается.
3. **`INTAKE_CHANNEL_REQUIRED` со входа снят совсем** (задание разрешало
   «решить по коду»). Другого выражения «клиент явно требует адаптацию без
   канала» на этой двери нет: у создания нет флага «мне нужен черновик».
   Пустой список теперь значит «только заготовка», а тот же по смыслу отказ
   живёт на двери адаптации как `PIECE_CHANNEL_REQUIRED`. `ArrayMinSize(1)`
   снят и в DTO.
4. **Круги интервью кончились — модель решает сама, а не `PIECE_INTERVIEW_EXHAUSTED`.**
   Человек к этому моменту уже дважды ответил; взять ответы и не дать текста —
   худшее, что можно сделать после этого. Код остаётся дверям Z3 на случай,
   когда третий круг просит сам клиент.
5. **Вопросы заготовки живут поверх ворот, а не вместо них.** Ворота
   (`evaluateBrief`) отвечают за пустоту: без тезиса или факта дальше не идут.
   Интервью отвечает за догадку: тезис или позиция с происхождением `model`,
   отсутствие своего факта. Оба события терминальны, поэтому больше трёх
   вопросов за шаг не бывает арифметически.
6. **Код заготовки — место строки среди ВСЕХ заготовок области, архивные
   включая.** Материалы считают код по неархивному списку, и там архивирование
   переставляет номера. Здесь `listPieces` читает область целиком, а архив
   прячет сервис — так `cnt-12` остаётся `cnt-12` при любом фильтре. Цена:
   в области с архивными строками код в новой вкладке может отличаться от кода
   в старой вкладке материалов.
7. **Поиск по словам — тот же `searchPieceIds`, что у материалов.** Отдельный
   запрос за идентификаторами, а не сужение списка: сузь список — и `cnt-07`
   при поиске станет `cnt-02`. Следствие, записанное в отложенное: этот запрос
   фильтрует `archivedAt: null`, поэтому поиск вместе с `includeArchived`
   архивные строки не находит.
8. **`PieceRepository` не дублирует ни одного запроса.** Адаптации читает
   `ContentMaterialRepository.adaptationsByPiece` (инжектирован), заготовку и
   адаптацию пишет `ContentBriefRepository` (инжектирован) — `createCore`,
   `createAdaptation` и `createDraft` здесь только имена этих записей на
   стороне заготовок. Второе место, где живёт «состояние читается из поста»,
   один раз уже разошлось с правдой на три месяца.
9. **`recordCore` возвращает `{id, code}`.** Стрим обещает человеку строку
   «Заготовка сохранена — cnt-NN» сразу (§11.3), а код — это место строки в
   списке. Считается `count`, а не выборкой: тела остальных заготовок ради
   одного числа не нужны.
10. **Имя канала у адаптации — из поста, а если поста нет — из списка каналов
    области.** Это работа, оставленная Z1: у `ContentDerivation.integrationId`
    внешнего ключа нет.
11. **`deleteAdaptation` снимает только строку производной, `deleteMany`.**
    Пост остаётся: он мог быть отправлен, запланирован или просто открыт.
    `deleteMany` вместо `delete` ради `organizationId` в `where`.
12. **Суть едет генератору подсказкой `intake.core`, а не запросом.**
    `research` остаётся тезисом. Поле аддитивно, граф читает его в `briefBlock`
    строкой «carry its words, numbers, names and examples over VERBATIM»; без
    подсказок ни одна строка промпта не меняется — это проверяет
    `agent.intake-hints`.

# Verification

Node 22.23.2, из корня worktree. Ни сети, ни модели, ни стенда, ни базы:
`getChatModel` подменён во всех наборах, генератор — подделка.

```
pnpm exec jest tests/content-pieces.service.test.cjs \
  tests/content-intake.service.test.cjs tests/content-intake.flow.test.cjs \
  tests/content-intake.kind.test.cjs tests/agent.intake-hints.test.cjs \
  tests/ai-usage.consumer-guard.test.cjs tests/ai-role-routing.guard.test.cjs \
  tests/tenant-isolation.guard.test.cjs tests/brand-voice.wiring-contract.test.cjs \
  tests/backend-no-dynamic-alias-import.guard.test.cjs \
  tests/text-quality.slop-check.test.cjs tests/text-quality.anti-copy.test.cjs
# 12 наборов, 249 тестов, 0 падений

pnpm exec tsc --noEmit -p apps/backend/tsconfig.json    # 0
pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json   # 0
```

Сверх заданного списка прогнаны `text-quality.slop-check` и
`text-quality.anti-copy` — я правил каталог штампов, — а фронтенд проверен
типами потому, что дверь входа стала принимать запрос без каналов.

`tests/content-pieces.service.test.cjs` — 31 тест. Доказано, в частности:
`recordCore` один раз и `recordAdaptation` трижды на три канала со ссылкой на
одну заготовку; суть без единого тега, а пост с разметкой; ровно один вызов
роли `draft`; дословная фраза с опечаткой («сдивнулся») видна в промпте и
доезжает до сути; чужой пост в промпт сути не попадает ни целиком, ни фразой;
отказ модели даёт `fallback`, черновик при этом есть и ошибок в стриме нет;
отчёт о штампах лежит в `brief.slop` с названными правилами; интервью — три
вопроса, у первого предложение модели, у личной детали честный `null`, ответ
хранится дословно и делает поле брифа `person`; `adapt` в Telegram даёт
`questions` с `hook` и подсказкой «80–180», а с `skipInterview` — `adaptation`
и `done`; снятие адаптации опубликованного поста — `ADAPTATION_PUBLISHED` и
строка не тронута.

`tests/content-intake.service.test.cjs` правлен минимально: три сценария,
которые судят дорогу до черновика, получили `skipInterview: true` (иначе они
судили бы интервью), в подделку репозитория добавлены `recordCore` и
`recordAdaptation`, а строка «без канала → `INTAKE_CHANNEL_REQUIRED`» стала
«без канала → отказа нет».

Рецензент не звался (указание задания).

# Blockers / Owner input

Блокеров нет. Два места, где нужно слово корневого сеанса, а не владельца:

1. **Событие `search-started` объявлено вне контракта.** Правка
   `voice-wiring.contract.ts` — работа Z4, поэтому член союза объявлен в
   `pieces/intake-events.ts` (`IntakeEventWithSearchV1`) аддитивно: старый
   читатель `IntakeEventV1` не ломается, он просто не знает этого имени.
   Перенос в контракт — за корнем.
2. **`pieces/core-write.ts` делает платный вызов и не значится в списке
   `tests/ai-usage.consumer-guard.test.cjs`.** Вызов идёт через
   `aiUsage.executeAiOperation`, то есть правило соблюдено; но файл набора вне
   зоны потока, и добавить строку в список должен корень.

# Risks / Follow-ups / Explicit Defers

- **Интервью терминально, и это заметно.** Короткий путь «сразу для Telegram»
  теперь по умолчанию сначала спрашивает — если в брифе есть догадка модели или
  нет своего факта. Экран обязан посылать `skipInterview` там, где обещал
  «черновик сразу»; это работа Z5 и первый кандидат на замечание владельца при
  живом прогоне.
- **Код заготовки может разойтись с кодом в старой вкладке материалов** в
  области с архивными строками (решение 6).
- **Поиск + `includeArchived`** не находит архивные строки (решение 7).
- **`PieceRepository.createCore` пока не зовётся никем**: единственный
  создатель сути — дверь входа, и она пишет через `ContentBriefRepository`.
  Имя оставлено как объявленный швом вход для Z3, если дверь заготовок когда-то
  начнёт создавать суть сама.
- **`ADAPTATION_DRAFT_FAILED`** — код, которого нет в контракте: он рождается
  уже в стриме (черновик записан, строка не записалась) и приходит строкой
  `{name:'error'}`, где код — свободная строка. Отдельного кода отказа для
  этого случая контракт не заводил и не обязан.
- **Вопросы под канал есть только у Telegram и у двух длинных площадок.**
  Исследование у продукта одно; для VK, LinkedIn и прочих
  `questionsForChannel` честно возвращает пустой список, и адаптация идёт без
  круга вопросов.
