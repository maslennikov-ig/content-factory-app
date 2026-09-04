---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-registration-and-invitations
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: n/a
public_facade: n/a
bounded_acceptance: after accepting an invitation, «Continue» reloads the page so the showorg cookie and the workspace list take effect
non_goals:
  - changing the SWR revalidation policy of the workspace switcher
evidence:
  - none
task_id: content-factory-next-fn33.26
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: n/a
milestone: registration and invitations, wave of 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one-line navigation fix with a stated cause
repo: content-factory-next
branch: worktree-agent-a6c5bee490ccf8938
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c5bee490ccf8938
write_zone:
  - apps/frontend/src/app/(app)/(site)/join-org/page.tsx
  - tests/
success_criteria:
  - the success branch leaves through window.location.assign('/')
  - change-org already does the same, and is proven to
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-wave-04-09
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: work lives on the stream branch, nothing to clean
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
docs_review_notes: the matrix already describes what POST /user/join-org does; only the client transition changed
verification:
  - pnpm exec jest tests/team-invitation-page.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/app/(app)/(site)/join-org/page.tsx
  - tests/team-invitation-page.test.cjs
explicit_defers:
  - none
---

# Summary

«Continue» after accepting an invitation now leaves through
`window.location.assign('/')` instead of `router.push('/')`.

Accepting sets the `showorg` cookie on the server, and that cookie is the only
thing that makes the invited workspace the current one. A client transition
keeps the layout it was rendered with: the user context still holds the old
`orgId`, and the workspace list behind `useSWR('organizations')` is configured
never to revalidate on its own (`revalidateIfStale`, `OnFocus` and
`OnReconnect` are all off). So the owner landed back in his own workspace with
the invited one missing from the switcher until he reloaded by hand.

Checked, as the bead asked: switching workspace by hand already does the same
thing — `organization.selector.tsx` calls `/user/change-org` and then
`window.location.reload()`. The invitation page now copies the move that
already works, and the guard pins both halves so they cannot drift apart.

The declined and error branches keep `router.push('/')`. Neither changes a
cookie, so neither needs the browser.

# Scope / Routing

Two files, both in the assigned zone.

# Verification

- `pnpm exec jest tests/team-invitation-page.test.cjs` — 5 passed, two of them
  new.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — clean.
- Full jest half green (294 suites).

# Delivery / Cleanup

Returned on the stream branch. Nothing pushed.

# Risks / Follow-ups / Explicit Defers

- The guard reads the page source rather than rendering it, matching the rest
  of that suite. A rename of `enterWorkspace` will make it fail loudly, which
  is the intended cost.
- The same reasoning now applies in a second place: an invited registration
  also ends with a full load (`content-factory-next-fn33.18`,
  `register.tsx`). If a third appears, the three deserve one helper.
