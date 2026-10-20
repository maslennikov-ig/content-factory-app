## Goal
Implement this complete cohesive task of the existing native Mastra epic. Gemini Argon is executor; local implementation only, no deploy.

### Task1 — Stable SDK upgrade and native isolated sessions (`on0i.1`)

**Boundary:** Nest/SDK public contract and identity isolation. Separate because
all later runtime work consumes its session and context contract.
**Files:** root `package.json` / `pnpm-lock.yaml`, actual used Mastra CLI/server
adapters, `libraries/nestjs-libraries/src/chat/mastra.service.ts`,
`chat/conductor/conductor.agent.ts`, `conductor.context.ts`,
`agent-threads.service.ts`, `apps/backend/src/api/routes/agent.controller.ts`;
new small `chat/conductor/native-controller.ts` only if a facade is needed.
**Consumes/produces:** original message + server context -> native Session/run,
stream and thread binding; preserve existing HTTP client compatibility.
**Dependencies:** none; use the existing provider admission until Task5 adopts
selection. Do not wait for a new provider to prove native control.

First select/pin the latest stable compatible bundle (reviewed core1.78.0),
review the full1.71-to-target changelog and adapt used imports/contracts. Align
all actual server adapters; custom Nest does not get scopes compatibility merely
by updating core. Migrate/read old native-history/pending-call fixtures on an
owned local PostgreSQL DB and record schema/API differences. Handle MCP major
protocol compatibility explicitly within this epic. Then prove
controller registration/durable composition, one host lifecycle and
per-chat scope with the real installed library and scripted model. Then wire
actual product send/thread/control entrances, ownership and native events.
Keep dynamic context/model resolution and existing usage admission. Use trusted
Agent scopes/authors; prevent conflicting bindings and wider scopes at resume.
Adopt createInitialThread:false and ensureId on actual send to avoid empty chats.
Use the target per-thread model switching signature. Reconstruct
Sessions from persisted owned threads; do not assume JS objects survive restart.
**Acceptance:** coherent stable bundle/build/types and pre-upgrade native data
fixtures pass; actual used server and MCP contracts are compatible; no scopes
injection or widening. Two users/two orgs/two simultaneous chats cannot mix state,
messages, model overrides or approvals; existing thread IDs and pending native
parts remain readable. Real product route uses Session, not a probe-only host.
**Focused checks:** existing `agent-conductor.*`, `agent-native-history`,
`agent-chats-pagination`, `agent-work-context`; add actual two-session/two-chat
API behavior to the existing native harness fixture infrastructure.

A1-A31 and the full consumer/recovery/compatibility contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Automatic retry/fallback and menu scope: .codex/stages/content-factory-next-on0i-native-harness-20261019/retry-fallback/reliability.md. Keep the same epic/task identities and dependency graph.
