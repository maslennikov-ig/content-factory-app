# Нативная интеграция Mastra 1.78 и реестр продуктовых доработок

- **Статус:** `current`
- **Последняя проверка:** `2026-10-20`
- **Связанные документы:** [ADR-0012](../adr/0012-agent-harness.md), [Спецификация агентной обвязки](../product/agent-harness-spec.md), [План нативного перехода 19.10.2026](../superpowers/plans/2026-10-19-native-mastra-harness.md), [Развёртывание на сервере](../operations/production-deploy.md)

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
| `@mastra/ai-sdk` | `1.11.1` | Потоковый мост `handleChatStream` (`v7`) между Mastra и AI SDK UI (`useChat`) |
| `@mastra/observability` | `1.7.0` | Спаны и агрегация трейсов (`querySpans`, `aggregateTraces`, `listTraces`) |
| `@mastra/mcp` | `1.18.0` | Протокол MCP для внешних клиентов на маршруте `/mcp` (оставлен `1.18.0` ради совместимости с клиентами до протокола `2026-07-28`) |

Хранилище Mastra изолировано в отдельной базе PostgreSQL (роль `cf_mastra_app`, без прав в продуктовой БД `cf_product_app`). Обновление схемы Mastra выполняется только через [`deploy/production/upgrade-mastra-storage.sh`](../../deploy/production/upgrade-mastra-storage.sh) и проверяется [`scripts/operations/check-postgres-role-isolation.sh`](../../scripts/operations/check-postgres-role-isolation.sh).

---

## 2. Что работает нативно из Mastra 1.78

Ниже перечислены подсистемы, которые работают напрямую через публичные API Mastra:

### 2.1. Хост `Mastra`, `AgentController` и изолированные `Session`
- **Где в коде:** [`MastraService.mastra()`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts), [`buildConductorController()`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts), [`AgentThreadsService`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts).
- **Как работает:**
  - Единый экземпляр `new Mastra({ storage: pStore, agents, agentControllers, schedules, logger })` владеет хранилищем, расписаниями и восстановлением запусков.
  - На каждую пару `(resourceId = "{organizationId}:{userId}", threadId)` создаётся изолированная сессия `controller.createSession({ resourceId, ownerId, id, scope: threadId, createInitialThread: false, forked: false })`.
  - В `AgentController` настроены два режима: `assistant` (по умолчанию) и `plan` (`transitionsTo: 'assistant'`).
  - На агенте заданы нативные `requestContextSchema` (`conductorContextSchema`) и `scopes` (`conductorScopes` от серверного `identity` и `threadId`).

### 2.2. Нативное фоновое исполнение (`durable`), сигналы и переподключение
- **Где в коде:** [`buildConductorAgent()`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts), [`AgentThreadsService`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts), [`AgentController` HTTP-маршруты](../../apps/backend/src/api/routes/agent.controller.ts).
- **Как работает:**
  - Агент создаётся с `durable: { cleanupTimeoutMs: 250 }`; при регистрации в `Mastra` он оборачивается в нативный `DurableAgent` (`isDurableAgent(agent) === true`).
  - Чекпоинты и владение запуском сохраняются в таблицах `mastra_workflow_snapshot`, `mastra_memory_run_fences` и `mastra_workflow_run_owners`.
  - Разрыв браузерного соединения отсоединяет только HTTP-наблюдателя; сам ход продолжает выполняться. Повторное подключение к активному ходу идёт через `GET /agent/threads/:id/stream`.
  - Сигналы управления на лету (`steer`, `followUp`) отправляются через `POST /agent/threads/:id/signals`, а явная остановка пользователем — через `POST /agent/threads/:id/stop`.
  - При старте бэкенда `MastraService.onApplicationBootstrap()` вызывает `recoverDurableRuns()` (`listActiveRuns` / `recoverActiveRuns`).

