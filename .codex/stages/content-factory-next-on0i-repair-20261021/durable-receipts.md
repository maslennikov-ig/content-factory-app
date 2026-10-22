# R4 durable operation receipts — worker delivery

Worker: `durable_receipts`. Date: 2026-10-21. Base: `e74e059ea104593d2fac831eb989714a5b151263`, branch `codex/on0i-native-repair-20261021`, worktree `/home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018`.

Status: implementation and focused worker verification complete; root integration and epic acceptance remain separate. No commit, push, deployment, production access, paid model call, credential change, or real-user message.

## Result and actual write boundary

The original review reproducer executed two writes and returned two successful results after receipt failures and module reload. The adapter now durably reserves the operation before entering the actual `capability.run` boundary, including write, paid, confirmed, secret, and human-input capabilities of native chat. Receipt reads and writes cannot silently become absence or success. Process-local receipt caches were removed.

`agent-operation-receipts.ts` uses installed Mastra 1.78 public storage APIs:

- `workflows.claimRunOwnership({ expectedGeneration: 0 })` provides one atomic first claim per opaque organization/thread/run/tool-call/phase identity. Releasing or expiring its lease does not restore an initial generation.
- Native `threadState` stores independent pending, yielded, or committed phase state. Completion stores the original summarized result and card. A retained pending state blocks replay after ownership retention.
- A native memory metadata witness is acknowledged before the side effect. Its opaque operation identity and native parent fence survive a later failure to save either the completion receipt or the run uncertainty marker. Fenced native metadata merges preserve distinct witnesses. A restarted driver cannot execute another consequential tool ID around an older unresolved witness.
- A native per-run `threadState` uncertainty guard and primitive request-context marker deny new consequential calls after an uncertain outcome. Reads remain available. Committed results may replay without executing the domain call. The marker preserves the original unresolved operation identity when a different tool ID discovers it.
- Domain results that return after cancellation are still persisted. An acknowledged AbortError remains an interrupted turn. A thrown operation error after a possible write stays uncertain.
- A native human-input yield is recorded as a suspended phase. The server-held suspension payload and answer hash distinguish consent and interview resumes of the same native tool call. Each phase can complete once; no raw answer enters an operation identity or witness.

The generic adapter cannot atomically commit an external provider transaction together with local storage. Its safe outcome for the write/receipt gap is `CAPABILITY_OUTCOME_UNCERTAIN`, never automatic reexecution or successful acknowledgement. `CAPABILITY_RECEIPT_UNAVAILABLE` means this invocation did not start the operation.

## Session approval integration

At root request, every chat capability now declares a public `createTool.requireApproval(input)` verdict. It overrides a Session-wide approval requirement for ordinary calls, retains approval for `confirm` / `asksInWebChat`, and avoids approval for invalid input. The manual `needsApprovalFn` assignment was removed. MCP behavior is unchanged. Existing assertions now evaluate valid and invalid inputs instead of assuming a boolean property.

The existing paid-conductor fixture was authorized for adjustment: it now supplies real native `Memory`, `InMemoryStore`, and `Mastra` rather than executing durable paid tools without storage. Its optional-memory helper signature preserves other callers. No loader prefix or export was changed.

## Changed files

- `libraries/nestjs-libraries/src/chat/conductor/agent-operation-receipts.ts` — native receipt/intent/guard module.
- `libraries/nestjs-libraries/src/chat/conductor/agent-turn-lifecycle.ts` — remove cache and swallowed persistence errors; retain compatibility reexports.
- `libraries/nestjs-libraries/src/chat/capabilities/mastra.adapter.ts` — real invocation guard, strict completion, cancellation/yield handling, public approval predicate.
- `tests/agent-operation-receipts.test.cjs`, `tests/helpers/agent-operation-receipts.probe.cjs`, `tests/helpers/agent-operation-postgres.probe.cjs` — focused fault and native PostgreSQL restart checks.
- `tests/agent-capabilities.adapters.test.cjs`, `tests/agent-lead-actions-ask.test.cjs`, `tests/helpers/agent-conductor.probe.cjs` — faithful compatibility checks/fixtures.

## Verification

Environment: Node `22.23.2`, pnpm `10.6.1`, installed `@mastra/core` `1.78.0`. Initial worker selected command, exit **0**, **5 suites / 67 tests passed**, zero failures/skips:

