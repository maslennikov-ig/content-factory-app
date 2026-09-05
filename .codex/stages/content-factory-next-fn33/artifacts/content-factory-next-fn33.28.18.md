---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: Экран «Плагины» на русском интерфейсе
public_facade: n/a
bounded_acceptance: Названия, описания, поля и подписи кнопок плагина берутся из локалей; опечатка в английском тексте не показывается человеку.
non_goals:
  - Перевод строк плагинов на стороне бэкенда
  - Изменение декораторов @Plug в провайдерах
evidence:
  - plugs-screen-locale
  - plug-copy-lookup
task_id: content-factory-next-fn33.28.18
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
  - apps/frontend/src/components/plugs/**
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
success_criteria:
  - Карточка плагина, кнопка и форма показывают русский текст
  - Незнакомый плагин по-прежнему показывает текст, присланный бэкендом
  - Английский текст исправлен: «so your followers»
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
  - apps/frontend/src/components/plugs/plug.tsx
  - apps/frontend/src/components/plugs/plugs.copy.ts
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - Опечатка «so you followers» осталась в четырёх файлах провайдеров (libraries/nestjs-libraries/src/integrations/social/*.provider.ts) — вне зоны записи; человеку она больше не видна, потому что экран берёт английский текст из локали.
---

# Summary

Экран «Плагины» говорил по-английски на русском интерфейсе: названия, описания
и подписи полей приходят с бэкенда как данные из декораторов `@Plug`, и экран
печатал их дословно. Теперь текст берётся из локалей по `methodName` плагина, а
присланный бэкендом английский остаётся запасным вариантом для плагина, которого
в таблице ещё нет. Подписи кнопок «Set Plug»/«Edit Plug» были вписаны в разметку
без `t()` — стали ключами.

Заодно приведено к одному слову: раздел зовётся «Плагины», поэтому в русской
локали «Авто-плагин», «Автоподключение» и «Подключение обновлено» стали
«Плагин» и «Плагин обновлён» — слово «подключение» в продукте занято
подключением канала.

# Scope / Routing

Зона записи — `apps/frontend/src/components/plugs/**`, локали и список
непереведённого. Перевод на стороне бэкенда рассмотрен и отклонён: те же
декораторы читает планировщик, а у запроса, который их отдаёт, нет читателя.

# Verification

См. `verification`. Целевых jest-наборов у экрана «Плагины» нет; проверены
локальные наборы и типы.

# Delivery / Cleanup

Возвращено корню. Ветка потока не сливалась.

# Risks / Follow-ups / Explicit Defers

Опечатка в исходных декораторах провайдеров осталась — это чужая зона записи.
Одиннадцать новых ключей записаны в семь нелатинских локалей как английский
текст и внесены в `tests/locale-untranslated-allowlist.json`.
