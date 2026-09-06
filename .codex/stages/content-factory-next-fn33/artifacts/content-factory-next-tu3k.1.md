---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: S1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: экран входа (S4), граф генератора (S2), проверка штампов (S3)
public_facade: POST /content-intelligence/intake (NDJSON, IntakeEventV1)
bounded_acceptance: одно поле и до трёх каналов дают черновик в каждом; бриф заполняет модель; вопросов не больше двух и только про тезис и факты; чужой текст не доходит до генератора
non_goals:
  - экраны и локали (S4)
  - карточка канала и чтение подсказок графом (S2)
  - проверка на ИИ-штампы (S3, оставлен шов)
evidence:
  - content-intake-service
  - content-intake-kind
task_id: content-factory-next-tu3k.1
epic_id: content-factory-next-tu3k
stage_id: content-factory-next-fn33
session_id: волна «вход одной мыслью» 06.09.2026
milestone: вход одной мыслью
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка проходит через контракт, DTO, контроллер, сервис, репозиторий и учёт расхода сразу
repo: content-factory-next
branch: worktree-agent-a3fe42b3de3d27c79
base_branch: wave/intake-2026-09-06
base_commit: 2826fa71
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a3fe42b3de3d27c79
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/intake/**
  - libraries/nestjs-libraries/src/content-intelligence/brief/{content-brief.repository.ts,content-brief.compose.ts,editor-html.ts}
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-intake.dto.ts
  - libraries/nestjs-libraries/src/agent/{agent.module.ts,generator-run-input.ts}
  - libraries/nestjs-libraries/src/openai/{ai.usage.service.ts,ai.roles.ts,web.research.service.ts}
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/search-evidence.ts
  - libraries/nestjs-libraries/src/throttler/throttler.provider.ts
  - apps/backend/src/api/routes/content-intake.controller.ts
  - apps/backend/src/api/api.module.ts
  - docs/product/{content-memory-spec.md,tariff-levers.md,roles-matrix.md}
  - tests/**
success_criteria:
  - дверь стримит NDJSON по IntakeEventV1; пять отказов до первого байта — обычный 422
  - тонкий вход отвечает вопросами и не зовёт генератор
  - числа чужого поста входят только подтверждёнными, непроверенное видно строкой ungrounded
  - чужой текст не попадает в аргументы generator.start ни одним полем
  - ссылка сохраняется как доказательство с provider user_link и reuseBy url
  - два канала — два черновика с контекстом, версией голоса и метками цитат
  - расход двух разборов идёт операцией intake с ролью extract
selected_docs:
  - docs/product/content-memory-spec.md
  - docs/product/tariff-levers.md
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: tu3k
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-a3fe42b3de3d27c79 не влита, ветка и worktree живы
risk_level: high
risk_tags:
  - public-api
  - data
  - network
affected_surfaces:
  - backend
  - api
  - data
invariants:
  - tenancy
  - prompt-injection
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: content-memory-spec.md (раздел «Вход одной мыслью», строка таблицы отката), tariff-levers.md (пять строк пределов, вопрос 15), roles-matrix.md (строка двери)
verification:
  - "pnpm exec jest tests/content-intake.service.test.cjs": passed
  - "pnpm exec jest tests/content-intake.kind.test.cjs": passed
  - "pnpm exec jest tests/ai-usage.consumer-guard.test.cjs tests/ai-doors-throttle.test.cjs tests/roles-matrix.guard.test.cjs tests/backend-no-dynamic-alias-import.guard.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/orchestrator/tsconfig.json": passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake-kind.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/claim-match.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.errors.ts
  - libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts
  - libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.compose.ts
  - libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/search-evidence.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-intake.dto.ts
  - libraries/nestjs-libraries/src/agent/generator-run-input.ts
  - libraries/nestjs-libraries/src/agent/agent.module.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/ai.roles.ts
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/throttler/throttler.provider.ts
  - apps/backend/src/api/routes/content-intake.controller.ts
  - apps/backend/src/api/api.module.ts
  - docs/product/content-memory-spec.md
  - docs/product/tariff-levers.md
  - docs/product/roles-matrix.md
  - tests/content-intake.service.test.cjs
  - tests/content-intake.kind.test.cjs
  - tests/ai-usage.consumer-guard.test.cjs
  - tests/ai-doors-throttle.test.cjs
explicit_defers:
  - S2 — граф читает body.intake; до слияния подсказки не влияют на текст, черновик всё равно получается
  - S3 — slop-check; в сервисе оставлен необязательный шов последним параметром, checks.slop пока null
  - S3 — wordShingles живёт местно в intake-kind.ts; при слиянии заменить импортом text-quality/anti-copy.ts
  - tests/content-intake.routes.test.cjs не писался (указание координатора о минимуме проверки 06.09)
---

# Summary

`POST /content-intelligence/intake` принимает одно поле и до трёх каналов и
стримит NDJSON по `IntakeEventV1`. Пять отказов (`INTAKE_INPUT_TOO_SHORT`,
`INTAKE_CHANNEL_REQUIRED`, `INTAKE_CHANNEL_UNKNOWN`, `INTAKE_TOO_MANY_CHANNELS`,
`INTAKE_CHANNEL_UNSUPPORTED`) решаются до первого байта обычным 422; всё, что
случилось после, приходит последней строкой `{name:'error'}`.

Ход: разбор вида входа без модели → чтение ссылки тем же шлюзом и той же
политикой, что и `validateSource` → один структурированный разбор чужого текста
→ проверка первых трёх чисел поиском (детерминированная сверка числовых лексем)
→ один структурированный разбор для заполнения брифа → ворота `evaluateBrief`
как есть → до трёх генераций `AgentGraphService.start` → черновик через
`ContentBriefRepository.createDraft` со снимком контекста, версией голоса и
метками цитат.

Две границы держатся явно и проверены набором: чужой текст не попадает в
аргументы `generator.start` ни одним полем (в подсказки едут тема, угол,
строение и отрезки по восемь слов), и непроверенное число не входит в текст, а
видно строкой `ungrounded`.

# Scope / Routing

Зона записи соблюдена. Сверх названного потребовалось одно: экспорт
`usableHttpsUrl` из `web.research.service.ts` (одна строка, поведение не
менялось) — иначе «ссылка» во входе и «ссылка» в веб-поиске были бы двумя
разными правилами.

Решения, влияющие на сборку волны:

1. **`IntakeService` зарегистрирован в `AgentModule`**, а не в `DatabaseModule`:
   единственный его сосед по модулю — `AgentGraphService`, всё остальное
   приезжает из глобального `DatabaseModule`.
2. **Порядок параметров конструктора — часть договора** (наборы строят сервис
   позиционно). Три последних необязательны: `now`, разбор страницы, шов
   `slopCheck` под поток S3.
3. **Факты области отбираются местным ранжированием**, а не запросом:
   `listFacts(orgId, q)` соединяет слова через И, и дюжина слов входа не нашла
   бы ни одной строки.
4. **Ответ человека про факты**: адрес внутри ответа становится опорой; без
   адреса строка остаётся неподтверждённой и вопрос повторяется — это честная
   цена голой ссылки из §10 карты раздела.
5. **`createDraft` расширен аддитивно**; снимка нет — версия голоса и метки
   цитат не отправляются вовсе, иначе `PostsRepository` отказал бы
   `CONTENT_CONTEXT_INPUT_INVALID` и человек потерял бы черновик.

# Verification

Проверка сведена к минимуму по указанию координатора 06.09 («скорость, владелец
проверит на боевом сам»): один набор потока, четыре задетых стража и типизация,
снятая до указания. Команды и исходы — в `verification` выше. Ни одного платного
вызова: модель, поиск, реестр, шлюз и политика доступа подменены.

# Blockers / Owner input

**Чтение ссылок выключено на боевом.** `IntakeService.readLink` соблюдает
`SOURCE_DIRECT_FETCH`, а в `deploy/production/app.env.example` этой переменной
нет — значит на боевом сценарий «вставил ссылку» ответит
`INTAKE_LINK_UNREACHABLE` с текстом «вставьте текст поста прямо в поле». Мысль и
чужой пост работают. Чтобы ссылка заработала, владельцу нужно поставить
`SOURCE_DIRECT_FETCH=true` — это решение про то, ходит ли сервер по
произвольным адресам, и принимать его за владельца я не стал.

# Delivery / Cleanup

Ветка `worktree-agent-a3fe42b3de3d27c79`, не влита, не отправлена. Слияние и
приёмка — за корневым сеансом.

# Risks / Follow-ups / Explicit Defers

- `SOURCE_DIRECT_FETCH` на боевом выключен: вставленная ссылка отвечает
  «вставьте текст», пока владелец не включит переменную (`tu3k.5`).
- Шов `slopCheck` и отпечатки антикопии сведены с потоками S3 при слиянии
  волны корневым сеансом; локальные реализации удалены.
- Не написан `tests/content-intake.routes.test.cjs` — по команде владельца
  «скорость важнее тестов».

