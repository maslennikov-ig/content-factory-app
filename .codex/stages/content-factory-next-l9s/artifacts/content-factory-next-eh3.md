---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave1-eh3
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: all backend controller DTO boundaries
public_facade: global NestJS ValidationPipe
bounded_acceptance: unknown decorated-DTO fields are stripped while 11 audited downstream fields and arbitrary provider payloads survive
non_goals:
  - No forbidNonWhitelisted, controller/service changes, nested webhook validation, VideoAbstract pipe changes, persistence changes, or public error-shape changes
evidence:
  - none
task_id: content-factory-next-eh3
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: globally whitelist validated DTO input without dropping audited downstream data
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-sol
reasoning_effort: xhigh
model_reasoning_rationale: global DTO contract spans 154 audited handlers and requires compatibility reasoning
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-1
base_branch: main
base_commit: 833795208137011f47ff7bf7f12d9058a176251c
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/backend/src/main.ts
  - libraries/nestjs-libraries/src/dtos/integrations/integration.function.dto.ts
  - libraries/nestjs-libraries/src/dtos/videos/video.dto.ts
  - libraries/nestjs-libraries/src/dtos/videos/video.function.dto.ts
  - libraries/nestjs-libraries/src/dtos/billing/billing.subscribe.dto.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/auth/login.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/webhooks/webhooks.dto.ts
  - tests/global.validation-pipe.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-eh3.md
success_criteria:
  - The pipe installed by main strips unknown properties from runtime DTOs without rejecting the request.
  - All 11 audited downstream fields survive whitelisting.
  - IntegrationFunctionDto.data, VideoDto.customParams, and VideoFunctionDto.params preserve arbitrary nested payloads.
  - Optional downstream string fields accept absence and reject non-string values.
  - Metatype Object remains explicitly characterized as unfiltered.
selected_docs:
  - npm/@nestjs/common@11.1.21 from pnpm-lock.yaml
  - https://docs.nestjs.com/techniques/validation
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - superpowers:test-driven-development
  - superpowers:test-driven-development/writing-good-tests.md
  - superpowers:verification-before-completion
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
cleanup_notes: Shared worktree; no branch or temporary resources were created.
risk_level: high
verification_tier: inner
risk_tags:
  - public-api
  - data
  - api
affected_surfaces:
  - backend
  - api
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: Runtime input filtering changes, but existing endpoint contracts remain accurate; the focused regression test records compatibility behavior.
verification:
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/global.validation-pipe.test.cjs --runInBand --coverage=false: failed as expected before implementation (16 failed, 1 passed)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/global.validation-pipe.test.cjs --runInBand --coverage=false: passed after implementation (17 passed)
  - final focused rerun of the same Jest command: passed (17 passed)
  - git diff --check for tracked write-zone files and git diff --no-index --check for the new test: passed
  - root rerun pnpm exec jest tests/global.validation-pipe.test.cjs --runInBand --coverage=false: passed, 17 tests
changed_files:
  - apps/backend/src/main.ts
  - libraries/nestjs-libraries/src/dtos/integrations/integration.function.dto.ts
  - libraries/nestjs-libraries/src/dtos/videos/video.dto.ts
  - libraries/nestjs-libraries/src/dtos/videos/video.function.dto.ts
  - libraries/nestjs-libraries/src/dtos/billing/billing.subscribe.dto.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/auth/login.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/webhooks/webhooks.dto.ts
  - tests/global.validation-pipe.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-eh3.md
explicit_defers:
  - none
---

# Summary

The backend now installs `ValidationPipe` with `transform: true` and `whitelist: true`. The change strips unknown properties from runtime DTO instances but does not enable `forbidNonWhitelisted`, so compatible clients are sanitized rather than rejected.

Validation metadata was added before the global switch. `@Allow()` protects the three provider-owned arbitrary payloads. `@IsOptional()` plus `@IsString()` protects eight optional downstream string fields, including the previously undeclared `LoginUserDto.company` read by provider account creation and `WebhooksDto.id` read by the repository upsert.

# Scope / Routing

The read-only baseline audited 24 controller files, 154 handlers, and 209 `@Body`/`@Query`/`@Param` parameters: 129 key-extracted and 80 whole-object parameters. Of 56 whole-object parameters backed by 45 runtime DTO classes, the 11 downstream fields listed in this stream required metadata. The 24 `Object`/inline parameters are not filtered by NestJS and remain outside the DTO whitelist contract.

The entry point is `apps/backend/src/main.ts`; validation ownership remains in the DTO classes; existing services and repositories continue to own domain behavior and persistence. No controller, service, repository, auth decision, transaction, or external operation changed.

# Verification

TDD RED used the real NestJS `ValidationPipe`. The test loaded the real backend entry point with controlled startup adapters and exercised the exact installed pipe. Before implementation, the global pipe retained an unknown DTO field, while a real target whitelist pipe stripped all 11 missing-metadata fields and accepted invalid types for undecorated optional strings. Result: 16 failed, 1 passed; the passing control proved `Object` metatypes remain unfiltered.

TDD GREEN passed 17/17. It proves unknown DTO fields are removed without rejection, every audited field survives, the three arbitrary payloads keep nested objects and arrays, all eight optional strings accept absence and reject objects, and `Object` input is returned unchanged. Removing `whitelist`, any `@Allow()`, any `@IsOptional()`, or any `@IsString()` breaks a corresponding behavioral assertion.

# Delivery / Cleanup

Returned to the orchestrator for root-owned acceptance. No Git operation, deployment, external request, paid call, secret access, persistence write, or cleanup action was performed.

# Risks / Follow-ups / Explicit Defers

This stream ran only the assigned focused Jest target; broader build and integration acceptance remain root-owned. Global whitelisting intentionally does not affect metatype `Object` or inline object contracts, and nested webhook validation was explicitly out of scope. The read-only route audit is the compatibility basis for enabling the global option; no additional downstream fields were discovered inside the assigned implementation scope.
