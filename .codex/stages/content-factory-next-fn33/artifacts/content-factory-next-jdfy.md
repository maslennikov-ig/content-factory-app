---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task4_terra
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: newly approved account owner
public_facade: localized approval email with sign-in link
bounded_acceptance: approveAccount enqueues send_email_v2 using the recipient locale
non_goals:
  - workflow v1 changes
  - approval state-machine changes
  - production access or email delivery
task_id: content-factory-next-jdfy
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: approval notification email
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: localized notification judgment within the existing approval subsystem
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: cc3aa849
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries approval and email integration
  - backend locale strings
  - focused approval notification guards
  - task artifact
success_criteria:
  - approveAccount queues one send_email_v2 notification
  - notification uses the approved user's locale and links to /auth
  - existing approval state transition is preserved
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
  - AGENTS.md
selected_skills:
  - superpowers-test-driven-development
selected_agents:
  - worker
catalog_candidates:
  - existing-email-service-v2
parallel_group: none
depends_on_streams:
  - content-factory-next-fn33.2
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch stream; no separate worktree or runtime remained
risk_level: medium
risk_tags:
  - account-state-transition
  - email-notification
affected_surfaces:
  - backend
  - user-flow
invariants:
  - send-email-v2-only
  - locale-preserved
docs_impact: none
docs_reviewed: complete
docs_review_notes: Read AGENTS.md, the walkthrough contract, Beads task, Graphify report/query, current UsersService, NotificationService, EmailService and backend locale catalog. NotificationService delegates to EmailService.sendEmail, whose workflow id is send_email_v2.
verification:
  - RED: pnpm exec jest tests/users-service-approval-email.test.cjs --runInBand failed as expected: approveAccount returned after activation and the queued-email list was empty.
  - GREEN: pnpm exec jest tests/users-service-approval-email.test.cjs tests/backend-locale-strings.test.cjs tests/email-service-async-locale.guard.test.cjs --runInBand passed (24 tests).
  - PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit -p apps/backend/tsconfig.json passed.
  - git diff --check passed.
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests/users-service-approval-email.test.cjs
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-jdfy.md
explicit_defers:
  - none
---

# Summary

`approveAccount` сохраняет прежний переход состояния: сначала вызывает
`activateUser`, затем ставит уведомление в существующую очередь через
`NotificationService.sendEmail` → `EmailService.sendEmail` → Temporal
`send_email_v2`. Письмо содержит локализованные тему и HTML-текст со ссылкой
на `${FRONTEND_URL}/auth`; в каталог добавлены обе строки для всех 16 backend
локалей. v1 workflow и контракт активности не менялись.

Обычный сценарий проверен: русскоязычный пользователь получает в очередь
письмо с темой «Аккаунт одобрен — теперь можно войти», своей локалью и ссылкой
на `/auth`. Граница проверена: отсутствующий пользователь получает прежний
404, активации и письма нет. Ошибка очереди проверена: отказ Temporal-пути
логируется внутри сервиса, но не отменяет уже успешную активацию и не меняет
результат `approveAccount`.

Допущение: `FRONTEND_URL` является обязательной настройкой действующего
backend, как и в остальных ссылках продукта; тест закрепляет суффикс `/auth`
на безопасном локальном URL. Реальная отправка, Temporal-server и production
не использовались.

# Verification

RED до реализации:

```text
pnpm exec jest tests/users-service-approval-email.test.cjs --runInBand
FAIL: expected one queued localized email; received []
```

GREEN после реализации:

```text
pnpm exec jest tests/users-service-approval-email.test.cjs tests/backend-locale-strings.test.cjs tests/email-service-async-locale.guard.test.cjs --runInBand
PASS: 3 suites, 24 tests

pnpm exec tsc --noEmit -p apps/backend/tsconfig.json
PASS

git diff --check
PASS
```

# Risks / Follow-ups

Ошибки постановки письма не могут сделать уже одобренный аккаунт снова
неактивным. Они остаются в серверном журнале; задача не вводит повторную
доставку и не меняет политику очереди. Реальная отправка не выполнялась.
