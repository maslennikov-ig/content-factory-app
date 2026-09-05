# Память фактов и единый контекст Content Factory

**Статус:** accepted contract + implemented first vertical slice
**Проверено:** 2026-09-05
**Область:** `content-factory-next-9e9`, критерии AC-6 и AC-7;
`content-factory-next-ec48` (решение владельца 05.09.2026 о взятом из поиска)

## Решение

Content Factory должен хранить не «готовую истину из модели», а две разные
сущности:

1. неизменяемый снимок доказательства — существующие в целевом контракте
   реестра `SourceSnapshot + SourceEvidence`, то есть что именно было получено,
   откуда и когда;
2. изменяемый факт — утверждение организации, чей статус пересчитывается по
   доступным доказательствам, свежести, конфликтам и удалению.

Перед generator, editor, chat-agent и AutoPost ставится один серверный
`ContentContextBuilderV1`. Он без сети и без модели выбирает только разрешённый
контекст, ограничивает его размер, присваивает цитаты и сохраняет неизменяемый
снимок выбора. Четыре потребителя не собирают дополнительные фрагменты памяти
самостоятельно.

Это минимальное архитектурно безопасное изменение: оно закрывает наиболее
опасную границу один раз, не требует embeddings, vector DB или нового
модельного вызова и оставляет текущие `included/workspace_key` admission и
usage semantics без скрытого fallback.

## Подтверждённое текущее состояние

Текущий путь выглядит так:

```text
user/feed item
  -> consumer-specific request
  -> optional WebResearchService
  -> provider summary + page excerpts + source links
  -> consumer-specific free-text prompt
  -> structured content output
  -> editor state
  -> Post.researchSources JSON string
```

Наблюдения по коду:

- `WebResearchResult` содержит `summary`, свободный `facts[].text` и URL, но не
  `retrievedAt`, evidence id, TTL, trust или conflict state
  (`libraries/nestjs-libraries/src/openai/web.research.service.ts:18-35`).
- `summary` берётся из ответа поискового провайдера, а `facts` фактически
  являются усечёнными фрагментами страниц; оба вида данных затем смешиваются
  в одном prompt-блоке
  (`libraries/nestjs-libraries/src/openai/web.research.service.ts:332-370`).
- `AgentGraphService` считает research необязательным, при сбое продолжает
  генерацию и отдельно собирает свободный текст для нескольких prompt-узлов
  (`libraries/nestjs-libraries/src/agent/agent.graph.service.ts:135-190`).
- AutoPost повторяет собственный `researchText`, называет блок «verified web
  research» без сохранённого доказательного статуса, а при сбое продолжает с
  feed item (`libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts:264-370`).
- Editor вызывает `/copilot/research`, кладёт ответ в клиентское состояние и
  показывает provider summary и ссылки
  (`apps/frontend/src/components/new-launch/editor.tsx:252-311`,
  `apps/frontend/src/components/new-launch/editor.tsx:492-548`).
- Generator передаёт в модальное окно только `fresearch.sources`; пользователь
  или клиент может изменить этот массив до записи
  (`apps/frontend/src/components/launches/generator/generator.tsx:142-215`).
- `Post.researchSources` — строка с JSON, которую repository полностью
  перезаписывает. Связи с фрагментом, фактом, запросом, версией профиля и
  retrieval time нет (`libraries/nestjs-libraries/src/database/prisma/schema.prisma:472-498`,
  `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts:519-575`).
- Парсер UI при повреждённой строке безопасно возвращает пустой список, но
  этим же теряет provenance без видимого статуса
  (`apps/frontend/src/components/new-launch/research.sources.ts:17-41`).
- Chat-agent полагается на инструкцию вызвать `webResearchTool` для текущих
  данных. Tool возвращает нормализованный объект, но его использование и
  последующее цитирование остаются решением модели
  (`libraries/nestjs-libraries/src/chat/load.tools.service.ts:66-106`,
  `libraries/nestjs-libraries/src/chat/tools/web.research.tool.ts:19-99`).
- AI admission уже привязан к организации, запрещает смену tenant внутри
  активной операции и не сохраняет prompt/output
  (`libraries/nestjs-libraries/src/openai/ai.usage.service.ts:183-217`,
  `libraries/nestjs-libraries/src/database/prisma/schema.prisma:1179-1199`).

### Самая рискованная граница

Самая рискованная граница находится между retrieval и prompt. Сейчас
provider-generated summary, фрагмент страницы и ссылка выглядят для
потребителя одинаково «проверенными», после чего их состояние теряется в
изменяемом JSON. В результате невозможно детерминированно:

- исключить доказательство после удаления источника;
- понять, истёк ли TTL и когда материал был получен;
- закрыть конфликт двух утверждений;
- доказать, какой контекст видел конкретный output;
- гарантировать одинаковый fallback в четырёх сценариях.

Prompt-инструкция снижает вероятность ошибки, но не является enforcement
boundary. Граница должна находиться до вызова модели и повторно проверяться при
привязке результата.

## Цели и не-цели

Цели первой версии:

- организация повторно использует подтверждённые факты и видит их
  происхождение, дату и свежесть;
- удалённое, просроченное, конфликтующее или неподтверждённое не попадает в
  prompt как истина;
- один контракт и один renderer обслуживают четыре consumer;
- output сохраняет `contentContextSnapshotId`, `brandProfileVersionId` и точный набор
  citation ids;
- deterministic storage/search/context path работает без AI key и не расходует
  AI allowance;
- unavailable research для current-required запроса без уже сохранённого
  свежего evidence останавливает создание текущих утверждений до модели.

Не-цели:

- автоматическое извлечение или «проверка» фактов моделью;
- embeddings, semantic/vector search и новый внешний storage;
- live fetch, public scraping, Telegram collection, credentials или платный
  вызов в этой стадии;
- публикация: новый vertical path заканчивается только `DRAFT`;
- per-user/per-team ACL. В MVP private означает доступ всем активным участникам
  одной организации; более узкая область требует отдельной auth-модели;
- утверждение, что высокая репутация источника автоматически разрешает
  содержательный конфликт.

## Рассмотренные варианты

| Вариант                                             | Решение                | Причина                                                                                           |
| --------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| Расширить `Post.researchSources` новыми JSON-полями | отклонить              | не даёт повторно используемого факта, referential integrity, удаления и общего selection gate     |
| Хранить только snapshots и искать по excerpt        | отклонить как неполный | provenance появляется, но нет claim identity, conflicts, supersedes и controlled status           |
| Снимки evidence + mutable facts + общий builder     | принять                | минимальный набор, который закрывает AC-6/AC-7 и измеряется локально                              |
| LLM extraction + embeddings сразу                   | отложить               | увеличивает стоимость, latency и число недетерминированных границ до появления базового контракта |

