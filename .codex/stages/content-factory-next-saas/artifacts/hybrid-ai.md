---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-saas/stage-manifest.json
stream_owner: migration_recovery
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root final acceptance
public_facade: settings AI mode and organization-scoped AI operation seam
bounded_acceptance: hybrid AI implementation and focused proof; no migration apply or external action
non_goals:
  - numeric plan quota or pricing decision
  - production, deployed database, migration SQL, credentials or provider calls
  - landing-page files, merge, push, PR or deploy
evidence:
  - none
task_id: content-factory-next-saas.hybrid-ai
epic_id: content-factory-next-saas
stage_id: content-factory-next-saas
session_id: content-factory-next-saas
milestone: hybrid-ai-implementation
milestone_status: accepted
agent_type: db_migration_specialist
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: tenant credentials, quota concurrency and privacy-safe persistence cross a high-risk data boundary
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - hybrid AI schema, resolver, services, clients and seven consumers
  - organization registration initialization
  - settings DTO and UI
  - focused hybrid AI, registration and affected consumer tests
  - data-model, configuration and outbound-connection docs
  - .codex/stages/content-factory-next-saas/artifacts/hybrid-ai.md
success_criteria:
  - legacy setting rows default to workspace_key while new registrations initialize included
  - the two credential sources never fall back to one another
  - included quota fails closed and admission is serializable with bounded retry
  - the ledger stores no prompt, output, raw error, payload, token or cost data
  - all seven consumers use the seam and raw clients require active tenant context
  - image and video Credits ordering remains unchanged
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-saas/spec.md
  - .codex/stages/content-factory-next-saas/plan.md
  - .codex/stages/content-factory-next-saas/stage-manifest.json
  - PRODUCT.md
  - docs/adr/0009-external-services-allowed-when-justified.md
  - docs/architecture/auth-and-tenancy.md
  - docs/architecture/data-model.md
  - docs/operations/configuration.md
  - docs/operations/outbound-connections.md
selected_skills:
  - technical-premortem
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: sequential-after-auth-metrics
depends_on_streams:
  - auth-metrics accepted completion 8404d0fa and stable additive schema
parallel_decision: implementation began after auth-metrics stopped; landing ownership remained untouched
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Prisma client generation changed node_modules only; no process, container, database, provider or external resource was created
risk_level: high
risk_tags:
  - migration
  - security
  - tenancy
  - concurrency
  - atomicity
  - retry
  - rollback
  - data
  - api
affected_surfaces:
  - database
  - data
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: structural
docs_reviewed: updated
docs_review_notes: data model, managed/workspace configuration and outbound disclosure describe the implemented boundary
verification:
  - focused resolver, new-registration, quota, privacy, nesting, streaming and consumer RED then GREEN
  - affected AI, Copilot, agent, chat, autopost and research tests GREEN
  - Prisma validate and client generation GREEN with explicit local dummy DATABASE_URL
  - real migrate-diff and apply-guard tests GREEN
  - backend and frontend TypeScript noEmit checks GREEN
  - docs check and git diff check GREEN
  - root review correction RED then GREEN: original month-day quota anchors survive short months, and final-status ledger failures preserve provider success or the original provider error; the focused public-registration and AI-usage pair passed 14 tests
  - root release correction: managed-AI status copy uses isolated RU/EN text with English fallback without changing landing-owned locale bundles; the legacy SSRF harness adopts the AI operation seam; seven affected suites passed 97 tests
changed_files:
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.config.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.service.ts
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/openai.service.ts
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts
  - apps/backend/src/api/routes/copilot.controller.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.service.ts
  - libraries/nestjs-libraries/src/agent/agent.graph.insert.service.ts
  - libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts
  - libraries/nestjs-libraries/src/chat/load.tools.service.ts
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - docs/architecture/data-model.md
  - docs/operations/configuration.md
  - docs/operations/outbound-connections.md
  - focused tests listed in the body
explicit_defers:
  - numeric included quotas and plan allocation remain a pricing/product decision; schema default is zero
  - provider token and cost accounting is not claimed because current provider paths do not consistently return those fields
  - no migration SQL was created and no database schema was applied under the explicit task boundary
