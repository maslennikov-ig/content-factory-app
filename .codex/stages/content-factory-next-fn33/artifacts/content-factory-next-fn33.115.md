---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-L2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration of wave/cleanup-2026-09-05
public_facade: n/a
bounded_acceptance: tests/localized-date.test.cjs
non_goals:
  - перевод остальных столбцов экрана аккаунтов
  - перевод экрана команды на общего помощника — файл вне зоны записи
evidence:
  - localized-date-suite
task_id: content-factory-next-fn33.115
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: волна «зачистка» 05.09.2026
milestone: волна «зачистка» 05.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: формат даты, который уже был решён один раз
repo: content-factory-next
branch: worktree-agent-aa746f278ef2c6425
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa746f278ef2c6425
write_zone:
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - libraries/react-shared-libraries/src/helpers/localized.date.ts
  - tests/localized-date.test.cjs
success_criteria:
  - русский экран печатает «04.09.2026, 12:26»
  - экран аккаунтов не форматирует дату сам
  - формат — тот же `L, LT`, что у срока приглашения
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-L2
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка потока остаётся до слияния корнем
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: решение записано в помощнике
verification:
  - pnpm exec jest tests/localized-date.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - libraries/react-shared-libraries/src/helpers/localized.date.ts
  - tests/localized-date.test.cjs
explicit_defers:
  - teams.component.tsx держит свою копию `formatExpiry`: файл вне зоны записи этого потока, перевести его на общего помощника — одна строка при слиянии
---

# Summary

Столбец «Регистрация» печатал `toISOString()`, обрезанный до шестнадцати символов. Срок приглашения на экране команды это уже пережил (`fn33.35`) и печатается через `L, LT` — собственный локализованный формат dayjs, с языком, который выбрал i18next.

Чтобы это не стало вторым написанием одного решения, оно вынесено в общий помощник `formatLocalizedDateTime`, и экран аккаунтов зовёт его. Экран команды пока держит свою копию: `teams.component.tsx` вне зоны записи этого потока. Перевести его — одна строка, и тест это заметит, если форматы разойдутся.

Допущение (владелец уехал): «русский формат» прочитан как `L, LT` — тот, что уже принят у срока приглашения, — а не как отдельный новый формат.

# Scope / Routing

Зона записи и критерии — в заголовке. Документация: внешних источников не требовалось; версия `@copilotkit/react-ui` читалась из `node_modules` этого дерева, остальное — код репозитория. Навыки, агенты и кандидаты каталога не выбирались.

# Verification

Команды и результат перечислены в поле `verification`. Полный `pnpm test` не запускался: волна это запрещает.

# Delivery / Cleanup

Коммит на ветке потока `worktree-agent-aa746f278ef2c6425`. Ветка остаётся до слияния корнем; `bd close` корень делает одной партией.

# Risks / Follow-ups / Explicit Defers

- teams.component.tsx держит свою копию `formatExpiry`: файл вне зоны записи этого потока, перевести его на общего помощника — одна строка при слиянии
