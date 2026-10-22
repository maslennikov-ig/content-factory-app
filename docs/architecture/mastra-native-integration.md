# Нативная интеграция Mastra 1.78 и реестр продуктовых доработок

- **Статус:** `current`
- **Последняя проверка:** `2026-10-21` (локальная доработка; выпуск на сервер не выполнялся)
- **Связанные документы:** [ADR-0012](../adr/0012-agent-harness.md), [Спецификация агентной обвязки](../product/agent-harness-spec.md), [План нативного перехода 19.10.2026](../superpowers/plans/2026-10-19-native-mastra-harness.md), [Развёртывание на сервере](../operations/production-deploy.md)

> Приёмка прежнего эпика пересмотрена после воспроизведения R1–R6. Текущее состояние и результаты локальных проверок: [ремонт интеграции](../../.codex/stages/content-factory-next-on0i-repair-20261021/plan.md). Исторический выпуск не доказывает полноту текущей приёмки.

Этот документ фиксирует точное устройство интеграции Mastra в Content Factory после эпиков `content-factory-next-on0i` и `content-factory-next-bxeb`:

1. Какие возможности Mastra включены напрямую из SDK.
2. Какие узлы адаптированы или переопределены поверх Mastra и **почему их нельзя потерять при следующем обновлении пакетов `@mastra/*`**.
3. Какие механизмы Mastra сознательно выключены и при каких условиях их можно включать.

---

## 1. Зафиксированные версии пакетов и схема БД

В `package.json` закреплены согласованные стабильные версии:

| Пакет | Версия | Назначение в продукте |
| :--- | :--- | :--- |
| `@mastra/core` | `1.78.0` | Ядро `Mastra`, `Agent`, `DurableAgent`, `AgentController`, `Session`, процессоры, `createTool`, `defineSchedule`, `createSkill`, `AISDKTranscription` (`voice`), `createScorer` (`evals`), `BackgroundTaskManager` (`background-tasks`), `createNotificationInboxTool` (`notifications`), `ChatChannelProcessor` / `MastraStateAdapter` / `formatToolApproval` (`channels`) |
| `@mastra/memory` | `1.38.0` | `Memory` (`messageHistory`, `workingMemory` со схемой `personPreferencesSchema`, `cloneThread` с отсечкой по `upToMessageId`) |
| `@mastra/pg` | `1.31.2` | Хранилище `PostgresStore` в отдельной БД Mastra (`47` таблиц, канонический отпечаток `a71e1b3535b5a871c523624edbb84318e5b295f2b7971292d9cc45dae4fe8cf0`) |
| `@mastra/ai-sdk` | `1.11.1` | Нативное преобразование `toAISdkStream` (`v7`) из наблюдаемого DurableAgent в AI SDK UI (`useChat`) |
| `@mastra/redis` | `1.4.10` | `RedisServerCache` для повторного чтения событий после переподключения и перезапуска |
| `@mastra/redis-streams` | `0.6.3` | Нативный `RedisStreamsPubSub` для событий и управления между процессами |
| `@mastra/observability` | `1.20.1` | Нативный producer spans, `MastraStorageExporter` в существующий PostgreSQL; чтение через поддерживаемые `listTraces` / `getTrace` |
| `@mastra/mcp` | `1.18.0` | Протокол MCP для внешних клиентов на маршруте `/mcp` (оставлен `1.18.0` ради совместимости с клиентами до протокола `2026-07-28`) |

Проверка опубликованных версий 21.10.2026 подтвердила актуальность основных закреплённых пакетов. `@mastra/mcp@2.4.1` оценён отдельно: его сервер требует протокол `2026-07-28` и меняет HTTP-контракт, тогда как существующие клиенты используют `2025-06-18`. Официально поддерживаемая ветка `1.x` сохранена намеренно; [проверка совместимости и конкретные потребители](../../.codex/stages/content-factory-next-on0i-repair-20261021/mcp-compatibility.md).

Хранилище Mastra изолировано в отдельной базе PostgreSQL (роль `cf_mastra_app`, без прав в продуктовой БД `cf_product_app`). Обновление схемы Mastra выполняется только через [`deploy/production/upgrade-mastra-storage.sh`](../../deploy/production/upgrade-mastra-storage.sh) и проверяется [`scripts/operations/check-postgres-role-isolation.sh`](../../scripts/operations/check-postgres-role-isolation.sh).

---

## 2. Что работает нативно из Mastra 1.78

Ниже перечислены подсистемы, которые работают напрямую через публичные API Mastra:

