# План: собственный сбор ошибок

## Решение за владельца

Сборщик — GlitchTip 6 в отдельном observability-стеке на отдельной небольшой Linux-машине, со своей PostgreSQL. Он не добавляется в `deploy/production/docker-compose.yaml`, не использует product PostgreSQL/Redis и не становится зависимостью старта приложения. Текущий production-host общий и уже имеет лимиты 1792+512+192+768 MiB; даже лёгкий сборщик уменьшил бы запас и связал отказ диагностики с продуктом.

Срок хранения ошибок и файлов — 30 дней. Это совпадает с текущим месячным окном admin stats и стандартным hot-window GlitchTip, но втрое короче его общего default 90 дней. При 14 днях теряется месячный контекст, при 90 — примерно втрое растут steady-state disk и окно воздействия. Срок меняется одной переменной и не требует изменения приложения.

Минимальный стек: GlitchTip `6.2.6` all-in-one и PostgreSQL 18, без Valkey, logs, uptime, MCP и DuckDB/cold storage. Web получает потолок памяти и restart policy; PostgreSQL имеет отдельный persistent volume и не публикует порт. Домен, DSN и секреты остаются placeholders до отдельного разрешённого deploy.

## Сопоставление с референсами

- Официальный GlitchTip Compose — PostgreSQL 14+, 512 MB recommended, all-in-one допускает 256 MB; Valkey опционален. Это соответствует выбранному малому отдельному host.
- Официальный self-hosted Sentry требует минимум 4 GB и рекомендует значительно больше; на имеющемся узле это весь запас без безопасного резерва.
- Официальный GlitchTip default retention 90 дней, event hot-window 30. Выбранные 30 дней сохраняют месячный разбор и ограничивают диск/данные.
- GlitchTip документирует Sentry-compatible Node/Next SDK, но sessions не поддерживает. Поэтому session tracking, replay, tracing, profiling и source-map upload здесь выключены.

Источники и точные версии записаны в `design-evidence.md`.

## Приватность и отказоустойчивость

- Используются `@sentry/nestjs` и `@sentry/nextjs` 10.70.0: версия выше исправления 10.27.0 для sensitive HTTP headers.
- SDK включается только при заданном DSN. Отсутствие/ошибка collector не влияет на startup или пользовательский запрос.
- `beforeSend` строит новый минимальный event по allowlist: opaque event id,
  time, level, environment, release, service, один из фиксированных generic
  exception types и только числовые координаты stack frames. Имена функций и
  модулей, исходный message/value, request, URL/query, headers/cookies/body,
  user, breadcrumbs, logs, extra, arbitrary contexts/tags и attachments
  отбрасываются.
- Если sanitizer не может доказать безопасный результат, событие отбрасывается. Исходный event никогда не возвращается при ошибке очистки.
- Нет console integration, OpenAI/LangChain/Vercel AI integrations, inputs/outputs, replay, profiling, tracing, logs, feedback и source-map upload.
- Browser SDK не включён: прямой запрос раскрыл бы collector и reverse proxy
  IP и User-Agent пользователя независимо от очистки payload. Сбор ограничен
  backend, orchestrator и Next server/edge; безопасный first-party relay
  отложен в `content-factory-next-ry5.10`.

## Красно-зелёные потоки

### SDK и privacy

- RED: безопасный payload, отсутствие DSN, backend/orchestrator/Next server
  entrypoints, запрещённые integrations, отсутствие browser sink и
  supply-chain guard.
- GREEN: sanitizer, server initializers и минимальные entrypoints.
- Focused: `TMPDIR=/tmp pnpm exec jest tests/error-collection.privacy.test.cjs tests/external-services.purge.test.cjs --runInBand --coverage=false`.

### Collector deployment

- RED: отдельный compose, exact images, private DB, placeholders, 30-day retention, disabled optional collectors, no dependency from product compose.
- GREEN: `deploy/error-collector/compose.yaml`, env template и operator runbook.
- Focused: `TMPDIR=/tmp pnpm exec jest tests/error-collector.compose.test.cjs --runInBand --coverage=false` и `docker compose ... config` только локально.

## Приёмка и границы

Root объединяет потоки, запускает один focused set, независимый security/correctness review, затем полные task gates на Node 22.23.2 с `TMPDIR=/tmp`: `pnpm test`, `pnpm run build`, brand scan, process verification и `git diff --check`.

Не входят: live collector, домен/TLS/DNS, создание GlitchTip admin/project/DSN, source-map upload, уведомления, production/server/DB доступ, deploy, push, merge. Существующая Prisma `Errors` — ledger ошибок публикации с post content/PII; она не переносится и не меняется в этой задаче.
