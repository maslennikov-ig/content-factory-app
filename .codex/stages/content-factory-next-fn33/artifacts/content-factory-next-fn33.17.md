---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-c
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: workspace administrator correcting somebody's role
public_facade: Settings -> Teams member row, and PUT /settings/team/:id
bounded_acceptance: an administrator changes a member's role from the list without removing them, and the server refuses every change above or at the caller's own level
non_goals:
  - who becomes what at workspace creation (stream A, fn33.19)
  - the removal rule for SUPERADMIN in organization.repository.ts (stream A)
  - per-record permissions or a configurable permission matrix
task_id: content-factory-next-fn33.17
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: role correctable in place
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: a new authorization door whose boundaries are the whole point
repo: content-factory-next
branch: worktree-agent-a3d2629544c28b8d6
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a3d2629544c28b8d6
write_zone:
  - apps/backend/src/api/routes/settings.controller.ts
  - libraries/nestjs-libraries/src/dtos/settings
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts (new method only)
  - apps/frontend/src/components/settings/teams.component.tsx
  - docs/product/roles-matrix.md
  - sixteen frontend locales
  - tests
success_criteria:
  - PUT /settings/team/:id carries the same two policies as removal
  - only somebody below the caller, only to a role no higher than the caller's, never the caller
  - SUPERADMIN is neither granted nor removed through this door
  - the member row offers a dropdown only where the change is allowed; own and higher rows stay text
  - the roles matrix names the door and the guard stays green
selected_docs:
  - docs/product/roles-matrix.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - shared Select primitive in standalone mode
  - organizationRoleLevel as the single ranking
parallel_group: fn33-wave-04-09
depends_on_streams:
  - content-factory-next-fn33.19 (stream A, roles ceiling)
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: branch left for the root to merge
risk_level: high
risk_tags:
  - authorization
  - api
  - ui
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - authorization
  - state-transition
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — /settings/team count 3 -> 4 and a paragraph on the role-change rules
verification:
  - pnpm exec jest tests/team-role-change.test.cjs: passed
  - pnpm exec jest tests/team-screen.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/backend/src/api/routes/settings.controller.ts
  - libraries/nestjs-libraries/src/dtos/settings/update.team.member.role.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - apps/frontend/src/components/settings/teams.component.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/team-role-change.test.cjs
  - tests/team-screen.test.cjs
explicit_defers:
  - none
---

# Summary

`PUT /settings/team/:id` changes one member's role. It carries the same two
policies as removal and answers to the same ranking: only somebody below the
caller, only to a role no higher than the caller's own, never the caller
themselves, and only a role from `ASSIGNABLE_ORGANIZATION_ROLES` — so
`SUPERADMIN` is neither granted nor taken away here. The member row shows a
dropdown of the three assignable roles where the change is allowed, and plain
text for the caller's own row and for anyone at or above their level.

# Scope / Routing

The repository got exactly one new method, `updateTeamMemberRole`, appended as
its own block at the end of the class so it cannot collide with stream A's work
on `createOrgAndUser` and the removal rule in the same file. The ceiling is
`ADMIN`, per stream A's fn33.19: existing `SUPERADMIN` rows render as text and
are never offered a change.

# Verification

Both new suites were watched fail first: with `teams.component.tsx` and
`organization.service.ts` restored to `1fcb1c99` the three affected suites gave
20 failed / 4 passed; with the change in place, 24 passed.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. Nothing outside the
worktree was touched.

# Risks / Follow-ups / Explicit Defers

The «no role above your own» rule is unreachable today — `ADMIN` is the highest
role on offer and only an administrator gets past the level check before it. It
is written anyway: unreachability is a property of the assignable list, not of
the method, and the list is where a future role would be added.

The screen decides what to offer, never what is permitted; every refusal is the
server's. A refusal re-reads the list so the dropdown cannot keep showing a role
that was not accepted.
