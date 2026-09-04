---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: tests/brand-voice.brief-gate.test.cjs, tests/voice-copy.counted-words.test.cjs, tsc backend и frontend
non_goals:
  - остальные счётные фразы раздела, не названные в задачах
evidence:
  - none
task_id: content-factory-next-fn33.98
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: две строки текста через общий помощник склонения
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/brief-gate.ts
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - tests/brand-voice.brief-gate.test.cjs
  - tests/voice-copy.counted-words.test.cjs
success_criteria:
  - «1 подтверждённый факт уже есть» вместо «1 подтверждённых фактов»
  - «21 184 знака» вместо «21 184 знаков» на пустом экране аватара
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
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: текст интерфейса, документами не описан
verification:
  - pnpm exec jest tests/brand-voice.brief-gate.test.cjs: passed
  - pnpm exec jest tests/voice-copy.counted-words.test.cjs: passed
  - pnpm exec jest tests/brand-voice: passed (51 наборов, 913 проверок)
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/brief-gate.ts
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - tests/brand-voice.brief-gate.test.cjs
  - tests/voice-copy.counted-words.test.cjs
explicit_defers:
  - none
---

# Summary

Два счётных места из остатка fn33.54.

«Радар тем»: `brief-gate.ts` печатал «N подтверждённых фактов уже есть» при любом N. Теперь форма слова выбирается общим помощником `plural` — «1 подтверждённый факт», «2 подтверждённых факта», «5 подтверждённых фактов», «21 подтверждённый факт».

Пустой экран аватара: «Сбор уже начат: 8 образцов · 21 184 знаков» — число знаков не выбирало слово вовсе, а число образцов делало это своей копией правила. Обе части идут через тот же помощник, и в проверке зафиксирован случай владельца: 21 184 → «знака».

# Scope / Routing

`brief-gate.ts` (импорт соседнего `plural`), `voice-copy.ts` и два набора.

# Verification

Проверка счётных форм в наборе брифа: 1, 2, 5, 11, 21. Отдельный набор на пустой экран аватара, где ожидание собирается тем же `toLocaleString('ru-RU')`, что и текст, — иначе неразрывный пробел не совпал бы никогда.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Английская половина той же строки чинилась заодно: при N=1 она читалась «1 confirmed facts». Это тот же дефект в том же предложении, поэтому он исправлен здесь, а не отложен.
