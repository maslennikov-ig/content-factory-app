## Goal
Нативный AgentController и изолированные сессии в продукте. Complete product behavior, not API availability only.

## Scope and Integration
**Boundary:** Nest/SDK public contract and identity isolation. Separate because
all later runtime work consumes its session and context contract.
**Files:** `libraries/nestjs-libraries/src/chat/mastra.service.ts`,
`chat/conductor/conductor.agent.ts`, `conductor.context.ts`,
`agent-threads.service.ts`, `apps/backend/src/api/routes/agent.controller.ts`;
new small `chat/conductor/native-controller.ts` only if a facade is needed.
**Consumes/produces:** original message + server context -> native Session/run,
stream and thread binding; preserve existing HTTP client compatibility.
**Dependencies:** none; use the existing provider admission until Task5 adopts
selection. Do not wait for a new provider to prove native control.

Prove controller registration/durable composition, one host lifecycle and
per-chat scope with the real installed library and scripted model. Then wire
actual product send/thread/control entrances, ownership and native events.
Keep dynamic context/model resolution and existing usage admission. Reconstruct
Sessions from persisted owned threads; do not assume JS objects survive restart.
**Acceptance:** two users/two orgs/two simultaneous chats cannot mix state,
messages, model overrides or approvals; existing thread IDs and pending native
parts remain readable. Real product route uses Session, not a probe-only host.
**Focused checks:** existing `agent-conductor.*`, `agent-native-history`,
`agent-chats-pagination`, `agent-work-context`; add actual two-session/two-chat
API behavior to the existing native harness fixture infrastructure.

## Acceptance Criteria
two users/two orgs/two simultaneous chats cannot mix state,
messages, model overrides or approvals; existing thread IDs and pending native
parts remain readable. Real product route uses Session, not a probe-only host.

Full contract and criteria: docs/superpowers/plans/2026-10-19-native-mastra-harness.md, Tasks1 and A1-A22.

## Boundaries
Local implementation/testing in the new chat only. No push, image, deployment, production mutation or real social action. Preserve parent identity/history, old pending calls and domain safety.