## Целевой поток

```text
allowed source version / user-supplied material / web result / feed item
  -> deterministic normalization and dedupe
  -> registry-owned write-once SourceSnapshot + SourceEvidence
  -> explicit/manual or deterministic Fact + FactEvidence links
  -> mutable fact evaluation (freshness/conflict/deletion/supersedes)
  -> ContentContextBuilderV1
       tenant + permission -> candidates -> fail-closed eligibility
       -> deterministic rank -> hard budget -> citations
       -> immutable ContextSnapshot
  -> generator | editor | agent | autopost
  -> structured output with citationIds
  -> finalize/revalidate context
  -> DRAFT + ContentOutputContext
```

## Контракт данных

Реестр источников уже зафиксировал имена `ContentSource`, `SourceSnapshot`,
`SourceEvidence` и `DraftEvidence`. Память фактов повторно использует их и не
создаёт параллельные snapshot/payload tables. Профильный stream зафиксировал
`ProjectBrandProfileVersion` и `BrandProfileContextService`; общий builder
композирует этот resolver, а не дублирует выбор версии.

### 1. Evidence snapshot boundary: `SourceSnapshot + SourceEvidence`

Для памяти это единый immutable read model `EvidenceSnapshotV1`, собранный
tenant-scoped join из двух registry-owned records:

| Поле read model                   | Источник и контракт                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `evidenceId`, `organizationId`    | `SourceEvidence`; каждый lookup содержит tenant                                                                                 |
| `sourceId`                        | `ContentSource`, nullable только для `SEARCH_PROVIDER_RESULT` legacy/one-off snapshot                                           |
| `sourceSnapshotId`                | immutable `SourceSnapshot`                                                                                                      |
| `supersedesSnapshotId`            | предыдущая immutable revision либо sequence relation внутри source                                                              |
| `originKind`                      | source kind или `SEARCH_PROVIDER_RESULT`; web-search URL не становится разрешённым `ContentSource` автоматически                |
| `retrievalProvider`               | safe transport/provider id; это не publisher trust                                                                              |
| `title`, `canonicalUrl`           | из snapshot/source; URL tenant-sensitive, query redacted вне internal view                                                      |
| `excerpt`                         | bounded `SourceEvidence` excerpt/structured field; максимум 8 000 символов при capture                                          |
| `publishedAt`                     | nullable UTC instant от материала; отсутствие не заменяется другой датой                                                        |
| `retrievedAt`                     | server UTC `observedAt`/successful retrieval time snapshot; для legacy unknown остаётся unknown и не подтверждает current claim |
| `freshUntil`                      | registry-computed freshness; memory может только сократить, но не продлить её                                                   |
| `contentHash`, `excerptHash`      | snapshot/evidence SHA-256 для dedupe и provenance                                                                               |
| `trustTier`, `trustPolicyVersion` | из mutable `ContentEvidenceAssessment`; rank aid, не truth score                                                                |
| `exposure`                        | `PUBLIC` или `INTERNAL_ONLY`; private в MVP всё равно organization-wide, но URL не выходит в public renderer                    |
| `sourceEligibility`               | derived registry gates: active, rights confirmed, policy/robots allowed и не purging                                            |
| `tombstone`                       | `SOURCE_REMOVED`/purged lifecycle из registry; немедленно исключает reuse                                                       |

Инварианты:

- reverification следует registry contract: успешный changed content создаёт
  новый `SourceSnapshot`; `304` или тот же normalized hash обновляет validation
  state/run, но не дублирует snapshot;
- URL/excerpt/timestamps старого snapshot/evidence не редактируются;
- `publishedAt` — характеристика публикации, `retrievedAt` — наблюдения,
  `freshUntil` — пригодности. Эти даты нельзя подменять друг другом;
- `provider answer/summary` является подсказкой, а не evidence. Evidence
  возникает только из сохранённого excerpt с URL/hash;
- snapshot/evidence сам по себе не делает факт `VERIFIED`;
- hard delete немедленно закрывает context и по registry policy purges URL,
  normalized content и excerpts не позднее целевых 24 часов. Tombstone без
  контента сохраняет происхождение до конца его retention.

### 2. `ContentEvidenceAssessment`

Snapshot/evidence остаётся immutable, а организационная оценка может меняться:

- `organizationId`, `evidenceId` (`SourceEvidence.id`) — composite unique;
- `trustTier`: `OWNER_VERIFIED`, `OFFICIAL`, `CURATED`, `UNRATED`, `BLOCKED`;
- `trustPolicyVersion`, `reviewedByUserId`, `reviewedAt`, `note`;
- `status`: `PROPOSED`, `ACCEPTED`, `REJECTED`.

По умолчанию evidence `UNRATED/PROPOSED`. Только ADMIN/SUPERADMIN принимает или
блокирует assessment. Изменение trust не переписывает snapshot и не делает
факт `VERIFIED`; оно меняет rank будущих builds и фиксируется audit actor/time.
Модель никогда не выставляет assessment.

### 3. `ContentFact`

Изменяемая организационная модель утверждения.

| Поле                                 | Контракт                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------- | ----------------- |
| `id`, `organizationId`               | tenant-bound identity                                                                    |
| `claimKey`                           | детерминированное `subjectKey                                                            | predicateKey`, например `product:cf | pricing.currency` |
| `statement`, `language`              | читаемая формулировка                                                                    |
| `valueText`, `valueHash`             | нормализованное значение; JSON от модели не является источником истины                   |
| `dedupeKey`                          | SHA-256 `claimKey + valueHash + effectiveFrom/effectiveTo`; unique в организации         |
| `temporalKind`                       | `CURRENT`, `DATED`, `TIMELESS`                                                           |
| `effectiveFrom`, `effectiveTo`       | nullable область действия утверждения                                                    |
| `freshUntil`                         | минимум пригодности активных supporting evidence; пересчитывается                        |
| `status`                             | `UNVERIFIED`, `VERIFIED`, `STALE`, `CONFLICTED`, `SUPERSEDED`, `RETRACTED`, `TOMBSTONED` |
| `supersedesFactId`                   | id старого fact, который эта запись заменяет; same-tenant only                           |
| `verifiedAt`, `lastEvaluatedAt`      | server timestamps; `verifiedAt` не равен времени модельной генерации                     |
| `createdByUserId`, `updatedByUserId` | audit actors                                                                             |

