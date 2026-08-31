# Content Factory

Content Factory — открытый рабочий продукт для полного цикла контента: от планирования и создания до согласования, календаря и публикации в нескольких каналах.

Проект развивается на основе [Postiz](https://github.com/gitroomhq/postiz-app) `v2.22.1` и распространяется под AGPL-3.0. История происхождения, copyright и лицензия Postiz сохранены; пользовательский бренд и интерфейс развиваются самостоятельно.

## Текущее состояние

- Рабочая техническая основа: организации и роли, редактор, медиатека, календарь, integrations, планирование, публикация и analytics.
- Принятое имя продукта — `Content Factory`, без суффикса `Next`.
- Пользовательский интерфейс переведён на собственный бренд и редакционный дизайн-язык: семантические light/dark токены, подписанная боковая навигация 248px, собственные wordmark и знак `CF`, единые состояния и видимый focus.
- Внутренний import namespace переведён на `@contentfactory/*`; legacy env keys и Prisma/Temporal/provider contracts сохранены намеренно; см. [ADR-0006](docs/adr/0006-content-factory-brand-and-design-language.md).
- Перенос project knowledge, sources, author voice, generation orchestration, editorial QA и release gates из прежнего Content Factory выполняется отдельными проверяемыми этапами.

## Документация

- [Главный индекс](docs/README.md)
- [Продуктовый контекст](PRODUCT.md)
- [Визуальная система](DESIGN.md)
- [Спецификация интерфейса](docs/design/content-factory-interface-specification.md)
- [План реализации](docs/superpowers/plans/2026-08-11-content-factory-brand-redesign.md)
- [Промт для Opus 5](docs/prompts/opus-5-content-factory-brand-redesign.md)
- [Локальный запуск](docs/development/local-development.md)
- [Архитектура](docs/architecture/system-overview.md)

## Локальная разработка

Используйте Node и pnpm, закреплённые репозиторием:

```bash
nvm use
pnpm install --frozen-lockfile
pnpm run dev
```

Подробная конфигурация и Docker-сценарии описаны в [руководстве по локальной разработке](docs/development/local-development.md).

## Проверки

```bash
pnpm run build
pnpm test
git diff --check
scripts/orchestration/run_process_verification.sh
```

Проверка границы бренда выполняется отдельно и объясняет каждое найденное
упоминание вместо требования нулевого числа совпадений:

```bash
node scripts/branding/brand-scan.cjs
```

## Лицензия и происхождение

Content Factory и использованная основа Postiz распространяются по [GNU AGPL-3.0](LICENSE). При внешнем сетевом использовании модифицированной версии пользователям должен быть доступен полный соответствующий исходный код этой версии. Подробнее: [ADR-0005](docs/adr/0005-release-content-factory-next-under-agpl.md).

Postiz — самостоятельный upstream-проект и товарный знак его владельцев. Content Factory не заявляет аффилированность с hosted-сервисом Postiz.
