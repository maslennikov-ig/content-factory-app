# Independent review of content-factory-next-on0i

Date: 2026-10-21. Verdict: **CHANGES REQUIRED; full epic completion is not substantiated.**

Reviewed current implementation worktree `/home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018`, branch `codex/on0i-native-harness-implementation-20261019`, HEAD `e74e059ea104593d2fac831eb989714a5b151263`. The original on0i implementation ends at `518015573`; this review uses current source, including subsequent fixes, so it does not report already-fixed historical defects. Blame confirms the principal defects below originate in on0i changes.

The canonical Beads epic is closed with reason “All 7 children (on0i.1..on0i.7) and A1..A31 implemented and verified locally at 518015573.” The implementation outcome and root receipt repeat complete coverage. Neither closure nor passing unit suites establishes that coverage.

## Findings

### R1 — P1: Stop does not stop the ordinary live chat execution

`apps/frontend/src/components/agents/agent.conversation.tsx:449-463` calls the server Stop endpoint only when `attachedRunning` is true. That flag explicitly requires `!busy` at lines 422-427. During the ordinary live stream (`status === 'streaming'`), the handler only invokes AI SDK `stop()` and marks the local UI interrupted.

The matching server behavior in `apps/backend/src/api/routes/agent.controller.ts:236-249` deliberately treats a disconnected HTTP observer as a detach and keeps the durable task running. Thus the UI can show interruption while the backend continues models, tools and writes.

Reproduction: render the actual `AgentConversation` with the existing UI fixture in streaming state, click the composer Stop callback. Result: `localStopCalls: 1`, `serverStopCalls: []`, no HTTP requests. The existing A13 UI test covers only reattachment after reload, where `busy` is false.

Required correction: invoke the authenticated server Stop path for active live and reattached turns, handle Stop acknowledgement/failure honestly, and test the rendered live UI against a delayed backend tool. Preserve disconnect-without-Stop behavior.

Evidence: `active-stop-probe.cjs`, `active-stop.log`, `evidence.json.probes.active-stop`.

### R2 — P1: Model selection reintroduces the legacy retry chain and multiplies attempts

`libraries/nestjs-libraries/src/chat/mastra.service.ts:174-190` supplies `getAiSdkProvider(...).chat(...)` as the selected models. That provider uses `createTextChainFetch` without `singleModelAttempt` (`openai/ai.clients.ts:305-316`). The native conductor simultaneously has a `ModelWithRetries[]` chain plus `createConductorStreamErrorRetryProcessor`. Only `getMastraAgentModelEntries` uses the intended single-attempt transport.

Reproduction uses the actual conductor, model-selection processor, provider factories and text transport, with fake HTTP 503 responses. Three configured models and one retry each should make six HTTP requests. Without routing: **6**. With a confident routing choice and the same policy: **16**. Both complete with no usable result; all calls are visible in the test ledger. This is additional cost and latency, not a theoretical nesting concern.

Required correction: selected main/classify models must use the same metered single-attempt path and one retry/fallback owner. Add a combined routing-plus-outage test, not only separate successful routing and fallback tests. Also configure bounded backoff for faults without Retry-After: observed retry intervals here are approximately 0–20 ms. The native processor does honor Retry-After when supplied; this review does not claim otherwise.

Evidence: `routing-outage-probe.cjs` modes `routing-outage` and `outage`; corresponding logs and JSON. Native reference: https://mastra.ai/reference/processors/stream-error-retry-processor (retry budget and delay behavior).

### R3 — P1: Exhausting all models terminates the run without the required automatic recovery

The error path settles the web task as failed (`apps/backend/src/api/routes/agent.controller.ts:540-580`). Bootstrap recovery calls only `conductor.recoverActiveRuns` (`libraries/nestjs-libraries/src/chat/mastra.service.ts:515-521`). No durable waiting/retry/resume transition handles exhaustion of the model chain.

Reproduction with native Mastra 1.78, native durable execution, `recovery.durableAgents: 'auto'`, and all three HTTP providers returning 503: six attempts, empty result, **0 active runs**, **0 retained workflow rows after settlement**, and `recoverActiveRuns` returns an empty recovered list. The probe uses in-memory native storage; installed SDK source additionally confirms bulk recovery discovers running snapshots rather than terminal failures. This is not a PostgreSQL outage/restart acceptance test, and that missing acceptance remains required.

Required correction: preserve the same task/checkpoint in a supported native wait/retry lifecycle before terminal failure for transient outages; recover after provider return and restart, without duplicate drivers. Auth/quota/consent failures and explicit Stop must remain terminal or actionable, not availability retries.

Evidence: `outage.log`, `evidence.json.probes.outage`; original plan A31 and section 6. Native reference: https://mastra.ai/docs/harness/durable-agents#crash-recovery.

### R4 — P1: Failed receipt persistence allows a committed write to execute again after restart

`libraries/nestjs-libraries/src/chat/capabilities/mastra.adapter.ts:415-443,500-505` executes a write and then persists its receipt. `agent-turn-lifecycle.ts:122-130` suppresses receipt-store failures and retains only an in-process Map. The read side also treats receipt-read errors as no receipt. There is no atomic domain-operation key covering the write/receipt gap.

Reproduction calls the actual capability adapter twice with identical run/thread/toolCall IDs and a successful synthetic domain write, while receipt persistence fails. Reloading the real adapter/lifecycle modules resets process-local state between calls. Result: **two domain writes**, both calls report `ok: true` (`piece-1`, then `piece-2`). This models loss of process-local receipts, not an actual OS crash test. The passing existing crash test kills only after a receipt is already stored and therefore misses this window.

