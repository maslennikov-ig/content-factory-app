---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave1-d08
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: POST /enterprise/create-user
public_facade: EnterpriseController -> OrganizationService -> OrganizationRepository
bounded_acceptance: Enterprise-created user is inactive exactly when CONTENT_FACTORY_REQUIRE_APPROVAL=true and active when the setting is absent; SUPERADMIN and ULTIMATE persistence is unchanged.
non_goals:
  - Changing reseller roles, subscription tier, JWT verification, or controller error responses.
evidence:
  - none
task_id: content-factory-next-d08
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: Enterprise approval-policy enforcement
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: Account activation is authorization state written with organization creation.
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-1
base_branch: codex/2026-08-16-l9s-wave-1
base_commit: 833795208137011f47ff7bf7f12d9058a176251c
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - tests/enterprise.approval.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-d08.md
success_criteria:
  - Enterprise path persists activated=false when approval is required.
  - Enterprise path persists activated=true when approval is not required.
  - The path delegates the decision to resolveNewUserAccess without rereading the environment.
  - SUPERADMIN and ULTIMATE persistence remains unchanged.
selected_docs:
  - AGENTS.md
  - docs/operations/configuration.md
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - /home/me/.agents/skills/superpowers/test-driven-development/SKILL.md
  - /home/me/.agents/skills/superpowers/test-driven-development/writing-good-tests.md
selected_agents:
  - n/a
catalog_candidates:
  - n/a
parallel_group: wave-1
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared workspace; no branch or temporary environment was created.
risk_level: medium
verification_tier: inner
risk_tags:
  - authorization
  - state-transition
  - data
  - api
affected_surfaces:
  - backend
  - database
  - api
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: configuration.md already defines CONTENT_FACTORY_REQUIRE_APPROVAL as a global activation policy; no new variable or operator action was introduced.
verification:
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/enterprise.approval.test.cjs --runInBand: RED failed as expected before implementation (approval=true expected activated=false, received true).
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/enterprise.approval.test.cjs --runInBand: GREEN passed (2 tests).
  - git diff --check -- apps/backend/src/api/routes/enterprise.controller.ts libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts tests/enterprise.approval.test.cjs: passed.
  - root rerun pnpm exec jest tests/enterprise.approval.test.cjs --runInBand: passed, 2 tests.
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - tests/enterprise.approval.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-d08.md
explicit_defers:
  - none
---

# Summary

`POST /enterprise/create-user` now obtains the activation flag from the shared
`resolveNewUserAccess` rule. A JWT signed with the instance secret authorizes
the reseller request but cannot bypass `CONTENT_FACTORY_REQUIRE_APPROVAL`.

# Scope / Routing

The controller remains the authenticated entry point. `OrganizationService`
owns the access decision and passes only `activated` to the Prisma repository;
the repository continues to create the same organization, `SUPERADMIN` relation,
and lifetime `ULTIMATE` subscription in one existing Prisma create operation.

# Verification

The new focused behavior test loads the real resolver, service, and repository
and inspects the Prisma create payload. It demonstrated RED before the change
and GREEN afterwards for both approval states. The mutation `activated: true`
in the repository (or omission of the resolver-derived argument) fails the
approval-required case.

# Delivery / Cleanup

Returned to the orchestrator for acceptance. No cleanup is required.

# Risks / Follow-ups / Explicit Defers

No local database integration was run: the focused test verifies the exact
Prisma nested write payload, while the existing atomic Prisma create boundary
is unchanged. Root-owned acceptance may run wider checks if the stage requires
them.
