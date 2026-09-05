---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: apps/backend content-source.controller POST /content-intelligence/sources/search
public_facade: WebResearchService.research
bounded_acceptance: выдержка — утверждение по предмету; строка без годной выдержки не предлагается к взятию
non_goals:
  - строитель контекста, agent.graph.service.ts, фронтенд
  - смена структуры WebResearchResult
evidence:
  - web-research-excerpt-cleaning
  - web-research-https-only
task_id: content-factory-next-fn33.134
epic_id: content-factory-next-ec48
stage_id: content-factory-next-fn33
session_id: search-into-drafts-2026-09-05
milestone: выдержка стоит того, чтобы её заморозить
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
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - tests/web.research.service.test.cjs
  - tests/ai.clients.test.cjs
success_criteria:
  - сниппет провайдера предпочитается сырой странице
  - сырая страница идёт в дело только после чистки и порога осмысленности
  - результат без годной выдержки остаётся в sources и не попадает в facts
  - только https, без IP-адресов и нестандартных портов; http-двойник схлопывается
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
  - data
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
  - "node --test tests/content-search-evidence.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - tests/web.research.service.test.cjs
  - tests/ai.clients.test.cjs
explicit_defers:
  - none
---

# Summary

Откуда бралось меню. `TavilyWebSearch` складывал два разных поля в одно:
`raw_content || content`, то есть сырая страница всегда побеждала сниппет.
Сниппет Tavily — это выдержка, которую провайдер выбрал под запрос; `raw_content`
— вся страница в markdown, а страница начинается с навигации, логотипа и куки-
баннера. Поэтому под ссылкой стояло «* GIR Alerts /account/register * Magazine» и
«Skip to main content». Резервный OpenRouter отдаёт `annotations[].url_citation.content`
— это тоже сниппет, не страница, и меню оттуда не приходило.

Сделано: клиент перестал уничтожать выбор — сниппет и страница доезжают до порта
под своими именами (`content`, `rawContent`). Служба выбирает: сниппет всегда, если
он есть и что-то говорит помимо своих ссылок; страница — только после чистки и
только если прошла порог осмысленности. Результат без годной выдержки остаётся в
`sources` и не попадает в `facts` — а панель показывает именно `facts`, так что
взять меню как доказательство больше нельзя.

Чистка (построчно): markdown-картинки убираются, markdown-ссылки заменяются своим
текстом, абсолютные адреса и `blob:`/`data:` убираются, обрезки путей вида
`/account/register` убираются, снимаются маркеры списка. Строка выбрасывается,
если после этого пуста, если начинается с фразы-хрома (`Skip to`, `Top of page`,
`Image:`, `Report Ad`, `©`, `Cookie`, `Subscribe`, `Privacy policy` и подобные) или
если несла ссылки и оставила рядом с ними меньше 40 знаков прозы. Пустые строки
сохраняются, чтобы `truncateAtParagraph` по-прежнему резал по абзацам.

Плюс к обоим bead: адреса пропускаются только `https`, только по имени хоста, без
IP-литералов и без порта кроме 443. Тот же адрес по `http` и по `https` больше не
даёт две строки — остаётся `https`.

# Scope / Routing

Зона записи — две библиотеки поиска и их наборы тестов. Структура
`WebResearchResult` не менялась: изменилось только содержимое полей. Строитель
контекста, `agent.graph.service.ts` и фронтенд не тронуты.

Отклонение от «Сделать:» — порог осмысленности двухуровневый, а не один.
Порог «≥ 2 предложений или ≥ 120 знаков с буквами» применён к сырой странице.
К сниппету провайдера применена только слабая проверка: есть буквы и есть хоть
одна строка без ссылок. Причина: сниппет уже выбран под запрос, и короткий ответ
в одну строку — всё ещё утверждение; жёсткий порог выбросил бы годные короткие
выдержки. Проверка «хоть одна строка без ссылок» действует в обоих случаях.

# Verification

- `pnpm exec jest` по семи наборам: 83 теста, все зелёные.
- До правки падали новые тесты «cleans the page of navigation when the provider
  sent no snippet», «a page that is only a menu stays a source and is never
  offered as a claim», «keeps https names only and collapses an http twin onto
  its https address», а в `tests/ai.clients.test.cjs` — разделение полей.
- `node --test tests/content-search-evidence.test.cjs`: 8 из 8.
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json`: 0 ошибок.
- Живого поиска не запускалось: платные вызовы запрещены, вся проверка на подменах.

# Delivery / Cleanup

Коммит на ветке потока, не отправлен. Bead не закрыт.

# Risks / Follow-ups / Explicit Defers

- Материала в черновике станет меньше. Раньше в `facts` уходила вся страница
  (до 8000 знаков на источник), теперь — сниппет Tavily, обычно несколько сотен
  знаков. Для панели это ровно то, что просил bead; для автопоста и копилота
  это меньше текста в промпте. Допущение, консервативное и записанное: владелец
  просил утверждение, а не объём; если черновики обеднеют, страницу можно будет
  добавлять вторым куском после сниппета.
- Строк в выдаче станет меньше: результат без годной выдержки не показывается.
  При неудачной теме панель может оказаться пустой при непустом `sources`.
  Это и есть требование bead «строки без содержательного фрагмента не
  предлагаются к взятию».
- Источник, доступный только по `http`, теперь пропадает целиком, а не
  показывается второй строкой. Проверить на живом прогоне не удалось.
