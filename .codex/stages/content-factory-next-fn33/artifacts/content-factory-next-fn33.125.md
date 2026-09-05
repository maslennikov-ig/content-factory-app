---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root-integration-wave/walker-p3-2026-09-05
public_facade: n/a
bounded_acceptance: tests/workspace-default-name.test.cjs зелёный на обе половины — сервер и показ
non_goals:
  - схема Prisma не меняется
  - боевые данные не переименовываются и не мигрируются
evidence:
  - workspace-default-name-jest
task_id: content-factory-next-fn33.125
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: зачистка живого прогона владельца
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: правка нескольких поверхностей с тестами и шестнадцатью локалями
repo: content-factory-next
branch: worktree-agent-a73dec396ef7357d8
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a73dec396ef7357d8
write_zone:
  - apps/frontend/src/components/admin/**
  - apps/frontend/src/components/content-intelligence/**
  - libraries/nestjs-libraries/src/database/prisma/{users,organizations}
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - tests/workspace-default-name.test.cjs зелёный на обе половины — сервер и показ
selected_docs:
  - none
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
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: ветка остаётся на слияние корню
risk_level: medium
risk_tags:
  - data
  - ui
  - user-flow
affected_surfaces:
  - backend
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей нет, матрица ролей не меняется
verification:
  - pnpm exec jest tests/workspace-default-name.test.cjs: passed
  - pnpm exec jest tests/backend-locale-strings.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/react-shared-libraries/src/helpers/workspace-name.ts
  - apps/frontend/src/components/layout/organization.selector.tsx
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/workspace-default-name.test.cjs
explicit_defers:
  - none
---

# Summary

Область без имени называется по языку регистрации; данные не переименованы.

# Scope / Routing

Сервер: `newOrganizationData` брал `'Workspace'` литералом, хотя язык регистрации уже
лежал рядом (по нему же именуются стартовые метки). Теперь имя берётся из каталога бэкенда
ключом `workspace_default_name` через `translateBackendText` (не `translateBackendString`:
имя не идёт в HTML). Шестнадцать локалей, ru «Рабочая область», en «Workspace».

Показ: существующие строки данными НЕ переименованы. Миграция не отличит имя, которое
владелец выбрал сам, от запасного, а переписывать чужое имя нельзя. Поэтому
`workspaceDisplayName` подменяет ровно литерал `'Workspace'` (и пустое имя) на переведённое,
а «My Workspace» / «Workspace of Ivan» оставляет как есть. Читают переключатель областей
и список аккаунтов.

Допущение (владелец отсутствует, взято самое консервативное): боевые строки с именем
`Workspace` остаются как есть — правка только показа. Если владелец захочет переименовать
данные, это отдельное решение и отдельный шаг выпуска.

Отклонение от зоны записи: `apps/frontend/src/components/layout/organization.selector.tsx` —
это и есть «где показывается», без него bead не закрывается.

# Verification

Все команды под Node 22.23.2 из `.nvmrc`, в своём worktree.

- `pnpm exec jest tests/workspace-default-name.test.cjs` — passed
- `pnpm exec jest tests/backend-locale-strings.test.cjs` — passed
- `pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs` — passed
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — passed
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — passed

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a73dec396ef7357d8`; слияние и очистка за корнем.

# Risks / Follow-ups / Explicit Defers

Боевые области с именем `Workspace` остаются с этим именем в базе; экран показывает переведённое. Это допущение владельца, не подтверждённое им лично. Если позже решат переименовать данные — понадобится отдельный шаг выпуска, и после него подмена показа станет лишней.
