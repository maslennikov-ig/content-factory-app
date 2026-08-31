# Отчёт о реализации Tavily primary / OpenRouter fallback

- **Статус:** implementation report
- **Дата:** 2026-08-14
- **Ветка:** `codex/search-provider-openrouter`
- **Коммиты реализации:** `1a1f4ebf`, `f55e8f47`
- **Правки по ревью:** в рабочем дереве, без нового commit
- **Beads:** `content-factory-next-yqh` — закрыта
- **Авторитетная спецификация:** `docs/prompts/search-provider-port-spec.md`

## Результат

Tavily настроен как основной поисковый бэкенд. OpenRouter web plugin работает
как автоматический запасной путь только после допустимого отказа Tavily и только
для организации, чей модельный провайдер уже `openrouter`.

Основной путь включает `include_raw_content: true`, сохранённую глубину поиска с
`advanced` по умолчанию для новых организаций, классификацию локальности и
свежести, а также ограничение текста до его передачи в промпты. Провайдер ответа
возвращается структурно и пишется в лог; визуальная метка источника оставлена
отдельной задачей.

Ветка не была запушена, слита в `main` или развёрнута. Реальный ключ не
подключался, вызовы поисковых поставщиков и Russian-recall pilot не выполнялись.

## Изменения по файлам

- `.codex/handoff.md` — записаны решение, приёмка, ограничения и статус ветки.
- `.codex/project-index.md` — зафиксировано решение Tavily primary / OpenRouter fallback.
- `apps/frontend/src/components/settings/ai-provider.component.tsx` — Tavily показан основным, восстановлен контрол глубины, а доступность fallback берётся из ответа бэкенда; сохранение заблокировано до загрузки настроек.
- `libraries/nestjs-libraries/src/chat/tools/web.research.tool.ts` — в ответ инструмента добавлен провайдер результата и источников.
- `libraries/nestjs-libraries/src/dtos/posts/create.post.dto.ts` — источник публикации принимает `tavily | openrouter`.
- `libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts` — основной `searchProvider` строго ограничен значением `tavily`.
- `libraries/nestjs-libraries/src/openai/ai.clients.ts` — добавлены Tavily raw-content adapter, OpenRouter plugin, изоляция ключей, advanced/news/country и лимиты времени/текста.
- `libraries/nestjs-libraries/src/openai/ai.provider.config.ts` — добавлен новый union и default `advanced`.
- `libraries/nestjs-libraries/src/openai/ai.provider.service.ts` — настройки сообщают, доступен ли fallback; новая запись получает `advanced`, частичное сохранение не трогает существующую глубину.
- `libraries/nestjs-libraries/src/openai/web.research.service.ts` — добавлены failure-only fallback, два дедлайна, классификация freshness/country, обрезка, логирование и provenance.
- `libraries/react-shared-libraries/src/translation/locales/ar/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/bn/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/de/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/en/translation.json` — добавлен английский текст новых состояний.
- `libraries/react-shared-libraries/src/translation/locales/es/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/fr/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/he/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/it/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/ja/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/ka_ge/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/ko/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/pt/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/ru/translation.json` — добавлен русский текст новых состояний.
- `libraries/react-shared-libraries/src/translation/locales/tr/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/vi/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/react-shared-libraries/src/translation/locales/zh/translation.json` — зарегистрированы строки режима Tavily и состояния fallback.
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — глубина новых записей по умолчанию изменена на `advanced`.
- `tests/ai.clients.test.cjs` — покрыты обе реализации, явные status/code, сохранённая глубина, base URL и пустая выдача SDK.
- `tests/ai.provider.component.test.cjs` — JSX действительно рендерится; покрыты сохранённый `basic`, payload, backend-состояние fallback и блокировка Save до загрузки SWR.
- `tests/ai.search.config.test.cjs` — покрыты строгий DTO, настройки, дефолт глубины и доступность fallback.
- `tests/web.research.service.test.cjs` — покрыты 402/403/429/5xx, неизвестный статус, оба вида таймаута, ошибка обоих путей, deadline фабрики, OpenAI boundary, логи и обрезка.

## Контракт OpenRouter

