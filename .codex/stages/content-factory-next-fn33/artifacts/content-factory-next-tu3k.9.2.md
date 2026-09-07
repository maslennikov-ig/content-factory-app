---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: Z1_schema_and_publication
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: суть и адаптация (Z2), двери заготовок (Z3), экраны (Z5)
public_facade: нет — репозиторий, чистые функции и шаг схемы
bounded_acceptance: колонки заготовки и адаптации в схеме и в SQL для боевой; состояние адаптации читается из поста одним запросом; аватар сравнивает текст адаптации, а не нейтральную суть
non_goals:
  - двери заготовок и NDJSON адаптации (Z3)
  - запись сути и брифа при входе (Z2)
  - экран списка заготовок (Z5)
  - контракт `voice-wiring.contract.ts` (Z4, только чтение)
evidence:
  - piece-adaptation-state
  - piece-adaptation-schema-apply
task_id: content-factory-next-tu3k.9.2
epic_id: content-factory-next-tu3k.9
stage_id: content-factory-next-fn33
session_id: волна «заготовка и адаптации» 07.09.2026
milestone: заготовка и адаптации
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: одна правка проходит через схему боевой базы, шаг применения, репозиторий, чистую половину и обучение аватара сразу
repo: content-factory-next
branch: worktree-agent-a7eb82e0bb465682e
base_branch: wave/pieces-2026-09-07
base_commit: 2ae8e461
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a7eb82e0bb465682e
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - docs/operations/piece-adaptation-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/content-memory-spec.md
  - libraries/nestjs-libraries/src/content-intelligence/materials/**
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/{voice-edit.repository.ts,recut.ts}
  - tests/piece-adaptation.state.test.cjs
  - tests/brand-voice.edits.test.cjs
  - tests/brand-voice.materials.test.cjs
success_criteria:
  - шесть колонок и индекс в schema.prisma, клиент Prisma перегенерирован
  - SQL для боевой проходит валидатор с --mode update и двумя --allow-table
  - adaptationsByPiece — один findMany с organizationId в where
  - старая вкладка материалов считает те же числа, читая их из поста
  - аватар не учится на разнице между нейтральной сутью и постом
selected_docs:
  - docs/operations/production-deploy.md
  - docs/product/content-memory-spec.md
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: tu3k.9
depends_on_streams:
  - content-factory-next-tu3k.9.1
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-a7eb82e0bb465682e не влита, не отправлена; worktree жив
risk_level: high
risk_tags:
  - data
  - production-schema
affected_surfaces:
  - data
  - backend
invariants:
  - tenancy
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: production-deploy.md (подраздел волны + строка в списке готовых миграций); content-memory-spec.md не менялся — таблицы отката в нём нет
verification:
  - "node scripts/operations/validate-prisma-migration-sql.cjs --mode update --allow-table ContentPiece --allow-table ContentDerivation --diff <migrate diff> --selected docs/operations/piece-adaptation-schema-apply.sql": "passed — SQL apply guard passed: 3 explicitly selected statement(s)"
  - "pnpm exec jest tests/piece-adaptation.state.test.cjs tests/brand-voice.edits.test.cjs tests/brand-voice.materials.test.cjs tests/tenant-isolation.guard.test.cjs tests/brand-voice.wiring-contract.test.cjs tests/prisma-schema-apply-guard.execution.test.cjs tests/content-material.routes.test.cjs tests/content-archive.routes.test.cjs tests/prisma-schema-apply-guard.migrate-diff.test.cjs tests/prisma-single-apply-path.test.cjs": "passed — 10 наборов, 236 тестов, 0 падений"
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm run prisma-generate": "passed — Generated Prisma Client (v6.5.0)"
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - docs/operations/piece-adaptation-schema-apply.sql
  - docs/operations/production-deploy.md
  - libraries/nestjs-libraries/src/content-intelligence/materials/material-presentation.ts
  - libraries/nestjs-libraries/src/content-intelligence/materials/content-material.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/materials/content-material.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-edit.repository.ts
  - tests/piece-adaptation.state.test.cjs
  - tests/brand-voice.edits.test.cjs
  - tests/content-material.routes.test.cjs
explicit_defers:
  - имя канала у адаптации без поста не приходит — Z2 разрешает его из списка каналов области по integrationId
  - читаемая подпись колонки (platformName) остаётся за экраном; columnsOf отдаёт идентификатор провайдера
  - снос колонки ContentDerivation.state — отдельный план миграции, не эта волна
  - в списке готовых миграций production-deploy.md по-прежнему нет ai-role-models-schema-apply.sql (чужая волна, не трогал)
---

# Summary

Схема волны, шаг её применения к боевой, чтение публикации из поста и правка
обучения аватара — одним коммитом, как того требует runbook: образ с этой
схемой без правки `voice-edit.repository.ts` выпускать нельзя.

Что стало другим по сути. Состояние адаптации больше не хранится:
`ContentDerivation.state` три месяца была зеркалом поста, которое никто не
обновлял, и теперь она не читается ни одной строкой кода. Вместо трёх запросов
(`countDerivations` группировкой, `platformsByPiece` через `distinct`,
`listDerivations` по одной заготовке) один `adaptationsByPiece` приносит
адаптации вместе с их постами и закрывает счётчики строки, площадки фильтра
архива и раскрытый список сразу.

И самое опасное: обучение аватара сравнивало отправленный пост с
`ContentPiece.body`. Как только тело заготовки становится нейтральной сутью,
эта пара перестаёт быть правкой человека и становится работой адаптации —
аватар выучил бы «резать текст и добавлять эмодзи». Теперь предложение берётся
из `ContentDerivation.body`, а заготовка `kind='CORE'` без текста адаптации
наблюдения не даёт вовсе.

# Scope / Routing

## Подпись, от которой зависит Z2

```ts
async adaptationsByPiece(
  organizationId: string,
  pieceIds: string[]
): Promise<AdaptationRow[]>
```

Пустой `pieceIds` до базы не доходит и возвращает `[]`. Один `findMany` по
`ContentDerivation`, `where: { organizationId, contentPieceId: { in: pieceIds } }`,
`orderBy: { createdAt: 'asc' }`.

Форма строки (`AdaptationRow`, экспортирован из
`materials/content-material.repository.ts`):

```ts
export type AdaptationRow = {
  id: string;
  contentPieceId: string;
  postId: string | null;
  integrationId: string | null;
  platform: string;
  format: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  mediaId: string | null;
  brandProfileVersionId: string | null;
  createdAt: Date;
  post: {
    state: string;
    releaseURL: string | null;
    publishDate: Date;
    deletedAt: Date | null;
    integration: { id: string; name: string; providerIdentifier: string } | null;
  } | null;
};
```

**Решение, о котором Z2 обязан знать: канал приходит ЧЕРЕЗ ПОСТ, а не по
`integrationId` строки.** У `ContentDerivation.integrationId` нет внешнего
ключа на `Integration`, и заводить его я не стал: это добавило бы к боевой
схеме `ADD CONSTRAINT ... FOREIGN KEY` сверх шести колонок и индекса, которые
объявили и Z4-контракт, и подраздел runbook, — то есть расширило бы DDL на
боевой базе без слова владельца. Причина по существу та же, по которой внешнего
ключа нет у `Post.contentContextReviewedById` (записана в
`post-context-review-schema-apply.sql`): происхождение текста — это след
решения, а не связь, и отвязанный канал не должен ни удалять след, ни
блокироваться им. Следствие: **у адаптации без поста имени канала нет, есть
только `integrationId`** — разрешать его в `AdaptationV1.integrationName` должен
Z2 по списку каналов области, который он и так читает для `targets`.

## Удалённые методы `ContentMaterialRepository`

- `countDerivations(organizationId, contentPieceIds)` — группировка по
  `contentPieceId, state`;
- `platformsByPiece(organizationId, contentPieceIds)` — `distinct` по площадкам;
- `listDerivations(organizationId, contentPieceId)` — строки одной заготовки.

Вместе с ними снят экспортированный тип `DerivationCount`. Ни одного внешнего
потребителя у всех четырёх не было (проверено `grep` по `apps`, `libraries`,
`tests`, `docs`, `scripts`).

## Что добавлено в чистую половину (`material-presentation.ts`)

`adaptationState`, `providerOfPlatform`, `shapeOfProvider`, `KINDS_BY_PROVIDER`,
`kindsOfProvider`, `bestCell`, `columnsOf`, `ADAPTATION_STATE_ORDER`, плюс
структурные типы `AdaptationLike` и `AdaptationPostLike`. Экспорты
`RECUT_PLATFORMS`, `PLATFORM_PROVIDERS`, `derivationState`, `isRecutPlatform`
на месте — их читает фронтенд.

Решения внутри, каждое с причиной в коде:

1. **Неизвестный провайдер получает форму `telegram`, а не `site`.** У формы
   `site` нет потолка длины, и предпросмотр по ней сказал бы «ничего не
   обрежется» там, где площадка обрежет. Ошибка в сторону «придётся сократить»
   дешевле, чем обещание, которого площадка не даёт.
2. **`providerOfPlatform` не заводит новую таблицу перевода.**
   `PLATFORM_PROVIDERS` уже говорит, чем закрывается площадка перекройки;
   `telegram` и `vk` называют сами себя, поэтому под правило попадают ровно
   `site → wordpress` и `newsletter → listmonk`.
3. **`more` считает КАНАЛЫ, а не адаптации.** Две версии в один канал — одна
   строка раскрытого списка, а не два места, где текст вышел.
4. **Адаптация с удалённым постом даёт клетку `draft`, а не `none`.** Строка
   производной на месте и текст в ней на месте; `none` значит «нажатие начнёт
   адаптацию», и рисовать его над существующей работой было бы враньём.
   Отличить `none` от `no_channel` `bestCell` не может — это делает тот, у кого
   на руках список каналов.
5. **`columnsOf().name` — идентификатор провайдера, а не имя канала.** Колонка
   называет площадку, а площадку в области могут закрывать три канала с разными
   именами; читаемую подпись даёт экран (`platformName` в `voice-copy.ts`), это
   перевод, а не факт о данных. Поле `name` во входных каналах принимается
   (сигнатура из задания), но в шапку не идёт.
6. **Площадки фильтра архива берутся из данных без схлопывания имён.** Строка
   сравнивается с тем, что прислал фильтр, а фильтр говорит на языке хранимой
   строки; схлопнуть `site` в `wordpress` здесь значило бы сломать фильтр
   старой вкладки, которую правит другой поток.

## Выход за объявленную зону — три места, все названы

1. **`tests/content-material.routes.test.cjs`** (в зоне значились только
   `brand-voice.edits` и `brand-voice.materials`). Сломался ровно от моей
   правки: подделка Prisma держала производные с колонкой `state` и без поста,
   а состояние теперь читается из поста. Добавлен `post` к трём строкам
   фикстуры, ассерты не тронуты; `post-2` намеренно стоит в `QUEUE` —
   настоящем имени состояния поста, — чтобы перевод в `queued` был проверен.
   Владельца у этого файла среди потоков волны нет (Z2 — суть и адаптация,
   Z3 — двери, Z5 — экраны, Z6 — окно поста).
2. **Список готовых миграций в `production-deploy.md`** (моя зона — только
   подраздел волны). Документ прямо требует, чтобы список совпадал с
   `ls docs/operations/*-schema-apply.sql`. Строка добавлена на месте
   ДУБЛЯ `integration-writing-profile-schema-apply.sql`: он значился дважды, и
   вторая запись противоречила первой («не применён» при «применён 06.09.2026»).
3. **`stream_owner` в шапке — `Z1_schema_and_publication`, а не `Z1`.**
   Задание называло `Z1`, но `scripts/orchestration/validate_artifact.py`
   сверяет это поле с манифестом стадии, а там записано
   `Z1_schema_and_publication`. Взято имя из манифеста: валидатор с `Z1`
   отвечал `stream_owner does not match owning stage manifest aggregation`.
4. **`docs/product/content-memory-spec.md` не менялся.** Таблицы отката в нём
   нет: волна «вход одной мыслью» строки отката туда не добавляла, обратимость
   записана прозой в `## Миграция и rollout` и в подразделе runbook. Выдумывать
   таблицу ради одной строки я не стал.

# Verification

Все команды — Node 22.23.2, из корня worktree. Ни сети, ни модели, ни стенда,
ни боевой базы.

**Валидатор SQL, ровно как требует «Применение Prisma-схемы».** Предпросмотр
снят настоящим `prisma migrate diff` без подключения к базе — сравнением двух
файлов схемы (`--from-schema-datamodel` базовой из `2ae8e461`,
`--to-schema-datamodel` новой), тем же способом, каким это делает
`tests/prisma-schema-apply-guard.migrate-diff.test.cjs`:

```
node node_modules/prisma/build/index.js migrate diff \
  --from-schema-datamodel <schema из 2ae8e461> \
  --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
  --script --exit-code            # статус 2, непустой diff

node scripts/operations/validate-prisma-migration-sql.cjs --mode update \
  --allow-table ContentPiece --allow-table ContentDerivation \
  --diff <diff.sql> \
  --selected docs/operations/piece-adaptation-schema-apply.sql
# SQL apply guard passed: 3 explicitly selected statement(s)
# exit=0
```

**Колонок шесть, операторов три** — Prisma печатает одну `ALTER TABLE` на
таблицу со всеми `ADD COLUMN` сразу. Файл повторяет порядок diff дословно
(`ContentPiece` первой), потому что валидатор сверяет каждый выбранный оператор
с напечатанным. Это записано и в подразделе runbook, чтобы следующий оператор
не искал шесть строк.

**Наборы:** 10 наборов, 236 тестов, 0 падений. Сверх заданного списка прогнаны
`content-material.routes`, `content-archive.routes`,
`prisma-schema-apply-guard.migrate-diff` и `prisma-single-apply-path` — первые
два потому, что я их задел, вторые два потому, что они стерегут именно тот
порядок применения схемы, которым я пользовался.

**Типизация:** `tsc --noEmit` по `apps/backend/tsconfig.json` и
`apps/frontend/tsconfig.json` — оба `0`.

**Клиент Prisma** перегенерирован репозиторным скриптом
`pnpm run prisma-generate` (`prisma@6.5.0`); он пишет в `node_modules`, в
коммит ничего не попадает.

Рецензент не звался (указание владельца «скорость важнее тестов»).

# Blockers / Owner input

**Схема к боевой базе не применялась и применена быть не может без отдельного
слова владельца.** Файл готов и проверен, но подключаться к боевой базе я не
имею права, и `prisma db push` запрещён. Порядок — раздел «Применение
Prisma-схемы», флаги `--mode update --allow-table ContentPiece --allow-table
ContentDerivation`, **до переключения образа этой волны, не после**: новый код
выбирает `kind` и `brief` при каждом открытии списка, и без колонок падает не
редкий экран, а вход.

**Контракту Z4 поля хватило целиком, править его не пришлось.** Одно место,
где контракт молчит и Z2 придётся решать: `AdaptationV1.integrationName`
объявлен, а источника имени у адаптации без поста нет (см. решение о внешнем
ключе выше). Это не противоречие контракта коду — это работа Z2, и правки
контракта она не требует.

# Delivery / Cleanup

Один коммит в ветке `worktree-agent-a7eb82e0bb465682e` от `2ae8e461`. Не влит,
не отправлен, слияние и приёмка — за корневым сеансом. Beads не трогался:
ничего не закрыто, статусы не менялись.

Ветка worktree была на `5e17b89b` (`main`) и переведена на `2ae8e461`
фиксацией `git reset --hard` по чистому дереву — база потока задана заданием,
и `2ae8e461` содержит `5e17b89b` целиком.

# Risks / Follow-ups / Explicit Defers

- **Строки до волны читаются, но не переносятся.** Материал без `kind` — это
  заготовка без выделенной сути, производная без `body` берёт текст из поста.
  Шага данных нет и не планируется; если Z5 покажет для таких строк пустую
  суть, это ожидаемое поведение, а не дефект.
- **Колонка `ContentDerivation.state` осталась в базе и в схеме, но не
  читается ни одной строкой кода.** Снос — отдельный план миграции. До тех пор
  любой, кто прочтёт её снова, вернёт ту же ложь; комментарий в схеме об этом
  говорит прямо.
- **Имя канала у адаптации без поста** — работа Z2 (разрешить `integrationId`
  по списку каналов области).
- **Читаемая подпись колонки** — работа Z5; `columnsOf` отдаёт идентификатор
  провайдера.
- **В списке готовых миграций `production-deploy.md` по-прежнему нет
  `ai-role-models-schema-apply.sql`** — запись чужой волны, вне моей зоны, не
  трогал. Документ требует, чтобы список совпадал с каталогом, так что это
  открытая мелочь для корневого сеанса.
- **`shapeOfProvider` для незнакомого провайдера возвращает форму `telegram`.**
  Решение осознанное и объяснено в коде, но это именно решение: если продукт
  подключит длинную площадку с незнакомым идентификатором, предпросмотр скажет
  «обрежется до 4096» там, где не обрежется. Лечится строкой в
  `PLATFORM_PROVIDERS`, когда такая площадка появится.
