---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task3_terra
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: workspace member or editor opening settings
public_facade: settings tab list and direct-tab restricted state
bounded_acceptance: settings visibility matches the role matrix without new role comparisons
non_goals:
  - backend permission changes
  - invitation flow changes
  - production access
task_id: content-factory-next-fn33.2
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: role-aware settings navigation
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: role-aware UX judgment inside the settings subsystem
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 1f9d9938c8659b29564d88472f5eb2530a701341
worktree: /home/me/code/content-factory-next
write_zone:
  - settings layout and nested settings blocks
  - roles matrix settings screen section
  - focused role visibility guards
  - sixteen frontend locales if new keys are required
  - task artifact
success_criteria:
  - USER and EDITOR see only allowed settings tabs and blocks
  - ADMIN sees the documented administrative tabs
  - direct hidden tab shows a calm administrator-role explanation
  - isOrganizationAdmin is the only role decision helper
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
  - docs/product/roles-matrix.md
  - docs/design/component-authoring-rules.md
  - https://www.lazyweb.com/agentic-search/cf72dd51-664b-42a7-9ced-28699e7834cc
selected_skills:
  - superpowers-test-driven-development
  - impeccable
  - lazyweb
selected_agents:
  - worker
catalog_candidates:
  - existing-restricted-state
  - existing-role-helper
parallel_group: none
depends_on_streams:
  - content-factory-next-fn33.3
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared branch stream; no separate worktree or runtime remained
risk_level: medium
risk_tags:
  - authorization
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: roles matrix gains the canonical settings screen visibility table
verification:
  - focused role visibility RED and GREEN recorded
  - frontend TypeScript check passed
  - locale, foundation and design guards passed
  - git diff --check passed
changed_files:
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-fn33.2.md
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/settings/global.settings.tsx
  - docs/product/roles-matrix.md
  - tests/roles-matrix.guard.test.cjs
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
explicit_defers:
  - none
---

# Summary

Результат Терры принят: навигация настроек теперь соответствует матрице ролей.

# Verification

Ожидаются RED→GREEN страж матрицы/вкладок, direct-tab restricted-state,
локали/дизайн и frontend TypeScript.

# Risks / Follow-ups

Серверные двери уже отказывают по матрице; задача меняет только честность UI и
не должна создавать новую систему прав.

## Delivery

- RED: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/roles-matrix.guard.test.cjs --runInBand` завершился с тремя ожидаемыми падениями: не было раздела «Экран настроек» в матрице, вкладки и короткие ссылки не использовали `isOrganizationAdmin`, а `?tab=teams` не обрабатывался как ограниченное состояние.
- GREEN: тот же focused guard — 43 теста, 1 suite, все зелёные.
- `USER` и `EDITOR` видят согласованный набор обычных вкладок; `ADMIN` и `SUPERADMIN` дополнительно видят «Команды» и «Разработчики». Внутри глобальных настроек AI и короткие ссылки отрисовываются только для результата `isOrganizationAdmin(user?.role)`.
- Обычный сценарий: участник открывает `/settings` и не получает вкладок команды или разработчиков, а AI и короткие ссылки не запрашиваются и не отрисовываются в глобальных настройках.
- Сценарий отказа: участник или редактор открывает `/settings?tab=teams` либо `/settings?tab=api` и получает `RestrictedState` с объяснением о необходимости роли администратора; серверные права и ответы не менялись.
- Граничный сценарий: `ADMIN` и `SUPERADMIN` проходят через единственный общий helper и получают обе административные вкладки; неизвестная роль остаётся неадминистраторской по существующему helper.
- Новые ключи ограничения добавлены во все 16 shipped locale-файлов.

## Verification

```text
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/roles-matrix.guard.test.cjs --runInBand
PASS — 1 suite, 43 tests

PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/locale-key-set.test.cjs tests/foundation.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs --runInBand
PASS — 4 suites, 52 tests

PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --filter ./apps/frontend exec tsc --noEmit
exit 0

git diff --check
exit 0
```

## Assumptions and defers

- External/versioned dependency contract: none. The current local role matrix, existing `isOrganizationAdmin` helper and settings components settle the behavior.
- Graphify was used only as stale read-only orientation (report commit `94fdcb33`); current source was inspected before editing.
- No backend authorization, invitation behavior, proxy, production configuration, deployment, push, merge or Beads state was changed.
- `content_intelligence` was not in the required role matrix, so its obsolete signpost is no longer a visible settings tab; its existing direct-route explanation remains outside this task's authorization model.
