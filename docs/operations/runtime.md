# Эксплуатация и диагностика

**Статус:** `current runbook`
**Проверено:** 2026-08-11

Документ описывает форму runtime, но не разрешает deployment или работу с production. Любые live-изменения требуют отдельного явного поручения.

## Процессы

| Процесс | Зависимости | Назначение |
| --- | --- | --- |
| Frontend | backend, media URLs | UI и server rendering |
| Backend | PostgreSQL, Redis, Temporal, storage | HTTP API, auth, запись намерений |
| Orchestrator | PostgreSQL, Redis, Temporal, provider APIs | workflow worker и побочные эффекты |
| PostgreSQL app | persistent volume | продуктовые данные |
| Redis | persistent/ephemeral по сценарию | throttling и runtime state |
| Temporal | собственные PostgreSQL + Elasticsearch | durable execution/history |
| Storage | local volume или R2 | media files |

[deploy/production/docker-compose.yaml](../../deploy/production/docker-compose.yaml) показывает развёрнутую форму. [docker-compose.dev.yaml](../../docker-compose.dev.yaml) поднимает инфраструктуру разработки и административные UI.

## Как приложения стартуют в контейнере

В production-образе три приложения живут в одном контейнере под pm2. Точка
входа — [entrypoint.sh](../../var/docker/entrypoint.sh): поднимает nginx и
передаёт управление `pm2-runtime`, который остаётся PID 1 и пишет логи всех
трёх приложений в stdout контейнера. Список процессов задан в
[ecosystem.config.js](../../var/docker/ecosystem.config.js), и каждое
приложение запускается как обычный `node` со своим потолком heap.

Внутри контейнера должно быть ровно шесть процессов помимо воркеров nginx:
`pm2-runtime`, три приложения, мастер nginx и его воркеры. Процессов `pnpm`,
`dotenv` или `sh` там быть не должно — до 2026-08-17 каждое приложение
запускалось цепочкой `pm2 start pnpm -- start` → `pnpm` → `dotenv-cli` →
`node`, и оба родителя оставались в памяти навсегда. Проверка:

```bash
docker compose exec cf-app sh -c 'ls /proc/[0-9]*/cmdline | while read f; do tr "\0" " " < "$f"; echo; done'
```

Конфигурацию приложения читают из окружения процесса, которое compose
заполняет через `env_file`; `dotenv` внутри образа не нужен. Вне Docker он
по-прежнему нужен, и скрипты `start` в `apps/*/package.json` его сохраняют.

### Настройки воркеров Temporal

Значения выбраны в
[temporal.module.ts](../../libraries/nestjs-libraries/src/temporal/temporal.module.ts)
и не выводятся из размера heap:

| Настройка | Значение | Почему |
| --- | --- | --- |
| `maxConcurrentActivityTaskExecutions` | 20 на очередь | потолок этого сервера, а не провайдера: каждая activity держит соединение Prisma и исходящий HTTP-запрос |
| `maxCachedWorkflows` (только `main`) | 100 | иначе SDK выводит число из лимита heap — 196 слотов в контейнере на 2 ГиБ и 295 на рабочей машине |
| `maxConcurrentWorkflowTaskExecutions` (только `main`) | 10 | задачи workflow здесь короткие; по умолчанию было 40 |
| `maxConcurrentWorkflowTaskPolls` (только `main`) | 5 | половина от предыдущего, как рекомендует SDK |
| `reuseV8Context` | по умолчанию `true` | выключение удваивает число потоков воркера |

Пул Prisma — `num_physical_cpus * 2 + 1`, если в `DATABASE_URL` не задан
`connection_limit`, а он не задан. Реальное число на сервере видно так:

```bash
docker compose exec cf-app node -e 'console.log(require("os").cpus().length * 2 + 1)'
```

Если поднимаете `maxConcurrentActivityTaskExecutions`, поднимайте и пул, иначе
activity начнут получать `P2024` по таймауту ожидания соединения.

Пул в приложении ровно один — тот, что держит `PrismaService`. Резолвер
AI-credentials раньше заводил собственный `PrismaClient`, то есть второй пул на
пути, который проходит перед каждой AI-операцией; теперь `AiUsageService`
одалживает ему уже имеющийся клиент
([ai.provider.config.ts](../../libraries/nestjs-libraries/src/openai/ai.provider.config.ts)).
Считая соединения на процесс, второй пул больше искать не нужно. Пока клиент не
одолжен, резолвер отказывает так же, как при недоступной базе.

