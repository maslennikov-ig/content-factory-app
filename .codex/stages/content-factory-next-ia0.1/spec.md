# Спецификация ремонта независимого аудита ia0

## Результат

Локальная ветка `codex/remaining-epic-acceptance` исправляет подтверждённые
дефекты аудита принятой стадии `content-factory-next-ia0`. Принятая история
стадии остаётся неизменной; новые исправления, доказательства и честные
продолжения учитываются в `content-factory-next-ia0.1`.

## Инварианты

- Mastra DDL снимается из реальной исходной PostgreSQL database, а не из
  неполного `exportSchemas()` `@mastra/pg@1.8.5`; экспорт доказывает совпадение
  с 29 известными deployment tables до data-only copy.
- Browser error relay получает same-origin POST с реальным `Origin`; тест
  импортирует клиентский builder/options, а не подставляет заголовок вручную.
- Официальные platform marks не перерисовываются и не перекрашиваются. Тёмная
  тема получает нейтральную подложку контейнера; ledgers только уменьшаются.
- Stripe считает отсутствие organization/event actor терминальным после уже
  совершённой billing mutation, но продолжает бросать ошибки хранения.
- Restore возвращает database-level ACL, включая отсутствие PUBLIC CONNECT и
  межбазовую изоляцию runtime-ролей.
- Temporal-proxied JSON error распознаётся по `cause.type`; календарь показывает
  безопасное нормализованное сообщение, а не raw JSON.
- Owner-blocked задачи, `71m.7`, parent epics `71m c6k ry5` и epic `or3` не
  меняются. Production, secrets, paid calls, merge, push, PR и deploy запрещены.

## Документация и решения

- `@mastra/pg@1.8.5`: точный first-party commit
  `a78b4232ff84f51ee60cc102f0799ee726f7f100`; `ALL_DOMAINS` экспортирует 9
  классов, а store регистрирует 14. Источник: Mastra GitHub `stores/pg/src`.
- Fetch Standard: для non-CORS метода, отличного от GET/HEAD,
  `referrerPolicy: no-referrer` сериализует `Origin` как `null`. Same-origin
  запрос не раскрывает path через Origin, поэтому опция удаляется.
- UI следует `DESIGN.md`, ADR-0008 и
  `docs/design/component-authoring-rules.md`; направление не меняется.

## Technical premortem

**Вердикт: GO WITH CONDITIONS.** Код и документация обратимы; никакие data,
ACL или deployment шаги здесь не применяются.

| Симптом | Evidence | Механизм | Detection / условие |
|---|---|---|---|
| Mastra copy откатывается | confirmed | schema dump не содержит часть 29 таблиц | disposable Postgres proof сравнивает точный set до copy |
| Runtime снова получает доступ к чужим БД | confirmed | createdb возвращает PUBLIC CONNECT | restore test проверяет database ACL matrix |
| Relay остаётся мёртвым | confirmed | браузер посылает `Origin: null` | тест строит request из client module |
| Stripe webhook ретраится после commit | confirmed | отсутствие actor/org превращается в HTTP 500 | terminal-case tests; storage failure остаётся error |
| Ошибка публикации раскрывает raw JSON | confirmed | classifier живёт в `cause.type` | serialised fixture и calendar rendering test |
| UI-знак снова теряется в dark theme | confirmed | `<img>` не наследует `currentColor` | dark channel-picker screenshot и contrast/design guards |
| Исполнитель меняет соседний поток | plausible | общая acceptance-ветка | строгие write zones, stop при overlap, root diff review |

Recovery: откат отдельных файлов/коммитов в локальной ветке; operator-run
миграции и восстановление не выполняются. Любая потребность в production,
секрете или hard-to-reverse действии останавливает соответствующий поток.
