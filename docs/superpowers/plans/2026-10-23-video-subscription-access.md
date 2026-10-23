# Content Factory subscription video implementation plan

Revision 1, 23 October 2026. Addendum to `content-factory-next-zlq6` / HONEY-5940.

**Goal:** complete three usable access paths in Content Factory: personal subscription credits, existing API funding, and manual provider creation with file upload.

**Spec:** read [video access specification revision 1](../specs/2026-10-23-video-subscription-access.md) before implementation. Its ownership, spending, recovery, UI and evidence contracts are binding. [API plan revision 3](2026-10-22-video-generation.md) remains the API baseline; do not renumber/reopen its completed tasks merely because this adds a route.

**Approach:** add an outbound OAuth/MCP client with personal connections, then a credit-aware execution path alongside the accepted API implementation. Implement two bounded adapters and integrate the existing workspace/chat/upload surfaces through shared services. Preserve used V1 contracts; accept the complete flow locally with external providers replaced only at their boundaries.

**Non-goals:** account sharing, all-model discovery products, website automation, new billing wallet/tariff, montage/editor, provider asset creation/deletion, publication, delivery or paid validation in the engineering stage.

## Starting point and authority

- Source/Beads cwd: `/home/me/code/content-factory-next`; it contains unrelated dirty planning work. Do not stash, reset, switch or edit that checkout for this task.
- Implementation worktree: `/home/me/code/content-factory-next-worktrees/video-v1-api`, branch `codex/video-v1-api`. Inspected implementation/research HEAD `c61c41a5833533281ff7c5c8bc78db50e8726f3b`; the planning commit is a descendant. Reuse the existing owned worktree; do not create a new branch from stale main or replay the old transfer procedure.
- Current API engineering evidence: review fix `df7b17a56`, [review record](../../../.codex/stages/content-factory-next-zlq6-implementation-20261022/review.md), [local runbook](../../operations/video-v1-local-acceptance.md). Reuse evidence only for unchanged relevant inputs.
- This turn prepares documents/tasks. On invocation, the [implementation handoff](../../prompts/video-subscription-implementation-start.md) covers local engineering, disposable databases/fixtures, focused verification and scoped commits. Real registration/login/credential wiring, paid calls or existing-credit consumption, push, merge and deploy need separate authority.
- Beads/Linear is the status ledger. Tasks below are acceptance mappings, not a Markdown status tracker. Keep `.1`–`.7` and their existing dependencies; append `.8`–`.12`. `.7` retains the external gates and additionally depends on `.12` for final combined acceptance.

## Decisions that the executor need not ask again

1. Three explicit routes; subscription first in the chooser, but no implicit paid selection/fallback. API `included/workspace_key` continues to mean API payer only.
2. Personal subscriptions are not shared with colleagues. Explicit grants allow the owner to use their account in several workspaces with one aggregate allowance.
3. Credits use provider-specific units and exact decimals. Missing price/identity/eligibility blocks only that route; text preparation remains under existing text-model funding.
4. Higgsfield subscription support targets the current clip choices only when exact MCP capabilities exist. HeyGen targets exact-script presenter, explicit engine, trial-scale eligibility. No autonomous provider Video Agent.
5. Manual workflow is a complete supported path, using current upload/storage; no browser automation or credit inference.
6. New user-facing content and implementation artifacts use Content Factory branding. Existing legal notices are preserved.

## Scope ledger and dependencies

| Acceptance | Owning task(s) | External dependency |
| --- | --- | --- |
| Personal connections, protected tokens and account lifecycle (A1/A2) | `.8` | `.7`: actual registration/login/provider identity |
| Credit accounting, immutable actor approval, route receipts and durable execution (A3/A4/A7) | `.9` | `.7`: provider charge/idempotency evidence |
| Higgsfield clips through subscription MCP (A5) | `.10` | `.7`: live tools/settings/credit quote |
| HeyGen exact-script presenter through subscription MCP (A6) | `.11` | `.7`: trial eligibility/pricing/engine settings |
| Workspace/chat/manual journey, retained API compatibility and integrated local acceptance (A4/A8/A9/A10) | `.12` | `.7`: actual samples/quality |
| Real accounts, costs, quality and release eligibility (A11) | existing `.7` | Separate current authority; deployment separate |

