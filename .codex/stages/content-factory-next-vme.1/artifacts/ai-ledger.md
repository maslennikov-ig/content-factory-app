---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.1/stage-manifest.json
stream_owner: ai_ledger_worker
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root orchestrator and AI admission ledger
public_facade: existing AI admission error and operation contracts
bounded_acceptance: stale admitted rows return included allowance after 24 hours and deferred copilot execution creates only the outer agent admission
non_goals:
  - Changing Prisma schema or migrations.
  - Adding an owner-run reconciler.
  - Changing public AI error codes, Mastra, CopilotKit, or controller contracts.
  - Calling a live provider or deployed database.
evidence:
  - focused-red-green
  - real-async-local-storage-test-harness
  - full-ai-usage-focused-suite
task_id: content-factory-next-vme.1.ai-ledger
epic_id: content-factory-next-vme
stage_id: content-factory-next-vme.1
milestone: AI ledger stale-admission recovery and single copilot admission
milestone_status: accepted
agent_type: backend_developer
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 689491a3
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - tests/ai-usage.*
  - .codex/stages/content-factory-next-vme.1/artifacts/ai-ledger.md
success_criteria:
  - Three known stale-admission paths return allowance after the recorded threshold.
  - Deferred nested copilot model execution creates exactly one agent admission.
  - Existing tenant, retry, stream-finalization, and 429/503 behavior remains green.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-vme.1/spec.md
  - .codex/stages/content-factory-next-vme.1/plan.md
  - Bead content-factory-next-mdo
  - Bead content-factory-next-d1v
selected_skills:
  - superpowers:test-driven-development
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: No temporary worktree, process, database, network, provider, or credential resource was created.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - concurrency
  - idempotency
  - quota
affected_surfaces:
  - backend
invariants:
  - state-transition
  - tenant-isolation
  - public-error-contract
docs_impact: stage-evidence-only
docs_reviewed: updated
docs_review_notes: Threshold and operation-semantics decisions are recorded here; external documentation was unnecessary because behavior is fully local.
verification:
  - RED mdo on Node 22.23.2 and TMPDIR=/tmp: 1 suite failed, 3/3 selected tests failed with AI_INCLUDED_QUOTA_EXHAUSTED after process loss, swallowed finalization failure, and unread stream.
  - GREEN mdo with the exact target: 1 suite passed, 3/3 selected tests passed.
  - RED d1v with real AsyncLocalStorage: 1 suite failed, selected test observed 2 records instead of 1.
  - GREEN d1v with the exact target: 1 suite passed, selected test passed and retained operation=agent.
  - Focused acceptance: tests/ai-usage.execution.test.cjs passed, 1 suite and 27/27 tests.
  - git diff --check passed.
changed_files:
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - tests/ai-usage.execution.test.cjs
  - .codex/stages/content-factory-next-vme.1/artifacts/ai-ledger.md
explicit_defers:
  - Stale admitted rows remain operationally ambiguous and are not relabelled without evidence.
  - The retained agent row reflects endpoint-handler completion; if a framework executes the captured model only after that promise settles, a later provider failure is not given a second ledger row.
---

# Summary

Для `content-factory-next-mdo` выбран автоматический возврат allowance через
фильтр подсчёта, а не owner-run reconciler. Запись `admitted` старше 24 часов
перестаёт расходовать включённую месячную квоту. Порог значительно превышает
локальный 60-секундный таймаут chat-модели и оставляет консервативный запас для
долгого streaming-вызова. При этом сервис не присваивает старой записи
недоказанный `failed`: журнал сохраняет неопределённость, но allowance
возвращается без обязательного операторского запуска.

Цена решения: старые строки остаются `admitted`, поэтому операционный журнал
может быть неточен. Это предпочтительнее автоматической терминализации без
доказательства результата и надёжнее периодического owner-run процесса,
который возвращает allowance только после ручного запуска. Схема данных и
публичные коды ошибок не меняются.

Для `content-factory-next-d1v` RED-тест с настоящим `AsyncLocalStorage`
подтвердил две записи: внешнюю `agent` и отложенную внутреннюю `copilot_chat`.
Остаётся внешний `agent`, потому что allowance относится к одной
пользовательской операции `POST /copilot/agent`, а внутренняя модель является
шагом уже допущенного запроса. Цена выбора: поле `operation` не показывает
внутреннее имя `copilot_chat` отдельной строкой, но и не изображает этот шаг
второй платной пользовательской операцией.

# Verification

`mdo` сначала упал тремя ожидаемыми отказами квоты. После добавления фильтра
тот же target прошёл 3/3. `d1v` сначала получил две записи вместо одной; после
переноса конфигурации уже допущенной операции в отложенную модель тот же тест
прошёл с одной записью `operation='agent'`.

Итоговый focused target под Node 22.23.2, pnpm 10.6.1 и `TMPDIR=/tmp`:
`pnpm exec jest tests/ai-usage.execution.test.cjs --runInBand` — PASS, 1 suite,
27/27 tests. Проверка включает действующие коды 429/503, bounded retries,
tenant mismatch, успешную и неуспешную финализацию и отмену потоков.

Graphify использован из корня для `createAdmission` и `executeModelStream`.
Внешняя документация не нужна: изменение опирается только на локальные
контракты и тесты. `git diff --check` прошёл.

# Risks / Follow-ups

Старые записи намеренно не переводятся в терминальный статус: по ним нельзя
честно определить, был ли платный вызов. Они остаются видимыми как `admitted`,
но после 24 часов не уменьшают allowance.

Сохранение внешнего `agent` означает, что журнал отражает завершение promise
обработчика. Если Mastra вызывает захваченную модель уже после его завершения,
поздний отказ провайдера не создаёт отдельную `copilot_chat` строку. Это
осознанная цена выбора одной пользовательской операции; изменение жизненного
цикла ответа потребовало бы расширения за пределы текущего контракта.

Ни схема, ни миграции, ни публичные коды ошибок, ни `load.tools.service.ts` не
изменялись. Живых/платных вызовов и обращений к базе не было. Итоговая
stage-приёмка остаётся за root orchestrator.
