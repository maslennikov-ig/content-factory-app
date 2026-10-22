# Native model availability / R3

Owner: `availability_recovery`. Scope: new availability module and focused native probes only. No deployment, push, production access, paid provider request, SDK patch, or existing integration file was changed by this stream.

## Supported native seam

Mastra 1.78 `processAPIError` returns only `{ retry: boolean }`. It has no suspend callback. Exhausting the native model list reaches `emitFatalErrorBail`; durable settlement deletes non-suspended terminal snapshots. `recoverActiveRuns` cannot recover that deleted terminal state.

The new `native-model-availability.ts` waits **before** that terminal branch, using a registered native `Workflow.sleepUntil`. Native workflow storage retains the exact deadline, current native parent run, step, and cycle. The parent durable agent remains `running`; completed tool results stay in its checkpoint. There are no adapter timers, model probes, provider calls, polling, scheduler, second retry budget, or custom queue.

The wait workflow sets `autoRestartActiveRuns: false`. Only the claimed parent durable-agent execution drives/restarts its wait, so generic workflow boot recovery does not add another driver. `beforeAttempt` reattaches the saved wait on cold recovery before contacting a provider. Explicit Stop uses native workflow cancellation and native agent abort/queue cancellation. Losing parent ownership is distinguished from Stop so the obsolete execution does not persist cancellation for its successor.

The presentation callback runs inside native `sleepUntil` date evaluation, **after** the engine persisted its `waiting` snapshot. The PostgreSQL probe reads that row before killing its worker and verifies the exact saved deadline.

## Integration API

```ts
const workflow = createNativeModelAvailabilityWorkflow();
// Register workflow in the same Mastra instance as the durable conductor.
const availability = new NativeModelAvailability(mastra, workflow, onWaiting);

beforeAttempt: ({ runId, stepNumber, abortSignal }) =>
  availability.beforeAttempt({ runId, stepNumber, abortSignal });

onExhausted: async (attempt) => {
  // Upstream native retry policy owns eligibility, transient classification,
  // immediate attempts, authorization, metering, and a bounded cooldown.
  await availability.wait({ ...attempt, delayMs });
  return queueNativeModelAvailabilityContinuation(conductor, {
    ...attempt,
    resourceId,
    threadId,
    streamOptions: freshNativeStreamOptions,
    onQueued: async (continuationRunId) => {
      // Persist the existing logical task's native-run pointer before abort.
    },
  });
};

// Explicit Stop cancels current calls and native queued follow-ups as well.
await availability.cancel(currentNativeRunId);
```

Use `resolveNativeTextRunId` from `ai.native-retries.ts`: durable input-processor calls omit `runId` in installed 1.78. A sole native execution claim supplies the actual identity. Do not persist credentials or reusable admission handles in the availability workflow. Root owns identity revalidation, fresh billing/admission context for a queued run, logical-task lineage, and actual Session/browser wiring.

`queueNativeModelAvailabilityContinuation` uses only public native `queueSignal`, `abortThreadStream`, and `cancelQueuedMessages`. The signal is transient/reactive, targets the existing thread, and contains no new human message. Native abort flushes the old run's messages before the queued continuation reads memory. The native internal run ID changes; the application must retain the logical task/request/goal identity and show the old partial message as interrupted, separately from the continuation. Returning `{ retry: true }` after requesting native abort re-enters the SDK's abort boundary without another provider request. Returning false can reach the SDK's fatal-error branch.

An alternative, native `sendSignal` plus error-processor retry, re-enters the same native run and resets the native chain for errors with no visible output. Four successive unavailable cycles were tested with `maxSteps: 2` and `maxProcessorRetries: 6`, without replaying the completed tool. This alternative is insufficient after visible partial text: native `interruptible` stays false throughout that model ladder. The separate diagnostic `--memory-partial` records the negative result. The unified queued continuation is the supported alternative for both cases; no private model cursor or SDK mutation is used.

`cycle` is per native parent step. It usually stays at one when a signal preempts the step. Increasing cooldown across native generations/continuations must use the existing persisted logical-task metadata or the corresponding native wait history, not a process-local counter or the resetting processor retry count.

## Evidence

Source:

