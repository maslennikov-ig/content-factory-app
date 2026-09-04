---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-fn33-88
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave 04.09
public_facade: n/a
bounded_acceptance: editing an existing draft that has no verified context saves instead of dying with P2011, and a draft that does have one keeps its provenance
non_goals:
  - any change to schema.prisma or to the composite provenance relations themselves
  - the screens; this is the write path only
evidence:
  - none
task_id: content-factory-next-fn33.88
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes after the owner walkthrough 03-04.09.2026
milestone: post creation works and a refusal is visible
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: a write-path defect behind a tenancy-shaped relation, found only once creation was fixed
repo: content-factory-next
branch: worktree-agent-ab70d8d84270ed9f5
base_branch: wave/fixes-2026-09-04
base_commit: d0850e3d3855f242de99141315c3cb89c4fe867d
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ab70d8d84270ed9f5
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - tests/post.content-context.test.cjs
success_criteria:
  - saving an existing post with no verified context updates it and keeps organizationId
  - stale provenance on such a post is still cleared
  - a grounded draft still connects its snapshot, and drops only the profile version it no longer has
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-2026-09-04
depends_on_streams:
  - content-factory-next-fn33.49
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root to merge
risk_level: medium
risk_tags:
  - data
  - tenancy
affected_surfaces:
  - backend
  - data
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no contract or door changed; the schema fact now lives in the fixture that models it
verification:
  - node --test tests/post.content-context.test.cjs: passed
  - pnpm exec jest tests/post* tests/tenant-isolation.guard.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - tests/post.content-context.test.cjs
explicit_defers:
  - none
---

# Summary

`Post.contentContextSnapshot` and `Post.brandProfileVersion` are composite
relations whose first field is the post's own required `organizationId`. A
`disconnect` therefore nulls that field as well, and the write dies with P2011
on the ordinary case — any post without a verified context. The update branch
sent that `disconnect` unconditionally.

The two disconnects are gone. When provenance has to be cleared, the foreign
keys are written as plain scalars in one tenant-scoped `updateMany` beside the
`upsert` (a checked Prisma input cannot carry a scalar foreign key, which is
why it is a separate statement), and only for a row that already existed — a
new row has them null already.

# Scope / Routing

Repository write path and the fixture that models it.

# Verification

Commands above. Seen red first: the new test dies with
`code: 'P2011'`, `Null constraint violation on the fields: (organizationId)`
against the unfixed repository.

The fixture was the reason nobody caught this earlier — it turned a
`disconnect` into a harmless scalar null. It now throws the P2011 the database
throws, so the schema fact is encoded where the test can see it.

# Delivery / Cleanup

Returned on the branch for the root to merge.

# Risks / Follow-ups / Explicit Defers

Clearing provenance is now a second statement rather than part of the `upsert`.
Both run inside the same tenant transaction the caller already opens, so a
half-cleared post is not reachable.
