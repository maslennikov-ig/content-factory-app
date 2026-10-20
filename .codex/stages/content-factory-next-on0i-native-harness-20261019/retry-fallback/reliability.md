# Native automatic retries and configured model fallback

Owner clarification: temporary failures must recover automatically, switching
through models configured in the menu when necessary, so the existing task
reaches a useful result without another user submission. This is preparation
for the same seven-task epic and Gemini Argon handoff; no product change now.

## Current source confirmed at cb4e406edd

- `apps/frontend/src/components/admin/admin-ai-defaults.component.tsx:740` has
  one saved text fallback field, not an ordered list.
- `libraries/nestjs-libraries/src/dtos/settings/instance-ai-defaults.dto.ts:84`
  and `database/prisma/schema.prisma:719` persist one nullable string.
- `openai/ai.text-chain.ts:78` hardcodes a legacy fallback default; lines102–111
  restore it for null/empty values, so explicit disable is not representable.
- `textChainApplies` at lines158–159 restricts the transport chain to included
  OpenRouter calls. Supported own-key calls do not use this fallback chain.
- `openai/ai.clients.ts:302` feeds that transport to the native model provider;
  `chat/mastra.service.ts:90` selects the configured agent role. Model selection
  and availability failover are separate responsibilities.

This is source evidence, not a browser/provider acceptance result. The read-only
owner graph at dd67538d mapped createTextChainFetch to getAiSdkProvider,
getChatModel and other clients; both returned files differ from the graph and
were checked directly in the current worktree. No graph refresh/model extraction.

## Native integration decision

Mastra supports ordered Agent model arrays with per-model maxRetries, and
StreamErrorRetryProcessor for transient API/stream failures. The default
processor exists even when model/transport retries are zero; default repair
processors run first. maxProcessorRetries and model/SDK/gateway retries must be
one explicit coherent policy rather than multiplied defaults. Native retry
supports configured delay/backoff and bounded provider Retry-After. Verify these
contracts against the stable bundle selected by Task1; current documentation is
not proof that the upgraded consumers already work.

Task5 owns native fallback configuration and effective authorized model choices,
backward-compatible migration from the single stored field, ordered menu
controls and retries. Reuse the same AI settings screen/service/DTO/schema;
respect existing authority and provider/key scopes. Invalidate effective provider/
session caches after a settings change; recheck eligible choices before retry
or recovery and persist no credentials. Distinguish inherit from
an explicit empty chain. Compatible own-key calls get an eligible configured
chain; no unconfigured provider/key or hardcoded replacement model is inserted.
Apply the policy to in-scope main/classifier/judge/memory/subagent/domain model
calls, retaining role/capability/context/structured-output requirements.

Tasks3/6 own durable retry/wait/recovery state and clear UI/Stop behavior.
Native recovery.durableAgents defaults to off: enable auto, persist running
checkpoints and wire recoverAllDurableAgents into actual Nest startup instead
of assuming the generated deployer owns bootstrap. It recovers orphaned running
runs; exhaustion of model fallbacks is not automatically such an orphan. Prove
a supported durable wait/retry/resume transition for recoverable outages before
terminal failure, rather than replaying a failed task with completed writes. Use
native primitives, preserve completed work and operation identities, and cancel
all later attempts on Stop. A transient model fault retries the failed step,
not the entire research/write workflow. Keep uncertain write receipts and failed
possibly-billed attempts. Do not mark partial streamed text as a complete answer.
Task7 removes replaced transport fallback/retry orchestration after all callers
converge and proves the integrated result.

The desired outcome is automatic recovery whenever dependencies become usable.
No runtime can guarantee successful output while every authorized provider stays
unavailable or access/quota/consent is missing. In those states preserve the task,
show a meaningful waiting/paused reason, and use supported native recovery for
recoverable outages instead of a busy loop or fabricated success. No arbitrary
new financial task cap is introduced; existing actual quotas remain enforced.

## Acceptance added to the same epic

A29: migrate the existing configured value; add/remove/reorder/save/reload the
ordered chain and retry policy, preserving inheritance/explicit-empty and key
compatibility. A30: injected 429/5xx/timeout/reset/midstream faults recover through
native retries and two fallback models, including auxiliary roles, with exact
attempt counts/cost and no repeated tool writes. A31: all-model outage retains
progress across process restart, resumes natively when possible and respects
Stop/auth/quota/consent without a busy loop or duplicate driver. The previous
A1–A28 stay mandatory; seven tasks and the dependency graph remain unchanged.

## Primary documentation checked

- [Model fallbacks](https://mastra.ai/models#model-fallbacks)
- [Stream error retry](https://mastra.ai/reference/processors/stream-error-retry-processor)
- [Agent processors](https://mastra.ai/docs/agents/processors)
- [Durable crash recovery](https://mastra.ai/docs/harness/durable-agents#crash-recovery)

Context7 /mastra-ai/mastra corroborated the native APIs and retry-layer risks.
No dependency installation, application mutation, provider QA call or deploy
was performed by this preparation revision.