Установленный `@temporalio/worker` — 1.15.0, тогда как `nestjs-temporal-core`
3.2.3 объявляет peer-диапазон `^1.12 || ^1.13`. Обёртка касается этого API в
шести местах: `Worker.create`, `NativeConnection.connect`, `new Client`,
`new ScheduleClient`, `client.workflow.start` и `client.workflow.getHandle`.
Опции она не разбирает, а передаёт как есть — `Object.assign(workerConfig,
workerDef.workerOptions)` в `dist/services/temporal-worker.service.js:191`.
Проверено на установленных пакетах: все опции, которые мы задаём, объявлены и в
типах обёртки (`dist/interfaces.d.ts`, `WorkerCreateOptions`), и в
`@temporalio/worker` 1.15.0; воркеры поднимаются, `tsc` на библиотеке чистый.
Понижать SDK ради объявленного диапазона поэтому не нужно, но при обновлении
любой из двух сторон это первое место, куда стоит посмотреть — и совместимость
1.14/1.15 обёртка не заявляет, а мы её принимаем на себя.

## Проверка здоровья

- frontend открывает страницу login/app;
- backend отвечает на monitor/root endpoint и может обратиться к PostgreSQL/Redis;
- orchestrator health server слушает `ORCHESTRATOR_PORT`;
- Temporal UI показывает namespace и workers/task queues;
- новый scheduled post получает workflow `post_<id>`;
- storage возвращает загруженный media path.

HTTP health сам по себе не доказывает, что provider credentials или публикация работают.

### Telegram support relay

Личные сообщения боту сначала атомарно фиксируются вместе с receipt входящего
update в `TelegramSupportRelayOutbox`, а затем пересылаются владельцу вне
транзакции. Поэтому сбой Telegram API не откатывает cursor и не ломает
`/connect`, реакции или обсуждения. Незавершённые строки выбираются повторно;
успех отмечается только после `forwardMessage`.

Операторские сигналы:

- `TELEGRAM_SUPPORT_OWNER_CHAT_ID is not configured` — доставка выключена,
  очередь сохраняется, polling продолжает работать;
- `Telegram support relay <update_id> delivery failed and will be retried` —
  Telegram отказал в пересылке либо API временно недоступен;
- `attempt could not be recorded` — после ошибки доставки не удалось обновить
  счётчик попыток; сама незавершённая запись остаётся повторяемой.

Для диагностики смотрите количество строк с `deliveredAt IS NULL`, возраст
`createdAt`, `attemptCount` и `lastAttemptAt`; содержимого сообщения в таблице
нет. Новые записи без попыток идут первыми, а ошибавшиеся ротируются по времени
последней попытки: permanently unforwardable сообщение не блокирует свежие.
Метаданные успешной доставки удаляются через 7 дней; pending-строки по возрасту
не удаляются. Не удаляйте их как способ «починить» очередь: это потеряет
единственную локальную ссылку на исходное сообщение. Telegram может постоянно
отказывать для service messages и protected content; их текст или вложение
нельзя восстановить из outbox, ответ нужно вести по сохранённым source ids.

## Где искать сбой публикации

1. `Post.state`, `error`, `releaseId`, `releaseURL` и связанные `Errors`.
2. Temporal workflow `post_<post.id>` и последняя failed activity.
3. Состояние `Integration`: `disabled`, `refreshNeeded`, token expiration.
4. Task queue конкретного provider и наличие orchestrator worker.
5. Provider response/body; секреты перед логированием редактировать.
6. Webhook/plugs проверять после основного результата, не смешивая их сбой с доставкой.

## Типовые классы сбоев

| Симптом | Вероятная граница |
| --- | --- |
| 401/403 при входе | cookie/JWT/user activation/auth middleware |
| 402 при действии | subscription capability/PoliciesGuard |
| Пост остается `QUEUE` | Temporal/worker/task queue/date |
| `refresh_token` failure | Integration refresh/reconnect |
| Provider validation error | DTO/SocialProvider.checkValidity/settings |
| Успех без доступного media | storage path/public URL/volume |
| Дублирование | workflow id/conflict policy/idempotency provider |
| Другой tenant видит объект | отсутствующий organization filter; security defect |

Межтенантная утечка, публикация не в тот канал или раскрытие token — критический инцидент: остановить затронутый путь, сохранить доказательства без секретов и не выполнять массовую коррекцию без плана.

## Коды ошибок AI

