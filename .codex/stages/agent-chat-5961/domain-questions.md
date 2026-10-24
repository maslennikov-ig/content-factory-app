# HONEY-5960 — domain manual questions

## Delivery

Native chat tools now suspend on the exact saved manual questions using the existing Mastra tool suspend/resume contract. The native checkpoint owns partial answers; there is no additional answer queue or answer database.

Inventory covered:

- `piece.create`, including facts-card continuation and nested original/reused research creation;
- `piece.create.from-research`;
- `piece.answer` for existing saved questions (chat opens authoritative questions and ignores model-provided answer arguments; MCP retains its manual body contract);
- `piece.core.rebuild` after added material;
- `piece.adapt` channel interview;
- saved optional adaptation material questions, through the existing `materialQuestions` → `rebuildCore` → `adapt` domain flow. Explicit all-question delegation dismisses optional questions without a new write generation.

`domain-question-contract.ts` supplies the pure contract, exact option mapping and complete-batch validation. `domain-questions.ts` reads authoritative owned piece state and resumes questions. `catalogue/piece-domain-questions.ts` maps completed human batches into the same service request used by the manual form.

## Wire contract

`AgentDomainQuestionPayload` in the backend/frontend mirror:

```ts
{
  kind: 'domain-questions';
  batchId: string;
  question: string;
  source: { kind: 'piece' | 'adaptation'; pieceId: string; channelId?: string; revision: string };
  questions: Array<{
    key: string; question: string;
    options?: Array<{ id: string; label: string; recommended?: boolean }>;
    ownOption?: string; suggested?: string | null; why?: string;
    selectionMode: 'single' | 'multiple'; canDecideForPerson: true;
  }>;
  answers: Array<{ key: string; mode: 'choice' | 'custom' | 'confirmed' | 'delegate'; text?: string; optionIds?: string[] }>;
  activeKey: string;
  canDecideForPerson: true;
  cardId?: string;
}
```

One answer resumes with `{answers:[{key,mode,text?,optionIds?}]}`. An explicit `{decideForPerson:true}` delegates all remaining questions. Unknown keys, duplicate keys, re-answering accepted keys, empty batches, invalid option IDs, multi-selection on single-select questions and the own-option action label as a factual answer are rejected. Human custom text remains verbatim. Choice text is derived from the stored exact option IDs, confirmation from the stored suggestion. Omission is never delegation.

`batchId` stays constant within a batch; the existing native `cardId` changes when retained answers/active question change. Existing Redis marks already include card identity, so a subsequent suspension of the same tool call remains actionable. Native operation receipts retain their existing per-resume fingerprint and uncertain-write rails.

The server-only continuation/result, original references and consent metadata stay in the native checkpoint and are stripped from card/history/model serialization. Preview budgets do not constrain the interactive question payload. Existing manual question producers currently default to single selection; an explicit producer `selectionMode:'multiple'` is preserved.

Root ingress calls `assertDomainQuestionCurrent(ctx,payload)` before consuming the pending answer. Changed source content/questions/channel material state returns HTTP409 `AGENT_QUESTION_STALE`. The capability checks again before applying the batch. Frontend draft retention and recovery action are owned by the UI/root integration stream.

## Verification

Node22.23.2, pnpm10.6.1, local-only, no external model/search/provider call.

