---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-q-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: targeted jest suites, tsc for backend and frontend, docs link checker
non_goals:
  - изменение schema.prisma
  - выпуск, деплой, применение SQL на боевой базе
  - переработка потребителей помощника за пределами снятой обёртки
evidence:
  - none
task_id: content-factory-next-fn33.108
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: находки рецензии волны 04.09 до выпуска
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: пять несвязанных находок в разных слоях, каждая со своим красным-зелёным
repo: content-factory-next
branch: worktree-agent-a43d3570c8e2e6858
base_branch: wave/fixes-2026-09-04
base_commit: c7e2efb5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a43d3570c8e2e6858
write_zone:
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/backend/src/api/routes/users.controller.ts
  - apps/backend/src/services/auth/auth.service.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/preview/preview.wrapper.tsx
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/
  - docs/operations/production-deploy.md
  - docs/operations/workspace-role-superadmin-to-admin.sql
  - docs/product/roles-matrix.md
  - docs/product/content-section-map.md
success_criteria:
  - approve/block/unblock и три двери /user отказывают запросу не со своего источника
  - открытая ссылка-приглашение подчиняется CONTENT_FACTORY_REQUIRE_APPROVAL, привязанная — нет
  - удаление последнего администратора общей области отказано кодом account_delete_last_admin с названием области
  - ни одной обёртки <CopilotKit> вне copilot.provider.tsx и названного исключения
  - четыре документа согласованы с кодом
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-fixes-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка ждёт решения root; временные файлы только в scratchpad
risk_level: high
risk_tags:
  - security
  - authorization
  - state-transition
  - data
  - ui
affected_surfaces:
  - backend
  - api
  - ui
  - user-flow
  - data
invariants:
  - state-transition
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: >-
  Порядок шага данных 04.09 исправлен на «после образа» в SQL и в
  production-deploy.md; список *-schema-apply.sql приведён к фактическому;
  роль области SUPERADMIN отделена от флага User.isSuperAdmin в матрице ролей;
  карта раздела «Контент» приведена к пяти вкладкам кода.
verification:
  - "pnpm exec jest tests/same-origin-mutation.test.cjs: passed"
  - "pnpm exec jest tests/copilot-provider.scope.test.cjs: passed"
  - "pnpm exec jest tests/registration.invitation.test.cjs: passed"
  - "pnpm exec jest tests/registration.approval.test.cjs: passed"
  - "pnpm exec jest tests/admin-account-delete.test.cjs: passed"
  - "pnpm exec jest tests/roles-matrix.guard.test.cjs tests/content-section-tabs.boundary.guard.test.cjs: passed"
  - "pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed"
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed"
  - "python3 -m unittest tests.test_docs_links: passed"
  - "python3 scripts/docs/check_docs.py: passed"
changed_files:
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/backend/src/api/routes/users.controller.ts
  - apps/backend/src/services/auth/auth.service.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - apps/frontend/src/components/preview/preview.wrapper.tsx
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/admin-account-delete.test.cjs
  - tests/copilot-provider.scope.test.cjs
  - tests/registration.approval.test.cjs
  - tests/registration.invitation.test.cjs
  - tests/same-origin-mutation.test.cjs
  - docs/operations/production-deploy.md
  - docs/operations/workspace-role-superadmin-to-admin.sql
  - docs/product/content-section-map.md
  - docs/product/roles-matrix.md
explicit_defers:
  - none
---

# Summary

Пять находок рецензии волны 04.09, закрытых до выпуска.

1. **Источник запроса.** `approve`, `block`, `unblock` в `admin.controller.ts`
   несли только `assertSuperAdmin` — проверку на то, кто вошёл, но не на то,
   откуда пришло нажатие. Cookie сессии `sameSite: 'none'`, тела у этих запросов
   нет, поэтому чужая страница могла руками администраторского браузера
   выключить аккаунт. Добавлен `assertAccountStateRequest` со своими кодами
   (`account_state_change_*`) — кодами рецензии не подменяли: отказанное
   одобрение не есть отказанное отклонение. Три двери `/user` —
   `organizations`, `language`, `change-org` — не проверяли источник вовсе;
   у них теперь `assertOwnAccountMutationRequest`. `change-org` дополнительно
   получил `@GetUserFromRequest`, которого у него не было.