Order: `.8` -> `.9` -> (`.10`, `.11`) -> `.12` -> `.7` external acceptance. `.8` also depends on accepted `.3`; `.12` retains `.6` as its existing UI baseline. `.10`/`.11` can be delegated independently after shared contracts settle if that materially helps; no mandatory fan-out. Shared schema/service edits remain owned by the integration owner.

## Task .8 — Personal OAuth connections and bounded MCP client

**Beads:** `content-factory-next-zlq6.8`.
**Boundary:** identity/secret/permission lifecycle. A separate task because credential ownership and refresh/revocation races require their own schema and security proof. Dependencies: `.3`.

**Existing files to inspect:**
- `libraries/nestjs-libraries/src/videos/video-credentials.service.ts`, `video.module.ts`.
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, `database.module.ts`.
- `apps/backend/src/api/routes/media.controller.ts`, `apps/backend/src/api/api.module.ts` and existing session/policy middleware.
- Installed `node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts` and `streamableHttp.d.ts`; package/lockfile pin is 1.31.0 at the baseline. Existing inbound MCP has a different direction.

**Additive targets:** `videos/subscriptions/video-connection.service.ts`, `video-mcp-client.ts`, `video-oauth-client.ts`, `video-provider-registry.ts`; `database/prisma/video-subscription/video-subscription.repository.ts`; `dtos/videos/video-subscription.dto.ts`; `apps/backend/src/api/routes/video-connections.controller.ts`; additive Prisma migration. Physical table grouping may follow repository convention while preserving all spec constraints.

**Interfaces:** start/callback/disconnect/current-safe-connection/limits; actor-owned workspace grants; encrypted issuer-bound token resolver; bounded allowlisted MCP list/call transport. Tokens never leave the credential boundary or enter workflow payloads. Mutation replay must be explicitly controlled by the caller, not hidden inside the SDK.

**Acceptance:** one-use actor-bound OAuth attempts; state/S256/issuer/resource/callback validation; safe registration storage; verified wallet deduplication; permissions/member removal/user deletion; serialized refresh and revocation fences; two-workspace isolation; logging redaction; arbitrary endpoint/tool/redirect/private-network refusal. A valid connection alone never starts generation. See A1/A2/A10.

**Verification:** add `tests/video-subscription-oauth.test.cjs` and `tests/video-subscription-connections.postgres.test.cjs`, with a real local fake authorization/MCP server in `tests/helpers/video-subscription-provider-fixture.cjs`. Exercise actual callback HTTP and concurrent Prisma writes, not just crypto helpers. Inspect affected privacy guards. No real registration/token calls.

**Rollback:** disable connection creation/use through provider policy; retain audit and fail closed. Revoke/disconnect is explicit and never deletes result media.

## Task .9 — Credit-aware admission and recoverable jobs

**Beads:** `content-factory-next-zlq6.9`.
**Boundary:** financial admission and durable execution; separate from `.8` because it owns before-send state, transactional reservations and workflow compatibility. Dependency: `.8`.

**Files:** add `videos/video-access.v2.ts`, `video-access.service.ts`, `subscriptions/video-subscription-job.service.ts`, `video-credit-policy.ts`, `video-subscription-execution.ts`; extend the `.8` repository/schema through another additive migration. Inspect/reuse `video-job.service.ts`, `video-media.v1.ts`, `video-execution.v1.ts` and `database/prisma/video-generation/video-generation.repository.ts` without changing V1 interpretation. Add `apps/orchestrator/src/workflows/video-subscription.workflow.v1.ts`, `activities/video-subscription.activity.v1.ts`, register in workflow exports/app module. Add shared facade routes in `apps/backend/src/api/routes/video-access.controller.ts` and DTOs.

