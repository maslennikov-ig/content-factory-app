---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-N-translations-and-gaps
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: debug post import window
public_facade: n/a
bounded_acceptance: a refused /posts answer shows the server's reason and leaves the window open
non_goals:
  - changing the server side of /posts
  - editing new-launch/manage.modal.tsx (another stream's zone; only imported from)
evidence:
  - none
task_id: content-factory-next-fn33.81
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-fixes-2026-09-04
milestone: translations and small gaps outside other streams' zones
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: one-branch fix with a reuse constraint
repo: content-factory-next
branch: worktree-agent-a4c37b91494b5f279
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4c37b91494b5f279
write_zone:
  - apps/frontend/src/components/launches/import-debug-post.modal.tsx
  - tests/**
success_criteria:
  - the response status is read before the success toast
  - the message text comes from postSaveErrorMessage, not a second copy
  - the window stays open after a refusal
selected_docs:
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - libraries/helpers/src/utils/custom.fetch.func.ts
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-N
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state left in the repository
risk_level: low
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: internal debug tool, no documented contract
verification:
  - pnpm exec jest tests/import-debug-post.refusal.test.cjs: passed
  - pnpm exec jest tests/posts.save-refusal.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/launches/import-debug-post.modal.tsx
  - tests/import-debug-post.refusal.test.cjs
explicit_defers:
  - none
---

# Summary

`useFetch` returns the `Response` and never throws on a 4xx/5xx, so the debug
import window called every answer a success: it toasted "imported as draft",
closed, and took the pasted JSON with it. The status is now read, and a refused
answer shows the server's own reason through the existing
`postSaveErrorMessage` helper and leaves the window open with the JSON intact.

# Scope / Routing

The helper was imported from `new-launch/manage.modal.tsx` rather than copied,
as the bead required. That file itself was not edited — it belongs to another
stream — only read and imported from.

# Verification

- `pnpm exec jest tests/import-debug-post.refusal.test.cjs` — 4 passed. Red
  before the fix: 3 of 4 failed with the change stashed.
- `pnpm exec jest tests/posts.save-refusal.test.cjs` — 7 passed, so the helper's
  own contract is unchanged.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 errors.

# Delivery / Cleanup

Committed on the stream branch, waiting for the root to merge.

# Risks / Follow-ups / Explicit Defers

Importing from `manage.modal.tsx` pulls that module into the debug window's
chunk. The window is a developer tool behind a debug entry, so the bundle cost
is not on a person's first paint; if it ever matters, the helper should move to
its own file, which is a change in another stream's zone.
