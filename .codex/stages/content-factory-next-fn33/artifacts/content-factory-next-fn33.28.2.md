---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-b-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: окно «Создать пост» (участник области, роль USER)
public_facade: n/a
bounded_acceptance: окно поста показывает ядро плюс этап; строка происхождения есть только у поста с контекстом; исследования в окне нет; планирование открывает явная проверка подтверждений
non_goals:
  - механика contentContext на сервере
  - дверь исследования на сервере
  - раздел «Контент»
  - квота у платных действий (fn33.28.3)
evidence:
  - none
task_id: content-factory-next-fn33.28.2
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «окно поста» 04.09.2026
milestone: окно поста даёт только полезное
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: многофайловая правка интерфейса с переименованием и стражами
repo: content-factory-next
branch: worktree-agent-a4c926864b1c7c5b4
base_branch: wave/compose-2026-09-04
base_commit: a1a606c20798c1ac02e00f859beacf90f2f238fe
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4c926864b1c7c5b4
write_zone:
  - apps/frontend/src/components/new-launch/**
  - apps/frontend/src/components/launches/tags.component.tsx
  - apps/frontend/src/components/launches/repeat.component.tsx
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - apps/frontend/src/components/brand-voice/voice-ribbon.container.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - docs/prompts/compose-modal-design-brief.md
  - docs/design/desert-lab/compose/README.md
  - tests/**
success_criteria:
  - у поста без контекста строки происхождения нет вовсе
  - у поста с контекстом одна строка с числом подтверждений и «Подробнее»
  - в окне нет ни одного вызова исследования, дверь на сервере цела
  - планирование закрыто до проверки и открыто после, без перезагрузки
  - тег/повтор/этап — одна геометрия из стандартных примитивов
selected_docs:
  - docs/prompts/compose-modal-design-brief.md
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: волна «окно поста» 04.09
depends_on_streams:
  - stream-a (content-factory-next-fn33.28.1, сервер)
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока живёт до слияния корнем
risk_level: high
risk_tags:
  - ui
  - user-flow
  - state-transition
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: бриф получил раздел «Решено владельцем 04.09 вечером»; README макетов — запись о свёрнутом артборде
verification:
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec jest jest-compose-window-only-useful: passed (красный до правки — 7 из 8)
  - pnpm exec jest design.guard/design.contrast/design.typography/foundation/locale-key-set/locale-translated/raw-control.guard: passed
  - pnpm exec jest posts.save-refusal/import-debug-post.refusal/copilot-provider.scope: passed
  - pnpm exec jest brand-voice.ribbon-live/content-intelligence.consumer-frontend/content-intelligence.interface/compose-channel-pick/generator.voice-single-source/calendar.reader-notation/shared-form-control.contract/choice-control.contract/desert-lab-screen-review/editorial-stage.*: passed
changed_files:
  - apps/frontend/src/components/new-launch/provenance.line.tsx
  - apps/frontend/src/components/new-launch/compose.copy.ts
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/components/new-launch/compose-block-reason.tsx
  - apps/frontend/src/components/launches/tags.component.tsx
  - apps/frontend/src/components/launches/repeat.component.tsx
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - apps/frontend/src/components/brand-voice/voice-ribbon.container.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - docs/prompts/compose-modal-design-brief.md
  - docs/design/desert-lab/compose/README.md
  - jest-compose-window-only-useful
  - jest-compose-channel-pick
  - jest-brand-voice-ribbon-live
  - jest-content-intelligence-consumer-frontend
  - jest-content-intelligence-interface
  - jest-generator-voice-single-source
  - jest-calendar-reader-notation
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - fn33.33 (поповер тега → Menu) закрывается этим рядом контролов; закрытие оставлено корню
  - сцена обзора apps/frontend/src/app/(stand)/interface-review/.../consumer/page.tsx лежит вне зоны: пока живёт через тонкую обёртку `ContentIntelligenceContextSummary`
  - VoiceRibbonContainer (проверка «похоже ли это на вас» и починка предложений) остался без единственного хозяина — решение владельца о новом месте
---

# Summary

Окно поста стало ядром плюс этапом. Панель «Проверенный контекст» и лента
«Применённый аватар» ушли с первого экрана; вместо них одна строка
происхождения — «Собрано из N подтверждений · пишет аватар «X»» с нативным
«Подробнее», — и только у поста, который контекст несёт. Исследование ушло из
окна совсем: ни кнопки, ни действия помощника, ни вызова `/copilot/research`;
дверь на сервере не тронута. Пост с подтверждениями ждёт явного решения
человека: пока `contentContextReviewedAt` пуст, «Добавить в календарь» и
«Опубликовать сейчас» закрыты, рядом стоит причина словами и кнопка
«Подтверждения проверены», которая зовёт `POST /posts/:id/context-review` и
открывает кнопки без перезагрузки. Тег и повтор собраны из `Menu`/`MenuButton`
— своей высоты 44px и белого текста на цвете тега больше нет. Оболочка взяла
геометрию стандартного диалога: радиус 12, заголовок токеном `heading-md`.
Переименование прошло по продукту: «Подтверждения» / Evidence и «Кто пишет» /
Who writes.

# Scope / Routing

Зона записи — как в шапке. За её пределами тронуты только локали, стражи и этот
артефакт. Матрица ролей не менялась: новая дверь принадлежит потоку A, строка о
ней — его.

# Verification

Команды и результат — в шапке. Новый набор `tests/compose-window-only-useful`
проверен красным: с исходными файлами (`git stash` на `apps/frontend/src` и
`libraries/react-shared-libraries/src`) падали 7 проверок из 8.

# Delivery / Cleanup

Ветка потока не сливалась и не выкладывалась. Слияние и закрытие bead — за
корнем.

# Risks / Follow-ups / Explicit Defers

- Контракт сервера принят на слово: поля `contentContextReviewedAt` и
  `contentContextReviewedById` у поста, `POST /posts/:id/context-review` с
  ответом `{ contentContextReviewedAt }`. Адрес собирается из
  `existingData.posts[0].id`; если поток A выбрал идентификатор группы, править
  одну строку в `manage.modal.tsx`.
- Ссылки «источники совместимости» больше не показываются в окне, но
  по-прежнему уезжают с постом при сохранении.
- Остальные пункты — в `explicit_defers`.
