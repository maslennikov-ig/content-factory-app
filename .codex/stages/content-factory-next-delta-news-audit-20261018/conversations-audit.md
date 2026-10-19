# Native conversation navigation audit — 18 October 2026

Scope: the owner's question about creating and switching Content Factory chats
and using Mastra natively. Read-only source and current official documentation;
no authenticated production browser acceptance, app change or paid execution.

## Current implementation

- `apps/frontend/src/components/agents/agent.threads.tsx`: `ThreadSwitcher`
  opens the personal thread list by pressing the current conversation title
  with a chevron. `iconOnly` plus action is labelled “Новый разговор” in Russian
  through `aria-label`/`title`, without visible action text. Rename/delete are
  available inside the list popover. This is a discoverability finding from
  source and the owner's report, not a claim of a reproduced click failure.
- `agent.screen.tsx`: `startNew` creates a fresh local session and navigates
  to `/agents/new` in the full assistant. A selected conversation navigates to
  `/agents/:id`; the confirmed first-message ID replaces the URL. The shared
  contextual host uses the same screen and remembers conversation selection.
- `agent-threads.service.ts`: `threadForMessage` creates a native memory
  thread, `list` uses `listThreads`, `history` uses `recall` and suspended-run
  recovery, rename/delete use native memory methods. Workspace/artifact state
  is in validated native thread metadata. Ownership is checked against the
  existing organization-plus-user `resourceId`.
- `agent.controller.ts`: the existing authenticated `/agent/threads` endpoint
  family serves list/history/rename/delete/workspace, and chat passes
  `memory: { thread: threadId, resource: resourceId }` to `handleChatStream`.
- The list always requests page0/perPage100 and discards any native pagination
  metadata; history recalls perPage200 and exposes no continuation page. Thus
  older entries can remain stored while unreachable through this UI. This is
  a static scale limitation, not evidence that this owner has100+ chats.
- `conductor.memory.ts`: `lastMessages:10` is the model input window, distinct
  from the200-message UI hydration. Working memory contains personal preferences
  at resource scope; semantic/observational recall is off. `generateTitle:false`
  is intentional because its background model call bypasses turn admission.

## Native capability evidence

Installed packages verified from resolved package manifests in this checkout:
`@mastra/core1.71.0`, `@mastra/memory1.32.1`, `@mastra/pg1.27.1`,
`@mastra/ai-sdk1.10.5`. No upgrade is required for the existing native methods.
The source's version-specific calls were inspected alongside current official
docs via Context7 (`/mastra-ai/mastra`) and the public documentation pages:

- [Message history, threads/resources and querying](https://mastra.ai/docs/memory/message-history).
- [Native thread listing and pagination](https://mastra.ai/reference/memory/listThreads).

Mastra supplies persisted conversation identifiers, memory and query APIs.
Studio manages identifiers in its own interface; the product frontend must
expose its own creation/selection controls and send the selected native thread.
Memory does not replace application ownership/access checks. Do not adopt other
new documentation-only APIs without verifying the installed package contract.

## Planned outcome and acceptance

Plan task `.9` owns visible new-chat/list navigation and complete paged human
history, using the current native memory/store and product endpoint family.
Task `.7` separately owns the model's on-demand history/material access. Final
`.6` accepts their composition. Reuse existing shared/contextual chat components;
do not embed Studio, create another transcript store or silently enable paid
title/memory processing. Preserve private-resource ownership, drafts, deep
links, native pending cards, execution receipts and artifact continuity.

Source inspection does not prove actual navigation survives every pending run,
draft, reload or large history; those are explicit implementation acceptance
cases. The planning task leaves existing user conversations and original source
code unchanged.

graph-reviewed: focused local AgentThreadsService/AgentScreen queries for
orientation, exact current files inspected; no graph refresh or external graph
model call.