### 2.1. Хост `Mastra`, `AgentController` и изолированные `Session`
- **Где в коде:** [`MastraService.mastra()`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts), [`buildConductorController()`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts), [`AgentThreadsService`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts).
- **Как работает:**
  - Один экземпляр `Mastra` владеет хранилищем, расписаниями и восстановлением. `createDurableAgent` вызывается до регистрации; реестр и `AgentController` получают один и тот же DurableAgent. Чат выполняется через `Session.sendSignal`, ответы на вопросы и подтверждения — через публичные методы Session.
  - На каждую пару `(resourceId = "{organizationId}:{userId}", threadId)` создаётся изолированная сессия `controller.createSession({ resourceId, ownerId, id, scope: threadId, threadId, createInitialThread: false })` после проверки владельца треда.
  - В `AgentController` настроены два режима: `assistant` (по умолчанию) и `plan` (`transitionsTo: 'assistant'`).
  - Неявные продуктовые ограничения по 64 шагам, времени и повторению результата не применяются к нативной Session; явно заданные оператором ограничения сохраняются. Фактический `Session.machinery.buildStreamOptions()` использует собственный предел Mastra в 1000 шагов. Служебные заметки продолжения принадлежат объекту исполнения и не попадают в сериализуемый `RequestContext`.
  - На агенте заданы нативные `requestContextSchema` (`conductorContextSchema`) и `scopes` (`conductorScopes` от серверного `identity` и `threadId`).

### 2.2. Нативное фоновое исполнение (`durable`), сигналы и переподключение
- **Где в коде:** [`buildConductorAgent()`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts), [`AgentThreadsService`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts), [`AgentController` HTTP-маршруты](../../apps/backend/src/api/routes/agent.controller.ts).
- **Как работает:**
  - Хост явно создаёт DurableAgent с TTL событий до 24 часов. При `REDIS_URL` используются `RedisServerCache` и `RedisStreamsPubSub` с отдельным пространством ключей по БД Mastra. Нативный `untilIdle` может удалить поток сразу после завершения, поэтому TTL не обещает повторное чтение уже завершённого запуска. Без Redis локальная память не даёт гарантий переподключения между процессами.
  - Чекпоинты и владение запуском сохраняются в таблицах `mastra_workflow_snapshot`, `mastra_memory_run_fences` и `mastra_workflow_run_owners`.
  - Разрыв браузерного соединения отсоединяет только HTTP-наблюдателя; сам ход продолжает выполняться. Повторное подключение к активному ходу идёт через `GET /agent/threads/:id/observe`. Публичный `createDurableAgentStream` создаёт отдельное состояние процессоров и историю для каждого наблюдателя: общий streaming-буфер `RegexFilterProcessor` в стандартном `observe()` Mastra 1.78 иначе повреждает текст при повторном чтении. Права, владение и исполнение остаются у исходного нативного запуска; наблюдатель не открывает новую модельную операцию.
  - После удаления потока ответ `204` возможен при подтверждённом завершении того же логического запроса и наличии в native Memory точного `messageId` его ответа. UI затем перечитывает сохранённую историю. Отсутствие событий или снапшота, старая реплика ассистента и ещё не сохранённый ответ не считаются доказательством завершения. Повторная генерация и искусственный SSE для этого не используются.
  - Указание во время работы отправляется через `POST /agent/threads/:id/signals`: обычная доставка использует нативный сигнал Session, явно отложенное сообщение — сохраняемый нативный workflow. Сообщение сохраняет выбранный при отправке рабочий объект; при исполнении сервер заново проверяет доступ. Положительное подтверждение нативного `discard` для уже простаивающей Session позволяет отправить то же сообщение обычным ходом с тем же ID. Неизвестный результат доставки не повторяется автоматически. Явная остановка через `POST /agent/threads/:id/stop` останавливает текущий запуск, ожидание доступности и принятые отложенные сообщения. Ответ Stop сохраняет ID захваченного текущего запроса. Для работающего нативного потока сервер запрашивает отмену и дочитывает уже открытый reader до нативных FINISH/EOF, которые следуют за сохранением сообщений; затем проверяет точный сохранённый ответ и завершает метаданные хода. Закрытие HTTP-наблюдателя и раннее событие окончания Session сами по себе не доказывают сохранение последних сообщений. Ошибка записи не превращается в успешный Stop; позднее чтение истории повторяет ту же строгую проверку UI, включая отсутствие неподтверждённых изменений.
  - При старте бэкенда используется публичное `Mastra.recoverAllDurableAgents`: Mastra повторно проверяет ещё занятые владения запуском. Восстановление не блокирует готовность HTTP-сервера.
  - Исчерпание доступных моделей при временном сбое сначала сохраняет ожидание через нативный workflow `sleepUntil`. После ожидания нативное управление продолжает задачу с сохранёнными результатами инструментов. Неопределённый результат записи запрещает автоматическое повторение.

