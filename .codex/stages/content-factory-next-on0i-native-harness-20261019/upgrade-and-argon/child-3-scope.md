## Goal
Complete Task3 of the same native Mastra epic with actual product consumers. Gemini Argon is executor.

## Scope and Integration
**Boundary:** process lifetime, shared storage, claims and side effects.
**Files:** `mastra.service.ts`, `conductor.agent.ts`, `conductor.execution.ts`,
`agent-run-claims.ts`, `agent-turn-lifecycle.ts`, run/thread repositories and
existing `openai/ai.usage.service.ts` / `ai.text-chain.ts` observers; local fixture
startup/config and backend shutdown lifecycle.
**Dependencies:** Tasks1,2; Task2 provides stable saved-result references.

Adopt persistent durable snapshots/cache/pubsub, native distributed ownership,
background tasks and until-idle events. Exercise new native ownership renewal
and storage run fencing with a stale driver as well as a crashed one.
Disconnect detaches; Stop cancels. Use
native storage/recovery rather than extending fixed600s claims. Re-register
background executor context when the pinned resume API requires it. Persist
operation identities and keep all existing committed/uncertain write receipts.
Integrate native scheduler lifecycle for owned agent-only schedules; no new
social scheduling implementation or modified Temporal contract.
**Acceptance:** complete a task beyond the old nine-minute window (bounded
injected-clock/local-delay test); observer reconnect and actual child-process
restart pass separately; duplicate drivers/late results/replayed tool or subagent
cannot repeat an accepted artifact/publication; receipts remain terminal/accurate.
**Focused checks:** `agent-task-execution`, native resume/recovery/ledger and
proposal contracts; add real local PostgreSQL/Redis plus kill/restart tests with
scripted provider receipts. Retain foreign local services and clean own fixtures.

## Acceptance Criteria
complete a task beyond the old nine-minute window (bounded
injected-clock/local-delay test); observer reconnect and actual child-process
restart pass separately; duplicate drivers/late results/replayed tool or subagent
cannot repeat an accepted artifact/publication; receipts remain terminal/accurate.

A1-A28 and full version/capability/recovery contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Stable upgrade and release delta are part of this epic; no new task tree.

## Boundaries
Local implementation/QA only in the new chat. No product implementation during preparation, no source push/image/deployment/production mutation/social action. Preserve identity, history, prior approvals, actual rights/quotas/receipts and supported MCP client protocol.
