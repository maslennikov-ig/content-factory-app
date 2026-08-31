---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave1-ao3
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: n/a
bounded_acceptance: focused PermissionsService authorization test
non_goals:
  - instance-level isSuperAdmin checks
  - public permission contracts
  - billing configuration
evidence:
  - none
task_id: content-factory-next-ao3
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: wave-1 organization-role authorization fix
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: xhigh
model_reasoning_rationale: P1 authorization defect assigned by the user
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-1
base_branch: main
base_commit: 833795208137011f47ff7bf7f12d9058a176251c
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/backend/src/services/auth/permissions/**
  - tests/permissions*.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-ao3.md
success_criteria:
  - Without Stripe, USER cannot access Sections.ADMIN and ADMIN can.
  - Without Stripe, subscription limits remain waived.
  - Restoring the old unconditional early grant fails the regression test.
selected_docs:
  - AGENTS.md
  - graphify-out/GRAPH_REPORT.md
  - bd show content-factory-next-ao3
selected_skills:
  - /home/me/.agents/skills/superpowers/test-driven-development/SKILL.md
  - /home/me/.agents/skills/superpowers/test-driven-development/writing-good-tests.md
  - /home/me/.agents/skills/superpowers/verification-before-completion/SKILL.md
selected_agents:
  - backend_developer
catalog_candidates:
  - none
parallel_group: wave-1
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree; no branch or temporary files created.
risk_level: high
verification_tier: inner
risk_tags:
  - authorization
  - tenancy
affected_surfaces:
  - backend
invariants:
  - tenancy
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: Behavior is fully specified by the Bead and regression test; no public contract or operator configuration changed.
verification:
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/permissions.service.test.cjs --runInBand (RED): failed as expected, USER received ADMIN permission'
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/permissions.service.test.cjs --runInBand (GREEN): passed, 2 tests'
  - 'git diff --check -- assigned files: passed'
  - 'root rerun: pnpm exec jest tests/permissions.service.test.cjs --runInBand: passed, 2 tests'
changed_files:
  - apps/backend/src/services/auth/permissions/permissions.service.ts
  - tests/permissions.service.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-ao3.md
explicit_defers:
  - none
---

# Summary

`PermissionsService.check()` now separates organization-role authorization from subscription enforcement. With no Stripe publishable key, non-admin subscription-gated sections are still allowed without billing lookups, while `Sections.ADMIN` is granted only to `ADMIN` and `SUPERADMIN` organization roles.

# Scope / Routing

The change stays inside the assigned permissions service and one focused test. Graphify was queried for `PermissionsService`, `CheckPolicies`, `StripeService`, and organization-role paths. Instance-level `isSuperAdmin` checks, the guard contract, persistence, and billing configuration were not changed.

# Verification

The focused test was written before production code. RED failed on the intended assertion: expected `USER` access to `Sections.ADMIN` to be `false`, received `true`. After the minimal fix, GREEN passed both the role matrix and the billing-limit waiver scenario. The test uses the real `PermissionsService` and CASL ability; billing dependencies throw on access so the no-Stripe bypass also proves no tariff lookup occurs.

# Delivery / Cleanup

Changes are present in the shared wave-1 worktree for root review and acceptance. No commit, staging, branch switch, or external action was performed. No cleanup is needed.

# Risks / Follow-ups / Explicit Defers

Residual risk is limited to root-owned wave acceptance and backend type/build verification, which were intentionally not run in this focused TDD stream. There are no explicit defers.