completion_event: 2be4066b-63fc-44e1-b35f-bd068a6e4e7c
---

# Summary

Hybrid AI now has one explicit tenant-scoped mode:

- legacy `AiProviderSetting` rows remain `workspace_key` through the schema and
  resolver default;
- every newly registered organization atomically creates its setting as
  `included`; zero quota keeps it restricted until pricing is decided;
- `workspace_key` decrypts only that organization's stored generation/search
  keys;
- `included` reads only `AI_INCLUDED_API_KEY` and
  `AI_INCLUDED_SEARCH_API_KEY` plus operator provider/model defaults;
- a missing selected source fails closed. Neither direction has fallback;
- source resolution happens for every outer operation, so a mode switch cannot
  retain the previous source in a process-local TTL;
- client memo identity includes organization, mode and selected configuration.

`executeAiOperation` and `executeAiStreamOperation` are the shared admission
boundary. Nested same-tenant consumers reuse the outer admission, avoiding
double charging. A nested organization switch raises
`AiTenantContextMismatch`. Raw client factories require the active context.

# Schema And Data Impact

The reconciled Prisma schema adds:

- `AiUsageMode { included workspace_key }`;
- `AiProviderSetting.usageMode @default(workspace_key)`;
- `Subscription.includedAiMonthlyOperations @default(0)`;
- `AiUsageRecord` with organization, mode, operation, provider/model, generic
  status and timestamps;
- tenant/time and tenant/status/time indexes and organization cascade delete.

The ledger has no JSON and no prompt, output, URL, provider payload, raw error,
IP, User-Agent, email, token or cost field. Failed admitted operations remain
counted because provider cost may already have occurred. A process crash may
leave `admitted`; it conservatively continues to count pending a separate
reconciliation/retention policy.

Included admission reads the subscription allowance and billing-period start,
counts included records and inserts admission in one Prisma Serializable
transaction. `P2034` conflicts retry at most three times. No subscription,
zero quota or exhaustion rejects before the callback.

Existing image/video `Credits` were not rewritten. `useCredit` still precedes
`OpenaiService.generateImage`; a denied image credit cannot consume an
included operation.

# Consumer And Settings Adoption

Seven direct consumers use the seam: Copilot chat/agent, `OpenaiService`,
`WebResearchService`, generator agent graph, classification insert graph,
autopost workflow and Mastra tool/model loader.

The DTO accepts only the two modes. Included updates ignore supplied workspace
keys and workspace model ids. Existing encrypted keys remain for an explicit
switch back and are deleted only by existing DELETE actions. Responses expose
mode, booleans, used/remaining allowance and a stable restriction reason,
never secrets. Missing selected credentials return non-secret 503 code
`AI_SELECTED_CREDENTIAL_UNAVAILABLE`; zero/exhausted allowance returns 429 code
`AI_INCLUDED_QUOTA_EXHAUSTED`, not the existing 402 billing flow.

The UI shows both modes, managed-unavailable and zero-quota states, and
disables workspace credential/model inputs in included mode. Its included
payload omits workspace secrets and model ids even if local input state still
contains them. It invents no numeric entitlement.

# Verification

Initial RED:

```text
3 new AI suites: 10 failed, 2 passed
Missing: usage mode/source-exclusive resolver, usage service, consumer seam.
```

Additional RED:

- settings/mode UI: 5 failures before API/UI adoption;
- included update persisted supplied workspace credentials/models: 1 failure;
- nested consumers created two admissions: 1 failure;
- new registrations had no `AiProviderSetting`: 3 failures, while the legacy
  workspace-default resolver proof already passed;
- affected consumer harnesses initially could not resolve the new seam.

Focused GREEN:

```text
16 hybrid/registration/consumer suites: 127 tests passed
2 Prisma real migrate-diff/apply-guard suites: 57 tests passed
Prisma schema validate: valid
Backend TypeScript --noEmit: exit 0
Frontend TypeScript --noEmit: exit 0
docs:check: Documentation links OK (78 files checked)
git diff --check: exit 0
```