- `libraries/nestjs-libraries/src/chat/conductor/native-model-availability.ts`
- `tests/helpers/native-model-availability.probe.cjs`
- `tests/agent-native-model-availability.test.cjs`

Pinned tools: Node `22.23.2`; pnpm `10.6.1`; installed Mastra core `1.78.0`.

Focused acceptance command:

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --no-coverage tests/agent-native-model-availability.test.cjs
```

The helper uses an isolated, generated `cf_availability_*` PostgreSQL schema and drops exactly that schema on completion. Other databases, schemas, containers, volumes, and production resources are untouched. Default local PostgreSQL matches the existing durable-recovery helper; `CF_TEST_PG_URL` can select another disposable test server.

Observed native/PostgreSQL outcomes:

1. Completed tool once → all three models unavailable → native wait → primary returns while both fallbacks remain unavailable → native configured chain returns to primary and completes. Every subsequent model prompt contains the completed tool result.
2. Four unavailable native generations preserve the completed tool and avoid consuming the task's two-step budget. Provider attempts remain one per model per cycle.
3. A worker is `SIGKILL`ed after its wait/deadline is persisted. A fresh native Mastra instance recovers its running checkpoint and makes no new provider request before that original deadline. Its final primary request retains the tool result; append-only write count stays one.
4. Stop during native wait persists `canceled`; attempt count remains four; a cold adapter refuses another attempt with `AbortError`.
5. A primary streams partial text and fails, then both fallbacks fail. Native queued continuation aborts the old run and reads its completed tool result from PostgreSQL memory. Primary-only restoration completes the new native run; domain write count stays one; old run is explicitly aborted; client error chunks are zero; final text is selected by its native continuation run ID.
6. Stop after native queue acceptance clears that continuation before a fifth provider request.

Result: **1 focused suite / 6 tests PASS**, zero skips, Node `22.23.2`, exit `0`. The standalone new-module TypeScript check and `git diff --check` also exit `0`. Formatting was applied only to this stream's new files; it does not change those tested behaviors. No full suite or build was run by this stream.

Saved evidence: `evidence/availability-focused-jest.log`, `evidence/availability-native-postgres-probe.log`, `evidence/availability-native-partial-steer.log`, and `evidence/availability-native-partial-negative.log`. The negative diagnostic remains explicitly negative evidence. An early diagnostic crash left one owned schema; its exact name and synthetic run rows were inventoried before dropping only that schema. The final `cf_availability_*` schema inventory is empty.

The root stage owns application integration and final acceptance; this stream does not claim deployed behavior or live provider quality.

## Explicit acceptance limits

- The crash probe calls public `recover(runId, { force: true })` only after confirmed `SIGKILL`. Actual application bootstrap, non-forced lease expiry/recheck behavior, and concurrent recovery driver fencing remain root acceptance.
- The native queue-acceptance → successor durable-checkpoint crash window has not been probed here. The existing task/native thread metadata must preserve the intended continuation lineage; do not claim durable queued handoff from the happy-path test alone.
- Redis/UnixSocket PubSub cross-process observations, actual Session/HTTP/UI consumers, fresh tenant/admission context, and real-model/search QA belong to root.
- Auth, quota, consent, denied access, uncertain writes, and Stop must be rejected upstream rather than classified as availability. This adapter neither interprets those errors nor creates substitute credentials.
- The negative partial-output diagnostic is an SDK capability limit, not a passing acceptance result. It remains available to prevent regression toward the insufficient `sendSignal`-only approach.

## Documentation and installed source review

Context7 `/mastra-ai/mastra` was queried for durable agents, crash recovery, native workflow sleep/suspend, and error processors. Exact installed 1.78 declarations and bundled source maps were inspected before implementation. Public sources:

- <https://mastra.ai/docs/harness/durable-agents>
- <https://mastra.ai/reference/agents/durable-agent>
- <https://mastra.ai/docs/workflows/suspend-and-resume>
- <https://mastra.ai/reference/workflows/workflow-methods/sleepUntil>
- <https://mastra.ai/reference/agents/agent>

Installed source boundaries: durable agent `settleExecution`, durable LLM error/fallback ladder and interruption guard, workflow sleep handler (persist before dynamic date evaluation), workflow public `restart`/`cancel`, and native thread `queueSignal`/abort handling. No SDK private state or internal deep import is used by the delivered module.
