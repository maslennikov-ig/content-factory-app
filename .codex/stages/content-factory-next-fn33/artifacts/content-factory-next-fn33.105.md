---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-r-worker
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: customFetch/useFetch — единственная дверь фронтенда к бэкенду (libraries/helpers/src/utils/custom.fetch.func.ts)
bounded_acceptance: tests/custom-fetch-clone.test.cjs, tests/logged-auth.route-scope.test.cjs, tsc frontend
non_goals:
  - живой прогон отказов 402/403 поверх общей модалки
evidence:
  - none
task_id: content-factory-next-fn33.105
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна исправлений 04.09.2026
milestone: волна исправлений 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: одна строка в общем помощнике, через который идут все запросы фронтенда
repo: content-factory-next
branch: worktree-agent-a36cc8bec069b04d9
base_branch: wave/fixes-2026-09-04
base_commit: c022d68c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a36cc8bec069b04d9
write_zone:
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/custom-fetch-clone.test.cjs
success_criteria:
  - у удачного ответа clone() не вызывается ни разу
  - отказ по-прежнему получает копию, тело читаемо с обеих сторон
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
  - api
affected_surfaces:
  - ui
  - api
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: помощник внутренний, документами не описан
verification:
  - pnpm exec jest tests/custom-fetch-clone.test.cjs tests/logged-auth.route-scope.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/custom-fetch-clone.test.cjs
explicit_defers:
  - вторая половина задачи (402/403 показывают свой отказ поверх общей модалки) требует живого прогона и оставлена владельцу
---

# Summary

Копия ответа снималась с каждого запроса, а читалась только у отказов 402 и 403. Непрочитанная копия удерживает поток целиком: генерация постов читается через `getReader()`, и браузер вынужден держать всё написанное в памяти, чтобы обе половины копии шли вровень. Теперь копия снимается только при `!response.ok`; удачный ответ уходит обработчику как есть — там читаются только заголовки.

# Scope / Routing

Один файл помощника и новый набор. Обработчик `afterRequest` в `layout.context.tsx` перечитан целиком: тело он читает только на 403 и 402, оба — не `ok`.

# Verification

Красный до правки: у удачного ответа `clone()` вызывался один раз, ожидалось ноль.

# Delivery / Cleanup

Ветка потока, коммит на ней.

# Risks / Follow-ups / Explicit Defers

Вторая половина задачи — экран показывает свой отказ поверх общей модалки на 402/403 — требует живого прогона с владельцем и здесь не делалась.