```bash
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --no-coverage tests/agent-operation-receipts.test.cjs tests/agent-conductor.agent.test.cjs tests/agent-durable-recovery.test.cjs tests/agent-capabilities.adapters.test.cjs tests/agent-lead-actions-ask.test.cjs
```

The two new Jest cases execute **20 internal Node fault/compatibility cases** and five actual `SIGKILL` child-process scenarios with native durable agents and an owned local PostgreSQL transaction:

| Kill/failure boundary | Domain writes after restart | Result |
| --- | ---: | --- |
| Native operation claim saved; intent not acknowledged | 0 | Uncertain, no replay |
| Intent/witness saved; domain work not started | 0 | Uncertain, no replay |
| Domain transaction committed; receipt not saved | 1 | Uncertain, no replay |
| Completion receipt saved; native workflow not checkpointed | 1 | Original successful result replayed |
| Completion and run-guard writes both fail | 1 | Uncertain; alternate ID blocked even after native ownership retention |

The real restart probe verifies `context.mastra.getStorage()` is present, native leases reject another initial claim after release, and native checkpoint recovery retains the original tool-call ID both before and after receipt completion. The public bulk recovery API awaits workflow settlement; only the SIGKILL-confirmed dead local fixture owner's lease is released for immediate recovery. The new restart probe does not read private SDK run-registry or `workflowExecution` fields.

Other focused cases cover write/paid/confirm faults, read failure, failed or lost-acknowledgement claims, lost completion acknowledgement, concurrent duplicate drivers, post-Stop committed result retention, pre-invocation Stop, legacy metadata receipt replay, a missing tool-call identity, fresh-context alternate IDs, normal native batch writes under global approval, and one-/two-question human-input phases. Existing native recovery/fencing, actual conductor approval/input, adapter, and lead-action suites pass.

`git diff --check` exits 0. All nine changed source/test files were checked for trailing whitespace. The PostgreSQL probe drops only its generated schema and cleans only its own fallback container in `finally`.

Evidence: [focused log](evidence/durable-receipts-focused.log), [source and log SHA-256](evidence/durable-receipts-source-hashes.json). These are focused worker results, not a full build/test receipt, production proof, provider exactly-once proof, or model/search-quality acceptance.

## Root integration contract

- Import `AGENT_UNCERTAIN_OPERATION_CONTEXT_KEY` (`cf.uncertainOperation`) for the native after-tool/turn tripwire. It contains primitive `{ runId, operationType }` only.
- Call `readAgentOperationRunGuard({ organizationId, threadId, runId, storage })` before availability recovery or automatically starting consequential work from an uncertain task. It returns `{ version: 1, state: 'uncertain', operationType } | null`; failed storage reads throw and must not be converted into a clear guard.
- Expose uncertainty in task history/UI and require result reconciliation before a new run can bypass the stopped task. Registry capabilities are protected here; generic native autonomy/delegation tools and the web task lifecycle remain root-owned.
- No retention configuration was introduced. Keep unresolved operation state/witnesses while a run remains replayable. Missing state behind a retained witness remains uncertain; ownership-row retention alone cannot authorize replay.
- Root owns compilation, combined acceptance, browser/product journeys, canonical task status, and integration/commit. Product service/provider writes were not exercised against live accounts; fault injection uses the actual adapter around an owned real PostgreSQL fixture transaction.

## Documentation evidence

