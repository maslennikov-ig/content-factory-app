---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-F
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: раздел «Контент», вкладки «Откуда факты» и «Материалы → Что уже написали»
public_facade: n/a
bounded_acceptance: витрина фактов и архив показывают состояние «только чтение» с объяснением, когда сервер отказал по праву
non_goals:
  - предугадывать право до ответа сервера (двери несут пределы тарифа, открытые любому участнику)
  - менять политики на дверях бэкенда
  - трогать общий jsonReader и обработчик отказов в layout.context.tsx
evidence:
  - content-facts-read-only-jest
  - design-guards-green
  - frontend-tsc-clean
task_id: content-factory-next-cl19
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: раздел «Контент» — состояния по правам
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: интерфейсная правка с продуктовым решением о том, что считать правом
repo: content-factory-next
branch: worktree-agent-a10d4918a42395948
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a10d4918a42395948
write_zone:
  - apps/frontend/src/components/content-intelligence/**
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx
  - docs/product/content-section-map.md
  - tests/content-facts.read-only.test.cjs
success_criteria:
  - право прокинуто в один предикат и читается из ответа сервера, а не угадывается
  - заблокированное действие остаётся видимым и объясняет себя строкой, на которую указывает aria-describedby
  - состояние restricted можно открыть в сцене ревью
  - §7 карты больше не называет «только чтение» пробелом
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/product/roles-matrix.md
  - docs/product/content-section-map.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка остаётся на слияние корневым сеансом
risk_level: low
risk_tags:
  - ui
  - authorization
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: §7 docs/product/content-section-map.md — «только чтение» построено и объяснено, откуда берётся право
verification:
  - pnpm exec jest tests/content-facts.read-only.test.cjs: passed
  - pnpm exec jest tests/content-intelligence tests/content-archive tests/content-facts tests/content-fact tests/content-section tests/content-locale tests/content-leads: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec jest tests/interface-review tests/desert-lab-screen-review.test.cjs tests/brand-voice: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-write-right.tsx
  - apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - apps/frontend/src/components/content-intelligence/content-facts.review-scene.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx
  - docs/product/content-section-map.md
  - tests/content-facts.read-only.test.cjs
explicit_defers:
  - none
---

# Summary

Витрина фактов и архив узнали, что отказ по праву бывает, и теперь показывают
его состоянием, а не неудачным нажатием. Один предикат `readWriteRight` читает
статус отказа (`403` — роль, `402` — тариф), действия гаснут на месте, под ними
стоит одна строка о причине, и на неё указывает `aria-describedby` каждого
погасшего действия. Список при этом остаётся читаемым.

Ключевая находка по дороге: `SubscriptionException` кладёт на провод
`{ section, action }` и **ни одного предложения**, поэтому общий `jsonReader`
собирал сообщение сам, и на экране появлялось «Material request failed: 402» —
там, где человек ждёт объяснения. Теперь такой отказ до текста не доходит.

# Scope / Routing

Зона записи соблюдена. Локали (16) не тронуты намеренно: оба экрана держат
собственный словарь `ru`/`en` через `resolveContentLocale`, как весь раздел
«Контент», и новых ключей `i18next` работа не потребовала.

Допущение, которое должен подтвердить владелец (принято самым консервативным
образом, владелец в отъезде): **право заранее не угадывается**. Двери витрины
несут `[Create, Sections.AI]`, дверь архива — `[Create,
Sections.POSTS_PER_MONTH]`; это пределы тарифа, а не роли, и
`docs/product/roles-matrix.md` прямо говорит, что на инстансе без оплаты они
открыты любому вошедшему участнику. Скрыть кнопки по роли, как это сделано на
«Откуда идеи» (`fn33.63`), значило бы закрыть работающую дверь — ошибку,
обратную найденной. Поэтому право узнаётся из ответа сервера. Если владелец
решит, что менять факты вправе только администратор, изменение — одна строка в
`content-write-right.tsx` плюс политика на двери.

# Verification

Все команды из шапки прогнаны в этом worktree на Node 22.23.2. Новый набор
`tests/content-facts.read-only.test.cjs` сначала был красным (7 упавших из 10)
без правок экранов, сцены и карты.

# Delivery / Cleanup

Коммит один, на ветке worktree. Слияние — за корневым сеансом.

# Risks / Follow-ups / Explicit Defers

- **Не чинил, вне зоны записи:** `layout.context.tsx` на `402` открывает общую
  модалку `deleteDialog((await response.json()).message, …)`, а у
  `SubscriptionException` поля `message` нет — модалка выходит с пустым
  описанием и кнопкой в биллинг. На `403` без `message` тот же обработчик молча
  пропускает отказ, что этой работе как раз на руку. Отдельная задача.
- **Слепое пятно стража ролей:** `tests/roles-matrix.guard.test.cjs` читает
  секции из текста аргумента `@CheckPolicies`, поэтому двери
  `content-context.controller.ts`, где политика передана переменной
  (`@CheckPolicies(aiCreate as any)`), для него не существуют вовсе — всех
  дверей `/content-intelligence/facts/*` в матрице нет, и страж на это не
  падает. Не чинил: файл стража и матрица — чужая поверхность этой волны.