Fact aggregate изменяем по status, display label, оценкам и audit metadata.
После первой связи с output его смысл (`claimKey`, value, statement и временная
область) не переписывается: семантическая правка создаёт новый fact с
`supersedesFactId`. Так lifecycle остаётся mutable, а исторический output —
воспроизводимым по id/hash.

### 4. `ContentFactEvidence`

Tenant-bound many-to-many relation:

- `organizationId`, `factId`, `evidenceId` (`SourceEvidence.id`);
- `stance`: `SUPPORTS` или `CONTRADICTS`;
- `selectorStart/selectorEnd` либо nullable selector для точного места в
  excerpt;
- `linkedBy`: `USER`, `DETERMINISTIC_IMPORT`, в будущем `MODEL_PROPOSAL`;
- `reviewStatus`: `ACCEPTED`, `PROPOSED`, `REJECTED`.

Только `ACCEPTED + SUPPORTS` может подтвердить fact. Любой активный
`ACCEPTED + CONTRADICTS` переводит claim group в `CONFLICTED`; trust tier лишь
помогает сортировать материал для разрешения и не выбирает победителя сам.

### 5. `ContentContextSnapshot` и `ContentContextItem`

`ContentContextSnapshot` — неизменяемая запись решения builder до модельного
вызова:

- `id`, `organizationId`, `contractVersion = content-context/v1`;
- `consumer`: `GENERATOR`, `EDITOR`, `AGENT`, `AUTOPOST`;
- `purpose`: `DRAFT_CREATE`, `DRAFT_EDIT`, `DRAFT_ASSIST`;
- `queryHash`, `language`, `freshnessMode`, `asOf`, `builtAt`, `expiresAt`;
- `status`: `READY`, `PARTIAL`, `UNAVAILABLE`, `BLOCKED_STALE`,
  `BLOCKED_CONFLICT`, `INVALIDATED`;
- `generationPolicy`: `ALLOW_GROUNDED`, `ALLOW_USER_ONLY`,
  `EVIDENCE_REQUIRED`;
- resolved `brandProfileVersionId`, version/content digest и profile
  fallback reason из `BrandProfileContextService`;
- selection algorithm version, trust/freshness policy versions, hard budgets;
- counts and rejection reason codes; никаких prompt, secret, полного excerpt или
  пользовательского текста в логах/usage ledger.

Каждый `ContentContextItem` хранит snapshot id, ordinal, stable citation id
(`F1`, `E1`), `factId`/`evidenceId`, inclusion reason и hashes выбранного
statement/excerpt. Inclusion reason — `EXPLICIT`, `RANKED`, `FACT_SUPPORT` или
`SEARCH_UNCONFIRMED`; последний означает «взято из поиска» и переживает
снимок, поэтому обратное чтение возвращает `provenance` по нему, а не по
текущей оценке доказательства (см. «Взято из поиска»). Текст не дублируется:
fixed renderer reconstructs его из write-once records. После privacy erasure UI показывает tombstone вместо
содержимого, но происхождение output остаётся доказуемым по id/hash.

### 6. `ContentOutputContext`

Привязывает фактический draft к контексту:

- `organizationId`, `postId`, `contentContextSnapshotId`;
- resolved `brandProfileVersionId` и content digest;
- `usedCitationIds` как нормализованные rows или строго проверенный JSON;
- `finalizedAt`, `outputHash`, `validationStatus`;
- unique `(organizationId, postId, contentContextSnapshotId)`.

В `Post` добавляются nullable typed relations `contentContextSnapshotId` и
`brandProfileVersionId`; legacy rows остаются `null`. `ContentOutputContext`
хранит per-output citations/validation, а прямые relations на Post делают
resolved snapshot/profile частью сохранённого draft, а не только UI metadata.
`PostBody` принимает server-issued `contentContextSnapshotId`, но не доверяет
переданным URL, digest или profile metadata. `PostsRepository` в одной
транзакции создаёт Post, эти relations, `ContentOutputContext`/`DraftEvidence`
и derived legacy `researchSources`; частичная provenance-запись недопустима.

Для thread/group каждый `Post` может иметь свою связь с общим snapshot и свой
набор `usedCitationIds`. Нельзя принимать source URL или provenance metadata от
клиента вместо server-issued `contentContextSnapshotId`.

`ContentContextSnapshot` хранится, пока на него ссылается draft/Post, и ещё 90
дней после удаления последней ссылки. Hard delete source не удаляет
исторический item целиком: он становится `SOURCE_REMOVED` tombstone без URL и
excerpt. Это сохраняет bounded audit provenance без сохранения удалённого
содержимого.

## Lifecycle

### Evidence

```text
CAPTURED
  | reverify (same hash/304)-> validation run points to SAME snapshot
  | reverify (changed)      -> NEW CAPTURED snapshot --supersedes--> old
  | TTL passes              -> effective STALE (record remains unchanged)
  | source deleted/blocked  -> TOMBSTONED -> excluded immediately
  | privacy erasure gate    -> locator/content/excerpt purged; bounded tombstone remains
```

TTL не продлевается произвольным update. Успешная повторная проверка с новым
content создаёт новый snapshot; `304`/same hash создаёт immutable validation run
и обновляет effective source health/freshness, сохраняя тот же snapshot. Сбой
проверки сохраняется как отдельный operation result/source status, но не
создаёт «пустое доказательство» и не освежает старое.

### Fact

```text
UNVERIFIED
  | accepted support + fresh evidence -> VERIFIED
  | accepted contradiction            -> CONFLICTED

VERIFIED
  | now > freshUntil / support stale   -> STALE
  | support deleted                    -> UNVERIFIED or TOMBSTONED
  | contradiction                      -> CONFLICTED
  | semantic replacement               -> SUPERSEDED -> new fact evaluated
  | explicit correction                -> RETRACTED

STALE / CONFLICTED / UNVERIFIED
  | new accepted fresh support, no contradiction -> VERIFIED

any state
  | privacy/product deletion -> TOMBSTONED
```

Fact считается пригодным только в момент build. Persisted status не отменяет
проверку `now <= freshUntil`, живых evidence/source relations и отсутствия
accepted contradiction.

### Context и output

```text
BUILD -> ContextSnapshot(READY/PARTIAL/BLOCKED)
  | model/tool not started when EVIDENCE_REQUIRED
  | allowed -> structured generation
  | finalize revalidates tenant + expiry + all dependencies
      | unchanged -> bind DRAFT + OutputContext
      | deleted/conflicted/stale -> INVALIDATED; result is not bound as grounded
```

Уже сохранённый draft остаётся историческим output, но удалённое evidence не
может быть повторно использовано. UI показывает «источник удалён» или «контекст
после создания устарел», а не продолжает показывать его как свежий.

## `ContentContextBuilderV1`

