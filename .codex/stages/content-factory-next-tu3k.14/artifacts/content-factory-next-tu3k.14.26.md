---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: root_channels
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.26
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: wave/walk-2026-09-08
base_branch: wave/walk-2026-09-08
base_commit: f748abb5
worktree: /home/me/code/content-factory-next
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: All three clean worktrees removed after delivery verification; UI inventory conflict reviewed
risk_level: medium
verification:
  - API backend tsc and 3 Jest suites 127 tests passed
changed_files:
  - apps/backend/src/api/routes/integrations.controller.ts
  - apps/frontend/src/app/(app)/(site)/channels/[id]/page.tsx
  - apps/frontend/src/app/(app)/(site)/channels/page.tsx
  - apps/frontend/src/components/channels/channel-menu.tsx
  - apps/frontend/src/components/channels/channel-model.ts
  - apps/frontend/src/components/channels/channel-parts.tsx
  - apps/frontend/src/components/channels/channel-screen.tsx
  - apps/frontend/src/components/channels/channel-writing-profile.tsx
  - apps/frontend/src/components/channels/channels-screen.tsx
  - apps/frontend/src/components/channels/channels.copy.ts
  - apps/frontend/src/components/content-intelligence/intake/writing-profile.card.tsx
  - apps/frontend/src/components/content-intelligence/intake/writing-profile.fields.tsx
  - apps/frontend/src/components/launches/add.provider.component.tsx
  - apps/frontend/src/components/launches/calendar.context.tsx
  - apps/frontend/src/components/launches/launches.component.tsx
  - apps/frontend/src/components/launches/menu/menu.tsx
  - docs/design/component-inventory.md
  - docs/product/content-section-map.md
  - libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts
  - libraries/nestjs-libraries/src/dtos/integrations/channel.posts.query.dto.ts
  - tests/channel-writing-profile.frontend.test.cjs
  - tests/channels.section.test.cjs
  - tests/integrations.channel-posts.routes.test.cjs
  - tests/integrations.writing-profile.routes.test.cjs
  - tests/launches.channel-rail.test.cjs
  - tests/role-read-only-screens.test.cjs
explicit_defers:
  - Root combined acceptance and explicit owner stand approval before release
---
# Summary
Aggregate task 26 keeps all three implementation streams in one task artifact; Beads remains in progress.

API: channels_api / Sol High, worktree /home/me/code/cf-walk-0908-channels-api, branch agent/walk-0908-channels-api. Commit 8b07a63c accepted by root as b7c9c282. Tenant-scoped bounded recent-post endpoint and list summaries share filters and explicit secret-free selections. Root inspected controller/repository diff and reused worker evidence. Clean status and patch-equivalent commit confirmed before removing API worktree and branch.

# Verification
API backend tsc --noEmit passed; route, writing-profile, roles suites 127/127 passed; diff check and clean worktree confirmed by worker. Root HTTP probe against real local database: list 200, one channel, normalized profile present; posts 200 with one row, count matches list summary, limit 11 returns 400. No content, credentials or channel identifiers written to evidence. All implementation streams integrated; owner approval and full root release acceptance pending.

# Risks / Follow-ups
Owner must explicitly approve new Channels on localhost:4200 before release. Group assignment stays in existing channel menu after connect; pieces link has no channel filter because none exists. No schema change or paid calls.

Profile: channels_profile / Sol High, 6ebb1c1a accepted as a039610e; frontend tsc, 25 profile tests and 26 design/foundation checks passed. UI: channels_ui / Astra Medium, fef33d8f accepted as af7d3063; 89 tests passed then 22 tests including three added role cases passed. UI isolated tsc had only the now-integrated profile import unresolved. Inventory append conflict preserves both component groups and replaces obsolete rail routing description. Root inspected main page and callback wiring; combined root acceptance follows.

Root Windows Chrome read-only UI check on actual local data: HTTP 200, table has header plus one real channel, table view persists after reload, all four desktop panels visible, four mobile tabs at 390 px, no horizontal overflow, no page errors. Synthetic component fixtures cover the three-channel attention-filter scenario separately.

Root follow-up in same browser check: profile Edit opens inline with no dialog, Cancel returns to view; mobile list has no view switch. Owner Channels tab opened and explicit acceptance question is pending.

Owner correction: replace ambiguous group-connection tile with one full-area ControlButton, clear RU/EN Connect a new channel label, plus icon and hover/focus feedback. No nested button. Root Windows browser clicked blank corner of 568x235 tile: existing provider catalog opened (35 buttons), zero nested buttons; no provider connection or paid action. Third full release acceptance on e3d1cdb4 stopped at Jest after three-app tsc/build passed, because this correction changes source. Rerun full acceptance only after owner approval of corrected section.

Root final-acceptance corrections: profile uses permitted12px spacing; navigation guard expects the dedicated directory/detail. Separate pre-existing test fixtures now switch actual browser i18next language and keep nginx test-only bucket refill slower than the probe. Production nginx rate and limiter assertions unchanged. Four affected suites76/76 passed; full acceptance still required.

Root release-tail correction: actual CalendarContext mocked in Channels tests; new calendar/picker/preview strings follow useInterfaceLanguage, browser title follows Content menu key; design guard follows the real channel-avatar/picker surfaces and toolbar guard preserves all filters. Focused checks114 unique passed across two runs. Full release receipt still pending PDF correction and complete rerun; owner already approved stand.
