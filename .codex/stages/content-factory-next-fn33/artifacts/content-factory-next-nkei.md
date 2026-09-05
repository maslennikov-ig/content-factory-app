---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-C2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: общий обработчик ответов фронтенда (afterRequest в layout.context.tsx)
bounded_acceptance: tests/plan-refusal-localized.test.cjs, tests/role-refusal-localized.test.cjs, tests/locale-key-set.test.cjs, tests/locale-translated.test.cjs, tsc frontend
non_goals:
  - живой прогон отказа 402 с исчерпанным тарифом (стенд собран из другого дерева)
  - вторая плашка окна поста, которая живёт в post-save-error.ts вне зоны записи
evidence:
  - jest-plan-refusal
  - jest-role-refusal
  - jest-locale
  - tsc-frontend
task_id: content-factory-next-nkei
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: одна ветка общего обработчика и таблица переводов рядом с такой же
repo: content-factory-next
branch: worktree-agent-a8a7f4e3820f01741
base_branch: wave/cleanup-2026-09-05
base_commit: a0c1ca82
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a8a7f4e3820f01741
write_zone:
  - apps/frontend/src/components/layout/layout.context.tsx
  - libraries/react-shared-libraries/src/translation/locales (16)
  - tests/locale-untranslated-allowlist.json
  - tests/plan-refusal-localized.test.cjs
success_criteria:
  - на 402 человек читает причину на своём языке, а не undefined и не английскую фразу для API
  - экран, чей отказ несёт code, общую модалку не получает
  - таблица переводов держится тестом против фильтра
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-C2
depends_on_streams:
  - none
parallel_decision: local
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: поведение общего обработчика документами не описано
verification:
  - "pnpm exec jest tests/plan-refusal-localized.test.cjs tests/role-refusal-localized.test.cjs: passed"
  - "pnpm exec jest tests/layout tests/locale- tests/custom-fetch: passed"
  - "pnpm exec jest tests/custom-fetch-clone tests/fetch-refusal-settles tests/role.refusal tests/error-collection.filter-order tests/design.guard tests/design.contrast tests/foundation: passed"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed"
changed_files:
  - apps/frontend/src/components/layout/layout.context.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/plan-refusal-localized.test.cjs
explicit_defers:
  - вторая плашка на 402 в окне поста (postSaveErrorMessage) — файл вне зоны записи
---

# Summary

На 402 общая модалка открывалась описанием `(await response.json()).message`.
Заявка говорила, что поля `message` в теле нет вовсе; на этом дереве оно уже
есть — `SubscriptionExceptionFilter` пишет его с 04.09.2026. Настоящий остаток
дефекта другой и виден на любом нерусском ответе: фраза фильтра написана для
API, она английская, и заголовок с кнопкой были захардкожены по-английски.
Человек на русском экране получал английскую модалку, а если бы фильтр отдал
неизвестную секцию — пустую.

Теперь 402 устроен как 403 рядом: таблица `PLAN_REFUSALS` переводит английскую
фразу фильтра в ключ, заголовок, кнопка в тарифы и кнопка отказа берутся через
`i18next.t`, неизвестная фраза печатается как пришла, пустое тело получает
общий текст про тариф. Семь новых ключей — во всех 16 локалях.

Вторая половина заявки — «на 402 плашек две» — закрыта наполовину и по правилу,
которое уже действовало для 403: отказ, чьё тело несёт `code`, принадлежит
поверхности, которая спрашивала, и общей модалки не получает.

# Scope / Routing

Зона записи выше. Бэкенд не трогался: фильтр остался единственным местом, где
пишется английская фраза, и таблица на экране держится за него тестом — ровно
как у отказа по роли.

# Verification

Новый набор `tests/plan-refusal-localized.test.cjs` до правки красный: 7 из 25
проверок падали (четыре предела печатались английской фразой сервера, пустое
тело давало модалку без описания, отказ с `code` получал вторую модалку,
таблицы на экране не было). После правки 25 из 25 зелёные. Команды и их итог —
в поле `verification`.

`tests/raw-control.guard.test.cjs` красный и до этого потока
(`assistant.popup.tsx: button occurs 2, allowed 0`) — чужая поверхность, не
чинилось.

# Delivery / Cleanup

Коммит на ветке потока. Данные на боевом не меняются, шагов выпуска нет.

# Risks / Follow-ups / Explicit Defers

**Плашек всё ещё может быть две.** Предел тарифа приходит без `code`, поэтому
окно поста показывает свой тост «Пост не сохранён: …» поверх общей модалки.
Убрать его — одна строка в `postSaveErrorMessage`
(`apps/frontend/src/components/new-launch/post-save-error.ts`): на 402 вернуть
пустую строку и молчать, потому что причину уже назвала общая модалка. Файл вне
зоны записи этого потока, поэтому правка не сделана; нужна отдельная заявка или
расширение зоны.

**Допущение владельца (консервативное, принято без него).** Английская фраза
фильтра оставлена как есть и переводится на клиенте. Другой путь — заставить
сервер отдавать `section`/`action` и собирать текст на экране — потребовал бы
менять договор ответа 402, который читают и клиенты API.
