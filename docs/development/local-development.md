# Локальная разработка

**Статус:** `runbook`
**Проверено:** 2026-09-01

## Требования

- WSL/Linux shell;
- Node из [.nvmrc](../../.nvmrc) (`22.23.2` на момент проверки);
- pnpm из `packageManager` в [package.json](../../package.json) (`10.6.1`);
- Docker Compose;
- `zip` — только для упаковки браузерного расширения, см. [Расширение](#расширение);
- свободные порты 3000, 3002, 4200, 5433, 6380, 7234 и 8080.

## Первый запуск из исходников

```bash
cd /home/me/code/content-factory-next
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run dev:docker
pnpm run prisma-db-push
pnpm run dev
```

Перед запуском замените `JWT_SECRET` в локальном `.env`. `.env` не коммитится. Команда `prisma-db-push` содержит `--accept-data-loss` и предназначена только для локальной БД.

`next build` и `next dev` отправляют обезличенную телеметрию в Vercel. В production-образе она выключена переменной `NEXT_TELEMETRY_DISABLED=1`; локально задайте её сами, если это нежелательно. Никакой другой сборочный плагин конфигурацию не оборачивает: тот, что выгружал карты исходников наружу, удалён.

Ожидаемые адреса:

| Сервис | URL/порт |
| --- | --- |
| Frontend | `http://localhost:4200` |
| Backend | `http://localhost:3000` |
| Orchestrator health | `http://localhost:3002` |
| Temporal UI | `http://localhost:8080` |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6380` |
| Temporal | `localhost:7234`, namespace `cf-dev` |

Порты сдвинуты относительно портов по умолчанию у Postgres/Redis/Temporal (5432, 6379, 7233) намеренно: на общей машине разработки эти порты часто уже держит стенд соседнего проекта. `TEMPORAL_ADDRESS`/`TEMPORAL_NAMESPACE` не заданы по умолчанию в коде — если их не выставить явно в `.env` (как это делает `.env.example`), backend и orchestrator тихо подключатся к `localhost:7233` и пространству имён `default`, то есть, вероятно, к чужому Temporal, а не к своему.

Compose development описан в [docker-compose.dev.yaml](../../docker-compose.dev.yaml). Он поднимает инфраструктуру, но не frontend/backend/orchestrator. Файл фиксирует контейнеры под именами `cf-dev-*`, но эти имена — глобальные для докер-хоста, а не для этого compose-проекта: `docker compose -f docker-compose.dev.yaml up -d` без указания сервисов конфликтует с любым соседним проектом, у которого контейнеры называются так же (например, унаследованный от апстрима голый `temporal`). Поднимайте инфраструктуру поимённо:

```bash
docker compose -f docker-compose.dev.yaml up -d cf-dev-postgres cf-dev-redis cf-dev-temporal
```

## Первый вход

Самый простой путь для локального просмотра:

1. Убедиться, что `DISABLE_REGISTRATION=false` или переменная отсутствует.
2. Не задавать `RESEND_API_KEY`, если не нужна email-активация.
3. Открыть `http://localhost:4200/auth/login`.
4. Перейти к LOCAL registration и создать пользователя email/password. Пароль
   LOCAL-регистрации — 12..64 символа; та же граница действует при установке
   пароля по ссылке восстановления. Подробности и остальные правила входа — в
   [Конфигурации](../operations/configuration.md#требования-к-паролю).

Для HTTP localhost задайте `NOT_SECURED=true`, если auth cookie не сохраняется. Не переносите это значение в публичное окружение.

Google/GitHub/generic OAuth и Telegram OpenID Connect требуют credentials и точных redirect URL. Google login в текущем коде использует `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` и redirect `http://localhost:4200/integrations/social/youtube` при стандартном `FRONTEND_URL`. Telegram login использует отдельные `TELEGRAM_CLIENT_ID`/`TELEGRAM_CLIENT_SECRET` и callback `${FRONTEND_URL}/auth?provider=TELEGRAM`. Они не нужны, чтобы войти внутрь продукта локально.

## Проверка OAuth через HTTPS-туннель

Пять провайдеров, которым нужен HTTPS callback (Threads, standalone Instagram,
VK, TikTok и Slack), должны возвращать браузер непосредственно на наш frontend.
Не передавайте OAuth-код через `redirectmeto.com` или любой другой чужой
редиректор: код авторизации даёт доступ к подключаемому аккаунту.

Для локальной проверки используйте любой разрешённый вашей организацией
HTTPS-туннель, который направляет запросы только на ваш локальный frontend.
Туннель не должен требовать передачи ему OAuth-кода как отдельному callback.
Пример порядка действий:

1. Запустите frontend на `http://localhost:4200` и поднимите HTTPS-туннель на
   этот порт. Сохраните выданный HTTPS origin, например
   `https://local.example.test`.
2. В локальном `.env` задайте `FRONTEND_URL=https://local.example.test` и
   перезапустите frontend и backend. Не коммитьте `.env` и не используйте этот
   адрес как production URL.
3. В настройках OAuth-приложения каждого провайдера зарегистрируйте точный
   callback (без завершающего `/`):

   | Провайдер | Callback |
   | --- | --- |
   | Threads | `${FRONTEND_URL}/integrations/social/threads` |
   | standalone Instagram | `${FRONTEND_URL}/integrations/social/instagram-standalone` |
   | VK | `${FRONTEND_URL}/integrations/social/vk` |
   | TikTok | `${FRONTEND_URL}/integrations/social/tiktok` |
   | Slack | `${FRONTEND_URL}/integrations/social/slack` |

4. Откройте Content Factory через тот же HTTPS origin и начните подключение.
   Проверьте, что страница провайдера возвращает браузер на ваш tunnel origin,
   а в URL нет чужого redirect-домена. После проверки удалите callback из
   настроек OAuth-приложения или ограничьте доступ к туннелю.

Требование HTTPS относится к адресу, который зарегистрирован у провайдера.
Локальный `http://localhost:4200` оставьте для обычной разработки без OAuth.

## Локальное хранилище файлов

При `STORAGE_PROVIDER="local"` задавайте `UPLOAD_DIRECTORY` **абсолютным** путём.
Frontend, backend и orchestrator стартуют каждый из своего рабочего каталога,
поэтому относительный путь вроде `./uploads` означает для них три разных папки:
backend пишет аватар в одну, frontend отдаёт `/uploads` из другой, orchestrator
ищет медиа при публикации в третьей.

## Подключение Telegram-канала

Один бот обслуживает все каналы инстанса, а подключение канала — это добавление
бота администратором. Этот поток не связан с OpenID Connect для входа в продукт.

1. Создать бота у `@BotFather` (`/newbot`) и получить токен.
2. Заполнить в `.env`:

   ```
   TELEGRAM_TOKEN="токен от BotFather"
   TELEGRAM_BOT_NAME="username бота без @"
   ```

3. Перезапустить backend и orchestrator: оба читают токен один раз при старте.
4. Добавить бота администратором канала. Право «Публикация сообщений»
   обязательно; «Удаление сообщений» позволяет боту убрать служебную команду
   подключения за собой, иначе он предупредит и оставит её в ленте.
5. В интерфейсе: добавить канал → Telegram → «Connect Telegram», затем
   опубликовать показанную команду `/connect XXXX` в канале.

Подключение опрашивает `getUpdates`, поэтому у бота не должен быть установлен
webhook. У свежесозданного бота его нет.

## Вход через Telegram

Вход — отдельный OpenID Connect client из настроек Login Widget у BotFather.
Кнопка появляется только при одновременной настройке
`TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET`. В Allowed URLs нужно внести
точный `${FRONTEND_URL}/auth?provider=TELEGRAM`; этот callback использует PKCE и
не запрашивает телефон или право бота писать пользователю. Живая проверка
требует домен, который принимает BotFather, поэтому для обычного локального
запуска используйте LOCAL registration.

Возврат провайдера привязан к браузеру через cookie `oauth_state`, а она не
пересекает разные origin при `NOT_SECURED=true`. Поэтому локально вход через
провайдера отклоняется по замыслу. Полный порядок включения и применение
значения `TELEGRAM` к базе описаны в
[Подготовке входа через Telegram](../operations/telegram-login-setup.md).

## Частичный запуск

```bash
pnpm run dev:backend
pnpm run dev:frontend
pnpm run dev:orchestrator
```

`pnpm run dev-backend` запускает backend и frontend вместе. Полный `pnpm run dev` дополнительно включает extension и orchestrator.

## Расширение

`pnpm run build` намеренно не собирает расширение: корневой скрипт фильтрует
только `apps/frontend`, `apps/backend` и `apps/orchestrator`. Расширение
собирается отдельно:

```bash
pnpm run build:extension
```

Скрипт состоит из двух разных шагов:

1. **Компиляция.** `vite build` плюс копирование `manifest.json` в `dist/`.
   Внешних инструментов не требует.
2. **Упаковка.** `zip -r ../extension.zip .` — архив для загрузки в Chrome Web
   Store. Требует установленного `zip`.

Если `zip` отсутствует, шаг 1 завершается успешно, а команда падает на шаге 2 с
`sh: 1: zip: Permission denied` или `zip: command not found`. `dist/` при этом
пригоден для загрузки через `chrome://extensions` → «Загрузить распакованное».
Проверить только компиляцию можно так:

```bash
pnpm --filter ./apps/extension exec vite build
```

`externally_connectable.matches` в [manifest.json](../../apps/extension/manifest.json)
содержит точный production-origin `https://factory.aidevteam.ru/*` и localhost
для разработки. Подстановочный шаблон туда не добавляется: он открыл бы приём
сообщений от произвольных сайтов. Адрес развёртывания описан в
[Развёртывании на сервере](../operations/production-deploy.md).

## Prisma

```bash
pnpm run prisma-generate
pnpm run prisma-db-push
```

Schema: [libraries/nestjs-libraries/src/database/prisma/schema.prisma](../../libraries/nestjs-libraries/src/database/prisma/schema.prisma). Изменение данных для production требует отдельной миграции и плана отката; `db push` таким планом не является.

## Проверки

Для текущего репозитория:

```bash
nvm use
pnpm run docs:check
pnpm test
pnpm run build
git diff --check
scripts/orchestration/run_process_verification.sh
```

Во время разработки запускайте минимальную проверку затронутого пакета. Полный build обязателен на интеграционной или release-границе, но документационный этап не должен делать сетевые, provider или платные AI-вызовы.

## Частые проблемы

### Вход возвращает на login

- проверьте одинаковые `FRONTEND_URL` и фактический origin;
- для локального HTTP проверьте `NOT_SECURED=true`;
- убедитесь, что `JWT_SECRET` непустой и backend перезапущен;
- проверьте, что пользователь `activated`.

### Google OAuth отклоняет redirect

Причина — отсутствующие `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` или несовпадение точного `${FRONTEND_URL}/integrations/social/youtube` с authorized redirect URI в Google Console. Для просмотра продукта используйте LOCAL registration; OAuth настраивайте только когда проверяется конкретная интеграция.

### Публикация не запускается

- проверьте Temporal на `localhost:7234` (namespace `cf-dev`) и UI на `localhost:8080`;
- убедитесь, что orchestrator запущен;
- проверьте provider credentials и состояние `Integration`;
- найдите workflow `post_<post.id>` и запись `Errors`.

### Node/pnpm не совпадают

Всегда выполняйте `nvm use` в текущем shell до pnpm-команд. Системный Node вне диапазона `>=22.12 <23` не является поддерживаемым runtime.
