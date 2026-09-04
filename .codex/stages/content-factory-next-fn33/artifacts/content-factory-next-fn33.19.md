---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-registration-and-invitations
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: content-factory-next-fn33.18
public_facade: n/a
bounded_acceptance: no membership is ever created with Role.SUPERADMIN; a workspace cannot lose its last administrator
non_goals:
  - removing SUPERADMIN from the Prisma enum
  - migrating existing SUPERADMIN rows on the live database
  - renaming the role on the team screen for rows that still hold it
evidence:
  - none
task_id: content-factory-next-fn33.19
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: n/a
milestone: registration and invitations, wave of 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: authorization change touching three assignment sites and two exemption filters
repo: content-factory-next
branch: worktree-agent-a6c5bee490ccf8938
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c5bee490ccf8938
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - apps/backend/src/services/auth/public.auth.middleware.ts
  - docs/product/roles-matrix.md
  - tests/
success_criteria:
  - the creator of a workspace holds Role.ADMIN
  - Role.SUPERADMIN is assigned nowhere in apps/ or libraries/
  - existing SUPERADMIN rows keep every administrator exemption
  - the last administrator of a workspace cannot be removed
selected_docs:
  - docs/product/roles-matrix.md
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
risk_level: medium
risk_tags:
  - authorization
  - data
affected_surfaces:
  - backend
  - data
invariants:
  - state-transition
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — the roles table, why the enum value stays, and the last-administrator rule
verification:
  - pnpm exec jest tests/superadmin-role.guard.test.cjs: passed
  - pnpm exec jest tests/organization.last-admin.test.cjs: passed
  - pnpm exec jest tests/roles-matrix.guard.test.cjs: passed
  - pnpm exec jest (full, 294 suites): passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - apps/backend/src/services/auth/public.auth.middleware.ts
  - docs/product/roles-matrix.md
  - tests/superadmin-role.guard.test.cjs
  - tests/organization.last-admin.test.cjs
  - tests/enterprise.approval.test.cjs
explicit_defers:
  - content-factory-next-fn33.19 step 3 — the UPDATE that turns existing SUPERADMIN memberships into ADMIN is a release step on the live database and was not run; the SQL is in this artifact
---

# Summary

Nothing in the product hands out `Role.SUPERADMIN` any more. The creator of a
workspace — through registration (`createOrgAndUser`), through the reseller
path (`createMaxUser`) and through the public API key that stands in for a
person (`public.auth.middleware.ts`) — is an `ADMIN`. The enum value survives,
because rows on running instances carry it and changing a Postgres enum is a
separate operation; it may still be read and compared, never assigned, and
`tests/superadmin-role.guard.test.cjs` is what keeps that true.

Two exemptions that were written as «the SUPERADMIN» had to be recounted:

- `disableOrEnableNonSuperAdminUsers` used to spare exactly one membership when
  a subscription lapsed. Left alone it would have switched off the workspace
  owner — the one account that can reach billing. It now spares both
  administrator roles.
- `getUserWithActiveSubscriptionByEmail`, which answers «does this address
  already own a paid workspace», looked for `SUPERADMIN` only.

And the protection that used to be implicit in the role is now explicit:
`deleteTeamMember` refuses to remove the last administrator of a workspace,
including an administrator removing themselves. Without it two administrators
could remove each other and leave a workspace nobody can invite into.

# Scope / Routing

Write zone as assigned. `libraries/nestjs-libraries/src/user/organization.roles.ts`
was deliberately **not** touched: its ranking and `isOrganizationAdmin` are the
reads that keep old rows working. Its doc comment now says something slightly
stale («`SUPERADMIN` … granted when an organization is created») and the file
is outside this stream's zone — noted as a follow-up rather than edited.

# Verification

- `pnpm exec jest tests/superadmin-role.guard.test.cjs` — 5 passed. Red first:
  with one `Role.SUPERADMIN` put back, 2 of 5 failed.
- `pnpm exec jest tests/organization.last-admin.test.cjs` — 5 passed. Red first:
  with the new rule removed, 2 of 5 failed.
- `pnpm exec jest` (whole jest half) — 294 suites, 3721 tests, all green.
- `pnpm exec tsc --noEmit` for both apps — clean.

# Delivery / Cleanup

Returned to the orchestrator on branch `worktree-agent-a6c5bee490ccf8938`.
Nothing pushed, nothing merged.

# Risks / Follow-ups / Explicit Defers

- **Release step, not run here.** Existing memberships still say `SUPERADMIN`,
  and the team screen prints «Супер администратор» for them
  (`teams.component.tsx:166`, outside this zone). The owner's default is to
  convert them. Count before and after:

  ```sql
  SELECT count(*) FROM "UserOrganization" WHERE role = 'SUPERADMIN';
  UPDATE "UserOrganization" SET role = 'ADMIN' WHERE role = 'SUPERADMIN';
  SELECT count(*) FROM "UserOrganization" WHERE role = 'SUPERADMIN'; -- expect 0
  ```

  Run through `psql` per the runbook, never `prisma db push`. After it, the
  two exemption filters that name both roles become redundant but stay correct.
- `libraries/nestjs-libraries/src/services/stripe.service.ts:276` still looks
  for `role === 'SUPERADMIN'` to decide whose email owns a Stripe customer.
  With no new membership holding that role, that sync stops firing for
  workspaces created from now on. Outside this stream's write zone; needs the
  same widening to `isOrganizationAdmin`, or the data step above.
- `docs/operations/outbound-connections.md` still describes the API key as
  granting `SUPERADMIN`; it now grants `ADMIN` with identical doors. Outside
  this zone.
