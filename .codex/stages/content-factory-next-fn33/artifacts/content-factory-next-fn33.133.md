---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-F
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/owner-decisions-2026-09-05
public_facade: n/a
bounded_acceptance: tests/web.research.summary-language.test.cjs
non_goals:
  - перевод фрагментов источников — их пишет не продукт, а страница
  - языки за пределами ru/en, которых у контента нет
evidence:
  - web-research-summary-language-suite
  - content-search-screen-guard
task_id: content-factory-next-fn33.133
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «решения владельца 05.09.2026»
milestone: волна «решения владельца 05.09.2026»
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: язык доходит до промпта, но сводку пишет не наша модель — надо было понять, откуда она берётся
repo: content-factory-next
branch: worktree-agent-ae5ffe34086c2c650
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813cc
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae5ffe34086c2c650
write_zone:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts
  - apps/backend/src/api/routes/content-source.controller.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/
success_criteria:
  - сводка «Коротко о найденном» приходит на языке интерфейса
  - промпт сводки несёт язык читателя
  - сводка, уже написанная на нужном языке, не стоит второго вызова модели
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
risk_level: medium
risk_tags:
  - api
  - ui
affected_surfaces:
  - api
  - backend
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: решение записано в самом сервисе; контракт поиска в спецификации источников не менялся
verification:
  - "pnpm exec jest tests/web.research.summary-language.test.cjs": passed
  - "pnpm exec jest tests/web.research.service.test.cjs tests/web.research.tool.test.cjs tests/web.research.degradation.test.cjs": passed
  - "pnpm exec jest tests/content-search-screen.guard.test.cjs tests/content-search.panel-refusals.test.cjs": passed
  - "node --test tests/content-source-registry.test.cjs tests/content-search-evidence.test.cjs tests/content-intelligence.consumer-backend.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts
  - apps/backend/src/api/routes/content-source.controller.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/web.research.summary-language.test.cjs
  - tests/content-search-screen.guard.test.cjs
  - tests/content-source-registry.test.cjs
explicit_defers:
  - none
---

# Summary

Сводку «Коротко о найденном» пишет не наша модель, а поисковик: это поле
`answer` у Tavily, и оно идёт на языке запроса. Запрос всегда английский
(`englishQuery` делается на каждом прогоне), поэтому на русском экране сводка
была английской.

Язык читателя теперь доходит от панели до сервиса: `SearchForEvidenceDto`
принимает необязательное `language` (только `ru`/`en`), контроллер передаёт его
в `WebResearchService.research(...)`, сервис приводит сводку к этому языку одним
дешёвым вызовом на роли `classify` — той же, что читает предмет поиска.

Вызов делается только когда он нужен: если сводка уже написана нужным письмом
(проверка по кириллице между двумя языками контента), модель не зовут вообще.
Сорванный перевод не роняет поиск — остаются исходная сводка, источники и
фрагменты.

# Scope / Routing

Зона записи соблюдена. `agent.graph.service.ts`, `voice-directives.ts`,
`brand-voice/**`, компоненты генератора, `content-archive*`, `content-facts*` не
тронуты. Новых `@CheckPolicies` нет. Контракт `/sources/search` расширен
необязательным полем, старые клиенты работают как раньше.

# Verification

См. поле `verification`. Новый набор до правки был красным: 4 из 7.

# Delivery / Cleanup

Возвращено корню волны; ветка потока остаётся до слияния.

# Risks / Follow-ups / Explicit Defers

- Проверка «сводка уже на нужном языке» опирается на письмо, а не на
  распознавание языка. Между `ru` и `en` этого достаточно; для третьего языка
  контента правило придётся переписать.
- Допущение за владельца: сводка на языке читателя важнее экономии на одном
  дешёвом вызове модели, когда поисковик ответил по-английски.
