# In-chat questions and reliable agent continuation

**Date:** 24 October 2026, Europe/Moscow.

**Goal:** answer the product's existing manual questions in the agent conversation, with the original choices, custom text and «Решите за меня», then continue to a saved result shown beside the chat. Repair the failures found in the owner's 23 October conversation as one epic.

**Authority:** planning and task creation now; implementation and acceptance are local-only. No deploy, push, publication, production mutation, credential changes or paid provider calls are included. A local real-provider run still needs an explicit spend allowance.

**Tracker:** epic `content-factory-next-b5lo` / [HONEY-5961](https://linear.app/elwork/issue/HONEY-5961). Tasks 1–6 are `content-factory-next-b5lo.1`–`.6`, corresponding to HONEY-5960, HONEY-5959, HONEY-5958, HONEY-5957, HONEY-5956 and HONEY-5955. Linear is canonical, Beads is the agent interface. This document defines design and acceptance, not a second status ledger.

## Evidence and limits

Read-only investigation on 24 October used the owner-supplied conversation and screenshot. Raw conversation, snapshots, bounded logs and deployed source excerpts are private at `~/.local/state/content-factory-next/chat-questions-20261024/`; do not commit them or copy user/account identifiers into fixtures or public reports. Build a sanitized equivalent for committed regressions. The private manifest binds the originals by SHA-256.

- Production source at inspection: public `e819113f113ea3c0c65ce00b76cafd2ccd1a8ac1`, built 23 October at 12:57:57 UTC. Local planning checkout: `e326aab7a7940814bc63f6dc229b018e53c759ac`. They differ; reconcile the current execution checkout before implementation. The deployed material reader matches local source; conductor, stream adapter and cards differ. The deployed conductor still contains the `onSessionCreated` built-in allow policy described below.
- The saved conversation has four messages, four successful `research_search` results and twenty `piece_read` invocations, including five `MATERIAL_PASSAGE_NOT_FOUND` results and two calls without a saved result. There is no recorded `piece_create`/`piece_adapt` call or saved result card. This describes this conversation, not a claim that no unrelated workspace drafts exist.
- Five literal searches missed their requested string. The reader correctly reports `canReviseInput: true`; a missing literal does not mean the source is unavailable. Some subsequent range reads succeeded. Repair agent recovery and presentation, without pretending that missing text was found.
- The bounded server log contains six `AGENT_STREAM_ERROR` entries for the run: `finishReason "other" without producing any output`. Their exact provider/step/retry relationship needs local reproduction; six entries alone do not prove six billable calls or one retry loop.
- At 23 October 17:07:58 UTC (20:07:58 Moscow), backend heap exhaustion at about 509 MiB interrupted `/api/agent/chat`; related history/allowance requests failed while the backend restarted. The native stack includes JSON parsing. This proves OOM, not which object retained the memory. The container being healthy later does not disprove a PM2 child restart.
- After restart, the native run was persisted as `suspended` at 17:08:59 UTC, waiting for approval of `skill({ name: 'content' })`. Two following read calls carry `requireApproval: true`. At inspection the product metadata says execution `running` and native run `waiting`. Determine the correct externally visible state from actual runnable work and parked gates; do not label every valid suspension as a hang.
- The screenshot shows «Нужно ваше „да“ — Сделать это?» and «Отменить можно потом на экране продукта.» without a named operation. Current `ApprovalCard` uses that generic fallback when both tool title and reason are absent. The saved internal-skill approval is consistent with this screenshot; no historical DOM capture proves its exact call identity.
- Native execution snapshots serialize to approximately 6.95M and 4.72M characters; one saved research result serializes to about 155k characters. These identify profiling targets, not an established OOM cause. Recorded token usage is cumulative across calls, not a single prompt size or a bill.

Graph-reviewed: the local Graphify map was used for `ApprovalCard` callers; its baseline is older and relevant files changed. Findings above were checked against actual local/deployed source. No graph refresh or external extraction was performed.

## Product and architecture decisions

1. The conversation is the primary place to answer. The right panel displays the evolving saved artifact and may retain optional manual editing; normal agent work must not require opening a manual form or copying an answer between surfaces. Standalone manual workflows remain functional.
2. Reuse Mastra tool suspension/resumption, the existing pending-card identity checks, and the existing domain services. Do not create a separate question queue, chat runtime or parallel answer store. Use built-in `ask_user` for free clarification; domain-owned manual questions use the existing tool `suspendSchema`/`resumeSchema` mechanism so answers remain bound to authoritative question IDs and revisions.
3. Preserve the full manual question wording, all option labels, order, stable IDs, recommendations and custom-answer semantics. Do not route them through model paraphrasing or the current `piece.open` preview limits (four options/300 characters). Preview budgets must not truncate the interactive payload. Multiple selection is preserved only where the source question permits it; native `ask_user.selectionMode` must not silently become single-select.
4. Prefer one active question at a time with a visible count and retained answers, reusing existing `QuestionCard`, `InterviewCard` and manual question controls. A source workflow's grouped interview can remain grouped when needed to preserve its atomic submit semantics. Every active question offers its applicable choices, «Свой ответ» and «Решите за меня»; grouped interviews may also offer «Решите всё за меня».
5. Persist a human answer before advancing. Apply the complete answer batch through the existing domain service once; do not regenerate/rebill the core after every keystroke or every answer. A double click, reload or reconnect must not apply the same batch twice. Leaving a question unanswered is not implicit delegation: only an explicit per-question/all-questions delegation may map to the legacy omitted-answer behavior.
6. Delegation is an editorial choice, not consent to publication, paid actions beyond allowance or invented personal experience. Record the model-origin choice; if only the author knows a fact, leave the gap visible or use a neutral formulation. Existing domain permission and quota checks remain authoritative.
7. After successful resume, continue the original goal automatically, update the result panel from saved data and verify the requested result before reporting success. No extra «Продолжить?» between already requested ordinary steps. If a required step fails, retain artifacts and explain the actual remaining work.
8. Ordinary questions and consent are different surfaces. A consent card must name the action, affected object/destination and consequence, with an accurate undo statement. Missing metadata is a recoverable display/contract error, never an enabled generic «Сделать это?» button. Internal safe reads and bundled-skill loading should not ask the user to operate the runtime. Preserve explicit deny/ask policies and genuine domain approvals; no blanket allow-all.

Official references, checked 24 October: [askUserTool](https://mastra.ai/reference/tools/ask-user-tool), [Session](https://mastra.ai/reference/agent-controller/session). Mastra supplies the native pause/resume contract; the product supplies its UI and domain answer mapping. Session permission rules and live pending gates need deliberate restoration across process recreation. Check installed `@mastra/core` declarations and source before selecting the exact integration API; a latest-docs example alone is not version proof.

Read before UI changes: `PRODUCT.md`, `DESIGN.md`, `docs/design/component-inventory.md`, `docs/design/component-authoring-rules.md`, and `docs/product/chat-first-workspace-spec.md`. Reuse shared controls and `cf` tokens. Update the inventory only for actual component/behavior changes.

## Tasks and acceptance ownership

### Task 1 — Native manual questions in the conversation

**Boundary:** complete domain-question → card → durable human answer → same native run resume path, including its UI. No new workflow engine or model-driven rewording of manual choices.

**Files:** `chat/capabilities/catalogue/piece.capabilities.ts`, `catalogue/adaptation.capabilities.ts`, `capability.types.ts`, `mastra.adapter.ts`, `question-card.ts`, `agent-parts.contract.ts`, `chat/conductor/agent-chat.request.ts`, `agent-threads.service.ts` under `libraries/nestjs-libraries/src/`; `apps/frontend/src/components/agents/agent.contract.ts`, `agent.cards.tsx`, `agent.interview-card.tsx`, `agent.conversation.tsx`; shared `content-intelligence/intake/questions.card.tsx` and actual manual question producers.

**Implementation:** inventory creation, existing-piece questions, added-material/rebuild and adaptation paths; expose authoritative pending questions through native suspension with object/revision/question/card identity. Keep original option data separate from compact model summaries. Map choice/custom/delegated answers to the same domain request as manual mode. Retain partial answers across reload; reject a stale or foreign card without losing typed text. Reconcile a manual edit before accepting an older card. Permit cancellation/Stop without implicit answers.

**Acceptance:** all inventoried manual question paths are answerable without right-panel actions; >4 options and long wording survive exactly; single/multi-select semantics, custom answers and explicit delegation persist with correct provenance; no fabricated personal facts; one domain application and one continuation per completed batch; reload, duplicate submit, second tab, revision change, foreign user and Stop are covered. Agent question instructions no longer prohibit the agreed manual-question flow.

**Proof:** extend `tests/agent-native-ui.test.cjs`, `tests/agent-native-conversation-flow.test.cjs`, relevant piece/question fixtures, mirror guard and native cold-resume proof. Browser acceptance: Russian/English, keyboard, 390px/desktop, pending/sending/answered/stale/failure states, no horizontal overflow or nested panels. Existing fixtures alone are insufficient until they exercise this new domain flow.

### Task 2 — Correct approvals and safe reads after recovery

**Boundary:** native permission policy, approval metadata and consent UI; a distinct authorization boundary.

**Files:** `chat/conductor/conductor.agent.ts`, `conductor.autonomy.ts`, `native-session-stream.ts`, `agent-threads.service.ts`; `chat/capabilities/approval-summary.ts`, `mastra.adapter.ts`; `libraries/nestjs-libraries/src/chat/mastra.service.ts`; frontend `agent.contract.ts`, `agent.cards.tsx`, `agent.copy.ts`.

**Implementation:** reproduce fresh-session versus process-recreated permission resolution for `skill(content)` and `piece_read`, including a mixed tool batch after durable recovery. Trace why saved calls acquired approval despite safe-read policy; restore effective policy through supported Mastra APIs without overwriting explicit user restrictions. Preserve the true pending gate's call/run identity. Produce full approval labels/reasons both live and from history; replace generic reversible advice with the actual operation's consequences.

**Acceptance:** bundled skill loading and authorized material reads require no surprise approval before/after restart; delete/schedule/publish/connect and mixed read/write tools still respect existing consent rules; no generic actionable approval card in fresh stream, reload or second-and-later parallel gates. Consent remains bound to exact object/content, and expired/unknown metadata cannot authorize execution.

**Proof:** `tests/agent-native-read-permission.test.cjs`, `agent-native-session-cold.test.cjs`, `agent-native-session-http.test.cjs`, `agent-native-conversation-flow.test.cjs`, and the second-approval-card fixture. Add an actual process-recreated native case with these real tool names; current cold fixture success does not prove this incident fixed.

### Task 3 — Recoverable research reads and a finite research path

**Boundary:** retained-source read contract and conductor research decisions; preserve evidence and access controls.

**Files:** `chat/capabilities/catalogue/material-read.capabilities.ts`, `research.capabilities.ts`, `research-evidence.ts`, `piece.capabilities.ts`; `chat/conductor/conductor.instructions.ts`, `conductor.skills.ts`, `conductor.execution.ts`; frontend `agent.contract.ts`, `agent.copy.ts`.

**Implementation:** reproduce the five literal misses against frozen retained sources; return a useful bounded fallback path (range/offset/revision) and avoid repeated guesses for the same missing literal. Distinguish a recoverable search miss from a terminal failure in the UI. Keep truly unavailable, stale and unauthorized material visible as failures. Reuse successful research snapshots and read ranges; stop redundant search/read cycles when evidence is sufficient, or explain the precise remaining gap within the actual budget.

**Acceptance:** the frozen post-cutoff request retains the 9–23 October 2026 window regardless of test date; old-post claims are input, not evidence; missing literal recovers to a valid range without claiming a match; original sources/revisions and requested coverage survive; successful read recovery does not leave a wall of terminal error cards. Missing evidence neither triggers endless search nor becomes invented confirmation. Bound repeated equivalent no-progress calls without blocking genuinely new evidence.

**Proof:** focused material-read/research tests and a deterministic native continuation using retained source contents. Assert exact facts/period/provenance and meaningful progress, not merely a successful tool return. The existing `content-factory-next-eqh5` remains related context for editorial quality, not silently closed or duplicated; its historical MiMo proposal is not authority to change today's model policy.

### Task 4 — Bound memory use in long native runs

**Boundary:** memory ownership, tool-result projection, snapshots and replay; separate resource/failure risk.

**Files to profile first:** `chat/capabilities/mastra.adapter.ts`, `catalogue/research.capabilities.ts`, `catalogue/research-evidence.ts`, `chat/conductor/agent-operation-receipts.ts`, `conversation-history.ts`, `conductor.agent.ts`, `native-run-observer.ts`, `native-session-stream.ts`, and the owning Mastra service/storage adapter. `var/docker/ecosystem.config.js` provides the existing limit, not an invitation to raise production limits.

**Implementation:** construct a sanitized local corpus with the observed 50-source/large-result/long-history shape; measure heap, serialized snapshots, prompt projections and replay retention under the existing 512 MiB backend heap. Locate the actual allocation/retention path, including JSON parsing and any result copies in messages, receipts and native snapshots. Fix the owning product projection/lifetime, using supported native facilities; preserve full authorized source retrieval and idempotency receipts. A dependency change, if needed, must be grounded in a reproduced SDK defect and scoped compatibility checks.

**Acceptance:** the representative long run plus history/reconnect completes without OOM at the existing heap limit; measurements show bounded steady-state retention and a documented peak with headroom. No silent source truncation, missing tool result, removed receipt, alternate replay engine or hidden DB purge. Raising memory alone is not acceptance. Allocation root cause and before/after measurements are recorded; the current incident does not yet establish that cause.

**Proof:** `tests/agent-output-budgets.test.cjs`, receipt/history regressions and a subprocess probe at `--max-old-space-size=512` with native storage and frozen provider streams. Keep stress data synthetic/sanitized and calls free of external providers.

### Task 5 — Empty model streams, bounded retries and durable recovery

**Boundary:** provider-stream error classification and native execution lifecycle, not editorial questions.

**Files:** `libraries/nestjs-libraries/src/openai/ai.native-retries.ts`; `chat/conductor/conductor.agent.ts`, `conductor.execution.ts`, `agent-turn-lifecycle.ts`, `native-session-stream.ts`, `native-run-observer.ts`, `agent-run-claims.ts`; owning Mastra service; frontend `agent.conversation.tsx`, `agent.contract.ts`, `agent.copy.ts`.

**Implementation:** replay `finishReason: other` with no text/tool output; trace the six recorded errors to retry layers and enforce one native retry/fallback owner and total task budget. Preserve Luna primary and current included Flex-only fallback, custom providers and explicitly disabled fallback. Recover from process loss using durable state and committed receipts; distinguish active work, waiting for an answer, terminal failure, stopped and uncertain outcome. Rebuild only the supported live session state. Do not resume production or send a fresh paid request during diagnosis.

**Acceptance:** finite attempt count under deterministic empty streams; no success without output and no lost intermediate results; uncertain writes/possibly billed calls are not replayed blindly. Stop/reload/reconnect and cold restart settle visibly, keep answers and artifacts, and cannot execute an accepted mutation twice. A valid waiting question stays actionable rather than becoming a spinner; an unrecoverable run presents one clear next action.

**Proof:** `tests/agent-native-retry-routing.test.cjs`, `agent-native-model-availability.test.cjs`, `agent-native-session-cold.test.cjs`, `agent-native-stop-settlement.test.cjs`, `agent-operation-receipts.test.cjs`, and native HTTP/observe probes. Assert calls, saved state and client-visible terminal state, not log counts alone.

### Task 6 — Continue to the saved result and update the right panel

**Boundary:** conductor goal completion and chat/artifact consumer integration. Depends on Tasks 1–5; includes final local acceptance of their combined behavior.

**Files:** `chat/conductor/conductor.instructions.ts`, `conductor.autonomy.ts`, `agent-threads.service.ts`; `chat/capabilities/catalogue/piece.capabilities.ts`, `adaptation.capabilities.ts`; frontend `agent.conversation.tsx`, `agent.artifact-host.tsx`, `agent.workspace-state.ts`, `agent.workspace-shell.tsx` and shared artifact refresh paths.

**Implementation:** retain the original requested research → piece → Telegram draft goal through questions and failure recovery. Continue only unfinished authorized steps; read and assess the saved final text before claiming completion. Update/invalidate the same saved artifact revision in the right panel after each successful domain application, preserve optional manual edits and identify stale proposals. Replace instructions that send the person to answer in the piece panel. Preserve useful partial results with an explicit remaining gap when the goal cannot be fulfilled.

**Acceptance:** one local end-to-end conversation takes the sanitized original request, researches the fixed period, asks any material manual questions in chat, records choice/custom/delegated answers, creates one piece and one appropriate Telegram draft, then shows their saved content on the right. Verify requested topic coverage, dates, source provenance and actual channel rules. Reload during a question, network loss after answer and backend restart must preserve original data and avoid duplicate work. No social publication, scheduled post or production write.

**Final proof:** root-owned browser run against the local application and native PostgreSQL/Redis flow with frozen provider responses, plus the union of affected focused suites once. Deterministic replay proves engineering flow; a future authorized real-model run and owner's editorial acceptance are separate. Do not label fixture quality as live provider quality. No full repository build/suite solely because this is an epic; broaden only for a concrete shared regression or explicit release request. Update `docs/product/chat-first-workspace-spec.md`, component inventory and handoff with the actual delivered behavior and remaining limits.

## Execution and verification

- Suggested order: Tasks 2, 4 and 5 establish safe execution/recovery; Task 3 repairs the research path; Task 1 completes native manual questions; Task 6 integrates continuation and saved-result UI. Tasks 1–5 can be developed independently where file ownership permits, but no parallel agents are required by this plan.
- Use an isolated execution checkout from the agreed current integration baseline. Preserve the dirty planning checkout and unrelated video work. First compare the relevant deployed-source excerpts with the implementation tree; reproduce before claiming a fix was already present.
- Use `.nvmrc` Node 22.23.2 and pnpm 10.6.1. Focused command pattern: `pnpm exec jest --runInBand --runTestsByPath <affected test files>`; required native PG/Redis prerequisites must be present, not silently skipped. A provider mock inside an actual native runtime is distinct from a mocked runtime.
- Final local checks: affected suites, relevant type checks, targeted browser/restart/memory probes and `git diff --check`. Record the specific proof for each criterion; reuse unchanged matching results. Planning itself requires only document/graph/task-creation checks.
- No production replay, broad database export, cleanup, deployment, provider/key changes or paid calls. Retain the original incident evidence. All executable regression inputs are sanitized and kept separate from private exports.

## Scope ledger

| Required outcome | Owner |
| --- | --- |
| Original manual wording/options, custom text, explicit delegation, durable answers | Task 1 |
| Native pause/resume, stale-card rejection, no duplicate answer application | Tasks 1, 5 |
| Clear operation-specific confirmations; no unexpected internal-read approval | Task 2 |
| Literal-miss recovery, honest fixed period/evidence, finite research | Task 3 |
| No OOM at existing heap limit, preserved full sources and receipts | Task 4 |
| Finite empty-stream recovery, correct Stop/wait/failure state | Task 5 |
| Original goal completed once, saved result updated beside chat | Task 6 |
| Combined local browser/native acceptance, no deploy or publication | Task 6 |
| Real-provider quality/cost acceptance | Explicit future paid-call authority; never implied by fixture PASS |
