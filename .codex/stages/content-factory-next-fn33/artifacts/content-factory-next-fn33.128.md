---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root-integration-wave/walker-p3-2026-09-05
public_facade: n/a
bounded_acceptance: tests/content-leads.subscription-controls.test.cjs — кнопка disabled при feedCheck=false и живая при true
non_goals:
  - схема Prisma не меняется
  - боевые данные не переименовываются и не мигрируются
evidence:
  - content-leads-subscription-controls-jest
task_id: content-factory-next-fn33.128
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
  - tests/content-leads.subscription-controls.test.cjs — кнопка disabled при feedCheck=false и живая при true
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
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: новых дверей и ролей нет, матрица ролей не меняется
verification:
  - pnpm exec jest tests/content-leads.subscription-controls.test.cjs: passed
  - pnpm exec jest tests/content-leads.role-visibility.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - tests/content-leads.subscription-controls.test.cjs
explicit_defers:
  - none
---

# Summary

«Проверить сейчас» выключается тем же признаком, что и соседний «Указать канал».

# Scope / Routing

Экран уже знал про флаг: `capabilities.feedCheck` приходит в конверте списка подписок
и читается как `feedCheckEnabled` — на нём держится баннер над списком. Строка подписки
этого признака не получала, поэтому кнопка оставалась живой и отвечала `CHECK_DISABLED`.
Теперь `SubscriptionRowView` принимает `checkEnabled`, кнопка выключается вместе с проверкой,
и рядом стоит `Status` со словами «выключено на этом сервере» — ровно теми же, что на карточке
«Телеграм-канал». Выключена, а не спрятана: строка и её расписание остаются читаемыми.

«Отписаться» флаг не трогает — архивирование работает и при выключенной проверке; на это есть
отдельный тест.

# Verification

Все команды под Node 22.23.2 из `.nvmrc`, в своём worktree.

- `pnpm exec jest tests/content-leads.subscription-controls.test.cjs` — passed
- `pnpm exec jest tests/content-leads.role-visibility.test.cjs` — passed
- `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs` — passed

# Delivery / Cleanup

Возвращено корню на ветке `worktree-agent-a73dec396ef7357d8`; слияние и очистка за корнем.

# Risks / Follow-ups / Explicit Defers

Нет. Признак тот же самый, что уже держал баннер.
