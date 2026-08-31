---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.1/stage-manifest.json
stream_owner: telegram_relay_worker
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: TelegramUpdatesService shared getUpdates consumer
public_facade: existing Telegram bot update stream and getConnection contract
bounded_acceptance: private non-connect messages are atomically queued with their receipt and forwarded outside the transaction with durable at-least-once retry, without storing payloads or relaying non-private surfaces
non_goals:
  - production configuration, deployment, credentials, or live bot calls
  - a second Telegram getUpdates consumer
  - recovery of protected or service-message content Telegram refuses to forward
evidence:
  - focused-red-green
  - transactional-rollback-double
  - offline-prisma-migrate-diff
  - additive-sql-guard
task_id: content-factory-next-vme.1.telegram-relay
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.1
milestone: durable Telegram support relay
milestone_status: accepted
agent_type: backend_developer
subagent_model: role_default
reasoning_effort: role_default
model_reasoning_rationale: inherited backend specialist role
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 689491a3
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts
  - libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/prisma/migrations/**
  - tests/telegram.update.consumer.test.cjs
  - .env.example
  - deploy/production/app.env.example
  - docs/operations/configuration.md
  - docs/operations/runtime.md
  - .codex/stages/content-factory-next-vme.1/artifacts/telegram-relay.md
success_criteria:
  - receipt and payload-free relay intent share one lease-fenced transaction
  - valid connect and non-private Telegram surfaces preserve existing behavior
  - delivery is outside the transaction, retried without a terminal attempt limit, and successful only after forwardMessage
  - missing owner configuration preserves queued messages and consumer progress with an operator warning
  - failed messages rotate and cannot starve fresh pending messages
  - pending messages are never age-pruned; delivered relay metadata expires with receipt retention
selected_docs:
  - AGENTS.md
  - local node-telegram-bot-api 0.66.0 types
  - Telegram Bot API 10.2 first-party contracts supplied by root
selected_skills:
  - superpowers:using-superpowers
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:receiving-code-review
  - superpowers:verification-before-completion
selected_assets:
  - node-telegram-bot-api@0.66.0
selected_agents:
  - telegram-relay-worker
catalog_candidates: []
parallel_group: backend-streams
depends_on_streams: []
parallel_decision: delegated by root with isolated backend write zone
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: temporary offline-diff directories were deleted; no process, database, credential, network, or live Telegram resource was created
risk_level: high
verification_tier: inner_loop
risk_tags:
  - migration
  - concurrency
  - idempotency
  - retry
  - external-api
affected_surfaces:
  - database
  - backend
  - operator-configuration
invariants:
  - state-transition
  - idempotency
  - rollback
  - shared-consumer-ownership
docs_impact: operator configuration and runtime diagnostics
docs_reviewed: updated
docs_review_notes: configuration and runtime document queueing, missing config, at-least-once duplicates, fair retry, retention, and protected/service-message limitations
verification:
  - Initial RED had 3 expected failures for private queueing, delivery retry/success, and missing owner configuration.
  - Conflict RED showed outbox P2002 was misclassified; GREEN restricts duplicate handling to TelegramUpdateReceipt.
  - Review RED showed fresh relay starvation behind 51 permanent failures and absent delivered-row pruning; both focused cases are GREEN.
  - Focused Jest final acceptance passed: 1 suite, 35/35 tests.
  - Prisma schema validate and Prisma client generate passed on the final schema.
  - Offline prisma migrate diff from HEAD schema produced only TelegramSupportRelayOutbox CREATE TABLE and matching three-column CREATE INDEX.
  - SQL apply guard passed for 2 statements with exact allow-table TelegramSupportRelayOutbox.
  - Owned-path git diff --check passed.
  - Library typecheck reaches two pre-existing Mastodon errors outside this stream; no Telegram relay error was reported.
changed_files:
  - libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts
  - libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/prisma/migrations/20260820120000_add_telegram_support_relay_outbox/migration.sql
  - tests/telegram.update.consumer.test.cjs
  - .env.example
  - deploy/production/app.env.example
  - docs/operations/configuration.md
  - docs/operations/runtime.md
  - .codex/stages/content-factory-next-vme.1/artifacts/telegram-relay.md
explicit_defers:
  - root-owned production migration application, owner chat configuration, deployment, and live-bot verification
  - protected content and service messages remain queued when Telegram refuses forwardMessage; resolving them requires operator handling because their payload is intentionally not persisted
  - full library typecheck remains blocked by pre-existing Mastodon errors outside this write zone
---

# Summary

Личные Telegram-сообщения, кроме валидного `/connect`, теперь создают
`TelegramSupportRelayOutbox` в той же lease-fenced Prisma-транзакции, что и
`TelegramUpdateReceipt`. В строке нет текста, caption, file id или вложения —
только update/chat/message ids и состояние попыток.

После commit единый consumer вызывает `forwardMessage`. Ошибка не откатывает
cursor и не удаляет очередь; следующая попытка повторяет доставку. Записи без
попыток выбираются первыми, затем ранее ошибавшиеся — по старейшему
`lastAttemptAt`, поэтому permanently unforwardable запись не блокирует новые.
После успеха метаданные живут 7 дней, pending по возрасту не удаляются.

# Backend Path / Failure Semantics

`getUpdates` → `parseTelegramUpdate` → `processLeasedUpdate` → transaction
(`fenceLease`, receipt, outbox) → commit → `deliverPendingSupportMessages` →
Telegram `forwardMessage` → conditional `deliveredAt` update.

Valid `/connect`, group, supergroup, discussion and channel updates do not enter
the relay. Without `TELEGRAM_SUPPORT_OWNER_CHAT_ID` the queue and normal
consumer remain active and one explicit warning is emitted per service
configuration interval. A crash after Telegram accepts the forward but before
the database mark can duplicate delivery; this is the declared at-least-once
contract.

# Verification

Focused tests cover private queue-once without payload, exclusions, failed
delivery then success, missing configuration with consumer progress, P2002
model disambiguation, transaction rollback, fair selection beyond batch size,
and delivered-only pruning. Prisma SQL was generated offline; no datasource,
production environment, credential, or live bot was contacted.

# Risks / Follow-ups

Telegram documents that protected content and some service messages cannot be
forwarded. Such a row remains pending and rotates rather than starving later
messages. Because payload persistence is forbidden, the application cannot
reconstruct that content locally; operators must use the logged update id and
stored source ids for manual handling.

`forwardMessage` has no idempotency key. A crash in the external-call/DB-mark
gap can create a duplicate at the owner chat. Eliminating that gap would need a
different external delivery contract and is not claimed here.
