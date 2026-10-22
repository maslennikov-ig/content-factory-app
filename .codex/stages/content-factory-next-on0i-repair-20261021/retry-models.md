# R2 retry/model repair — worker delivery

Status: delivered for root integration and final acceptance; no commit, push, deploy, production access, or paid calls by this worker.

## Root cause and native SDK facts

- The review's actual legacy routing factory reproduction made 16 HTTP calls, rather than six for three models with one retry each. The new combined regression uses the actual native conductor, ModelSelectionProcessor, provider factory and metered transport with deterministic HTTP responses.
- `getAiSdkProvider` is a legacy chain factory. Native routing must use the new `getMastraAiSdkProvider` or the models in `getMastraAgentModelEntries`.
- The previous `singleModelAttempt` path could still send Flex and then Standard. It now plans exactly one request with the configured tier. Native fallback models use Standard.
- Installed Mastra 1.78.0 has one processor retryCount across fallback model indices. Its native model maxRetries loop retries terminal errors too, has an unabortable fallback delay, and does not own Retry-After. The shared adapter records the native retryCount offset on a model transition; it has no independent attempt counter. StreamErrorRetryProcessor remains the retry/delay owner; every model entry and SDK call uses maxRetries zero.
- Native ModelSelectionProcessor already stops overriding when native fallback advances, so it remains unchanged.
- Native Classifier.decide defaults to two retries, and its model-selection consumer does not pass a zero override or abortSignal. The decision adapter now runs a configured native Agent on the single-attempt transport and wraps terminal exhaustion as an ordinary Error so the outer classifier cannot replay the chain. The combined auxiliary test executes the real outer Classifier and observes six calls, including ledger rows; successful classification observes one call and a usable choice.
- The native default goal judge consumes one model and does not forward retry configuration from GoalConfig. A native createScorer plus configured review Agent now preserves the ordered model array and the same retry policy. The goal loop, goal waiting sentinel, objective persistence, and read-only verification tools remain native. Its bounded context map carries authenticated evaluation context only; it does not carry execution/checkpoint state.

Official sources consulted through current Context7 `/mastra-ai/mastra` and direct official pages:
- https://mastra.ai/reference/processors/stream-error-retry-processor
- https://mastra.ai/models#model-fallbacks

Exact installed source/type checks: `dist/processors/stream-error-retry-processor.d.ts`, `dist/processors/processors/model-selection.d.ts`, `dist/classifier/index.cjs`, `dist/agent-DpTPjdjR.cjs`, `dist/create-durable-agent-v9Cu4dSm.cjs`.

## Delivered files

- `openai/ai.native-retries.ts`: shared native processor adapter, per-model policy, context persistence, terminal guards, cancellation, native run identity resolution, and R3 hook interface.
- `openai/ai.clients.ts`: single-attempt native provider, configurable primary override, and native Agent-backed decision model.
- `openai/ai.text-chain.ts`: exactly one HTTP request per native attempt, including included Flex.
- `conductor/conductor.agent.ts`: shared retry configuration for main and specialist agents, and availability hooks.
- `conductor/conductor.autonomy.ts`: native scorer/review Agent wiring; removes temporary mutation of the parent thread identity; preserves hidden judge threads and read-only verification.
- `tests/agent-native-retry-routing.test.cjs` and `tests/helpers/agent-model-fallback-retry.probe.cjs`: combined and auxiliary scenarios.

## Policy

Operator order and maxRetries (0 through 5) are retained. SDK/model retries are zero; the native processor retries transient faults only, with 500ms exponential backoff capped at 5 seconds, and native Retry-After handling capped at 30 seconds. The global processor fuse is 45 retries for up to nine models; R3 availability interruption starts a fresh native step, rather than changing this into an infinite counter. Auth, invalid requests, hard quota, consent errors, explicit Stop and shared execution expiry cannot advance to another provider attempt. Both native and shared execution AbortSignals cancel delays. Each transport request produces its own ledger attempt.

`getMastraAgentModelEntries(org, role?, { modelId?: string })` is backward compatible. An explicit session selection replaces the primary and is checked against the configured provider before execution. Cache fingerprints still include organization, key, mode, models, and settings. Compatible ordered fallbacks and own-key boundaries are retained.

## Root integration contract