### 2.3. Память (`@mastra/memory`)
- **Где в коде:** [`conductor.memory.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.memory.ts).
- **Как работает:**
  - `messageHistory: { maxTokens: 32_000 }` — нативное ограничение окна истории по токенам.
  - `workingMemory: { enabled: true, scope: 'resource', schema: personPreferencesSchema }` — предпочтения пользователя (длина ответа, обычный канал/аватар, до 5 коротких заметок), общие для всех чатов этого человека в организации.

### 2.4. Конвейер процессоров (`inputProcessors`, `outputProcessors`, `errorProcessors`)
- **Где в коде:** [`conductor.agent.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts), [`conductor.secrets.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.secrets.ts).
- **Как работает:**
  - `UnicodeNormalizer` и `RegexFilterProcessor` (вход и выход) — редактирование ключей и секретов по правилам [`secret-shapes.ts`](../../libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts).
  - `Classifier.decide()` выбирает основную или усиленную модель по самой задаче и материалу до сборки `ModelWithRetries[]`. Фиксированный ID этапа и явный выбор в Session имеют приоритет. Выбор кэшируется в контексте запроса, поэтому native preflight не оплачивает его повторно. При сбое классификатора работает основная модель с обычным резервом. `ModelSelectionProcessor` не подключён в рабочем `MastraService`: он заменяет только первую попытку и мог повторно вызвать усиленную модель, уже находящуюся в резерве.
  - `TaskStateProcessor` — нативная подстановка состояния чек-листа задач в промпт шага.
  - `ToolSearchProcessor` (`storage: 'context'`) — опциональный нативный поиск по каталогу инструментов с фильтрацией по роли. Он проверен отдельным SDK-сценарием, но текущий `MastraService` не включает `deps.toolSearch`: рабочая Session получает весь разрешённый каталог. Наличие builder само по себе не означает активное обнаружение инструментов.
  - `ToolCallFilter({ filterAfterToolSteps: 6, preserveModelOutput: true })` и `TokenLimiterProcessor({ limit: 48_000, strategy: 'truncate', trimMode: 'best-fit' })` — защита от переполнения контекста на многошаговых вызовах без изменения сохранённой истории в БД.
  - `UnsupportedFileHandler` и `StreamErrorRetryProcessor` в `errorProcessors`.

### 2.5. Цепочка моделей `ModelWithRetries[]`
- **Где в коде:** [`ai.clients.ts`](../../libraries/nestjs-libraries/src/openai/ai.clients.ts), [`mastra.service.ts`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts).
- **Как работает:**
  - `getMastraAgentModelEntries(organizationId, role)` возвращает нативный массив `ModelWithRetries[]` (основная модель роли + до 8 совместимых резервных моделей из настроек пространства с настраиваемым бюджетом повторов).
  - `getRoutedMastraModelEntries` сначала вызывает нативный `Classifier` через модель роли `classify` (одна попытка без собственного резерва), затем собирает уникальную цепочку. При выборе усиленной модели резерв начинается с основной; явное отключение резерва остаётся в силе. Повторы и переходы выполняют нативный массив и `StreamErrorRetryProcessor`; HTTP-транспорт делает одну попытку и учитывает расход.
  - Настройки `modelRouting` (автовыбор, усиленная модель, её Flex) и четыре этапа `agent` / `draft` / `adapt` / `review` доступны для ключей системы и собственных ключей. Они хранятся в существующем JSON `roleModels.__modelRouting`; миграции нет. Наследование резерва сохраняется отдельно от явно пустой цепочки, в том числе при изменении повторов.
  - Реальные генераторы сути, адаптации и редакторской проверки используют общий `getChatModel` с тонким адаптером `ai.stage-model.ts`: Mastra выполняет генерацию и проверку исходной схемы. Существующие доменные промпты, проверка текста и один запрос исправления сохраняются.
  - Для собственного OpenAI-ключа нативные модели используют Responses API, для OpenRouter — Chat Completions. Flex задаётся настройкой модели, не владельцем ключа. Настройка «только Flex» исключает скрытый переход этой модели на обычный тариф; допустимые другие модели остаются резервом.

### 2.6. Инструменты автономности, цели (`goal`), навыки (`skills`), расписания (`schedules`) и наблюдаемость
- **Где в коде:** [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts), [`conductor.skills.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.skills.ts), [`agent-threads.service.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts).
- **Как работает:**
  - Нативные инструменты `askUserTool` (`ask_user`), `taskWriteTool` (`task_write`), `taskUpdateTool` (`task_update`), `taskCompleteTool` (`task_complete`), `taskCheckTool` (`task_check`).
  - Нативный стор целей (`writeObjective`, `readObjective`, `clearObjective`, `resolveGoalStore`) и конфигурация `goal` на агенте.
  - Нативные `createSkill` (`CONDUCTOR_SKILLS`) для разделов продукта («Аватар», «Каналы», «Контент», «План», «Помощь»). `resolveAgentSkills` / `createSkillTools` регистрируют встроенные инструменты на самом агенте: они должны оставаться доступны после восстановления, а не только в исходном наборе Session. Сессия продолжает поток через свои приостановки (`closeOnSuspend: false`); вопрос или подтверждение отсоединяет HTTP-наблюдателя только после появления действующей карточки.
  - Нативные расписания `defineSchedule` / `mastra.schedules` для регулярных follow-up проверок по треду.
  - `MastraService` явно включает `Observability` с единственным `MastraStorageExporter` в существующее хранилище Mastra. Внешние экспортёры не подключены. [`native-observability.ts`](../../libraries/nestjs-libraries/src/chat/conductor/native-observability.ts) удаляет input/output, медиаданные, заголовки, секреты и полный RequestContext публичным `SpanOutputProcessor` до записи; сохраняет ограниченные технические атрибуты и серверные ID для связей.
  - Приложение владеет публичным `pg.Pool`, переданным в `PostgresStore`: нативный `Mastra.shutdown()` сначала завершает или освобождает выполняемые задачи, затем сбрасывает exporter, а `MastraService` закрывает пул в `finally`. Это сохраняет spans, завершившиеся во время ожидания задач; раннее закрытие пула до сброса буфера их теряет. Повторное завершение сервиса и закрытие пула используют одну операцию.
  - `GET /agent/threads/:id/observability` читает поддерживаемые текущим PostgreSQL API: `listTraces({ filters: { threadId, resourceId }, pagination })`, затем `getTrace`. Оба фильтра обязательны; дочерний span без своих ID допускается только по цепочке родителей от проверенного корня, а конфликт явно указанной области исключает всю ветку. Ответ ограничен последними 50 корневыми traces и сообщает `tracesTruncated`.
  - Расширенные `querySpans`, `aggregateTraces` и native metrics в установленном legacy PostgreSQL store не поддерживаются; наличие унаследованного метода не означает поддержку. Агрегаты ответа считаются по возвращённым spans. Нативные оценки цены не являются счётом: фактический учёт расходов и неизвестной стоимости остаётся в журнале `AiUsageService`. Трассировка действует для новых запусков после включения, старые чаты задним числом spans не получают.

### 2.7. Голосовой диктофон (`AISDKTranscription` из `@mastra/core/voice`)
- **Где в коде:** [`ai.clients.ts`](../../libraries/nestjs-libraries/src/openai/ai.clients.ts), [`mastra.service.ts`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts), [`agent.controller.ts`](../../apps/backend/src/api/routes/agent.controller.ts), [`agent.composer.tsx`](../../apps/frontend/src/components/agents/agent.composer.tsx).
- **Как работает:**
  - На агенте регистрируется `voice` (`AISDKTranscription` поверх `createOpenAI({ apiKey, baseURL }).transcription(model)`), поддерживающий OpenAI, OpenRouter и совместимые шлюзы воркспейса.
  - Дверь `POST /agent/voice/transcribe` (до `10 МБ`, `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`) тарифицируется через `AiUsageService.beginAiOperation(..., 'voice_transcribe')`, вызывает `agent.voice.listen(audioStream, { filetype })` и редактирует секреты через `withoutSecretShapes`.
  - В `AgentComposer` диктофон на `MediaRecorder` даёт выбор **«В текст»** (дописать в поле ввода для правки) или **«Отправить сразу»** (распознать и сразу отправить ход).

### 2.8. Ветвление и клонирование диалогов (`Session.thread.clone` / `memory.cloneThread`)
- **Где в коде:** [`agent-threads.service.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts) (`forkThread`), [`agent.controller.ts`](../../apps/backend/src/api/routes/agent.controller.ts) (`POST /agent/threads/:id/fork`), [`agent.conversation.tsx`](../../apps/frontend/src/components/agents/agent.conversation.tsx), [`agent.threads.tsx`](../../apps/frontend/src/components/agents/agent.threads.tsx).
- **Как работает:**
  - Полное клонирование треда («Клонировать разговор» в `ThreadSwitcher`) вызывает нативный `session.thread.clone({ newThreadId, title, metadata })`.
  - Ветвление от конкретного сообщения («Ответвить отсюда» в `AgentConversation`, передаёт `upToMessageId`) вызывает `memory.cloneThread({ sourceThreadId, newThreadId, title, metadata, options: { messageFilter: { endDate, endMessageId } } })` и фиксирует метаданные источника `{ clonedFromThreadId, clonedAt, upToMessageId }`.
  - Новая ветка получает собственную изолированную `Session` (`forked: true`) с сохранением `workContext` и привязанных объектов разговора, не затрагивая историю исходного треда.

