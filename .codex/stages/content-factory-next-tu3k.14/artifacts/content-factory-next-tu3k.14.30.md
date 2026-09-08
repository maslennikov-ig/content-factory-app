---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: calendar_copy
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.30
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: agent/walk-0908-calendar-copy
base_branch: wave/walk-2026-09-08
base_commit: 7bbc467f
worktree: /home/me/code/cf-walk-0908-calendar-copy
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Clean worktree removed and patch-equivalent branch deleted after delivery verification
risk_level: low
subagent_model: gpt-5.6-luna
reasoning_effort: max
verification:
  - Two focused Jest suites 51 tests passed
changed_files:
  - apps/frontend/src/components/help/help.copy.ts
  - apps/frontend/src/components/layout/top.menu.tsx
  - apps/frontend/src/components/onboarding/onboarding.copy.ts
  - docs/product/help-faq.md
  - tests/content-section.route.test.cjs
  - tests/help.screen.test.cjs
explicit_defers:
  - Combined release acceptance and owner stand approval pending
---
# Summary
Меню шага 3, онбординг и помощь называют раздел Контент / Content. Таблица внутри сохраняет Заготовки. Existing content_section locale key reused. f6c0272c accepted as 55e25660; root inspected labels and preserved the async language fixture.
# Verification
Worker help.screen and content-section.route: 51/51. Root verified clean checkout and git cherry patch equivalence. Full root acceptance follows combined calendar integration.
# Risks / Follow-ups
Beads remains open until the single batch after all streams and owner acceptance. No model calls or schema changes.

Root release-tail correction: actual CalendarContext mocked in Channels tests; new calendar/picker/preview strings follow useInterfaceLanguage, browser title follows Content menu key; design guard follows the real channel-avatar/picker surfaces and toolbar guard preserves all filters. Focused checks114 unique passed across two runs. Full release receipt still pending PDF correction and complete rerun; owner already approved stand.