2. **Открытая ссылка-приглашение.** Аккаунт создавался `activated: true` мимо
   `CONTENT_FACTORY_REQUIRE_APPROVAL`, то есть шлюз был выключен для любого,
   у кого есть ссылка. Теперь поручительством считается только ссылка,
   привязанная к адресу (`boundEmail`): её никто другой не откроет, значит
   администратор назвал человека. По открытой ссылке действует общее правило
   инстанса (`resolveNewUserAccess`), членство пишется сразу, письмо «ждите
   одобрения» уходит то же самое, что с парадного входа.

3. **Последний администратор.** `deleteAccount` снимал членства во всех
   областях без счёта администраторов: общая область оставалась без единого
   `ADMIN`. Отказ 409 с кодом `account_delete_last_admin` и названием области;
   экран `/admin/users` показывает это словами на языке человека.

4. **CopilotKit.** `preview.wrapper.tsx` держал `<CopilotKit>` вокруг `/p/[id]`
   и модалки расширения без единого потребителя — каждое открытие
   ссылки-предпросмотра стоило `availableAgents`. Обёртка убрана; страж
   `tests/copilot-provider.scope.test.cjs` считал только потребителей и обёртку
   без потребителей не видел — теперь считает обёртки.

5. **Документы.** Четыре расхождения с кодом исправлены; пятое —
   мёртвый якорь в `production-deploy.md` — найдено попутно и тоже исправлено.

# Scope / Routing

Зона записи и критерии — во фронт-маттере. Внешняя документация не
привлекалась: все изменения локальны к репозиторию, поведение библиотек не
опрашивалось. Одно исключение зафиксировано в страже помощника осознанно:
`agents/agent.chat.tsx` поднимает свой `<CopilotKit>` с другим `runtimeUrl`
(рантайм агента, а не `/copilot/chat`), поэтому общей дверью не обходится и
внесён в закрытый список.

Отклонение от плана: проверка «vouchedFor → activated» на уровне
`OrganizationService` положена в `tests/registration.approval.test.cjs`, где
сервис уже поднят по-настоящему, а не в `registration.invitation.test.cjs` —
второй копии той же проводки не заводили. Оба случая приглашения, как и
просила задача, покрыты в `registration.invitation.test.cjs` на уровне
`AuthService`.

# Verification

Команды и результат — во фронт-маттере. Красный до исправления показан
отдельно для каждого пункта:

- п.1 — 7 падений (`approve`, `block`, `unblock`, `organizations`, `language`,
  `change-org` и проверка существования стражей) на контроллерах из HEAD;
- п.2 — 3 падения (`vouchedFor` не передаётся, открытая ссылка не ждёт);
- п.3 — 1 падение (`account_delete_last_admin` не возвращается);
- п.4 — 1 падение с именем `preview.wrapper.tsx` в списке.

# Delivery / Cleanup

Ветка возвращена root; коммит один, на своей ветке, ничего не отправлено.

# Risks / Follow-ups / Explicit Defers

- **Допущение владельцу (п.2).** Открытая ссылка-приглашение больше не даёт
  активный аккаунт при включённом одобрении. Человек попадает в область, но
  ждёт администратора инстанса. Отменяется одной строкой владельца.
- **Допущение владельцу (п.3).** Удаление аккаунта, который единственный
  администратор общей области, теперь отказывается вместо тихого снятия
  членства. Владельцу придётся сначала назначить другого администратора.
- **Шаг выпуска.** Порядок волны стал строгим: колонка `blockedAt` →
  переключение образа → `workspace-role-superadmin-to-admin.sql`. Раньше
  документ разрешал последний шаг в любой момент, и это было неверно.
- Коды отказа `pending_rejection_*` оставлены как есть: они уже на `main`
  с 03.09 и могли уйти в боевую.
