# Единый реестр источников Content Factory

**Статус:** accepted contract + implemented first vertical slice
**Этап:** `content-factory-next-9e9`
**Проверено:** 2026-08-20
**Вердикт premortem:** `GO WITH CONDITIONS`

## Результат и границы

Организация получает один реестр для ручных материалов, URL, RSS и в будущем
Telegram. Реестр отвечает за разрешение на использование, безопасное получение,
свежесть, дедупликацию и цепочку происхождения. Generator, editor, chat-agent и
AutoPost читают один и тот же контекст. Вертикальный путь заканчивается
черновиком и не публикует его.

В эту спецификацию не входят:

- реализация, миграция БД или изменение существующего Temporal-контракта;
- live fetch, публичный scraping, подключение credential, платный/model call,
  Telegram collection, публикация или deploy;
- автоматическое признание найденного в web search URL разрешённым источником;
- извлечение фактов и разрешение конфликтов между ними — это контракт памяти
  фактов, который потребляет описанные здесь snapshot и evidence.

В первой поставке `public scraping` и `telegram collection` выключены глобально.
URL/RSS проходят только на локальных синтетических fixtures, пока оператор
отдельно не включит capability. Отдельный источник также должен быть явно
разрешён администратором организации.

## Что подтверждено текущим репозиторием

### Существующие пути

- `AutopostService` принимает один RSS URL, получает feed через
  `fetchSafePublicHttpsUrl`, разбирает уже загруженную XML-строку и при
  необходимости загружает HTML записи. Источник принадлежит `AutoPost` через
  `organizationId`, но отдельного объекта источника нет
  ([autopost.service.ts](../../libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts)).
- `WebResearchService` — provider search (`Tavily`, затем разрешённый
  `OpenRouter` fallback) и AI-классификация запроса. Он не выполняет direct
  fetch найденных URL и не подтверждает права на них
  ([web.research.service.ts](../../libraries/nestjs-libraries/src/openai/web.research.service.ts)).
- `Post.researchSources` — строка с JSON-массивом `{url,title,publishedAt}`.
  `PostsRepository` сериализует её рядом с каждой публикацией. В записи нет
  foreign key на организацию/источник/snapshot/evidence и нет состояния
  свежести
  ([schema.prisma](../../libraries/nestjs-libraries/src/database/prisma/schema.prisma),
  [posts.repository.ts](../../libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts)).
- Контроллер AutoPost получает организацию из server request context. Create
  использует `Sections.WEBHOOKS`, а update/delete/active не имеют отдельной
  policy-аннотации. Репозитории create/update/delete фильтруют по
  `organizationId`; фоновый `getAutopost(id)` полагается на UUID и затем берёт
  `organizationId` из записи
  ([autopost.controller.ts](../../apps/backend/src/api/routes/autopost.controller.ts),
  [autopost.repository.ts](../../libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts)).
- Общая модель требует одновременно membership/policy на route и tenant filter
  в repository; одно не заменяет другое
  ([auth-and-tenancy.md](../architecture/auth-and-tenancy.md)).
- Telegram уже имеет один арендованный `getUpdates` consumer, cursor по
  `update_id`, receipt-дедупликацию и retry/write-off. Второй poller нарушит
  этот контракт
  ([telegram.updates.service.ts](../../libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts),
  [telegram-pipeline-mvp.md](telegram-pipeline-mvp.md)).

### Подтверждённые пробелы, которые нельзя наследовать как готовую защиту

| Приоритет      | Доказательство                                                                                                                                      | Риск                                                                                           | Обязательное действие                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P0, must-fix   | `fetchSafePublicHttpsUrl` вызывает `fetch(...).text()` у потребителей без общего deadline, streaming byte limit, MIME/decompression budget          | медленный ответ, бесконечный stream или decompression bomb удержит память/worker               | новый source fetch gateway читает stream с отдельными connect/header/total deadline и on-wire/decompressed limits до parser                     |
| P0, must-fix   | URL validator допускает credentials и любой HTTPS port; список special IPv4/IPv6 неполон, включая неполное покрытие `fe80::/10`                     | обход сетевой границы, утечка credentials в логи, доступ к локальным или переходным адресам    | отклонять userinfo, разрешить только HTTPS/443 в первом rollout, классифицировать полный IANA special-purpose space и embedded IPv4             |
| P0, must-fix   | preflight DNS и connector lookup — две операции; dispatcher проверяет адрес при connect, но registry ещё не имеет per-hop immutable decision record | DNS rebinding/TOCTOU, неоднозначная проверка нескольких A/AAAA                                 | для каждого hop один resolve-all, deny if any answer unsafe, затем per-request pin именно этого набора с TLS hostname verification              |
| P1, must-fix   | redirect проверяется вручную, но нет общей политики удаления cross-origin headers, цикла, response budget и диагностического run record             | hop может сменить origin/тип/размер, а отказ невозможно доказать                               | максимум 5 hops; каждый hop заново проходит protocol/port/credentials/DNS; sensitive headers не переходят; цепочка сохраняется без secret query |
| P1, must-fix   | `rss-parser` и JSDOM получают целую строку; нет DTD/entity, XML depth/item или DOM node budget                                                      | entity/DOM amplification и CPU/memory exhaustion                                               | parsers не получают сеть, DTD/entities запрещены, структурные лимиты проверяются до/во время parse                                              |
| P1, must-fix   | `researchSources` — JSON без relation и immutable snapshot                                                                                          | tenant leak при ошибочном join, потеря freshness и невозможность доказать, что видел генератор | typed source → snapshot → evidence → draft relations с `organizationId` на каждом корне и cross-tenant guards                                   |
| P1, high-value | `undici` импортируется production-кодом только как transitive dependency                                                                            | обновление чужого dependency graph может сломать сетевую защиту                                | если реализация использует Undici API, объявить и зафиксировать его как direct dependency; проверить changelog/API на принятой версии           |

