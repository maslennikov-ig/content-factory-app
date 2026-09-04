---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-d
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: person uploading a photo into the media library
public_facade: the upload ceiling and the sentence that states it
bounded_acceptance: browser and validation pipe read the same ceiling from one module, and a refused file is told its size in megabytes
non_goals:
  - changing what the ceiling is (10 MB images, 1 GB video stay)
  - carrying the interface language into the upload request
  - storage or compression behavior
task_id: content-factory-next-fn33.20
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: one upload ceiling
milestone_status: delivered
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: small cross-boundary constant extraction with a locale surface
repo: content-factory-next
branch: worktree-agent-a082639c1fb9b017b
base_branch: main
base_commit: 1fcb1c99
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a082639c1fb9b017b
write_zone:
  - libraries/nestjs-libraries/src/upload
  - apps/frontend/src/components/media
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - tests
success_criteria:
  - one module holds both ceilings and both sides import it
  - the pipe's refusal names megabytes, not a byte count
  - a guard fails if the two numbers are ever typed apart again
selected_docs:
  - none (local repository behavior only; no version-sensitive dependency)
selected_skills:
  - none
selected_agents:
  - worker
catalog_candidates:
  - existing backend-strings catalog
parallel_group: fn33-wave-04-09
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for root to merge
risk_level: low
risk_tags:
  - ui
  - api
affected_surfaces:
  - backend
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no documented contract states the upload ceiling
verification:
  - pnpm exec jest tests/media.upload-limit.test.cjs: passed (7/7; 3 failed before the fix)
  - pnpm exec jest (full suite, 293 files): passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - libraries/nestjs-libraries/src/upload/upload.limits.ts
  - libraries/nestjs-libraries/src/upload/custom.upload.validation.ts
  - libraries/nestjs-libraries/src/locale/backend-strings.ts
  - apps/frontend/src/components/media/new.uploader.tsx
  - tests/media.upload-limit.test.cjs
explicit_defers:
  - the pipe's Russian text is not reachable in production today; the upload XHR carries no language, so the pipe defaults to English and the person sees the browser-side Russian refusal instead
---

# Summary

The browser accepted images up to 30 MB and the validation pipe refused anything past 10 MB, so a file between the two passed every visible check and came back a 400. Both ceilings now come from `libraries/nestjs-libraries/src/upload/upload.limits.ts`, which holds numbers and formatting only and is imported by the pipe and by the uploader. The pipe's refusal is a sentence from the backend catalog with the ceiling in megabytes instead of `10485760 bytes`.

# Scope / Routing

Write zone as assigned. No external documentation was needed: every fact is local repository behavior. The shared constant went into `libraries/nestjs-libraries/src/upload/` because the frontend already imports `@contentfactory/nestjs-libraries/*` (`UserDetailDto`, `organization.roles`) and the new module has no NestJS imports.

# Verification

Listed above. The new guard was run against the pre-fix files first (`git stash`), where three of its seven checks failed.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. No push.

# Risks / Follow-ups / Explicit Defers

- `CustomFileValidationPipe` now takes an optional locale; both controllers still construct it with none, so its text is English. Nothing in the repository carries the interface language into a backend request, and adding that would touch controllers outside this write zone. Recorded as a defer, not done silently.
- The uploader's session ceiling (1 GB per upload run, `media.component.tsx`) was left alone; it is a different limit and was not in dispute.