### 2.9. Детерминированный скорер голоса бренда и фактов (`createScorer` из `@mastra/core/evals` и стор `scores`)
- **Где в коде:** [`brand-voice-facts.scorer.ts`](../../libraries/nestjs-libraries/src/chat/scorers/brand-voice-facts.scorer.ts), [`mastra.adapter.ts`](../../libraries/nestjs-libraries/src/chat/capabilities/mastra.adapter.ts), [`agent-threads.service.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts), [`agent.cards.tsx`](../../apps/frontend/src/components/agents/agent.cards.tsx), [`agent.plan-card.tsx`](../../apps/frontend/src/components/agents/agent.plan-card.tsx).
- **Как работает:**
  - Нативный `createScorer({ id: 'brand-voice-and-facts', ... })` объединяет бесплатные детерминированные проверки `VoiceService.checkText` (голос бренда), `SlopCheckService.check` (штампы и следы ИИ) и число подтверждённых фактов (`factsCount`) без расхода LLM-квоты.
  - При выполнении инструментов `piece.create`, `piece.adapt`, `adaptation.rewrite` и `voice.check` скорер считает оценку `score ∈ [0, 1]`, сохраняет запись в нативную таблицу `mastra_scores` через `pStore.getStore('scores')` (`saveScore`) и прикрепляет компактную сводку `brandVoiceScore` к артефакту.
  - На строках `ArtifactLine` и карточках `PlanCard` рендерится бейдж `Status` (`Голос N/M · Факты K`) с тонами `positive` / `warning` / `danger`; маршрут `GET /agent/threads/:id/scores` возвращает историю оценок по треду.

### 2.10. Менеджер фоновых поручений (`BackgroundTaskManager`) и входящие уведомления (`NotificationsStorage`, `createNotificationInboxTool`)
- **Где в коде:** [`mastra.service.ts`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts), [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts), [`agent-threads.service.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts), [`agent.threads.tsx`](../../apps/frontend/src/components/agents/agent.threads.tsx).
- **Как работает:**
  - В `new Mastra({ ..., backgroundTasks: true })` активирован нативный `BackgroundTaskManager`.
  - Завершение отложенных расписаний (`defineSchedule`), фоновых поручений и субагентов записывает уведомление в нативную таблицу `mastra_notifications` через `pStore.getStore('notifications')` с привязкой к `recipientId = "{organizationId}:{userId}"` и `topic`.
  - В каталог автономности агента включён нативный инструмент `createNotificationInboxTool` (`notification_inbox`: действия `list`, `dismiss`, `dismiss_all`).
  - В шапке `ThreadSwitcher` колокольчик `AgentNotificationsBell` (`GET /agent/notifications`, `POST /agent/notifications/:id/read`, `POST /agent/notifications/read-all`) показывает непрочитанные уведомления и переключает пользователя в нужный разговор.

