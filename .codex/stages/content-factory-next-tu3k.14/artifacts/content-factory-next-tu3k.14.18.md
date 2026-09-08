---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: s4_piece_table
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.18
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: agent/walk-0908-S4
base_branch: wave/walk-2026-09-08
base_commit: cf4175fb
worktree: /home/me/code/cf-walk-0908-S4
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: clean worktree removed after accepted integration and reviewed conflict resolution
risk_level: medium
subagent_model: gpt-6-astra
reasoning_effort: high
verification:
  - 13 focused suites 257 tests; final table 19 tests; frontend tsc zero; diff check passed
changed_files:
  - apps/frontend/src/components/content-intelligence/content-archive.adapter.ts
  - apps/frontend/src/components/content-intelligence/content-archive.container.tsx
  - apps/frontend/src/components/content-intelligence/content-search-words.tsx
  - apps/frontend/src/components/content-intelligence/content-section.copy.ts
  - apps/frontend/src/components/content-intelligence/content-section.review-scene.tsx
  - apps/frontend/src/components/content-intelligence/content-section.screen.tsx
  - apps/frontend/src/components/content-intelligence/pieces/adaptation.cell.tsx
  - apps/frontend/src/components/content-intelligence/pieces/piece-channel-profile.tsx
  - apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx
  - apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx
  - apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts
  - apps/frontend/src/components/content-intelligence/pieces/pieces.container.tsx
  - apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx
  - apps/frontend/src/components/help/help.copy.ts
  - apps/frontend/src/components/ui/table.tsx
  - docs/design/component-inventory.md
  - docs/product/help-faq.md
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/search/text-search.index.ts
  - tests/content-archive.role.test.cjs
  - tests/content-archive.screen.test.cjs
  - tests/content-facts.read-only.test.cjs
  - tests/content-leads.role-visibility.test.cjs
  - tests/content-pieces.container.test.cjs
  - tests/content-pieces.screen.test.cjs
  - tests/content-pieces.service.test.cjs
  - tests/content-section-tabs.boundary.guard.test.cjs
  - tests/content-section.route.test.cjs
  - tests/text-search.test.cjs
explicit_defers:
  - owner stand acceptance and release pending
---
# Summary
S4 7919d140 accepted as 1089de95. Unified adaptation with exact identity, row navigation without paid calls, archived filter, stem matches and snippets, removed redundant frontend archive view.
# Verification
13 suites 257 tests; final table 19 tests; frontend tsc zero; diff check passed. Root preserved S3 coreAnswer/options/inputSources and S2 heartbeat, joined inventory additions.
# Risks / Follow-ups
S7 renderReview slot is present; clear draft by adaptationId on accept. S6 content-section conflicts next. QualityLine silence for transient unavailable/clean checks remains intentional. Backend archive API and index preserved.