### Вход

```ts
type ContentContextBuildRequestV1 = {
  // organizationId и actor определяются сервером, не client/model input
  consumer: 'GENERATOR' | 'EDITOR' | 'AGENT' | 'AUTOPOST';
  purpose: 'DRAFT_CREATE' | 'DRAFT_EDIT' | 'DRAFT_ASSIST';
  query: string;
  language: 'ru' | 'en';
  freshnessMode: 'REQUIRE_CURRENT' | 'PREFER_FRESH' | 'HISTORICAL';
  asOf: string; // server UTC
  sourceIds?: string[];
  factIds?: string[];
  brandProfileSelection:
    | { mode: 'active' }
    | { mode: 'version'; versionId: string }
    | { mode: 'none' };
  userMaterialEvidenceIds?: string[];
};
```

Builder не угадывает freshness mode моделью. Общий deterministic request
classifier распознаёт явные RU/EN current markers, а UI/action может поставить
`REQUIRE_CURRENT` напрямую. Неопределённая просьба не объявляется текущей;
consumer обязан показать выбранный режим. Качество classifier требует live
eval, но fail-closed behavior после `REQUIRE_CURRENT` полностью детерминирован.

### Выход

```ts
type ContentContextEnvelopeV1 = {
  contractVersion: 'content-context/v1';
  contentContextSnapshotId: string;
  status:
    | 'READY'
    | 'PARTIAL'
    | 'UNAVAILABLE'
    | 'BLOCKED_STALE'
    | 'BLOCKED_CONFLICT';
  generationPolicy: 'ALLOW_GROUNDED' | 'ALLOW_USER_ONLY' | 'EVIDENCE_REQUIRED';
  builtAt: string;
  expiresAt: string;
  profile:
    | {
        mode: 'resolved';
        versionId: string;
        versionNumber: number;
        contentDigest: string;
      }
    | {
        mode: 'neutral_fallback';
        reason: 'NO_PROFILE' | 'EXPLICIT_NONE' | 'LEGACY_REQUEST';
      };
  facts: Array<{
    citationId: string;
    factId: string;
    statement: string;
    temporalKind: 'CURRENT' | 'DATED' | 'TIMELESS';
    verifiedAt: string;
    freshUntil: string;
    evidenceCitationIds: string[];
  }>;
  evidence: Array<{
    citationId: string;
    evidenceId: string;
    sourceSnapshotId: string;
    title: string;
    excerpt: string;
    url: string | null;
    exposure: 'PUBLIC' | 'INTERNAL_ONLY';
    publishedAt: string | null;
    retrievedAt: string;
    provenance: 'CONFIRMED' | 'SEARCH';
  }>;
  rejected: Array<{
    itemId: string;
    reason:
      | 'FOREIGN_TENANT'
      | 'DELETED'
      | 'STALE'
      | 'CONFLICTED'
      | 'UNVERIFIED'
      | 'PRIVATE_NOT_EXPORTABLE'
      | 'OVER_BUDGET';
  }>;
};
```

`organizationId` может присутствовать во внутреннем объекте, но не нужен в
prompt/tool output. Foreign tenant ids возвращают обычный not-found и не
попадают даже в `rejected` клиентского ответа.

### Алгоритм выбора

1. Получить организацию и actor из authenticated request или из tenant-bound
   AutoPost row. Проверить активное membership и существующий `Sections.AI`
   action. Builder/repository не принимает свободный tenant id от модели.
2. Вызвать `BrandProfileContextService` с явной selection strategy и разрешить
   выбранные `ContentSource`/`SourceSnapshot` только через composite tenant
   lookup. Explicit foreign/missing/draft/deactivated profile version даёт
   `409 BRAND_PROFILE_VERSION_UNAVAILABLE` до context/model; скрытого active или
   neutral fallback нет.
3. Сначала взять явно выбранные fact/source ids, затем exact `claimKey`/dedupe
   matches, затем bounded lexical candidates. MVP использует PostgreSQL/Prisma
   и нормализованные tokens; embeddings и external search отсутствуют.
4. Применить registry eligibility: source active, rights confirmed,
   policy/robots allowed, не purging. Затем исключить tombstoned/deleted/
   unverified и вычислить freshness на `asOf`. Исключение с 05.09.2026 —
   отдельно стоящее evidence вида `SEARCH_PROVIDER_RESULT` без принятой
   оценки: оно входит как `provenance = SEARCH` (см. «Взято из поиска»).
   Любой accepted contradiction исключает всю claim group как conflicted.
5. Сортировать стабильным tuple: explicit selection, verified state,
   trust tier, lexical overlap, `freshUntil`, id. Trust не разрешает конфликт.
   Отдельно стоящее evidence сортируется `CONFIRMED` перед `SEARCH`, затем по
   id: бюджеты общие, поэтому при нехватке места вытесняется находка.
6. Применить server hard limits: максимум 8 facts, 8 evidence, 800 символов на
   rendered excerpt и 12 000 символов на весь profile + memory block. Consumer
   может запросить меньше, но не больше.
7. Присвоить стабильные citation ids, сохранить immutable snapshot/items и
   отрендерить один versioned block. Source content помечается как untrusted
   data, control characters удаляются; инструкции из excerpt не исполняются.
8. До bind/finalize повторно проверить expiry, tenant и зависимости. Context id
   одноразово привязывается к ожидаемому draft operation либо явно допускает
   идемпотентный retry того же operation key.

Одинаковый corpus revision, request и `asOf` дают одинаковый ordered selection
и selection hash. Новый snapshot id может отличаться, содержимое — нет.

## Свежесть, доверие и конфликты

Начальные fact-level TTL caps являются memory policy v1:

| Класс            |      TTL | Пример применения                                   |
| ---------------- | -------: | --------------------------------------------------- |
| `CURRENT_24H`    |  24 часа | «сейчас», breaking, текущая доступность/цена        |
| `VOLATILE_7D`    |   7 дней | быстро меняющиеся продуктовые или рыночные сведения |
| `STABLE_30D`     |  30 дней | стабильная характеристика продукта/организации      |
| `EVERGREEN_180D` | 180 дней | определения и долговечные справочные сведения       |

`ContentFact.freshUntil` всегда равен минимуму memory cap и registry
`SourceEvidence/SourceSnapshot.freshUntil`; память никогда не продлевает
registry freshness. Для первого registry rollout URL свеж 24 часа после
validation, RSS — до двух ожидаемых интервалов, но не дольше 24 часов, manual
без review period имеет `NOT_MONITORED` и не подтверждает `CURRENT`. TTL
выбирается policy или явным типом пользователя, но не свободным ответом модели.
Для `CURRENT` без `publishedAt` допустим короткий TTL от `retrievedAt`, однако
UI показывает «дата публикации неизвестна». Истёкший snapshot можно показать в
review, но не в `facts` envelope.

