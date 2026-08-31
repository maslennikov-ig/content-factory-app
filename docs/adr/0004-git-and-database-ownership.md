# ADR-0004: Разделить владение Git и runtime database

**Статус:** Accepted
**Дата:** 2026-08-11

## Контекст

Прежний Content Factory использует Git-first artifacts. Postiz хранит продуктовый runtime state в PostgreSQL. Новый продукт должен быть удобен пользователю и одновременно сохранять воспроизводимые публично безопасные контракты.

## Решение

Git владеет:

- кодом, schema/migrations и configuration examples;
- ADR, документацией и реализационными планами;
- versioned prompts/policies/templates, если они не содержат клиентских данных;
- обезличенными test fixtures и export schemas.

PostgreSQL владеет:

- организациями, пользователями, подключениями и tokens;
- проектами, sources, briefs, generated variants, reviews и approvals;
- публикациями, media metadata, analytics и audit trail;
- любой изменяемой пользовательской информацией.

Beads владеет task/status truth, а `.codex/handoff.md` — только текущим оперативным состоянием.

## Последствия

- Git не является runtime database и не должен получать private client artifacts.
- Нужны явные export/import contracts для переносимости.
- Изменение versioned prompt может ссылаться на prompt version в runtime record.
- Backup продукта требует БД и media storage, а не только repository clone.

## Альтернативы

- Хранить каждый пользовательский артефакт в Git: усложняет tenancy, секреты и web UX.
- Хранить все, включая policies и решения, только в БД: теряется reviewable и воспроизводимая инженерная история.
