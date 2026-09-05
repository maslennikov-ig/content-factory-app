---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-A3
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: agent.graph.service / autopost.service (сборка промпта генерации)
public_facade: n/a
bounded_acceptance: выученные правила доходят до промпта генерации; целевые наборы и оба tsc зелёные
non_goals:
  - новые двери, роли моделей, флаги и таблицы
  - изменение schema.prisma
  - удаление text-check/repair и правки ai.roles.ts
evidence:
  - learned-rules-in-prompt
  - learn-prompt-fence
  - learn-window-leftover
  - editor-wording
task_id: content-factory-next-fn33.28.19.1
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: аватар учится на правках и это видно в черновике
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: правка задевает промпт генерации и изоляцию арендаторов
repo: content-factory-next
branch: worktree-agent-ac09b92f61f217e83
base_branch: wave/owner-decisions-2026-09-05
base_commit: d46e8931
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ac09b92f61f217e83
write_zone:
  - libraries/nestjs-libraries/src/agent/voice-directives.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/**
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/**
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - tests/**
  - docs/product/brand-voice-from-samples-spec.md
success_criteria:
  - effectiveVoice.learnedRules собирается из колонки профиля с organizationId в условии
  - группа строк появляется в промпте после привычек и до примеров, пустой список ничего не добавляет
  - материал обучения огорожен, задача идёт после ограды
  - остаток пачки сверх окна не пропадает
  - тексты про право менять голос называют редактора
selected_docs:
  - docs/product/brand-voice-from-samples-spec.md
  - AGENTS.md, CLAUDE.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-owner-decisions-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: временные копии исходников лежат в scratchpad потока, в дерево не попали
risk_level: medium
risk_tags:
  - tenancy
  - public-api
  - ui
affected_surfaces:
  - backend
  - ui
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: §10.2 (окно и отметка, ограда запроса), §10.5 (место в промпте), §11 (четыре новые строки проверок)
verification:
  - "pnpm exec jest tests/agent.voice-directives tests/generator.voice-single-source tests/brand-voice tests/role.refusal tests/ai-role-routing tests/tenant-isolation.guard tests/roles-matrix.guard tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated": passed
  - "node --test --test-concurrency=1 tests/brand-profile.contract.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "python3 -m unittest tests.test_docs_links": passed
changed_files:
  - libraries/nestjs-libraries/src/agent/voice-directives.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.context.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.types.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-learning.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-edit.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts
  - apps/frontend/src/components/brand-voice/voice-copy.ts
  - docs/product/brand-voice-from-samples-spec.md
  - tests/agent.voice-directives.test.cjs
  - tests/brand-profile.contract.test.cjs
  - tests/brand-voice.learning.test.cjs
  - tests/brand-voice.wizard.test.cjs
  - tests/generator.voice-single-source.test.cjs
  - tests/role.refusal.test.cjs
explicit_defers:
  - none
---

# Summary

Выученные на правках правила доходят до промпта генерации. Колонка
`ProjectBrandProfile.learnedRules` читается там же, где уже читается профиль —
`getActiveRuntimeVersion` и `getPublishedRuntimeVersion` привозят строку целиком с
`organizationId` в условии, — разбирается одним `parseLearnedRules` и ложится в
`effectiveVoice.learnedRules: string[]`. Второго запроса нет. Правил нет — нет и ключа: голос
аватара, который ничему не научился, побайтно тот же, что и раньше.

В промпте появилась одна группа строк, после привычек и перед цитатами автора, в обоих блоках —
аватарном и описательном. Правила стоят в кавычках-ёлочках, как цитаты автора: это текст человека,
попавший в инструктивную часть промпта, и вровень со строками продукта он стоять не должен.

По замечаниям рецензента доделаны три вещи: материал в запросе обучения огорожен маркерами и задача
переехала за закрывающий маркер; окно берёт самые старые тридцать пар, а отметка «разобрано по»
встаёт по последней взятой паре, поэтому остаток не пропадает; подписи про право менять голос
называют редактора.

# Scope / Routing

Зона записи соблюдена: файлов вне неё не тронуто. Схема не менялась. Новых дверей, ролей моделей и
флагов нет. `ai.roles.ts`, text-check и repair не тронуты.

Циклического импорта `brand-profile ↔ brand-voice` нет: `voice-learning.ts` не импортирует ничего,
кроме `zod`, поэтому отдельный общий модуль `learned-rules.ts` не заводился — по условию задачи он
нужен был только при цикле.

# Verification

Красное до исправления показано трижды:

- `pnpm exec jest tests/agent.voice-directives -t "what the author keeps correcting"` на исходном
  `voice-directives.ts` — 5 упало, 1 прошло (случай «ничему не научился» проходит и должен).
- `node --test --test-name-pattern="only from its own space" tests/brand-profile.contract.test.cjs`
  на исходном `brand-profile.context.service.ts` — 1 упало.
- `pnpm exec jest tests/brand-voice.learning` на исходных `voice-learning.ts`,
  `voice-edit.repository.ts`, `voice.service.ts` — 3 упало (ограда, подделка маркера, остаток пачки).

Зелёное после: 64 набора / 1164 теста jest, 13 тестов node:test, оба `tsc --noEmit` без ошибок,
`tests.test_docs_links` — 3 теста.

# Delivery / Cleanup

Один коммит на ветке потока. Слияние и закрытие bead — за root.

# Risks / Follow-ups / Explicit Defers

- `lastRunAt` сменил смысл с «когда учились» на «докуда разобрано». Подпись на экране аватара
  приведена в соответствие («Правки разобраны по …» / «Edits read up to …»), но у аватаров, которые
  уже учились до этого выпуска, отметка осталась старой, по времени прогона. Это безопасно в одну
  сторону: она не раньше материала, поэтому ничего лишнего не будет разобрано дважды.
- `substantivePairs` сменил порядок на «самые старые первыми». Второй читатель у метода —
  `substantiveCount`, ему порядок безразличен.
- Ограда `<<< PAIRS` / `>>> END OF PAIRS` одна на оба языка; из текста человека вырезаются угловые
  тройки. Осмысленный текст от этого не страдает, но пост, где автор сознательно писал `>>>`,
  увидит вместо них `·`.
