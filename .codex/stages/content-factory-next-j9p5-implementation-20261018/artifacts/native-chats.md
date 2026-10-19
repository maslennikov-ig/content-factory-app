---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-j9p5-implementation-20261018/stage-manifest.json
stream_owner: native_chats
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: authenticated AI assistant
public_facade: native AgentThreadsService and shared AgentScreen
bounded_acceptance: native paging ownership, draft isolation, Stop and pre-start recovery
task_id: content-factory-next-j9p5.9
epic_id: content-factory-next-j9p5
stage_id: content-factory-next-j9p5-implementation-20261018
session_id: content-factory-next-j9p5
milestone: native-chats
milestone_status: accepted
agent_type: worker
subagent_model: gpt-6.1-sol
reasoning_effort: high
model_reasoning_rationale: isolated frontend/native paging implementation
repo: content-factory-next
branch: codex/j9p5-model-led-20261018
base_branch: codex/tgeq-manual-width-20261018
base_commit: 4305609a6
worktree: /home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018
parallel_group: native-chats
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared root worktree; no child branch or worktree. Root verified and stopped owned dev4219 PID85525 and failed browser runner95463; no foreign processes changed.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Component inventory, sixteen navigation locales and model-led assistant contract updated.

risk_tags:
  - ui
  - user-flow
  - tenancy
  - concurrency

affected_surfaces:
  - ui
  - backend
  - api
  - user-flow

invariants:
  - tenancy
  - state-transition
  - test-matrix

verification:
  - Native105thread/405message pagination and ACL: passed; rendered34 and pre-start3 checks: passed; root390dark/1440light and recovery browser: passed

changed_files:
  - apps/frontend/src/components/agents/agent.threads.tsx
  - apps/frontend/src/components/agents/agent.conversation.tsx
  - apps/frontend/src/components/agents/agent.composer.tsx
  - libraries/nestjs-libraries/src/chat/conductor/agent-threads.service.ts
  - apps/backend/src/api/routes/agent.controller.ts
  - docs/design/component-inventory.md
explicit_defers:
  - content-factory-next-j9p5.6 root integrated acceptance and separately authorized delivery remain pending
---

# Summary

# j9p5.9 — native personal chats delivery

Status: local implementation delivered for root integration/epic acceptance.
No commit, push, deploy, paid operation or production/customer data access.

## Changes and ownership

- `agent.threads.tsx`: visible localized Chats/New chat controls and current
  title; persistent wide full-host list, shared focus-trapping Dialog on
  narrow/contextual hosts; existing rename/delete/ConfirmButton retained.
  SWR Infinite loads native100-thread pages on explicit demand and deduplicates
  IDs. Thread links retain native href/new-tab behavior and disable speculative
  prefetching of100 detail routes. No partial-cache title search is advertised.
- `agent.chats.copy.ts`, `agent.copy.ts`: complete navigation/history chrome in
  all16 supported interface languages, with stable language-specific objects.
- `agent.screen.tsx`: visited sessions retain their own native SDK instance,
  transcript, pending cards and composer rather than remounting on each switch.
  Late first-thread identifiers, history and artifact events stay bound to the
  originating session. Current route only follows its own first-turn ID.
  Native thread context/artifact selection restores per session; intentional
  manual-page context is kept visible/removable and is distinguished from an
  unrelated conversation's selected artifact. New chat reopens an unsent local
  draft until its first message creates a native thread.
- `agent.composer.tsx`: only unsent text is stored in sessionStorage, scoped by
  organization, user and native thread (or the local unsent chat). It survives
  reload, is removed after send and moves to the confirmed native ID. Transcript
  and artifact data never enter a browser transcript store.
- `agent.conversation.tsx`: Previous messages loads native history pages on
  demand, prepends by ID and preserves reading position; reconciliation keeps
  already loaded older pages. A positioned scroll container contains existing
  absolutely positioned screen-reader labels (the200-message browser probe
  exposed a page-height leak without that containing block).