### 2.3. Память (`@mastra/memory`)
- **Где в коде:** [`conductor.memory.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.memory.ts).
- **Как работает:**
  - `messageHistory: { maxTokens: 32_000 }` — нативное ограничение окна истории по токенам.
  - `workingMemory: { enabled: true, scope: 'resource', schema: personPreferencesSchema }` — предпочтения пользователя (длина ответа, обычный канал/аватар, до 5 коротких заметок), общие для всех чатов этого человека в организации.

### 2.4. Конвейер процессоров (`inputProcessors`, `outputProcessors`, `errorProcessors`)
- **Где в коде:** [`conductor.agent.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts), [`conductor.secrets.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.secrets.ts).
- **Как работает:**
  - `UnicodeNormalizer` и `RegexFilterProcessor` (вход и выход) — редактирование ключей и секретов по правилам [`secret-shapes.ts`](../../libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts).
  - `ModelSelectionProcessor` — нативный выбор между быстрой моделью (`classify`) и основной (`agent`) при `minProbability: 0.85`.
  - `TaskStateProcessor` — нативная подстановка состояния чек-листа задач в промпт шага.
  - `ToolSearchProcessor` (`storage: 'context'`) — нативный поиск по каталогу инструментов с фильтрацией по роли пользователя.
  - `ToolCallFilter({ filterAfterToolSteps: 6, preserveModelOutput: true })` и `TokenLimiterProcessor({ limit: 48_000, strategy: 'truncate', trimMode: 'best-fit' })` — защита от переполнения контекста на многошаговых вызовах без изменения сохранённой истории в БД.
  - `UnsupportedFileHandler` и `StreamErrorRetryProcessor` в `errorProcessors`.

### 2.5. Цепочка моделей `ModelWithRetries[]`
- **Где в коде:** [`ai.clients.ts`](../../libraries/nestjs-libraries/src/openai/ai.clients.ts), [`mastra.service.ts`](../../libraries/nestjs-libraries/src/chat/mastra.service.ts).
- **Как работает:**
  - `getMastraAgentModelEntries(organizationId, role)` возвращает нативный массив `ModelWithRetries[]` (основная модель роли + до 3 резервных моделей из настроек воркспейса с бюджетом `maxRetries`).

### 2.6. Инструменты автономности, цели (`goal`), навыки (`skills`), расписания (`schedules`) и наблюдаемость
- **Где в коде:** [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts), [`conductor.skills.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.skills.ts), [`agent-threads.service.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts).
- **Как работает:**
  - Нативные инструменты `askUserTool` (`ask_user`), `taskWriteTool` (`task_write`), `taskUpdateTool` (`task_update`), `taskCompleteTool` (`task_complete`), `taskCheckTool` (`task_check`).
  - Нативный стор целей (`writeObjective`, `readObjective`, `clearObjective`, `resolveGoalStore`) и конфигурация `goal` на агенте.
  - Нативные `createSkill` (`CONDUCTOR_SKILLS`) для разделов продукта («Аватар», «Каналы», «Контент», «План», «Помощь»).
  - Нативные расписания `defineSchedule` / `mastra.schedules` для регулярных follow-up проверок по треду.
  - Нативные запросы наблюдаемости (`querySpans`, `aggregateTraces`, `listTraces`) на маршруте `GET /agent/threads/:id/observability`.

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

### 3.3. По-модельный счётчик ретраев и защита от ретрая `AbortError` в `createConductorStreamErrorRetryProcessor`
- **Где:** [`conductor.agent.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.agent.ts).
- **Что сделано:** Нативный `StreamErrorRetryProcessor` обёрнут в `createConductorStreamErrorRetryProcessor`.
- **Почему нельзя убирать:**
  1. Нативный процессор считает `retryCount` сквозным образом по шагу, а не отдельно для каждой модели в `ModelWithRetries[]`. Обёртка ведёт счётчик попыток на текущую модель (`maxRetriesForModel`) и сбрасывает его при переходе к следующей резервной модели.
  2. Обёртка проверяет `abortSignal?.aborted`, `currentAiExecutionSignal()?.aborted` и `executionBudgetStop`, чтобы нажатие пользователем кнопки «Стоп» или исчерпание бюджета времени никогда не запускало повторный вызов модели или переключение на fallback.