**Interfaces:** spec access discriminant and unit-bearing quote; actor-bound preflight; atomic route-intent receipt/API delegation or subscription admission; durable subscription job/read/cancel/retry-save/download. Workflow arguments contain opaque IDs only. No subscription job uses `AiUsageMode` or USD zero as a stand-in.

**Acceptance:** exact immutable settings/actor/account/schema/quote; unset or unknown price policy blocks; aggregate wallet admission across workspaces; concurrent Decimal reservations; unresolved obligations survive period rollover; honest invoice/estimate/owner-reconciliation distinctions. One logical submission through restart/double-click/chat replay. Before-send crash and timeout remain uncertain without replay; response receipts and saved-file retries resume safely; disconnect/member removal pause token use. Old V1 jobs/workflows stay valid. See A1/A3/A4/A7/A10.

**Verification:** add `tests/video-subscription-domain.postgres.test.cjs`, `tests/video-subscription-execution.test.cjs`; extend fixture with quote counters, deliberately lost response, lease expiry and controllable clock. Exercise both real DB concurrency and a dedicated Temporal worker restart via proposed `scripts/development/video-subscription-temporal-acceptance.cjs`. Reuse current media validation; test its actual lease/CAS path for new jobs. Provider fixture cannot make outbound real requests.

**Rollback:** stop new launches, retain records/reservations and permitted existing-job recovery. No destructive migration or migration of old API histories.

## Task .10 — Higgsfield subscription clip adapter

**Beads:** `content-factory-next-zlq6.10`.
**Boundary:** Higgsfield tool/schema/credit behavior. Dependency: `.9`. Write ownership stays within this adapter/fixtures; shared contract changes go through the integration owner.

**Files:** add `videos/providers/higgsfield-subscription.provider.ts`, sanitized schema examples under `tests/fixtures/video-subscription/higgsfield/`, and `tests/video-higgsfield-subscription.contract.test.cjs`. Update only provider registration/capability wiring needed to expose the adapter. Existing `providers/higgsfield.provider.ts` remains the API route.

**Interfaces:** account capabilities -> exact normalized clip route; non-generating quote -> immutable reviewed tool/arguments; submit -> durable receipt; bounded status -> existing media importer. Do not expose the entire remote tool inventory to chat.

**Acceptance:** mapping for supported Wan/Kling choices is explicit; unavailable variants/options fail without generation; get-cost operation submits zero jobs; credit units remain Higgsfield credits; no Unlimited claim; stable owned image references; receipt/retry/error behavior follows `.9`. Snapshot fixture provenance/schema and mark invented portions synthetic. If public schema is incomplete, implement the bounded adapter and fail-closed compatibility check; record the exact schema/account gate in `.7` rather than inventing production support. See A5/A7/A10.

**Verification:** actual local MCP transport contract with counters, malformed result/isError, no quote, unavailable model, lost submit response, poll and expired-result recovery. No live tool call even if a real account is already configured elsewhere.

**Rollback:** disable this subscription provider only; API/manual route and completed results remain available.

## Task .11 — HeyGen subscription presenter adapter

**Beads:** `content-factory-next-zlq6.11`.
**Boundary:** HeyGen exact-script and account eligibility contract. Dependency: `.9`; independent of `.10` after the shared interface settles.

**Files:** add `videos/providers/heygen-subscription.provider.ts`, sanitized schema examples under `tests/fixtures/video-subscription/heygen/`, and `tests/video-heygen-subscription.contract.test.cjs`; minimal provider registration. Existing `providers/heygen.provider.ts` stays API-only.

**Interfaces:** eligible account avatar/voice/engine capabilities -> exact-script `create_video` request; verified quote/applicable bounded tariff -> credit admission; `get_video` -> receipt/status/result. Account endpoints are allowlisted reads, not a general account-history importer.

