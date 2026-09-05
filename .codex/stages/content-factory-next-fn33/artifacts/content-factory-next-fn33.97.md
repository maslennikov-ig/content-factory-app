---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: Переключатель языка на /auth и в публичной шапке
public_facade: n/a
bounded_acceptance: Одно решение живёт в одном компоненте; полоса наведения видна на той полосе, на которой нарисована.
non_goals:
  - Окно выбора языка после входа (другой контроль, другая точка входа)
evidence:
  - language-menu-extraction
  - language-menu-guard
task_id: content-factory-next-fn33.97
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
  - apps/frontend/src/components/ui/language-menu.tsx
  - apps/frontend/src/components/auth/language.switch.tsx
  - apps/frontend/src/components/public-saas/public-language.tsx
  - tests/language-menu.guard.test.cjs
  - tests/auth-language-choice.test.cjs
success_criteria:
  - Запись куки и перезагрузка написаны ровно в одном файле
  - У каждого вызывающего остались только полоса и слово
  - Тон выбирает ту плашку наведения, которую видно на его полосе
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
  - `pnpm exec jest tests/language-menu.guard.test.cjs tests/auth-language-choice.test.cjs tests/interface-review-public-header.test.cjs tests/public-saas-routing.test.cjs`: passed
changed_files:
  - apps/frontend/src/components/ui/language-menu.tsx
  - apps/frontend/src/components/auth/language.switch.tsx
  - apps/frontend/src/components/public-saas/public-language.tsx
  - tests/auth-language-choice.test.cjs
  - tests/language-menu.guard.test.cjs
explicit_defers:
  - none
---

# Summary

Два переключателя языка были одним решением, набранным дважды. Общий контроль
переехал в `apps/frontend/src/components/ui/language-menu.tsx` с одним
параметром — `tone`. У `/auth` остался тон страницы, у публичной шапки — тон
полосы навигации; всё остальное общее.

Плашка наведения: в светлой теме `navigation-active` совпадает с `surface`, а
`surface-subtle` — с `navigation`, то есть каждая невидима на чужой полосе.
Именно поэтому тон стал параметром, а не значением по умолчанию: выбрать не ту
плашку теперь нельзя молча.

# Scope / Routing

Публичный переключатель получил флаг страны, которого у него не было: у общего
контроля одно представление, а различие сведено к тону. Отклонение от «различие
только в тоне цветов» — в сторону меньшего числа отличий.

# Verification

См. `verification`. Проверки поведения из `tests/auth-language-choice.test.cjs`
переставлены на файл, где это поведение теперь живёт.

# Delivery / Cleanup

Возвращено корню.

# Risks / Follow-ups / Explicit Defers

Воспроизвести невидимую плашку прямо на публичной шапке не удалось: там тон
навигации и токены расходятся в обеих темах. Опасность была в переносе тона
навигации на поверхность страницы — теперь она закрыта параметром.
