## Goal
Implement this complete cohesive task of the existing native Mastra epic. Gemini Argon is executor; local implementation only, no deploy.

### Task6 — Product UI consumes native chat/run controls (`on0i.6`)

**Boundary:** user-visible streaming state, navigation and controls.
**Files:** `apps/frontend/src/components/agents/agent.screen.tsx`,
`agent.threads.tsx`, actual chat stream/approval/artifact components in that
folder, `new-layout/assistant-menu.tsx`, existing fetch/SWR adapters and backend
transport mapping. Read component inventory/authoring rules before UI edits.
**Dependencies:** Tasks1,3,4; keep compatible event mapping while other tasks
settle. Preserve the already-implemented sidebar change.

Standard sidebar plus creates a chat; disclosure shows paginated chats. No
permanent archive above messages. Use native initial-history and tool-call-resumed parts (including resumed:true)
to reconcile history and clear a pending card before its later tool-result.
Do not manually replay completed runs or create empty threads on page entry.
Native state drives running/waiting/paused/
failed/stopped, tool approvals, task/goal progress and saved artifacts. Navigation
keeps drafts and reattaches to a running chat without resubmitting its message.
Expose native queue/follow-up/steer/stop through clear ordinary interactions;
Show understandable retry/model-switch/waiting state, preserve partial output
as incomplete and expose resume after a real blocker. Stop cancels delayed
retries; duplicate attempts do not create extra user turns (A30/A31).
Retain accessible mobile controls. Use existing UI primitives and Mastra SDK
adapters; adopt another documented UI library only if a concrete gap warrants it.
**Acceptance:** two browser tabs/chats and reload/reconnect preserve state,
controlled Stop cancels, pending approvals show actual content, partial/failed
runs show a useful retained result;0 overflow or conversation-height regression.
**Focused checks:** `assistant-sidebar.chats`, current AgentScreen behavior,
representative browser flows desktop/mobile and pending/failure/reconnect states.

A1-A31 and the full consumer/recovery/compatibility contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Automatic retry/fallback and menu scope: .codex/stages/content-factory-next-on0i-native-harness-20261019/retry-fallback/reliability.md. Keep the same epic/task identities and dependency graph.
