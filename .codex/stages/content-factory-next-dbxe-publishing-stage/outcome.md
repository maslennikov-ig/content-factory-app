# dbxe.6 publication outcome — 9 October 2026

Selected scope: only `content-factory-next-dbxe.6`, local implementation and
focused root acceptance PASS. Beads dbxe.6 CLOSED locally; status read back. Original epic/child criteria,
access .1–.5 acceptance, dependency fixes and task8's full release gate remain.
Stop for owner choice after this boundary; no automatic next stage or release.

Follow-up root review corrected pre-send preparation lockout and confirmed
receipt recovery during billing outage. Latest acceptance:14 suites/265 tests,
zero skips, including9 actual PostgreSQL checks and both type checks.
See [review](review/review.md) and [latest receipt](review/review-acceptance.json).
The original receipt below is retained as evidence before this correction.

## Saved fix

- New `postWorkflowV106`, `PostActivityV106.postSocialV106` and versioned comment
  activity. Existing V101–V105 workflows, old missing workflow and the entire
  old `PostActivity` file are byte-preserved; signature baseline only adds new
  contracts. Portable SHA baselines do not require private Git history in the
  copied public tree.
- Reuse `Post.releaseId`, `releaseURL` and state. Add nullable JSON
  `publicationJournal` to the existing Post rather than a separate model or
  overloading user error history. A database CAS writes the pending claim
  before send; another single CAS confirms journal and Post projection together.
  Persist only receipt fields, no provider error/payload/token.
- Stable initial operation and separate repeat generations retain receipts.
  An overlapping/pending operation is never stolen, expired or reset; any
  pending claim blocks other generations. Confirmed retries return their own
  receipt and cannot overwrite a later repeat's projection.
- Streak runs separately after confirmation; its failure is recorded without
  changing PUBLISHED. Notification activity failure cannot reenter the write.
  Comments have separate guarded claims; uncertainty stays on the affected
  Post rather than misrepresenting the already-confirmed parent.
- Ordinary/new recovery starts and V106 repeat children use V106. New recovery
  loop is separately versioned. Existing live loops and V105 repeat histories
  remain unchanged; their retirement/inspection is a future authorized release
  step. No old history was terminated in this task.

## Confirmed and uncertain evidence

Original implementation receipt: [root-acceptance.json](root-acceptance.json).
Case mapping: [publication-outcome-evidence.json](publication-outcome-evidence.json).
Raw/private logs and disposable fixture IDs stay local.

| Local observed case | Result |
| --- | --- |
| Original confirmed fake provider + failing streak | 3 provider calls, no durable receipt in the original activity retry reproduction |
| V106 confirmation + failing streak and notification | 1 provider call; confirmed journal/releaseId/releaseURL; PUBLISHED; auxiliary failure separate |
| Lost activity response after saved confirmation | Stored receipt returned by a new service/Prisma client; 0 additional provider calls |
| Lost provider response or receipt-save failure | 1 original call; pending journal and readable uncertainty; no blind resend |
| Crash after claim, send status unknown | Pending never expires; new initial/repeat operation blocked; no asserted absence of external effect |
| Caught local preparation failure before claim | No provider call or pending; corrected queued Post can send; parallel claims/receipts preserved |
| Receipt replay during billing outage | Existing receipt returned before subscription/preparation; zero new writes |
| Authoritative synthetic receipt reconciled | Guarded confirmation restores PUBLISHED without a provider write; conflicting receipt refused |
| 10 concurrent actual PostgreSQL deliveries | 1 admitted local provider call; 1 durable confirmed operation |
| Initial then explicit repeat; late initial retry | Two distinct confirmations; late retry reads its receipt and preserves the newer projection |

Original executable evidence: 14 unique Jest suites /259 tests, zero skips,
including 7 actual PostgreSQL checks and 21 publication regression checks.
The 12-suite main set passed; 2 existing custom repository loaders were adapted
and their 13 checks passed separately. The portable legacy-hash correction
reran only the 21 publication checks. Final source review also corrected JSONB
property-order comparison: identical authoritative receipts reconcile idempotently.
The final 2 publication suites/28 checks (including PostgreSQL) and both type
checks passed on the corrected source; 10 adjacent suites/218 checks, the 2
compatibility suites/13 checks and unchanged workflow-bundle proof were reused.
Orchestrator/backend TypeScript PASS. Actual Temporal webpack bundle PASS,
3,198,247 bytes, all legacy/new exports included. Additive Prisma diff/selected
SQL guard PASS; applying that exact SQL to the owned baseline disposable schema
preserved an existing published Post and left its journal NULL. Owned DB removed;
foreign container IDs preserved. Docs/process/diff results are in the receipt.

The first acceptance failure was a custom test loader that could not resolve
the new sibling persistence module; product/DB cases were green. Failure receipt
and earlier diagnostics remain local. No test criterion was removed or skipped.

## Recovery and delivery limits

Operator guide: [publication-recovery-v106.md](../../../docs/operations/publication-recovery-v106.md).
Guarded additive SQL is saved for a separately authorized release, not applied
to production. Only an authoritative provider receipt can resolve pending through
`confirmPublicationV106`; inability to find a post in a partial list is not proof
of absence. Caught preparation failures before claim permit a corrected queued
retry; failures or crashes after claim remain conservatively uncertain.

Fixtures prove our local invocation/recovery behavior and durable PostgreSQL CAS,
not real provider idempotency or provider-internal retries. Actual provider
effects, current live histories and deployment remain UNKNOWN/unverified.
No provider/model/paid call, credential wiring, real message/publication,
production mutation, source push or deployment. No other task implementation.

Rollback must retain journal data and stop starts before returning to a writer
that ignores pending claims. Do not delete/reset claims or downgrade such Post
rows to an unguarded writer. Task8 still requires its original exact-SHA full
release suite/receipt, copied public tree/image/runtime proof and owner authority.

docs-reviewed: updated operator migration/recovery guidance and project index.
graph-reviewed: read-only local46ec4108 postSocial graph neighborhood; stale and
truncated, exact current activity/workflow/Post and source-level start consumers
confirmed. No graph refresh, external extraction or git hooks. Root-owned work;
no delegated streams, unrelated cleanup or changed acceptance criteria.

Next recommended bounded task: dbxe.7 worker readiness; `next-stage-prompt.md`.
