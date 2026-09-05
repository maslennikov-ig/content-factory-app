---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-C
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: ProvenanceLine — единственная строка происхождения окна поста
bounded_acceptance: tests/content-intelligence.consumer-frontend.test.cjs, tests/compose-window-only-useful.test.cjs, tests/design.typography.test.cjs, tsc frontend
non_goals:
  - изменение самой строки происхождения
  - оболочка окна поста (радиус, ряд контролов)
evidence:
  - jest-consumer-frontend
  - jest-design-typography
  - tsc-frontend
task_id: content-factory-next-fn33.28.5
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: удаление обёртки и перевод двух заголовков на токен
repo: content-factory-next
branch: worktree-agent-a4826acfd11be4024
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4826acfd11be4024
write_zone:
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/consumer/page.tsx
  - apps/frontend/src/components/layout/new-modal.tsx
  - apps/frontend/src/components/new-launch/modal.wrapper.component.tsx
  - tests/content-intelligence.consumer-frontend.test.cjs
  - tests/design-typography-allowlist.json
success_criteria:
  - ContentIntelligenceContextSummary не существует, сцена зовёт ProvenanceLine
  - пустая секция error со сцены убрана
  - оба заголовка модалок набраны cf-heading-lg, реестр типографики сократился
selected_docs:
  - docs/prompts/compose-modal-design-brief.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-C
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: правка снимает долг, названный в самом brief; новых решений нет
verification:
  - pnpm exec jest tests/content-intelligence.consumer-frontend.test.cjs tests/compose-window-only-useful.test.cjs tests/design.typography.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/new-launch/editor.tsx
  - apps/frontend/src/app/(stand)/interface-review/content-intelligence/consumer/page.tsx
  - apps/frontend/src/components/layout/new-modal.tsx
  - apps/frontend/src/components/new-launch/modal.wrapper.component.tsx
  - tests/content-intelligence.consumer-frontend.test.cjs
  - tests/design-typography-allowlist.json
explicit_defers:
  - none
---

# Summary

Обёртка `ContentIntelligenceContextSummary` из `editor.tsx` удалена: сцена
обзора `interface-review/content-intelligence/consumer` зовёт `ProvenanceLine`
напрямую. Секция «error» со сцены убрана — состояния отказа окно не рисует, и
пустая рамка с заголовком «Evidence required» рассказывала о поверхности,
которой нет. Заголовки `layout/new-modal.tsx` и `modal.wrapper.component.tsx`
переведены с `text-[24px] font-[600]` на токен `cf-heading-lg` (24/650);
реестр типографики сократился на 3 записи.

# Scope / Routing

Зона записи выше. Заголовок окна поста самого по себе (`cf-heading-md`) уже
стоял и не трогался. Реестр правился только на сокращение.

# Verification

Целевые наборы jest и `tsc --noEmit` фронтенда — зелёные. Стенд не поднимался:
он собран из другого дерева.

# Delivery / Cleanup

Возвращено корню на слияние.

# Risks / Follow-ups / Explicit Defers

`cf-heading-lg` даёт вес 650 вместо 600 — заголовки модалок стали чуть
плотнее. Токена 24/600 в системе нет, и это ровно тот случай, ради которого
токены и заведены.
