---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-rmp/stage-manifest.json
stream_owner: rmp_backend
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: content-factory-next-rmp acceptance
public_facade: authenticated user identity API and sign-in lookup
bounded_acceptance: additive identity schema, repository behavior, provider state, and dry-run-first backfill
non_goals:
  - production schema application
  - production backfill execution
  - provider credential wiring
evidence:
  - focused_tests
  - source_review
  - diff_review
task_id: content-factory-next-rmp.backend
epic_id: content-factory-next-aay
stage_id: content-factory-next-rmp
session_id: goal-content-factory-next-aay
milestone: linked identities backend slice
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: high
model_reasoning_rationale: authentication, schema, migration, and account-lockout risks require Сол
repo: content-factory-next
branch: work/user-identity
base_branch: main
base_commit: 53fc73c673abe552b71116454e494aa5538416cd
worktree: /tmp/cf-user-identity
write_zone:
  - apps/backend/src/services/auth
  - apps/backend/src/api/routes/users.controller.ts
  - libraries/nestjs-libraries/src/database/prisma
  - libraries/nestjs-libraries/src/dtos/users
  - scripts/operations/backfill-user-identities.cjs
  - docs/operations/user-identity-backfill.md
  - tests/user-identity.auth.test.cjs
  - tests/user-identity.contract.test.cjs
success_criteria:
  - any linked identity can authenticate without email-based external linking
  - an identity owned by another account is refused
  - the last identity cannot be removed under concurrent writes
  - legacy users remain compatible before and after a separately operated backfill
selected_docs:
  - AGENTS.md
  - docs/prompts/codex-remaining-tasks.md
  - .codex/stages/content-factory-next-rmp/auth-map.md
selected_skills:
  - superpowers:test-driven-development
  - technical-premortem
selected_agents:
  - rmp_backend
  - rmp_mock_fixtures
catalog_candidates:
  - none
parallel_group: rmp-auth
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared-worktree stream completed; no child branch, process, external resource, or production connection remains.
risk_level: high
risk_tags:
  - migration
  - security
  - authorization
  - concurrency
  - atomicity
  - retry
  - rollback
affected_surfaces:
  - database
  - data
  - api
  - backend
  - user-flow
invariants:
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: migration
docs_reviewed: updated
docs_review_notes: Dry-run-first maintenance-gated backfill procedure added; production execution remains owner-only.
verification:
  - focused backend Jest RED: failed as expected
  - focused backend Jest 29/29: passed
  - Prisma format: passed
  - independent security review: passed
  - independent correctness review: passed
changed_files:
  - apps/backend/src/api/routes/users.controller.ts
  - apps/backend/src/services/auth/auth.service.ts
  - apps/backend/src/services/auth/providers/github.provider.ts
  - apps/backend/src/services/auth/providers/google.provider.ts
  - apps/backend/src/services/auth/providers/oauth.state.ts
  - apps/backend/src/services/auth/providers/telegram.provider.ts
  - docs/operations/user-identity-backfill.md
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/users/user-identity.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/users/users.service.ts
  - libraries/nestjs-libraries/src/dtos/users/link-user-identity.dto.ts
  - scripts/operations/backfill-user-identities.cjs
  - tests/enterprise.approval.test.cjs
  - tests/public.api.approval.test.cjs
  - tests/user-identity.auth.test.cjs
  - tests/user-identity.contract.test.cjs
explicit_defers:
  - none
---

# Summary

The additive identity model, authenticated mutation boundary, identity-first
lookup, legacy fallback, provider state binding, serializable unlink, and
dry-run-first backfill were accepted into the shared task worktree.

# Delivery / Cleanup

Delivery was direct shared-worktree integration. The stream is idle and left no
separate branch, runtime, database connection, or external action to clean.

# Verification

The focused backend pair passed 29/29 after the recorded RED cycles. Prisma
format, focused formatting, diff checks, and independent security and
correctness reviews also passed.

# Risks / Follow-ups

Live PostgreSQL contention, schema application, and backfill execution remain
outside the local branch. They are not reported as passes.