Root owns `mastra.service.ts` and native Session integration:
1. Native routing choices must call `getMastraAiSdkProvider`, never `getAiSdkProvider`.
2. Call `setConductorModelMaxRetries(requestContext, policy.maxRetries, entries.map(entry => entry.model.modelId))` for the main model chain. The primitive context keys are `cf.nativeTextMaxRetries` and `cf.nativeTextModels`; they survive native context cloning/recovery.
3. `buildConductorAgent({ modelAvailability: { beforeAttempt, onExhausted } })` accepts R3 hooks. The exhaustion hook runs only after transient failure and exhausted per-model retries on the final configured model, within the native processor fuse. It owns no model loop or provider call.
4. Run identity resolves explicit native args.runId, then the sole execution claim in native `requestContext.getRaw('mastra__durableExecutions')`, then `cf.nativeRunId` only when there is no native claim. Multiple claims stay unresolved. Do not invent a native run ID from a client request ID.
5. Read explicit per-chat native Session model selection in the model resolver and pass `{ modelId }`; skip automatic routing for an explicit selection.
6. Root's availability module owns durable wait/restart integration and its PostgreSQL acceptance. This worker does not claim R3 completion.
7. Cold/queued model selection must prepare both routing choices through `AiUsageService.prepareModelExecution` with the trusted actor. `getClassifyDecisionModel(org, { prepareModels })` now accepts that same execution wrapper for its inner native model entries; late classifier execution remains admitted after the original HTTP async scope ends. Service owner applied this integration.

## Verification

Pinned runtime: Node 22.23.2, pnpm 10.6.1, Mastra 1.78.0. Command:

```sh
source /home/me/.nvm/nvm.sh
nvm use 22.23.2
pnpm exec jest --runInBand --no-coverage tests/agent-native-retry-routing.test.cjs tests/agent-model-fallback-retry.test.cjs tests/agent-native-autonomy.test.cjs
```

Result: **3 suites / 24 tests / 0 failures**, exit 0. See `retry-models-focused.log` and input SHA-256 map `retry-models-evidence.json`.

The same three-suite command was repeated on the final Session/queue integration and the backward-compatible classifier execution callback: **24/24 passed**, Node 22.23.2, exit 0. Current receipt: `retry-models-current-focused.log` (root final acceptance remains authoritative).

Covered outcomes: selected agent and selected classify each produce exactly six ordered HTTP/ledger attempts; classifier/review/research auxiliary executions each produce six; a successful native classifier produces one usable decision and one ledger row; authorization and hard quota each produce one request; Stop during backoff produces one request; Retry-After exceeds configured backoff; included Flex plans one request; explicit model selection retains fallbacks; incompatible OpenAI own-key model is rejected; cloned context retains retry policy; ambiguous native IDs do not resolve. Existing native goal acceptance still observes two evaluations, four main calls, and one artifact write with hidden internal threads.

`git diff --check`: exit 0. No full suite, build, release gate, browser QA, paid model/search QA, production, or deployment claim is made here; root owns final acceptance.

The initial diagnostic and red regression used the shell default Node 24.19.0 before that drift was noticed. Its preliminary red log is labeled accordingly. All final acceptance above uses pinned Node 22.23.2.

Graph reviewed: borrowed original checkout graph at baseline dd67538d, read-only. New getMastraAgentModelEntries was absent from that old graph; exact current files were inspected. No graph mutation, generated graph staging, or cross-owner cleanup.

Completion event: implementation and focused evidence delivered; root integration pending. Safe cleanup: no owned runtime or external resource was created; only the named local evidence files were copied. Unrelated work was preserved.

## Final real-QA fallback correction

The real own-key GLM case exposed settings provenance loss before Mastra received the model array: a plain, explicitly saved `z-ai/glm-5.3` became indistinguishable from an inherited default and was suppressed in workspace-key mode. Explicit plain settings now retain `fallbackModels`; inherited NULL/empty settings keep their previous semantics. The client fingerprint also distinguishes explicit from inherited configuration, so a prior cached transport cannot reuse the wrong policy.

Two regressions were red then green: serializer → resolved settings → own-key eligible native chain, and the actual provider factory/OpenAI SDK/native agent advancing from primary 429 to GLM with maxRetries 0 (two HTTP requests/two ledger attempts/answer). Node 22.23.2 affected rerun: `pnpm exec jest --runInBand --no-coverage tests/ai-text-chain.test.cjs tests/agent-model-fallback-retry.test.cjs tests/agent-native-retry-routing.test.cjs` — **3 suites / 84 tests passed**, exit 0. Logs: `chat-native-qa-fallback-red.log`, `chat-native-qa-fallback-green.log`, `chat-native-qa-fallback-affected.log`.

Root QA independently confirmed one scripted primary 429 followed by one actual configured GLM 200, a useful answer, and a settled/completed logical task. That paid-provider claim belongs to its separate real-local-QA artifact; this worker made no paid request.
