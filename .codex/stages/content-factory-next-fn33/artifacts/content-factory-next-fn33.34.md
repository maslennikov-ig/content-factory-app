---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-several-workspaces
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: content-factory-next-fn33
public_facade: n/a
bounded_acceptance: getOrgsByUserId returns workspaces in a fixed order, so a sign-in without a showorg cookie always lands in the same one
non_goals:
  - choosing the person's own workspace over one they were invited into
  - writing a showorg cookie at sign-in
evidence:
  - none
task_id: content-factory-next-fn33.34
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: n/a
milestone: several workspaces for one person, wave of 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one-line query change with a wide blast radius through the auth middleware
repo: content-factory-next
branch: worktree-agent-a430176314e5dd15c
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a430176314e5dd15c
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - tests/
success_criteria:
  - the query asks for createdAt asc then id
  - the switcher, /user/self and the middleware all read that one order
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
  - tenancy
affected_surfaces:
  - backend
  - user-flow
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the matrix says nothing about which workspace opens first; the order is not an authority rule
verification:
  - pnpm exec jest tests/organization.create.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - tests/organization.create.test.cjs
explicit_defers:
  - which workspace should open by default — the person's own rather than the oldest — is a product question this stream did not answer
---

# Summary

`getOrgsByUserId` now asks for `createdAt asc, id asc`. Without an order the
query plan decided, and `auth.middleware` opens the first row for anybody
arriving without a `showorg` cookie — so the workspace a person landed in was a
property of the data rather than a promise. The switcher, `/user/self` and the
middleware all read this one method, so they now agree by construction.

# Scope / Routing

One method in the repository plus a test. No external documentation: `orderBy`
is used the same way a few methods down in the same file (`getProductEventActor`).

# Verification

`tests/organization.create.test.cjs` carries the case, red before the change:
`orderBy` was `undefined`.

# Delivery / Cleanup

Returned on the stream branch. Nothing to clean.

# Risks / Follow-ups / Explicit Defers

- Deterministic is not the same as right. Oldest-first still means somebody
  invited into an older workspace lands there rather than in their own, which
  is what the walkthrough actually complained about. That choice — prefer the
  workspace the person administrates, or write a `showorg` cookie at sign-in —
  is a product decision left open.