**Acceptance:** preserve approved script/numbers/negations/locale, explicit engine (no implicit Avatar IV), supported aspect/resolution/captions/voice only; trial-scale labeling; `api_key_required`, missing quote and unsupported tools produce actionable unavailable state. Never route through `create_video_agent`, invent a numeric trial quota, borrow API prices for subscription credits or apply generative-model duration limits to avatars. See A6/A7/A10.

**Verification:** fixture-based actual MCP transport, exact script/options assertions, truthful unknown cost/eligibility, real-response envelopes, failed/lost response, status/import. Record unmatched live schemas/limits as `.7` gates with links, not silent implementation omissions.

**Rollback:** disable HeyGen subscription only. A user may explicitly choose API/manual through a fresh review; no automatic switch.

## Task .12 — Complete workspace, chat and manual journeys

**Beads:** `content-factory-next-zlq6.12`.
**Boundary:** user-facing consumer adoption and integrated local acceptance. Dependencies: `.10`, `.11`, existing `.6`. This task includes the final root acceptance; there is no separate ceremonial test task.

**Files:** `apps/frontend/src/components/videos/video.workspace.tsx`, `video-provider-settings.tsx`, `video-ui.v1.ts`, `video.copy.ts`, `video.entry.tsx`; add focused access/connection controls alongside these components. Reuse `components/media/media.component.tsx`, `media/new.uploader.tsx`; extend backend facade with idempotent manual Media attachment. Integrate `libraries/nestjs-libraries/src/chat/capabilities/catalogue/video.capabilities.ts`, registry, `agent-parts.contract.ts`, existing conductor operation receipts; frontend `components/agents/agent.cards.tsx` plus current video context/card/navigation callers. Read and update `docs/design/component-inventory.md`; follow `component-authoring-rules.md`.

**Interfaces:** three-route chooser; personal connection/credit policy; exact saved approval; access-aware job/history; manual copy/export/open/upload/result; versioned chat capability where inputs change. Preserve existing API cards and saved approvals. SWR keys include tenant/actor/account where personal data is involved.

**Acceptance:** all states in spec section 7, all interface locales, keyboard/errors/loading, dirty edits and back/forward; person alone performs OAuth consent; subscription not available without price/permission; credits vs USD vs unknown external cost distinguishable. Manual upload produces owned playable/downloadable Media linked to the correct draft/piece, with no generator call. Both native UI and chat use the same authorization/admission/recovery services. See A4/A8/A9/A10 and root verification below.

**Verification:** `tests/video-subscription-ui.test.cjs`, `tests/video-subscription-chat.test.cjs`, `tests/video-manual-attachment.postgres.test.cjs`; extend local fixture plus `scripts/development/video-subscription-browser-acceptance.cjs`. Use actual Next/Nest/Prisma/storage with the local OAuth/MCP provider and a dedicated Temporal server. Read provider call counters and persisted receipts, not only visible success text. Keep original valid CC0 video fixture/provenance; no renderer.

**Rollback:** hide new chooser/connection surfaces and stop new subscription launches; retain API entry, existing results and permitted recovery. Manual Media uses existing storage policy.

## Existing .7 — Real-provider gates

Do not create a duplicate provider-quality task or close the epic from `.8`–`.12`. Extend the existing task with these acceptance requirements:

1. Separately authorize actual client registration and OAuth account connection. Read-only phase: owner identity/grant isolation, tools/schema, model/engine/voice eligibility, quote and credit unit, revoke/reconnect behavior. No generation during this phase.
2. Resolve unavailable schema/price/wallet identity and HeyGen trial eligibility. Confirm reference images are provider-reachable HTTPS assets. Keep each unknown explicit; a successful login is not approval of regular SaaS use.
3. Present exact account/settings/attempt cap and provider-credit ceiling for separate approval before a small sample. Existing paid credits still count as spend. Do not silently append samples to the existing [API pilot](2026-10-23-video-v1-provider-pilot.md).
4. Observe submitted IDs, actual result, language/facts/negations, cost certainty and storage/download. Competent listeners assess claimed speech quality. Record every failed/uncertain attempt. One sample proves access, not prompt benefit or comparative quality.
5. Select the evidenced route for the broader original quality matrix. If subscription is unsuitable for a case, explicitly decide API/manual scope with the owner; never erase an unverified claim through a task status change. Deployment remains separate.