Trust tier влияет на rank и ручной review. Он не означает truth score. Даже
`OWNER_VERIFIED` не может молча перекрыть accepted contradiction; конфликт
требует нового evidence, retract/supersede или явного решения пользователя.

## Взято из поиска

Решение владельца 05.09.2026 (`content-factory-next-ec48`, дословно): «Да,
конечно, можно разрешить брать непроверенные находки. Понимаешь, существуют же
какие-то способы ресерча и использования его. … И можно делать не по метке „не
проверено“, а, к примеру, „взято из поиска“, как-то так. Но ограничивать я бы
никак не стал.»

До этого дня всё, взятое поиском, оставалось `UNRATED/PROPOSED` и строитель
отбрасывал его как `UNVERIFIED`. Платная проверка
(`docs/product/material-quality-check-2026-09-05.md`) показала, чем это
кончилось: из пяти постов ни один не опирался на материал. Дыра была не в
поиске и не в модели, а ровно здесь — материал доходил до витрины и дальше не
шёл.

Что изменилось:

- у каждого элемента `evidence` в конверте есть `provenance`. `CONFIRMED` —
  доказательство с принятой оценкой, как было всегда. `SEARCH` — результат
  поисковика (`SourceSnapshot.kind = SEARCH_PROVIDER_RESULT`) без принятой
  оценки: свежий, не удалённый, не отвергнутый человеком;
- два отказа остаются и для находки, и оба — про уже сказанное человеком:
  `trustTier = BLOCKED` («этому источнику не верить») и
  `status = REJECTED` («эту находку я отверг»). Владелец разрешил брать
  неподтверждённое, а не отменять отказы;
- факты (`ContentFact`) не меняются: подтвердить факт по-прежнему может только
  `ACCEPTED + SUPPORTS`. Находка входит в контекст сама по себе, а не через
  факт;
- у хранимого элемента снимка `inclusionReason = SEARCH_UNCONFIRMED`. Обычная
  строковая колонка, миграция не нужна. Обратное чтение снимка берёт
  `provenance` из неё, а не из текущей оценки: через неделю находку могут
  подтвердить или отвергнуть, а снимок обязан остаться тем, чем был;
- `REQUIRE_CURRENT`, обеспеченный одним лишь свежим поисковым материалом,
  считается обеспеченным. Ограничения здесь нет — это прямые слова владельца;
- промпт называет такой материал по имени:
  `[E1] EVIDENCE FROM WEB SEARCH, NOT CONFIRMED BY A PERSON (retrieved <дата>)`
  плюс одна строка правила `Material marked as web search may be used; present
  it as reported by its source, never as a confirmed fact of this workspace.`;
- на экране: ярлык «Взято из поиска» (en: «From web search»), подпись на
  витрине «Взято из поиска, не подтверждено» (en: «From web search, not
  confirmed»).

Генератор с этого дня ищет в вебе сам — но только когда человек не дал явного
материала (`sourceIds`, `factIds`, `userMaterialEvidenceIds` пусты) и поиск
включён в области. Найденное сохраняется тем же путём, что и находка с витрины
(`ContentSourceRegistryService.acceptSearchResult`), и повторная находка с тем
же `contentHash` переиспользует уже сохранённую свежую запись, а не заводит
вторую. Отказ поиска не валит генерацию и не даёт ложного «поиск был»:
`researchAvailable` остаётся ложью, а промпт получает честную строку запрета.

## Детерминированный fallback

| Условие                                                                   | Builder                                                               | Consumer behavior                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Нет профиля                                                               | `profile.mode=neutral_fallback`, reason `NO_PROFILE`                  | безопасный нейтральный голос; версия не выдумывается                                           |
| Нет подходящей памяти, current не требуется                               | `UNAVAILABLE + ALLOW_USER_ONLY`                                       | draft только из явно введённого пользователем материала; без ярлыка «проверено»                |
| Своего материала нет, поиск включён, находки свежие                       | обычный `READY`/`PARTIAL`, evidence с `provenance = SEARCH`           | материал идёт в текст с пометкой «взято из поиска, не подтверждено»; `REQUIRE_CURRENT` обеспечен |
| Своего материала нет, поиск выключен или отказал                          | `UNAVAILABLE + ALLOW_USER_ONLY` (при `REQUIRE_CURRENT` — как строкой ниже) | генерация идёт дальше; промпт честно говорит, что материала нет, и не обещает web check      |
| Research disabled/timeout, `REQUIRE_CURRENT`, свежего stored evidence нет | `CONTENT_EVIDENCE_REQUIRED`; policy `EVIDENCE_REQUIRED`               | модель не вызывается; deterministic сообщение/placeholder draft «нужно доказательство»         |
| Research disabled, но есть свежий accepted stored evidence                | обычный `READY`                                                       | использовать только сохранённые citations; не обещать новый web check                          |
| Только stale evidence и `REQUIRE_CURRENT`                                 | `BLOCKED_STALE + CONTENT_EVIDENCE_REQUIRED`                           | предложить reverification; старое можно показать только как review metadata                    |
| Accepted conflict                                                         | `BLOCKED_CONFLICT + CONTENT_EVIDENCE_REQUIRED`                        | показать обе стороны; не выбирать победителя и не создавать current claim                      |
| Источник удалён между build/finalize                                      | `INVALIDATED`                                                         | generated result не связывается как grounded; повторный build                                  |
| Explicit/pinned profile version недоступна                                | `409 BRAND_PROFILE_VERSION_UNAVAILABLE` / AutoPost requires attention | никогда не подставлять neutral/active/другую версию молча                                      |
| DB/context builder недоступен                                             | `UNAVAILABLE`                                                         | не делать model call для current-required; retryable 503 для server path                       |
| Model/structured output failure                                           | context остаётся audit record без output                              | один bounded retry по существующей model policy; затем понятная ошибка, без partial provenance |

`CONTENT_EVIDENCE_REQUIRED` — стабильный public error code, а
`EVIDENCE_REQUIRED` — machine-readable generation policy. Это не prompt phrase.
Потребитель обязан остановиться до `getChatModel`, Copilot runtime или model
tool. Именно это обеспечивает правило «нет неподтверждённых текущих
утверждений при недоступном исследовании».

## Контракт четырёх потребителей

