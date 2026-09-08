---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.14/stage-manifest.json
stream_owner: s1_publication
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.14.4
stage_id: content-factory-next-tu3k.14
repo: content-factory-next
branch: agent/walk-0908-S1
base_branch: wave/walk-2026-09-08
base_commit: 38f061c2
worktree: /home/me/code/cf-walk-0908-S1
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: clean worktree and patch-equivalent branch removed after acceptance
risk_level: medium
subagent_model: gpt-5.6-sol
reasoning_effort: high
verification:
  - 157 focused Jest tests; final helper tail 116 tests; node 45 pass and 2 DB skips; backend tsc and build passed; diff check passed
changed_files:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/agent/channel-directives.ts
  - libraries/nestjs-libraries/src/agent/generator-run-input.ts
  - libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts
  - libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - tests/agent.channel-directives.test.cjs
  - tests/agent.intake-hints.test.cjs
  - tests/compose-publish-menu.test.cjs
  - tests/content-context.provenance-swap.test.cjs
  - tests/content-intake.service.test.cjs
  - tests/content-pieces.service.test.cjs
  - tests/post.context-review.test.cjs
explicit_defers:
  - owner stand and release acceptance pending
---
# Summary
S1 dc67feba accepted as b8faf98f. ALLOW context TTL/review gates removed; EVIDENCE_REQUIRED retained. Channel rules explicit and platform scoped, formatHint and foreignShingles carried to adaptation. Publish menu flex restored.
# Verification
Worker focused checks passed. Root reviewed publication boundary; schema and immutable contract unchanged.
# Risks / Follow-ups
S3 removes intake shortcut methods; retain shared helper and piece foreignShingles/formatHint. Beads closure waits for all streams.
