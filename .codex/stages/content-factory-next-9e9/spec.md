# Спецификация стадии: контентный интеллект

## Результат

Организация получает версионируемый паспорт и голос бренда, единый реестр
разрешённых URL/RSS-источников и повторно используемую память фактов. Один
контекст с происхождением и свежестью используется генератором, редактором,
чат-агентом и AutoPost. Первый вертикальный путь заканчивается черновиком, а не
публикацией.

## Порядок и границы

1. До production-кода принимаются четыре исследования: донор, профиль/голос,
   источники, факты/память.
2. Только после синтеза решений и фиксации data/public contracts запускаются
   `.3`, `.5` и `.7` через focused RED→GREEN.
3. Донор `/home/me/code/content-factory` остаётся read-only. Код не копируется
   без доказанного авторства, лицензии, AGPL-совместимости и безопасности.
4. Public scraping, Telegram collection, live fetch, paid model calls,
   credentials, публикация и deploy выключены. Synthetic/local fixtures не
   становятся обещанием live-доступности.
5. Все записи принадлежат организации; права следуют существующей permission
   model. Удаление источника/профиля не оставляет скрытый активный контекст.
6. Текущая AI-модель `included/workspace_key` сохраняется без скрытого fallback;
   проектирование не разрешает новые платные вызовы.

## Исходные acceptance-сценарии

- Организация без профиля видит понятный fallback и может создать первый draft
  без выдуманного голоса.
- Выбранная версия голоса видна у результата и одинаково применяется в четырёх
  сценариях создания.
- Разрешённый URL/RSS показывает состояние, свежесть и происхождение; duplicate
  не создаёт второй источник, unsafe redirect закрыт до сети/сохранения.
- Факт имеет evidence, дату, freshness/conflict status и tenant boundary;
  удалённый или устаревший evidence не используется как подтверждённая истина.
- Недоступное исследование не порождает текущих утверждений без источника.
- Любой vertical path создаёт только draft и никогда не публикует live.

## Предварительный premortem

Verdict: **GO TO RESEARCH ONLY**. Реализация заблокирована до принятых specs.

| Риск | Ранний сигнал | Обязательная защита |
| --- | --- | --- |
| профиль становится user-scoped | одинаковая организация видит разные active versions | organization ownership + permission tests |
| URL bypass через redirect/DNS | private address появляется после validation | shared SSRF resolver at every hop + deterministic fixtures |
| память выдаёт устаревшее как факт | draft ссылается на expired/conflicted evidence | freshness/conflict states + fail-closed context builder |
| донор приносит чужой/опасный код | нет точного provenance/license row | keep/adapt/reject matrix before copy |
| четыре генератора расходятся | разные prompt fragments и metadata | one versioned context contract + consumer matrix |
| UX обещает live-функцию | fixture выглядит как успешный реальный fetch | explicit local/synthetic states and no network |

Откат исследований — удаление локальных stage docs. Будущий rollback реализации
обязан быть определён принятой миграцией до первой schema-мутации.

## Принятые решения синтеза

- Донорский исполняемый код, schema, prompts, fixtures и UI не переносятся:
  tracked license/ownership proof отсутствует. Реализация независимая.
- Один `ProjectBrandProfile` принадлежит организации. `ADMIN`/`SUPERADMIN`
  меняют и активируют, участники читают и применяют опубликованные версии.
  `DRAFT` изменяем с optimistic revision; `PUBLISHED` immutable; редактирование
  создаёт clone. Отсутствие active profile — видимый neutral fallback, а явно
  выбранная недоступная версия даёт `BRAND_PROFILE_VERSION_UNAVAILABLE` до AI
  admission. AutoPost закрепляет конкретный `brandProfileVersionId`.
- Реестр использует `ContentSource -> SourceSnapshot -> SourceEvidence ->
  DraftEvidence`. Search-result не создаёт source и не даёт права direct fetch.
  URL/RSS требуют явного admin action, подтверждённых прав и одного bounded
  HTTPS/443 gateway; public capability по умолчанию выключена. Telegram остаётся
  выключенным и не получает второго consumer.
- `ContentContextBuilderV1` детерминирован: ноль network/AI, не больше восьми
  фактов, восьми evidence и 12 000 символов. Он исключает чужие, disabled,
  deleted, stale и conflicted данные. Для current-required запроса отсутствие
  свежего evidence даёт `CONTENT_EVIDENCE_REQUIRED` до model call.
