---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-q4p/stage-manifest.json
stream_owner: ai-usage
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root acceptance owner
public_facade: AiUsageService operation and model-execution boundary
bounded_acceptance: focused AI usage lifecycle, quota refusal, tenant isolation, DI, configuration and consumer tests
non_goals:
  - per-provider-call accounting, spend caps, reconciliation or pricing decisions
  - schema changes, production database apply, credentials or paid provider calls
  - PRODUCT or SaaS-spec R6 wording owned by the guards-docs stream
evidence:
  - none
task_id: content-factory-next-q4p.3
epic_id: content-factory-next-q4p
stage_id: content-factory-next-q4p
session_id: content-factory-next-q4p
milestone: tenant-isolated AI operation accounting and execution lifecycle repair
milestone_status: accepted
agent_type: backend_developer
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: persistence, quota, streaming lifecycle and tenant context form one high-risk backend boundary
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: main
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - .env.example
  - deploy/production/app.env.example
  - libraries/nestjs-libraries/src/openai/**
  - libraries/nestjs-libraries/src/chat/load.tools.service.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.insert.service.ts
  - libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts
  - libraries/nestjs-libraries/src/database/prisma/database.module.ts
  - apps/backend/src/api/routes/copilot.controller.ts
  - docs/operations/configuration.md
  - focused AI and consumer tests listed in the stage manifest
  - .codex/stages/content-factory-next-q4p/artifacts/ai-usage.md
success_criteria:
  - included and workspace_key use only their explicitly selected credential source with no fallback
  - Mastra model construction does not close usage and real generate or full stream execution owns success or failure finalization
  - quota zero returns 429 without promising an automatic allowance refresh
  - AI usage persistence uses the shared injected PrismaService and all real consumers receive AiUsageService through Nest DI
  - operator examples document only the actual AI_INCLUDED variables and do not imply legacy environment-key fallbacks
  - production configuration requires an empty fail-closed growth HMAC placeholder and documents a stable independent key of at least 32 bytes
selected_docs:
  - AGENTS.md
  - PRODUCT.md AI Delivery Model
  - docs/operations/configuration.md
  - .codex/stages/content-factory-next-q4p/spec.md
  - .codex/stages/content-factory-next-q4p/plan.md
  - .codex/stages/content-factory-next-q4p/stage-manifest.json
  - graphify-out/GRAPH_REPORT.md plus focused AiUsageService and LoadToolsService queries
  - '@mastra/core docs-resolve: requested 1.45.0 per initial task, then repository-exact 1.21.0; exact 1.21.0 returned cross-track because L1 contained 1.45.0'
  - installed @mastra/core 1.21.0 agent and loop declarations/source for LanguageModelV2 doGenerate/doStream and lifecycle ordering
selected_skills:
  - superpowers:using-superpowers
  - orchestrator-stage
  - superpowers:test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cloud-saas-review-repair-writers
depends_on_streams:
  - guards-docs owns R6 PRODUCT and SaaS-spec wording
parallel_decision: write-isolated parallel stream
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; no branch, process, temporary database, credential or external session was created, so no residual resource remains
risk_level: high
risk_tags:
  - tenancy
  - concurrency
  - atomicity
  - state-transition
  - data
  - api
affected_surfaces:
  - database
  - data
  - api
  - backend
invariants:
  - tenancy
  - state-transition
  - idempotency
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: environment examples and operator configuration now match the explicit included/workspace credential contract and quota-zero behavior
verification:
  - 'Graph review: graphify query/explain mapped LoadToolsService to MastraService, ChatModule, ai.clients, ai.provider.config and the AI usage seam before broad source inspection.'
  - 'RED: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/ai-usage.execution.test.cjs tests/ai-usage.consumer-guard.test.cjs tests/chat.language.prompt.test.cjs failed 14 tests for the missing injectable service, module-level Prisma client, refresh text and model-construction lifecycle.'
  - 'GREEN core: the same command passed 3 suites and 18 tests.'
  - 'GREEN consumers: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand on 12 focused AI/agent/chat/copilot/autopost/SSRF/web-research suites passed 12 suites and 95 tests.'
  - 'Backend type contract: Node 22.23.2, TMPDIR=/tmp, pnpm exec tsc --noEmit --project apps/backend/tsconfig.json passed.'
  - 'Docs decision: exact installed @mastra/core 1.21.0 public-type finding persisted locally with orch-prompts docs-persist after cross-track docs-resolve.'
  - 'Correction RED (configuration): Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/ai-provider.usage-mode.test.cjs failed 3 tests and passed 5 because the production template lacked the real fail-closed variables and the selected-mode 503 promised wait/refresh.'
  - 'Correction GREEN (configuration): the same command passed 1 suite and 8 tests; the focused compatibility matrix with copilot and AI usage passed 4 suites and 29 tests before the stream-race addition.'
  - 'Correction RED (model stream): Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/ai-usage.execution.test.cjs failed 1 of 14 tests because reader.cancel raced the pending pull and incorrectly finalized succeeded; successful EOF already finalized succeeded exactly once.'
  - 'Correction GREEN (model stream): the same command passed 1 suite and 14 tests after cancellation reserved failed before awaiting the underlying reader cancellation.'
  - 'Correction final focused acceptance: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/ai-provider.usage-mode.test.cjs tests/copilot.controller.test.cjs tests/ai-usage.execution.test.cjs tests/ai-usage.consumer-guard.test.cjs passed 4 suites and 31 tests.'
  - 'P1 stream-close RED: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest --runInBand tests/ai-usage.execution.test.cjs failed 1 of 15 tests because breaking generic stream consumption did not call the upstream async iterator return/finally, although the ledger was already failed.'
  - 'P1 stream-close GREEN: the same command passed 1 suite and 15 tests after incomplete consumer exit closed the upstream iterator inside the active tenant configuration and finalized failed exactly once.'
  - 'Focused git diff --check for the assigned and expanded write zone passed.'
changed_files:
  - .env.example
  - apps/backend/src/api/routes/copilot.controller.ts
  - deploy/production/app.env.example
  - docs/operations/configuration.md
  - libraries/nestjs-libraries/src/agent/agent.graph.insert.service.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/chat/load.tools.service.ts
  - libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts
  - libraries/nestjs-libraries/src/database/prisma/database.module.ts
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.config.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.service.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/openai.service.ts
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - tests/agent.language.prompt.test.cjs
  - tests/ai.clients.test.cjs
  - tests/ai-provider.usage-mode.test.cjs
  - tests/ai-usage.consumer-guard.test.cjs
  - tests/ai-usage.execution.test.cjs
  - tests/ai.search.config.test.cjs
  - tests/autopost.generation.test.cjs
  - tests/autopost.research-enrichment.test.cjs
  - tests/chat.language.prompt.test.cjs
  - tests/copilot.controller.test.cjs
  - tests/server-url-ssrf.test.cjs
  - tests/web.research.degradation.test.cjs
  - tests/web.research.service.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/ai-usage.md
explicit_defers:
  - content-factory-next-saas.5 owns per-provider-call accounting, spend-cap sizing and reconciliation; this stage deliberately counts one admitted or started product-operation attempt, including failed or incomplete attempts
  - no real provider or deployed database was called; root acceptance and authorized environment checks remain separate
---

# Summary

`AiUsageService` is now an injectable Nest service backed by the shared
`PrismaService`. `DatabaseModule` registers and exports it, and every real AI
consumer receives the same boundary through DI. No module-level usage-ledger
`PrismaClient` remains. Serializable included admission, bounded P2034 retry,
privacy-safe fields, final-status best effort and cross-tenant refusal are
preserved.

Mastra still resolves a tenant-specific model per request, but model creation
does not create or finish a usage record. The returned public
`LanguageModelV2` execution surface is proxied: `doGenerate` is wrapped for the
complete provider promise, while `doStream` remains admitted until its
`ReadableStream` closes, fails or is cancelled. Nested tool/model calls for the
same organization reuse the active operation; another organization is refused.

The generic async-iterable stream boundary now retains its upstream iterator.
Normal EOF finalizes `succeeded`; provider errors finalize `failed`; and an
early consumer `break`/return invokes upstream `return()` within the active
tenant configuration before finalizing `failed` exactly once. Client abort can
therefore stop graph/provider work instead of merely closing its ledger entry.

The zero-quota 429 now states only that no allowance is configured or the
current allowance is exhausted and offers explicit `workspace_key`; it does
not promise a refresh. The selected-mode 503 likewise names only real operator
or workspace-administrator actions. `.env.example` and the production app
template expose only
`AI_INCLUDED_API_KEY`/`AI_INCLUDED_SEARCH_API_KEY` for server-managed mode and
remove the unused legacy key examples. The production template also requires
an empty `PUBLIC_GROWTH_DEDUPE_KEY` placeholder and documents a stable,
independent HMAC key of at least 32 bytes without suggesting secret reuse.
Operator docs explicitly state that
workspace keys come from encrypted organization settings and no credential
fallback exists.

# Scope / Routing

The entry points are Copilot chat/agent, Mastra dynamic model execution,
OpenAI generation, web research, agent graphs, content classification and
autopost. Domain ownership is centralized in `AiUsageService`; consumers only
name the organization, product operation and callback. Persistence stays in
one service and one shared Prisma connection boundary. No schema, DTO,
authorization decorator, provider promise, pricing decision or R6 durable
product wording was added.

The initial task named `@mastra/core@1.45.0`, but repository truth is 1.21.0 in
`package.json`, `pnpm-lock.yaml` and installed package metadata. The resolver's
1.21.0 request reported a cross-track 1.45.0 L1 result. Implementation therefore
relies only on exact installed 1.21.0 public declarations and source ordering:
Mastra calls a `LanguageModelV2` model's `doGenerate`/`doStream` after dynamic
model resolution. No private Mastra hook or version-foreign callback was used.

# Verification

The focused RED failed for the intended reasons: no constructible injectable
service, a module-owned Prisma client, refresh-promising 429 text, and usage
ending during Mastra model construction. Core GREEN passed 18/18 tests. The
expanded consumer matrix passed 95/95 tests across 12 suites after DI adoption.
Backend TypeScript passed without emitting, and focused whitespace validation
passed.

Success and high-risk failure coverage includes serializable quota admission,
quota zero before callback, missing selected credential, provider rejection,
final ledger-write outage, nested operation reuse, cross-tenant refusal,
stream failure, successful EOF, cancellation propagation and cancellation/EOF
finalization races. Generic async-iterator coverage also proves that an early
consumer break executes the source generator's `finally` and records one
failed finalization. No paid call, live account, database apply or production
action occurred.

# Delivery / Cleanup

Changes remain in the shared worktree for root inspection and acceptance. No
commit, Beads mutation, merge, push, pull request, deploy, credential wiring,
provider request or cleanup action was performed. Root owns the single final
acceptance and durable task-state update.

Root reaccepted the current stream after the independent reviewer verified the
shared Prisma DI boundary, all mapped consumers, model proxy execution hooks,
model cancel/EOF one-shot finalization, generic upstream iterator cleanup and
the corrected production configuration. The abandoned unread stream limitation
remains explicit; final release verification remains root-owned.

# Risks / Follow-ups / Explicit Defers

A consumer that obtains a provider stream and then abandons it without reading
or cancelling the model `ReadableStream` leaves the record in `admitted`;
normal completion, error, explicit cancel and generic async-iterator early
return paths all finalize exactly once. Admission already counts the operation,
so this does not weaken the included quota check or invite a duplicate paid
call, but operator status metrics may show a fully abandoned model stream as
unfinished.

The focused tests use deterministic Prisma and provider boundaries; they do not
replace an authorized deployed-database or real-provider smoke check. R6 remains
an operation counter, not a per-call spend cap, and the existing SaaS gate owns
that future work.