| Consumer                        | Build point                                                                                | Обязательное применение                                                                                                                                                                                              | Сохранение результата                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generator / `AgentGraphService` | до `find-category`/`generate-hook`; один build на request; с 05.09.2026 перед build идёт собственный веб-поиск, если человек не дал явного материала | это LangGraph generator, не Mastra-agent; все узлы получают один renderer block; старый `researchText` удаляется; Zod output возвращает citation ids                                                                 | stream возвращает `contentContextSnapshotId`; `PostBody -> PostsRepository` проверяет его и атомарно пишет Post relations/OutputContext при создании draft                                               |
| Editor                          | server endpoint строит context из текущего draft и явного research action                  | UI показывает facts/evidence/status, а не provider summary как истину; Copilot `setPosts` не может добавить provenance сам                                                                                           | draft save передаёт только server-issued context id; source URL array остаётся compatibility view                                                                                                        |
| Chat-agent                      | tenant-bound `getContentContext` tool на каждом request; organization скрыта от tool input | Mastra singleton не захватывает context/profile при construction; current request требует успешного context tool; draft tool повторно валидирует snapshot и citation ids                                             | только draft action этой feature vertical; tool связывает output server-side                                                                                                                             |
| AutoPost                        | после безопасного feed fetch/capture и до text generation                                  | config pin-ит `brandProfileVersionId` (`ProjectBrandProfileVersion.id`); feed item становится evidence; optional web enrichment проходит тот же builder; при research outage нельзя добавлять внешние current claims | `type: draft`; resolved context/profile snapshot атомарно сохраняется на Post до обновления `lastUrl`; недоступная pinned version ставит requires-attention; новый `autoPostDraftWorkflowV2`/activity V2 |

Общий structured output contract для генерируемого элемента:

```ts
type GroundedDraftPartV1 = {
  content: string;
  citationIds: string[]; // только ids из envelope
};
```

Server отклоняет неизвестные/foreign citation ids. Для output с
`REQUIRE_CURRENT` пустой `citationIds` недопустим. Семантическое соответствие
каждого предложения цитате всё ещё требует eval/review; schema гарантирует
целостность ссылок, но не истинность текста модели.

## Tenancy, права и private sources

- Каждая таблица и join содержит `organizationId`; repository получает его
  первым аргументом и делает composite lookup. Запрос `findUnique({id})` без
  tenant filter запрещён для этой области.
- HTTP tenant берётся из `GetOrgFromRequest`; agent tool — из request context;
  AutoPost — из уже найденной tenant-bound row. Client/body/model не определяет
  организацию.
- Read/use facts следуют текущему membership и `CheckPolicies` для
  `Sections.AI`. USER может предложить только `UNVERIFIED` fact/link. Начальный
  безопасный default, согласованный с source registry: только
  ADMIN/SUPERADMIN принимает evidence, выставляет review status, разрешает
  conflict, retract/supersede/tombstone и меняет source lifecycle через
  `Sections.ADMIN`. Тарифный `402` не маскирует role refusal `403`.
- `ORGANIZATION_PRIVATE` означает только отсутствие доступа из другой
  организации и отсутствие автоматического публичного citation URL. Все
  активные участники организации могут читать/использовать такой материал в
  MVP.
- Per-user/per-team/private-to-role sharing отложен до отдельной модели ACL,
  permission tests и UX. Его нельзя имитировать клиентским фильтром.
- Для private evidence `exposure=INTERNAL_ONLY`; renderer не вставляет URL или
  excerpt в будущую публичную публикацию. На текущей draft-only стадии UI
  показывает внутреннюю метку и требует явного решения перед любым будущим
  export/publish.

## Удаление, tombstone и reverification

Удаление source/profile/fact должно быть транзакционным относительно active
selection:

1. поставить source/fact tombstone;
2. закрыть новые builds и invalidировать ещё не привязанные context snapshots;
3. пересчитать зависимые facts;
4. сохранить уже созданным outputs ids/hashes и понятный removed/stale status;
5. выполнить purge по registry retention/privacy contract: superseded без
   draft evidence — 90 дней; linked evidence — срок draft + 90 дней; hard
   delete удаляет locator/content/excerpt с целевым сроком 24 часа, который
   становится SLA только после runtime-проверки purge job.

Удаление source не удаляет пост молча и не меняет его текст. Оно удаляет право
повторно использовать доказательство. Reverification создаёт новый snapshot,
пересчитывает facts и не меняет provenance старых outputs.

## Граница модельной обработки и учёт стоимости

Первая версия storage, dedupe, lifecycle, lexical search, conflict gate,
selection и renderer полностью детерминирована. Она:

- не вызывает `WebResearchService`, model SDK или external network;
- работает без configured AI key;
- не создаёт `AiUsageRecord`;
- не сохраняет prompt/output в AI ledger и не ослабляет его privacy contract.

Будущая LLM extraction может только предложить `ContentFact` и
`ContentFactEvidence(reviewStatus=PROPOSED, linkedBy=MODEL_PROPOSAL)`. Она не
может выставить `VERIFIED`, trust tier или удалить конфликт. Вызов должен идти
через существующий `AiUsageService.executeAiOperation` с явной операцией,
например `content_fact_extraction`; nested execution использует текущий active
tenant context и не делает скрытого двойного admission. Included quota,
workspace key, timeout, failure status и запрет cross-tenant остаются прежними.

Ни одного такого вызова эта спецификация не разрешает.

## Prompt/tool boundary и восстановление

- Renderer сериализует данные в фиксированный versioned block. Excerpt всегда
  объявлен untrusted content; HTML comments сами по себе не считаются защитой.
- Control characters и oversized fields отсекаются до snapshot. UI выводит
  excerpt как text, не как HTML.
- Evidence не может добавлять tools, менять system instructions, actor или
  organization. Tool allowlist принадлежит agent runtime.
- Context tool read-only/idempotent. Draft tool не доверяет переданным моделью
  ids и повторно проверяет tenant/status/expiry.
- Ошибка retrieval не маскируется как пустой успешный результат. Причина
  `disabled`, `timeout`, `rate_limited`, `not_found`, `blocked` доходит до
  builder как код, но без secret/provider body.
- Логи содержат ids, consumer, status, counts, duration и reason code; query,
  URL private source, excerpt, post text и provider payload не логируются.

## Миграция и rollout

План является additive и обратимым до отключения legacy read:

### 0. Синтез контрактов

- Использовать принятые registry names `ContentSource`/`SourceSnapshot`/
  `SourceEvidence` и profile names `ProjectBrandProfileVersion`/
  `BrandProfileContextService`.
- Зафиксировать public DTO/error names и `ContentContextBuilderV1` как общий
  контракт.
- Сохранить draft-only boundary и existing Temporal contracts; если AutoPost
  payload меняется, создать versioned successor.

### 1. Additive schema

