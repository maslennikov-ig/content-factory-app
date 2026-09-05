---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: generator (AgentGraphService), compose screens (ec48.2)
public_facade: ContentContextEnvelopeV1.evidence[].provenance
bounded_acceptance: взятое поиском входит в контекст и в промпт с пометкой; генератор сам ищет, когда человек не дал материала; отказ поиска не валит генерацию
non_goals:
  - смена поисковика (SearXNG/Exa)
  - экраны и локали (ec48.2)
  - правка web.research.service.ts и ai.clients.ts (fn33.132/134)
evidence:
  - builder-search-provenance
  - generator-web-search
  - finalize-search-savable
  - registry-content-hash-reuse
task_id: content-factory-next-ec48.1
epic_id: content-factory-next-ec48
stage_id: content-factory-next-fn33
session_id: волна «поиск в черновик» 05.09.2026
milestone: поиск в черновик с пометкой «взято из поиска»
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка проходит через контракт конверта, строитель, сохранение черновика и генератор сразу
repo: content-factory-next
branch: worktree-agent-a3678d6958a831dee
base_branch: wave/search-into-drafts-2026-09-05
base_commit: d25ed736
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a3678d6958a831dee
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/**
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - docs/product/content-memory-spec.md
  - docs/product/tariff-levers.md
  - tests/**
success_criteria:
  - конверт несёт provenance CONFIRMED/SEARCH, хранимый элемент — inclusionReason SEARCH_UNCONFIRMED
  - обратное чтение снимка возвращает то же происхождение
  - REQUIRE_CURRENT обеспечен одним лишь свежим поисковым материалом
  - промпт называет находку по имени и несёт строку правила
  - генератор ищет сам только при пустом явном материале; отказ поиска не валит генерацию
selected_docs:
  - docs/product/content-memory-spec.md
  - docs/product/tariff-levers.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: ec48
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка worktree-agent-a3678d6958a831dee не влита, ветка и worktree живы
risk_level: high
risk_tags:
  - public-api
  - data
  - state-transition
affected_surfaces:
  - backend
  - api
  - data
invariants:
  - tenancy
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: content-memory-spec.md (раздел «Взято из поиска», таблица отката, конверт, алгоритм выбора), tariff-levers.md (рычаг «Поиск при каждой генерации», вопрос 14)
verification:
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "node --test tests/content-context.builder.test.cjs": passed
  - "node --test tests/content-search-evidence.test.cjs": passed
  - "node --test tests/post.content-context.test.cjs": passed
  - "pnpm exec jest tests/agent.research-honesty.test.cjs tests/content-context.provenance-swap.test.cjs tests/autopost.generation.test.cjs tests/agent.generator-web-search.test.cjs": passed
  - "pnpm exec jest tests/backend-no-dynamic-alias-import.guard.test.cjs": passed
  - "pnpm exec jest tests/agent tests/generator tests/web.research tests/post. tests/autopost tests/content": passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/contracts.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.repository.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - docs/product/content-memory-spec.md
  - docs/product/tariff-levers.md
  - tests/agent.generator-web-search.test.cjs
  - tests/content-context.builder.test.cjs
  - tests/content-context.provenance-swap.test.cjs
  - tests/agent.research-honesty.test.cjs
  - tests/content-search-evidence.test.cjs
  - tests/web.research.degradation.test.cjs
  - tests/generator.voice-single-source.test.cjs
  - scripts/evidence/voice-eval/product-graph.cjs
explicit_defers:
  - content-factory-next-ec48.2 — экраны и локали пометки «Взято из поиска»
---

# Summary

Взятое веб-поиском доходит до текста. Строитель контекста пускает свежий
`SEARCH_PROVIDER_RESULT` без принятой оценки как `provenance: 'SEARCH'`, снимок
хранит это в `inclusionReason = 'SEARCH_UNCONFIRMED'`, обратное чтение отвечает
тем же. Промпт называет такой материал по имени и получает одну строку правила.
Генератор перед сборкой контекста сам ходит в веб, если человек не дал
`sourceIds`/`factIds`/`userMaterialEvidenceIds`, складывает найденное через
`acceptSearchResult` и передаёт идентификаторы строителю как явный материал.
Повторная находка с тем же `contentHash` переиспользует уже сохранённую свежую
запись.

Отказы, которые остались даже для находки: `trustTier = BLOCKED` и
`status = REJECTED`. Это не «не успели подтвердить», а уже сказанное человеком;
владелец разрешил брать неподтверждённое, а не отменять отказы. Допущение
консервативное и требует подтверждения владельца одной строкой.

# Scope / Routing

Зона записи соблюдена. Сверх названного в bead потребовались три файла:

- `content-context.finalize.ts` (та же папка, та же зона): без правки черновик,
  собранный строителем из находки, при сохранении получал бы
  `CONTENT_CONTEXT_INVALIDATED` — проверка читала «оценка принята» одинаково для
  подтверждённого и найденного;
- `scripts/evidence/voice-eval/product-graph.cjs`, `tests/web.research.degradation.test.cjs`,
  `tests/generator.voice-single-source.test.cjs`: местные загрузчики собирают
  `AgentGraphService` вручную и не знали про новый провайдер и про импорт
  константы из `contracts.ts`. Добавлены заглушки, поведение наборов не менялось.

`autopost.service.ts` (свой `renderContentContext`) не тронут: автопост строит
контекст по `sourceIds` ленты и находок в его кандидатах не бывает.
`web.research.service.ts`, `ai.clients.ts` и фронтенд не тронуты.

# Verification

Красное до правки показано трижды:

- `node --test tests/content-context.builder.test.cjs` без правки строителя —
  4 падения из 31 (`a fresh search result…`, `an accepted evidence stays CONFIRMED…`,
  `REQUIRE_CURRENT is satisfied…`, `a stale search result is still refused…`);
- `pnpm exec jest tests/agent.generator-web-search.test.cjs` без правки графа —
  2 падения из 6;
- `pnpm exec jest tests/content-context.provenance-swap.test.cjs` без правки
  сохранения — 1 падение из 9.

Зелёные прогоны перечислены в `verification` выше. Платных вызовов моделей и
поисковика в наборах нет: и поиск, и реестр подменены.

# Delivery / Cleanup

Один коммит на своей ветке, не отправлен. Beads не закрыт.

# Risks / Follow-ups / Explicit Defers

- Расход: генератор теперь тратит один поиск и один дешёвый разбор предмета на
  каждую генерацию без явного материала. Записано в `tariff-levers.md` как рычаг
  «Поиск при каждой генерации» и вопрос 14 владельцу.
- Витрина «Откуда факты» пополняется находками генератора. Переиспользование по
  `contentHash` держит рост, но за неделю активной работы список всё равно
  вырастет; выключателя у этого поведения сегодня нет.
- Допущение владельцу: находка со `status = REJECTED` или `trustTier = BLOCKED`
  в контекст не входит.
- `ec48.2` — экраны и локали; конверт для них готов, отсутствие поля читается
  как `CONFIRMED`.