Текущая SSRF-защита уже правильно делает `redirect: manual`, проверяет следующий
Location до нового HTTP-запроса и передаёт проверяющий dispatcher. Это полезная
основа и regression fixture, но не полный source-ingestion contract.

## Решение и отвергнутые варианты

### Принято: единый registry с адаптерами и одним сетевым шлюзом

```text
authenticated command
  -> ContentSource (org + rights + desired state)
  -> SourceSyncRun (lease + policy decisions)
  -> Manual adapter OR guarded DirectFetch gateway OR Telegram ingress
  -> kind-specific parser (bytes only, never network)
  -> immutable SourceSnapshot
  -> Evidence excerpt/link
  -> DraftEvidence link
  -> draft only
```

Адаптеры отвечают только за особенности вида источника. Сетевой шлюз один для
URL и RSS. Parser не умеет открывать URL. Search provider остаётся отдельной
capability и не вызывает direct fetch. Context builder читает только разрешённые
snapshot/evidence через tenant-scoped repository.

### Отвергнуто: оставить URL внутри AutoPost

Это дублирует загрузку между четырьмя потребителями, не даёт общего удаления и
делает provenance свойством рецепта публикации, а не материала. Несколько
AutoPost могут использовать один источник, но сохраняют разные расписания,
каналы и промпты.

### Отвергнуто: считать результаты web search реестром

Search-provider возвращает фрагменты и URL по собственному договору. Это не
доказывает неизменность страницы, право на её прямую загрузку или то, что
фрагмент видел наш parser. Search result может быть evidence типа
`SEARCH_PROVIDER_RESULT`; ContentSource появляется только по явной команде
пользователя и после всех rights/network gates.

### Отвергнуто: дать каждому parser собственный HTTP client

Так redirect, DNS, timeout и telemetry неизбежно разъедутся. `rss-parser.parseURL`
в этой архитектуре запрещён; разрешён только `parseString`/stream над уже
ограниченным payload.

## Tenancy и права

### Инварианты

1. `organizationId` берётся из authenticated request context, никогда из body.
2. `ContentSource`, `SourceSnapshot`, `SourceEvidence`, `SourceSyncRun` и
   `DraftEvidence` содержат `organizationId`. Repository получает его первым
   аргументом и фильтрует им read/update/delete; lookup только по `id` запрещён
   на пользовательском и фоновом пути.
3. Каждая composite relation проверяет совпадение организации. Реализация
   использует composite unique/FK там, где Prisma это поддерживает, и
   service-level invariant test для каждой связи.
4. Worker получает `{organizationId, sourceId, configVersion, runKey}`, заново
   загружает source с этой парой и прекращает работу, если source выключен,
   архивирован или версия изменилась.
5. Ни URL, ни provider integration id, ни snapshot id другой организации не
   принимаются как ссылка через DTO.

### Матрица действий

Безопасный начальный default: authenticated член организации читает разрешённые
источники и использует их в черновике; только роли `ADMIN`/`SUPERADMIN` создают,
меняют, включают, синхронизируют, архивируют или hard-delete источник. Это
использует существующий role gate `Sections.ADMIN` до появления отдельной
редакционной роли. Изменение этой матрицы — отдельное продуктовое решение, а не
скрытое расширение `Sections.WEBHOOKS`.

| Действие                                | USER           | ADMIN/SUPERADMIN | Системный worker                                 |
| --------------------------------------- | -------------- | ---------------- | ------------------------------------------------ |
| list/view health, provenance            | да, внутри org | да               | только назначенный org/source                    |
| use active evidence in draft            | да             | да               | нет интерактивного выбора                        |
| create/edit manual source               | нет            | да               | нет                                              |
| add URL/RSS locator                     | нет            | да               | нет                                              |
| confirm rights / enable / sync now      | нет            | да               | только после всех gates                          |
| archive / hard-delete                   | нет            | да               | исполняет уже авторизованную команду             |
| enable Telegram capability / credential | нет            | нет              | только операторская конфигурация вне этой стадии |

Read/use возвращают `404` для чужого/неизвестного id, mutation policy refusal —
`403`; tariff `402` не должен маскировать role denial.

## Модель данных

Названия рабочие; перед миграцией они фиксируются в data contract.

### `ContentSource`

- `id`, `organizationId`, `kind`, `displayName`;
- `canonicalKey` — tenant-local identity; unique
  `(organizationId, kind, canonicalKey)`; запись не удаляется физически до
  hard purge, поэтому архив не освобождает дубликат, а повторное добавление
  предлагает restore;
- хранится canonical public URL без userinfo и fragment; query сохраняется,
  потому что может менять ресурс, но locator целиком считается чувствительными
  данными организации. UI показывает redacted query, application/HTTP logs не
  пишут query. Private/tokenized feeds не поддержаны initial rollout: если
  provider когда-нибудь требует secret, он хранится в существующей secret
  boundary, а source содержит только opaque credential reference;
