---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: root_calendar
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.29
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: wave/walk-2026-09-08
base_branch: wave/walk-2026-09-08
base_commit: 7bbc467f
worktree: /home/me/code/content-factory-next
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Both clean worktrees removed and patch-equivalent branches deleted after delivery verification
risk_level: medium
verification:
  - UI frontend tsc and 96 unique focused tests passed
changed_files:
  - apps/backend/src/api/routes/content-piece.controller.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/ready-adaptations.contract.ts
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts
  - libraries/nestjs-libraries/src/dtos/posts/get.posts.dto.ts
  - libraries/nestjs-libraries/src/dtos/posts/get.posts.list.dto.ts
  - tests/content-intelligence.consumer-backend.test.cjs
  - tests/content-piece.routes.test.cjs
  - tests/content-pieces.service.test.cjs
  - tests/editorial-stage.filter.test.cjs
  - apps/frontend/src/components/channels/channel-screen.tsx
  - apps/frontend/src/components/channels/channels-screen.tsx
  - apps/frontend/src/components/content-intelligence/shared/use-open-post.tsx
  - apps/frontend/src/components/launches/adaptation-picker.tsx
  - apps/frontend/src/components/launches/calendar-planning.copy.ts
  - apps/frontend/src/components/launches/calendar.context.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - apps/frontend/src/components/launches/filters.tsx
  - apps/frontend/src/components/launches/launches.component.tsx
  - apps/frontend/src/components/preview/post.preview.dialog.tsx
  - docs/design/component-inventory.md
  - docs/product/content-section-map.md
  - tests/calendar-adaptation-picker.test.cjs
  - tests/compose-needs-channel.test.cjs
  - tests/content-leads.role-visibility.test.cjs
  - tests/conveyor-navigation.guard.test.cjs
  - tests/design-geometry-allowlist.json
  - tests/design-typography-allowlist.json
  - tests/design.guard.test.cjs
  - tests/launches.channel-rail.test.cjs
  - tests/tooltip-allowlist.json
explicit_defers:
  - Combined release acceptance and owner stand approval pending
---
# Summary
Protected post provenance in calendar preview. Aggregate task artifact holds UI and API contributions, without duplicate task entries. UI stream calendar_ui / Astra Medium: 88c88abb accepted as 3770097a. Root inspected shared editor opt-in arguments and filter persistence; remaining API integration is required for the task.
# Verification
UI: frontend tsc exit0, 9 suites92 tests then final picker/provenance tail12/12 (96 unique tests), diff check passed. Exact legacy rail allowances removed, none added. Browser and full root release acceptance follow integration.
# Risks / Follow-ups
Owner must approve actual localhost:4200 stand before release. Plus has no selected date; cell preserves exact date. Existing Status used for readiness, existing modal for preview. No schema, public preview contract, paid calls or writes from picker.

API calendar_api / Sol High: eaa31051 accepted as f728f92f. Ready versioned envelope, tenant/DRAFT/nondeleted post and integration; protected piece in compact posts/list/group; channel filter before list rows/count pagination. Root inspected repository mappings and joined tenant/customer/channel guards. Worker 104 Jest + 12 Node tests, backend tsc, diff check passed. No live proof claimed by worker; root stand probe follows.

Root release-tail correction: actual CalendarContext mocked in Channels tests; new calendar/picker/preview strings follow useInterfaceLanguage, browser title follows Content menu key; design guard follows the real channel-avatar/picker surfaces and toolbar guard preserves all filters. Focused checks114 unique passed across two runs. Full release receipt still pending PDF correction and complete rerun; owner already approved stand.
