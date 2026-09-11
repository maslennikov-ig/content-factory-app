---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-xbfj/stage-manifest.json
stream_owner: root-generation-contracts
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-xbfj.2
stage_id: content-factory-next-xbfj
repo: content-factory-next
branch: codex/review-tail-2026-09-11
base_branch: main
base_commit: f20b0f32
worktree: /home/me/code/content-factory-next-review-tail
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root-owned integration worktree is retained; no separate runtime resource was created.
risk_level: medium
risk_tags:
  - generation-contract
  - channel-profile
  - source-cap
affected_surfaces:
  - backend
  - prompts
  - provider-client
invariants:
  - resolved-channel-profile-wins
  - explicit-level-admission
  - deep-cap-50
verification:
  - 'Adaptation review focused tests pass with standard and deep levels supplied explicitly.'
  - 'Web research focused tests assert the deep preset reaches the provider as maxResults 50.'
  - 'Agent graph inspection confirms ordinary hashtag and CTA instructions read the resolved tenant channel profile, with legacy intake fallback only when no resolved profile exists.'
changed_files:
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-web-review.ts
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - tests/adaptation-review.backend.test.cjs
  - tests/web.research.service.test.cjs
  - .codex/stages/content-factory-next-xbfj/artifacts/generation-contracts.md
explicit_defers:
  - No new Temporal workflow or activity contract is introduced by this contract repair.
  - Production release and owner stand remain root-owned after the complete acceptance set.
---
# Summary

The adaptation review now passes the chosen `quick`, `standard` or `deep`
level to `WebResearchService`, so the visible paid lane cannot bypass quota
admission. The deep preset is allowed to return 50 sources; provider clients
retain the same server-side cap.

Ordinary generation carries `resolvedChannelProfile` through the graph. Its
hashtag and CTA instructions use the tenant-resolved profile and retain the
legacy intake fallback only for callers that do not have a resolved profile.
This removes the contradictory default instruction from the ordinary path.

# Verification

The changes are covered by the focused adaptation and web-research Jest
contracts (included in the 6-suite, 134-test replay). No model or network call
was made by these checks.

# Risks / Follow-ups

The resolved profile is still loaded by the existing integration lookup; a
future profile schema change must preserve that consumer boundary. Release
proof is recorded only after the root three-app typecheck, build, full suite,
process and schema checks.