## Root final local acceptance

Use Node 22.23.2 and pnpm 10.6.1. Reuse the [local disposable database/Temporal guards](../../operations/video-v1-local-acceptance.md); create only task-owned loopback instances and retain their exact IDs for cleanup. Apply the additive schema only there. No reading existing `.env` secrets to make tests run. All external video/text/OAuth endpoints are test fixtures; fail if they attempt public provider egress.

Planned focused commands (new files above must be delivered by their owning task):

```sh
pnpm exec jest --runInBand --coverage=false tests/video-subscription-oauth.test.cjs tests/video-subscription-connections.postgres.test.cjs tests/video-subscription-domain.postgres.test.cjs tests/video-subscription-execution.test.cjs tests/video-subscription-ui.test.cjs tests/video-subscription-chat.test.cjs tests/video-manual-attachment.postgres.test.cjs
pnpm exec node --test tests/video-higgsfield-subscription.contract.test.cjs tests/video-heygen-subscription.contract.test.cjs tests/video-provider-v1.contract.test.cjs
pnpm exec tsc --noEmit --project apps/backend/tsconfig.json
pnpm exec tsc --noEmit --project apps/orchestrator/tsconfig.json
pnpm exec tsc --noEmit --project apps/frontend/tsconfig.json
pnpm exec node scripts/development/video-subscription-browser-acceptance.cjs
pnpm exec node scripts/development/video-subscription-temporal-acceptance.cjs
python3 scripts/docs/check_docs.py
git diff --check
```

Register new Node contract tests in the repository's existing Node test command and exclude them from Jest consistently with the existing provider-contract file. Rerun affected existing API domain/credentials/chat/UI tests and selected design/privacy guards when their code paths change; reuse matching earlier evidence otherwise. Do not run a full build/suite for each task or documentation commit. Release checks are a separate future gate.

One root-owned evidence record under `.codex/stages/content-factory-next-zlq6-subscriptions-20261023/` must bind source SHA/relevant changes, commands/exit codes, browser results, local DB/Temporal behavior, provider call counters, accepted versus unknown claims, and cleanup IDs. Include two actors/two workspaces, concurrent shared-wallet admission, refresh/disconnect race, unknown submit, actual restart, both providers, retained API behavior and manual upload. Root may reuse intermediate evidence with unchanged inputs; do not duplicate a whole cycle after a docs-only correction.

Close `.8`–`.12` only for their complete local engineering criteria. Record external gaps in `.7` with specific evidence needed; keep epic/.7 open until their actual acceptance is met. If an adapter cannot be completed against any verified or explicitly synthetic schema, say exactly what engineering remains; a disabled button alone is not a delivered adapter.

## Handoff and navigation evidence

Read current `AGENTS.md`, `.codex/handoff.md`, `.codex/project-index.md`, this plan and the spec. Use `bd` from the original checkout; do not initialize tracking in the worktree. Start with `.8`, inspect existing task state, and continue through all independent tasks before reporting a real external boundary. Keep the selected model/effort; delegation is optional and bounded.

graph-reviewed: used the main checkout's read-only `dd67538d` graph for `VideoManager`; matching existing media/manager files orient navigation, but V1 subscription additions are not indexed and database/module files changed. Current exact files were inspected. No graph rebuild or external semantic calls were needed for planning.

Primary protocol/provider evidence is linked in the spec; Context7 was queried and the official MCP authorization specification and provider pages were read. SDK 1.31.0 local client/auth declarations were inspected. Refresh only uncertain/version-dependent facts, not the entire research exercise. Public discovery is not account authorization.