- `desiredState`: `DRAFT | ACTIVE | DISABLED | ARCHIVED | PURGING`;
- `healthState`: `NEVER_SYNCED | FRESH | STALE | ERROR | POLICY_BLOCKED`;
- `rightsState`: `UNCONFIRMED | CONFIRMED | DENIED`, actor/time/note;
- `robotsState`: `NOT_APPLICABLE | UNKNOWN | ALLOWED | DISALLOWED | ERROR`;
- `configVersion`, `schedule`, `lastValidatedAt`, `freshUntil`,
  `nextFetchNotBefore`, `lastSuccessAt`, `lastErrorCode`;
- audit: created/updated/archived actor/time. User-facing error сохраняет
  стабильный code, не raw response, stack или secret URL.

Состояния разделены: `desiredState` выражает волю пользователя, `healthState` —
результат последней проверки. Ошибка сети не включает источник, а disabled
источник не становится stale job.

### `SourceSyncRun`

Immutable attempt record: org/source/configVersion/runKey, trigger, queued/start/
finish time, status, policy decisions, HTTP status, redirect count, byte counts,
parser outcome, retry number и safe error code. IP, headers, body и query с
секретом в обычные логи не попадают. Один active lease на source; уникальный
`runKey` делает redelivery идемпотентной.

### `SourceSnapshot`

Immutable удачный снимок:

- org/source/run id, sequence, observed/validated/published time;
- requested canonical URL, final canonical URL и sanitized redirect chain;
- ETag/Last-Modified/Cache-Control/Expires и calculated cache/freshness dates;
- content type/charset, compressed/decompressed byte count, content SHA-256;
- parser/version, normalized title/text и kind-specific external identity;
- `supersededAt`, `retentionUntil`, `purgedAt`.

`304 Not Modified` обновляет validation/health через run и ссылку на текущий
snapshot; новый snapshot не создаётся. `200` с тем же normalized content hash
также не создаёт дубль, но записывает успешную validation.

### `SourceEvidence` и `DraftEvidence`

`SourceEvidence` указывает ровно на один snapshot, содержит bounded excerpt или
структурное поле, locator внутри snapshot, дату наблюдения и freshness status.
`DraftEvidence` связывает evidence с draft/post group и сохраняет роль
(`SUPPORTS | CONTEXT_ONLY | CONTRADICTS`), точную версию context contract и
время. Цепочка всегда читается так:

```text
organization -> source -> snapshot -> evidence -> draft evidence -> draft
```

Для legacy search citation допускается отдельный immutable snapshot kind
`SEARCH_PROVIDER_RESULT`, который хранит provider metadata и полученный
фрагмент, но не притворяется direct-fetch snapshot.

## Матрица capabilities

| Вид      | Вход                                           | Сеть                                | Автосинхронизация                       | Dedupe                                                | Freshness                                                       | Default                        |
| -------- | ---------------------------------------------- | ----------------------------------- | --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| Manual   | текст/структурная заметка администратора       | нет                                 | нет                                     | content hash внутри source; новая редакция = snapshot | `reviewedAt` и заданный review period; без него `NOT_MONITORED` | доступен                       |
| URL      | один явно добавленный public HTTPS document    | guarded direct fetch                | в первом rollout нет; только `sync now` | canonical URL, затем content hash                     | HTTP validators + product freshness window                      | global capability off          |
| RSS/Atom | один явно добавленный feed URL                 | guarded direct fetch                | да после отдельного включения           | canonical feed; item identity rules ниже              | HTTP validators, cache directives, RSS `ttl`, schedule          | global capability off          |
| Telegram | существующая bot integration + numeric chat id | только существующий central ingress | push/poll consumer уже общий            | `update_id`, затем chat/message id                    | received/edited time                                            | collection off, no credentials |

Manual update никогда не переписывает snapshot: создаётся новая revision. URL
не следует страницам второго уровня и не загружает картинки, CSS, script,
iframe или canonical link. RSS может создать item snapshots только из bounded
feed payload; переход по item link — отдельная URL capability и отдельное
решение rights/robots.

### RSS/Atom identity

- Atom `atom:id` хранится и сравнивается побайтно как строка; стандарт требует
  стабильность и уникальность, но dereference не выполняется
  ([RFC 4287, §4.2.6](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.6)).
- RSS `guid` — opaque string. Он становится URL только при явном
  `isPermaLink=true`; при отсутствии `guid` fallback: canonical item link, затем
  hash стабильных полей
  ([RSS 2.0, guid](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt)).
- Identity namespace всегда включает source id: одинаковые GUID разных feeds
  не объединяются.
- `pubDate` и feed order не являются identity. Edit того же id создаёт новый
  snapshot/revision, а не новый source item.

## URL canonicalization и duplicate

