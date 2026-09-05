---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: Вкладка «Наборы» в настройках
public_facade: n/a
bounded_acceptance: Единственная кнопка вкладки подписана по-русски, ключ есть во всех 16 локалях.
non_goals:
  - Прочие подписи вкладки «Наборы»
evidence:
  - sets-add-button-locale
task_id: content-factory-next-fn33.113
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
  - apps/frontend/src/components/sets/sets.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
success_criteria:
  - Кнопка показывает «Добавить набор» рядом с «Добавить вебхук» и «Добавить подпись»
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
changed_files:
  - apps/frontend/src/components/sets/sets.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
explicit_defers:
  - none
---

# Summary

`Add a set` была вписана в разметку без `t()`. Добавлен ключ `add_set` рядом с
`sets` во всех 16 локалях; русское значение — «Добавить набор», в один ряд с
соседями «Добавить вебхук» и «Добавить подпись».

# Scope / Routing

Одна строка разметки и одна строка в каждой локали.

# Verification

См. `verification`.

# Delivery / Cleanup

Возвращено корню.

# Risks / Follow-ups / Explicit Defers

В том же файле осталась пара нелокализованных подписей поля («Set Name»
уже с `translationKey`, плейсхолдер «Enter a name for this set» — нет). Это не
входило в bead и не трогалось.
