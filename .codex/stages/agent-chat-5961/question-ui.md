# HONEY-5961 question UI delivery

Status: implementation delivered for root acceptance. Local-only; no provider
calls, credential changes, production writes, push or deploy.

## Delivered behavior

- `agent.domain-question-card.tsx` renders exact domain-owned manual questions,
  all stable ordered options, recommendations and original custom-answer
  labels. One active question, retained native answers, explicit single/multi,
  custom, confirmed and per-question/remaining-batch delegation.
- `ManualQuestionControls` in `intake/questions.card.tsx` shares choice,
  checkbox and textarea controls without another panel. Empty input never
  delegates. The legacy chat interview now requires explicit answers too.
- `agent.question-draft.ts` stores only browser drafts scoped by the existing
  organization/user/thread key plus batch, revision and question. Accepted
  answers come from native checkpoints. Rejection, stale cards and lost replies
  retain typed text; successful native acknowledgement clears its browser copy.
- `agent.conversation.tsx` forwards exact native run/call/card identities, guards
  duplicate question submissions and simultaneous parallel approvals, and
  refreshes every reader of the exact saved piece without clearing editor data.
  The original goal requires no additional Continue control.
- Approval cards require meaningful consequence metadata and a known native
  identity. Missing metadata offers refresh and safe refusal; no generic Yes or
  unsupported default undo promise. History/pending summaries remain call-bound.
- Successful revision-bound source ranges with `literalMatch:false` render a
  recoverable reading note with the actual returned character range. Real
  missing/stale/unauthorized source failures remain errors.
- A fresh owned pending-gate read reconciles a lost response even when execution
  metadata remains `running`. It restores the exact current gate and draft, or
  advances to an already persisted next gate, without resending an answer or
  restarting native observation. An explicit Stop cannot use this shortcut.
- Frontend refusal mirrors and RU/EN copy include `AGENT_QUESTION_STALE`,
  `MATERIAL_PASSAGE_NOT_FOUND`, and `CAPABILITY_RESULT_UNAVAILABLE`.

## Owned files

`apps/frontend/src/components/agents/agent.contract.ts`, `agent.cards.tsx`,
`agent.copy.ts`, `agent.conversation.tsx`, `agent.interview-card.tsx`,
`agent.selection-card.tsx`, new `agent.domain-question-card.tsx`, new
`agent.question-draft.ts`; shared
`apps/frontend/src/components/content-intelligence/intake/questions.card.tsx`;
`docs/design/component-inventory.md`,
`docs/product/chat-first-workspace-spec.md`; new
`tests/agent-domain-questions.ui.test.cjs` and affected native conversation,
adaptation-card and saved-reader UI regressions.

Backend `agent-parts.contract.ts` remained with the domain worker. The frontend
mirrors its agreed `AgentDomainQuestionPayload`/`AgentDomainQuestionAnswer`.

## Focused verification

Initial targeted red: 5 question/approval UI regressions failed for the missing
manual payload, missing native multi-selection, generic actionable approval and
missing durable-draft card. The implemented target passed.

Actual root-browser failure produced a second targeted red: 3 cases of a lost
network response / `AGENT_RUN_NOT_PENDING` with the same or advanced authoritative
pending gate remained disabled. The same tests passed after fixing gate
reconciliation; no automatic resend or `resumeStream` occurs.

Final current focused command (Node 22.23.2, pnpm):

```sh
pnpm exec jest tests/agent-domain-questions.ui.test.cjs tests/agent-native-ui.test.cjs tests/agent-native-conversation-flow.test.cjs tests/agent-parts.mirror.guard.test.cjs tests/agent-screen.cards-adaptation.test.cjs tests/agent-screen.w2-walk.test.cjs --runInBand --silent
```

Result: **6 suites, 114 tests passed, 0 failed**, exit 0. `git diff --check`
passed. Scope includes exact long wording and seven options; custom own-option
semantics; native multiple selection; explicit delegation; rejection/remount
draft preservation; missing approval metadata; parallel gates; saved-reader
filter isolation; same/advanced pending recovery; and explicit Stop isolation.

