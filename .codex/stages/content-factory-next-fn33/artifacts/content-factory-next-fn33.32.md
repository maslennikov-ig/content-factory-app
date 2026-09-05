---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-D
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: admin-accounts-screen
public_facade: POST /admin/users/:id/delete
bounded_acceptance: deleting an account with a sole non-empty workspace takes the workspace and its content after a second confirmation; a shared workspace stays
non_goals:
  - deleting stored media files behind the Media rows
  - a marketplace cascade (money and a second party stay out)
  - applying the SQL to any database other than a throwaway container
evidence:
  - organization-cascade-schema
  - cascade-live-proof-throwaway-postgres
  - admin-account-delete-red-green
  - prisma-apply-guard-red-green
task_id: content-factory-next-fn33.32
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: workspace deletion with its content
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: schema-wide referential-action change with a live database proof and a two-press door
repo: content-factory-next
branch: worktree-agent-afdb7d4d63b73a69a
base_branch: main
base_commit: 555e08c4257143f6b05351118fe8c4ba0e9ffb06
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-afdb7d4d63b73a69a
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - docs/operations/organization-cascade-schema-apply.sql
  - scripts/operations/validate-prisma-migration-sql.cjs
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/dtos/users/delete-account.dto.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - docs/product/roles-matrix.md
  - docs/operations/production-deploy.md
  - tests/*.cjs
success_criteria:
  - organization.delete removes a workspace holding content, proved against a real postgres
  - the first request answers 409 with per-workspace counts; the second, flagged in the body, deletes
  - a workspace with other members is never deleted
  - the apply SQL passes the repository's own migration guard
selected_docs:
  - docs/operations/post-context-review-schema-apply.sql
  - docs/operations/production-deploy.md
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: throwaway container cf-d-cascade-pg removed; no ports left published
risk_level: high
risk_tags:
  - migration
  - data
  - authorization
  - api
  - ui
affected_surfaces:
  - database
  - data
  - api
  - backend
  - ui
invariants:
  - tenancy
  - rollback
  - state-transition
docs_impact: migration
docs_reviewed: updated
docs_review_notes: roles-matrix delete row and prose rewritten; production-deploy gained «Схема волны „зачистка“» and the apply-file index entry
verification:
  - pnpm exec jest tests/admin-account-delete.test.cjs: passed
  - pnpm exec jest tests/prisma-schema-apply-guard.execution.test.cjs tests/prisma-schema-apply-guard.migrate-diff.test.cjs tests/prisma-single-apply-path.test.cjs: passed
  - pnpm exec jest tests/pending-account-rejection.test.cjs tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs tests/backend-locale-strings.test.cjs tests/backend-no-dynamic-alias-import.guard.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec prisma validate --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma: passed
  - node scripts/operations/validate-prisma-migration-sql.cjs --mode update --diff <migrate-diff> --selected docs/operations/organization-cascade-schema-apply.sql (33 --allow-table): passed
  - psql on throwaway postgres:17-alpine (old schema, seeded, apply, delete): passed
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - docs/operations/organization-cascade-schema-apply.sql
  - scripts/operations/validate-prisma-migration-sql.cjs
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/dtos/users/delete-account.dto.ts
  - apps/backend/src/api/routes/admin.controller.ts
  - apps/frontend/src/components/admin/admin-users.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/admin-account-delete.test.cjs
  - tests/pending-account-rejection.test.cjs
  - tests/prisma-schema-apply-guard.execution.test.cjs
  - docs/product/roles-matrix.md
  - docs/operations/production-deploy.md
explicit_defers:
  - content-factory-next-fn33.32 media files behind deleted Media rows are not removed from storage; recorded in the SQL header and the runbook
---

# Summary

Deleting an account whose sole workspace still holds content is no longer a dead
end. 44 foreign keys gained `ON DELETE CASCADE`, so the database carries the
workspace's content away with it; the door answers the first press with 409
`account_delete_workspace_confirm` and the four counts (posts, channels,
materials, members) per workspace, and the second press — `deleteWorkspaces` in
the request body — deletes. A workspace with other members is never deleted; the
account only leaves it.

The schema change is not applied to production. It is
`docs/operations/organization-cascade-schema-apply.sql`, 88 statements (44
`DROP CONSTRAINT` / `ADD CONSTRAINT` pairs), and it must run **before** the
image that carries this tree.

# Scope / Routing

Write zone as listed above. Two decisions that affect integration:

1. **The cascade is wider than the Organization relations alone.** Adding
   `ON DELETE CASCADE` only to the direct children would still have failed:
   Prisma's default for a required relation is `RESTRICT`, which PostgreSQL
   checks per row even when both rows go in the same statement. Eleven edges
   *inside* the already-cascading content subtree (ProjectBrandProfileVersion →
   ProjectBrandProfile, SourceEvidence → SourceSnapshot, ContentContextItem →
   ContentContextSnapshot and so on) and thirteen below Post, Integration, Tags,
   Webhooks and OAuthApp were blocking. All of them are workspace-owned rows and
   all now cascade.

2. **The marketplace stays out, deliberately.** `MessagesGroup.buyerOrganizationId`
   and `OrderItems.integrationId` keep no cascade — those rows record money and a
   second party. `deleteAccount` matches them first and refuses with the old
   `account_delete_workspace_has_content` code, so the answer is a sentence, not
   a foreign-key error. The marketplace has no screen in Content Factory, so in
   practice this matches nothing.

`Post.submittedForOrganizationId` keeps `SET NULL`: the post belongs to its own
workspace and is only offered to the other one. `User` is untouched — only
`UserOrganization` goes with the workspace.

The migration guard was extended by one rule: `ALTER TABLE ... DROP CONSTRAINT`
passes only when the same file adds the same name back as
`ADD CONSTRAINT ... FOREIGN KEY`. That is the only shape PostgreSQL has for
changing a delete rule. `DROP TABLE`, `DROP COLUMN`, a lone drop, and
`DROP CONSTRAINT ... CASCADE` stay refused, each with its own test.

Assumption for the owner, taken conservatively and recorded: **no email is sent
to the person whose account and workspace are deleted** (the bead names this
assumption).

# Verification

Red before green:

- `tests/admin-account-delete.test.cjs` — 9 of 21 failed with the
  implementation reverted (`git checkout --` on the five source files), 21/21
  pass with it.
- `tests/prisma-schema-apply-guard.execution.test.cjs` — 2 of 71 failed against
  the pre-change guard, 71/71 pass after.

Live proof, throwaway `postgres:17-alpine` container `cf-d-cascade-pg`, removed
afterwards:

1. Bootstrapped the **old** schema (`migrate diff --from-empty` on
   `git show 555e08c4:…/schema.prisma`).
2. Seeded two workspaces across 42 tables, one sole and one shared.
3. `DELETE FROM "Organization"` on the sole one → refused,
   `Tags_orgId_fkey`.
4. Applied `docs/operations/organization-cascade-schema-apply.sql` with
   `psql --single-transaction`.
5. Same `DELETE` → `DELETE 1`. Rows left for the deleted workspace across those
   42 tables: **0**. Rows left for the shared workspace: **6**. Organizations
   left: 1. Users left: 3 — the account itself is removed by the application,
   not by the cascade. Cascade foreign keys in the database afterwards: 74
   (30 pre-existing + 44 new).

Commands and results are in the `verification` block above.

# Delivery / Cleanup

Returned to the orchestrator on branch `worktree-agent-afdb7d4d63b73a69a`. The
throwaway container was removed; nothing was applied to any shared database and
nothing was pushed.

# Risks / Follow-ups / Explicit Defers

- **Ordering is not optional.** The SQL goes before the image switch. On the old
  image the cascades are harmless (nothing there deletes a workspace); on the new
  image without them the second press fails with a foreign-key error.
- Deleting a workspace now removes its `Media` rows; the files behind them stay
  in storage. Recorded in the SQL header and the runbook, not fixed here.
- A cascade delete of a large workspace is one statement across ~50 tables. On a
  workspace with a lot of posts it will hold locks for the length of that
  statement. No workspace on production is near that size today.
- `EMPTY_ORGANIZATION_RELATIONS` still lists `buyerOrganization`; it is now
  redundant for deletion (the marketplace check runs first) but is still the
  proof used by pending-account rejection, so it was left alone.
