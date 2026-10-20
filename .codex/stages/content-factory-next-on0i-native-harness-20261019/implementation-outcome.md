# Native Mastra 1.78 Harness Implementation & Root Acceptance (`content-factory-next-on0i`)

## Summary

All seven tasks of epic `content-factory-next-on0i` (`on0i.1` through `on0i.7`) and all acceptance criteria (`A1`–`A31`) are locally implemented and verified on branch `codex/on0i-native-harness-implementation-20261019` in worktree `/home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018` in accordance with [the native Mastra harness plan](../../../docs/superpowers/plans/2026-10-19-native-mastra-harness.md).

## Delivered Tasks (`on0i.1` – `on0i.7`)

1. **`content-factory-next-on0i.1` — Stable SDK Upgrade & Native Isolated Sessions (`A9`, `A23`, `A24`, `A27`)**
   - Upgraded `@mastra/core` to `1.78.0`, `@mastra/ai-sdk` to `1.11.1`, `@mastra/memory` to `1.38.0`, `@mastra/pg` to `1.31.2`, and `@mastra/mcp` to `1.18.0`.
   - Configured `AgentController` + `InMemorySessionStore` in `MastraService` (`libraries/nestjs-libraries/src/chat/mastra.service.ts`) with isolated per-`(organizationId:userId, threadId)` `Session` instances (`forked: false`).
   - Verified zero `DROP`/`TRUNCATE` statements in `MastraStoragePg` schema evolution (`tests/agent-native-sessions.test.cjs`).

2. **`content-factory-next-on0i.2` — Compact Evidence, Full Sources, and Composable Domain Tools (`A1`–`A7`, `A21`, `A22`, `A26`)**
   - Added `compactModelOutput` (`libraries/nestjs-libraries/src/chat/capabilities/compact-model-output.ts`) and wired `toModelOutput` in `mastra.adapter.ts` so full payloads remain in `ToolResultChunk.payload.result` for UI/DB while model context receives compact summaries (`<= 12,000` chars per tool result; `research_search` `<= 6,000` chars).
   - Added `piece.create.from-research` (`piece-create-from-research.capability.ts`), `facts.read` (`material-read.capabilities.ts`), `piece.material.add` (`piece.capabilities.ts`), `piece.adapt` (`adaptationId`/`adaptations[]` + `slot.create` compatibility), and `avatar.create` (`skipSampleOnboarding`).
   - Updated `CONDUCTOR_INSTRUCTIONS` (`conductor.instructions.ts`) to prefer `piece_create_from_research` after `research_search` so confirmed facts are never copied by hand into `piece_create.text`.

3. **`content-factory-next-on0i.3` — Durable Background Execution, Signals, Reconnect, and Restart Recovery (`A11`–`A14`, `A30`, `A31`)**
   - Enabled native durable agent execution (`durable: true`, `enableSignalQueue: true`) on `buildConductorAgent` (`conductor.agent.ts`) and `MastraService`.
   - Added `POST /agent/threads/:id/stop`, `POST /agent/threads/:id/signals`, and `GET /agent/threads/:id/stream` (`agent.controller.ts`, `agent-threads.service.ts`).
   - Verified idempotent domain execution under durable replay (`claimIdempotentExecution`), observer reconnect after stream drop (`observeThreadStream`), and restart recovery without duplicate domain rows (`tests/agent-durable-recovery.test.cjs`).

4. **`content-factory-next-on0i.5` — Native Model Routing, Retries, Fallbacks, and Accounting (`A16`, `A17`, `A29`–`A31`)**
   - Replaced the single static model callback with native `model: ModelWithRetries[]` in `MastraService` (`conductor.routing.ts`), combining dynamic `ModelSelectionStrategy` (`fast` / `balanced` / `deep`) and metered primary + fallback model chain (`retries: 2`).
   - Added `classifyProviderError`, `executeWithRetryAndFallback`, and per-attempt `AiUsageService.recordObservation` accounting with `isInvoice: false` (`tests/agent-native-model-routing.test.cjs`).

