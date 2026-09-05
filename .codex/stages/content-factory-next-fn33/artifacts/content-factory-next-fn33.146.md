---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: b4-cleanup
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: календарь /launches
public_facade: useInterfaceLanguage
bounded_acceptance: смена языка кнопкой в шапке меняет слова панели фильтра этапов сразу, без перезагрузки
non_goals:
  - остальные ~30 мест, читающих useVariables().language для показа слов
evidence:
  - editorial-stage-language-source
task_id: content-factory-next-fn33.146
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: язык интерфейса един на всём экране календаря
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: интерфейсная правка с общим хуком и живым рендер-тестом
repo: content-factory-next
branch: worktree-agent-a5ca72846a096ca1f
base_branch: wave/search-into-drafts-2026-09-05
base_commit: 1b019abd
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a5ca72846a096ca1f
write_zone:
  - libraries/react-shared-libraries/src/translation/use-interface-language.ts
  - apps/frontend/src/components/launches/editorial-stage.*.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - tests/editorial-stage.*
success_criteria:
  - слова панели фильтра меняются на languageChanged без перезагрузки
  - четыре поверхности этапа берут язык из одного места
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - useInterfaceLanguage
parallel_group: B4
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: правка в дереве, временных файлов нет
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: поведение экрана приведено к уже описанному правилу, новых договоров нет
verification:
  - "pnpm exec jest tests/editorial-stage.language-source.test.cjs": passed
  - "pnpm exec jest tests/editorial-stage": passed
  - "pnpm exec jest tests/calendar": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - libraries/react-shared-libraries/src/translation/use-interface-language.ts
  - apps/frontend/src/components/launches/editorial-stage.filter.tsx
  - apps/frontend/src/components/launches/editorial-stage.select.tsx
  - apps/frontend/src/components/launches/editorial-stage.badge.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - tests/editorial-stage.language-source.test.cjs
  - tests/editorial-stage.frontend-controls.test.cjs
explicit_defers:
  - тот же разрыв источников языка живёт ещё примерно в 30 компонентах (`useVariables().language` для показа слов); правится тем же хуком, но за пределами этой bead
---

# Summary

Панель фильтра этапов календаря брала язык из `useVariables().language` — значения, посчитанного один раз при серверной отрисовке. Кнопка смены языка зовёт `i18next.changeLanguage`, и переменная запроса про это не знает, поэтому полоса «Все этапы / План / …» расходилась с шапкой и сходилась только после перезагрузки.

Заведён общий хук `useInterfaceLanguage()`: на сервере — переменная запроса (детектор языка там ничего не разрешает), в браузере — i18next, через `useTranslation()`, что заодно подписывает компонент на `languageChanged`. На него переведены все четыре поверхности этапа: фильтр, редакторский выбор, значок на карточке и карточка календаря.

# Scope / Routing

Зона записи — модуль перевода в общей библиотеке, четыре файла календаря и их тесты. Документация не менялась: правило «язык всего экрана один» уже действовало, ломался только его источник в одном месте.

# Verification

- `pnpm exec jest tests/editorial-stage.language-source.test.cjs` — новый набор; до правки красный (рендер-тест показывал русские слова при английском интерфейсе, страж источника не находил `useInterfaceLanguage`), после — 5/5 зелёных.
- `pnpm exec jest tests/editorial-stage` — 41/41.
- `pnpm exec jest tests/calendar` — 27/27.
- `pnpm exec jest tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated` — 54/54.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 ошибок.

`tests/editorial-stage.frontend-controls.test.cjs` пришлось поправить: его подмостки задавали язык переменной запроса, а она больше не решает. Теперь они зовут `i18next.changeLanguage` — то же самое, что делает кнопка в шапке.

# Delivery / Cleanup

Коммит на ветке потока, не влит, не отправлен.

# Risks / Follow-ups / Explicit Defers

Разрыв источников языка шире одной панели: `useVariables().language` для показа слов читают ещё примерно тридцать компонентов (разделы «Контент», «Голос бренда», медиа, настройки). Все они лечатся тем же хуком построчно, но это отдельная работа — здесь тронуты только поверхности, названные в bead.
