---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-9e9/stage-manifest.json
stream_owner: subagent:consumer-backend
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-9e9.consumer-backend
stage_id: content-factory-next-9e9
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: 149560da
worktree: /tmp/cf-vme2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared-worktree delivery only. One disposable PostgreSQL 17 container and two temporary baseline SQL/schema files were used for the correction proof, then stopped/removed and independently confirmed absent. No shared database, server, browser, network fetch, model, credential, Temporal worker, publishing or deployment resource was started.
risk_level: high
risk_tags:
  - tenancy
  - ai-admission
  - immutable-provenance
  - transaction-integrity
  - temporal-versioning
affected_surfaces:
  - backend
  - api
  - orchestrator
  - data
invariants:
  - authenticated-organization-is-the-only-tenant-authority
  - one-context-build-before-any-model-or-ai-usage-admission
  - exact-profile-context-and-per-item-citation-provenance
  - content-intelligence-output-is-draft-only
  - autopost-v1-contract-is-unchanged
  - autopost-v2-draft-and-last-url-commit-atomically
verification:
  - 'RED: node --test tests/content-intelligence.consumer-backend.test.cjs — 3/4 passed and AutoPost V2 failed because the separate workflow/activity did not exist'
  - 'COMPATIBILITY RED: focused existing Jest run initially failed Copilot and AutoPost research loaders after the new pre-admission dependencies; fixtures were updated without weakening production fail-closed behavior'
  - 'P1 CORRECTION RED: generic schedule/no-context and CI non-draft tests failed on the draft-only schema; the V2 terminal-failure test observed the swallowed activity error and an incorrect next sleep'
  - 'P1 CORRECTION GREEN: generic schedule/now remains executable without content context, CI mode rejects non-draft and persists only server context/profile plus allowed per-item citations, and generic instructions contain no CI restriction'
  - 'POST-ACCEPTANCE RED: real Prisma checked Post upsert rejected direct contentContextSnapshotId/brandProfileVersionId alongside nested organization/integration; exact baseline plus stage migration reproduced the failure before any Post write'
  - 'POST-ACCEPTANCE GREEN: Post create/update use tenant-composite nested context/profile connects and contextless update uses relation disconnect; the stateful harness rejects any regression to scalar FK checked input'
  - 'POSTGRES GREEN: PostgreSQL 17, exact 6e1d1621 baseline plus the selected 137-statement stage migration; POST_CONTENT_CONTEXT_POSTGRES_URL=<disposable local database> node --test tests/post.content-context.test.cjs — 13/13 passed, including exact Post/ContentOutputContext/DraftEvidence/lastUrl success and two-body invalid-citation full rollback'
  - 'GREEN: node --test tests/content-intelligence.consumer-backend.test.cjs tests/post.content-context.test.cjs — 23 passed, 2 conditional PostgreSQL proofs skipped after the disposable database was removed'
  - 'GREEN: pnpm exec jest --runInBand tests/agent.language.prompt.test.cjs tests/chat.language.prompt.test.cjs tests/copilot.controller.test.cjs tests/autopost.generation.test.cjs tests/autopost.research-enrichment.test.cjs tests/orchestrator.autopost-activity.test.cjs — 6 suites, 28/28 passed'
  - 'FAILURE PATH: Generator and AutoPost current-required fixtures recorded one context build and zero AI/WebResearch/model calls; Mastra missing-context fixture recorded zero prepareModelExecution/provider calls'
  - 'TRANSACTION: stateful Prisma-shaped test proves AutoPost V2 Post/ContentOutputContext/DraftEvidence writes and lastUrl marker commit together, while a provenance failure rolls all of them back'
  - 'IDEMPOTENCY: repeated V2 configuration for the same tenant/source resolves to one deterministic UUIDv5 row; repeated source snapshot execution is skipped and Temporal activity retries use the atomic Post/marker boundary'
  - 'OPERATOR FAILURE: missing Temporal start marks the committed V2 row requires-attention/inactive and returns AUTOPOST_V2_WORKFLOW_UNAVAILABLE with status 503'
  - 'TEMPORAL FAILURE: after the configured three activity attempts, an unhandled permanent V2 activity error propagates from the workflow and remains observable as workflow FAILED; the workflow does not sleep into another pass'
  - 'TYPECHECK: pnpm exec tsc --noEmit -p apps/backend/tsconfig.json — passed'
  - 'TYPECHECK: pnpm exec tsc --noEmit -p apps/orchestrator/tsconfig.json — passed'
  - 'PRISMA: prisma validate and generate passed; the production SQL guard accepted all 137 explicitly selected additive migration statements'
  - 'ROOT REGISTRATION: V2 workflow export and activity provider were added alongside V1; registration plus existing activity tests passed 4/4 and orchestrator TypeScript passed.'
  - 'FORMAT: Prettier wrote all owned TypeScript/CJS files and the final scoped check passed'
  - 'SCOPED DIFF: git diff --check passed; git diff reports no change to upstream autopost.workflow.ts or autopost.activity.ts'
