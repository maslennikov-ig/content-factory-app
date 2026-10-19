---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-j9p5-implementation-20261018/stage-manifest.json
stream_owner: execution_budget
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: native conductor and shared services
public_facade: existing scoped domain services
bounded_acceptance: model intent, useful evidence and safe native execution
task_id: content-factory-next-j9p5.8
epic_id: content-factory-next-j9p5
stage_id: content-factory-next-j9p5-implementation-20261018
session_id: content-factory-next-j9p5
milestone: model-led-assistant
milestone_status: accepted
agent_type: worker
subagent_model: gpt-6.1-sol
reasoning_effort: max
model_reasoning_rationale: bounded backend semantics and accounting stream
repo: content-factory-next
branch: codex/j9p5-model-led-20261018
base_branch: codex/tgeq-manual-width-20261018
base_commit: 4305609a6
worktree: /home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018
parallel_group: execution_budget
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared root worktree; no independent child branch, process or worktree remains. Source and evidence retained. No foreign cleanup.
risk_level: high
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: Generic model-led product contract and execution budget runbook updated.

risk_tags:
  - concurrency
  - retry
  - atomicity
  - idempotency

affected_surfaces:
  - backend
  - api

invariants:
  - tenancy
  - idempotency
  - state-transition
  - rollback

verification:
  - Scoped execution17, accounting116, controller7 and guard15 checks: passed; commands and limits in Verification below

changed_files:
  - libraries/nestjs-libraries/src/chat/conductor/conductor.execution.ts
  - libraries/nestjs-libraries/src/chat/capabilities/capability.context.ts
  - libraries/nestjs-libraries/src/chat/capabilities/capability.admission.ts
  - libraries/nestjs-libraries/src/openai/ai.text-chain.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
explicit_defers:
  - content-factory-next-j9p5.6 root integrated acceptance and separately authorized delivery remain pending
---

# Summary

Original delegated native execution/admission/accounting accepted from scoped17/116/7/15 proof. Natural QA first two cases passed; root corrected SDK schema and independently completed third actual multi-step control with one saved artifact. No production writes or publication. Root full-epic acceptance remains pending.

# j9p5.8 execution-budget delivery

Status: delivered. Scoped implementation and focused checks are complete; root
owns the integrated epic acceptance. No commit, live
provider request, production mutation, schema change or deployment.

## Policy evidence and owner decision

- `AiUsageService.createAdmission` performs the actual included monthly
  count-and-insert under Prisma Serializable isolation with bounded contention
  retry. Subscription allowance wins over instance defaults and environment.
- `workspace_key` writes a usage row without a monthly count. Instance value
  `-1` explicitly means unlimited. No per-task financial/token ceiling or model
  pricing table exists in `InstanceAiDefaults`, `AiProviderSetting`,
  `AiUsageRecord` or the installed provider configuration. Text-chain
  `outputLimits` is explicitly not configured for all models.
- The initial absence of bounded financial policy was reported to root before
  changing spending. Root obtained the owner's answer: «Да и любой, какой
  необходим. Не переживай по этому поводу. Мы же всё равно берём оптимальную
  модель.» Necessary spend is delegated; do not invent a default task dollar
  or token allowance. Existing configured model routing is unchanged.
- Technical defaults: 540000ms (existing 600-second claim minus the existing
  60-second provider start window), 64 native emergency steps, 3 identical
  tool/argument/result occurrences. Optional token and known-USD thresholds
  are configuration-only. See `docs/operations/agent-execution-budget.md`.

## Changed execution surfaces

- `chat/conductor/conductor.execution.ts`: request-scoped measurements,
  shared abort signal and native Mastra stream options; no custom execution
  loop. All native steps retain tools. Same-request approval legs share state.
- `capability.context.ts` / `capability.admission.ts`: atomic in-flight paid
  permit replaces per-message 1/2 allowance; owner-bound settlement prevents a
  concurrent refused call from releasing another call. Permissions, exact
  approvals, content fingerprints and unspent-release paths remain.
- `conductor.context.ts`, `conductor.agent.ts`, `conductor.steps.ts`,
  `conductor/index.ts`: policy/context/barrel wiring, native sequential tool
  execution, notes without forced tool-none, honest incomplete closing.
- `openai/ai.text-chain.ts`: independent request observer spans nested domain
  ledgers; actual text/search reports still enter unchanged persistent
  accounting. Budget assertion runs before provider attempts/fallbacks/retries.
- `openai/ai.usage.service.ts`: assertion before fresh operation admission;
  existing monthly quota transaction and final accounting are unchanged.
- `openai/web.research.service.ts`: assertion at `meteredSearch` before
  outbound engine requests. Ordinary empty/partial results still reach the
  model normally.

## Controller integration API (root-owned)

