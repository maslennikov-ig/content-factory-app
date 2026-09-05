---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-E
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration stream for wave/owner-decisions-2026-09-05
public_facade: UnverifiedEvidenceNote в окне поста
bounded_acceptance: окно поста называет число неподтверждённых фрагментов и ведёт на витрину «Откуда факты»
non_goals:
  - менять решение продукта про UNVERIFIED
  - подтверждать фрагменты прямо из окна поста
  - показывать отказы по другим причинам (устарело, противоречит, бюджет)
evidence:
  - new-launch-unverified-evidence
  - design-locale-guards
  - content-intelligence-suites
  - frontend-typecheck
task_id: content-factory-next-fn33.131
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: Генератор честен про материал, отказ виден человеку, черновик один
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: данные из конверта контекста надо провести до окна и сказать словами так, чтобы фраза не врала ни на одном числе
repo: content-factory-next
branch: worktree-agent-a49e5994ac8494368
base_branch: wave/owner-decisions-2026-09-05
base_commit: 874813ccd3e6213c07c0791e9fb535c66bfd8af1
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a49e5994ac8494368
write_zone:
  - apps/frontend/src/components/new-launch/**
  - tests/**
success_criteria:
  - конверт контекста доносит до клиента число отказов с причиной UNVERIFIED
  - окно поста показывает предложение с этим числом и ссылку на витрину
  - у поста без отказов не появляется ничего
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/product/content-memory-spec.md
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
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: правило отбора не менялось, изменилось только то, что о нём говорят человеку
verification:
  - pnpm exec jest tests/new-launch.unverified-evidence.test.cjs: passed
  - pnpm exec jest tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated tests/raw-control.guard tests/content-intelligence tests/compose: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/new-launch/store.ts
  - apps/frontend/src/components/new-launch/compose.copy.ts
  - apps/frontend/src/components/new-launch/unverified-evidence.note.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - tests/new-launch.unverified-evidence.test.cjs
explicit_defers:
  - none
---

# Summary

Окно поста больше не молчит об отказе. Конверт контекста уже нёс `rejected`, но
клиент его выбрасывал: `mergeServerContentContextEnvelope` проверял, что это
массив, и не смотрел внутрь. Теперь он считает отказы с причиной `UNVERIFIED` и
кладёт число в происхождение поста (`unverifiedCount`), а окно печатает под
строкой происхождения предложение «N взятых фрагментов пока не подтверждены и в
текст не попали» со ссылкой на витрину «Откуда факты».

Число считается по одной причине, а не по всем: `UNVERIFIED` — это «взял
поиском, никто не подтвердил», и ровно про это следующий шаг. Остальные причины
(устарело, противоречит, чужая аренда, бюджет) означают другое, и в продукте они
до окна не доходят — контекст с ними встаёт в BLOCKED и генерация обрывается
ошибкой раньше.

# Scope / Routing

Слова живут в `compose.copy.ts` (ru и en), как у соседней строки происхождения:
русское число выбирает слово из трёх, и ключ i18next такого выбора не даёт —
это записано в шапке самого файла и уже стоило продукту одной ошибки
(`fn33.54`). Читатели остальных четырнадцати локалей видят английский, как и
всю строку происхождения рядом. Ссылка открывает витрину в соседней вкладке:
окно держит несохранённый черновик, и уход по ссылке в том же окне потерял бы
его.

# Verification

Новый набор `tests/new-launch.unverified-evidence.test.cjs` был красным до
правки (7 падений из 7). После: 7 зелёных, плюс сторожа дизайна, локалей, сырых
контролов и наборы `tests/content-intelligence` и `tests/compose` (15 наборов,
206 тестов), плюс `tsc --noEmit -p apps/frontend/tsconfig.json`.

# Delivery / Cleanup

Возвращено корневому потоку, ветка не слита.

# Risks / Follow-ups / Explicit Defers

Допущение за владельца: считаются только отказы `UNVERIFIED`; если владелец
захочет, чтобы окно называло и остальные причины, это отдельная фраза и
отдельная задача. Подтвердить фрагмент прямо из окна нельзя — витрина
открывается рядом, а вернуться в черновик человек должен сам.
