---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: S4
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: календарь (дверь «Из мысли»), вкладка «Контент → Бриф», карточка канала Telegram
public_facade: n/a
bounded_acceptance: набор дороги входа `tests/content-intake.flow.test.cjs` плюс тронутые стражи дизайна, локалей и раздела «Контент»; tsc фронтенда
non_goals:
  - сервер входа `/content-intelligence/intake` и его отказы (поток S1)
  - карточка канала на сервере и правила графа (поток S2)
  - правила проверки на штампы (поток S3)
  - изменение окна поста (решение владельца 04.09 «только полезное»)
evidence:
  - intake_flow_suite_green
  - frontend_typecheck_clean
task_id: content-factory-next-tu3k.4
epic_id: content-factory-next-tu3k
stage_id: content-factory-next-fn33
session_id: волна «вход одной мыслью» 06.09.2026
milestone: одна дверь из мысли в черновик
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: экран с двумя языками прямо в исходнике и с квитанцией, где неверное слово о происхождении — это неправда на экране
repo: content-factory-next
branch: worktree-agent-a229507a2be3a3ea0
base_branch: wave/intake-2026-09-06
base_commit: 2826fa71ba465bc43da43617d2337a0d1dc842af
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a229507a2be3a3ea0
write_zone:
  - apps/frontend/src/components/content-intelligence/**
  - apps/frontend/src/components/launches/intake.door.tsx
  - apps/frontend/src/components/launches/launches.component.tsx
  - apps/frontend/src/components/launches/generator/generator.tsx
  - apps/frontend/src/components/new-launch/ndjson.ts
  - apps/frontend/src/components/new-launch/store.ts
  - apps/frontend/src/app/(stand)/interface-review/**
  - docs/design/component-inventory.md
  - tests/**
success_criteria:
  - один экран и две двери в него; второй копии экрана нет
  - дверь календаря видна редактору независимо от оплаты, GeneratorComponent из рейки убран, файл на диске оставлен
  - вкладка «Бриф» открывается входом, ручная форма остаётся вторым видом «Вручную»
  - вопросов не больше двух, у каждого варианты, «Свой ответ» и «Реши сама»; третьего круга нет и решается это на экране
  - квитанция называет происхождение каждого поля словом и различает подтверждённый факт и не вошедший в текст
  - правка квитанции уходит на сервер только по «Пересобрать» и только как briefOverrides
  - проверка на штампы запускается по нажатию, ничего не правит и не шлёт PUT на пост
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/design/component-inventory.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: волна tu3k
depends_on_streams:
  - S1 (контракт и фикстура стрима — получены до старта)
  - S2 (дверь карточки канала GET/PUT/DELETE /integrations/:id/writing-profile)
  - S3 (дверь POST /content-intelligence/text-quality/slop-check)
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка живёт в worktree, не сливалась и не пушилась
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: docs/design/component-inventory.md
docs_reviewed: updated
docs_review_notes: добавлен блок «Приём: из мысли в черновик» и строка о том, что вход намеренно обходится без раскрывашки
verification:
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec jest tests/content-intake.flow.test.cjs": passed
  - "pnpm exec jest tests/content-intake.screen.test.cjs tests/content-intake.gates.test.cjs tests/new-launch.ndjson-splitter.test.cjs": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/design.typography.test.cjs tests/design.hint.test.cjs tests/foundation.test.cjs": passed
  - "pnpm exec jest tests/content-section.route.test.cjs tests/content-section-tabs.boundary.guard.test.cjs tests/content-locale-single-decision.guard.test.cjs": passed
  - "pnpm exec jest tests/content-intelligence.consumer-frontend.test.cjs tests/compose-window-only-useful.test.cjs tests/generator.voice-single-source.test.cjs tests/i18n.ui-literals.test.cjs tests/shared-form-control.contract.test.cjs": passed
changed_files:
  - apps/frontend/src/components/content-intelligence/intake/intake.adapter.ts
  - apps/frontend/src/components/content-intelligence/intake/intake.copy.ts
  - apps/frontend/src/components/content-intelligence/intake/intake.container.tsx
  - apps/frontend/src/components/content-intelligence/intake/intake.screen.tsx
  - apps/frontend/src/components/content-intelligence/intake/questions.card.tsx
  - apps/frontend/src/components/content-intelligence/intake/brief.receipt.tsx
  - apps/frontend/src/components/content-intelligence/intake/slop-findings.tsx
  - apps/frontend/src/components/content-intelligence/intake/writing-profile.adapter.ts
  - apps/frontend/src/components/content-intelligence/intake/writing-profile.card.tsx
  - apps/frontend/src/components/content-intelligence/intake/intake.review-scene.tsx
  - apps/frontend/src/components/content-intelligence/content-section.screen.tsx
  - apps/frontend/src/components/content-intelligence/content-section.copy.ts
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - apps/frontend/src/components/launches/intake.door.tsx
  - apps/frontend/src/components/launches/launches.component.tsx
  - apps/frontend/src/components/launches/generator/generator.tsx
  - apps/frontend/src/components/new-launch/ndjson.ts
  - apps/frontend/src/components/new-launch/store.ts
  - apps/frontend/src/app/(stand)/interface-review/page.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/[scene]/page.tsx
  - docs/design/component-inventory.md
  - tests/content-intake.flow.test.cjs
  - tests/content-intake.screen.test.cjs
  - tests/content-intake.gates.test.cjs
  - tests/new-launch.ndjson-splitter.test.cjs
  - tests/content-section.route.test.cjs
  - tests/content-intelligence.consumer-frontend.test.cjs
explicit_defers:
  - §11 «Решено 06.09.2026» в docs/product/content-section-map.md не написан — координатор урезал объём 06.09; строки в component-inventory.md на месте
  - отдельных наборов на двери, карточку канала и проверку штампов нет по тому же решению; поведение обеих дверей держат content-section.route и исходный след IntakeDoor
  - ContentReadOnlyNote вызывается с surface="brief" — значения "intake" в его объединении нет, а content-write-right.tsx вне зоны записи
  - подпись «настроено / по умолчанию» у канала всегда читает умолчания: опрашивать шесть дверей карточек ради значка при открытии экрана дороже, чем стоит подпись; настоящее значение видно при открытии карточки
  - показывается черновик первого канала; остальные сохранены сервером и открываются из календаря
---

# Summary

Вход одной мыслью собран целиком со стороны экрана: одно поле «Вставьте мысль,
ссылку или чужой пост…», выбор каналов, язык, кнопка «Написать» с причиной
блокировки рядом словами, строка шага стрима, карточка не более чем из двух
вопросов, а после генерации — текст слева и квитанция «Что модель поняла»
справа, с находками проверки на штампы под ней.

Дверей две и экран один. В рейке календаря вместо «Generate Posts», спрятанной
за `billingEnabled` и оплаченным тарифом (на боевом её не видел никто), стоит
`IntakeDoor` «Из мысли», видимая редактору. Вкладка «Контент → Бриф»
открывается входом, а прежняя форма из восьми полей никуда не делась — она
второй вид «Вручную», в одно нажатие.

# Scope / Routing

Зона записи — фронтенд раздела «Контент», дверь календаря, разбивка NDJSON,
стенд и тесты. Сервера входа ещё нет: экран написан против контракта
`voice-wiring.contract.ts` и фикстуры `tests/fixtures/intake-stream.ndjson`,
и все четыре сценария фикстуры проиграны через настоящий поток, читаемый
кусками.

Разбивка NDJSON вынесена из `store.ts` в `new-launch/ndjson.ts`:
`createGeneratorNdjsonConsumer` теперь пользуется ею, поведение не менялось.
Вход читает свой стрим тем же модулем — второй экземпляр той же работы рядом с
первым расходится на недописанном хвосте.

# Verification

Все команды из `verification` во frontmatter выполнены в worktree на
Node 22.23.2: `tsc --noEmit` фронтенда — ноль; 17 наборов jest, 237 тестов,
зелёные. Браузер не запускался, платных вызовов не было (команда владельца
«без тяжёлых тестов и UX-проверок»).

# Delivery / Cleanup

Ветка `worktree-agent-a229507a2be3a3ea0`, три коммита, не отправлена. Слияние
и приёмка — за корневым сеансом.

# Risks / Follow-ups / Explicit Defers

Контракт даёт экрану всё, что тот показывает, кроме двух мелочей, о которых
стоит знать (`tu3k.6`, `tu3k.7`):

Контракт даёт экрану всё, что тот показывает, кроме двух мелочей, о которых
стоит знать потокам S1 и S2:

- `IntakeEventV1` не несёт события про то, что идёт поиск. Шаг «Проверяем
  цифры поиском…» экран выводит по `link-fetched` и `claims`; отдельного
  `search-started` в контракте нет, и это не мешает, но строка прогресса
  беднее, чем могла бы быть.
- `ChannelWritingProfileResponseV1` отвечает про один канал. Признак
  «настроено / по умолчанию» рядом с каналом до открытия карточки взять
  неоткуда, кроме как шестью запросами; экран пока честно говорит «по
  умолчанию» до открытия.
