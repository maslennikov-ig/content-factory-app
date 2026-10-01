# План: сюжеты и provenance ссылок в поводах

Статус: принят root для изолированной реализации; локальный код подготовлен,
применение схемы, итоговая приёмка и выпуск принадлежат root. Основная цель — закрыть `75xn.33` и
`75xn.34` одним end-to-end срезом, не меняя критерии уже принятых задач.

## Критерий готовности

- В одной проверке TOPIC повторяющиеся статьи об одном конкретном событии дают
  одну карточку с каждым исходным URL и сохранённым происхождением ссылок.
- Негативный пример о том же широком предмете не объединяется; связанная цепочка
  A–B и B–C не склеивает A с C без прямого попарного свидетельства.
- Перепечатка с неподтверждённой ссылкой на первоисточник остаётся видимой,
  обозначена как непроверенная и не получает приоритет первоисточника. Явное
  сохранённое доказательство `VERIFIED_PRIMARY` действительно ставит источник
  первым. Одна только ссылка/домен/выдача статуса не даёт.
- Повторная проверка идемпотентно дополняет `sourceRefsJson`, сохраняя
  принятие/отклонение;
  tenant-граница сохраняется до API/UI.
- У исторических карточек с `sourceRefsJson = null` старая основная ссылка остаётся
  доступной через fallback. Исходные freshness, paid/cache/error и RSS-пути не
  регрессируют.

## Порядок работ и владельцы файлов

**1. Зафиксировать минимальный корпус.** Выбраны три исходные пары из
`.codex/stages/content-factory-next-75xn/evidence/quality-2026-09-13-after/FINDINGS.md`
и минимизирует ровно нужные title/excerpt/UTC-day/URL/provider поля в
`tests/fixtures/lead-story-provenance/`. Сохранить в fixture ссылку на исходный
evidence и JSON pointer. Добавить отрицательную пару из `outB/leads-dated.json`
`/leads/0` + `/leads/9`. Перепечатки — `/leads/1` и `/leads/8`: записанные там
ссылочные заметки не сопровождаются HTML evidence, поэтому ожидаемое состояние
для них `CLAIMED_UNVERIFIED`. Root принимает любой дополнительный материал о
первоисточнике до добавления fixture, помеченного `VERIFIED_PRIMARY`.

**2. Реализовать pure grouping helper.** Новый
`libraries/nestjs-libraries/src/content-intelligence/leads/lead-story-cluster.ts`
без Nest/HTTP/Prisma: нормализация через `textStems`, исключение стемов темы,
пара ≥3 и UTC-даты ≤2 дней, deterministic complete-link, ambiguous→standalone.
Добавить `tests/lead-story-cluster.test.cjs` на положительные, отрицательные,
перестановки входа, неизвестную дату, одинаковую тему и A–B/B–C/A–C. Изменения
не затрагивают `lead-junk.ts` и существующие причины отказа.

**3. Сохранить ограниченную source evidence.** Новый
`lead-source-attribution.ts` принимает только HTML уже разрешённого `readPage`;
не имеет fetch/gateway и парсит только явно подписанные source/original ссылки.
Тесты задают HTML, URL-length/count caps, опасные/не-HTTPS href и пустой
результат. В `lead-topic.gateway.ts` использовать те же восемь разрешённых
чтений, deadline, robots/network policy и отказы. Не добавлять отдельное чтение
страницы.

**4. Провести ссылки сквозь типы и запись.** В `lead-feed.gateway.ts` определить
отдельную типизированную структуру source refs/attributions для внутреннего
результата; RSS остаётся на существующем `sourceUrl`, topic gateways передают
все URL одной story-группы. Оба topic режима используют helper, но правила
источников остаются внутри `LeadTopicGateway` и `CommunityTopicDiscoveryService`.
Temporal workflow/activity input не меняется. В
`content-lead.service.ts` ветка TOPIC передаёт repository story-group запись;
обычный feed продолжает идти по прежнему `upsertLeads`.

