---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L-content-section
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: pnpm exec jest tests/content-intelligence.facts-door.test.cjs
non_goals:
  - переработка раздела за пределами названной беды
  - изменение контрактов дверей и схемы базы
evidence:
  - none
task_id: content-factory-next-fn33.58
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: живой прогон владельца 03–04.09.2026
milestone: раздел «Контент»: поводы, бриф, факты
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правки по чужому коду с разбором причины на живом стенде
repo: content-factory-next
branch: worktree-agent-ac77c3c38c4f1c25b
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ac77c3c38c4f1c25b
write_zone:
  - apps/frontend/src/components/content-intelligence/content-facts.container.tsx
  - apps/frontend/src/components/content-intelligence/content-facts.adapter.ts
  - tests/content-intelligence.facts-door.test.cjs
success_criteria:
  - Дату факта видно в порядке пользователя
selected_docs:
  - docs/product/content-section-map.md §8–§10
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока ждёт слияния корнем
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Поведение нативного виджета описано в комментарии кода.
verification:
  - pnpm exec jest tests/content-intelligence.facts-door.test.cjs: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-facts.container.tsx
  - apps/frontend/src/components/content-intelligence/content-facts.adapter.ts
  - tests/content-intelligence.facts-door.test.cjs
explicit_defers:
  - Сам плейсхолдер mm/dd/yyyy остаётся за браузером. Убрать его можно только отказавшись от нативного поля даты — это отдельное решение и отдельная работа.
---

# Summary

`<input type="date">` показывает значение в локали браузера, а не страницы — это записано в MDN и не переопределяется атрибутом, поэтому запретить американский порядок в пустом поле со страницы нельзя. Что сделано: выбранная дата продублирована под полем в порядке раздела (`readableDate`, «31.12.2026»), и полю проставлен `lang` для браузеров, которые его учитывают. Форматируется вручную, без `Intl`: `new Date('2026-12-31')` — полночь UTC, и западнее Гринвича человек прочёл бы предыдущий день.

# Scope / Routing

Зона записи — файлы выше. Внешняя документация не поднималась: правка опирается
на решения владельца в `docs/product/content-section-map.md` §3–§10, на матрицу
ролей и на приёмы, уже принятые в этом репозитории. Модель и усилие — по роли
исполнителя. Поток шёл параллельно с остальными потоками волны 04.09.2026;
пересечений по файлам с ними не заявлено.

# Verification

- `pnpm exec jest tests/content-intelligence.facts-door.test.cjs` — passed

Новый тест сначала падал без правки, потом проходил; это показано в отчёте потока.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка потока не слита, каталог worktree не убран.

# Risks / Follow-ups / Explicit Defers

Сам плейсхолдер mm/dd/yyyy остаётся за браузером. Убрать его можно только отказавшись от нативного поля даты — это отдельное решение и отдельная работа.