- `AgentThreadsService`: native list/recall page metadata and one reusable
  owner-authorized native read. Existing Postgres wiring, resource ownership,
  approvals, execution markers and existing metadata persistence stay in place.
- `docs/design/component-inventory.md` updated for changed/navigation and new
  review scene. Parent approved the narrow generic FetchProvider export and
  development-only route/scene extension used below.

## Service/controller contract

Types exported from `agent-threads.service.ts`:

```ts
type AgentPageOptions = { page?: number; perPage?: number };
type AgentPagination = {
  page: number; perPage: number; total: number; hasMore: boolean;
};
list(identity, options = {}): Promise<AgentThreadListV1 & { pagination: AgentPagination }>;
history(identity, threadId, options = {}): Promise<AgentThreadHistoryV1 & { pagination: AgentPagination }>;
readMessages(identity, threadId, options = {}): Promise<{
  thread: AgentThreadV1;
  messages: MastraDBMessage[];
  pagination: AgentPagination;
}>;
```

Controller owned by root: `GET /agent/threads?page=0&perPage=100` and
`GET /agent/threads/:id?page=0&perPage=200`. Existing response fields are retained.
Pages are zero based, perPage defaults/maxima100 threads and200 messages.
Negative/fractional/unsafe page numbers, false/zero/excess perPage refuse400.
`readMessages` verifies organization+user ownership before native recall;
foreign owner/workspace refuses403 and missing thread404. Each native DESC
window is returned chronologically. No `perPage:false`, vector/model call,
all-thread history dump, new database, schema migration or replacement runtime.

Root's model history tool should call `readMessages` and consume its native
bounded messages; registration/admission/model context are root ownership.
Installed native contracts inspected: Core1.71.0 / Memory1.32.1 / Pg1.27.1.
Official current memory/listThreads documentation was checked by root today.

## Verification completed by child

Use Node22.23.2 and pnpm10.6.1 (`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`).

- `pnpm exec jest tests/agent-chats-pagination.test.cjs --runInBand --coverage=false`
  PASS2: real installed Mastra Memory + InMemoryStore reaches105 owned threads
  and405 messages across all bounded pages, chronological ordering, total/
  hasMore, missing/foreign-user/foreign-organization/invalid-page rejection and
  zero model calls. Native memory/store contract, not live Postgres proof.
  The other test checks all16 chrome locales/19 required strings.
- `pnpm exec jest tests/agent-screen.start-draft.test.cjs --runInBand --coverage=false`
  PASS34: existing rendered screen/composer cases plus two native sessions with
  draft A/B, isolated late identifiers/artifacts, local New draft recovery,
  actor/thread-scoped reload and native direct-route/back-forward simulation.
- Earlier matching existing checks: `agent-doors` PASS39 (with screen30 at that
  point:69 total); `agent-screen.w2-walk`, `agent-opening-band`, and
  `agent-parts.mirror.guard` PASS. No broad suite/build run by this child.
- `git diff --check` PASS at delivery.

## Local browser fixture and evidence

Development-only existing stand: `/interface-review/agents`.
Real AgentScreen/ThreadSwitcher/AgentComposer/AI SDK, synthetic105-thread/
405-message API supplied directly to exported FetchProvider. Existing stand CSP
still prohibits HTTP API requests. Synthetic user/org IDs are distinct from all
product users; no model/provider/storage service is called.

