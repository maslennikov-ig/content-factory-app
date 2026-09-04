---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-fn33-49
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator of wave 04.09
public_facade: n/a
bounded_acceptance: a new post saves from the compose window; a foreign post id or group still answers 404; a refused save keeps the window open and says why
non_goals:
  - the `/posts/:group` update route, the sets flow and the debug import path
  - any change to the Prisma schema or to Temporal contracts
evidence:
  - none
task_id: content-factory-next-fn33.49
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes after the owner walkthrough 03-04.09.2026
milestone: post creation works and a refusal is visible
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-layer bug (repository, controller, screen) with a tenancy invariant to preserve
repo: content-factory-next
branch: worktree-agent-ab70d8d84270ed9f5
base_branch: wave/fixes-2026-09-04
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ab70d8d84270ed9f5
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - apps/backend/src/api/routes/posts.controller.ts
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - tests, locales
success_criteria:
  - a client-minted `value[].id` and `group` create the post instead of POST_NOT_FOUND
  - an id or group held outside this organization still answers 404 with the same text
  - a repository refusal reaches the client with its own status, not 500
  - the compose window stays open on a refused save and shows the reason
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
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root to merge
risk_level: medium
risk_tags:
  - tenancy
  - user-flow
  - api
affected_surfaces:
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no new door or role action; the ledger entry that documents the one unscoped query lives in tests/tenant-isolation.guard.test.cjs
verification:
  - node --test tests/post.content-context.test.cjs: passed
  - pnpm exec jest tests/posts.save-refusal.test.cjs tests/post* tests/tenant-isolation.guard.test.cjs tests/locale-translated.test.cjs tests/locale-key-set.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/editorial-stage.editor-wiring.test.cjs tests/content-intelligence.consumer-frontend.test.cjs tests/backend-locale-strings.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - apps/backend/src/api/routes/posts.controller.ts
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/post.content-context.test.cjs
  - tests/posts.save-refusal.test.cjs
  - tests/tenant-isolation.guard.test.cjs
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - none
---

# Summary

Since 20.08 (`9bc01f5f`) no post could be created from the compose window. The
ownership check read every id the client sent as the id of an existing post,
and the group check did the same for `group` — both are minted by the composer
before anything exists, so a brand new post answered POST_NOT_FOUND. The
refusal then left the backend as a bare 500, and the window closed as if the
save had worked, so the draft disappeared without a word.

Three changes. The repository now tells "free" from "taken by someone else":
an id or group nothing holds is a create, one that exists outside what this
organization can see — another tenant's, or deleted here — is still 404 with
the same text, so the reply discloses nothing new. `posts.controller.ts` maps a
repository refusal (`{code, message, status}` in the 4xx range) to an
`HttpException` with that status, the same `safeHttpError` shape
`content-lead.controller.ts` already uses; anything else is rethrown and stays
a logged 500. The window checks the answer: on anything but success it stays
open, drops the spinner and shows the server's own sentence as a toast.

# Scope / Routing

Write zone as assigned, plus the two test ledgers a change of this shape has to
carry: `tests/tenant-isolation.guard.test.cjs` (the group probe is deliberately
unscoped and now says why) and `tests/locale-untranslated-allowlist.json` (two
new keys in sixteen locales, ru and en written, the rest English).

# Verification

Commands above, all green. Both fixes were seen red first: the new creation
test fails with `code: 'POST_NOT_FOUND'` against the unfixed repository, and
the two status tests fail against the unfixed controller.

# Delivery / Cleanup

Returned on the branch for the root to merge.

# Risks / Follow-ups / Explicit Defers

An id chosen by the client is still written as the post's primary key, as it
was before this bead. Two organizations minting the same ten-character id in
the same instant would now race between the check and the `upsert` and end in
a unique-key error rather than a 404 — the same race the code had before, not
widened.

The debug import screen (`import-debug-post.modal.tsx`) posts to `/posts` and
swallows a failed answer the same way the compose window used to; outside this
write zone, worth its own bead.
