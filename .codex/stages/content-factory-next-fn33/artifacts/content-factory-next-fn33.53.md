---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-h2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave/fixes-2026-09-04
public_facade: POST /user/language
bounded_acceptance: the language door stores and refuses; the approval letter follows the changed language; the flag saves and the profile seeds a fresh browser
non_goals:
  - language choice on /auth before sign-in (stream H1)
  - a language field on the settings profile screen
  - changing how registration reads the cookie
evidence:
  - none
task_id: content-factory-next-fn33.53
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave/fixes-2026-09-04
milestone: язык живёт у аккаунта, а не в куке одного браузера
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: небольшая, но сквозная правка через четыре слоя и два приложения
repo: content-factory-next
branch: worktree-agent-a1f3621a6e1ed2536
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a1f3621a6e1ed2536
write_zone:
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/dtos/users/user.language.dto.ts
  - apps/frontend/src/components/layout/language.component.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - tests/user-language-door.test.cjs
  - tests/language-choice.frontend.test.cjs
  - docs/product/roles-matrix.md
success_criteria:
  - выбранный язык записывается в User.language вошедшего аккаунта
  - неизвестный язык дверь отвергает, а не пишет молча
  - письмо об одобрении после смены языка на ru уходит по-русски
  - новый браузер поднимает язык из профиля, а не английский
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
cleanup_notes: ветка ждёт слияния корнем
risk_level: low
risk_tags:
  - api
  - user-flow
affected_surfaces:
  - api
  - backend
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — абзац про POST /user/language, дверь без политики
verification:
  - "pnpm exec jest tests/user-language-door.test.cjs": passed
  - "pnpm exec jest tests/language-choice.frontend.test.cjs": passed
  - "pnpm exec jest tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs tests/users-service-rejection-email.test.cjs tests/backend-locale-strings.test.cjs": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs": passed
  - "pnpm exec jest tests/self-picture.test.cjs tests/shared-form-control.contract.test.cjs tests/user-identity.auth.test.cjs tests/media-box.opening.test.cjs tests/same-origin-mutation.test.cjs tests/team-invitation-flow.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/dtos/users/user.language.dto.ts
  - apps/frontend/src/components/layout/language.component.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - docs/product/roles-matrix.md
  - tests/user-language-door.test.cjs
  - tests/language-choice.frontend.test.cjs
explicit_defers:
  - аккаунты, заведённые до этой правки, останутся с language='en', пока их владельцы сами не переключат язык; массового переписывания на боевой не делалось
---

# Summary

Выбранный язык теперь принадлежит аккаунту. Появилась дверь `POST /user/language`,
флажок языка после смены куки зовёт её у вошедшего человека, а раскладка при
загрузке профиля один раз поднимает язык из `User.language` в куку. Письма
(одобрение, отказ, смена логина, приглашение) читают то же поле, поэтому после
переключения на русский они уходят по-русски.

# Scope / Routing

Зона записи — как в задании; вне её тронуты только матрица ролей и два новых
файла тестов. Локали не менялись: новых строк интерфейса нет. Схема
`schema.prisma` не менялась — поле `User.language` уже существует, писать в него
было просто некому.

Дверь без `@CheckPolicies`: роль тут ничего не решает, аккаунт меняет свой
собственный язык, и какой это аккаунт — говорит сеанс. Поэтому в таблицу «Двери»
строка не добавлена (страж считает только двери с политикой); вместо неё в
матрице стоит отдельный абзац.

Список допустимых языков берётся из `BACKEND_LOCALES` — того самого, который
читает почтовый путь. Проверка стоит дважды: в DTO (`@IsIn`) и в сервисе.
`resolveBackendLocale` для записи не годится: он молча отвечает «английский» на
всё незнакомое, то есть сохранил бы мусор и продолжил слать английские письма.

Синхронизация «профиль → кука» срабатывает один раз за монтирование и намеренно
не следит дальше: смена языка в этом браузере пишет куку сразу, а профиль —
мгновением позже, и наблюдающая синхронизация вернула бы старый язык из
несвежего кэша SWR.

# Verification

Красное до правки: те же два набора на спрятанных изменениях —
`Tests: 4 failed, 3 passed, 7 total` (падали обе половины: и запись языка, и
письмо по-русски). После правки все команды из `verification` зелёные,
`tsc --noEmit` по обоим приложениям — ноль ошибок.

# Delivery / Cleanup

Ветка `worktree-agent-a1f3621a6e1ed2536`, один коммит, ждёт слияния корнем.

# Risks / Follow-ups / Explicit Defers

- Уже заведённые аккаунты (включая walk1-owner из живого прогона) остаются с
  `language='en'`, пока человек сам не переключит язык. Правку данных на боевой
  не делал и не предлагаю делать вслепую.
- `/auth` до входа по-прежнему только кука — это поток H1, экраны входа не
  тронуты.
- Отдельного поля языка на экране настроек нет: флажок в шапке остался
  единственным местом выбора.
