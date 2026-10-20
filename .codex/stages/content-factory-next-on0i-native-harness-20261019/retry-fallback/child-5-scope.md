## Goal
Implement this complete cohesive task of the existing native Mastra epic. Gemini Argon is executor; local implementation only, no deploy.

### Task5 — Native model routing, retries, fallbacks and accounting (`on0i.5`)

**Boundary:** provider/model/credential compatibility, retry/fallback settings,
availability recovery and task-wide metering.
**Files:** `openai/ai.roles.ts`, `ai.clients.ts`, `ai.text-chain.ts`,
`ai.usage.service.ts`, `chat/mastra.service.ts`, native controller/gateway and
processor configuration; `apps/frontend/src/components/admin/admin-ai-defaults.component.tsx`,
`openai/instance-ai-defaults.service.ts`, `openai/ai.provider.config.ts`,
`dtos/settings/instance-ai-defaults.dto.ts` and
`database/prisma/schema.prisma` for the existing settings roundtrip and
backward-compatible fallback-chain/retry-policy persistence. Follow component
inventory/authoring rules for settings UI; no second model-settings screen.
**Dependencies:** Task1; existing operation identities from Task3 must converge
before final acceptance. Do not make Tasks1/2 wait for live decision-provider QA.

Use installed `ModelSelectionProcessor` with a compatible classifier/decision
model object (a normal chat ID is not automatically compatible). Choices,
criteria, confidence and role defaults are config. The capable configured model
is the safe abstention default; classify once with scope chosen from documented
semantics, not a custom per-step rule engine. Integrate explicit manual choices,
auxiliary roles and an ordered, user-configured compatible fallback chain
without changing organization keys. Implement the automatic recovery contract
in section6, including settings migration and explicit empty/inherited policy.
Use native model arrays/StreamErrorRetryProcessor rather than preserving the
old fetch chain as a second retry/fallback owner. Fault recovery must also work
for supported own-key calls, not only included OpenRouter calls.
Move provider-specific reasoning-effort/flex/fallback handling out of generic
semantic routing into provider/config adapters, preserving explicit owner policy
until a tested change is justified. Verify default error processors and
transport/SDK retries as one policy. Record
routing choice/abstention and all classifier/judge/subagent/memory/main/search
calls in task lineage, including cached/failed/possibly-billed outcomes. Native
traces are correlated with domain ledgers, not a replacement for billing truth.
**Acceptance:** scripted routing/abstention/provider failure pass; actual configured
provider compatibility and end-to-end quality/cost are measured before claiming
routing works or saves money. An unavailable classifier keeps the configured
fallback running and produces a visible diagnostic; it does not silently choose
an unconfigured provider. No price, model ID or complexity phrase is hardcoded. Settings survive reload;
transient faults and failed streams recover with counted attempts, the same
saved work and no duplicate writes. All-model outages retain resumable state;
Stop cancels backoff and future recovery. A29–A31 prove these paths.
**Focused checks:** role/model/usage/provider compatibility tests and native
routing/retry/fallback fixtures and settings persistence/browser roundtrip;
actual local-provider comparison after credentials are present. Use scripted
errors for outages instead of intentionally failing real paid providers.

A1-A31 and the full consumer/recovery/compatibility contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Automatic retry/fallback and menu scope: .codex/stages/content-factory-next-on0i-native-harness-20261019/retry-fallback/reliability.md. Keep the same epic/task identities and dependency graph.