### 3.4. Верификация реальных артефактов в `goalJudge` (`CONDUCTOR_GOAL_JUDGE_PROMPT`)
- **Где:** [`conductor.autonomy.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.autonomy.ts) (`CONDUCTOR_GOAL_JUDGE_PROMPT`, `buildGoalVerificationTools`, `buildConductorGoalConfig`).
- **Что сделано:** К нативному `DEFAULT_GOAL_JUDGE_PROMPT` добавлены правила проверки и переданы 10 read-only инструментов (`workspace.snapshot`, `piece.open`, `piece.read`, `plan.ahead` и др.).
- **Почему нельзя убирать:** Базовый судья целей в Mastra оценивает только текст ответа ассистента. Если модель галлюцинирует «Готово, я создал заготовку и поставил в план», базовый судья возвращает `done`. Наш судья обязан проверить наличие сохранённых записей в воркспейсе через read-only инструменты перед закрытием цели.

### 3.5. Доменный шлюз `DoorPolicyGate`, учёт `AiUsageService`, идемпотентные квитанции и `toModelOutput` в `mastra.adapter.ts`
- **Где:** [`mastra.adapter.ts`](../../libraries/nestjs-libraries/src/chat/capabilities/mastra.adapter.ts), [`capability.admission.ts`](../../libraries/nestjs-libraries/src/chat/capabilities/capability.admission.ts), [`agent-turn-lifecycle.ts`](../../libraries/nestjs-libraries/src/chat/conductor/agent-turn-lifecycle.ts).
- **Что сделано:**
  - Каждый инструмент из единого реестра (`CAPABILITY_CATALOGUE`) проверяется в `hooks.beforeToolCall` и внутри `execute` через `DoorPolicyGate` (те же `@CheckPolicies`, что у контроллеров экранов).
  - Платные доменные инструменты (`research.search`, генерация текста/картинок) выходят из родительского контекста хода через `withoutActiveAiConfig`, чтобы открывать собственную операцию учёта в `AiUsageService`, а не поглощаться операцией `agent`.
  - Перед мутирующим вызовом проверяется идемпотентная квитанция `readCommittedToolReceipt` / `recordCommittedToolReceipt` (ключ `assistantReceipt:<runId>:<toolName>:<toolCallId>`), чтобы при `durable`-восстановлении после рестарта не создать дубликат черновика или поста.
  - Функция `compactModelOutput` в `toModelOutput` сжимает то, что уходит в промпт модели (до `6 000` символов для поиска и `12 000` для остальных инструментов), сохраняя полный результат в `ToolResultChunk.payload.result` для UI и БД.

### 3.6. Временная подстановка картинок (`ViewedPicturesProcessor`), чтение истории (`ConductorMemory`) и якорь `exa-key`
- **Где:** [`conductor.pictures.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.pictures.ts), [`conductor.memory.ts`](../../libraries/nestjs-libraries/src/chat/conductor/conductor.memory.ts), [`secret-shapes.ts`](../../libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts).
- **Что сделано:**
  - `ViewedPicturesProcessor` подставляет base64-картинки только в исходящий запрос к модели, не сохраняя мегабайты сырых изображений в `mastra_messages` и снапшотах.
  - `ConductorMemory` наследует `Memory` и добавляет инструмент `readConversationHistory` для постраничного чтения старых сообщений за пределами окна `32 000` токенов.
  - В `secret-shapes.ts` правило `exa-key` привязано к префиксу `${UUID}` перед ретроспективной проверкой `(?<=${KEY_WORDS}${NEAR}${UUID})`, чтобы `RegexFilterProcessor` обрабатывал большие схемы инструментов за миллисекунды, а не секунды.

---

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
   - Запустить `tests/agent-native-sessions.test.cjs` и убедиться, что `exportSchemas()` не содержит `DROP`/`TRUNCATE` и что [`deploy/production/upgrade-mastra-storage.sh`](../../deploy/production/upgrade-mastra-storage.sh) идемпотентно приводит схему к новому отпечатку.
2. **Проверить сохранность 6 продуктовых доработок (раздел 3):**
   - `disableBuiltinTools: ['submit_plan', 'subagent']` в `buildConductorController`;
   - `transform` на `askUserTool` и `submitPlanTool`;
   - по-модельный счётчик ретраев и обработка `AbortError` в `createConductorStreamErrorRetryProcessor`;
   - `CONDUCTOR_GOAL_JUDGE_PROMPT` и read-only инструменты верификации цели;
   - `DoorPolicyGate`, `AiUsageService`, идемпотентные квитанции `readCommittedToolReceipt` и `compactModelOutput`;
   - `ViewedPicturesProcessor`, `readConversationHistory` и скорость `secret-shapes.ts`.
3. **Прогнать целевой набор тестов нативной обвязки:**
   ```bash
   pnpm exec jest \
     tests/agent-native-sessions.test.cjs \
     tests/agent-compact-evidence.test.cjs \
     tests/agent-durable-recovery.test.cjs \
     tests/agent-native-autonomy.test.cjs \
     tests/agent-native-model-routing.test.cjs \
     tests/agent-native-ui-controls.test.cjs \
     tests/agent-native-acceptance-matrix.test.cjs \
     tests/agent-voice-dictation.test.cjs \
     tests/agent-thread-fork.test.cjs \
     tests/agent-brand-voice-scorer.test.cjs \
     tests/agent-background-notifications.test.cjs \
     tests/agent-telegram-channel.test.cjs \
     tests/secret-shapes.test.cjs \
     tests/agent-scenarios.test.cjs \
     --runInBand
   ```
