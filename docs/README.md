# Документация Content Factory

Эта папка — основной вход в устройство продукта. Документы разделяют:

- **текущее состояние** — кодовая база Postiz `v2.22.1`, уже находящаяся в репозитории;
- **целевое состояние** — Content Factory, которое развивается поверх этой основы;
- **переход** — контролируемая миграция ценного из прежнего Content Factory без копирования кода до решения по лицензированию.

Если документ расходится с исполняемым кодом, верен код. Несоответствие нужно исправить в том же изменении.

## С чего начать

Контракт основного сценария: [чат, артефакты и ручные разделы](product/chat-first-workspace-spec.md),
[план реализации](superpowers/plans/2026-10-16-chat-first-workspace.md),
[интерактивный макет](design/chat-first-workspace/prototype.html). Текущая поставка и подтверждённые ограничения зафиксированы в `.codex/handoff.md` рабочего репозитория.

Переход помощника на нативный Mastra harness: [возможности, интеграция, замена кода и локальная приёмка](superpowers/plans/2026-10-19-native-mastra-harness.md), эпик `content-factory-next-on0i`. План включает обновление стабильной связки Mastra, автоматические ретраи и настраиваемые резервные модели; исполнитель нового чата — Gemini Argon. Подготовка завершена, реализация выполняется локально без деплоя.

