## Goal
Implement this complete cohesive task of the existing native Mastra epic. Gemini Argon is executor; local implementation only, no deploy.

### Task3 — Durable background execution and safe recovery (`on0i.3`)

**Boundary:** process lifetime, shared storage, claims and side effects.
**Files:** `mastra.service.ts`, `conductor.agent.ts`, `conductor.execution.ts`,
`agent-run-claims.ts`, `agent-turn-lifecycle.ts`, run/thread repositories and
existing `openai/ai.usage.service.ts` / `ai.text-chain.ts` observers; local fixture
startup/config and backend shutdown lifecycle.
**Dependencies:** Tasks1,2; Task2 provides stable saved-result references.

Adopt persistent durable snapshots/cache/pubsub, native distributed ownership,
background tasks and until-idle events. Explicitly enable native
`recovery.durableAgents: 'auto'`, persist running checkpoints and wire the actual
Nest bootstrap/recoverAllDurableAgents lifecycle; a custom server cannot assume
the deployer's startup hook runs. This recovers orphaned running work, not every
terminal failed run. An exhausted provider chain needs a supported durable
wait/retry/resume transition before terminal failure, not orphan recovery or a
blind replay of the whole task. Exercise new native ownership renewal
and storage run fencing with a stale driver as well as a crashed one.
Disconnect detaches; Stop cancels. Use
native storage/recovery rather than extending fixed600s claims. Re-register
background executor context when the pinned resume API requires it. Persist
operation identities and keep all existing committed/uncertain write receipts.
Recover a model outage in the existing task using native wait/recovery APIs;
preserve fallback/attempt state through restart and cancel recovery on Stop.
Task5 owns the policy; this task owns its durable lifecycle (A30/A31).
Integrate native scheduler lifecycle for owned agent-only schedules; no new
social scheduling implementation or modified Temporal contract.
**Acceptance:** complete a task beyond the old nine-minute window (bounded
injected-clock/local-delay test); observer reconnect and actual child-process
restart pass separately; duplicate drivers/late results/replayed tool or subagent
cannot repeat an accepted artifact/publication; receipts remain terminal/accurate.
**Focused checks:** `agent-task-execution`, native resume/recovery/ledger and
proposal contracts; add real local PostgreSQL/Redis plus kill/restart tests with
scripted provider receipts. Retain foreign local services and clean own fixtures.

A1-A31 and the full consumer/recovery/compatibility contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Automatic retry/fallback and menu scope: .codex/stages/content-factory-next-on0i-native-harness-20261019/retry-fallback/reliability.md. Keep the same epic/task identities and dependency graph.