changed_files:
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/dtos/generator/generator.dto.ts
  - apps/backend/src/api/routes/copilot.controller.ts
  - libraries/nestjs-libraries/src/chat/load.tools.service.ts
  - libraries/nestjs-libraries/src/chat/tools/integration.schedule.post.ts
  - libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts
  - libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts
  - libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts
  - libraries/nestjs-libraries/src/dtos/autopost/autopost.dto.ts
  - apps/backend/src/api/routes/autopost.controller.ts
  - apps/orchestrator/src/workflows/autopost-draft-v2.workflow.ts
  - apps/orchestrator/src/activities/autopost-draft-v2.activity.ts
  - tests/content-intelligence.consumer-backend.test.cjs
  - tests/chat.language.prompt.test.cjs
  - tests/copilot.controller.test.cjs
  - tests/autopost.research-enrichment.test.cjs
  - tests/orchestrator.autopost-activity.test.cjs
  - tests/post.content-context.test.cjs
  - .codex/stages/content-factory-next-9e9/artifacts/consumer-backend.md
explicit_defers:
  - no-live-source-fetch-model-temporal-worker-publish-credentials-deploy-or-production-database-action
completion_event: 4f449e0d-ad8b-438e-a613-1e63b0f4285e
supersedes_completion_event: 98b0c268-8254-4aa6-9186-c277dbb65bb8
---

# Summary

The backend consumer stream adopts the accepted immutable content context and
published brand-profile contract in Generator, editor research, the
Copilot/Mastra agent and a new AutoPost V2 path. Every entry point derives the
organization from authenticated server context. No DTO or model/tool input can
provide an organization id, context snapshot id or resolved profile id as
authority.

Generator accepts optional freshness, brand selection and bounded source/fact/
user-material ids while keeping every legacy field compatible. It builds one
`ContentContextBuilderV1` snapshot before entering `AiUsageService`, resolves
the exact profile version from that snapshot before admission, and replaces
legacy free-form web research in model prompts with the bounded server
renderer. The NDJSON stream first exposes a `content-context` event and carries
the exact snapshot/profile/selection metadata through the final graph state.
Every generated item contains validated `usedCitationIds`; unknown or missing
grounded citations produce an explicit stream error code. `REQUIRE_CURRENT`
without stored fresh evidence and an unavailable selected profile also produce
explicit pre-model error events.

`POST /copilot/research?language=ru|en` now returns the canonical immutable
EDITOR envelope plus derived `brandProfileVersionId`; omitted/unknown language
stays backward-compatible as English. It does not turn a provider summary into
typed provenance. The `/copilot/agent` path builds once per request, resolves
the matching brand voice and places both server-issued values in Mastra's
request context before AI admission. The singleton agent continues resolving
its tenant model per request, now uses the consistent `content-factory` memory
key, renders only server context/profile data, and rejects a missing or
mismatched context before `prepareModelExecution`.

The generic/MCP scheduling tool keeps its legacy `draft|schedule|now` schema,
validation and persistence behavior and needs no content context. Only
`POST /copilot/agent` enables the server-owned `content-intelligence/v1`
request-context mode. In that mode the tool requires the serialized server
context, explicitly rejects every non-draft action, validates proposed
citation ids against that envelope, and injects the exact context/profile plus
per-item citations into the common Post sink. Model input cannot provide the
tenant, mode, context id or profile id. Group reads remain tenant-scoped and
now return `contentOutputContext` with exact ids/citations/validation status
and safe context/profile display metadata; raw evidence bytes are read
separately through the authenticated immutable context endpoint.

