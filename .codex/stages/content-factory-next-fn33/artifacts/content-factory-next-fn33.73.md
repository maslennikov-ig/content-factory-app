---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-h1-auth-screens
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: wave/fixes-2026-09-04
public_facade: n/a
bounded_acceptance: The profile explains a name that is too short
non_goals:
  - backend refusal codes and backend-side message translation
  - saving the chosen language into the user profile (stream H2)
evidence:
  - none
task_id: content-factory-next-fn33.73
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-fixes-2026-09-04
milestone: auth, registration and invitation screens
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: interface and flow work across several screens with one shared helper
repo: content-factory-next
branch: worktree-agent-a0630ad71346cb83e
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a0630ad71346cb83e
write_zone:
  - apps/frontend/src/components/auth/**
  - apps/frontend/src/app/(app)/(site)/join-org/page.tsx
  - apps/frontend/src/app/(app)/auth/layout.tsx
  - apps/frontend/src/components/settings/teams.component.tsx (validation messages only)
  - apps/frontend/src/components/layout/settings.component.tsx (validation messages only)
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - The profile explains a name that is too short
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-fixes-2026-09-04
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root to merge
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no door or role changed, so the roles matrix is untouched
verification:
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec jest tests/auth-form-errors.test.cjs tests/register-invitation-landing.test.cjs tests/auth-language-choice.test.cjs: passed
  - pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec jest <39 suites touching the changed files>: passed (527 tests)
changed_files:
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/auth/form.errors.ts
  - tests/auth-form-errors.test.cjs
explicit_defers:
  - none
---

# Summary

Same cause as `content-factory-next-fn33.72`: a client-side class-validator message rendered as it stood. The helper answers with a translated sentence, and the minimum is read out of the message rather than copied from the DTO, so the number on screen stays true if the rule changes.

The other half of the report — the person expected an empty name to be allowed, since ordinary registration never asks for one — is a `@MinLength(3)` on `UserDetailDto`, which is outside this write zone. Not changed; raised for the owner.

# Scope / Routing

Stream H1 of the 04.09.2026 wave: the sign-in, registration and invitation screens. Write zone as
declared above. No documentation source was needed — every decision here is settled by the
repository's own code and the design rules already in it.

# Verification

Every command below was run in this worktree on Node 22.23.2.

- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed`
- `pnpm exec jest tests/auth-form-errors.test.cjs tests/register-invitation-landing.test.cjs tests/auth-language-choice.test.cjs: passed`
- `pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed`
- `pnpm exec jest <39 suites touching the changed files>: passed (527 tests)`

The three new suites were run against the unchanged sources first and failed there; they pass with
the change in place.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. Nothing was pushed and no bead was closed.

# Risks / Follow-ups / Explicit Defers

- Owner decision: should the profile name be optional? `UserDetailDto` requires three characters, and nothing collects a name at registration, so every account created that way cannot save its profile until it invents one. Needs a bead of its own against the backend DTO.