Required correction: use a durable operation identity/claim at the domain transaction boundary, or preserve an explicit uncertain outcome that prohibits blind replay. A receipt storage outage must not turn into permission to repeat a possibly completed write or paid operation.

Evidence: `boundary-probe.cjs`, `boundary.log`, `evidence.json.probes.boundary.receipt`.

### R5 — P2: Queue/steering remains browser-local, despite the claimed native integration

`apps/frontend/src/components/agents/agent.conversation.tsx:448,534-544` retains a single React-state queued message and sends it only after the current stream finishes. Closing/remounting the page loses the queue; it cannot steer the ongoing run. There is no `/threads/:id/signals` route or matching client request in current `AgentController`/`AGENT_DOORS`, although the outcome explicitly claims those consumers were added.

The web POST still invokes `handleChatStream` directly (server controller lines 434-448); that installed adapter calls Agent.stream/resumeStream, not Session.send. Creating a Session separately does not prove the planned Session turn controls are used. Existing test `sessionIsolation` switches Session model/mode and reads state, but never sends the next product chat through that selection. This review does not claim every Session feature is broken; it establishes missing A19/default-path integration.

Required correction: wire native durable queued/follow-up/steering controls into the actual web entrance and verify delivery across reload/restart, ordering, task continuity and tenant boundaries. Remove the replaced local queue.

Evidence: current source and original plan A19/A28, implementation-outcome task 3/task 6 claims.

### R6 — P2: Reconnect depends on the original service's in-memory stream map

`agent-threads.service.ts:356,372-435` buffers observer events in `activeTurns`. `agent.controller.ts:868-880` returns `[DONE]` when the map lacks a handle; it does not reconnect through native durable observation. A recovered run started by `MastraService.recoverDurableRuns` never registers a handle in this map. The frontend declares `observeThread` but does not consume that endpoint; it polls history on reattachment.

Reproduction keeps the real native run alive and attaches through a freshly constructed product AgentThreadsService/controller sharing the same Mastra/storage. The task completes with one write, but the new observer receives **empty text**. The original same-service observer test passes. This demonstrates service-local coupling; it is not a claim of measured multi-server production behavior.

Required correction: resolve the durable run identity and subscribe to native persisted/shared events for reconnect, including recovery; test a new process/service and the actual UI consumer, not only the initial in-memory handle.

Evidence: `boundary.log`, `evidence.json.probes.boundary.observer`.

## Completion and evidence gaps

- Native SDK versions are updated; native durable execution, thread isolation primitives, cards, ordered settings and basic fallback behavior are real code. This is substantial implementation, not an empty scaffold.
- A fresh root-owned run of **6 suites / 73 tests passed**, including the real disposable PostgreSQL child-process recovery/fencing probe, existing fallback and native UI suites. This is focused verification, not a rerun of the entire build/suite.
- The test named “all A1–A31 acceptance criteria have owned test suites” (`tests/agent-native-acceptance-matrix.test.cjs:459-477`) only checks that filenames exist. It does not execute all 31 outcomes. Several other matrix checks mock storage, model processors and services.
- `implementation-outcome.md` explicitly states zero paid provider calls. No real model/search quality evidence satisfying A2/A4/A17 was supplied by this stage. Earlier preparation probes cannot substitute for current product-quality acceptance.
- The root receipt points to nonexistent test paths: `tests/agent-native-sessions.test.cjs`, `tests/agent-compact-evidence.test.cjs`, `tests/agent-native-model-routing.test.cjs`, `tests/agent-native-ui-controls.test.cjs`. Actual tests with other names exist, but the acceptance map must link verified evidence rather than invented paths.
- This review did not rerun full build/test after confirmed blockers, access production, run paid models, or launch a real-browser E2E. The UI Stop reproduction uses JSDOM and the actual component with mocked HTTP/AI SDK. Existing release claims are historical reports, not production assertions by this review.
- Graph reviewed using the original checkout's read-only Graphify baseline `dd67538d`. Relevant source was changed relative to that map and was inspected directly at current HEAD.

## Reproduce and finish

From the reviewed worktree with Node 22.23.2 and pnpm 10.6.1:

```bash
pnpm exec jest --runInBand --no-coverage tests/agent-model-fallback-retry.test.cjs tests/agent-native-acceptance-matrix.test.cjs tests/agent-native-ui.test.cjs tests/admin-ai-defaults.screen.test.cjs tests/instance-ai-defaults.test.cjs tests/agent-durable-recovery.test.cjs
node .codex/stages/content-factory-next-on0i-review-20261021/active-stop-probe.cjs
node .codex/stages/content-factory-next-on0i-review-20261021/routing-outage-probe.cjs routing-outage
node .codex/stages/content-factory-next-on0i-review-20261021/routing-outage-probe.cjs outage
node .codex/stages/content-factory-next-on0i-review-20261021/boundary-probe.cjs
```

The added probes report actual values with exit 0; exit 0 means the diagnostic executed, not that acceptance passed. They reuse the existing loaders/fixtures and make no paid calls. Source hashes and results are recorded in `evidence.json`.

Fix R1–R4 first, integrate R5–R6, then replace the completion map with scenario-level evidence, including real local user journeys and model/search quality. Run one final current-source epic acceptance set. Keep delivery separately authorized.
