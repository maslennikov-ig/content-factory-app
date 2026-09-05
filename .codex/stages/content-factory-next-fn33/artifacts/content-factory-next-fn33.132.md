---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: apps/backend content-source.controller POST /content-intelligence/sources/search
public_facade: WebResearchService.research
bounded_acceptance: русская тема даёт русский запрос и подсказку страны независимо от вердикта классификатора
non_goals:
  - строитель контекста, agent.graph.service.ts, фронтенд
  - смена структуры WebResearchResult
evidence:
  - web-research-query-language
task_id: content-factory-next-fn33.132
epic_id: content-factory-next-ec48
stage_id: content-factory-next-fn33
session_id: search-into-drafts-2026-09-05
milestone: поиск отвечает на языке темы
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка в общей библиотеке поиска, читают четыре потребителя
repo: content-factory-next
branch: worktree-agent-a11a60dce20f05db2
base_branch: wave/search-into-drafts-2026-09-05
base_commit: d25ed736b24a94fac2baec52ec22af8235cf6d98
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a11a60dce20f05db2
write_zone:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - tests/web.research.service.test.cjs
success_criteria:
  - запрос на языке темы задаётся всегда, когда язык темы не английский
  - подсказка страны для русской темы не зависит от scope
  - поле классификации названо по тому, что оно есть
selected_docs:
  - docs/product/material-quality-check-2026-09-05.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-search-into-drafts
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока ждёт слияния корнем
risk_level: medium
risk_tags:
  - api
affected_surfaces:
  - backend
  - api
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: поведение поиска не описано отдельным документом; находка записана в docs/product/material-quality-check-2026-09-05.md и не переписывается
verification:
  - "pnpm exec jest tests/web.research.service.test.cjs tests/web.research.summary-language.test.cjs tests/web.research.degradation.test.cjs tests/web.research.tool.test.cjs tests/ai.search.config.test.cjs tests/ai.clients.test.cjs tests/autopost.research-enrichment.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - tests/web.research.service.test.cjs
explicit_defers:
  - none
---

# Summary

Поиск по русской теме уходил в англоязычную выдачу, потому что запрос на языке
темы задавался только тогда, когда классификатор считал тему «местной». У Tavily
нет параметра языка: язык запроса — это язык его слов. Теперь запрос на языке
темы задаётся всегда, когда язык темы не английский, и идёт первым; английский
запрос остаётся вторым. Подсказка страны для русской темы больше не ждёт
вердикта «местная». Поле `localQuery` переименовано в `subjectLanguageQuery`,
поле `scope` из классификации убрано — после правки его никто не читал, а платить
за лишнее поле в ответе модели незачем.

# Scope / Routing

Зона записи — `web.research.service.ts` и его набор тестов. Строитель контекста,
`agent.graph.service.ts` и фронтенд не тронуты. Структура `WebResearchResult` не
менялась.

Порядок запросов изменён намеренно: запрос на языке темы идёт первым, потому что
оба запроса делят один бюджет знаков на выдержки, и русские источники по русской
теме — те, на кого его стоит потратить.

# Verification

- `pnpm exec jest` по семи наборам: 83 теста, все зелёные.
- До правки новые тесты «asks in the subject language and boosts the country
  without a local classification» и «leaves a non-Russian subject language
  unboosted» падали.
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json`: 0 ошибок.

# Delivery / Cleanup

Коммит на ветке потока, не отправлен. Bead не закрыт.

# Risks / Follow-ups / Explicit Defers

- Теперь любая нерусская тема стоит двух поисковых вызовов вместо одного, если
  язык темы не английский. Раньше второй вызов делался только для «местных» тем.
  Бюджет поиска на организацию считает `AiUsageService`; расход на русскоязычной
  области вырастет примерно вдвое. Допущение, консервативное и записанное:
  владелец не просил экономить на поиске, а находка прямо про то, что одного
  английского запроса мало.
- Подсказка страны `russia` теперь ставится по языку темы, а не по её «местности».
  Tavily применяет её только к теме `general`; на свежих новостях она по-прежнему
  не передаётся.