No provider request, production command, raw SQL, `prisma db push`, migration
apply, external credential access or paid action ran.

# Rollout And Rollback

1. Root generates and reviews one additive migration from the reconciled
   auth-metrics + hybrid schema through the production guard. This stream did
   not create migration SQL.
2. Apply schema before code. Existing settings become `workspace_key` and
   existing subscriptions receive zero included operations.
3. Deploy code; new organizations initialize `included` but remain restricted
   while allowance is zero or managed credentials are absent.
4. A separately authorized pricing/configuration step may later assign a
   non-zero allowance and managed credentials.

Rollback is application-first and non-destructive. Revert code but leave the
additive enum, fields and ledger. Old code ignores them and stored workspace
keys remain. Do not drop the ledger/enum during an incident; removal requires a
later migration after proving no readers or retained data.

# Delivery / Cleanup

Returned to root through the shared worktree for manual acceptance. No child
branch or external runtime resource exists. Prisma generation touched only
ignored `node_modules`; no cleanup action was needed.

Root accepted completion event
`2be4066b-63fc-44e1-b35f-bd068a6e4e7c` after reviewing the tenant-scoped
resolver, serializable admission boundary, privacy-safe ledger, seven consumer
adoptions, focused evidence and explicit zero-quota/pricing defer. The stream
is integrated into the stage and remains subject to the single root-owned
release acceptance.

Root review also corrected two post-delivery integration defects. Billing
periods are now derived directly from the subscription's original UTC anchor,
so January 31 does not drift to March 28 after February. Final ledger status is
best-effort after a provider outcome: the already-counted `admitted` record is
kept when that update fails, while provider success or the original provider
error remains visible to the caller and bookkeeping does not induce a retry.

The first root release run then exposed missing global locale keys and a legacy
SSRF harness that loaded the updated autopost consumer without its new seam.
Because the landing agent owns the shared locale bundles, managed-AI mode copy
now follows the same isolated RU/EN-with-English-fallback pattern as the public
surface; the SSRF harness supplies the operation callback without weakening its
network assertions.

# Risks / Follow-ups / Explicit Defers

Retained premortem risks:

| Risk | Detection/control | Recovery or defer |
| --- | --- | --- |
| Cross-source credential fallback | Resolver source matrix | Exact mode branch; missing selected key fails closed |
| Stale mode after switch | Consecutive resolver reads | No process-local config TTL |
| Managed tenants share client state | Client identity test | Organization and mode in memo identity |
| Consumer bypass | Seven-file guard plus active-context clients | New consumers must use operation seam |
| Concurrent last-slot overspend | Serializable/retry test | Count-and-insert transaction; bounded P2034 retry |
| Nested double charge | Nested RED/GREEN | Same-tenant reuse; cross-tenant refusal |
| Content leaks into ledger | Schema/runtime allowlist | Fixed scalars and generic status only |
| Process crash leaves `admitted` | It continues to count | Conservative; reconciliation is deferred |
| Temporal/application retry counts twice | Each outer admission is a unit | Add idempotency only with a stable caller key |
| Copilot completion is weaker than provider completion | Outer handler is strongest shared boundary | Do not treat status as billing proof |
| Ledger growth affects count latency | Tenant/mode/time index | Retention/aggregation needs later sizing |
| Numeric quota is undecided | Default and UI tests | Keep zero until product/pricing decision |
| Provider token/cost fields vary | No fields or claims | Keep operation-count unit |

# Exact Test Write Set

New: `tests/ai-provider.usage-mode.test.cjs`,
`tests/ai-usage.execution.test.cjs`,
`tests/ai-usage.consumer-guard.test.cjs`.

Updated focused/affected tests: `tests/registration.workspace-contract.test.cjs`,
`tests/ai.search.config.test.cjs`, `tests/ai.clients.test.cjs`,
`tests/ai.provider.component.test.cjs`, `tests/copilot.controller.test.cjs`, and
the agent-language, chat-language, autopost-generation/research and
web-research service/degradation harnesses.

No landing-owned file was changed. Auth-metrics schema and registration edits
were preserved. Root owns final acceptance and artifact acceptance.
