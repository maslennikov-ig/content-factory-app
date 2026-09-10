---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-tu3k.15/stage-manifest.json
stream_owner: S2_generator
orchestration_level: release
scope_kind: product_slice
task_id: content-factory-next-tu3k.15.5
stage_id: content-factory-next-tu3k.15
repo: content-factory-next
branch: agent/walk-s2gen
base_branch: wave/walk-2026-09-10
base_commit: d5815700
worktree: /home/me/code/cf-walk-s2gen
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: clean tree retained for ordered root integration
risk_level: high
risk_tags:
  - tenancy
  - paid-call-admission
affected_surfaces:
  - normal-generator-channel-resolution
  - generator-request-dto
invariants:
  - resolve-the-integration-inside-the-organization-before-any-model-call
  - both-generation-paths-use-the-same-resolved-channel-directives
subagent_model: gpt-5.6-luna
reasoning_effort: max
verification:
  - focused generator profile 5 tests passed
  - frontend and backend tsc passed
  - worker diff-check passed
changed_files:
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/dtos/generator/generator.dto.ts
  - apps/frontend/src/components/launches/generator/generator.tsx
  - tests/agent.generator-channel-profile.test.cjs
explicit_defers:
  - root full acceptance and stand
---
# Summary
08eabc1f accepted as 6401fe20. Optional integrationId from calendar selected channel (existing first-channel fallback); tenant-scoped lookup before search/context/model; missing/foreign fail closed. Shared resolved profile/provider and channelLines for intake and normal generator.
# Verification
Five focused tests pass; frontend/backend tsc0. Library tsc has three errors outside this patch, same as S6 report; root diagnoses in combined acceptance. Logs copied to evidence/s2gen-*.log. Clean worker checkout verified, no paid calls.
# Delivery / Cleanup
Cherry-pick accepted. Clean worker tree retained until combined release; no publication or Beads mutation by child.

# Risks / Follow-ups
Root owns final acceptance, safe cleanup and release. The declared invariants remain release constraints; no live or paid action is part of child proof.