AutoPost V1 source, workflow and activity files are unchanged. New
`POST /autopost/v2` requires a tenant-owned active source and an exact published
profile version. Creation executes through
`BrandProfileRepository.withPinnedPublishedVersionWrite`; a deterministic
tenant/source UUID makes retries one upserted configuration. The separate
`autoPostDraftV2Workflow` calls `AutopostDraftV2Activity.autoPostDraftV2` with
both tenant and id. At each run the service reads the tenant-bound source's
current snapshot, skips an already processed snapshot, builds one
`REQUIRE_CURRENT` context, re-resolves the pinned voice and only then admits a
model. Missing/stale evidence, profile loss, invalid citations, missing target
channels and workflow-start failures are handled in the service by disabling
the row and making operator-visible attention state without a model call where
applicable. An unhandled permanent model or atomic-write error is not swallowed
by the workflow: Temporal applies the declared activity retry policy and then
the workflow becomes observably failed.

The V2 Post set is persisted through one serializable repository transaction.
Each channel gets a draft with the exact snapshot/profile and per-item
citations, `ContentOutputContext` and `DraftEvidence`; only after all writes
succeed does the same transaction advance `lastUrl` to the processed source
snapshot id. A retry sees the marker and does nothing. Any provenance or marker
conflict rolls back the complete set. Post create and grounded update attach
the snapshot/profile through tenant-composite nested Prisma relations; an
ungrounded update disconnects both relations and removes prior typed
provenance atomically. No checked Post input writes a scalar provenance FK.

# Verification

This post-acceptance correction supersedes and resolves completion review
`98b0c268-8254-4aa6-9186-c277dbb65bb8`; correction completion event
`4f449e0d-ad8b-438e-a613-1e63b0f4285e` returns the stream for root re-review.

Focused Node coverage directly exercises pre-admission ordering, explicit
blocked stream errors, Post read tenancy, deterministic V2 config retries,
zero-call blocked AutoPost behavior, exact successful context/profile/citation
flow, shared serializable pin ordering, Temporal start failure visibility,
V1/V2 separation and the atomic Post/marker rollback boundary. The conditional
real-PostgreSQL correction proof ran against the exact baseline plus selected
stage migration: all 13 Post tests passed, the positive V2 transaction created
the Post, output context and draft evidence before advancing `lastUrl`, and a
second two-body call rolled back its first valid draft when the second citation
was invalid.

Six compatibility suites cover Russian/English prompts, generic no-context
Mastra admission/instructions, CI fail-closed admission, Copilot
provider/errors/editor envelope, legacy AutoPost generation and research
behavior, direct V2 activity forwarding, and terminal workflow failure
propagation. Both backend and orchestrator TypeScript graphs compile without
diagnostics. Prisma validation/client generation and the 137-statement SQL
guard pass. Owned files were formatted and pass whitespace checks. The
disposable PostgreSQL container and temporary baseline files were removed. No
network, source fetch, provider model, AI allowance, Temporal worker, live
account, publishing or deployment action ran.

# Risks / Follow-ups

- Root-owned registration is present in the shared worktree and its focused
  check passes. The V2 export is `autoPostDraftV2Workflow`; the provider class
  is `AutopostDraftV2Activity`, its only constructor dependency is
  `AutopostService`, and the activity method is `autoPostDraftV2({id,
organizationId})`.
- The positive/rollback path now has both stateful-harness and real disposable
  PostgreSQL evidence. No production/shared database or `prisma db push` was
  touched.
- `POST /copilot/research` intentionally no longer calls free-form WebResearch;
  legacy `researchSources` remains display compatibility only and never
  confers typed provenance. Consumers needing freshness/source details should
  call authenticated `GET /content-intelligence/contexts/:id`.
- AutoPost V2 image generation remains disabled in this vertical. The accepted
  output boundary is a text draft; enabling model-generated images needs its
  own provenance/cost/rollback contract.
