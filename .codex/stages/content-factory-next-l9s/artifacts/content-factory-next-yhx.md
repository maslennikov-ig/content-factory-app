---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave1-yhx
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: AutopostService and ExtractContentService callers
public_facade: existing service methods
bounded_acceptance: unsafe loopback HTTPS URL is refused before fetch; public HTTPS URL reaches fetch with the SSRF-safe dispatcher
non_goals:
  - No change to controllers, DTOs, persistence, auth, or Temporal contracts
evidence:
  - none
task_id: content-factory-next-yhx
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: SSRF guard at two server-side URL fetch boundaries
milestone_status: accepted
agent_type: backend_developer
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: SSRF is a server-side security boundary.
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-1
base_branch: main
base_commit: 833795208137011f47ff7bf7f12d9058a176251c
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/autopost/**
  - libraries/nestjs-libraries/src/openai/extract.content.service.ts
  - tests/*ssrf*.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-yhx.md
success_criteria:
  - AutopostService.loadUrl rejects an unsafe HTTPS loopback target before fetch.
  - ExtractContentService.extractContent rejects an unsafe HTTPS loopback target before fetch.
  - Public HTTPS URLs retain the fetch path with ssrfSafeDispatcher.
selected_docs:
  - graphify-out/GRAPH_REPORT.md
  - libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts
  - apps/backend/src/api/routes/public.controller.ts
  - libraries/nestjs-libraries/src/upload/local.storage.ts
selected_skills:
  - superpowers:test-driven-development
  - superpowers:test-driven-development/writing-good-tests.md
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
cleanup_notes: Shared worktree; no branch or runtime cleanup performed.
risk_level: high
verification_tier: inner
risk_tags:
  - security
  - public-api
affected_surfaces:
  - backend
invariants:
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: Existing endpoint and validator documentation remains accurate; this is a localized service-boundary guard.
verification:
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/server-url-ssrf.test.cjs --runInBand: failed as expected before implementation (2 unsafe-path tests failed because fetch returned private metadata)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/server-url-ssrf.test.cjs --runInBand: failed as expected after dispatcher assertion was added (both public fetches had options undefined)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/server-url-ssrf.test.cjs --runInBand: passed (3 tests)
  - git diff --check: passed
  - root rerun pnpm exec jest tests/server-url-ssrf.test.cjs --runInBand: passed, 3 tests
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/autopost.research-enrichment.test.cjs --runInBand: failed as expected before test-loader correction (suite did not start; unresolved webhook.url.validator alias)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/autopost.generation.test.cjs --runInBand: failed as expected before test-loader correction (suite did not start; unresolved webhook.url.validator alias)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/autopost.research-enrichment.test.cjs --runInBand: passed (1 suite, 5 tests)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/autopost.generation.test.cjs --runInBand: passed (1 suite, 5 tests)
  - independent review: rejected P2 because default fetch redirect following did not apply the HTTPS URL policy to each Location hop
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/server-url-ssrf.test.cjs --runInBand: failed as expected before redirect correction (1 suite; 2 passed, 6 failed)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/autopost.research-enrichment.test.cjs --runInBand: passed after helper alias mapping (1 suite, 5 tests)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/autopost.generation.test.cjs --runInBand: passed after helper alias mapping (1 suite, 5 tests)
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/server-url-ssrf.test.cjs --runInBand: passed after redirect correction (1 suite, 8 tests)
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts
  - libraries/nestjs-libraries/src/openai/extract.content.service.ts
  - libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.fetch.ts
  - tests/server-url-ssrf.test.cjs
  - tests/autopost.research-enrichment.test.cjs
  - tests/autopost.generation.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-yhx.md
explicit_defers:
  - none
---

# Summary

Both user-controlled server-side URL fetches now call `isSafePublicHttpsUrl` before `fetch` and pass `ssrfSafeDispatcher` to that fetch.
`AutopostService.loadUrl` keeps its established empty-string failure contract; `ExtractContentService.extractContent` throws `Unsafe URL`, like local storage.

Wave-acceptance correction: the two existing CJS TypeScript loaders that execute `AutopostService` now provide its new validator and dispatcher aliases. The production build was already green; the loader-only failure was caused by their incomplete dependency map.

Independent review P2 resolution: redirects now use the shared `fetchSafePublicHttpsUrl` helper. It requests each hop with `redirect: 'manual'`, resolves relative `Location` values, applies the HTTPS/public-address policy and dispatcher on every hop, and rejects malformed, missing, and over-limit redirects.

# Scope / Routing

Only the assigned service paths, a focused SSRF behavior test, and this stream artifact changed. Graphify and the existing guarded public-controller/local-storage paths were used as local references; no external documentation or assets were needed.
The later loader correction changed only `tests/autopost.research-enrichment.test.cjs`, `tests/autopost.generation.test.cjs`, and this artifact.
The P2 correction adds `libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.fetch.ts` as the shared server-side URL-fetch boundary and updates the two existing services to use it.

# Verification

TDD RED: the new test first ran against the old code. Loopback URL fetches reached the fake transport and returned `private metadata`, so the two refusal assertions failed as intended. The test fake replaces `global.fetch`; no external request is made. The validator receives a literal loopback IP and therefore also makes no DNS request.

TDD GREEN (URL guard): after adding the URL guards, the focused Jest target passed all three tests. It verifies both unsafe paths make zero calls to the fake transport and both services still fetch a literal public HTTPS target.

TDD RED (dispatcher): the strengthened public-target assertion then failed against the guarded-but-undispatched implementation. Both fake fetch calls received `options: undefined` instead of the local dispatcher. TDD GREEN: after adding `ssrfSafeDispatcher`, the same focused target passed all three tests.

Mutations caught: deleting either `isSafePublicHttpsUrl` check makes that service's loopback test fail because the fake transport is called and returns private content. Deleting either `dispatcher: ssrfSafeDispatcher` option makes the public-target security-boundary assertion fail.

Wave-acceptance RED/GREEN: both legacy loader suites initially stopped before their first test with `Cannot find module '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator'`. Adding the same local validator and dispatcher dependency mappings used by the SSRF test restored execution; each focused suite then passed 5/5.

Independent-review P2 RED/GREEN: the redirect expansion first failed 6/8 tests against default redirect handling: HTTP and loopback targets were parsed as content, approved redirects were not followed manually, and the redirect limit and malformed Location failures were absent. `fetchSafePublicHttpsUrl` then made every request manual, validated each current URL before fetch, used `ssrfSafeDispatcher` for every hop, and bounded redirects at five. The focused target passed 8/8. The two legacy Autopost loaders received a non-network helper stub because their covered paths do not load URLs; both remained 5/5.

Additional mutations caught: removing `redirect: 'manual'`, skipping the validation of a redirect target, dropping the dispatcher from a hop, accepting a missing or malformed Location, or removing the five-redirect limit makes the redirect test matrix fail.

# Delivery / Cleanup

Returned to the orchestrator for root-owned wave acceptance. No Git operation, deployment, network call, secret, persistence write, or cleanup action was performed.

# Risks / Follow-ups / Explicit Defers

No residual risk is known within this assigned SSRF boundary. The focused test deliberately uses a fake transport, so it neither makes nor requires an external request; root-owned wave acceptance remains responsible for any broader integration checks.
