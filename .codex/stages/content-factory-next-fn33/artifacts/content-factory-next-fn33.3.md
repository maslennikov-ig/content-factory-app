---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task2_sol
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: team invitation holder
public_facade: invitation preview and accept flow
bounded_acceptance: explicit accept or decline with email binding and single use
non_goals:
  - settings tab visibility
  - schema migration
  - production access
task_id: content-factory-next-fn33.3
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: secure invitation acceptance
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-sol
reasoning_effort: high
model_reasoning_rationale: authentication, address binding, and idempotency are security boundaries
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 1a4d0f7633be54217c75b7659a7788cdb6601c45
worktree: /home/me/code/content-factory-next
write_zone:
  - invitation creation and consumption backend paths
  - invitation confirmation frontend route and proxy routing
  - roles matrix and focused guards
  - sixteen frontend locale files if new keys are required
  - task artifact
success_criteria:
  - no invitation mutates membership before explicit acceptance
  - address-bound invitation rejects another signed-in address
  - accepted invitation cannot be reused
  - copy-link invitation remains unbound but still confirms
  - role and workspace are shown before acceptance and confirmed after success
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
  - docs/product/roles-matrix.md
  - docs/design/component-authoring-rules.md
  - https://www.lazyweb.com/agentic-search/cf72dd51-664b-42a7-9ced-28699e7834cc
selected_skills:
  - technical-premortem
  - superpowers-test-driven-development
  - impeccable
  - lazyweb-search-flows
selected_agents:
  - worker
catalog_candidates:
  - existing-cf-form-and-surface-primitives
  - existing-redis-single-use-state-patterns
parallel_group: none
depends_on_streams:
  - content-factory-next-fn33.1
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch stream had no separate worktree or runtime to clean
risk_level: high
risk_tags:
  - security
  - authorization
  - tenancy
  - idempotency
  - state-transition
  - ui
  - user-flow
  - api
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: roles matrix must gain the join-org door and its exact rules
verification:
  - focused invitation, routing, page, roles, locale, and design tests 132 passed
  - frontend TypeScript passed
  - backend TypeScript passed
changed_files:
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-fn33.3.md
  - apps/backend/src/api/routes/users.controller.ts
  - apps/frontend/src/app/(app)/(site)/join-org/page.tsx
  - apps/frontend/src/proxy.ts
  - docs/product/roles-matrix.md
  - libraries/nestjs-libraries/src/auth/team-invitation.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/invite.signing.test.cjs
  - tests/public-saas-routing.test.cjs
  - tests/roles-matrix.guard.test.cjs
  - tests/team-invitation-flow.test.cjs
  - tests/team-invitation-page.test.cjs
explicit_defers:
  - none
---

# Summary

Приглашение больше не меняет членство при открытии ссылки. Любая ссылка ведёт
на `/join-org`: после входа или регистрации человек возвращается туда, видит
приглашавшего, область и роль и сам выбирает «Принять» или «Отказаться».

Приглашение из письма связано с нормализованным адресом получателя. Ссылка,
скопированная администратором, остаётся без адресной привязки, но проходит тот
же экран подтверждения. Успех теперь видим и называет область и роль; старый
`?added=true` удалён.

# Technical Premortem

Verdict: conditions met. Изменение проходит по цепочке
`inviteTeamMember → signed token and Redis state → proxy/auth return → invitation preview → /user/join-org → organization membership`.

`sendEmail=true` подписывает нормализованный адрес; copy-link его не подписывает.
Идентификатор области и роль берутся только из проверенного JWT. Redis хранит
лишь маркер по SHA-256 токена, а не вторую копию полномочий. Превью читает
маркер, принятие после проверки адреса расходует его атомарным `GETDEL`, отказ
не вызывает backend и не меняет членство.

Два конкурентных принятия дают одну запись членства. Выбран fail-closed порядок:
если запись в БД падает после `GETDEL`, токен уже сгорел. Восстановление — новое
приглашение; это проверено. Схема БД не менялась.

Ссылки, выпущенные старой версией без Redis-маркера, новая версия считает уже
использованными. Это сознательная безопасная несовместимость: администратор
выдаёт новую ссылку. Откат — один коммит задачи; production-действий не было.

# Verification

RED зафиксирован до реализации:

- `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/team-invitation-flow.test.cjs --runInBand` — 3/3 красные: preview отсутствовал, чужой email принимался, повтор принимался.
- `PATH=... pnpm exec jest tests/public-saas-routing.test.cjs -t 'handles an organization invite' --runInBand` — старый proxy вёл в `/auth?org=` и затем принимал приглашение сам.
- `PATH=... pnpm exec jest tests/team-invitation-page.test.cjs --runInBand` — 2/2 красные: confirmation route отсутствовал.
- `PATH=... pnpm exec jest tests/roles-matrix.guard.test.cjs -t 'invitation door' --runInBand` — `/user/join-org` не был документирован.

Итоговый GREEN:

- `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH node -v` → `v22.23.2`; `pnpm -v` → `10.6.1`.
- `PATH=... pnpm exec jest tests/team-invitation-flow.test.cjs tests/invite.signing.test.cjs tests/public-saas-routing.test.cjs tests/team-invitation-page.test.cjs tests/roles-matrix.guard.test.cjs tests/locale-key-set.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs --runInBand` → 9 suites, 132 tests passed.
- `PATH=... pnpm --filter ./apps/frontend exec tsc --noEmit` → exit 0.
- `PATH=... pnpm --filter ./apps/backend exec tsc --noEmit` → exit 0.
- `git diff --check` → exit 0.

Нормальный сценарий: preview → accept → видимое подтверждение с областью и
ролью. Ошибки: чужой email, истёкший/неверный или уже использованный токен,
отказ repository. Края: регистр email, copy-link без email, два конкурентных
accept, возврат после входа/регистрации, отказ без backend-мутации.

Graphify использован как локальная ориентация: `graphify 0.9.45`, `graphify
query "inviteTeamMember" --graph graphify-out/graph.json` нашёл цепочку
settings controller → organization service → users controller → team UI.
Граф не обновлялся: поток не является принятой интеграционной границей, а HEAD
не менялся. Внешний/versioned dependency contract не требовался: поведение
определяют текущие локальные auth, Redis, Next proxy и Beads-контракты.

# Risks / Follow-ups

Lazyweb-ссылка не открылась через доступный web reader; по данному владельцем
выводу она использована только для знакомых слов приглашения и команды.
Security-семантика полностью принадлежит Beads и локальным тестам.

Ручной браузерный прогон не выполнялся: для задачи не поднимался локальный
runtime с тестовыми аккаунтами и Redis. Это не заменялось утверждением об E2E;
проверены реальная логика controller/helper, proxy-маршрутизация, исходный UI,
локали, дизайн-стражи и оба TypeScript-проекта.

## Independent security correction

Sol-review нашёл две границы, которые focused-прогон не покрыл. `POST
/user/join-org` теперь до расходования token требует JSON, точный same-origin и совпадение
пользователя с JWT-сесией. Создание membership и запись `inviteId` теперь одна Prisma-
транзакция. RED покрыл missing/foreign Origin, form body, чужую сессию и сбой второй DB-
записи; GREEN вошёл в Sol-набор 79/79. Независимый review подтвердил оба исправления.
