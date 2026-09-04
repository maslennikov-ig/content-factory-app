---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: читатель матрицы ролей
public_facade: docs/product/roles-matrix.md, раздел «Экран настроек»
bounded_acceptance: список вкладок в матрице совпадает с тем, что кладёт settings.component.tsx
non_goals:
  - менять сам экран настроек
  - расширять страж матрицы на таблицу вкладок
evidence:
  - none
task_id: content-factory-next-fn33.78
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: матрица ролей не врёт про настройки
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: low
model_reasoning_rationale: сверка документа с кодом, кода не трогаем
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - docs/product/roles-matrix.md
success_criteria:
  - «Профиль» и «Знания о контенте» названы в строке USER и EDITOR
  - записан порядок вкладок и то, какие из них видит только администратор
selected_docs:
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-wave-04-09-2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: ветка оставлена корню на слияние
risk_level: low
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — строка вкладок для USER и EDITOR плюс абзац с порядком вкладок
verification:
  - pnpm exec jest tests/roles-matrix.guard.test.cjs: passed
changed_files:
  - docs/product/roles-matrix.md
explicit_defers:
  - страж таблицы вкладок не написан: он разбирал бы порядок push-вызовов в settings.component.tsx, это отдельная работа
---

# Summary

Матрица называла девять вкладок из одиннадцати: «Профиль» и «Знания о контенте»
не были упомянуты вовсе, хотя обе безусловны — `settings.component.tsx` кладёт
их в список, не спрашивая роль. Строка для `USER` и `EDITOR` дополнена, и рядом
записан порядок вкладок целиком, с пометкой, какие две видит только
администратор.

# Scope / Routing

Врал документ, а не экран, поэтому код не трогали.

# Verification

`tests/roles-matrix.guard.test.cjs` зелёный; сверка списка сделана по
`apps/frontend/src/components/layout/settings.component.tsx` (строки 108–151).

# Delivery / Cleanup

Возвращено корню как ветка worktree.

# Risks / Follow-ups / Explicit Defers

Расхождение не заметили потому, что страж проверяет двери контроллеров, а не
таблицу вкладок. Страж на вкладки не написан — это отдельная задача.
