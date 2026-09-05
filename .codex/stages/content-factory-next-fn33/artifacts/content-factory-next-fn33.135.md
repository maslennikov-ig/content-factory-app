---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-F
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/owner-decisions-2026-09-05
public_facade: n/a
bounded_acceptance: tests/localized-date.test.cjs
non_goals:
  - разбор нестандартных форматов даты руками
  - показ часа публикации
evidence:
  - localized-date-suite
  - content-search-panel-refusals-suite
task_id: content-factory-next-fn33.135
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «решения владельца 05.09.2026»
milestone: волна «решения владельца 05.09.2026»
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: формат даты уже решён в общем помощнике, нужен был только вариант без часа
repo: content-factory-next
branch: worktree-agent-ae5ffe34086c2c650
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813cc
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae5ffe34086c2c650
write_zone:
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - libraries/react-shared-libraries/src/helpers/localized.date.ts
  - tests/
success_criteria:
  - "«Опубликовано: 02.09.2026» на русском экране из строки RFC 822"
  - неразборная дата не печатается вовсе
  - формат берётся из общего помощника, а не пишется в панели
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-F
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
docs_review_notes: решение записано в самом помощнике
verification:
  - "pnpm exec jest tests/localized-date.test.cjs": passed
  - "pnpm exec jest tests/content-search.panel-refusals.test.cjs": passed
  - "pnpm exec jest tests/team-screen.test.cjs": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - libraries/react-shared-libraries/src/helpers/localized.date.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/localized-date.test.cjs
  - tests/content-search.panel-refusals.test.cjs
explicit_defers:
  - none
---

# Summary

Панель печатала первые десять знаков строки `publishedAt`. На ISO-дате это
работало, а Tavily датирует по RFC 822 — «Wed, 02 Sep 2026 15:54:46 GMT», — и
получался обрубок английского дня недели «Wed, 02 Se».

Формат даты в продукте уже решён один раз (`content-factory-next-fn33.35` и
`fn33.115`), поэтому рядом с `formatLocalizedDateTime` появился
`formatLocalizedDate`: тот же локализованный формат dayjs, только без часа —
у даты публикации часа нет, — и с честным ответом «ничего», когда строку разобрать
не удалось. Панель зовёт помощника и не форматирует дату сама.

# Scope / Routing

Помощник `libraries/react-shared-libraries/src/helpers/localized.date.ts` лежит
вне выданной зоны записи, но именно на него bead указывает как на место решения;
изменение — только добавление экспорта, старая функция не тронута. Отмечено в
отчёте потока.

# Verification

См. поле `verification`. Проверка панели до правки была красной: на экране был
«Wed, 02 Se».

# Delivery / Cleanup

Возвращено корню волны; ветка потока остаётся до слияния.

# Risks / Follow-ups / Explicit Defers

- Разбор даты — это `dayjs`, то есть в конечном счёте `Date`. Формат, который
  `Date` не понимает, даст пустую строку, и подпись «Опубликовано» просто не
  появится. Это выбранное поведение, а не потеря.
- `formatLocalizedDate` принимает язык явным доводом, потому что панель
  вычисляет язык читателя сама, до того как i18next осел на серверной отрисовке.
