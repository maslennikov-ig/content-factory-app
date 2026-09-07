---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: Z4_root_contract
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: потоки Z1, Z2, Z3, Z5 волны «заготовка и адаптации»
public_facade: раздел «Заготовка и адаптации» в voice-wiring.contract.ts, PIECE_ROUTES, PIECE_ERROR_CODES, pieces.fixture.ts
bounded_acceptance: типы компилируются в трёх приложениях; фикстура покрывает все состояния клетки; страж контракта зелёный без правок; пять документов дополнены
non_goals:
  - код сервера, дверей и экранов (Z1–Z6)
  - регистрация в VOICE_SURFACES (страж требует экран в папке brand-voice)
evidence:
  - wiring-contract-guard
task_id: content-factory-next-tu3k.9.1
epic_id: content-factory-next-tu3k.9
stage_id: content-factory-next-fn33
session_id: волна «заготовка и адаптации» 06.09.2026
milestone: заготовка и адаптации
milestone_status: in_progress
agent_type: root
subagent_model: none
reasoning_effort: root
model_reasoning_rationale: контракт — общая правда шести потоков, держится у корня
repo: content-factory-next
branch: wave/pieces-2026-09-07
base_branch: main
base_commit: 5e17b89b
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/{voice-wiring.contract.ts,pieces.fixture.ts}
  - docs/product/{content-section-map.md,content-memory-spec.md,migration-map.md,tariff-levers.md}
  - docs/operations/production-deploy.md
success_criteria:
  - типы заготовки, адаптации, клетки, строки, ответа списка, страницы, интервью, запросов, событий, отказов и маршрутов объявлены аддитивно в конце контракта
  - фикстура: шесть состояний клетки, «ещё N», материал без сути, строка без клеток, площадка без канала, вопросы двух шагов, три стрима
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: работа шла в основном чекауте на ветке волны, worktree нет
risk_level: low
risk_tags:
  - public-api
affected_surfaces:
  - contract
  - docs
invariants:
  - additive-only
docs_impact: behavior
docs_reviewed: updated
verification:
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec jest tests/brand-voice.wiring-contract.test.cjs": passed (23/23)
  - "python3 -m unittest tests/test_docs_links.py": passed
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/pieces.fixture.ts
  - docs/product/content-section-map.md
  - docs/product/content-memory-spec.md
  - docs/product/migration-map.md
  - docs/product/tariff-levers.md
  - docs/operations/production-deploy.md
explicit_defers:
  - none
---

# Summary

Коммит `cda33a86`. Контракт волны дописан в конец `voice-wiring.contract.ts`,
ничего не двигая: `ZagotovkaCoreV1`, `AdaptationV1`, `PieceCellV1` (шесть
состояний плюс `unknown` — «пока не знаем»), `PieceRowV1`/`PiecesResponseV1`
с колонками площадок, `PieceDetailV1` с `targets` (площадка без канала —
`available: false`), интервью (`PieceQuestionV1.suggested`, `PieceAnswerV1`
дословно), запросы, `PieceAdaptEventV1`, добавка к стриму входа
(`IntakeEventWithPieceV1`), `PIECE_ERROR_CODES`, `PIECE_ROUTES`. Создание —
та же дверь входа с необязательными каналами.

# Scope / Routing

Решение: `INTAKE_MAX_QUESTIONS = 2` не трогается; шаг создания заготовки
берёт `PIECE_MAX_QUESTIONS = 3` (Z2). Состояние клетки не хранится —
`AdaptationStateV1` читается из поста.

# Verification

Команды и исходы — в `verification` выше. Платных вызовов нет.

# Delivery / Cleanup

В ветке `wave/pieces-2026-09-07`, не отправлено.

# Risks / Follow-ups

- `search-started` объявлен потоком Z2 в `pieces/intake-events.ts`, а не в контракте; перенос в контракт — при следующей аддитивной правке.
- Владелец не поправил допущения плана: повторная адаптация — новая строка; удаление адаптации опубликованного поста запрещено.
