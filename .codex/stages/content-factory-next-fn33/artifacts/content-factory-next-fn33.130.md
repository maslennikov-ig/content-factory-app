---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-E
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration stream for wave/owner-decisions-2026-09-05
public_facade: AgentGraphService.research / researchText
bounded_acceptance: пустой контекст даёт researchAvailable false, и в промпт уходит строка «No web research was performed…»
non_goals:
  - подмешивать веб-поиск в промпт в обход строителя контекста
  - менять политику продукта про UNVERIFIED и детерминированный откат
  - удалять ветку прямого веб-поиска в графе
evidence:
  - agent-research-honesty
  - agent-suites
  - content-context-suites
  - backend-typecheck
task_id: content-factory-next-fn33.130
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: Генератор честен про материал, отказ виден человеку, черновик один
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: узел графа, чей вывод читают четыре промпта, и рядом ветка, которую легко удалить по ошибке
repo: content-factory-next
branch: worktree-agent-a49e5994ac8494368
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813ccd3e6213c07c0791e9fb535c66bfd8af1
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a49e5994ac8494368
write_zone:
  - libraries/nestjs-libraries/src/agent/**
  - tests/**
success_criteria:
  - контекст без фактов и доказательств → researchAvailable false
  - researchText отдаёт запрет, а не пустую рамку untrusted-блока
  - контекст с фактом остаётся доступным и приезжает в промпт с цитатой
selected_docs:
  - docs/product/content-memory-spec.md (таблица «Детерминированный fallback»)
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка оставлена корневому потоку слияния
risk_level: medium
risk_tags:
  - user-flow
affected_surfaces:
  - backend
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: спецификация памяти контента уже описывает нужное поведение; код приведён к ней, менять документ незачем
verification:
  - pnpm exec jest tests/agent: passed
  - pnpm exec jest tests/content-context tests/content-intelligence tests/generator tests/web.research: passed
  - node --test tests/content-intelligence.consumer-backend.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - tests/agent.research-honesty.test.cjs
explicit_defers:
  - none
---

# Summary

Генератор больше не говорит модели, что материал есть, когда его нет. `start()`
строит контекст всегда, поэтому первая ветка `research()` срабатывала на каждой
генерации и ставила `researchAvailable: true` даже на пустом контексте. Теперь
доступность считается по самому материалу: есть хотя бы один факт или одно
доказательство — `true`, иначе `false`.

Второе место — порядок в `researchText()`. Рамка `contextText` у пустого
контекста состоит из двух служебных строк без единой ссылки внутри и проверялась
первой, вытесняя честный запрет. Теперь «материала нет» читается раньше рамки;
противоречия быть не может, потому что `false` выставляется ровно на пустом
контексте.

Ветка прямого веб-поиска в графе оставлена и подписана: из генератора в неё не
попасть по решению продукта (материал идёт только через строителя контекста,
взятое поиском остаётся UNVERIFIED), а живые вызывающие `research()` без
контекста — чат-инструмент и наборы мягкой деградации поиска. `autopost.service`
и чат-агент ходят в `WebResearchService` напрямую, минуя граф.

# Scope / Routing

Зона записи — `libraries/nestjs-libraries/src/agent/**` и `tests/**`. Строитель
контекста и спецификация только читались. Документов и навыков сверх
спецификации памяти контента не требовалось: правило отказа записано в ней
дословно.

# Verification

Новый набор `tests/agent.research-honesty.test.cjs` был красным до правки (2
падения из 3: `researchAvailable` приходил `true`, а текст промпта — пустой
untrusted-рамкой). После правки зелёные: `tests/agent` (11 наборов, 71 тест),
`tests/content-context tests/content-intelligence tests/generator
tests/web.research` (10 наборов, 178 тестов), `node --test
tests/content-intelligence.consumer-backend.test.cjs` (12), `tsc --noEmit -p
apps/backend/tsconfig.json`.

# Delivery / Cleanup

Возвращено корневому потоку, ветка не слита.

# Risks / Follow-ups / Explicit Defers

Остаточный риск: генерация без подтверждённого материала теперь получает прямой
запрет говорить о свежем, поэтому тексты станут заметно осторожнее — это и есть
намерение, но владельцу это будет видно сразу. Ветка веб-поиска в графе остаётся
недостижимой из генератора; если продукт когда-нибудь решит пускать поиск в
промпт, это отдельное решение и отдельная задача.