### 2.11. Двусторонний Telegram-канал ассистента (`@mastra/core/channels` поверх единого `TelegramUpdatesService`)
- **Где в коде:** [`telegram-agent-channel.service.ts`](../../libraries/nestjs-libraries/src/chat/channels/telegram-agent-channel.service.ts), [`telegram.updates.service.ts`](../../libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts), [`telegram.update.parser.ts`](../../libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts), [`conductor.agent.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts).
- **Как работает:**
  - Используется **существующий единственный поллер** `TelegramUpdatesService` на `TELEGRAM_TOKEN` (с его PostgreSQL-лизом `telegramUpdateConsumerLease` и защитой от `409 Conflict`). Второй `getUpdates`-поллер никогда не запускается.
  - Личные сообщения (`chat.type === 'private'`) и нажатия инлайн-кнопок (`callback_query` с префиксом `cf_agent_`) от пользователей с привязанным Telegram (`EDITOR` / `ADMIN` / `SUPERADMIN`), не начинающиеся с `/support`, `/start` или `/connect`, маршрутизируются после коммита транзакции в `TelegramAgentChannelService`. Обращения `/support` и сообщения от непривязанных аккаунтов по-прежнему идут в `support-relay`.
  - Контекст канала передаётся в `conductor.stream(..., { channel: { type: 'telegram', threadId, messageId, senderId, isDM: true } })` и обрабатывается нативным `ChatChannelProcessor` (`@mastra/core/channels`); состояние блокировок и привязка треда хранятся в `MastraStateAdapter` поверх `pStore.getStore('memory')`.
  - Голосовые сообщения (`message.voice` / `message.audio`) транскрибируются через `MastraService.transcribeVoice`, а приостановленные карточки подтверждения (`tool-approval-request`) отправляются в Telegram с текстом `formatToolApproval` и инлайн-кнопками `✅ Подтвердить` / `❌ Отклонить`, которые возобновляют тот же `runId` с проверкой `verifyPendingAnswer` и `approvalContentFingerprint`.

---

## 3. Что адаптировано или переопределено поверх Mastra (НЕ потерять при обновлении)

Ниже перечислены **6 продуктовых доработок поверх нативного Mastra**. Каждая из них закрывает конкретную дыру в безопасности, учёте расходов или UX, которую «голый» фреймворк из коробки не решает. При обновлении `@mastra/*` необходимо проверить сохранность всех шести пунктов.

### 3.1. Замена встроенных `submit_plan` и `subagent` в `AgentController`
- **Где:** [`conductor.agent.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts) (`disableBuiltinTools: ['submit_plan', 'subagent']`) и [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts) (`buildConductorAutonomyTools`).
- **Что сделано:** В `AgentController` отключены встроенные `submit_plan` и `subagent`, а вместо них зарегистрированы наши одноимённые инструменты `createTool`.
- **Почему нельзя убирать:**
  1. Встроенный `subagent` в `AgentController` вызывает модель напрямую, минуя `AiUsageService.prepareModelExecution` (токены субагента не попадают в биллинг и квоту воркспейса) и не ограничивает каталог инструментов по роли пользователя (`EDITOR` / `USER`). Наша реализация мапит тип субагента (`research` / `writing` / `review`) на соответствующую роль ИИ и белый список разрешённых возможностей (`CONDUCTOR_SUBAGENT_CAPABILITY_IDS`).
  2. Встроенный `submit_plan` переключает внутренний режим сессии без сохранения структурированного плана в метаданные треда и без генерации `cardId` для карточки UI.

### 3.2. Трансформация карточек `transform` на встроенном `askUserTool` и `submitPlanTool`
- **Где:** [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts) (`createSuspendCardTransform`).
- **Что сделано:** На `askUserTool` и `submitPlanTool` навешивается `transform: { display, transcript }`, пропускающий `suspendPayload` через `questionCardView(suspendPayload, toolName)`.
- **Почему нельзя убирать:** Экран чата и защита от устаревших карточек требуют детерминированный `cardId` в части `data-tool-call-suspended`. Без этого `transform` встроенный `ask_user` в потоке `AgentController` не отправляет `cardId`, и UI не может сопоставить ответ пользователя с карточкой после перезагрузки страницы.

### 3.3. Единая нативная политика повторов и резервных моделей
- **Где:** [`ai.native-retries.ts`](../../libraries/nestjs-libraries/src/openai/ai.native-retries.ts), [`ai.clients.ts`](../../libraries/nestjs-libraries/src/openai/ai.clients.ts).
- **Как работает:** SDK и массив моделей имеют `maxRetries: 0`; повторы и задержки выполняет `StreamErrorRetryProcessor`. Для сквозного счётчика Mastra 1.78 адаптер хранит только смещение при смене модели. Отдельного цикла HTTP-повторов нет. Нативные клиенты используют `getMastraAiSdkProvider`, проверяющий и субагенты — ту же политику. Предварительный `Classifier` делает одну попытку без собственного резерва, чтобы его сбой не расходовал резервный бюджет основной задачи.
- **Границы:** временные ошибки повторяются с задержкой и учётом `Retry-After`. Ошибка авторизации, жёсткая квота, отказ согласия и Stop не запускают следующую попытку. Неизвестная стоимость прерванного вывода модели сохраняется в учёте; это не свидетельство выполненной записи. Неопределённый результат изменения данных отдельно блокируется квитанцией операции.
- **Лимиты OpenRouter:** адаптер различает постоянный отказ оплаты и временный резерв по структурированному `error.metadata.limit_source`. Только документированный `openrouter_in_flight_budget` преобразуется из HTTP402 в429 для нативного SDK; тело и `Retry-After` сохраняются, дополнительного цикла повторов нет. Формулировка сообщения о средствах не отменяет подтверждённый временный статус, а отказы авторизации, прав, согласия и Stop сохраняют приоритет. Постоянный402 приходит в интерфейс безопасным кодом `AI_PROVIDER_PAYMENT_REQUIRED` с предложением проверить баланс и лимит ключа. [Контракт провайдера](https://openrouter.ai/docs/api_reference/limits).

### 3.4. Верификация реальных артефактов в `goalJudge` (`CONDUCTOR_GOAL_JUDGE_PROMPT`)
- **Где:** [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts) (`CONDUCTOR_GOAL_JUDGE_PROMPT`, `buildGoalVerificationTools`, `buildConductorGoalConfig`).
- **Что сделано:** К нативному `DEFAULT_GOAL_JUDGE_PROMPT` добавлены правила проверки и переданы 10 read-only инструментов (`workspace.snapshot`, `piece.open`, `piece.read`, `plan.ahead` и др.).
- **Почему нельзя убирать:** Базовый судья целей в Mastra оценивает только текст ответа ассистента. Если модель галлюцинирует «Готово, я создал заготовку и поставил в план», базовый судья возвращает `done`. Наш судья обязан проверить наличие сохранённых записей в воркспейсе через read-only инструменты перед закрытием цели.

### 3.5. Доменный шлюз `DoorPolicyGate`, учёт `AiUsageService`, идемпотентные квитанции и `toModelOutput` в `mastra.adapter.ts`
- **Где:** [`mastra.adapter.ts`](../../libraries/nestjs-libraries/src/chat/capabilities/mastra.adapter.ts), [`capability.admission.ts`](../../libraries/nestjs-libraries/src/chat/capabilities/capability.admission.ts), [`agent-turn-lifecycle.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-turn-lifecycle.ts).
- **Что сделано:**
  - Каждый инструмент из единого реестра (`CAPABILITY_CATALOGUE`) проверяется в `hooks.beforeToolCall` и внутри `execute` через `DoorPolicyGate` (те же `@CheckPolicies`, что у контроллеров экранов).
  - Платные доменные инструменты (`research.search`, генерация текста/картинок) выходят из родительского контекста хода через `withoutActiveAiConfig`, чтобы открывать собственную операцию учёта в `AiUsageService`, а не поглощаться операцией `agent`.
  - Перед изменением данных сохраняются намерение операции и свидетельство в native Memory; первый вызов резервируется через нативное владение запуском. `agent-operation-receipts.ts` хранит фазы и результат в native threadState. Ошибка чтения или записи квитанции не считается отсутствием операции. Если результат изменения неизвестен, автоматическое повторение запрещено; подтверждённый результат возвращается без повторного действия.
  - Функция `compactModelOutput` в `toModelOutput` сжимает то, что уходит в промпт модели (до `6 000` символов для поиска и `12 000` для остальных инструментов), сохраняя полный результат в `ToolResultChunk.payload.result` для UI и БД.

### 3.6. Временная подстановка картинок (`ViewedPicturesProcessor`), чтение истории (`ConductorMemory`) и якорь `exa-key`
- **Где:** [`conductor.pictures.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.pictures.ts), [`conductor.memory.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.memory.ts), [`secret-shapes.ts`](../../libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts).
- **Что сделано:**
  - `ViewedPicturesProcessor` подставляет base64-картинки только в исходящий запрос к модели, не сохраняя мегабайты сырых изображений в `mastra_messages` и снапшотах.
  - `ConductorMemory` наследует `Memory` и добавляет инструмент `readConversationHistory` для постраничного чтения старых сообщений за пределами окна `32 000` токенов.
  - В `secret-shapes.ts` правило `exa-key` привязано к префиксу `${UUID}` перед ретроспективной проверкой `(?<=${KEY_WORDS}${NEAR}${UUID})`, чтобы `RegexFilterProcessor` обрабатывал большие схемы инструментов за миллисекунды, а не секунды.

---

### 3.7. Сохраняемые ожидания и отложенный ввод
- **Где:** [`native-model-availability.ts`](../../libraries/nestjs-libraries/src/chat/conductor/native-model-availability.ts), [`native-queued-input.ts`](../../libraries/nestjs-libraries/src/chat/conductor/native-queued-input.ts), [`mastra.service.ts`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts).
- **Зачем нужен адаптер:** Mastra 1.78 хранит обычную очередь Session в памяти процесса, а окончательно неудавшийся запуск удаляет свои терминальные чекпоинты. Простого включения `durable` недостаточно для этих двух сценариев.
- **Нативные механизмы:** `createWorkflow`, `sleepUntil`, сохраняемый input/чекпоинт, владение запуском и fencing, public Session stream options, наблюдение DurableAgent и штатное восстановление workflow. Собственных планировщика, опроса провайдера и цикла HTTP-повторов нет.
- **Граница задачи:** временная недоступность сохраняет логическое поручение и результаты инструментов, даже если внутренний runId меняется. Принятый отложенный ввод сохраняет исходные слова, автора и порядок. Stop и потеря доступа запрещают последующий вызов модели. Если между завершением действия и сохранением результата остаётся недоказанный промежуток, состояние остаётся неопределённым и действие не повторяется автоматически.
- **Учёт:** продолжение в живом процессе сохраняет родительскую операцию учёта; после аварии новый водитель открывает новый контекст с прежним действующим автором. Незакрытая до аварии строка не становится доказательством нулевой или полностью известной стоимости.

---

### 3.8. Сохранённые источники и выбор цитат

- Полный текст, уже возвращённый поисковым провайдером, хранится отдельно от короткого обзора для модели. Ограничение контекста не обрезает сохранённый источник и не выдаёт начало страницы за весь документ. `piece.read` читает диапазоны либо ищет буквальный фрагмент через `find`, возвращая полный доступный размер, ревизию и следующий offset. Чтение не покупает новый поиск.
- Источники загружаются из существующих хранилищ Intake/PieceService с проверкой организации, пользователя, снимка и, для существующей заготовки, её ID и наличия. Кэш по организации не подтверждает право чтения.
- Модель выбирает подтверждённые `factKeys` либо `passages` с точными `sourceUrl`, `revision`, `quote`. Сервер проверяет цитату в сохранённом источнике; существующая модель брифа оценивает достаточность для задания. Человеческое подтверждение фактов остаётся отдельным действием.
- Продолжение нативного Intake сохраняет его исходное задание, материал, ответы автора, ограничения и происхождение. Производные выборки используют существующую защиту одной записи исходного исследования. Недостаточность до начала записи позволяет исправить выбор; неизвестный результат записи требует сверки сохранённого результата. Нативный `toModelOutput` передаёт проверенные `canReviseInput` и краткие сведения для исправления выбора; модель получает их вместе с причиной отказа. Это разрешение относится к безопасному исправлению входных данных, а отказ в правах, необходимость человеческого согласия и неопределённый результат записи сохраняют свои ограничения. `research: none` описывает отсутствие нового поиска в данном вызове, а не доступность поисковых ключей вообще.

## 4. Какие функции Mastra сознательно выключены и почему

| Функция Mastra | Где выключена | Причина отключения | Условие для включения в будущем |
| :--- | :--- | :--- | :--- |
| **`semanticRecall`** | `conductor.memory.ts` (`semanticRecall: false`) | Требует векторного индекса (`pgvector`) в БД Mastra и отдельного платного embedding-вызова на каждое сообщение чата (многие провайдеры воркспейсов не предоставляют embeddings). | Включать только как опциональную функцию для воркспейсов с настроенным embedding-провайдером и учётом в `AiUsageService`. |
| **`observationalMemory`** | `conductor.memory.ts` (`observationalMemory: false`) | Запускает фоновые LLM-вызовы после каждого хода мимо бюджета хода и несёт риск записи чужого текста из источников в постоянную память агента. | Заменено строгой `workingMemory` со схемой `personPreferencesSchema`. |
| **`generateTitle`** | `conductor.memory.ts` (`generateTitle: false`) | Делает фоновый нетарифицируемый вызов модели на первый ход треда (ADR-0012 §7). | Заголовок строится детерминированно через `threadTitleFromMessage`; при необходимости можно вызывать роль `classify` внутри `AiUsageService`. |
| **`SystemPromptScrubber`** | `conductor.secrets.ts` | В `@mastra/core` `1.71+` вызывает отдельную модель-детектор на каждый выходной ответ, увеличивая задержку и расход токенов. | Оставлены детерминированные `UnicodeNormalizer` и `RegexFilterProcessor`. |
| **`@mastra/server` / `@mastra/nestjs`** | Не подключены | Публикуют внутренние маршруты Mastra (включая прямой вызов инструментов) мимо аутентификации NestJS, `PoliciesGuard` и `AiUsageService`. | Внешним входом остаётся только наш `AgentController` (`apps/backend/src/api/routes/agent.controller.ts`) и `/mcp`. |
| **`@mastra/mcp` `2.x`** | В `package.json` закреплён `1.18.0` | Ветка `2.x` поддерживает только новый протокол MCP `2026-07-28`, который ещё не поддерживается частью внешних клиентов; `1.18.0` совместим с `@mastra/core` `1.78.0`. | Обновлять после перехода внешних MCP-клиентов на новый протокол. |

---

## 5. Чек-лист при следующем обновлении `@mastra/*`

Перед обновлением любого пакета `@mastra/*` в будущих релизах:

1. **Проверить SQL-дерево схемы `@mastra/pg`:**
   - Запустить `tests/mastra-upgrade.execution.test.cjs` и убедиться, что `exportSchemas()` не содержит `DROP`/`TRUNCATE` и что [`deploy/production/upgrade-mastra-storage.sh`](../../deploy/production/upgrade-mastra-storage.sh) идемпотентно приводит схему к новому отпечатку.
2. **Проверить сохранность продуктовых адаптеров (раздел 3):**
   - `disableBuiltinTools: ['submit_plan', 'subagent']` в `buildConductorController`;
   - `transform` на `askUserTool` и `submitPlanTool`;
   - единый владелец повторов `StreamErrorRetryProcessor`, смещение его счётчика между моделями и обработка `AbortError`;
   - `CONDUCTOR_GOAL_JUDGE_PROMPT` и read-only инструменты верификации цели;
   - `DoorPolicyGate`, `AiUsageService`, идемпотентные квитанции `readCommittedToolReceipt` и `compactModelOutput`;
   - `ViewedPicturesProcessor`, `readConversationHistory` и скорость `secret-shapes.ts`;
   - регистрацию нативных skill/ask/task-инструментов и продолжение потока Session через приостановки;
   - нативные workflow ожидания моделей и отложенного ввода, проверку прав при восстановлении и общий Redis replay.
3. **Прогнать целевой набор тестов нативной обвязки:**
   ```bash
   pnpm exec jest \
     tests/mastra-upgrade.execution.test.cjs \
     tests/agent.model-autonomy.test.cjs \
     tests/agent-durable-recovery.test.cjs \
     tests/agent-native-autonomy.test.cjs \
     tests/agent-native-retry-routing.test.cjs \
     tests/agent-native-conversation-flow.test.cjs \
     tests/agent-native-acceptance-matrix.test.cjs \
     tests/agent-native-session-http.test.cjs \
     tests/agent-native-session-observe.test.cjs \
     tests/mastra-native-stream-fanout.test.cjs \
     tests/agent-native-session-cold.test.cjs \
     tests/agent-native-provider-postgres.test.cjs \
     tests/agent-native-session-queued.test.cjs \
     tests/native-queued-input.test.cjs \
     tests/agent-operation-receipts.test.cjs \
     tests/agent-native-model-availability.test.cjs \
     tests/agent-mastra-service-native-integration.test.cjs \
     tests/agent-voice-dictation.test.cjs \
     tests/agent-thread-fork.test.cjs \
     tests/agent-brand-voice-scorer.test.cjs \
     tests/agent-background-notifications.test.cjs \
     tests/agent-telegram-channel.test.cjs \
     tests/secret-shapes.test.cjs \
     tests/agent-scenarios.test.cjs \
     --runInBand
   ```