Context7 `/mastra-ai/mastra` and installed 1.78 declarations/source were checked. [Native durable recovery](https://mastra.ai/docs/harness/durable-agents#crash-recovery) explicitly warns that recovery can replay LLM/tool work. [Run ownership](https://github.com/mastra-ai/mastra/blob/main/packages/core/src/agent/durable/leases.md) documents native claims, generations, and fencing. Installed `storage/run-fencing.d.ts` and `storage/domains/workflows/base.d.ts` confirm public `expectedGeneration`, retained generations after release, and native fence resolution. [Native PostgreSQL thread state](https://github.com/mastra-ai/mastra/blob/main/stores/pg/src/storage/domains/thread-state/index.ts) and installed `ThreadStatePG` confirm persistent per-thread/type JSONB state.

Delivery event: source and tests ready for root acceptance. Safe cleanup: only owned disposable PostgreSQL schemas/containers; no unrelated edits reverted, no branches/worktrees removed, no delivery actions performed.

## Followup — native queued successors and logical-task lineage

Root requested a bounded followup after the initial delivery. `Session.queueMessage()` was reproduced with an actual native `AgentController`, Session, scripted model, Memory and the real capability adapter. Before the fix, the fresh successor reached the tool with a new trusted execution ID but inherited the finished parent's `AsyncLocalStorage` lifecycle and performed no write.

`trackAgentTurnWork()` now exits a finished inherited lifecycle only for a different server-built execution ID, then validates that ID against Stop and the current public native invocation. Same-ID late callbacks remain refused; a fresh ID with no live native invocation is also refused. Active HTTP lifecycle binding, including a resumed tool whose stored context has an older request ID, retains its existing priority.

The native Session mode agent exposes public tool `runId` and `abortSignal` without the DurableAgent-specific private request-context map. The adapter therefore supplies those public fields for lifecycle validation and durably reserves every `cf.executionId`-tracked chat side effect even when that map is absent. The native queue regression verifies two writes and two committed persistent receipts, one for the parent and one for its queued successor, followed by rejection of old and unbound callbacks.

The public reader now accepts `previousRunIds?: readonly string[]` and `memory?: { getThreadById(...) }`. It reads the current and all selected prior run uncertainty slots, and checks the pre-write memory witnesses and native phase receipts for those exact previous native attempts. Pending, missing, or corrupt prior operation state returns uncertainty; failed reads or a missing reader refuse the handoff. Valid committed receipts and acknowledged yielded phases are known outcomes. Unrelated explicitly fresh human tasks omit that lineage. No extra task ledger was added. The availability worker owns passing its persisted `lineageRunIds` before internal handoff/retry.

Latest focused command, exit **0**, **1 suite / 2 Jest tests passed**; its isolated Node probe now contains **25 passing cases**, plus the five PostgreSQL SIGKILL scenarios:

```bash
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --no-coverage tests/agent-operation-receipts.test.cjs
```

The earlier 5-suite/67-test result is initial-delivery evidence, not a restamped combined acceptance after this followup. Root owns the updated combined acceptance. The unrelated observer assertion in the old native recovery fixture was left with its owning R6 stream.

Followup evidence: [focused log](evidence/durable-receipts-followup.log), [changed-source hashes](evidence/durable-receipts-followup-source-hashes.json). `git diff --check` and changed-file whitespace checks pass. Existing owned PostgreSQL cleanup still completes. No commit, push, deploy, paid call, or unrelated source change.

## Native queued human input — bounded followup delivery

Root authorized `conductor/native-queued-input.ts` after the installed SDK research established that active `Session.queueSignal`, `queueMessage`, and `followUp` acknowledge an entry held only in `pendingIdleSignalsByThread`. The control probe positively reproduces that accepted input disappearing after SIGKILL. This module is only for explicitly fresh human queue/follow-up requests. Existing model-availability continuation remains owned by its separate native path.

The new adapter uses public native primitives:

- `createWorkflow` snapshots own the exact human signal ID, text, author, timestamp, trusted identity/request ID, fixed child ID, and dependency. `run.startAsync` awaits native durable dispatch before acceptance. Native workflow restart replays the waiting step, with no application queue, poller, scheduler or retry budget.
- One native `workflows.claimRunOwnership` serializes admission per organization/thread. Public `memory.raiseRunFence` plus fenced `updateThreadMetadata` acknowledge only a tail dependency pointer. Its claim may expire; an expired child-start lease does not restore first permission because the separate native intent and initial-generation claim remain. Live admission is refused instead of polled.
- A second accepted input depends on the previous queued child and native workflow. Public `DurableAgent.observe` waits for actual completion. A completed preceding workflow is authoritative. Child start uses native atomic first claim and durable intent before model/tool work.
- Replaying an already-started child observes/recoveries the same fixed native ID. A cached shared FINISH can establish completion after native terminal snapshots have been deleted. Missing completion proof suspends the native workflow with honest uncertainty and retains the words. It never blindly creates a replacement child.
- Native `stream({ closeOnSuspend: false, untilIdle: true })` retains real Session tool approval and background continuations. Only a successful `stop` FINISH completes the queue entry; `abort`/`aborted` are incomplete. Public Session machinery supplies current authorized options and a bound thread subscription. No SDK private field or mutation is used by this module.
- `stopNativeQueuedInput` durably acknowledges a stopped disposition before best-effort native cancellation. `cf.queuedInputChildRunId` preserves that stop identity through a legitimate availability successor. Service model admission checks this marker before native recovery/provider work.
- Fresh/orphaned model drivers run inside the service's existing usage/lifecycle scope. Live, suspended, or absent-active-snapshot children are observed outside a new admission. A positive native skipped-only recovery race throws `NativeQueuedInputObserveOnlyError` / `NATIVE_QUEUE_OBSERVE_ONLY` through that scope so the service can void its unused admission without settling the winner's lifecycle, then observation continues outside it.
- A lost dispatch/tail acknowledgement returns `QUEUED_INPUT_ACCEPTANCE_UNCERTAIN` with the original workflow/child/request receipt. A duplicate original human ID returns the stored request ID. Conflicting words under the same ID are refused. Failed reads do not become absence.

New files owned by this delivery:

- `libraries/nestjs-libraries/src/chat/conductor/native-queued-input.ts`
- `tests/helpers/native-queued-input.probe.cjs`
- `tests/native-queued-input.test.cjs`

Final focused command, exit **0**, **1 suite / 1 Jest test passed** in 22.335 seconds:

```bash
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --no-coverage tests/native-queued-input.test.cjs
```

Its actual PostgreSQL probe exercises seven process-crash modes, four native-store faults, and one live observer replay:

| Scenario | Verified outcome |
| --- | --- |
| Native in-memory queue control | Accepted signal is absent after SIGKILL; zero writes |
| Native persisted-signal fallback control | Exact words/author survive; zero execution |
| Two separate admitting OS processes, then fresh host | Both inputs survive; writes are exactly first then second; two original human IDs; two admissions |
| Completed native child, before queue result receipt | One write; restored workflow suspends uncertain; no second admission |
| Stop before crash | Original input retained; canceled; zero writes/admissions |
| Stop after crash | Original input retained; canceled; zero writes/admissions |
| Real confirmed tool waiting for native human approval, then SIGKILL | Public `approval.isArmed` and `listSuspendedRuns` prove the gate; a fresh Session's public persisted approval resumes the original call; one write and one queued admission |
| Native read / atomic claim / durable dispatch / lost tail acknowledgement failures | No false accepted response; zero model/domain calls; lost tail ack retains original request on idempotent resubmission |
| Concurrent replay while actual native child is live | One domain write and one admission; second driver only observes |

The domain write is executed through the actual `mastra.adapter.ts` capability boundary. Test models are scripted local `MockLanguageModelV3`; there are no paid/provider calls. Each run uses its own local PostgreSQL schema and removes it in `finally`. The last inventory contained no leftover `cf_r5_*` schemas. The test requires the local disposable PostgreSQL target (`CF_TEST_PG_URL`, otherwise the existing local port 5433), never a remote URL. A full host OS reboot was not performed; SIGKILL plus fresh host, pool, Session and Memory proves loss of all process-local state while keeping acknowledged native PostgreSQL data.

Targeted public-API type check, exit **0**:

```bash
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit --strictNullChecks --skipLibCheck --esModuleInterop --moduleResolution bundler --module esnext --target ES2022 libraries/nestjs-libraries/src/chat/conductor/native-queued-input.ts
```

Both stream consumers use public `getReader/read/releaseLock`, compatible with the backend's library types. `git diff --check`, Node syntax and new-file whitespace checks are the scoped static checks. Evidence: [Jest log](evidence/native-queued-input-jest.log), [type-check log](evidence/native-queued-input-types.log), [source hashes](evidence/native-queued-input-source-hashes.json). Earlier direct probe logs remain historical evidence.

Stable integration contract was sent directly to `availability_recovery` and `retry_models`: register the workflow on the same Mastra; restart its active runs alongside native agent recovery; resolve current membership/thread ACL, work context/open proposals, original request ID, native Session subscription and stream options; wrap actual model drivers once; preserve Stop through child lineage; route explicit human queue/follow-up only; retain uncertainty receipts and original IDs. The optional continuation resolver only follows existing authorized native lineage; it never owns the availability retry driver.

Read-only integration review identified and sent these fixes to their owners: Stop must include failed wrappers with an unresolved child; queued context must resolve stored work context/open proposals; a post-admission UI-summary write failure must not erase authoritative native acceptance; incomplete abort FINISH and observer-only usage scope must not settle a live logical task. Owners reported the first three integrated. The rare positive skipped-only service admission void and combined queue + availability proof remain with the root/service owner. Root owns final combined backend compilation, HTTP/browser journeys, acceptance and commit. No claim of those gates passing is made here.

Documentation: Context7 `/mastra-ai/mastra`, [native signals](https://mastra.ai/docs/harness/signals), [native async workflow dispatch](https://mastra.ai/reference/workflows/run-methods/startAsync), [native durable observation/recovery](https://mastra.ai/reference/agents/durable-agent). Installed `@mastra/core` 1.78 public declarations confirm the formal Session machinery DI boundary, removal of workflow `waitForEvent`, and default-engine workflow recovery. The Inngest-only concurrency example was not treated as an available default-engine queue. Installed durable-agent code confirms terminal snapshots are deleted regardless of a custom persistence predicate; a retained stream cache is separate from those snapshots.

Delivery event: native queued-input module, focused proof and stable integration contract complete; owned files released for root integration. Cleanup is restricted to owned test schemas. No commits, pushes, deployments, production mutations, real messages or paid calls.

## Final integration review followup — monotonic queued Stop

The read-only integrated review found an actionable cross-process Stop race. A worker could read no disposition and obtain its first-start claim, another host could acknowledge `stopped`, then the first worker could overwrite that same native `threadState` row with `started` and execute. Installed default native `Run.cancel()` aborts its local controller and updates the saved workflow status; it does not abort the original process's step controller. The exact two-process native PostgreSQL reproducer failed before the fix: the delayed worker finished and the stored disposition changed from acknowledged `stopped` to `completed`.

Root reopened this module's ownership for the bounded fix. Stop now writes a separate native `threadState` witness (`queued-input-stop:<opaque child hash>`), acknowledged before native cancellation. Only Stop writes that key. The public disposition reader checks and validates it before started/completed state, so later result or intent writes cannot restore execution permission. Legacy stopped rows remain readable. Failed or corrupt witness reads refuse access, and a failed witness write cannot acknowledge Stop.

The added regression starts a real native workflow in a separate OS process and pauses its actual native `setState(started)` immediately before commit. An independent Mastra/Memory/PostgreSQL host acknowledges Stop, then releases the worker. The fixed worker performs **zero provider calls, zero domain writes and zero admissions**. A third fresh host still reads stopped after the worker exits. The same proof injects witness read and write outages and requires rejection.

Verification on Node 22.23.2:

- Red exact-barrier command: affected Jest test with `-t 'distinct native host'`, exit **1**, **1 failed / 1 skipped**, 4.1 s. Evidence: [red log](evidence/native-queued-stop-race-red.log).
- Final `pnpm exec jest --runInBand --no-coverage tests/native-queued-input.test.cjs`: exit **0**, **1 suite / 2 tests passed**, 23.23 s. This includes the prior seven crash modes, four admission faults and live observer replay plus the new distinct-process Stop race and two witness faults. Evidence: [final log](evidence/native-queued-stop-race-final.log).
- Targeted native module TypeScript command shown above: exit **0**. Evidence: [type log](evidence/native-queued-stop-race-types.log).
- `git diff --check` and both changed JavaScript syntax checks: exit **0**. Source hashes: [final Stop followup hashes](evidence/native-queued-stop-race-source-hashes.json).

Final read-only review also found that an HTTP answer to a live queued approval/question only recognizes `AgentThreads.activeTurns`, while the service queued driver owns its own admission without that registration. It therefore falls into a second same-task admission. Root, retry_models and availability_recovery received the exact boundary and own its integration fix and HTTP regression. Cold availability-gap context restoration (fresh selected work context, open proposals and original queued-child Stop identity) was sent to the service owner for correction/verification. These service/controller gates are not claimed by this module proof.

Delivery event: monotonic Stop module and focused regression complete; ownership released back to root. The probe's disposable schemas are removed in `finally`. No unrelated source changes, commits, pushes, deployment, real-user messages, production mutations or paid calls.

## Cold suspended Stop — public SDK research and isolated proof

Root requested a read-only application review after `real-local-qa-old-cold-stop-current.json` showed HTTP Stop returning true on a former process's saved skill approval while history stayed running/pending. No application source was edited for this research.

The installed 1.78 public API is:

```typescript
const workflow = durableAgent.getWorkflow();
await (await workflow.createRun({ runId })).cancel();
const saved = await workflow.getWorkflowRunById(runId);
if (saved?.status !== 'canceled') {
  throw new Error('Native cancellation could not be verified.');
}
```

`DurableAgent.getWorkflow()` is a public declaration in `agent/durable/durable-agent.d.ts` (direct execution), not a protected/internal field. Its run exposes the documented public [Run.cancel](https://mastra.ai/reference/workflows/run-methods/cancel), which applies to suspended workflows too. Installed default `Run.cancel` attempts a persisted canceled status but swallows persistence errors; successful resolution alone is not acknowledgement. A cold `abortRunStream` only publishes an abort request with no remaining executing listener and leaves the suspension intact. Context7 `/mastra-ai/mastra` and the installed [durable-agent reference](https://mastra.ai/reference/agents/durable-agent) confirm the public abort/cancel contracts.

New proof helper: `tests/helpers/native-cold-stop.probe.cjs`. Direct command, exit **0**, **2 isolated native PostgreSQL cases passed**:

```bash
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH node tests/helpers/native-cold-stop.probe.cjs
```

For both a native approval and a tool's native question suspension, a child process reaches the acknowledged saved suspension and is killed with SIGKILL. A fresh host proves no live native owner; abort-by-ID returns false and leaves one suspended run. The public workflow cancel saves `canceled`, removes the pending run from `listSuspendedRuns`, and makes public resume reject with `AGENT_RESUME_RUN_NOT_SUSPENDED`. There are **zero additional model calls and zero domain writes**. The inner `durable-agentic-execution` row remains suspended, but native suspended-agent discovery only considers the loop row.

The same proof also validates public `session.machinery.releaseSuspendedRun(runId)`: it removes the outer and inner snapshots after verified cancellation. This is optional cleanup, and it removes the native canceled tombstone as well. It is unnecessary for clearing pending discovery. The application must still record interrupted outcome explicitly after verified cancellation: hard workflow cancel emits no terminal agent FINISH for an old dead observer. Existing operation receipts and uncertainty/billing metadata must remain intact. Exact tenant/thread scope and pending native run ownership are still required before cancellation; a live driver retains the ordinary public abort path.

Evidence: [native cold Stop proof log](evidence/native-cold-stop-probe.log). Node syntax and `git diff --check` exit **0**. The helper uses scripted local models, separate disposable local PostgreSQL schemas and `finally` cleanup; it does not touch the real-QA stand, production or a provider. Root/service owner received the concrete sequence and limitations and owns the application fix and HTTP regression. No commit or delivery action.

## Last targeted integration review — two concrete owner followups

Root requested read-only review of the latest service cold Stop, queued Session binding and HTTP signal boundary. The cold Stop call and strict native persisted-status check match the proven installed public SDK contract. No application source was edited and no broad suite was run.

Two concrete findings were sent immediately to root and availability_recovery:

1. **Reused Session subscription escapes queued task scope.** Installed native `SessionThread.ensureSubscription` returns when agent/resource/thread already match. Moving its call inside the queued admission therefore cannot rebind an existing consumer. The current queued HTTP test creates a raw Memory thread without an earlier Session, so it misses this case. A read-only in-memory variant inserts `service.sessionFor(identity, threadId, { bindThread: true })` before the same HTTP queue and selects only approval. The actual native approval and domain call complete, but the existing assertion fails with model execution scopes `[true, false]`: the resumed callback loses the original queued execution/admission. Exit **1**; [exact failing log](evidence/native-queued-prebound-review.log). The synthetic fixture cleaned its own disposable schema. The service owner is correcting this public callback boundary and owns the permanent regression.
2. **Stop in a cold availability dispatch/checkpoint gap lacks a terminal projection.** When the saved successor intent exists but both native snapshots and the former driver are absent, Stop writes `stopping` and clears `continuationPending`. The suspended-run loop has no entry to reconcile, and no native FINISH will arrive. Existing gap-Stop coverage manually reinstates pending intent before bootstrap, so it does not prove this ordinary Stop response. The service owner confirmed the defect from source and is adding a no-rewrite gap-Stop case plus guarded interrupted reconciliation. Operation receipts and the immutable queued Stop witness must remain intact.

This is a bounded review result, not acceptance of the owners' pending corrections. Latest HTTP idle-signal rejection and post-admission display-receipt failure handling introduce no additional actionable finding in this review. Root retains the final integrated acceptance gate.


## Final scenario regressions: resumed receipt, terminal length and explicit native fuses

Root's second full inventory exposed four failing scenario fixtures. The bounded baseline is retained in [scenarios-four-red-summary.json](evidence/scenarios-four-red-summary.json). No full suite was duplicated here.

The media scenario found a real receipt-boundary defect: native human resume committed successfully, but the original same-call suspended witness remained visible to the next distinct write. A new driver generation could not skip that original witness, so `adaptation_image` falsely returned `CAPABILITY_OUTCOME_UNCERTAIN` and wrote nothing. Existing native Memory witnesses now optionally list the exact prior suspended phase IDs in `resumes`, captured before the resumed operation enters domain work. A distinct resumed phase's durable committed receipt only supersedes those listed phases of the same exact call identity. A later suspension, pending phase, missing receipt or unrelated call is not resolved. No new store, queue, ledger or provider action was introduced.

The existing input-yield fault test was first expanded and failed (exit 1): a fresh-module next tool returned uncertain instead of success. It now proves the following action executes once, same-ID replay reuses its result, the original resumed result remains unchanged, and an older committed resume cannot resolve a later unanswered phase. All original 25 fault/concurrency/reset cases remain present. The actual media scenario still requires the original picture/approval flow, one adaptation write, exact selected media ID, completed history and no saved image bytes.

The final `length` with useful text had independently closed its admission/history as completed. Root corrected only the controller's terminal UI finish classification (`error` or `length`); native intermediate retry processing was preserved. The two-turn consumer scenario requires useful partial text unchanged, two model calls and one read per turn, failed admission and failed stored task outcome.

Legacy three-repeat fixtures now distinguish current native behavior. The first sets the real operator `CF_AGENT_TASK_MAX_IDENTICAL_TOOL_RESULTS=3`, restores the process setting afterward, and proves an incomplete visible stop after three results. The second exercises the default native policy with all tools available for seven reads and a model-authored final eighth step, exact final words and completed state. No implicit cap or forced tool-none step is restored. `CF_AGENT_SCENARIO_IDS` is an optional child-runner selector paired with Jest's test-name filter; the ordinary suite still plays and asserts every scenario by default.

Verification (Node 22.23.2, no paid/provider/production calls):

- Focused four-scenario Jest consumer: exit **0**, **28 passed**, **7.661 s**. The remaining 1,086 assertions were excluded by the explicit test-name filter, not changed or suppressed. [Log](evidence/scenarios-four-green.log).
- Focused receipt Jest wrapper: exit **0**, **2 passed**, **15.268 s**; includes all **25** native adapter fault/reset/concurrency cases and **five real PostgreSQL SIGKILL boundaries**. [Log](evidence/scenarios-receipts-faults-green.log).
- Targeted receipt module TypeScript (`--noEmit --strictNullChecks --skipLibCheck --esModuleInterop --moduleResolution bundler --module esnext --target ES2022`): exit **0**. [Log](evidence/scenarios-receipts-types.log).
- Seven JavaScript sources and receipt TypeScript syntax: exit **0**. Scoped `git diff --check`: exit **0**.

[Final source SHA-256s](evidence/scenarios-receipt-followup-source-sha256.json) cover all eight owned files plus root's controller correction. No edits were made to controller, execution, frontend or service modules by this worker. Sources are frozen and ownership is released for root's final acceptance.


## A16: enclosing operation accounting follows the actual settled lifecycle

The concrete controller scenario and actual native PG/Redis queue reproduced the same defect: a tool returned a fatal refusal, the scripted model nevertheless said `Готово.`, public lifecycle history correctly said failed, but the enclosing `agent` operation was closed as successful. Both consumer reproducers failed before the product patch ([controller RED](evidence/lifecycle-controller-red.log), [native queue RED](evidence/lifecycle-queue-red.log)); outcome-return assertions also failed with `undefined` ([unit RED](evidence/lifecycle-return-red.log)).

`AgentTurnLifecycle.finish()` now waits for tracked work, computes its actual outcome, awaits the existing durable settlement acknowledgement, and returns that outcome. It still rejects a failed settlement write. Only the controller's final settlement block and the native queued runtime's final settlement block consume that result: a tracked failure forces `admission.finish(false)`. The queued runtime also forces false if durable settlement itself rejects. Root's terminal-length classification is retained. No usage ledger, token, cost, unknown-cost or provider policy was added or rewritten. Observer-only native recovery retains its existing `voidUnstarted` branch.

The generic scenario invariant now compares each operation's ledger status with its independently read public owned-history outcome. The runner reuses its existing next-turn/final GET and never derives history from the ledger or repeats the private tool-refusal predicate. Exact one-agent admission and every explicit `incompleteTurns` failure assertion remain. The new fatal-result scenario additionally requires the real scripted `Готово.` text, exactly two model calls, one failed analytics call, no write, failed history and failed operation.

Actual native queued consumer proof covers three cases: fatal result + completed native stream must close the enclosing operation false; an exact server-proven `canReviseInput:true` refusal followed by revised success remains completed/true; terminal Memory settlement write failure leaves the marker running, native workflow failed, and operation false. Existing real controller Stop/recovery tests retain interrupted outcomes, old callback denial, pending-work waiting and successful revise-input recovery. The new lifecycle unit checks its returned result only resolves after both pending work and settlement acknowledgement.

Focused verification, no full suite or external/paid provider call:

- Five selected controller scenarios: exit **0**, **35 passed**, **7.237 s**; 1,086 other assertions excluded by explicit name filter. [Log](evidence/lifecycle-controller-green.log).
- Lifecycle/accounting, real Stop/recovery, queued gates/Stop and the three-case actual PostgreSQL/Redis accounting consumer: exit **0**, **4 suites / 38 tests passed**, **26.382 s**. Existing usage and cost assertions pass unchanged. [Log](evidence/lifecycle-accounting-green.log).
- Backend TypeScript `pnpm exec tsc --noEmit --pretty false -p apps/backend/tsconfig.json`: exit **0**. [Log](evidence/lifecycle-accounting-backend-types.log).
- Seven modified/new JavaScript sources pass syntax checks; scoped `git diff --check` and all new-file whitespace checks exit **0**.

[Final ten source hashes](evidence/lifecycle-accounting-source-sha256.json). Service ownership was limited to the final settlement block around lines 974–988; QA's constructor/observability edits were preserved. No commit, push, runtime restart, deployment or production change. All owned probes finished and their isolated native PG/Redis resources were cleaned by their existing finally paths. This scope is frozen and released for root acceptance.


## Whole affected scenario file: final accounting invariant recheck

Root requested the entire `tests/agent-scenarios.test.cjs` because its public-history/ledger invariant affects every fixture. The unfiltered run finished with exit **1**, **1,120 passed / 1 failed / 0 skipped**, **191.15 s**. Every generic history/ledger invariant passed. The sole remaining failure was the explicit old `idea-topic-to-piece:88` expectation that `CHECK_TOO_SOON` closes the enclosing `agent` operation successfully, despite its independently read public history already being failed. [Whole-file log](evidence/lifecycle-all-scenarios-full.log).

Only that fixture changed: third request explicitly incomplete, enclosing agent failed, public execution settled-failed. All existing assertions for the one prior successful periodic `web_research`, no repeat search, returned paid permit, lead source, written piece and exact artifact writes remain. No product or domain-failure-policy change followed the whole-file run.

Per root's explicit direction, reuse the 1,120 passing assertions and recheck the single expectation-only correction: exit **0**, **7 passed**, **5.156 s**, with 1,114 other assertions excluded by the focused name filter. Scoped diff check exits **0**. [Focused log](evidence/lifecycle-idea-topic-green.log), [commands, counts and final hashes](evidence/lifecycle-all-scenarios-recheck.json). The unfiltered run is retained honestly as the pre-correction failure; no second whole-file exit-0 is claimed. Scope frozen and ready for root's final acceptance.
