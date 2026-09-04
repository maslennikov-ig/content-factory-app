---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-registration-and-invitations
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: n/a
public_facade: n/a
bounded_acceptance: a registration form reached by a spent or expired invitation says which of the two happened and stays an ordinary registration form
non_goals:
  - a «request a new invitation» link, because there is no address to send it to
evidence:
  - none
task_id: content-factory-next-fn33.29
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: n/a
milestone: registration and invitations, wave of 04.09.2026
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: small UI state on a path shared with fn33.18
repo: content-factory-next
branch: worktree-agent-a6c5bee490ccf8938
base_branch: main
base_commit: 1fcb1c994f0afc923ed93f6e0f10a95b807f89e5
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a6c5bee490ccf8938
write_zone:
  - apps/frontend/src/components/auth/register.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/
success_criteria:
  - a 410 with invite_used shows «already used» above the form
  - a 410 with invite_invalid shows «expired» above the form
  - the form stays an ordinary registration and does not carry the dead token
selected_docs:
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-wave-04-09
depends_on_streams:
  - content-factory-next-fn33.18
parallel_decision: sequential
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
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: covered by the fn33.18 paragraph in docs/product/roles-matrix.md
verification:
  - pnpm exec jest tests/register-invitation-prefill.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
changed_files:
  - apps/frontend/src/components/auth/register.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/register-invitation-prefill.test.cjs
explicit_defers:
  - none
---

# Summary

Opening an invitation that has already been accepted used to produce the plain
sign-up form: no address filled in, and not a word about the link in the
address bar. The preview call read `!response.ok` and returned in silence.

It now reads the code the door already answers with — `invite_used` or
`invite_invalid`, both 410 — and prints one line above the form: the link has
been used, or it has expired; you can still create an account here, or ask the
workspace administrator for a new invitation. The form stays exactly what it
was, because registering is still available to this person; the dead token is
not sent with it.

Anything that is not one of those two codes says nothing at all. A door
unreachable or a proxy in the way is not a fact about the invitation, and an
explanation that may be wrong is worse than none.

# Scope / Routing

Inside the assigned zone, and inside the same effect fn33.18 rewrote — the two
share one request, so they share one commit.

The bead asked for a «request a new invitation» link. There is nothing to
link to: the anonymous form is not told who the inviter is (see the fn33.18
artifact), so the sentence names the workspace administrator instead of
pretending to reach them.

The note uses the same shell the invitation page uses for its own notices —
`rounded-[8px] border border-cf-border bg-cf-surface-subtle`, `cf-body-sm
text-cf-ink` — so there is one look for «here is something you should know»
across both pages, and no new colour.

# Verification

- `pnpm exec jest tests/register-invitation-prefill.test.cjs` — 16 passed,
  four of them this bead's (used, expired, token not resent, and an unrelated
  failure staying quiet).
- Design guards and both locale guards green; the seven new keys are in all
  sixteen locales, Russian and English written, the rest listed in
  `tests/locale-untranslated-allowlist.json` as the ledger requires.

# Delivery / Cleanup

Returned on the stream branch. Nothing pushed.

# Risks / Follow-ups / Explicit Defers

- The wording distinguishes «used» from «expired» by the code alone.
  `verifiedClaims` answers `invite_invalid` both for a token past its two days
  and for one that is not a token at all, so a mangled link is described as
  expired. That is the friendlier of the two readings and needs no new code
  path; if the owner wants them told apart, the distinction has to be made in
  `team-invitation.ts`, outside this stream's zone.
