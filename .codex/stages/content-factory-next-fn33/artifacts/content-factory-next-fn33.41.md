---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-j-password-and-settings-tabs
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: settings screen, sign-in methods tab
public_facade: PUT /user/password
bounded_acceptance: a signed-in person with a password sign-in can replace it from the settings screen; a wrong current password is refused by its own code
non_goals:
  - session invalidation on other devices after a password change
  - changing another account's password (administrator or otherwise)
evidence:
  - none
task_id: content-factory-next-fn33.41
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave of fixes 2026-09-04
milestone: password change from inside the product
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: authorization-adjacent backend door plus interface work in one bead
repo: content-factory-next
branch: worktree-agent-a35d3874222a017e0
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad013c54ed4cfa0abf70eee73858d0df02c
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a35d3874222a017e0
write_zone:
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/dtos/users/change-password.dto.ts
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
  - locales, roles matrix, tests
success_criteria:
  - a door exists that changes the caller's own password and checks the current one
  - the new password goes through the policy and the hashing registration uses
  - the form lives on the connected "Email and password" row with three fields and eye toggles
  - a change ends in a toast; every refusal is a translated sentence
selected_docs:
  - none (all behaviour is local to this repository)
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
  - authorization
  - security
  - api
  - ui
affected_surfaces:
  - api
  - backend
  - ui
invariants:
  - state-transition
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md gained a section «Собственный пароль»
verification:
  - "pnpm exec jest tests/user-password-change.test.cjs": passed
  - "pnpm exec jest tests/user-identity.settings.test.cjs": passed
  - "pnpm exec jest tests/user-identity.auth.test.cjs tests/user-identity.contract.test.cjs": passed
  - "pnpm exec jest tests/roles-matrix.guard.test.cjs": passed
  - "pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs": passed
  - "pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
changed_files:
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/dtos/users/change-password.dto.ts
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/user-password-change.test.cjs
  - tests/user-identity.settings.test.cjs
  - tests/user-identity.auth.test.cjs
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - none
---

# Summary

`PUT /user/password` is the door that did not exist. It proves the caller twice —
the session cookie says which account, the current password says the browser is
not simply left open — and then writes through `updatePassword`, the same call
`/auth/forgot` finishes with. Hashing, the password policy and the "this account
has a password sign-in at all" check therefore have one implementation and
cannot drift apart.

The form sits on the row of the method it belongs to: the connected «Почта и
пароль» line on the sign-in methods tab, three fields with eye toggles, a
success toast, and every refusal translated from a code rather than forwarded as
the server's English.

# Scope / Routing

Write zone as assigned. No external documentation was needed: the door, the
policy, the hashing helper and the repository call are all local code that was
read directly. Model choice was the role default for the stream.

# Verification

Listed in `verification` above. The new suite `tests/user-password-change.test.cjs`
was red first — 5 of 5 tests failed with the controller change stashed and the
DTO moved aside — and green after.

One file outside the bead's own surface was touched for a mechanical reason:
`tests/user-identity.auth.test.cjs` mocks `@nestjs/common` by hand and had no
`Put`, so the suite could not even load the controller once a `@Put` decorator
appeared. One line added to that mock.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. Nothing pushed.

# Risks / Follow-ups / Explicit Defers

A password change does not end sessions on other devices; the auth token stays
valid until it expires. That is the behaviour the product already had after an
emailed reset, so this door does not make it worse, but it is worth a bead if
the owner expects "changing the password signs everyone else out".