- Общая immutable provenance связь называется `contentContextSnapshotId`;
  exact resolved profile хранится как `brandProfileVersionId`. Оба id сервер
  повторно разрешает вместе с trusted `organizationId`; клиент не является
  authority. Legacy `Post.researchSources` остаётся совместимым dual-write полем
  до отдельного cutover.
- `ContentContextSnapshot` хранится, пока на него ссылается draft/Post, и ещё 90
  дней после удаления последней ссылки. Hard delete source немедленно исключает
  его из новых context, а исторический item превращается в `SOURCE_REMOVED`
  tombstone без URL/excerpt. Production purge SLA не обещается до runtime proof.

## Technical premortem: additive content-intelligence contract

**Verdict: GO WITH CONDITIONS.** Production-код разрешён только после принятия
четырёх research artifacts и наблюдаемого RED для каждой preflight-защиты ниже.
Rollback — флаги off + legacy read; additive tables остаются read-only, down
migration и `prisma db push` не используются.

### Blast radius

```text
profile/source commands
  -> org permissions + additive Prisma rows + outbound gateway
  -> immutable evidence + context builder
  -> generator/editor/Mastra agent/AutoPost V2
  -> Post provenance + retention/audit
```

| Симптом отказа | Evidence | Механизм / поверхность | Detection | Mitigation | Disposition / check |
| --- | --- | --- | --- | --- | --- |
| чужая версия или evidence попадает в draft | confirmed: legacy JSON не имеет FK | client id или lookup без org predicate | cross-org repository/controller RED | composite tenant relations + server resolver | block; data-contract stream |
| request достигает private/special address | confirmed gaps в текущих ranges/port/budgets | literal/DNS/rebinding/redirect | zero-connect fixtures, pinned-set assertion | dedicated per-hop resolve-all gateway, HTTPS/443 | block; source stream |
| worker зависает/OOM на body/XML/DOM | confirmed: consumers вызывают `.text()` без budgets | slow/decompression/entity/DOM amplification | timeout/byte/parser RED | streaming abort, MIME/decode/parser limits | block; source stream |
| stale/conflicted claim назван текущим | confirmed: сейчас prompt получает raw provider text | нет freshness/conflict gate | current-required fixture fails before model | deterministic builder + `CONTENT_EVIDENCE_REQUIRED` | block; context stream |
| смена active незаметно меняет AutoPost | plausible concrete | dynamic resolve вместо pin | configuration/run provenance mismatch | pin version, V2 draft-only adapter, persist resolved id | preflight; consumer stream |
| удалённый source остаётся в cache/context | plausible concrete | late job или stale snapshot | deletion + late-commit fixture | configVersion fence, active-only query, tombstone | block cutover |
| соседние webhook/provider fetch ломаются | plausible executor error | глобальная замена shared SSRF helper | existing SSRF suites + scoped diff | новый gateway; shared helper меняется только совместимо | preflight; source stream |
| AI квота списывается до invalid selection | plausible concrete | resolver расположен после admission | missing-version ledger fixture | resolve context before `AiUsageService` | block; consumer stream |
| partial migration ломает rollback | plausible concrete | destructive backfill/cutover | migrate-diff guard + legacy reconciliation | additive schema, disabled legacy shadows, dual write | block; root migration gate |
| executor меняет upstream Temporal contract | confirmed policy boundary | удобное добавление аргумента в V1 | exact workflow/activity diff | новый versioned AutoPost draft path | block; consumer review |

### Recovery и preflight

1. Trigger: tenant leak, unsafe connect, lost provenance, duplicate job,
   unexpected model/publish call или unbounded resource use.
2. Выключить `SOURCE_DIRECT_FETCH`, `SOURCE_PERIODIC_SYNC`,
   `SOURCE_TELEGRAM_INGEST` и общий consumer flag; queued work перечитывает flag
   и `configVersion` до commit.
3. Вернуть legacy read/AutoPost V1, оставить новые rows для расследования;
   V2 rules остановить, не переводить автоматически в publishing V1.
4. Исправить forward, повторить deterministic backfill/shadow reconciliation.

До первого implementation commit обязательны: accepted memory spec; RED на
tenant/version/deletion, SSRF/redirect/budgets/parser separation и fail-before-
admission; exact Prisma diff/rollback plan; direct network dependencies declared;
all network/model/publish capabilities off in defaults.