| Задача                                                 | Документ                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Понять продукт и границы                               | [Область продукта](product/product-scope.md)                                                   |
| Понять Cloud-first SaaS-модель и границы роста         | [Спецификация Cloud SaaS](product/cloud-saas-growth-spec.md)                                   |
| Настроить паспорт проекта и версионируемый голос       | [Паспорт проекта и голос бренда](product/content-intelligence-brand-profile-spec.md)           |
| Понять безопасный реестр ручных, URL- и RSS-источников | [Единый реестр источников](product/content-source-registry-spec.md)                            |
| Понять факты, доказательства и единый контекст         | [Память фактов и единый контекст](product/content-memory-spec.md)                              |
| Понять аудиторию и принципы продукта                   | [PRODUCT.md](../PRODUCT.md)                                                                    |
| Разобрать волну второго живого прогона 08.09.2026     | [Спецификация волны второго захода](product/second-walk-wave-2026-09-08-spec.md)                |
| Увидеть всё, на что может повлиять тариф               | [Карта тарифных рычагов](product/tariff-levers.md)                                             |
| Использовать визуальную систему                        | [DESIGN.md](../DESIGN.md)                                                                      |
| Реализовать бренд и интерфейс                          | [Спецификация интерфейса](design/content-factory-interface-specification.md)                   |
| Увидеть систему целиком                                | [Обзор архитектуры](architecture/system-overview.md)                                           |
| Проследить путь контента до публикации                 | [Жизненный цикл контента](architecture/content-lifecycle.md)                                   |
| Понять данные и владение                               | [Модель данных](architecture/data-model.md)                                                    |
| Найти интеграции и механизм публикации                 | [Интеграции и публикация](architecture/integrations-and-publishing.md)                         |
| Разобраться с входом, организациями и правами          | [Авторизация и мультитенантность](architecture/auth-and-tenancy.md)                            |
| Запустить проект локально                              | [Локальная разработка](development/local-development.md)                                       |
| Понять, где вносить изменение                          | [Карта изменений](development/change-guide.md)                                                 |
| Проверить реализацию поискового primary/fallback       | [Отчёт Tavily/OpenRouter](development/web-search-provider-implementation-report-2026-08-14.md) |
| Настроить окружение                                    | [Конфигурация](operations/configuration.md)                                                    |
| Подготовить собственный сбор ошибок                    | [Сбор ошибок](operations/error-collection.md)                                                  |
| Очистить legacy-ошибки старше 90 дней                  | [Retention legacy Errors](operations/legacy-errors-retention.md)                               |
| Включить вход через Telegram вручную                   | [Подготовка входа через Telegram](operations/telegram-login-setup.md)                          |
| Развернуть или обновить продукт на сервере             | [Развёртывание на сервере](operations/production-deploy.md)                                    |
| Ограничить старые образы и сохранить запас места        | [Артефакты общего хоста](operations/shared-host-artifacts.md)                                  |
| Проверить исправления зависимостей перед выкладкой     | [Аудит и совместимость зависимостей](operations/dependency-security-remediation.md)            |
| Проверить backup product, Mastra и Temporal            | [Резервное копирование PostgreSQL](operations/postgres-backup.md)                              |
| Подключить собственную рассылку                        | [Listmonk и согласие на рассылку](operations/newsletter.md)                                    |
| Узнать, что продукт отправляет наружу                  | [Что уходит наружу](operations/outbound-connections.md)                                        |
| Создать таблицу продуктовых событий на боевой базе     | [Таблица продуктовых событий](operations/product-events-schema.md)                             |
| Понять процессы и сбои                                 | [Эксплуатация](operations/runtime.md)                                                          |
| Отключить уже запланированные автоматизации             | [Проверка перед выполнением](operations/automation-disablement.md)                              |
| Понять сроки отложенных действий V107/V108              | [Расчёт сроков автоматизаций](operations/automation-deadlines.md)                               |
| Проверить идентификатор публикации и доставку webhook   | [Webhook V108](operations/publication-webhooks-v108.md)                                         |
| Проверить подтверждение отправленного события Nostr    | [Nostr: ID и ответ relay](operations/nostr-publication.md)                                     |
| Проверить частичные ошибки обновления токенов           | [Обновление каналов по отдельности](operations/token-refresh.md)                              |
| Ограничить историю периодических процессов             | [Новые запуски с сохранением состояния](operations/periodic-workflow-history.md)                |
| Проверить готовность управляемого SaaS                 | [SaaS readiness](operations/saas-readiness.md)                                                 |
| Спланировать перенос из прежнего продукта              | [Карта миграции](product/migration-map.md)                                                     |
| Запустить конвейер для Telegram-канала                 | [Телеграм-конвейер](product/telegram-pipeline-mvp.md)                                          |
| Понять принятые архитектурные решения                  | [ADR](adr/README.md)                                                                           |
| Передать полный редизайн Opus 5                        | [Готовый промт](prompts/opus-5-content-factory-brand-redesign.md)                              |
| Выбрать поисковый бэкенд для генератора                | [Промт для deep research](prompts/deep-research-search-backend.md)                             |
| Передать эпик Telegram-конвейера и поиска исполнителю  | [Промт для GPT-5.6](prompts/gpt-5.6-telegram-pipeline-and-search.md)                           |
| Обновлять документацию и граф                          | [Сопровождение документации](maintenance/documentation.md)                                     |
| Расшифровать термины                                   | [Глоссарий](glossary.md)                                                                       |

## Статус документов

- `current` описывает существующий код и подтверждается ссылками на исходники;
- `target` описывает желаемое направление, но не обещает реализованную функцию;
- `decision` фиксирует принятое архитектурное решение;
- `runbook` содержит воспроизводимую процедуру.

В каждом тематическом документе явно указаны его статус и дата последней проверки.

## Источники истины

1. Код, Prisma-схема и конфигурация — текущее поведение.
2. [AGENTS.md](../AGENTS.md) — границы разработки, лицензирования и безопасности.
3. [ADR](adr/README.md) — долговечные архитектурные решения.
4. Beads — задачи и их статус.
5. [Текущий handoff](../.codex/handoff.md) — оперативное состояние активного этапа.
6. Документация — навигация и объяснение перечисленных источников.

## Быстрая проверка

```bash
nvm use
pnpm run docs:check
```

Проверка находит отсутствующие локальные файлы и неверные якоря в Markdown-ссылках. Полный набор проверок указан в [локальной разработке](development/local-development.md#проверки).