Маппинг построен по официальной странице
[Web Search — Real-time Web Grounding for AI Models](https://openrouter.ai/docs/guides/features/plugins/web-search),
проверенной 2026-08-14.

Из неё взяты:

- `plugins: [{ id: 'web', engine: 'parallel', mode: 'advanced', max_results: 5 }]`;
- ответ через `message.content`;
- источники через `message.annotations[].url_citation`;
- `url`, `title` и доступный при наличии `content`.

Документированная форма позволяет выполнить фиксированный потребительский
контракт. Поле `content` у цитаты может отсутствовать, поэтому запасной результат
несёт OpenRouter в структурном поле `provider` и не маскируется под полный Tavily
raw content.

## Настройка Tavily

- `includeRawContent: true`, что SDK передаёт как `include_raw_content: true`.
- `searchDepth` берётся из сохранённой настройки; для новых организаций дефолт —
  `advanced`, сохранённый экономный `basic` не перезаписывается.
- Максимум пять источников.
- Для свежих запросов: `topic: 'news'`, `timeRange: 'week'`.
- Для локальной русской классификации и общего поиска: `country: 'russia'`.
- Для `topic: 'news'` country не передаётся, поскольку Tavily документирует
  country boost только для general.

## Условия fallback

OpenRouter вызывается только после:

- HTTP 429;
- исчерпанной квоты 402/403;
- HTTP 5xx;
- внутреннего дедлайна сервиса или транспортного timeout;
- пустой выдачи Tavily, включая форму LangChain
  `{ error: "No search results found…" }`.

HTTP-статус берётся только из явных полей `status` или числового `code`;
транспортный timeout — только из явного `code`. Числа и слова о quota/timeout в
произвольном сообщении сами по себе fallback не запускают.

Fallback не вызывается:

- если поиск выключен;
- если отсутствует Tavily key;
- если модельный провайдер организации — OpenAI;
- после 4xx, не входящего в разрешённый список;
- из-за оценки качества непустого результата.

## Потолки текста и времени

- На один источник: `8 000` знаков.
- На совокупный текст фактов: `32 000` знаков. Summary, title и URL источников
  не входят в этот потолок.
- Основной дедлайн: `12 000` мс.
- Запасной дедлайн: `8 000` мс.
- Общий бюджет одной цепочки: прежние `20 000` мс.

При измеренных 15–48 тысячах знаков на источник это сохраняет несколько
содержательных абзацев, но ограничивает два запроса 32 тысячами текста фактов
вместо потенциальных 250 тысяч. При наличии разделителя в пределах потолка текст
режется по последнему целому абзацу; если первый разделитель находится дальше,
применяется жёсткий символьный срез и источник сохраняется.

Дедлайн не передаётся в `RunnableConfig`: LangChain/Tavily не гарантирует, что
он будет применён к фактическому fetch. Ограничение остаётся в
`WebResearchService`, где фабрика клиента и сам вызов делят один соответствующий
дедлайн.

## Видимость провайдера

- Верхний результат содержит `provider: 'tavily' | 'openrouter' | 'mixed'`.
- Каждый источник содержит `provider: 'tavily' | 'openrouter'`.
- Успешный провайдер и причина fallback пишутся в Nest logger.
- `title` содержит только название источника; метка провайдера в интерфейсе
  намеренно оставлена отдельной задачей.

## Что намеренно не сделано

- Не выполнялись реальные вызовы Tavily или OpenRouter.
- Не запускался Russian-recall pilot.
- Не добавлялся ключ из окружения.
- Не использовались raw SQL или Prisma migration.
- Не менялись Temporal и social-provider контракты.
- Не изменялись `apps/frontend/src/components/launches/**` и `new-launch/**`.
- Не добавлялась визуальная метка провайдера источника.
- Не использовался bare `:online` suffix.
- Требуемый plugin не заменялся новым OpenRouter server tool.
- Ветка не пушилась, не сливалась в `main` и не развёртывалась.
- Реальный ключ не подключался.

## Предположения

1. Freshness означает явные latest/current/recent/breaking запросы
   классификатора либо операторский `topic=news`; применяется окно `week`.
2. `country=russia` выводится только из сочетания `scope=local` и русского
   `subjectLanguage`. Английский язык не определяет страну и остаётся без boost.
3. Если границы абзаца нет внутри текущего потолка, применяется жёсткий
   символьный срез; более поздний разделитель не выбрасывает источник.
4. Сохранённое историческое поле `searchProvider` не выбирает основной путь:
   исследовательский сервис всегда начинает с Tavily, API принимает только
   `tavily`.

## Проверка

Все обязательные команды выполнялись с Node `22.23.2` и pnpm `10.6.1`.

### `pnpm run build`

Код завершения: `0`.

Примечание от 2026-08-14: package-name prefixes в сохранённом выводе ниже
нормализованы после миграции `content-factory-next-wcx.1`; остальные строки
остаются исходным доказательством того запуска.

```text
> content-factory@1.0.0 build /home/me/code/content-factory-next
> pnpm -r --workspace-concurrency=1 --filter ./apps/frontend --filter ./apps/backend --filter ./apps/orchestrator run build

Scope: 3 of 7 workspace projects

> content-factory-frontend@1.0.0 build /home/me/code/content-factory-next/apps/frontend
> next build

▲ Next.js 16.2.6 (Turbopack)
- Experiments (use with caution):
  · clientTraceMetadata
  · proxyTimeout: 90000

  Creating an optimized production build ...
✓ Compiled successfully in 18.4s
  Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 647ms
  Running TypeScript ...
  Finished TypeScript in 5.5s ...
  Collecting page data using 23 workers ...
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
🌐 i18next is maintained with support from Locize — consider powering your project with managed localization (AI, CDN, integrations): https://locize.com 💙
  Generating static pages using 23 workers (0/3) ...
✓ Generating static pages using 23 workers (3/3) in 159ms
  Finalizing page optimization ...

Route (app)
┌ ○ /_not-found
├ ƒ /admin/errors
├ ƒ /admin/stats
├ ƒ /agents
├ ƒ /agents/[id]
├ ƒ /analytics
├ ƒ /api/uploads/[[...path]]
├ ƒ /auth
├ ƒ /auth/activate
├ ƒ /auth/activate/[code]
├ ƒ /auth/forgot
├ ƒ /auth/forgot/[token]
├ ƒ /auth/login
├ ƒ /auth/login-required
├ ƒ /billing
├ ƒ /billing/lifetime
├ ƒ /err
├ ƒ /integrations/social/[provider]
├ ƒ /launches
├ ○ /manifest.webmanifest
├ ƒ /media
├ ƒ /modal/[style]/[platform]
├ ƒ /oauth/authorize
├ ƒ /p/[id]
├ ƒ /plugs
├ ƒ /provider/[p]
├ ƒ /provider/add
├ ƒ /settings
└ ƒ /third-party


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


> content-factory-backend@1.0.0 build /home/me/code/content-factory-next/apps/backend
> cross-env NODE_ENV=production nest build


> content-factory-orchestrator@1.0.0 build /home/me/code/content-factory-next/apps/orchestrator
> cross-env NODE_ENV=production nest build
```

### `pnpm test` — первичная приёмка до правок ревью

Код завершения: `0`.

```text
> content-factory@1.0.0 test /home/me/code/content-factory-next
> jest --coverage --detectOpenHandles --reporters=default --reporters=jest-junit && python3 -m unittest tests/test_orchestration_closeout.py tests/test_docs_links.py

PASS tests/autopost.research-enrichment.test.cjs
PASS tests/telegram.connect.security.test.cjs
PASS tests/branding.test.cjs
PASS tests/i18n.ui-literals.test.cjs
PASS tests/telegram.post.statistics.test.cjs
PASS tests/autopost.generation.test.cjs
PASS tests/design.contrast.test.cjs
PASS tests/foundation.test.cjs
PASS tests/backend.cors.test.cjs
PASS tests/language.negotiation.test.cjs
PASS tests/ai.search.config.test.cjs
PASS tests/design.guard.test.cjs
PASS tests/production.analytics.test.cjs
PASS tests/agent.language.prompt.test.cjs
PASS tests/content.language.test.cjs
PASS tests/web.research.service.test.cjs
PASS tests/post.research.sources.test.cjs
PASS tests/web.research.degradation.test.cjs
PASS tests/telegram.update.consumer.test.cjs
PASS tests/integration.content.language.test.cjs
PASS tests/chat.language.prompt.test.cjs
PASS tests/copilot.controller.test.cjs
PASS tests/ai.clients.test.cjs
[Nest] 83214  - 08/14/2026, 1:35:54 PM    WARN No language model provider configured, chat functionality will not work
[Nest] 83214  - 08/14/2026, 1:35:54 PM    WARN No language model provider configured, chat functionality will not work
PASS tests/integration.analytics.snapshot.test.cjs
PASS tests/ai.provider.component.test.cjs
PASS tests/telegram.release.url.test.cjs
  ● Console

    console.log
      Text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

    console.log
      Text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

    console.log
      Text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

    console.log
      Caption text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

PASS tests/statistics.empty.state.test.cjs
PASS tests/web.research.tool.test.cjs
PASS tests/orchestrator.autopost-activity.test.cjs
PASS tests/telegram.updates.test.cjs
PASS tests/autopost.language-default.test.cjs
----------------------|---------|----------|---------|---------|-------------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|-------------------------
All files             |   81.35 |    77.35 |   85.71 |   82.85 |
 apps/frontend        |   22.22 |      100 |       0 |   22.22 |
  tailwind.config.cjs |   22.22 |      100 |       0 |   22.22 | 199-343
 scripts/branding     |   86.23 |    77.35 |     100 |   88.54 |
  brand-scan.cjs      |   86.23 |    77.35 |     100 |   88.54 | 211,300,320,334,366-382
----------------------|---------|----------|---------|---------|-------------------------

Test Suites: 31 passed, 31 total
Tests:       195 passed, 195 total
Snapshots:   0 total
Time:        4.755 s
Ran all test suites.
....
----------------------------------------------------------------------
Ran 4 tests in 0.536s

OK
```

### `pnpm test` после правок ревью

Код завершения: `0`.

```text
> content-factory@1.0.0 test /home/me/code/content-factory-next
> jest --coverage --detectOpenHandles --reporters=default --reporters=jest-junit && python3 -m unittest tests/test_orchestration_closeout.py tests/test_docs_links.py

PASS tests/autopost.research-enrichment.test.cjs
PASS tests/ai.search.config.test.cjs
PASS tests/design.contrast.test.cjs
PASS tests/language.negotiation.test.cjs
PASS tests/telegram.post.statistics.test.cjs
PASS tests/branding.test.cjs
PASS tests/production.analytics.test.cjs
PASS tests/post.research.sources.test.cjs
PASS tests/agent.language.prompt.test.cjs
PASS tests/foundation.test.cjs
PASS tests/telegram.connect.security.test.cjs
PASS tests/content.language.test.cjs
PASS tests/autopost.generation.test.cjs
PASS tests/backend.cors.test.cjs
PASS tests/telegram.update.consumer.test.cjs
PASS tests/design.guard.test.cjs
PASS tests/i18n.ui-literals.test.cjs
PASS tests/telegram.release.url.test.cjs
  ● Console

    console.log
      Text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

    console.log
      Text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

    console.log
      Text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

    console.log
      Caption text

      at TelegramProvider.sendMessage (eval at loadTypeScriptModule (tests/telegram.release.url.test.cjs:22:3), <anonymous>:194:17)

PASS tests/chat.language.prompt.test.cjs
PASS tests/integration.content.language.test.cjs
PASS tests/copilot.controller.test.cjs
PASS tests/web.research.degradation.test.cjs
[Nest] 43693  - 08/14/2026, 4:19:02 PM    WARN No language model provider configured, chat functionality will not work
[Nest] 43693  - 08/14/2026, 4:19:02 PM    WARN No language model provider configured, chat functionality will not work
PASS tests/integration.analytics.snapshot.test.cjs
PASS tests/web.research.tool.test.cjs
PASS tests/telegram.updates.test.cjs
PASS tests/autopost.language-default.test.cjs
PASS tests/ai.provider.component.test.cjs
PASS tests/web.research.service.test.cjs
PASS tests/statistics.empty.state.test.cjs
PASS tests/ai.clients.test.cjs
PASS tests/orchestrator.autopost-activity.test.cjs
----------------------|---------|----------|---------|---------|-------------------------
File                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------|---------|----------|---------|---------|-------------------------
All files             |   81.35 |    77.35 |   85.71 |   82.85 |
 apps/frontend        |   22.22 |      100 |       0 |   22.22 |
  tailwind.config.cjs |   22.22 |      100 |       0 |   22.22 | 199-343
 scripts/branding     |   86.23 |    77.35 |     100 |   88.54 |
  brand-scan.cjs      |   86.23 |    77.35 |     100 |   88.54 | 211,300,320,334,366-382
----------------------|---------|----------|---------|---------|-------------------------

Test Suites: 31 passed, 31 total
Tests:       206 passed, 206 total
Snapshots:   0 total
Time:        4.709 s
Ran all test suites.
....
----------------------------------------------------------------------
Ran 4 tests in 0.536s

OK
```

### `node scripts/branding/brand-scan.cjs`

Код завершения: `0`.

```text
0 unexplained reference(s); 2202 allowlisted reference(s).
```

### `scripts/orchestration/run_process_verification.sh`

Код завершения: `0`.

```text
orchestration contract OK (balanced-v2.19 via orchestration-setup)
git diff --check OK
git status --short
 M .codex/handoff.md
 M .codex/orchestrator.toml
 M apps/frontend/src/components/settings/ai-provider.component.tsx
 M docs/development/web-search-provider-implementation-report-2026-08-14.md
 M docs/prompts/gpt-5.6-search-provider-port.md
 M docs/prompts/search-provider-port-spec.md
 M libraries/nestjs-libraries/src/database/prisma/schema.prisma
 M libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts
 M libraries/nestjs-libraries/src/openai/ai.clients.ts
 M libraries/nestjs-libraries/src/openai/ai.provider.service.ts
 M libraries/nestjs-libraries/src/openai/web.research.service.ts
 M libraries/react-shared-libraries/src/translation/locales/ar/translation.json
 M libraries/react-shared-libraries/src/translation/locales/bn/translation.json
 M libraries/react-shared-libraries/src/translation/locales/de/translation.json
 M libraries/react-shared-libraries/src/translation/locales/en/translation.json
 M libraries/react-shared-libraries/src/translation/locales/es/translation.json
 M libraries/react-shared-libraries/src/translation/locales/fr/translation.json
 M libraries/react-shared-libraries/src/translation/locales/he/translation.json
 M libraries/react-shared-libraries/src/translation/locales/it/translation.json
 M libraries/react-shared-libraries/src/translation/locales/ja/translation.json
 M libraries/react-shared-libraries/src/translation/locales/ka_ge/translation.json
 M libraries/react-shared-libraries/src/translation/locales/ko/translation.json
 M libraries/react-shared-libraries/src/translation/locales/pt/translation.json
 M libraries/react-shared-libraries/src/translation/locales/ru/translation.json
 M libraries/react-shared-libraries/src/translation/locales/tr/translation.json
 M libraries/react-shared-libraries/src/translation/locales/vi/translation.json
 M libraries/react-shared-libraries/src/translation/locales/zh/translation.json
 M tests/ai.clients.test.cjs
 M tests/ai.provider.component.test.cjs
 M tests/ai.search.config.test.cjs
 M tests/web.research.service.test.cjs
?? .codex/goals/content-factory-next-2jm/
?? .codex/stages/content-factory-next-2jm/
?? 01-hero-variant-c.png
?? 01-hero.png
?? 02-nevidimyy-chernovik.png
?? 03-pustye-generacii.png
?? docs/superpowers/plans/2026-08-14-search-provider-review-fixes.md
process verification OK
```

## Итоговый статус

- Обязательная приёмка зелёная.
- Правки по независимому review остаются в рабочем дереве без commit.
- Повторный независимый review не нашёл дефектов production-логики или расходного поведения.
- Merge, push, deployment, pilot и подключение ключа остаются вне этого отчёта.