Canonicalization выполняется до DNS/HTTP через WHATWG `URL` Node 22.23.2. Node
использует тот же WHATWG API, а parse/serialize стабилизируется повторным
parse/serialize
([Node URL 22](https://nodejs.org/docs/latest-v22.x/api/url.html),
[WHATWG URL](https://url.spec.whatwg.org/)).

Правила:

1. trim outer whitespace, `new URL(input)`, затем reject invalid;
2. protocol ровно `https:`, port пустой/default 443, hostname обязателен;
3. `username` и `password` должны быть пусты; fragment удаляется;
4. WHATWG normalization отвечает за lowercase scheme/host, IDNA, IP literal,
   dot segments, percent encoding и default port;
5. path case, trailing slash и query сохраняются; query parameters не
   сортируются и marketing parameters автоматически не удаляются — это может
   менять ресурс;
6. `rel=canonical`, feed self-link и permanent redirect сохраняются как hint,
   но не объединяют источники автоматически. 301/308 предлагает admin merge
   после повторной policy/tenant проверки;
7. duplicate create возвращает существующий tenant-local source и не создаёт
   сеть/job/snapshot. Archived duplicate предлагает restore.

Raw input не хранится в audit. Audit получает source id, actor и redacted
canonical display без userinfo/query. Полный canonical locator остаётся только
в tenant-scoped source record.

## Freshness и HTTP cache validators

Это две разные величины:

- `nextFetchNotBefore` ограничивает, когда допустим следующий запрос;
- `freshUntil` объясняет, до какого времени последний snapshot разрешено
  считать актуальным для context builder.

При успешном ответе вычисляются HTTP freshness lifetime и validators. При
следующей проверке отправляются `If-None-Match` и, если есть, `If-Modified-Since`.
`If-None-Match` предназначен для conditional GET и позволяет серверу ответить
`304`
([RFC 9110, §13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2));
`Last-Modified` считается более слабым validator и не заменяет content hash
([RFC 9110, §8.8.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.2)).

Порядок для `nextFetchNotBefore`: явные `Cache-Control`/`Expires`, затем RSS
`ttl`, затем product default. RSS `ttl` задаётся минутами, в течение которых
канал можно не обновлять
([RSS 2.0, ttl](https://www.rssboard.org/rss-specification#ltttlgtSubelementOfLtchannelgt)).
`no-cache` означает revalidate, а не удалить. При `no-store` reusable registry
не сохраняет ни raw, ни normalized representation: run может сохранить только
metadata/error, а source остаётся непригодным для reusable evidence.
`must-revalidate` запрещает молча использовать stale snapshot после неуспешной validation
([RFC 9111, §5.2.2.2](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.2)).

Default product windows для первого rollout:

- manual: `NOT_MONITORED`, пока администратор не задаст review period;
- URL: fresh 24 часа после validation;
- RSS: fresh до двух ожидаемых интервалов, но не дольше 24 часов;
- validation failure оставляет прошлый snapshot видимым как `STALE`, однако
  context builder не выдаёт его как подтверждённое текущее утверждение.

Clock source — server UTC. Будущие даты из remote metadata не продлевают
freshness.

## Network threat model и обязательный fetch contract

### Capability и policy gates до HTTP

Проверки идут в таком порядке:

1. global capability разрешает kind/operation;
2. actor role и tenant ownership;
3. source `ACTIVE`, configVersion актуальна, rights `CONFIRMED`;
4. terms/operator domain policy не запрещает операцию;
5. canonical URL syntax/protocol/port/userinfo;
6. resolve-all DNS и public-address policy;
7. robots policy разрешает этот user-agent/path;
8. только затем HTTP source connect.

Robots и Terms — разные gates. Robots Exclusion Protocol задаёт пожелания для
crawler и прямо не является access authorization
([RFC 9309, §1](https://www.rfc-editor.org/rfc/rfc9309.html#section-1)). Terms/
лицензия требуют отдельного подтверждения администратора и operator denylist;
успешный robots check не доказывает право копировать/использовать материал.
Для автоматического URL/RSS fetch недоступный или неоднозначный robots policy
в первом rollout закрывает sync (`POLICY_BLOCKED`), а не разрешает его.
Получение самого `robots.txt` — отдельный bounded request через тот же сетевой
gateway после URL/DNS gate; оно не использует parser source и кэшируется только
по правилам RFC 9309/HTTP.

Добавление source само не делает HTTP-запрос: после syntax/canonical duplicate
check сохраняется `DRAFT/DISABLED`. DNS preflight и redirect известны только во
время явно запущенной проверки. Unsafe initial DNS блокируется до connect;
unsafe redirect сохраняет только safe run diagnosis и блокируется до следующего
hop и до snapshot/content persistence.

### Protocol, port, credentials и addresses

- только HTTPS и default port 443; HTTP, FTP, file, data, blob, gopher, ws/wss и
  custom port запрещены в initial rollout;
- URL credentials запрещены, `credentials: omit`; cookie jar, Authorization,
  Proxy-Authorization и ambient credential отсутствуют;
- каждый redirect `Location` разрешается относительно текущего URL, проходит
  весь gate заново; максимум 5 hops, повтор URL означает cycle;
- cross-origin hop не получает conditional или tenant headers предыдущего
  origin. В стандарте Fetch redirect по умолчанию следует до 20 раз, поэтому
  product обязательно использует `redirect: manual`
  ([WHATWG Fetch, HTTP-redirect fetch](https://fetch.spec.whatwg.org/#http-redirect-fetch));
- deny всех literal/resolved IPv4/IPv6, которые не являются public globally
  reachable unicast, включая private, loopback, link-local, carrier/shared,
  multicast, unspecified, documentation, benchmarking, reserved, IPv4-mapped,
  translation/transition и embedded private IPv4. Источником истины служат
  актуальные [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry)
  и [IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry)
  special-purpose registries, а не вручную выбранные несколько префиксов;
- resolve-all отклоняет hop, если хотя бы один A/AAAA unsafe. Набор pin-ится в
  per-request connector; новое DNS lookup при connect запрещено. TLS
  проверяется по исходному hostname. Новый sync и новый hop получают новый
  resolve/pin decision;
- Node `dns.lookup(...,{all:true})` использует OS resolver и возвращает все
  обнаруженные адреса; именно этот resolver должен совпадать с network client
  ([Node DNS 22](https://nodejs.org/docs/latest-v22.x/api/dns.html#dnslookuphostname-options-callback)).

### Time, size, MIME и decompression budgets

Initial budgets должны быть конфигурацией с приведёнными безопасными defaults;
увеличение — операторская настройка, не source field:

| Budget                  | Default              | Отказ                             |
| ----------------------- | -------------------- | --------------------------------- |
| DNS                     | 2 s                  | `DNS_TIMEOUT`                     |
| connect/TLS             | 3 s                  | `CONNECT_TIMEOUT`                 |
| response headers        | 8 s                  | `HEADERS_TIMEOUT`                 |
| весь hop/body           | 20 s                 | `TOTAL_TIMEOUT`                   |
| redirects               | 5                    | `REDIRECT_LIMIT`/`REDIRECT_CYCLE` |
| response headers        | 32 KiB               | `HEADERS_TOO_LARGE`               |
| compressed/on-wire body | 2 MiB                | `COMPRESSED_TOO_LARGE`            |
| decompressed body       | 8 MiB и не более 20× | `DECOMPRESSION_LIMIT`             |
| normalized text         | 2 млн символов       | `TEXT_TOO_LARGE`                  |

`Content-Length` проверяется до чтения, но ему нельзя доверять как единственному
лимиту. Body читается stream, abort при превышении; `.text()` до budget check
запрещён. Реализация обязана доказать отдельный on-wire и decoded count: Node
fetch может отдавать уже decoded body. Node 22 поддерживает `AbortSignal.timeout`
и custom dispatcher для `fetch`
([Node globals: fetch](https://nodejs.org/docs/latest-v22.x/api/globals.html#fetch),
[Node globals: AbortSignal.timeout](https://nodejs.org/docs/latest-v22.x/api/globals.html#static-method-abortsignaltimeoutdelay)).

Разрешённые final MIME:

- URL: `text/html`, `application/xhtml+xml` с поддерживаемым charset;
- RSS: `application/rss+xml`, `application/atom+xml`, `application/xml`,
  `text/xml`;
- missing/generic/octet-stream, media, archive, executable и MIME/kind mismatch
  отклоняются. Sniffing не превращает binary в text.

Разрешены только явно поддержанные `gzip`, `br`, `deflate`; unknown или цепочка
encoding отклоняется. Метрики сохраняют и on-wire, и decoded bytes.

### Parser budgets

RSS/Atom parser:

- `DOCTYPE`, DTD, external/general/parameter entity declarations запрещены;
  XML допускает internal/external entities и replacement text, поэтому parser
  не должен полагаться на «мы не загружаем URL» как единственную защиту
  ([XML 1.0, §4](https://www.w3.org/TR/xml/#sec-physical-struct));
- no network resolver; depth 64, attributes 64 на element, items 500, поле
  256 KiB, суммарный normalized text 2 млн символов;
- invalid dates остаются null; future date не управляет freshness;
- item link проходит URL syntax normalization, но не загружается.

HTML parser:

- scripts/styles/templates/noscript удаляются, script execution и resource
  loader выключены;
- DOM nodes 50 000, depth 128, extracted text 2 млн символов;
- iframe/image/CSS/font/link preload не загружаются; `rel=canonical` — metadata
  hint;
- source text считается недоверенными данными и отделяется от system prompt.
  Инструкции внутри материала не могут включить tool, сеть, публикацию или
  изменить rights.

### Search, parser и direct fetch

| Boundary              | Может сеть                          | Может parser               | Может создать source       | Может стать evidence          |
| --------------------- | ----------------------------------- | -------------------------- | -------------------------- | ----------------------------- |
| Manual adapter        | нет                                 | bounded text normalization | да, explicit admin command | да                            |
| DirectFetch gateway   | только URL/RSS по gates             | нет                        | нет                        | только через parser snapshot  |
| RSS/HTML parser       | нет никогда                         | да, kind-specific          | нет                        | создаёт snapshot/evidence     |
| WebResearchService    | provider API по AI config/cost gate | provider result only       | нет                        | `SEARCH_PROVIDER_RESULT`      |
| Context builder/model | нет                                 | нет                        | нет                        | читает selected evidence only |

Это запрещает использовать search как proxy для denied robots/terms и запрещает
parser самостоятельно догружать item/page/media.

## Concurrency, retry и idempotency

- не более одного active `SourceSyncRun` на source; duplicate trigger получает
  текущий run, а не вторую сеть;
- default concurrency: 20 global, 4 на organization, 2 на registrable host;
  per-host token bucket и уважение bounded `Retry-After`;
- retry максимум 3 attempts с exponential backoff + jitter для connect/timeout,
  `408`, `429`, `502`, `503`, `504`. Нет retry для policy, DNS unsafe, other 4xx,
  redirect, MIME/size/parser failure;
- каждый attempt заново проходит desiredState/configVersion/rights/robots и DNS;
- snapshot insert имеет unique `(sourceId, contentHash, parserVersion)` или
  эквивалентный transaction guard; item identity unique внутри source;
- crash до snapshot commit оставляет retryable run; snapshot + current pointer
  меняются одной transaction. Notification/indexing после commit идёт через
  outbox/idempotent event;
- archive/purge повышает configVersion и отменяет queued work. Поздний response
  не может commit после повторной state/version проверки;
- Temporal получает новый versioned workflow/activity. Существующий upstream
  `autoPostWorkflow` не изменяется на месте.

## Lifecycle, ошибки и интерфейсный контракт

### Lifecycle

1. **Create draft:** validate DTO/canonical duplicate, сохранить disabled source;
   сети нет.
2. **Confirm rights:** admin фиксирует основание и scope использования.
3. **Validate:** capability/policy/robots/network/parser; создать первый
   snapshot или показать bounded error.
4. **Enable:** только source с успешным snapshot и пройденными gates становится
   `ACTIVE`.
5. **Sync:** conditional fetch или manual revision; health/freshness обновляются.
6. **Disable:** немедленно исключить из новых context и остановить schedule;
   история остаётся для существующих drafts.
7. **Archive:** скрыть из обычного списка, исключить из context, сохранить
   restorable config/provenance.
8. **Hard delete:** `PURGING`, отмена jobs, затем purge content/locator и
   evidence treatment ниже. Restore после purge невозможен.

### User-visible states

Registry показывает kind, display name, desired state, health, last validated,
fresh until, next sync, rights и одно безопасное действие. Обязательные исходы:
loading, empty, ready/fresh, selected, disabled, stale, recoverable error,
policy blocked, access restricted, deleting. Реальный fetch никогда не
изображается успешным по fixture.

[Lazyweb product evidence](https://www.lazyweb.com/agentic-search/41b95e71-68b0-4bbb-8df0-259a853dafac)
подтвердил полезность четырёх паттернов: явный `Add URL`, registry со status,
отдельное расписание sync и ownership/diagnostic state для RSS. Эта ссылка —
product evidence, не доказательство безопасности и не визуальный стиль.

### Stable error taxonomy

`POLICY_DISABLED`, `RIGHTS_REQUIRED`, `ROBOTS_DISALLOWED`, `TERMS_DENIED`,
`INVALID_URL`, `UNSUPPORTED_PROTOCOL`, `UNSUPPORTED_PORT`, `URL_CREDENTIALS`,
`DNS_UNSAFE`, `DNS_REBIND_BLOCKED`, `REDIRECT_UNSAFE`, `TIMEOUT`,
`RESPONSE_TOO_LARGE`, `UNSUPPORTED_CONTENT_TYPE`, `DECOMPRESSION_LIMIT`,
`XML_POLICY`, `PARSE_FAILED`, `REMOTE_4XX`, `REMOTE_5XX`, `RATE_LIMITED`.

UI не показывает resolved IP, body, raw exception или credential. Operator log
получает correlation/run id, source id, org id, hop number и code.

## Storage, retention и deletion

| Данные                                                     | Default retention    | Удаление                                                 |
| ---------------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| raw HTTP body                                              | не сохраняется       | stream освобождается после parse/error                   |
| текущий normalized snapshot активного source               | пока source активен  | archive сохраняет; hard delete purge                     |
| superseded snapshots без draft evidence                    | 90 дней              | scheduled purge                                          |
| snapshot/evidence, на который ссылается существующий draft | срок draft + 90 дней | archive сохраняет trace; hard delete редактирует content |
| sync runs без body/secret headers                          | 30 дней              | purge по сроку                                           |
| purge tombstone: opaque ids/hash/times                     | 30 дней              | затем удалить                                            |

Archive — обратимое продуктовое действие, не обещание стирания. Hard delete —
необратимое privacy действие: источник немедленно исключается из context,
полный locator, normalized content и excerpts удаляются не позднее 24 часов;
DraftEvidence остаётся как tombstone `SOURCE_REMOVED` без контента/URL, чтобы
готовый draft не выдавал удалённый материал за доступное доказательство.
Удаление draft не удаляет shared source; удаление organization каскадно/явно
purge все source payload и provider references.

Для этого этапа принят product default: soft delete немедленно исключает source
из context, hard purge ставится в очередь с целью завершения за 24 часа,
неудалённые superseded snapshots хранятся 90 дней. Позже сроки можно вынести в
операторскую конфигурацию. Активного production purge job сейчас нет: SLA
становится обещанием только после реализации и runtime-проверки.

## Telegram boundary

Telegram остаётся disabled, но data contract не должен требовать будущей
ломающей миграции:

- source указывает на существующую tenant-owned bot integration и numeric
  `chat_id`; username не является identity;
- credential остаётся в integration secret boundary и никогда не копируется в
  `ContentSource`, snapshot или log;
- новый adapter не вызывает `getUpdates`. Существующий single consumer добавляет
  versioned action/outbox для разрешённого source после tenant mapping;
- Bot API `update_id` помогает игнорировать duplicates и восстанавливать
  порядок; offset должен быть больше обработанного id
  ([Telegram Bot API: Update/getUpdates](https://core.telegram.org/bots/api#getupdates));
- webhook и `getUpdates` взаимно исключаются, поэтому переключение transport —
  отдельная операторская миграция, не source setting
  ([Telegram Bot API: setWebhook](https://core.telegram.org/bots/api#setwebhook));
- MVP принимает только новые разрешённые `channel_post`/edited events после
  enable; Bot API не обещает импорт истории. Media не скачивается автоматически;
  текст/metadata проходят те же size/retention/provenance rules.

## Миграция и rollout

### Phase 0 — contracts and RED

- принять эту спецификацию, retention decision и матрицу ролей;
- зафиксировать DTO/error/context contracts и acceptance fixtures;
- feature flags `SOURCE_REGISTRY_READ`, `SOURCE_DIRECT_FETCH`,
  `SOURCE_PERIODIC_SYNC`, `SOURCE_TELEGRAM_INGEST` по умолчанию false;
- объявить direct network dependencies, проверить лицензии/AGPL и lockfile.

### Phase 1 — additive schema, no behavior change

- Prisma migration добавляет registry/snapshot/evidence/run/link tables,
  nullable `AutoPost.sourceId` и typed draft provenance;
- migration проходит `prisma migrate diff` guard; `prisma db push` запрещён;
- legacy AutoPost и `Post.researchSources` остаются authoritative;
- никаких network jobs при deploy.

### Phase 2 — deterministic backfill

- каждый non-deleted AutoPost URL canonicalize внутри его organization и
  связывается с tenant-local RSS source. Несколько AutoPost могут разделять
  source, но сохраняют свои schedule/targets;
- source создаётся `DISABLED`/`LEGACY_SHADOW`; backfill не делает DNS/HTTP и не
  включает второй scheduler;
- `researchSources` валидного JSON переносится в immutable
  `SEARCH_PROVIDER_RESULT` citation/draft links. Он не создаёт ContentSource и
  не инициирует fetch. Malformed JSON получает bounded migration error, исходная
  строка сохраняется до reconciliation;
- batch restart-safe: cursor + unique keys; каждое чтение/запись tenant-scoped;
  counts/digests сверяются до cutover.

### Phase 3 — dual write/read shadow

- новые drafts пишут typed provenance и совместимый legacy JSON;
- новый context builder работает shadow, результат сравнивается без передачи
  модели и без изменения UI;
- synthetic source sync пишет snapshot, но не доступен consumers;
- telemetry: dedupe, blocked SSRF, bytes, latency, parser errors, stale age,
  cross-tenant refusal.

### Phase 4 — cohort cutover

- сначала manual source, затем URL sync-now, затем RSS conditional sync для
  одной тестовой организации; public network остаётся off до operator authority;
- AutoPost переводится на новый versioned workflow/activity, который читает
  source snapshot и создаёт только draft;
- consumers переключаются одним context-contract flag, не по отдельности;
- после каждого cohort проверяются tenant, provenance, stale fallback и no-live-
  publish invariants.

### Phase 5 — cleanup later

- только после принятой release telemetry typed provenance становится read
  authority;
- legacy JSON/columns/workflow удаляются отдельной миграцией и отдельным
  решением; hard delete/backfill rollback уже доказаны;
- Telegram рассматривается лишь после отдельного operator/credential/security
  этапа.

### Rollback

Trigger: tenant leak, unsafe connect, duplicate scheduling, потеря provenance,
рост memory/timeout или расходящиеся consumer outputs. Последовательность:

1. выключить direct-fetch/scheduler/consumer flags; queued jobs re-check flags;
2. вернуть legacy read и существующий AutoPost workflow;
3. оставить additive tables и dual-written данные read-only для расследования;
4. отменить leases безопасным expiry, не hard-delete snapshot;
5. исправить forward и повторить shadow reconciliation.

Rollback не требует down migration и не возобновляет публикацию.

## Acceptance matrix

Все сетевые сценарии используют deterministic local fixtures и injected DNS/
connector. Никакого public live fetch.

| Boundary           | Normal path                                                               | Failure path                                                                                             | Integration edge / доказательство                                                                             |
| ------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tenancy            | ADMIN org A создаёт manual source; USER A читает/использует               | USER mutation 403; org B id read/use/mutate 404; worker с mismatched org прекращает run                  | composite links не связывают source/snapshot/evidence/draft разных org; DB/service contract test              |
| Create/dedupe      | WHATWG canonical URL создаёт один disabled source без сети                | invalid, credentials, HTTP, custom port отвергнуты; duplicate возвращает existing                        | query/path semantic differences не сливаются; archive duplicate предлагает restore                            |
| SSRF initial       | injected public A+AAAA pin-ятся и TLS hostname сохраняется                | private/special IPv4, `fe90::`, mapped/embedded private IPv4, mixed public+private set — no connect      | DNS меняется между preflight/connect: connector использует только pinned set; second resolver call fails test |
| Redirect           | relative/public HTTPS chain до 5 hops                                     | private/special, HTTP, credential, custom port, loop, hop 6 — no next connect/no snapshot                | каждый hop имеет отдельный policy/DNS record; cross-origin header stripping asserted                          |
| Response budgets   | bounded supported MIME stream создаёт snapshot                            | DNS/connect/header/total timeout; lying/missing Content-Length; on-wire/decoded/ratio/header limit abort | slow stream освобождает lease/body; no `.text()` before limit                                                 |
| Parser             | bounded RSS/Atom и HTML без subresource создают normalized snapshot       | DTD/entity, deep/wide XML, >500 items, DOM nodes/depth/text, MIME mismatch reject                        | parser mock с network attempt невозможен по типу/adapter contract                                             |
| HTTP cache         | ETag/Last-Modified conditional GET; 304 переиспользует snapshot           | invalid future metadata не продлевает freshness; must-revalidate failure yields stale/unconfirmed        | 200 same hash не дублирует snapshot; RSS ttl влияет только на next eligibility                                |
| Rights/policy      | confirmed rights + allowed robots + active capability запускают sync      | global off, rights unknown/denied, robots disallow/error, terms deny — zero source HTTP                  | search result не обходит direct-fetch gate и не auto-creates source                                           |
| Concurrency        | duplicate trigger возвращает один run; commit atomically advances pointer | transient retry ≤3; permanent/policy/parser errors no retry; late response after disable cannot commit   | two workers, lease loss, redelivery and crash-before/after-commit fixtures prove idempotency                  |
| Lifecycle          | disable/archive немедленно убирает source из нового context               | purge cancels jobs and removes content/URL ≤24h                                                          | старый draft показывает `SOURCE_REMOVED`, не скрытый активный context                                         |
| AutoPost migration | two recipes share one RSS source and create traceable drafts              | unavailable/stale research does not invent current claim; malformed legacy JSON quarantined              | new versioned workflow, legacy flag rollback, no live publish call                                            |
| Telegram future    | central consumer maps allowed update to one org source/snapshot           | collection off, unknown chat, duplicate/out-of-order update, missing integration reject                  | никакого второго `getUpdates`; credential absent from source/log/snapshot                                     |
| Four consumers     | generator/editor/chat/AutoPost see same context version/source/freshness  | unavailable evidence excluded or visibly stale, no unsupported current statement                         | one fixture produces equal selected evidence ids and draft provenance in all four paths                       |

Release gate дополнительно требует migration guard, focused tests, browser state
review, `pnpm run build`, `pnpm test`, docs/process checks и fresh stage receipt;
это root-owned acceptance, не доказательство этого research stream.

## Premortem и условия GO

Blast radius:

```text
source commands
  -> org permissions + registry rows
  -> DNS/outbound network + parsers + scheduler
  -> snapshots/evidence/context builder
  -> generator/editor/chat/AutoPost drafts
  -> retention/purge/audit/operator telemetry
```

| Failure symptom                                      | Evidence                                           | Mechanism / impact                                                     | Detection                                        | Mitigation                                                                          | Disposition                                        |
| ---------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| request reaches metadata/VPC/private service         | confirmed gap in current range/port contract       | SSRF via literal, DNS, rebinding or redirect; credential/data exposure | zero-connect fixtures + outbound deny telemetry  | full special-range policy, per-hop resolve-all/pin, HTTPS/443 only, egress firewall | block implementation until RED exists              |
| worker OOM/CPU spike                                 | confirmed missing budgets                          | unbounded body/decompression/XML/DOM                                   | byte/ratio/deadline metrics, killed-worker alert | streaming abort + parser budgets                                                    | block implementation until gateway contract exists |
| org B evidence appears in org A draft                | current JSON has no relation; future risk concrete | missing tenant predicate/relation                                      | cross-tenant negative matrix + audit             | org on every root/composite relation/repository                                     | block cutover                                      |
| deleted source still informs new draft               | plausible unless context/purge atomically exclude  | late job/cache or evidence selection                                   | deletion fixture and context selection log       | configVersion fence, active-only query, tombstone                                   | block cutover                                      |
| duplicate RSS jobs create inconsistent snapshots     | plausible with scheduler retries                   | two workers/redelivery                                                 | active-run and snapshot unique violations        | lease + runKey + atomic pointer/outbox                                              | preflight                                          |
| robots accepted as copyright permission              | confirmed semantic mismatch by RFC                 | rights violation despite technical access                              | source rights/robots shown separately            | two gates, admin confirmation, operator denylist                                    | preflight                                          |
| Telegram updates lost/doubled                        | confirmed existing single-consumer contract        | second poller/offset competes                                          | consumer lease/receipt metrics                   | central consumer action only, capability off                                        | defer Telegram                                     |
| executor implements spec by widening unrelated fetch | plausible executor error                           | source policy changes webhooks/providers silently                      | scoped diff, explicit new gateway consumers      | no global replacement until compatibility tests                                     | preflight                                          |

Условия начала production-кода:

- принятые role matrix и retention defaults перенесены в data/API contracts;
- сетевой gateway имеет RED для SSRF, redirect, budgets и parser separation;
- schema/context contract имеет cross-tenant и deletion RED;
- direct-fetch, periodic sync и Telegram остаются off во всех defaults;
- egress firewall/runtime DNS/proxy поведение проверяется в целевой среде.

Static research не доказывает runtime egress, proxy, DNS, TLS, database locking,
Temporal redelivery или purge SLA. Эти проверки обязательны до cohort cutover.

## Первичные источники

- [Node.js 22: WHATWG URL](https://nodejs.org/docs/latest-v22.x/api/url.html)
- [Node.js 22: fetch/custom dispatcher и AbortSignal](https://nodejs.org/docs/latest-v22.x/api/globals.html#fetch)
- [Node.js 22: dns.lookup](https://nodejs.org/docs/latest-v22.x/api/dns.html#dnslookuphostname-options-callback)
- [WHATWG URL Living Standard](https://url.spec.whatwg.org/)
- [WHATWG Fetch Living Standard](https://fetch.spec.whatwg.org/)
- [IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry)
- [IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
- [RFC 4287: Atom](https://www.rfc-editor.org/rfc/rfc4287.html)
- [RSS 2.0 specification](https://www.rssboard.org/rss-specification)
- [W3C XML 1.0](https://www.w3.org/TR/xml/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
