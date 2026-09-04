---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-several-workspaces
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: content-factory-next-fn33
public_facade: POST /user/organizations
bounded_acceptance: a signed-in person can create a second workspace from the switcher, becomes its ADMIN, and lands in it
non_goals:
  - a cap on how many workspaces one person may hold
  - restricting creation to a role or to the instance administrator
  - renaming a workspace, deleting one, or handing one over
  - offering creation on the billing chooser (`asOpenSelect`)
evidence:
  - none
task_id: content-factory-next-fn33.36
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: n/a
milestone: several workspaces for one person, wave of 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: a new authenticated write door plus a shared creation path registration already depends on
repo: content-factory-next
branch: worktree-agent-a430176314e5dd15c
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a430176314e5dd15c
write_zone:
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/dtos/users/create.organization.dto.ts
  - apps/frontend/src/components/layout/organization.selector.tsx
  - apps/frontend/src/components/layout/create.organization.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/
  - tests/
success_criteria:
  - POST /user/organizations creates a workspace whose creator is ADMIN, with the workflow tags
  - the second call creates a second workspace rather than returning the first
  - the account row is not touched, `activated` in particular
  - the switcher is visible with a single workspace and offers creation
  - registration behaviour is unchanged
selected_docs:
  - docs/product/roles-matrix.md
  - docs/design/component-authoring-rules.md
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
  - tenancy
  - api
  - ui
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md gained a «Своя область» section for the new door
verification:
  - pnpm exec jest tests/organization.create.test.cjs: passed
  - pnpm exec jest tests/organization.selector.test.cjs: passed
  - pnpm exec jest tests/registration.invitation.test.cjs tests/superadmin-role.guard.test.cjs tests/organization.last-admin.test.cjs tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/dtos/users/create.organization.dto.ts
  - apps/frontend/src/components/layout/create.organization.tsx
  - apps/frontend/src/components/layout/organization.selector.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/organization.create.test.cjs
  - tests/organization.selector.test.cjs
  - tests/superadmin-role.guard.test.cjs
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - none
---

# Summary

Creating a workspace exists as an action now. `POST /user/organizations` writes
the same workspace registration writes — the workflow tags, the API key, the
trial flags — with the person asking as its `ADMIN`, sets the `showorg` cookie
onto it, and answers `{id, name}`. The account itself is connected, never
created: `activated` stays where the approval flow left it, so a new workspace
is not a second way past approval.

The shape of a new workspace now lives in one private method the two doors
share, so registration and creation cannot drift into producing different
workspaces.

In the interface the switcher no longer hides itself when there is one
workspace — that state is where everybody starts, and hiding the control hid
the only door out of it. Creation sits under the list rather than in it: the
list is a choice between workspaces and the `menuitemradio` role it hands its
rows would have announced the action as one more workspace to pick.

# Scope / Routing

Write zone as assigned. Two edits inside it were wider than the literal
instruction and are named here: `changeOrg` in the controller now calls the same
private `setShowOrgCookie` the new door does, rather than a second hand-written
copy of the cookie; and `tests/superadmin-role.guard.test.cjs` counts three
`Role.ADMIN` grants in the repository instead of two, because the new door is
the third. Neither changes behaviour.

No external documentation was consulted: Prisma `orderBy`, Nest routing and
`class-validator` are all used exactly as this repository already uses them
several lines away.

# Verification

Listed in the front matter. Both new suites were seen red first:
`tests/organization.create.test.cjs` failed 5 of 5 with the repository change
stashed, `tests/organization.selector.test.cjs` failed 3 of 6 with the selector
change stashed.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. Nothing to clean.

# Risks / Follow-ups / Explicit Defers

- The default the owner has to confirm: anybody signed in may create a
  workspace, and there is no cap on how many one person holds.
- Russian wording: the new strings say «область», the wording of the live
  walkthrough, while the existing `organization` key in the same menu says
  «Организация». One of the two should win; this stream did not rename the
  older key.
- The door carries no `assertSameOriginJsonMutation`, matching `change-org`
  next to it. Worth a single decision for the whole controller rather than a
  per-door one.
