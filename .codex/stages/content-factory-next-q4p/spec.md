# Спецификация ремонта Cloud-first SaaS review

## Результат

Закрыть 18 замечаний независимого read-only review поверх уже принятого
Cloud-first SaaS среза. Подтверждённые свойства среза сохраняются: tenant-
isolated AI без mode fallback, строгий telemetry DTO, совместимая регистрация,
additive schema и воспроизводимый receipt.

## Наблюдаемое поведение

- Приглашённый участник с `/?org=<jwt>` сначала проходит join-org: с сессией
  возвращается на `/?added=true`, без сессии попадает на `/auth?org=…`.
- Пользователь с сессией на `/` попадает в рабочее приложение. На каждой
  публичной странице доступен отдельный вход рядом с основным demo-действием.
- Public `LOCAL` registration и forgot ограничиваются по caller; approval-mode
  signup распознаёт `{ approval: true }` в body даже без exposed header.
- Первый публичный registrant пустой базы не получает `SUPERADMIN`. Оператор
  создаёт bootstrap account до открытия public traffic по runbook.
- Included AI использует ровно выбранный credential mode. Usage admission
  завершается после реального provider execution, а не при создании model
  object. Quota-текст не обещает несуществующее автоматическое пополнение.
- Concurrent daily aggregate conflict не маскируется как event duplicate и не
  теряет trusted registration event.
- Public growth throttle имеет краткоживущее per-client измерение и warning при
  исчерпании. Raw trusted growth и AI usage получают 90-дневное удаление.

## Записанные решения

### R6 — семантика quota

`AiUsageRecord` и included quota считаются на уровне допуска попытки продуктовой
AI-операции. Failed, оставшиеся `admitted` после сбоя и другие незавершённые
попытки также расходуют allowance. Одна операция может сделать несколько
provider calls и retries; текущий ledger не является строгим spend cap.
PRODUCT и SaaS spec формулируют это прямо. Per-provider-call accounting, sizing
и reconciliation остаются в открытом `content-factory-next-saas.5` и не
поглощаются этим ремонтом.

### R8 — минимальный пароль

Новые регистрации с `provider === 'LOCAL'` требуют минимум 12 символов.
Правило применяется только к create DTO: существующие password hashes и login
не проходят повторную проверку, поэтому действующие пароли не инвалидируются.
OAuth и другие providers не получают фиктивное password-требование.

### R12 — per-client throttle без persistent identity

Tracker — HMAC нормализованного адреса соединения с process-random key и
коротким временным bucket. Raw IP, User-Agent, cookie и persistent visitor id
не записываются; throttle storage видит только краткоживущий digest. Ключ не
пишется на диск. Это ограничивает одного caller в пределах экземпляра и окна,
но не является распределённым abuse budget; такой budget остаётся в `.5`.

### R16 — retention и владелец удаления

Trusted growth events и AI usage records хранятся 90 дней. Удаление выполняет
оператор ежедневным repository-owned dry-run/apply процессом; никакой apply в
этой стадии не выполняется. Обезличенные daily aggregates не содержат
organization-derived identifiers и не входят в raw retention. Trusted dedupe
использует keyed digest, а не обычный hash известного organization id.

## Не цели и границы

- Не закрывать и не переопределять `content-factory-next-saas.2/.4/.5/.6` и
  `content-factory-next-or3.2/.5/.7/.8/.9`.
- Не публиковать цену, free tier, trial/card policy, provider, region, legal
  entity, SLA или certification.
- Не изменять четыре защищённых landing-agent файла.
- Не выполнять merge, push, PR, deploy, production/live DB mutation,
  `prisma db push`, credential wiring, paid calls, live OAuth, publish или mail.
- Schema changes только additive; SQL — только offline `prisma migrate diff`.

## Recovery

Откатить только локальные repair-коммиты этой стадии в обратном порядке.
Production и deployed database не изменяются; старый acceptance receipt не
редактируется и не backdate-ится.