В `schema.prisma` добавить одно nullable `ContentLead.sourceRefsJson Json?` поле.
Значение — строгий URL-only envelope
`{version: 1, sources, attributions, truncated}`: максимум 50 записей каждого
типа, URL до 2 048 знаков, nullable canonical URL, фиксированные поля и статусы;
найденные URL не обрезаются, переполнение отказывает запись.
Ограниченные атрибуции могут иметь `truncated: true`. Никаких foreign
tenant/entity IDs. Валидатор на чтении с неизвестной/неподдержанной схемой
возвращает fallback, на записи — отказывает. В
`content-lead.repository.ts` транзакционно сохранять карточку и envelope,
идемпотентно объединять источники по каноническому URL и сохранять существующий
`externalId` при единственном совпадении. Пересечение с несколькими старыми
карточками — конфликт без автоматического merge или изменения статусов. Путь
без пересекающихся URL не пытается угадать историческую идентичность. `listLeads`
возвращает envelope в том же tenant-фильтре. Если позже в него попадёт
`evidenceId`, его tenant требуется проверять отдельным запросом.

**5. Вывести все ссылки в существующую карточку.** В
`content-leads.adapter.ts` строго разобрать `sourceRefsJson` с fallback на
`sourceUrl`. В `content-leads.tab.tsx` расширить текущий `LeadCardView`: сохранить
заголовок, дату и короткий фрагмент представителя, добавить ссылку на каждый
материал; неподтверждённую
атрибуцию обозначить понятным RU/EN текстом. `VERIFIED_PRIMARY` ставится первой
с явной подписью. Без verified primary использовать детерминированного
представителя; не менять сортировку всех сохранённых lead-строк.

**6. Аддитивно применить схему в безопасной среде.** Добавить отдельный
`docs/operations/lead-story-provenance-schema-apply.sql` для уже имеющейся схемы;
обновить `content-leads-schema-apply.sql` для чистой установки и список
`production-deploy.md`. Из текущего Prisma schema получить точный `migrate diff`,
отобрать только новую nullable колонку, валидировать selected SQL через
`validate-prisma-migration-sql.cjs` с `--allow-table ContentLead`. Проверить на
disposable PostgreSQL применением одной транзакцией через `psql`, повторным
пустым diff и реальными чтениями/записями. Production `db push` не использовать.

## Сквозная приёмка

Один маршрутный тест в `tests/content-lead-topic-subscription.guard.test.cjs`
проверяет discovery → grouped item → save → list/API response с полным набором
источников. Отдельный повтор добавляет новый URL к группе и подтверждает, что
отношения не дублируются, `status`/timestamps решения пользователя не сброшены;
соседняя организация не читает эти источники. `tests/content-lead-dismissal-guard.test.cjs`
остаётся регрессией существующего RSS/id-пути.

`tests/lead-topic-gateway.guard.test.cjs` подтверждает старый лимит страниц,
отсутствие дополнительного fetch, окна дат/свежести и парсинг только уже
прочитанного HTML. Новый `tests/lead-story-cluster.test.cjs` подтверждает
положительные и отрицательные реальные векторы и non-transitive guard.
`tests/content-leads.topic-card.test.cjs` проверяет, что все URL доступны
клавиатурой, каждая подпись имеет текстовое состояние проверки, язык UI
сохранён и один URL не выводится дважды. В компоненте использовать текущие
токены, оба theme states и существующие правила доступности из
`docs/design/component-inventory.md` / `component-authoring-rules.md`; новую
компоненту не добавлять.

DB smoke на одноразовой базе создаёт организации A/B, TOPIC subscription и
dismissed/accepted lead A, сохраняет source/citation набор, повторно записывает
тот же кластер и дополнительную ссылку. Проверить envelope round-trip,
каноническую идемпотентность, строгую схему/лимиты, неизменность полей решений,
fallback для старой строки с `sourceRefsJson = null` и отсутствие чтения записи A
через запрос организации B. Попытка сохранить невалидный envelope или любое
поле с foreign tenant/entity ID должна быть отклонена валидатором/контрактом.
После точечного apply повторный Prisma diff пуст для новой колонки; Mastra
таблицы не выбираются и не затрагиваются.

