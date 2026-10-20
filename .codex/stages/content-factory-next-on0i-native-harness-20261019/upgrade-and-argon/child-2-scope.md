## Goal
Complete Task2 of the same native Mastra epic with actual product consumers. Gemini Argon is executor.

## Scope and Integration
**Boundary:** research/intake/writing and persisted provenance. Independent of
HTTP/UI; can be implemented once Task1's identity contract is settled.
**Files:** `chat/capabilities/catalogue/research.capabilities.ts`,
`piece.capabilities.ts`, `material-read.capabilities.ts`, `mastra.adapter.ts`,
`capability.types.ts`, `chat/conductor/conversation-history.ts`,
`conductor.memory.ts`, `conductor.instructions.ts`, relevant existing
content-intelligence intake/piece/derivation services; no duplicate repositories.
**Dependencies:** Task1 for context contract, or coordinate the unchanged
resource schema when implementation can remain independent.

Prefer native getMessages, observation group/record navigation and actual
attachment recall; migrate redundant history/image handling only with equivalent
privacy and content behavior. Verify PostgreSQL atomic working-memory merge,
empty extraction preservation and observation/reflection generation races.
Implement `toModelOutput` and read-on-demand against real native Memory/Workspace
and saved research revisions. Model chooses searches and writing order; writing
can consume already-known research without new interpretation/retrieval by
construction. Integrate native history filtering/compaction/working memory;
configure memory auxiliary calls through the same metered adapter. A schema-valid
partial finding is not a quality certificate and is not a mandatory question.
**Acceptance:** all evidence retrievable, original input exact, no hidden
semantic top-N, no repeated completed research for an unchanged task, retained
sources do not flood each model call, saved draft/adaptation usable on screens.
**Focused checks:** `agent.model-intake-composition`, `agent.content-material-echo`,
`agent.model-autonomy`, `agent-native-history`, source/research fixture contracts;
include giant tool output, exact citations and selective full-source reads.

## Acceptance Criteria
all evidence retrievable, original input exact, no hidden
semantic top-N, no repeated completed research for an unchanged task, retained
sources do not flood each model call, saved draft/adaptation usable on screens.

A1-A28 and full version/capability/recovery contract: docs/superpowers/plans/2026-10-19-native-mastra-harness.md. Stable upgrade and release delta are part of this epic; no new task tree.

## Boundaries
Local implementation/QA only in the new chat. No product implementation during preparation, no source push/image/deployment/production mutation/social action. Preserve identity, history, prior approvals, actual rights/quotas/receipts and supported MCP client protocol.
