# Интеграции и публикация

**Статус:** `current`
**Проверено:** 2026-08-11

## Общий контракт

Все социальные платформы реализуют [SocialProvider](../../libraries/nestjs-libraries/src/integrations/social/social.integrations.interface.ts). Контракт объединяет:

- построение URL авторизации, обмен code и обновление token;
- `post` и необязательный `comment`;
- identifier, name, scopes и вид редактора;
- максимальную длину и provider-specific validation;
- опциональные analytics, mentions, profile changes и page selection;
- custom fields, self-hosted/external OAuth и extension cookies.

`PostDetails` передает провайдеру нормализованные `message`, `settings`, `media` и `poll`. `PostResponse` возвращает внутренний id, platform post id, release URL и status.

## Реестр провайдеров

[IntegrationManager](../../libraries/nestjs-libraries/src/integrations/integration.manager.ts) содержит `socialIntegrationList` и выбирает реализацию по `identifier`. В текущем реестре 35 провайдеров:

- X, LinkedIn, LinkedIn Page, Reddit;
- Instagram, Instagram Standalone, Facebook, Threads;
- YouTube, Google Business, TikTok, Pinterest, Dribbble;
- Discord, Slack, Kick, Twitch;
- Mastodon, Bluesky, Lemmy, Farcaster, Telegram, Nostr, VK;
- Medium, Dev.to, Hashnode, WordPress, Listmonk;
- Moltbook, Whop, Skool, MeWe, Tumblr.

Конкретные реализации находятся в [integrations/social](../../libraries/nestjs-libraries/src/integrations/social). Реестр также отдает UI metadata, custom tools, rules и plugs.

## Подключение канала

Общий путь:

1. backend запрашивает у provider URL авторизации;
2. browser проходит OAuth/provider flow;
3. callback обменивает code на `AuthTokenDetails`;
4. `Integration` сохраняет identity, provider identifier, tokens, expiration и settings;
5. frontend получает список каналов через integrations API.

Некоторые платформы используют дополнительные шаги, self-hosted URL, generic OAuth, Web3 или browser extension. Эти различия не должны протекать в общий PostsService.

## Граница безопасной публикации

Только orchestrator activity вызывает `provider.post`. HTTP controller сохраняет намерение и запускает Temporal. Это дает:

- выполнение после завершения запроса пользователя;
- ожидание даты без in-process timer;
- повторное чтение актуального состояния;
- provider-specific task queues;
- контролируемые повторы и обработку refresh/reconnect;
- журнал workflow execution.

Webhooks и plugs выполняются после результата публикации. Новые Content Factory workflows не должны обходить эту границу.

## Как добавить или изменить платформу

1. Создать/изменить provider в `libraries/nestjs-libraries/src/integrations/social/`.
2. Реализовать полный `SocialProvider`, включая серверную validation.
3. Добавить provider в `socialIntegrationList`.
4. Добавить DTO settings и frontend editor/preview в `apps/frontend/src/components/new-launch/providers/`.
5. Добавить необходимые переменные в `.env.example` и configuration docs без секретов.
6. Проверить OAuth callback, создание черновика и публикацию через fake/test account только при отдельном разрешении.

Provider identifier является долговечным контрактом: он хранится в `Integration.providerIdentifier`, `Post.settings.__type` и участвует в выборе Temporal task queue. Переименование требует миграции данных и совместимости.

## Temporal contracts

Workflow экспортируются из [workflows/index.ts](../../apps/orchestrator/src/workflows/index.ts). Activities регистрируются в [orchestrator AppModule](../../apps/orchestrator/src/app.module.ts). Публикация сейчас использует `postWorkflowV105`; предыдущие версии остаются в коде, потому что Temporal может воспроизводить сохраненную историю.

Правило: несовместимое изменение последовательности, signal, activity name/shape или детерминированного поведения получает новый versioned workflow. Подробности — [ADR-0003](../adr/0003-version-temporal-contracts.md).

## Ограничения среды разработки

Наличие provider в реестре не означает, что он работает без конфигурации. OAuth apps требуют зарегистрированных redirect URI и client credentials. Локальный вход в сам продукт проще выполнять через LOCAL регистрацию; Google OAuth на localhost работает только с правильно настроенным Google client и точным redirect URI. Порядок локального запуска и входа описан в [локальной разработке](../development/local-development.md#первый-вход).
