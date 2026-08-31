---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-71m.5/stage-manifest.json
stream_owner: memory-google-lazy
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: backend startup and Google OAuth/social provider requests
public_facade: existing AuthProvider and SocialProvider contracts
bounded_acceptance: Google APIs are absent from cold module evaluation, loaded on first Google-dependent request, memoized thereafter, and existing OAuth/provider shapes remain unchanged.
non_goals:
  - Lazy-loading the complete IntegrationManager provider registry.
  - Refactoring ChatModule, Mastra, MCP, Prisma, or Nest module ownership.
  - Contacting Google, a database, a container, or any deployed process.
evidence:
  - focused-red-green
  - provider-contract-shapes
  - isolated-import-memory-probe
task_id: content-factory-next-71m.5
epic_id: content-factory-next-71m
stage_id: content-factory-next-71m.5
milestone: defer googleapis from backend cold start without provider behavior changes
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: high
model_reasoning_rationale: The change crosses authentication and two provider implementations, while a missed boot edge would silently invalidate the memory result.
repo: content-factory-next
branch: work/backend-memory-survey
base_branch: main
base_commit: 04f9f6d7
worktree: /tmp/cf-backend-memory-survey
write_zone:
  - apps/backend/src/services/auth/providers/google.provider.ts
  - libraries/nestjs-libraries/src/integrations/social/gmb.provider.ts
  - libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts
  - tests/backend-memory.googleapis-lazy.test.cjs
  - .codex/stages/content-factory-next-71m.5/artifacts/googleapis-lazy.md
success_criteria:
  - Module evaluation and provider construction do not load googleapis.
  - The first Google-dependent call loads googleapis once and later calls reuse the Promise.
  - OAuth URL, scopes, token exchange, credentials, and user mapping preserve their prior shapes.
selected_docs:
  - AGENTS.md
  - docs/prompts/codex-remaining-tasks.md
  - Bead content-factory-next-71m.5
selected_skills:
  - orchestrator-stage
  - superpowers:test-driven-development
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Changes were copied into the assigned task worktree and the accidental edits in the schema-guard worktree were removed; no runtime or external resource was created.
risk_level: medium
verification_tier: inner_loop
risk_tags:
  - authentication-provider
  - social-provider
  - lazy-import
  - startup-memory
affected_surfaces:
  - google-login
  - youtube-integration
  - google-my-business-integration
invariants:
  - provider-metadata-remains-synchronous
  - google-sdk-loads-once-per-provider-module
  - oauth-and-user-shapes-do-not-change
docs_impact: stage-evidence-only
docs_reviewed: updated
docs_review_notes: The stage records measured boot cost and the non-additive measurement limits; no operator or public contract changed.
verification:
  - RED on Node 22.23.2 and TMPDIR=/tmp: 1 suite failed, 3/3 tests failed because googleapis loaded during module evaluation.
  - GREEN with the exact same target: 1 suite passed, 3/3 tests passed.
  - Five isolated cold imports measured a median 93.1 MiB RSS, 45.4 MiB heap, and 396.4 ms; this is a package cost, not an additive full-process saving.
  - Seven post-change IntegrationManager imports measured 148.15 MiB median RSS versus the 202.62 MiB pre-change median; all seven loaded 2396 modules and kept googleapis out of require.cache.
  - git diff --check passed for the delegated stream.
changed_files:
  - apps/backend/src/services/auth/providers/google.provider.ts
  - libraries/nestjs-libraries/src/integrations/social/gmb.provider.ts
  - libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts
  - tests/backend-memory.googleapis-lazy.test.cjs
  - .codex/stages/content-factory-next-71m.5/artifacts/googleapis-lazy.md
explicit_defers:
  - content-factory-next-71m.7 owns full-process and production-container RSS after an owner-controlled deployment.
  - Mastra/MCP and provider-registry lazy-loading remain outside this narrow change.
---

# Summary

`googleapis` moved behind one memoized dynamic-import Promise in each of the
three boot-reachable modules: Google login, Google My Business, and YouTube.
The provider registry and its metadata remain synchronously available. The
first method that actually needs Google loads the SDK; all later methods in
that module reuse the same Promise.

`GoogleProvider.generateLink` now returns a Promise, which is already allowed
by `AuthProviderAbstract` and awaited by the existing controller path. Type-only
imports for OAuth, Gaxios, and YouTube response types no longer create runtime
edges.

# Verification

The focused test transpiles each TypeScript module in isolation and counts the
mocked `googleapis` load. Before implementation all three cases loaded at module
evaluation and failed. After implementation, evaluation and construction stay
at zero, the first provider call increments to one, and repeated URL, token,
and user operations keep it at one while preserving the old payload shapes.

The package-only cold import cost was 93.1 MiB RSS at the median. A paired
profile of the actual IntegrationManager graph gives the more useful measured
local boot difference: 54.47 MiB RSS. The exact production-container delta remains
unknown until an owner-controlled deployment; this task did not contact the
server.

# Risks / Follow-ups

A missing or damaged installed package now fails the first Google request
instead of backend startup. The rejected Promise is memoized and the original
error remains visible to existing request error handling. Moving the entire
provider registry or Mastra/MCP behind a lazy boundary has a substantially
larger lifecycle and concurrency blast radius and was not included.
