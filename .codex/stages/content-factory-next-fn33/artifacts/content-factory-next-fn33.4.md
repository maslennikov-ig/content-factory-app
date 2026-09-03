---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: task8_luna
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: signed-in person looking for profile and password settings
public_facade: Profile avatar-menu entry and named profile section on /settings
bounded_acceptance: avatar menu opens the profile view, which visibly keeps sign-in and password management on the same settings page
non_goals:
  - account data model changes
  - new password behavior
  - production access
task_id: content-factory-next-fn33.4
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: discoverable profile settings
milestone_status: delivered
agent_type: worker
subagent_model: gpt-5.6-luna
reasoning_effort: medium
model_reasoning_rationale: bounded UI wiring and locale adoption after settings and password foundations exist
repo: content-factory-next
branch: work/walkthrough-2026-09-03
base_branch: main
base_commit: 324e5094e6772d5a6f91aec052b0167a9f582593
worktree: /home/me/code/content-factory-next
write_zone:
  - avatar menu navigation
  - settings profile heading and tab routing
  - sixteen frontend locales
  - focused profile discovery guards
  - affected settings menu tests
  - task artifact
success_criteria:
  - avatar menu has a translated Profile link to the profile settings view
  - profile heading is visible above name and avatar controls
  - password and sign-in methods remain discoverable from the same page
  - locale hint and design guards remain green
selected_docs:
  - docs/prompts/codex-live-walkthrough-fixes.md
  - docs/design/component-inventory.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - superpowers-test-driven-development
  - impeccable
  - lazyweb
selected_agents:
  - worker
catalog_candidates:
  - existing-avatar-menu
  - existing-settings-tabs
parallel_group: none
depends_on_streams:
  - content-factory-next-yyiy
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree only; no extra runtime or worktree remains
risk_level: low
risk_tags:
  - navigation
  - localization
affected_surfaces:
  - ui
  - user-flow
invariants:
  - same-settings-page
  - no-password-behavior-change
docs_impact: none
docs_reviewed: yes
docs_review_notes: component inventory and authoring rules reviewed; existing primitives reused
verification:
  - focused profile-discovery RED and GREEN
  - locale hint and design guards
  - frontend TypeScript check
  - git diff check
changed_files:
  - apps/frontend/src/components/new-layout/sidebar.tsx
  - apps/frontend/src/components/layout/settings.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/profile-entry.test.cjs
  - .codex/stages/content-factory-next-fn33/stage-manifest.json
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-fn33.4.md
explicit_defers:
  - none
---

# Summary

В нижней account-области текущего shell появилась постоянная ссылка
`Профиль` на `/settings?tab=profile`. Профильная вкладка явно названа,
показывает имя и аватар, даёт сохранить изменения и ведёт к смене
пароля на той же странице. Ключ `profile` есть во всех 16 локалях.

# Verification

- RED: `tests/profile-entry.test.cjs` не находил ссылку, вкладку и заголовок.
- GREEN: profile + hint + design + contrast + locale guards — 5 suites, 39 tests.
- `pnpm --dir apps/frontend exec tsc --noEmit` — exit 0.
- `git diff --check` — exit 0.

# Risks / Follow-ups

Текущий shell не имеет отдельного avatar-dropdown; его эквивалент — всегда видимая
account-область sidebar. Ссылка размещена там без создания второго меню. Браузерный
прогон с авторизованным аккаунтом не выполнялся; это ручная проверка перед поставкой.

## Attempts

- `task8_luna`: `404 Not Found` от Codex responses API.
- повтор `task8_luna`: тот же `404 Not Found`.
- чистая сессия `task8_luna_retry`: тот же `404 Not Found`.
- после восстановления Luna тот же поток выполнил работу и вернул GREEN.

## Assumptions

- После трёх одинаковых сбоев задача была корректно отложена, но возобновлена той же Luna до конца прогона.
- Отдельный avatar-dropdown не создавался: account-footer — текущая постоянная область аккаунта.