Start/reuse:

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --dir apps/frontend exec next dev --webpack -p 4219
```

Running child-owned process: exec session49362; log
`/tmp/j9p5-chat-review-next.log`. Root may reuse it for final acceptance, then
stop that process. Webpack is required in this symlinked worktree: Turbopack
refuses the shared node_modules symlink outside its inferred filesystem root.
The two generated untracked apps/frontend AGENTS/CLAUDE files from next dev
were removed; no repository policy files were changed.

Example: `http://localhost:4219/interface-review/agents?locale=ru&theme=dark&viewport=390&state=default`.
Set the `i18next=ru` browser cookie before first load to match server/browser
language during hydration. States: default, empty, error, loading, long-content.
Toolbar toggles full/contextual host and a first-send synthetic refusal; delayed
SSE responses take2seconds. Second chat contains a restored synthetic approval
and opening it does not submit/approve it. Error recovery uses the common Retry
button after enabling synthetic recovery. Loading is bounded to2seconds.

`chats-browser/flow-result.json`, `browser-check.cjs`, `390-dark-flow.png`,
`1440-light-flow.png` record real browser checks: native405-message reachability,
draft A/B and local New recovery, delayed response isolation/return, keyboard
Escape/focus return and contextual host. Both representative theme/width cases
had pageerrors=[] and no horizontal/vertical page overflow. Their only POST was
one explicitly submitted synthetic message. Separate mobile smoke reached
chat105 through More chats and recorded0POST/model calls.

These fixtures do not prove live authorization/provider behavior or production
acceptance. Root owns one final acceptance including full-suite/build, shared
integration, any expanded browser matrix and tracker closeout.

graph-reviewed: supplied owner graph baseline dd67538d was orientation only;
exact edited files inspected in this worktree. No graph refresh/external backend.

## Root acceptance corrections

- Root Stop/history regression identified a real over-broad reconciliation:
  an unsaved streamed assistant ID was retained merely because the fresh
  snapshot omitted it. `agent.conversation.tsx` now preserves only previously
  confirmed IDs in an older prefix when the native latest page hasMore=true;
  legacy/full snapshots replace the current window exactly. This leaves Stop
  locked until a settled execution receipt and never resends work.
- Root's browser recovery probe exposed a real missing draft restore after a
  positive pre-start refusal. Conversation now restores the submitted text
  through the existing composer only when the transport supplies typed
  `isAgentRequestNotStarted` proof. The composer keeps any newer typed draft.
  Explicit Enter with unchanged text regenerates the same SDK user message
  with its prepared payload; an edited instruction replaces the refused user
  message before a new explicit send. Approval/question request failures do
  not restore an unrelated earlier instruction. Headerless/network failures
  remain uncertain and require existing reconciliation.
- `pnpm exec jest tests/agent-prestart-draft.test.cjs --runInBand --coverage=false`
  PASS3: restoration and one explicit retry/one SDK user message, no overwrite
  of a newer draft and safe replacement on edit, headerless failure still
  locked without regeneration. No broad check rerun by child.
- Root's `chats-browser/recovery-check.cjs` now awaits actual restored text,
  enabled composer and exactly one POST rather than sleeping700ms. Real browser
  `recovery-result.json` PASS:105th chat reachable; draft retained; no automatic
  retry; exactly two total synthetic sends after one explicit retry; no page
  errors or horizontal overflow; model calls0. `390-dark-recovery.png` saved;
  `recovery-error.log` empty. Root-owned dev4219 left running.
- Review fixture TS7018 corrected only by annotating `workspace(): AgentWorkspaceV1`.
  Product source/copy/contract and the review fixture are now frozen for root's
  integrated acceptance. No commits were created.

Root accepted subsequent Stop reconciliation and pre-start draft restore corrections. Focused pre-start3PASS; root browser main390dark/1440light and recovery105ththread/draft/explicitretry PASS. Full epic acceptance remains pending.

# Verification

The scoped observations above are accepted for integration. Root release acceptance is pending and no provider or production success is inferred from fixture checks.

# Risks / Follow-ups

Root owns the integrated acceptance and delivery boundary under content-factory-next-j9p5.6. Source rollback preserves native history, originals, consent and ledger records. Shared-root resources have been cleaned only where ownership was verified; no foreign runtime, graph, branch or data was changed.