- Добавить registry snapshot/evidence tables из source spec, затем
  fact/link/context/output tables, nullable Post/AutoPost provenance relations
  и organization relations через одну согласованную Prisma migration.
- Не удалять и не переименовывать `Post.researchSources`.
- Проверить реальный `prisma migrate diff` через существующий production guard;
  `prisma db push` не использовать.
- Rollback до consumer adoption: удалить только новые пустые таблицы принятой
  обратной миграцией.

### 2. Deterministic repositories/services

- Реализовать DTO -> Controller -> Service/Manager -> Repository, composite
  tenant lookups, normalization/dedupe, TTL evaluator, conflict evaluator и
  context builder.
- Сначала focused RED->GREEN на tenant, deletion, conflict, bounds и current
  fallback; внешней сети и моделей в fixtures нет.

### 3. Legacy provenance backfill

- Парсить текущий `Post.researchSources` теми же tolerant rules и переносить
  валидные элементы в immutable `SEARCH_PROVIDER_RESULT` citation/draft links,
  как требует source registry. Они не создают `ContentSource`, не инициируют
  fetch и не подтверждают reusable/current `ContentFact`: у legacy row нет
  достоверного `retrievedAt` и excerpt. Дату миграции нельзя подставлять как
  retrieval time.
- Повреждённый JSON записать как bounded migration error count; draft не
  удалять.
- Dual-read UI: новый OutputContext сначала, legacy JSON только как явно
  помеченный fallback.

### 4. Shadow builder без model calls

- На synthetic/local fixtures строить snapshots рядом с существующим путем,
  не менять prompt/output.
- Сравнивать eligibility, selection hash, rejection reasons, size и latency.
- Критерий перехода: 100% deterministic fixture scenarios совпадают с
  acceptance matrix; cross-tenant/stale/conflict leakage = 0.

### 5. Consumer adoption

Hooks можно подключать и проверять последовательно: editor view -> generator ->
agent draft tool -> AutoPost draft. Enforcement cutover выполняется одним
server flag `CONTENT_CONTEXT_V1` для всех четырёх consumers, чтобы не создать
разные истины. Каждый consumer использует тот же contract test suite. На шаге
AutoPost изменить Temporal contract только через новый versioned
workflow/activity и миграцию caller.

Dual-write сохраняет legacy `researchSources` как derived public-source view
для старого UI/caller, но source array не является источником истины.

### 6. Enforced finalize и provenance UI

- Включить model-call gate для `EVIDENCE_REQUIRED`, structured citations,
  finalize/revalidation и OutputContext links.
- Показывать fresh/stale/conflicted/removed/private states и точную profile
  version в draft.
- Новый vertical path остаётся `DRAFT`; publish не входит в rollout.

### 7. Legacy retirement

- После traffic validation перестать читать JSON для новых outputs.
- Удаление поля — отдельная upstream-aware migration только после доказанного
  отсутствия старых callers и принятого rollback plan.
- Future extraction/semantic search — отдельная задача, не часть rollout.

## Влияние на качество, latency и стоимость

Ожидаемое влияние:

- качество: provenance coverage новых grounded drafts = 100%; stale/conflict/
  deleted leakage в deterministic tests = 0; четыре consumer получают
  идентичный selection hash для одного запроса/corpus revision;
- latency: builder делает только bounded DB work, целевой warm p95 < 150 ms и
  не добавляет network critical path. Значение нужно подтвердить на traffic-like
  объёме;
- cost: builder и search памяти стоят 0 AI operations. Hard cap 12 000
  символов заменяет текущую возможность протащить до 32 000 символов web facts
  через несколько prompt-узлов, поэтому token variance должна снизиться;
- storage: появляются append-only snapshots и context metadata. Цена — рост DB
  и необходимость retention/purge;
- complexity: общий builder и finalize добавляют один service boundary, но
  удаляют четыре расходящихся `researchText`/source-array path и делают сбои
  наблюдаемыми.

Нельзя считать эти ожидания production gain до live-eval. Особенно требуют
traffic validation lexical relevance, current-intent recall, p95 latency,
storage growth, false conflict rate и доля запросов, заблокированных слишком
строго.

## Оценка и регрессии

Основные метрики:

- `eligible_context_leakage_total` — stale/conflicted/deleted/foreign items в
  envelope, целевое значение 0;
- `grounded_draft_provenance_coverage` — доля новых grounded drafts с valid
  OutputContext и citations, 100%;
- `current_required_model_call_without_evidence_total` — 0;
- `context_selection_determinism_rate` на frozen fixtures — 100%;
- `context_builder_duration_ms` p50/p95 и bounded query count;
- `context_rendered_chars`, selected/rejected counts, reason codes;
- `context_invalidated_before_finalize_rate`;
- `citation_schema_rejection_rate`, `conflict_rate`, `reverification_success_rate`;
- AI operations и estimated input chars per draft до/после rollout;
- private citation exposure incidents — 0.

Регрессия блокирует rollout, если нарушен tenant/current/deletion invariant,
provenance coverage ниже 100% для нового path или selection выходит за hard
budget. Relevance/latency thresholds сначала наблюдаются в shadow mode, затем
фиксируются на основании реального распределения, а не одного benchmark.

## Приёмочная матрица

