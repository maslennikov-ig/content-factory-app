---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-c
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: administrator inviting somebody into the workspace
public_facade: Settings -> Teams -> Add Member, and POST /settings/team
bounded_acceptance: after an invitation is created the link is on screen with a copy button, its expiry, and a line saying whether it is bound to one address
non_goals:
  - changing how an invitation is accepted or declined
  - changing the signed token contract in team-invitation.ts
  - production access or real email delivery
task_id: content-factory-next-fn33.24
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: invitation link always visible
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: form semantics plus an authorization-adjacent backend contract in one stream
repo: content-factory-next
branch: worktree-agent-a3d2629544c28b8d6
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a3d2629544c28b8d6
write_zone:
  - libraries/nestjs-libraries/src/dtos/settings
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - apps/frontend/src/components/settings/teams.component.tsx
  - docs/product/roles-matrix.md
  - sixteen frontend locales
  - tests
success_criteria:
  - the address field is always present and optional, and the form says what the address changes
  - the email checkbox means «also by email» and cannot be ticked without an address
  - the created link is shown with a copy button, its expiry and its binding
  - the copy toast survives, but the modal no longer closes over the link
selected_docs:
  - docs/design/component-authoring-rules.md
  - docs/product/roles-matrix.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - existing Button/Input/Select/CheckboxField primitives
parallel_group: fn33-wave-04-09
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: branch left for the root to merge
risk_level: medium
risk_tags:
  - authorization
  - user-flow
  - ui
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — the invitation form paragraph in «Дверь приглашения»
verification:
  - pnpm exec jest tests/invite.signing.test.cjs: passed
  - pnpm exec jest tests/team-screen.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-translated.test.cjs tests/branding.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - libraries/nestjs-libraries/src/dtos/settings/add.team.member.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - apps/frontend/src/components/settings/teams.component.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/invite.signing.test.cjs
  - tests/team-screen.test.cjs
explicit_defers:
  - none
---

# Summary

The invitation form no longer changes shape with the checkbox. The address is
always asked for and always optional; it decides binding, not delivery. The
checkbox now means «also send it by email» and is disabled until there is an
address to send to. `POST /settings/team` binds the token to any address that
was typed, refuses to mail an invitation with nowhere to send it, and answers
with the link, its expiry (`TEAM_INVITATION_TTL_SECONDS`, two days) and its
binding. After creation the modal shows the link itself, a copy button, the
expiry and one line saying whether the link is bound or open. The clipboard
copy and its toast are kept — they are no longer the only trace of the link.

# Scope / Routing

Write zone as assigned. No external documentation was needed: every changed
contract is local (an internal DTO, an internal service response, and one
screen). `team-invitation.ts` was deliberately not touched — it is outside the
write zone — so the expiry is recomputed in the service from the exported TTL
constant rather than returned by the signing helper.

# Verification

Every new assertion was watched fail first: with `teams.component.tsx` and
`organization.service.ts` restored to `1fcb1c99`, the three suites gave
20 failed / 4 passed; with the change in place, 24 passed.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. Nothing outside the
worktree was touched.

# Risks / Follow-ups / Explicit Defers

The owner's assumption to confirm: an invitation with no address is an open
link anybody holding it can accept, and the form says so in words. If the
owner wants every invitation bound, the address becomes required and the
`team_invitation_link_open` line disappears with it.

`expiresAt` is computed a millisecond after the token's own `timeLimit`, so
the screen can be up to a few milliseconds optimistic about a two-day link.
