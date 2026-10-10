# dbxe.6 publication recovery — 9 October 2026

Goal: isolate auxiliary failures from a confirmed provider write, with durable
local receipts and fail-closed handling of uncertain outcomes. Beads dbxe.6
owns the unchanged acceptance criteria. Root owns this single local boundary.

## Design and scope ledger

- Existing `Post.releaseId`, `releaseURL` and `state` remain the publication
  projection. They cannot identify an in-flight operation or distinguish repeat
  generations. Add nullable `Post.publicationJournal` rather than a new table,
  overloading the error ledger, or rewriting the provider interface.
- CAS on the journal admits one invocation before calling the provider.
  Confirm receipt and Post projection together in one database write. A
  confirmed retry reads the receipt; any pending operation blocks further
  writes, including new workflow runs and different repeat generations.
- Persist a readable uncertainty message before sending. Crash/lost response
  before confirmation requires authoritative receipt reconciliation; no lease
  expiry, provider lookup guess, automatic reset or blind retry. Confirmed
  lost activity responses recover from the journal. A receipt can be reconciled
  through the same guarded persistence method, with no provider write.
- Add V106 social/comment activities and workflow. Move streak to its own
  activity after receipt persistence; notification failure also cannot reenter
  the publication loop. Preserve all old workflow files and publication methods.
- Move ordinary/new recovery starts and V106 repeat children to V106. Preserve
  existing histories; old recovery loop retirement is an authorized release
  operation, not something to run here.
- Local fake-provider proof covers calls at our activity boundary only. Provider
  internal retries, real idempotency, production migration/deployment and task8
  release acceptance remain separate.

Files: Post Prisma schema; `database/prisma/posts/publication-store.v106.ts`,
PostsRepository/PostsService; new orchestrator V106 activity/workflows,
registration; focused regression tests; operator recovery guide; stage/handoff.

## Premortem

Verdict: GO. Nullable additive schema; no deployed database is touched.

| Symptom | Evidence/mechanism | Detection and mitigation |
| --- | --- | --- |
| Duplicate after streak or notification failure | Confirmed source ordering and workflow loop | Persist first; independent auxiliary activity; call-count test |
| Lost response repeats remote effect | Plausible activity/process crash window | Pending claim never expires; durable confirmed readback or manual receipt reconciliation |
| Concurrent retries both send | Shared Post state; read alone is insufficient | Journal CAS; actual disposable PostgreSQL race proof |
| New repeat reuses old receipt or bypasses pending | Same Post serves repeat workflows | Stable initial key, workflow-specific repeat key; block all pending entries |
| Replay breaks | Old workflows schedule fixed activity names | Preserve old workflows and publication methods; signature guard and byte comparisons |
| Executor modifies production or unrelated scope | Shared checkout and explicit prohibition | Tracked baseline clean; scoped files, disposable DB only; no release/push |

Recovery: preserve journal data; never roll back to a writer that ignores a
pending attempt. After authorized rollout, pause starts before rollback;
resolve pending receipts with authoritative provider evidence. Estimated
operator time is unknown until that evidence exists. No destructive migration.

## Final acceptance

One root-owned set: focused activity/workflow and actual PostgreSQL checks,
adjacent scheduling/tenant/provider contracts, Temporal signature preservation,
orchestrator/backend TypeScript, actual workflow bundling, additive SQL guard,
docs/process/diff. Keep raw diagnostics; no full release suite here.

- [x] Complete implementation and operator documentation.
- [x] Run one focused final acceptance and inspect all results.
- [x] Record original criteria parity, Beads/handoff/outcome and local delivery.
- [x] Stop for owner choice; no continuous goal or automatic release.

## Follow-up review correction

Scope remains dbxe.6 only. Separate a caught local preparation failure, before
the provider write is invoked, from an uncertain provider/crash outcome. Prepare
before acquiring the publication claim, permit a corrected queued retry, and
return already-confirmed receipts before checking billing. Claim atomically
immediately before send. Never reset a pending claim; preserve all original
histories and receipts, without adding another journal state or claim lease.

- [x] Reproduce preparation lockout and receipt recovery during billing outage.
- [x] Correct only new V106 activity/persistence and document the distinction.
- [x] Run affected root acceptance, including real disposable PostgreSQL;
  preserve prior proof, update Beads/handoff and prepare one next-stage prompt.