## Граница приёмки и восстановление

Локальные тесты/DB smoke подтверждают реализацию. Root отдельно принимает
реальные положительные и отрицательные story cases и source attribution. Для
Incrypted/Forkast заметки из датированного JSON сами по себе недостаточны:
до нового сохранённого proof UI и API обязаны сообщать «не подтверждён». Релиз,
production schema apply и live/provider query не входят в этот план и требуют
своих уже согласованных gate.

Обратимость: исходные строки `ContentLead`, статусы и `sourceUrl` не удалять;
новый `sourceRefsJson` только добавляется, schema DDL только additive. При ошибке отключить
новое отображение/сохранение через кодовый откат, оставив nullable колонку и
значения без деструктивной очистки до отдельного подтверждённого решения. Не добавлять новую
feature flag без существующего операторского контракта.

## Файлы с изменениями при исполнении

- Новые: `lead-story-cluster.ts`, `lead-source-attribution.ts`, миграционный SQL,
  минимизированные fixtures, `tests/lead-story-cluster.test.cjs`.
- Изменяемые: `lead-topic.gateway.ts`, `community-topic-discovery.service.ts`,
  `lead-feed.gateway.ts`, `content-lead.service.ts`, `content-lead.repository.ts`,
  `schema.prisma`, `content-leads.adapter.ts`, `content-leads.tab.tsx`, тесты
  lead gateway/repository/card, `content-leads-schema-apply.sql` и
  `production-deploy.md`.
- Не менять: WebResearchService query/provider logic, paid/cache/error contract,
  Temporal workflow/activity payloads, `AutoPost`, Product-level research query
  semantics (`fn33.132`), production database через `db push`.

## Уточнения принятой реализации 01.10.2026

- Root подтвердил abstention для архивной пары `/leads/11` и `/leads/12`:
  разные языки, проверенные даты 30.08 и 26.08. Без общего прямого evidence
  эта пара не обязательный положительный пример и не объединяется.
  Пары `/leads/4` + `/leads/5` и `/leads/13` + `/leads/14` проходят.
- Дополнительный консервативный барьер требует два общих стема заголовков
  вне темы. Одинаковая шаблонная выдержка разных статей не доказывает событие.
- Поле называется `sourceRefsJson`; хранится только строгий URL-only конверт.
  Заголовок, выдержка и дата остаются полями представителя карточки;
  отдельные копии текстов всех статей в JSON не сохраняются.
- Найденные URL при повторной проверке не обрезаются. Если объединение
  превысит 50 URL, запись отказывает и транзакция сохраняет предыдущие данные.
  Только ограниченные attribution evidence могут иметь `truncated: true`.
- Автоматический парсер никогда не создаёт `VERIFIED_PRIMARY`. Сохранённая
  ссылка, домен и заметка архивного проверяющего остаются неподтверждёнными.
- Сохранение работает в Serializable-транзакции с максимум двумя повторами
  `P2034`; пересечение нескольких старых строк — безопасный конфликт.
- Disposable DB/schema release proof и итоговую проверку исполняет root.

## Дополнение проверки root

- Для двух реальных CryptoRank `/news/feed/` в сохранённом корпусе проверить
  RU/EN пометку перепечатки без HTML, включая исторический `sourceUrl` fallback
  и датированного кандидата. Узкое распознавание точного домена/маршрута не
  выводит первичный URL и не меняет JSON-схему или attribution state.
- Для persistence проверить один `findMany` с проекцией четырёх identity/URL
  полей на попытку транзакции. Созданные/обновлённые строки поддерживаются
  в том же снимке; повтор Serializable читает новый. Исторические канонические
  варианты, пересечения, решения и tenant-фильтры сохраняются.