| Сценарий                                                               | Ожидаемый результат                                                                   | Проверка                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| Same request/corpus/asOf у четырёх consumers                           | одинаковые ordered items и selection hash                                             | shared contract fixture test      |
| Post create после generator/editor/agent/AutoPost                      | Post содержит resolved context/profile relations и OutputContext в той же transaction | repository integration test       |
| Explicit foreign fact/evidence/context id                              | not-found, ни metadata, ни timing-dependent detail                                    | API/repository tenant tests       |
| AutoPost id другой организации                                         | workflow не получает чужой context                                                    | repository/service tenant test    |
| Reverification с тем же excerpt/hash или 304                           | тот же snapshot, новый validation run, effective freshness обновлена                  | repository test                   |
| Reverification с новым excerpt                                         | новый hashes/TTL; старый output сохраняет old id                                      | lifecycle integration test        |
| Current claim + свежий accepted support                                | `READY/ALLOW_GROUNDED`, citation обязательна                                          | builder test                      |
| Current-required + search disabled/timeout + нет fresh stored evidence | `CONTENT_EVIDENCE_REQUIRED`, model spy = 0 calls                                      | four-consumer tests               |
| Current-required + search disabled + есть fresh stored evidence        | `READY`, только stored citation ids                                                   | four-consumer tests               |
| Current-required + stale evidence                                      | `BLOCKED_STALE`, model spy = 0                                                        | boundary clock test               |
| Accepted contradiction                                                 | вся claim group `BLOCKED_CONFLICT`, trust не выбирает winner                          | conflict table test               |
| Evidence удалено до build                                              | item отсутствует, fact не `VERIFIED`                                                  | deletion test                     |
| Evidence удалено между build/finalize                                  | snapshot `INVALIDATED`, grounded bind запрещён                                        | concurrency test                  |
| Source/profile deleted                                                 | нет скрытого fallback; явный reason                                                   | service/UI contract test          |
| Legacy valid JSON                                                      | immutable `SEARCH_PROVIDER_RESULT` citation, не reusable/current fact                 | migration fixture                 |
| Legacy invalid JSON                                                    | draft сохранён, пустой marked legacy view                                             | migration fixture                 |
| Duplicate URL/excerpt                                                  | один canonical evidence per dedupe policy                                             | normalization test                |
| Duplicate semantic fact                                                | unique org-scoped dedupeKey; successor only on semantic change                        | repository test                   |
| Private organization source                                            | доступ same-org; URL/excerpt не public exposure                                       | API/renderer test                 |
| Source rights/robots/policy перестали разрешать use                    | evidence немедленно исключено; old draft остаётся с tombstone/status                  | registry-builder integration test |
| USER просит private source                                             | доступ по текущей org-wide MVP model                                                  | permission contract test          |
| Участник disabled/removed                                              | read/build запрещён                                                                   | auth integration test             |
| Oversized excerpt/corpus                                               | <=800 chars/item, <=8 facts/evidence, <=12k rendered                                  | property/boundary test            |
| Prompt injection в excerpt                                             | текст остаётся data, tool/action set неизменен                                        | adversarial fixture/eval          |
| Model returns unknown citation                                         | finalize rejects/marks invalid, draft not grounded                                    | structured output test            |
| Model unavailable/invalid schema                                       | context без output, bounded error, no fake citations                                  | failure test                      |
| Builder DB failure + current request                                   | retryable unavailable, model spy = 0                                                  | service failure test              |
| Future extraction without admission                                    | `AiUsageContextRequired`, no model call                                               | AI contract test                  |
| Future extraction via included/workspace key                           | один tenant-bound admission, proposed-only fact                                       | AI usage integration test         |
| New vertical path attempts schedule/publish                            | rejected; only `DRAFT` persisted                                                      | end-to-end contract test          |

Synthetic fixtures доказывают enforcement, но не доказывают production
relevance. Перед общим включением нужны shadow/live-eval на обезличенных reason
codes и ручная выборка владельца без сохранения private prompt content.

## Угрозы и приватность

| Риск                                 | Prevention                                                                                          | Recovery/наблюдение                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Cross-tenant IDOR                    | organizationId в каждой таблице/join/composite lookup; server-derived tenant                        | not-found, security counter без чужих ids, tenant test suite                   |
| Prompt injection из source           | untrusted renderer block, strip controls, fixed tools, structured output                            | citation validation, adversarial eval, invalidated output                      |
| Citation laundering provider summary | summary не evidence без matching excerpt/hash                                                       | capture reason code и review UI                                                |
| Stale/current hallucination          | `EVIDENCE_REQUIRED` pre-model gate                                                                  | model-call-without-evidence metric = 0                                         |
| Conflict silently resolved by trust  | любой accepted contradiction blocks group                                                           | conflict queue и reverification                                                |
| Private URL/text leak                | organization-only, INTERNAL_ONLY, URL скрыт из public renderer, no prompt/output logs, text-only UI | registry purge/tombstone, exposure incident metric                             |
| Deletion race/cache reuse            | finalize revalidation, short snapshot expiry, dependency invalidation                               | repeat build; invalidation rate                                                |
| Model sets VERIFIED/trust            | model proposals only; deterministic/manual acceptance                                               | audit actor/status history                                                     |
| URL/redirect SSRF                    | использовать единый source-registry safe resolver на каждом hop                                     | blocked source state; никакого fetch retry через другой path                   |
| Stored XSS                           | normalize/sanitize, render excerpt as text                                                          | purge/tombstone and UI security tests                                          |
| Unbounded cost/context               | hard DB candidate and char/item caps; no network in builder                                         | size/latency/token metrics                                                     |
| Privacy erasure conflicts with audit | registry отделяет удаляемые locator/content/excerpt от bounded tombstone                            | purge sensitive fields, keep only opaque ids/hash/times for registry retention |

## Совместимость

- Existing prompts могут временно получать renderer block вместо текущего
  `researchText`; их output shapes расширяются `citationIds` под новой contract
  version, а старый endpoint живёт за compatibility adapter до adoption.
- Existing callers, передающие только `researchSources`, продолжают работать,
  но получают compatibility `SEARCH_PROVIDER_RESULT`; он не может создать
  verified/reusable memory без excerpt/retrieval provenance.
- `Post.researchSources` остаётся derived compatibility field в rollout и не
  ломает старые reads.
- Existing `AiUsageService`, provider configuration, included quota и privacy
  ledger не меняются. Добавление future operation — additive union/schema
  value, не новый fallback.
- Existing Temporal workflow/activity не мутируются. Для нового AutoPost
  context payload нужен versioned successor.

## Остаточные риски и следующая итерация

Принятые root synthesis решения для реализации: shared relations называются
`contentContextSnapshotId` и `brandProfileVersionId`; current-required отказ —
`CONTENT_EVIDENCE_REQUIRED`; context snapshot живёт до конца последней ссылки
на draft/Post и ещё 90 дней; hard-deleted source оставляет `SOURCE_REMOVED`
tombstone без URL/excerpt.

Приоритет 1, проверяется на shadow/traffic:

- lexical ranking relevance и current-intent false negative/false positive;
- p95/query count на реальном количестве facts;
- storage growth и доля invalidated snapshots;
- слишком строгие conflicts и manual resolution workload.

Приоритет 2, только после стабильного deterministic path:

- admitted model-assisted fact proposals;
- embeddings/semantic retrieval с отдельным cost/privacy contract;
- per-user/per-team ACL;
- sentence-level factuality evaluator. Benchmark improvement здесь не считается
  production reliability без live-eval и recovery metrics.

## Итоговый архитектурный вердикт

**GO:** реализовать один
`ContentContextBuilderV1` и provenance snapshot boundary до миграции четырёх
consumers. Не начинать с LLM extraction или vector search. Самое высокое
отношение ценности к риску даёт pre-model current/conflict/deletion gate плюс
immutable ContextSnapshot: он одновременно предотвращает неподтверждённые
текущие claims, делает output проверяемым и сокращает четыре расходящихся пути
до одного контракта.
