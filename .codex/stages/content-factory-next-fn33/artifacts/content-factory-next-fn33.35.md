---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-i
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: администратор, выписавший приглашение
public_facade: Настройки -> Команды -> «Создать приглашение», строка срока
bounded_acceptance: срок приглашения написан на языке интерфейса и без экранированных сущностей
non_goals:
  - сам срок жизни приглашения
  - формат дат на других экранах
evidence:
  - none
task_id: content-factory-next-fn33.35
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: приглашение читается по-русски
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: medium
model_reasoning_rationale: одна строка вывода, но с ловушкой экранирования i18next
repo: content-factory-next
branch: worktree-agent-a0fe0cff014de15d4
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0fe0cff014de15d4
write_zone:
  - apps/frontend/src/components/settings/teams.component.tsx
  - tests
success_criteria:
  - дата форматируется dayjs по языку i18next
  - на экране нет `&#x2F;` и нет американского порядка в русской локали
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - набор локалей dayjs, уже подключённый в calendar.tsx
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
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: поведение экрана, в матрице ролей не описано
verification:
  - pnpm exec jest tests/team-screen.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/settings/teams.component.tsx
  - tests/team-screen.test.cjs
explicit_defers:
  - none
---

# Summary

Срок приглашения писался `new Date(...).toLocaleString()` без языка, то есть
языком процесса (en-US), а i18next экранировал подстановку и косые черты
показывались как `&#x2F;`. Теперь дата идёт через dayjs с локализованным
форматом `L, LT` на языке, который i18next уже разрешил для интерфейса, а
экранирование для этой подстановки снято: значение своё, а не введённое
человеком. `ka_ge` переводится в `ka` — так эту локаль называет dayjs.

# Scope / Routing

Изменён только экран команды. Набор локалей dayjs взят тот же, что уже
подключает `calendar.tsx`.

# Verification

Красный до исправления: «an invitation without an address ends on the link…» в
`tests/team-screen.test.cjs` теперь требует строку без `/` и в порядке
день.месяц.год для русского интерфейса.

# Delivery / Cleanup

Возвращено корню как ветка worktree.

# Risks / Follow-ups / Explicit Defers

Тот же `toLocaleString()` может встречаться на других экранах — не искал,
задача была про этот.