```ts
const execution = createConductorExecution({ requestId, signal: abort.signal });
const context = buildConductorContext({
  identity, threadId, requestId, executionPolicy: execution.policy,
  approvals, openProposals, trackExecution: true, workContext,
});
await execution.run(() => turn.run(() => admission.run(async () => {
  // Both stream creation and all stream reads are in this scope.
  // handleChatStream params retain the existing memory, resume, identity:
  // ...execution.streamOptions(stepNotes), abortSignal: execution.signal
})));
```

Remove controller 1/2 paid-limit and approval-leg step division. `onClose`
keeps existing Stop/lifecycle behavior and calls `execution.stop()`.
`execution.snapshot().stopCode` means an incomplete terminal outcome; use
`execution.closing(language)` for a visible explanation. Do not convert a
technical fuse into completed success. The shared signal prevents each
approval leg restarting its own full timeout.

`snapshot()` reports knownCostUsd, tokens, unknownCostCalls, possiblyBilled,
providerCalls, elapsedMs and steps. It never exposes prompts or keys. A
fresh execution does not grant permission to replay uncertain saved work;
existing thread receipts/claims remain authoritative.

## Premortem and recovery

Verdict: GO with root integration checks. The policy is source/config only and
can be rolled back without rewriting ledger/history. Rollback never replays
uncertain writes or changes the configured organization allowance.

| Failure | Evidence / detection | Mitigation and owner |
| --- | --- | --- |
| Parallel calls spend the same remaining task capacity | Confirmed old sync reservation; concurrent admission regression | One sync permit, owner-bound settlement, native concurrency one; budget worker |
| Nested domain usage is charged only to conductor or disappears | Confirmed independent AiUsage ledgers | Observer survives ledger/config changes; nested accounting regression; budget worker |
| Unknown price becomes zero or uncertain transport blindly retries | Existing nullable cost/possiblyBilled and separate Tavily credits | Preserve unknowns; prevent automatic uncertain retry; explicit optional-USD threshold; budget worker |
| A native fuse reports task success | Confirmed old forced text step and completed terminal default | Native stop code, honest closing and non-completed receipt; root controller |
| A timeout outlives exclusive claim or late write is replayed | Existing 600s claims and non-cancellable promises | Shared 540s signal plus native totalMs; unchanged lifecycle waits/unknown guards; root integration |
| Executor invents a financial allowance or substitutes a runtime | Actual config has no bounded task price policy | Owner answer recorded before spending change; native Mastra options only |

## Verification and limits

- New focused `agent-task-execution.test.cjs`: 17 tests, including installed
  native Mastra: 8 paid operations + final answer,
  unchanged-loop stop, emergency fuse, owned concurrent permit, optional
  thresholds, unknown cost, nested ledgers, one-attempt uncertain failure,
  BYOK 400 headroom retry and cancelled-stream metering. Final result: 17/17 PASS.
- Existing hooks and W3 budget/step regressions passed in the affected run.
  Legacy semantic cap fixtures are updated; root owns final integrated suite.
- Seven selected native controller scenarios passed; inspect
  `budget-scenarios.json` and `budget-scenario-checks.json`. The single-message
  answer/adaptation/reserve case records three actual paid domain operations
  (two intake, one draft), not a single artificial capability allowance.
- Exact existing billing/transport/search-accounting checks: 3 suites,
  116 tests PASS after the final transport patch. Conductor agent/unit/W3
  checks passed; source guard 15/15 PASS after updating stale phrase assertions.
- Scoped `git diff --check` passed. No known remaining budget-worker failures.
- Full build/full suite, live model quality, paid replay, delivery and owner
  acceptance are intentionally separate root gates.
- Optional USD/token values are observed thresholds, not preauthorized hard
  upper bounds. An in-flight domain operation may cross one before reporting
  usage; no price is invented to make a stronger guarantee.

graph-reviewed: borrowed owner graph dd67538d, read-only orientation via focused
AiUsageService neighborhood; current exact quota/config/native declaration
files verified in this worktree. No graph refresh or external semantic calls.

# Verification

The scoped observations above are accepted for integration. Root release acceptance is pending and no provider or production success is inferred from fixture checks.

Root follow-up19Oct: trusted native task search uses real source-aware operation admission instead of the legacy monthly20/10/3 placeholder. Missing budget callback or actual admission method cannot bypass that counter; real allowance refusal occurs before outbound search. Scoped task/search/billing134checks passed. Native Stop and safely revised pre-write refusal retain their distinct terminal outcomes; source controller plus installed Mastra recovery probe passed. Final release acceptance remains root-owned.

# Risks / Follow-ups

Root owns the integrated acceptance and delivery boundary under content-factory-next-j9p5.6. Source rollback preserves native history, originals, consent and ledger records. Shared-root resources have been cleaned only where ownership was verified; no foreign runtime, graph, branch or data was changed.
