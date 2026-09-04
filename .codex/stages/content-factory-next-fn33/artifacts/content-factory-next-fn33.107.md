---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/content-section-tabs.boundary.guard.test.cjs, наборы онбординга, tsc frontend
non_goals:
  - переработка шагов онбординга и порядка обучения
  - переименование вкладок раздела
evidence:
  - none
task_id: content-factory-next-fn33.107
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: текст и адреса, плюс расширение существующего стража на новый файл
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - apps/frontend/src/components/onboarding/onboarding.copy.ts
  - apps/frontend/src/components/onboarding/onboarding.adapter.ts
  - tests/content-section-tabs.boundary.guard.test.cjs
success_criteria:
  - онбординг называет только вкладки, которые есть на полосе
  - каждая ссылка вида /content?tab=… ведёт в существующую вкладку
  - страж падает, если появится новое имя вне полосы
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-r
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
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: карта раздела уже описывает пять вкладок; правился текст, а не решение
verification:
  - pnpm exec jest tests/content-section-tabs.boundary.guard.test.cjs: passed
  - pnpm exec jest tests/onboarding: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/onboarding/onboarding.copy.ts
  - apps/frontend/src/components/onboarding/onboarding.adapter.ts
  - tests/content-section-tabs.boundary.guard.test.cjs
explicit_defers:
  - none
---

# Summary

Онбординг звал на «Кто пишет» и «Что пишем» — таких вкладок на полосе нет. Шаг про манеру теперь зовёт на «Аватары» (там добавляют образец) и ведёт на `/content?tab=avatars` вместо несуществующего `?tab=voice`, по которому раздел открывался на первой попавшейся вкладке. Шаг про утверждение зовёт на «Бриф»: факт добавляют там, где о нём спрашивают, — так же, как говорит `content-section.screen.tsx`. Английские подписи изменены в тех же двух местах.

Страж `content-section-tabs.boundary.guard.test.cjs` (правило из fn33.55/56/61) распространён на онбординг: имя вкладки в «Открыть «X»» обязано быть именем с полосы, а каждый адрес `/content?tab=…` — существующей вкладкой.

# Scope / Routing

Два файла онбординга и страж. Названия вкладок берутся из `content-section.copy.ts`, а список — из `content-section.tabs.ts`; страж не хранит своей копии ни того, ни другого.

# Verification

Красный до правки: страж ждал «Аватары/Откуда идеи/Бриф/Материалы/Откуда факты», получал «Кто пишет»; адрес `voice` отсутствовал в списке вкладок.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Страж смотрит только на обороты «Открыть «X»» и `Open "X"`: «Помощь → С чего начать» — путь через меню настроек, а не вкладка раздела, и под правило не попадает намеренно.
