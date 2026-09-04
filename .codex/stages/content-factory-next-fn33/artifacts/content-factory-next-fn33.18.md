---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-registration-and-invitations
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: n/a
public_facade: POST /auth/register with invitationToken
bounded_acceptance: registering from a live invitation creates one account inside the invited workspace, with the invitation's role, activated, and no workspace of its own
non_goals:
  - moving the one-time marker's GETDEL inside the database transaction (needs libraries/nestjs-libraries/src/auth/team-invitation.ts, outside this zone)
  - showing the inviter on the anonymous registration form (needs the public preview to answer with it)
evidence:
  - none
task_id: content-factory-next-fn33.18
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: n/a
milestone: registration and invitations, wave of 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: authorization and account-creation path with a one-time token and an approval-mode exception
repo: content-factory-next
branch: worktree-agent-a6c5bee490ccf8938
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c5bee490ccf8938
write_zone:
  - apps/backend/src/services/auth/auth.service.ts
  - apps/backend/src/api/routes/auth.controller.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - apps/frontend/src/components/auth/register.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - docs/product/roles-matrix.md
  - tests/
success_criteria:
  - no own workspace is created for an invited registration
  - the account is activated even with CONTENT_FACTORY_REQUIRE_APPROVAL=true, and no approval email is sent
  - an address other than the invited one is refused before any account exists
  - the invited form locks the address, drops the workspace-name field and names the workspace
  - the browser lands inside the invited workspace
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
  - content-factory-next-fn33.19
parallel_decision: sequential
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: work lives on the stream branch, nothing to clean
risk_level: high
risk_tags:
  - authorization
  - security
  - tenancy
  - idempotency
  - user-flow
affected_surfaces:
  - backend
  - api
  - ui
  - user-flow
invariants:
  - tenancy
  - idempotency
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md — a row and a paragraph for /auth/register carrying an invitation
verification:
  - pnpm exec jest tests/registration.invitation.test.cjs: passed
  - pnpm exec jest tests/register-invitation-prefill.test.cjs: passed
  - pnpm exec jest (full, 294 suites): passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/backend/src/services/auth/auth.service.ts
  - apps/backend/src/api/routes/auth.controller.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - apps/frontend/src/components/auth/register.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - docs/product/roles-matrix.md
  - tests/registration.invitation.test.cjs
  - tests/register-invitation-prefill.test.cjs
  - tests/telegram.auth.flow.test.cjs
explicit_defers:
  - the invitation heading names the workspace but not the inviter; the public preview withholds the inviter by an existing guard, see below
---

# Summary

A registration that carries a live invitation now creates exactly what the
invitation describes: one account, activated, and one membership in the
invited workspace with the invitation's role. No workspace of its own is
founded, so the second, empty one the owner ended up with on 04.09.2026 does
not exist any more.

Shape of it:

- `CreateOrgUserDto` accepts `invitationToken` and checks only its shape. A
  spent or expired token is not a bad request — it is an ordinary
  registration, and refusing it at the validator would have turned the most
  common mistake into a 400 the form cannot explain.
- `AuthService.registerThroughInvitation` runs the real
  `acceptTeamInvitation`, so the address binding, the two-day limit and the
  one-time marker are the same ones the signed-in path uses. It answers `null`
  for `invite_used` / `invite_invalid` (the caller founds a workspace as
  before) and rethrows `invite_email_mismatch` — before any account exists.
- `OrganizationRepository.createInvitedUser` writes the account and the
  membership in one transaction, with `activated: true` and `isSuperAdmin:
  false`, and marks `inviteId` the way `addUserToOrg` does, so one signed link
  cannot produce two accounts.
- `POST /auth/register` answers an invited registration with the session
  cookie, `showorg` on the invited workspace, and the invitation in the body;
  the form then leaves through a full page load, for the same reason
  `content-factory-next-fn33.26` gives.
- The form itself: the workspace named in the heading, the invited address
  filled in and `readOnly`, no «Workspace name» field, and «Create password
  and join» on the button.

Approval mode is deliberately not consulted on this path. That is the owner's
decision of 04.09.2026 recorded in the bead's NOTES, and it supersedes the
older assumption in the description: the invitation is an administrator's act,
so no «waiting for approval» email is sent and no administrator is paged.

# Scope / Routing

Inside the assigned zone. Two things were wanted by the bead and are **not**
here, both because they need a file this stream does not own:

1. **The GETDEL is not inside the account transaction.**
   `acceptTeamInvitation` spends the marker before it calls back — that is the
   linearization point two simultaneous accepts race on — so a database
   failure during account creation still burns the invitation. Everything
   refusable without a write (wrong address, expired, already spent) is
   refused before the marker is touched. Closing the remaining window means
   adding a redeem-with-callback export to
   `libraries/nestjs-libraries/src/auth/team-invitation.ts`, which is outside
   this write zone.
2. **The heading does not name the inviter.** See the follow-up below.

# Verification

- `pnpm exec jest tests/registration.invitation.test.cjs` — 10 passed. Red
  first: against the pre-change `auth.service.ts`, 6 of 10 failed.
- `pnpm exec jest tests/register-invitation-prefill.test.cjs` — 16 passed
  (6 pre-existing, 10 new across fn33.18 and fn33.29).
- `pnpm exec jest` — 294 suites, 3721 tests green.
- `pnpm exec tsc --noEmit` for both apps — clean.
- `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs` — green.

# Delivery / Cleanup

Returned on the stream branch. Nothing pushed, nothing merged, no live data
touched.

# Risks / Follow-ups / Explicit Defers

- **Owner decision needed — the inviter on the heading.** The bead asks for
  «Вас пригласили в «<область>», пригласил <имя · почта>. Создайте пароль».
  The anonymous form can only learn that from `GET /auth/join-org`, and that
  door deliberately answers with the workspace and the bound address only —
  `tests/auth-invitation-preview.test.cjs` asserts, in as many words, that it
  «never tells a stranger who sent the invitation». The two decisions
  contradict each other, and this stream was told not to break that guard, so
  the heading ships as «Вас пригласили в «<область>»» plus the invited
  address. The form already renders `register_invited_by` when the preview
  carries `inviterName`; enabling it is two fields in
  `AuthController.previewInvitation` and a rewrite of that one guard test.
- Registration disabled (`DISABLE_REGISTRATION=true`) still refuses an invited
  registration, because the check runs before this path. Assumption, not a
  decision the owner made; say the word and the invited path can be exempted.
- The invited account gets no activation email at all. It is already activated
  and the address is the one an administrator typed, so there is nothing left
  for such an email to prove.
