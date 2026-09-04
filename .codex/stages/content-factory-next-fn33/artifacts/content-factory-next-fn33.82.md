---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: администратор области, повысивший человека по ошибке
public_facade: Настройки -> Команды, PUT /settings/team/:id
bounded_acceptance: закрывается вместе с content-factory-next-fn33.50
non_goals:
  - отдельное изменение кода под этот номер
evidence:
  - none
task_id: content-factory-next-fn33.82
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: повышение до администратора обратимо
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: low
model_reasoning_rationale: дубликат уже решённой находки
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - none (см. content-factory-next-fn33.50)
success_criteria:
  - находка закрыта изменением из fn33.50
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
  - content-factory-next-fn33.50
parallel_decision: sequential
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: ветка оставлена корню на слияние
risk_level: low
risk_tags:
  - authorization
affected_surfaces:
  - api
  - ui
invariants:
  - authorization
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: описано в артефакте content-factory-next-fn33.50
verification:
  - pnpm exec jest tests/team-role-change.test.cjs tests/team-screen.test.cjs: passed
changed_files:
  - none
explicit_defers:
  - none
---

# Summary

Та же находка, что `content-factory-next-fn33.50`: повысив участника до
администратора, владелец области не мог ни понизить его, ни удалить. Решена там
же — администратор может управлять равным, пока в области остаётся хотя бы один
администратор. Своего кода под этим номером нет; в заметке bead проставлено
«см. fn33.50».

# Scope / Routing

См. `.codex/stages/content-factory-next-fn33/artifacts/content-factory-next-fn33.50.md`.

# Verification

Проверка та же, что у fn33.50.

# Delivery / Cleanup

Возвращено корню как ветка worktree.

# Risks / Follow-ups / Explicit Defers

Нет.
