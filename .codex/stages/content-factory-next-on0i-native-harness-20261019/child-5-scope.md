## Goal
Нативный выбор моделей и полный учёт вызовов. Complete product behavior, not API availability only.

## Scope and Integration
**Boundary:** provider/model/credential compatibility and task-wide metering.
**Files:** `openai/ai.roles.ts`, `ai.clients.ts`, `ai.text-chain.ts`,
`ai.usage.service.ts`, `chat/mastra.service.ts`, native controller/gateway and
processor configuration, existing AI settings schema/UI only if exposing
required role/choice settings needs it.
**Dependencies:** Task1; existing operation identities from Task3 must converge
before final acceptance. Do not make Tasks1/2 wait for live decision-provider QA.

Use installed `ModelSelectionProcessor` with a compatible classifier/decision
model object (a normal chat ID is not automatically compatible). Choices,
criteria, confidence and role defaults are config. The capable configured model
is the safe abstention default; classify once with scope chosen from documented
semantics, not a custom per-step rule engine. Integrate explicit manual choices,
auxiliary roles and conservative fallbacks without changing organization keys.
Verify default error processors and transport/SDK retries as one policy. Record
routing choice/abstention and all classifier/judge/subagent/memory/main/search
calls in task lineage, including cached/failed/possibly-billed outcomes. Native
traces are correlated with domain ledgers, not a replacement for billing truth.
**Acceptance:** scripted routing/abstention/provider failure pass; actual configured
provider compatibility and end-to-end quality/cost are measured before claiming
routing works or saves money. An unavailable classifier keeps the configured
fallback running and produces a visible diagnostic; it does not silently choose
an unconfigured provider. No price, model ID or complexity phrase is hardcoded.
**Focused checks:** role/model/usage/provider compatibility tests and native
routing fixtures; actual local-provider comparison after credentials are present.

## Acceptance Criteria
scripted routing/abstention/provider failure pass; actual configured
provider compatibility and end-to-end quality/cost are measured before claiming
routing works or saves money. An unavailable classifier keeps the configured
fallback running and produces a visible diagnostic; it does not silently choose
an unconfigured provider. No price, model ID or complexity phrase is hardcoded.

Full contract and criteria: docs/superpowers/plans/2026-10-19-native-mastra-harness.md, Tasks5 and A1-A22.

## Boundaries
Local implementation/testing in the new chat only. No push, image, deployment, production mutation or real social action. Preserve parent identity/history, old pending calls and domain safety.
