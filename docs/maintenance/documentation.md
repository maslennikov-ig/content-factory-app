# Сопровождение документации

**Статус:** `runbook`
**Проверено:** 2026-08-11

## Правило изменения

Документация обновляется в том же изменении, которое меняет описываемый контракт. Отдельная будущая задача не считается заменой.

Обязательно проверить docs при изменении:

- module boundary, route или dependency direction;
- Prisma model/relation/enum;
- auth, tenancy, role или public API;
- provider identifier/interface;
- Temporal workflow/activity contract;
- обязательной или опасной env variable;
- local setup, build, test, deployment shape;
- product scope или принятого архитектурного решения.

## Структура

- `docs/product` — current capabilities, target и миграция;
- `docs/architecture` — компоненты, потоки, данные и границы;
- `docs/development` — запуск и карта изменений;
- `docs/operations` — конфигурация и runtime runbooks;
- `docs/adr` — принятые долговечные решения;
- `docs/maintenance` — правила актуальности;
- `docs/superpowers/plans` — decision-complete implementation plans, не продуктовая справка.

Новый документ должен быть добавлен в [главный индекс](../README.md) или быть прямой дочерней ссылкой индексированного документа.

## Current и target

Следуйте [ADR-0002](../adr/0002-separate-current-and-target-state.md):

- `current` содержит ссылку на code/schema/config evidence;
- `target` использует будущую формулировку и явно говорит, что еще не реализовано;
- после реализации статус и ссылки меняются вместе с кодом;
- дата `Проверено` означает проверку против текущего репозитория, а не литературную редактуру.

## Проверка ссылок

```bash
nvm use
pnpm run docs:check
```

Checker обходит Markdown в `docs/` и `.codex/project-index.md`, проверяет относительные file links и anchors. Внешние URL он не проверяет, потому что их доступность и версии являются отдельной внешней границей.

## Локальный граф зависимостей

Graphify настроен как локальный code-only index:

```bash
graphify check-update .
graphify update .
graphify cluster-only . --no-viz --no-label
graphify query "PostsController PostsService PostActivity IntegrationManager"
graphify explain PostsService
graphify path PostsService PostActivity
```

Ограничения:

- `graphify-out/` игнорируется Git и не коммитится;
- внешние model/API extraction и semantic backends запрещены без явного разрешения;
- Graphify git hooks не устанавливаются;
- Codex PreToolUse hook из `.codex/hooks.json` начинает действовать только после ручной проверки и доверия пользователем через `/hooks`;
- перед широким поиском по незнакомой архитектуре используйте report/focused query;
- после code/docs/architecture changes обновите граф на границе closeout;
- report должен соответствовать принятому `HEAD`.

Граф помогает найти зависимости, но точный контракт подтверждается исходником.

## ADR

Порядок и шаблон находятся в [ADR index](../adr/README.md). Proposed decision не превращается в Accepted без фактически принятого выбора. [ADR-0005](../adr/0005-release-content-factory-next-under-agpl.md) фиксирует открытую AGPL-модель; перед переносом донорской реализации остается обязательной проверка владения и совместимости сторонних лицензий.

## Проверка свежести при closeout

1. Открыть docs index и пройти новые/измененные links.
2. Запустить `pnpm run docs:check`.
3. Сопоставить утверждения current-state с source links.
4. Обновить Graphify и выполнить focused query затронутой границы.
5. Запустить `git diff --check` и process verification.
6. Зафиксировать в stage summary `docs-reviewed` и `graph-reviewed`.
