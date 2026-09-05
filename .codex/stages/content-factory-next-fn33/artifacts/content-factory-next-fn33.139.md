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
  - изменение бюджета поиска (12 с + 8 с) — он общий с автопостом и помощником
  - повтор запроса за человека
evidence:
  - web-research-summary-language-suite
  - content-search-panel-refusals-suite
task_id: content-factory-next-fn33.139
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «решения владельца 05.09.2026»
milestone: волна «решения владельца 05.09.2026»
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: отказ по образцу соседних кодов контроллера, без утечки внутренностей наружу
repo: content-factory-next
branch: worktree-agent-ae5ffe34086c2c650
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813cc
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ae5ffe34086c2c650
write_zone:
  - apps/backend/src/api/routes/content-source.controller.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/
success_criteria:
  - отказ приходит с кодом CONTENT_SEARCH_UNAVAILABLE и статусом 503
  - панель отличает временный сбой от неподключённого поиска
  - наружу не уходят имена поисковиков и миллисекунды таймаута
selected_docs:
  - docs/product/content-source-registry-spec.md
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
  - user-flow
affected_surfaces:
  - api
  - backend
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: код отказа принадлежит поиску, а не таксономии реестра источников
verification:
  - "pnpm exec jest tests/web.research.summary-language.test.cjs": passed
  - "pnpm exec jest tests/content-search.panel-refusals.test.cjs": passed
  - "node --test tests/content-source-registry.test.cjs tests/content-search-evidence.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/backend/src/api/routes/content-source.controller.ts
  - apps/frontend/src/components/content-intelligence/content-search.container.tsx
  - tests/web.research.summary-language.test.cjs
  - tests/content-search.panel-refusals.test.cjs
explicit_defers:
  - "content-factory-next-fn33.139: бюджет запасного поисковика 8000 мс оставлен как был — константы в ai.clients.ts общие с автопостом и помощником, менять их вне зоны этого потока"
---

# Summary

Когда молчали оба поисковика, `WebSearchFallbackError` вылетал из контроллера и
становился обычным 500 без кода. Панель могла показать только запасную фразу, и
временный сбой читался так же, как отсутствие ключа, — то есть как тупик, хотя
лечится он повтором через минуту.

Контроллер источников теперь ловит этот отказ рядом с
`CONTENT_SEARCH_NOT_CONFIGURED` и отвечает `CONTENT_SEARCH_UNAVAILABLE` со
статусом 503. Текст наружу нарочно простой: сообщение исходной ошибки несёт
имена поисковиков и миллисекунды таймаута, а спецификация реестра запрещает
показывать сырое исключение. Причина остаётся в логе, экран читает код.

Панель по этому коду говорит: поисковики сейчас не отвечают, это временный сбой,
а не настройка, повторите через минуту.

# Scope / Routing

Зона записи соблюдена. Константы бюджета поиска не тронуты.

# Verification

См. поле `verification`. Проверка отказа до правки была красной (ошибка уходила
наружу как есть, без кода и статуса).

# Delivery / Cleanup

Возвращено корню волны; ветка потока остаётся до слияния.

# Risks / Follow-ups / Explicit Defers

- Из bead: 8000 мс на запасной поисковик меньше обычного удачного ответа Tavily
  (6–16 с). Не менял: `WEB_SEARCH_PRIMARY_TIMEOUT_MS` и
  `WEB_SEARCH_FALLBACK_TIMEOUT_MS` живут в `ai.clients.ts` и делят один
  20-секундный бюджет с автопостом и помощником. Допущение за владельца:
  расширять общий бюджет ради панели поиска — отдельное решение, оставлено
  открытым.
- `CONTENT_SEARCH_UNAVAILABLE` — код поиска, а не реестра источников; в
  таксономию `content-source-registry-spec.md` он намеренно не добавлен, как и
  `CONTENT_SEARCH_NOT_CONFIGURED` до него.
