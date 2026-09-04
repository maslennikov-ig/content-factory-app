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
task_id: content-factory-next-fn33.63
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
  - docs/product/roles-matrix.md
  - tests/content-leads.role-visibility.test.cjs
success_criteria:
  - Редактору не открывают форму ленты, которую сервер отклонит
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
risk_level: medium
risk_tags:
  - authorization
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
docs_impact: behavior
docs_reviewed: behavior
docs_review_notes: docs/product/roles-matrix.md: абзац о трёх дверях подписок и о том, что видит участник.
verification:
  - pnpm exec jest tests/content-leads.role-visibility.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - docs/product/roles-matrix.md
  - tests/content-leads.role-visibility.test.cjs
explicit_defers:
  - none
---

# Summary

Три двери подписок администраторские, а кнопка «Указать ленту» была живой: человек заполнял форму и получал 403 только после «Сохранить». Участник больше не видит «Добавить подписку», «Проверить сейчас» и «Отписаться», кнопка в пустом состоянии выключена, а над списком стоит строка о чтении — слово в слово как на «Аватарах». Признак — общий `isOrganizationAdmin(user?.role)`, без второго мнения о том, кто администратор.

# Scope / Routing

Зона записи — файлы выше. Внешняя документация не поднималась: правка опирается
на решения владельца в `docs/product/content-section-map.md` §3–§10, на матрицу
ролей и на приёмы, уже принятые в этом репозитории. Модель и усилие — по роли
исполнителя. Поток шёл параллельно с остальными потоками волны 04.09.2026;
пересечений по файлам с ними не заявлено.

# Verification

- `pnpm exec jest tests/content-leads.role-visibility.test.cjs` — passed
- `pnpm exec jest tests/roles-matrix.guard.test.cjs` — passed

Новый тест сначала падал без правки, потом проходил; это показано в отчёте потока.

# Delivery / Cleanup

Возвращено корню на слияние. Ветка потока не слита, каталог worktree не убран.

# Risks / Follow-ups / Explicit Defers

Остаточных рисков за пределами беды не осталось.
