---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: s5_copy
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.22
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: agent/walk-0908-S5
base_branch: wave/walk-2026-09-08
base_commit: 38f061c2
worktree: /home/me/code/cf-walk-0908-S5
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: worktree and branch removed after clean status and patch-equivalence verification; owner authorized 08.09
risk_level: low
subagent_model: gpt-5.6-luna
reasoning_effort: max
verification:
  - ai.provider.component and help.screen focused Jest 33/33 passed
  - RU/EN JSON and copy checked
  - git diff --check passed
changed_files:
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - apps/frontend/src/components/help/help.copy.ts
  - docs/product/help-faq.md
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - libraries/react-shared-libraries/src/translation/locales/en/translation.json
  - tests/ai.provider.component.test.cjs
  - tests/help.screen.test.cjs
explicit_defers:
  - none
evidence:
  - s5-focused-jest
---
# Summary
Расход ИИ назван явно в RU/EN и в fallback. FAQ и /help описывают настоящий порядок таблиц и пустые состояния. Доставлено 4105026a + 218c70eb; принято root в 89dc10f8 + cf4175fb после просмотра diff. Beads закрывается общей партией после всех потоков.
# Verification
Luna: 33/33 focused Jest, JSON/copy, diff check. Root просмотрел diff; полная приёмка впереди.
# Risks / Follow-ups
S4/S6/S7 добавляют свои изменения FAQ; при слиянии сохранить вопрос о расходе.
