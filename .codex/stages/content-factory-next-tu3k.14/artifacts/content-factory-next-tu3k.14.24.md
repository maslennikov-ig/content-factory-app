---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: s7_review
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.24
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: agent/walk-0908-S7
base_branch: wave/walk-2026-09-08
base_commit: cf4175fb
worktree: /home/me/code/cf-walk-0908-S7
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: clean worktree removed after accepted integration and reviewed conflict resolution
risk_level: medium
subagent_model: gpt-6-astra
reasoning_effort: high
verification:
  - 8 focused suites 158 tests; backend/frontend tsc zero; frontend used agreed temporary S4 slot type; diff check passed
changed_files:
  - apps/backend/src/api/routes/content-piece.controller.ts
  - apps/frontend/src/components/content-intelligence/pieces/adaptation-review.tsx
  - apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx
  - apps/frontend/src/components/help/help.copy.ts
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - apps/frontend/src/components/settings/ai-provider.copy.ts
  - docs/design/component-inventory.md
  - docs/product/help-faq.md
  - docs/product/tariff-levers.md
  - libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-review.contract.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-review.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts
  - libraries/nestjs-libraries/src/dtos/content-intelligence/adaptation-review.dto.ts
  - libraries/nestjs-libraries/src/openai/ai.roles.ts
  - libraries/react-shared-libraries/src/translation/locales/ar/translation.json
  - libraries/react-shared-libraries/src/translation/locales/bn/translation.json
  - libraries/react-shared-libraries/src/translation/locales/de/translation.json
  - libraries/react-shared-libraries/src/translation/locales/en/translation.json
  - libraries/react-shared-libraries/src/translation/locales/es/translation.json
  - libraries/react-shared-libraries/src/translation/locales/fr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/he/translation.json
  - libraries/react-shared-libraries/src/translation/locales/it/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ja/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ka_ge/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ko/translation.json
  - libraries/react-shared-libraries/src/translation/locales/pt/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - libraries/react-shared-libraries/src/translation/locales/tr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/vi/translation.json
  - libraries/react-shared-libraries/src/translation/locales/zh/translation.json
  - tests/adaptation-review.backend.test.cjs
  - tests/adaptation-review.screen.test.cjs
  - tests/ai-role-model.test.cjs
  - tests/ai.provider.component.test.cjs
explicit_defers:
  - ordered S4 slot integration and owner stand acceptance pending
---
# Summary
S7 returned 2e8b60ef: optional slop/facts/both review, one admitted SDK request with maxRetries zero and explicit review role. Transient result; CAS acceptance updates adaptation and DRAFT atomically. Workspace mode, cost labels, diff, accept/leave. Expanded shared role/config/UI copy zone authorized by root; no schema change.
# Verification
8 suites 158 tests; backend/frontend tsc zero (frontend with temporary agreed S4 slot type); diff check passed. Model and transaction mocked, no paid/live calls.
# Risks / Follow-ups
GO: tenant scoping, body/updatedAt/postId/state CAS, rollback on partial failure covered. Integrate after S4 renderReview. Root must clear stream draft only when adaptationId matches. Accepted text uses editorHtml, manual HTML styling is not preserved. Schema and voice-wiring unchanged.

Root accepted 2e8b60ef as 193ebc48. S4 review slot connected; acceptance clears only matching draft.adaptationId. Root reviewed atomic tenant/CAS boundary and no-retry executor.

Owner explicit web action: 5fe7cc8c accepted as 71dd6ab6. Separate confirmed web review, one bounded research operation (first5000 chars, <=6 excerpts1600 chars) then one no-retry review model, cost scope shown, source links, unchanged CAS accept. Existing three modes retain one model call. Five suites138 tests plus FAQ17/17, backend/frontend tsc and diff check; provider mocks only. Actual source snippets and safe URLs inspected by root; no-source/unavailable failures do not imply confirmation. Delivery cherry-pick; clean worktree/patch-equivalence confirmed and worktree/branch removed.
