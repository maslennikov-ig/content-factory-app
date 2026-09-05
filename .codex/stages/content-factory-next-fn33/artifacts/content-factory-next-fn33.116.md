---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: Выбор языка на /auth и в окне после входа
public_facade: n/a
bounded_acceptance: Каждый из 16 языков назван на самом себе, одинаково в обоих местах и одинаково на сервере и в браузере.
non_goals:
  - Добавление новых языков
  - Переводы содержимого
evidence:
  - native-language-names
  - language-menu-guard
task_id: content-factory-next-fn33.116
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: cleanup-wave-2026-09-05
milestone: Русский интерфейс без английских островов, одно слово для одной вещи
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Пять связанных правок интерфейса и локалей в одной зоне записи.
repo: content-factory-next
branch: worktree-agent-a873682584cb78cbd
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a873682584cb78cbd
write_zone:
  - apps/frontend/src/components/layout/language.presentation.ts
  - apps/frontend/src/components/layout/language.component.tsx
  - apps/frontend/src/components/ui/language-menu.tsx
  - tests/language-menu.guard.test.cjs
success_criteria:
  - Грузинский называется ქართული, русский — Русский, в обоих местах
  - Название языка не зависит от того, какие данные ICU есть у среды
  - Новый язык без родного названия ловится стражем
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-L1
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: Правки остаются на ветке потока, временные файлы — в scratchpad.
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Изменены только подписи интерфейса и значения локалей; договорённостей в docs это не трогает.
verification:
  - `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs`: passed
  - `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json`: passed
  - `bash scripts/orchestration/run_process_verification.sh`: passed
  - `pnpm exec jest tests/language-menu.guard.test.cjs tests/language-choice.frontend.test.cjs tests/auth-language-choice.test.cjs`: passed
changed_files:
  - apps/frontend/src/components/layout/language.presentation.ts
  - apps/frontend/src/components/layout/language.component.tsx
  - tests/language-menu.guard.test.cjs
  - tests/language-choice.frontend.test.cjs
explicit_defers:
  - none
---

# Summary

Названия языков брались из `Intl.DisplayNames`, а он отвечает из тех данных,
которые оказались у среды, и при их нехватке молча подставляет чужой язык:
на сервере выходило `Georgian`, в русском браузере — «грузинский», среди
`日本語` и `Deutsch`. Шестнадцать названий выписаны в таблицу
`NATIVE_LANGUAGE_NAMES` в `language.presentation.ts` — едином источнике, из
которого читают оба места. Окно выбора языка переведено с `getLanguageName` на
`getLanguageLabel`, чтобы один язык не назывался на двух экранах по-разному.

`Intl` остался запасным вариантом для кода языка, которого продукт не везёт.

# Scope / Routing

`language.presentation.ts` — единый источник этих названий; правка в нём была
обязательна, иначе таблицу пришлось бы завести дважды. Файл не был перечислен в
зоне записи поимённо — записано в отчёт.

# Verification

См. `verification`. Новый страж `tests/language-menu.guard.test.cjs` до правки
был красным (5 из 6 проверок).

# Delivery / Cleanup

Возвращено корню.

# Risks / Follow-ups / Explicit Defers

Названия — данные, которые может проверить только читающий на этом языке.
Проверены по общепринятому написанию; при сомнении владелец может поправить
одну строку таблицы.