Отказ AI-операции приходит клиенту как JSON с полем `code`. Статус сам по себе
неоднозначен — два разных отказа отвечают `503`, — поэтому разбирать нужно
именно код:

| `code` | HTTP | Что произошло | Что делать |
| --- | --- | --- | --- |
| `AI_SELECTED_CREDENTIAL_UNAVAILABLE` | 503 | у выбранного режима нет пригодного ключа: в `included` не задан управляемый ключ, в `workspace_key` организация не ввела свой. Скрытого перехода между режимами нет | оператор задаёт `AI_INCLUDED_*` либо администратор организации вводит ключ workspace |
| `AI_INCLUDED_QUOTA_EXHAUSTED` | 429 | месячная included-квота исчерпана или равна нулю | решение по квоте либо переход организации на `workspace_key` |
| `AI_ADMISSION_CONTENDED` | 503 | журнал допуска не смог принять операцию из-за конкуренции или медленной базы. Allowance **не списан**, обращения к модели **не было** | повторить тот же запрос; при повторении смотреть на базу, а не на квоту |

Разница между `429` и `AI_ADMISSION_CONTENDED` существенна для потребителя:
`429` — это ответ про исчерпанный бюджет, и на нём уместно предложить смену
режима. `503` с этим кодом не говорит о бюджете ничего, и показывать по нему
сообщение про квоту неверно. Три попытки допуска с нарастающей случайной
паузой предпринимает сам сервер; клиент видит этот код только после них.

Определения — в
[ai.usage.service.ts](../../libraries/nestjs-libraries/src/openai/ai.usage.service.ts)
и [ai.provider.config.ts](../../libraries/nestjs-libraries/src/openai/ai.provider.config.ts).
Что именно расходует allowance, описано в
[Cloud-first SaaS-контракте](../product/cloud-saas-growth-spec.md#ai-режимы).

## Резервирование и восстановление

Для полноценного восстановления нужны согласованные снимки:

- PostgreSQL приложения;
- media volume/bucket;
- Temporal persistence и search storage;
- runtime configuration/secrets из разрешенного secret store.

Redis обычно не является единственным источником долговечных продуктовых данных, но его роль нужно подтвердить перед очисткой. Восстановление только основной БД может оставить Temporal history и media несогласованными.

## Postiz как донор: remote удалён

Решение владельца от 22.08.2026: работа идёт только в этом репозитории, и git-remote `upstream`
на `gitroomhq/postiz-app` удалён. Его больше не настраивают ни на новой машине, ни после клона.

Что это меняет:

- обновлений из Postiz не будет — расхождение с ним растёт намеренно, и это уже так с момента,
  когда собственные домены перестали совпадать с апстримом;
- `gh` перестал промахиваться. Пока `upstream` существовал, `gh` без явного указания выбирал
  базовым репозиторием **его**, и команда вида `gh pr merge <номер>` уходила искать чужой PR с тем
  же номером. Дополнительно закреплено `gh repo set-default maslennikov-ig/content-factory-next`,
  но эта настройка живёт в локальном `.git/config` и в свежем клоне её не будет — там проверять
  `gh repo view --json nameWithOwner` перед первой изменяющей командой.

**Что при этом не убирается и убрано быть не может.** Продукт — форк под AGPL-3.0, и указание
происхождения в `README.md`, `LICENSE` и `SECURITY.md` требует лицензия, а не привычка. Оно
защищено `scripts/branding/brand-scan.cjs` как явное разрешение и записано в ADR-0001 и ADR-0005.
Удаление git-remote к этому отношения не имеет: remote — способ ходить в чужой репозиторий,
атрибуция — обязательство перед лицензией.

Если понадобится сравнить историю разово, remote не нужен:

```bash
git fetch https://github.com/gitroomhq/postiz-app.git --tags --dry-run
```

## Наблюдаемость

Сбор ошибок — свой, на отдельном GlitchTip, и включается двумя переменными окружения; в продуктовом compose его нет, Spotlight выключен явно. Browser SDK не знает адреса сборщика: он отправляет только закрытый очищенный payload на same-origin `/api/browser-errors`, а server relay пересылает его без IP, User-Agent, cookies и заголовков. См. [Собственный сбор ошибок](error-collection.md). Temporal хранит execution history, а БД содержит `Errors` и `Notifications`. Перед production нужно отдельно определить:

- redaction секретов и пользовательского контента;
- retention traces/workflow history;
- алерты по очереди, ошибкам и просроченным постам;
- correlation id между HTTP, Post id, workflow id и provider response;
- пределы стоимости AI и внешних API.
