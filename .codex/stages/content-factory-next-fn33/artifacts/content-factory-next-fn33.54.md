---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L-content-section
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: pnpm exec jest tests/content-leads.role-visibility.test.cjs
non_goals:
  - переработка раздела за пределами названной беды
  - изменение контрактов дверей и схемы базы
evidence:
  - none
task_id: content-factory-next-fn33.54
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
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - tests/content-leads.role-visibility.test.cjs
success_criteria:
  - Счётные строки склоняются по числу
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
docs_review_notes: Только текст.
verification:
  - pnpm exec jest tests/content-leads.role-visibility.test.cjs: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - tests/content-leads.role-visibility.test.cjs
explicit_defers:
  - Третье место из комментария к беде — `libraries/nestjs-libraries/src/content-intelligence/brand-voice/brief-gate.ts:159`, «1 подтверждённых фактов уже есть» — не тронуто: файл вне зоны записи потока. Правка в одну строку: `${n} ${plural(n, ['подтверждённый факт', 'подтверждённых факта', 'подтверждённых фактов'])} уже есть`.
---

# Summary

«за месяц: 2 поводов» и «постов: 1» — число подставлялось без выбора формы слова. Обе строки считают через общий `plural`, ту же тройку форм, которой уже считаются образцы манеры.

# Scope / Routing

Зона записи — файлы выше. Внешняя документация не поднималась: правка опирается
на решения владельца в `docs/product/content-section-map.md` §3–§10, на матрицу
ролей и на приёмы, уже принятые в этом репозитории. Модель и усилие — по роли
исполнителя. Поток шёл параллельно с остальными потоками волны 04.09.2026;
пересечений по файлам с ними не заявлено.

# Verification

- `pnpm exec jest tests/content-leads.role-visibility.test.cjs` — passed

Новый тест сначала падал без правки, потом проходил; это показано в отчёте потока.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка потока не слита, каталог worktree не убран.

# Risks / Follow-ups / Explicit Defers

Третье место из комментария к беде — `libraries/nestjs-libraries/src/content-intelligence/brand-voice/brief-gate.ts:159`, «1 подтверждённых фактов уже есть» — не тронуто: файл вне зоны записи потока. Правка в одну строку: `${n} ${plural(n, ['подтверждённый факт', 'подтверждённых факта', 'подтверждённых фактов'])} уже есть`.
