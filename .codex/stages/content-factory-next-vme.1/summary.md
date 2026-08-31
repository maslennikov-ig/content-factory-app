# Итог стадии content-factory-next-vme.1

Первая стадия оставшейся программы собрана как один локальный срез. Источник
результата общих release-команд — `acceptance-receipt.json`; точечные
RED→GREEN-доказательства каждого потока находятся в `artifacts/`.

## Принятая граница

- Старые `AiUsageRecord` в `admitted` перестают занимать включённую квоту после
  24 часов. Завершённые попытки продолжают учитываться. Вложенный путь
  Copilot/agent сохраняет одну внешнюю операцию `agent` без второго списания.
- Юридический contract guard требует полную матрицу 3 × 16 и одинаковый
  абзацный каркас. Новый отдельный абзац на непрочитанном языке теперь видим,
  при этом прежние три слоя и allowlist не ослаблены.
- Из продуктовой спецификации снят только уже решённый gate subprocessors;
  юридическое лицо и договорные условия остаются открытыми решениями.
- Личное неслужебное сообщение существующему Telegram-боту атомарно создаёт
  payload-free outbox рядом с receipt. Единый `getUpdates` consumer затем
  пересылает его владельцу вне транзакции с at-least-once retry, справедливой
  ротацией и семидневной очисткой только доставленных метаданных.
- Все 48 юридических файлов ведут в
  `@content_factory_adtbot`; несуществующий `privacy@aidevteam.ru` удалён.
  Удаление аккаунта начинается сообщением боту с email аккаунта и может
  потребовать дополнительного подтверждения личности.
- Prisma-изменение добавляющее: офлайн `migrate diff` совпадает с migration SQL,
  guard принял ровно два оператора для `TelegramSupportRelayOutbox`. Боевая база
  и живой бот не вызывались.

## Проверка

- Точечная корневая проверка на Node 22.23.2 / pnpm 10.6.1: 3 набора,
  178/178 тестов.
- `docs:check`: 79 файлов; Prisma validate и generate — успешно.
- Полная release-приёмка выполняется единожды через
  `scripts/orchestration/run_stage_closeout.py`; её точные команды, счётчики и
  состояние дерева записывает `acceptance-receipt.json`.

## Остаточные границы

- Production migration, `TELEGRAM_SUPPORT_OWNER_CHAT_ID`, deployment и проверка
  живого бота остаются отдельными действиями владельца.
- `forwardMessage` не гарантирует доставку protected content и части служебных
  сообщений; такие payload-free записи остаются pending и требуют оператора.
  At-least-once окно между Telegram и отметкой БД допускает дубликат.
- Машинный каркас не понимает смысл переформулированного существующего абзаца;
  процедура человеческой юридической проверки переводов записана отдельно и
  остаётся обязательной.
- Pricing/trial, провайдер и регион данных, юридическая модель, платные вызовы,
  deploy и остальные решения владельца из эпика не поглощены этой стадией.

docs-reviewed: updated - обновлены legal-тексты, product spec, конфигурация и runtime-runbook Telegram relay; добавлена процедура проверки юридических переводов и стабильная навигация.

project-index: updated - добавлены стабильные точки входа для Telegram support outbox, AI admission и legal translation guard.

graph-reviewed: updated - локальный Graphify пересобран без LLM/API (10746 nodes, 22678 edges); focused query подтвердил путь pollOnce → deliverPendingSupportMessages и новую migration table.

documentation-decision: Telegram Bot API 10.2 и установленный node-telegram-bot-api 0.66.0 проверены до реализации; операторские ограничения forwardMessage и единственного getUpdates consumer записаны в runbook.
