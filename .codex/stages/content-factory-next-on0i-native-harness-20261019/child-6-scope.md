## Goal
Чаты и управление выполнением через нативные события Mastra. Complete product behavior, not API availability only.

## Scope and Integration
**Boundary:** user-visible streaming state, navigation and controls.
**Files:** `apps/frontend/src/components/agents/agent.screen.tsx`,
`agent.threads.tsx`, actual chat stream/approval/artifact components in that
folder, `new-layout/assistant-menu.tsx`, existing fetch/SWR adapters and backend
transport mapping. Read component inventory/authoring rules before UI edits.
**Dependencies:** Tasks1,3,4; keep compatible event mapping while other tasks
settle. Preserve the already-implemented sidebar change.

Standard sidebar plus creates a chat; disclosure shows paginated chats. No
permanent archive above messages. Native state drives running/waiting/paused/
failed/stopped, tool approvals, task/goal progress and saved artifacts. Navigation
keeps drafts and reattaches to a running chat without resubmitting its message.
Expose native queue/follow-up/steer/stop through clear ordinary interactions;
retain accessible mobile controls. Use existing UI primitives and Mastra SDK
adapters; adopt another documented UI library only if a concrete gap warrants it.
**Acceptance:** two browser tabs/chats and reload/reconnect preserve state,
controlled Stop cancels, pending approvals show actual content, partial/failed
runs show a useful retained result;0 overflow or conversation-height regression.
**Focused checks:** `assistant-sidebar.chats`, current AgentScreen behavior,
representative browser flows desktop/mobile and pending/failure/reconnect states.

## Acceptance Criteria
two browser tabs/chats and reload/reconnect preserve state,
controlled Stop cancels, pending approvals show actual content, partial/failed
runs show a useful retained result;0 overflow or conversation-height regression.

Full contract and criteria: docs/superpowers/plans/2026-10-19-native-mastra-harness.md, Tasks6 and A1-A22.

## Boundaries
Local implementation/testing in the new chat only. No push, image, deployment, production mutation or real social action. Preserve parent identity/history, old pending calls and domain safety.
