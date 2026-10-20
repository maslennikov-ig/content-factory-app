## Goal
Durable и background: продолжение, перезапуск и защита от повторов. Complete product behavior, not API availability only.

## Scope and Integration
**Boundary:** process lifetime, shared storage, claims and side effects.
**Files:** `mastra.service.ts`, `conductor.agent.ts`, `conductor.execution.ts`,
`agent-run-claims.ts`, `agent-turn-lifecycle.ts`, run/thread repositories and
existing `openai/ai.usage.service.ts` / `ai.text-chain.ts` observers; local fixture
startup/config and backend shutdown lifecycle.
**Dependencies:** Tasks1,2; Task2 provides stable saved-result references.

Adopt persistent durable snapshots/cache/pubsub, native distributed ownership,
background tasks and until-idle events. Disconnect detaches; Stop cancels. Use
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

Full contract and criteria: docs/superpowers/plans/2026-10-19-native-mastra-harness.md, Tasks3 and A1-A22.

## Boundaries
Local implementation/testing in the new chat only. No push, image, deployment, production mutation or real social action. Preserve parent identity/history, old pending calls and domain safety.
