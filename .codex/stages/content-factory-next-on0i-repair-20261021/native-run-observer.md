# Native observer text corruption repair

Status: native observer implementation and isolated PostgreSQL/Redis proof pass;
authenticated HTTP terminal-history integration remains the HTTP owner's gate.
No paid provider request, running QA stand restart, deployment, push or commit
was performed in this investigation.

## Reproduced defect

Installed versions are `@mastra/core` 1.78.0, `@mastra/redis-streams` 0.6.3 and
`@mastra/redis` 1.4.10. Their public ungrouped RedisStreams subscription fans out;
the service does not configure a shared competing consumer group.

The native `DurableAgent.observe()` implementation gives every new view the
producer's same output processors, processor-state map and MessageList.
`RegexFilterProcessor` stores its 256-character streaming suffix in that shared
state. A replaying observer can consume or flush the live producer's suffix;
canceling an observer also operates on the shared MessageList. A deterministic
80-fragment stream reproduced missing text in both the visible stream and
native PostgreSQL Memory with one provider call and no abort. The first view
contained fragments 1–8 then 45–80; Memory retained only 45–80. This is an SDK
interaction, independent of the provider's generated text.

The HTTP owner's independent 40-note source-provider fixture reproduced the
same corruption through the real authenticated handler, including native
Memory. Its isolated-public-factory control restores every note.

## Public native repair

`conductor/native-run-observer.ts` uses public
`createDurableAgentStream()`. Every view has fresh native secret processors and
a fresh processor-state map, and the public adapter creates its own MessageList.
No owner request context or execution-budget processor is copied into a view.
The native producer, controller, workflow, registration and transport stay the
execution authority. No SDK private field is read or mutated.

The observer subscribes to the same native cached PubSub and retains the SDK's
inclusive numeric offset and generation semantics:

- Without an offset, native replay learns takeover generations in event order.
- With an offset, the skipped public cached events supply its highest claim
  generation. Missing history falls back to public
  `getMastraInstance().getStorage().getStore('workflows')` and
  `supportsRunFencing()` / `getRunOwnership()`.
- A failed floor read supplies native `rereadMinGeneration`; the SDK retries
  that read before a stream-ending event. This preserves the SDK behavior and
  does not add per-delta storage polling.

The helper returns only a view and `detach()`. Detach, cancellation and terminal
view disposal unsubscribe that reader; they do not clear topics, claim a run,
abort a provider, create an admission or persist messages. HTTP Session views,
bootstrap observation and queued-workflow observation use this boundary.

## Native terminal cleanup is distinct

The same probe instruments only the public `clearTopic()` method on its own
test instance. Canceling a reader midway through the producer preserves the
cached event prefix exactly and triggers zero clears. On normal completion,
native `runIdleLoop.forceClose()` calls the untilIdle wrapper's `onForceClose`,
which calls the inner durable stream's cleanup and clears both run topics.
This happens despite the service's 24-hour cleanup timeout. The terminal
topic/cache can therefore disappear immediately; an empty cache is not proof
of completion. The HTTP owner handles a positively completed saved native
assistant through history hydration, without a provider restart or fake SSE.

## Verification

Node 22.23.2 / pnpm 10.6.1:

- `pnpm exec jest tests/mastra-native-stream-fanout.test.cjs --runInBand`:
  **1 suite, 1 test passed**, 7.689 seconds. Actual service, Session, PostgreSQL,
  RedisServerCache, RedisStreamsPubSub and native workflow; synthetic provider.
  Both complete views receive all 80 fragments exactly once with one stable
  text ID. Native Memory preserves all 80 (its ordinary trailing-space trim is
  accounted for). One provider call, zero aborts, one admission. A canceled
  reader preserves the live native cache. Four tests of public PostgreSQL
  ownership claims cover full replay, skipped ownership markers, a missing
  cached prefix and retrying a failed floor read. Old-generation terminals are
  rejected; native tool-call and tool-result chunks are delivered once. The
  optional completion callback requires positive proof before an empty replay
  raises `NativeReplayCompleteError`; false stays active and saved-assistant or
  post-subscription history failures propagate.
- `pnpm exec tsc -p apps/backend/tsconfig.json --noEmit --incremental false`:
  **exit 0** after the observer implementation.
- `git diff --check`: **exit 0**.

Evidence in `evidence/native-observer-*` preserves the initial failing native
proof, passing exact source proof, terminal-cleanup call stack and type result.
The HTTP owner's separate source fixture covers a synthetic credential split
across provider chunks and real manual approval/question/Stop behavior.

Public references and installed declarations inspected:

- https://mastra.ai/reference/agents/durable-agent
- https://mastra.ai/docs/harness/durable-agents
- https://mastra.ai/reference/pubsub/redis-streams
- `@mastra/core/dist/agent/durable/stream-adapter.d.ts` exposes the native
  factory, state, offsets, generation floor and reader-local detach contract.
- `@mastra/core/dist/agent/agent.d.ts` exposes `getMastraInstance()`.
- `@mastra/core/dist/storage/domains/workflows/base.d.ts` exposes run ownership.

Remaining gate: root-owned combined acceptance, authenticated HTTP terminal
hydration and a fresh actual compiled-browser reconnect. These local synthetic
proofs do not retroactively repair text already lost in the retained old run.