- `pnpm exec jest --runInBand --runTestsByPath tests/agent-domain-questions.test.cjs tests/agent-domain-questions-native.test.cjs`: **13 passed**. Includes creation, reused research, existing questions, rebuild, adaptation interview and optional material batch paths; full wording/seven choices/custom/confirmed/delegated answers; stale source revision; explicit read permission restrictions.
- `pnpm exec jest --runInBand --runTestsByPath tests/agent-capabilities.adapters.test.cjs tests/agent-capabilities.w2-fixes.test.cjs tests/agent-domain-questions.test.cjs`: **70 passed** before the four added inventory cases. The added cases passed in the 13-test set above. Existing adapter fixtures were updated for the new exact native suspension.
- `tests/helpers/agent-domain-questions-native.probe.cjs`: actual installed Mastra1.78 native HTTP flow plus PostgreSQL checkpoints and Redis claims. First of two human answers persisted, same tool call/new card identity proved, old first-card submit rejected409, process killed with SIGKILL, new process recovered the partial answer and applied the final complete batch once. Report: `nativePartialSaved=true`, `sameToolCallNewCard=true`, `processRecreated=true`, `staleDuplicateRejected=true`, `created=1`, `applied=1`, `settled=true`.
- Earlier focused unchanged card/mirror/title tests: 56 passed (`agent-domain-questions`, `agent-piece-explicit-title`, `agent-parts.mirror.guard`, `agent-screen.cards-adaptation`). Root owns final combined acceptance against final shared edits.
- Focused backend TypeScript semantic diagnostics: **0** across the seven owning question/helper/capability files using backend tsconfig options, without emitting/building. Explicit wrapper output generics preserve typed capability summaries.
- Latest domain/mirror check: **48 passed**. Also covers actual SDK plain-record `requireApproval` context, preserving explicit native read ask/deny rules.

The native recovery proof substitutes only its external model and domain service; it exercises the real native runtime/storage/controller. The root-owned full real-domain/browser fixture is separate and remains required for combined local acceptance. No full build/suite, real-provider quality claim, deployment, push or publication is part of this stream.

Graph-reviewed: owner graph `/home/me/code/content-factory-next/graphify-out/graph.json`, baseline `dd67538d`, used as read-only orientation. Relevant source was confirmed in this execution worktree. No graph refresh/external extraction.

## Integration acceptance and cleanup

Root accepted this child implementation stream for integration; final combined local acceptance remains root-owned. The shared execution worktree and its edits are retained for integration and review. No worktree/branch cleanup, global commit or deletion of other owners' artifacts was performed. The native subprocess fixture removes only its own temporary directory and test-created PostgreSQL schema/Redis namespace on successful completion.

Root's follow-up assigned the obsolete same-request tests and then the bounded native-agent/catalogue fixture updates. Their updated assertions prove that native `piece.answer` may open the exact pending questions while model answer/delegation arguments do not apply, and retain the guard for a declaration without `nativeDomainQuestions`. The older paid-permit probe now emits saved pieces without open questions, isolating its original permit-settlement intent. The registry explicitly distinguishes model-owned research fact application from native suspension for authoritative manual questions after from-research creation. The rebuild fixture supplies its authoritative no-question detail. Invalid/unreadable approval metadata now expects the root's fail-closed `null`, preserving the new Task2 display contract.

Follow-up verification: `agent-capabilities.hooks.test.cjs` and `agent-piece-explicit-title.test.cjs` **40 passed**; focused `agent-capabilities.registry.guard.test.cjs` **147 passed** after those fixture updates. `git diff --check` passed. Root owns the final combined focused set against all streams' final edits.

Root acceptance of delivery: backend implementation + bounded fixture repairs
accepted for integration. Matching focused author/native/registry evidence is
retained; final root union/type/browser acceptance remains authoritative.
Shared worktree and source remain available; no worker-owned runtime cleanup.


## Root integration acceptance — final functional source

Completion event accepted by root at source `36c4ae749` (implementation
`d93fa1bce`). The latest affected set has 32 suites / 700 passing tests, zero
skips; the final pinned SDK compatibility subset passed 13 suites / 37 tests.
The real browser and saved-data proof at `browser-proof.json` includes exact
questions, human/custom and delegated answers, reload, a real owned backend
restart, lost accepted HTTP 200, automatic next-call recovery and one saved
Telegram draft shown on the right. Canonical seven-option/multiple/confirmation,
RU/EN, keyboard, 390/1440 and stale/Stop cases are separately recorded there.

This accepts this child stream's delivered implementation and local functional
integration. The epic still requires the separate strict resource gate and
canonical task closeout; see `memory.md` and `acceptance.md`. Safe-only cleanup:
retain the owned worktree, private fixture data and preview for owner review;
no foreign runtime, source, data or private incident evidence was removed.