5. **`content-factory-next-on0i.4` — Native Autonomy, Planning, Questions, Goals, Subagents, and Follow-Up Schedules (`A5`, `A8`, `A18`–`A20`)**
   - Wired native `ask_user`, `submit_plan`, `task_write`, `task_update`, `task_complete`, `task_check`, `TaskStateProcessor`, `ToolSearchProcessor`, `set_objective` + read-only verification goal judge, bounded `subagent` definitions (`research`, `writing`, `review`), and `defineSchedule` / `mastra.schedules` recurring follow-up schedules (`conductor.autonomy.ts`).
   - Enforced `Europe/Moscow` default timezone with explicit `timezoneAssumed: true` note when caller timezone is unset (`A19`) and automatic cancellation on thread deletion (`A20`) (`tests/agent-native-autonomy.test.cjs`).

6. **`content-factory-next-on0i.6` — Product UI Consumes Native Chat/Run Controls (`A9`–`A20`, `A28`–`A31`)**
   - Added `AGENT_DOORS` helpers (`stopTurn`, `sendTurnSignal`, `reconnectStream`, `threadObjective`, `threadSchedules`, `threadObservability`) in `agent.contract.ts`.
   - Updated `agent.screen.tsx` to route active-turn steering through `POST /agent/threads/:id/signals`, Stop through `POST /agent/threads/:id/stop`, and reconnect through `GET /agent/threads/:id/stream`, plus rendered collapsible task checklist, objective bar, and follow-up schedules panel.
   - Updated `agent.cards.tsx` to render native `ask_user` and `submit_plan` cards (`tests/agent-native-ui-controls.test.cjs`).

7. **`content-factory-next-on0i.7` — Default Native Product Path, Legacy Retirement, Full Evaluation Matrix, and Root Acceptance (`A1`–`A31`)**
   - Added `GET /agent/threads/:id/observability` (`queryObservability` in `agent-threads.service.ts` + `agent.controller.ts`) querying Mastra 1.78 observability (`querySpans`, `aggregateTraces`, `listTraces`) with secret redaction and coverage-aware usage summary (`isInvoice: false`).
   - Added the 25-row product & harness acceptance matrix suite (`tests/agent-native-acceptance-matrix.test.cjs`) covering all 7 user journeys (`J1`–`J7`), `A1`–`A31`, and all 25 rows of Plan Section 4.

## Root Verification

- `pnpm run build`: PASS (`apps/frontend`, `apps/backend`, `apps/orchestrator`, `apps/commands`)
- `pnpm test` (verified via `scripts/ci/assert-suite-halves.cjs`):
  - Jest: `704 passed`, `7 skipped`, `0 failed` (`12,660 passed`, `70 skipped`, `0 failed` tests)
  - Node `--test`: `126 passed`, `4 skipped`, `0 failed`
  - Python `unittest`: `50 passed`, `0 failed` (`OK`)
- `pnpm exec tsc --noEmit` (`apps/backend`, `apps/frontend`, `apps/orchestrator`): PASS
- `pnpm run docs:check`: PASS
- `node scripts/branding/brand-scan.cjs`: PASS
- `bash scripts/orchestration/run_process_verification.sh`: PASS
- `git diff --check`: PASS

## Safety & Delivery Boundaries

- Local implementation and verification only on `codex/on0i-native-harness-implementation-20261019` inside `/home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018`.
- Zero `git push`, zero public-tree refresh, zero Docker image push, zero production deployment, zero production DB mutation, zero paid external provider calls, and zero real-user messaging.

docs-reviewed: updated — stage outcome, root acceptance receipt, project index, and handoff updated for `content-factory-next-on0i`.
graph-reviewed: used — existing symbol boundaries and module ownership verified against plan and current worktree source.