Root owns final integrated backend/browser acceptance, including RU/EN,
390px/desktop, keyboard and actual persisted result/restart/lost-200-response
observations. The focused UI results do not claim those broader scenarios.

## Routing and cleanup

Used impeccable product register and the repository's current tokens/components.
Graph-reviewed via the owner checkout's read-only graph at baseline `dd67538d`
for `InterviewCard` imports/callers; current worktree source confirmed all used
paths. No graph refresh or external extraction. No branch, worktree, service or
other owner's changes were removed; no global staging or commit performed.

Completion event: frontend implementation and focused verification ready for
root delivery/acceptance. Remaining root acceptance is explicitly retained.

## Follow-up: lost 200 response advances to a new native call

Root's actual browser found a gap the earlier advanced-card test did not cover:
the accepted final creation answer had already produced a saved piece and a new
`piece_adapt` call, but the tab retained only its old creation tool input. The
default history refresh updated pending gates and unlocked the composer without
hydrating saved message parts, so no component could render the new call.

Added two targeted failing proofs with a new `toolCallId`, in the same assistant
message and in a new assistant message. Both reproduced the invisible adaptation
question. The fix imports the corresponding authoritative saved history when its
pending native call is absent locally and the client is interrupted, or inactive
at both the start and completion of the read. Active-stream history and turn
generation protections remain. No answer or native observation is repeated.

Both new proofs passed; the complete affected
`tests/agent-native-conversation-flow.test.cjs` passed **25/25**, exit 0, including
the prior stale-history, exact-gate recovery and explicit Stop checks.
`git diff --check` passed. Backend state and the root browser's answers were not
modified by this follow-up. Root retains actual browser reacceptance and types.

## Follow-up: Stop remains available while a native gate waits

Root browser acceptance found that the ordinary composer Stop disappeared when
the SDK observer finished at a valid pending domain question: the composer was
correctly editable, but neither it nor the conversation exposed cancellation.

The conversation now shows the existing quiet `Stop` / `Остановить` button after
waiting gates while no client stream is active. It calls the unchanged
`stopAndReconcile` owner. Answer controls and composer busy semantics are
unchanged; stopping does not send the draft, delegate an unanswered question or
resume the native call.

A focused domain-gate proof first failed because the button was absent, then
passed. It verifies one stop POST and one SDK stop, zero answer sends/replays,
retained accepted partial-answer text and exact browser draft, and continued
locking while terminal Stop proof is unavailable. The affected conversation
file passed **26/26**, exit 0; `git diff --check` passed. Root owns the actual
pending-thread Stop observation and frontend type gate.

Reviewed the simultaneous saved-piece line and pending-question count: the
count comes from the persisted piece reader. Partial human answers remain in
the native checkpoint until the complete batch applies to the domain, so that
source count can still be four while a later question is active. The line names
the unfinished saved piece and explicitly says answers remain; it is not final
goal-completion evidence. No extra continuation or duplicate domain action was
added, and the truthful persisted count was left unchanged in this scoped fix.

## Follow-up: confirmed stale-question refusal remains specific

Root's actual 409 `AGENT_QUESTION_STALE` observation retained the exact draft,
but native pending reconciliation cleared the transport error and the card's
boolean failure marker could only show uncertain-receipt wording. Two focused
proofs reproduced the missing reason, directly on the domain card and through
the native conversation after its transport error is cleared.

Question failures now retain their code by card ID. A confirmed stale refusal
keeps the existing localized explanation that the material or questions changed
and the answer was not applied. It offers the existing link to the current
piece and names Stop as the next action. The old question cannot be submitted or
delegated again; its exact editable browser draft is retained. Unknown response
failures keep the neutral receipt wording. No answers or question wording are
rewritten, and no backend, browser answer or shared documentation was changed.

Both new proofs passed after the fix. The complete affected
`tests/agent-domain-questions.ui.test.cjs` and
`tests/agent-native-conversation-flow.test.cjs` passed **2 suites, 36 tests**, exit
0. Root retains the final frontend type check and actual browser acceptance.


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
