# Publication stage follow-up review — 9 October 2026

Reviewed worker delivery `12180218bfd6669005963e27887c7367efce3766`, based on
`5a686127ff854341ac2ae93a2b0e2b2fac98e4f5`. Scope remains local Beads dbxe.6;
no release, production mutation or other task implementation.

## Correction and observed behavior

The original successor acquired its permanent pending claim before local
preparation. A caught tag/settings/preparation failure therefore made a post
unrecoverable by ordinary correction/requeue, despite zero provider writes.
It also checked subscription before returning an already-saved receipt, so a
billing outage prevented receipt recovery. Three focused checks reproduced
these failures before the correction; the original diagnostics are retained.

V106 now reads confirmation/uncertainty first, prepares before claim, then
atomically rechecks eligibility and claims immediately before calling
`provider.post` / `comment`. A caught preparation failure saves a bounded,
readable diagnostic without starting a publication attempt. Correcting and
queuing the same Post can send normally. The diagnostic CAS cannot overwrite a
parallel claim, confirmation, deletion or draft. No new journal states, leases,
claim reset or deletion were introduced; all receipts and user content remain.

Already-confirmed retries return their receipt before billing or preparation.
Crashes after claim and lost provider responses remain uncertain; pending never
expires and cannot be cleared by a late preparation diagnostic. The original
one-write behavior after streak/notification failure remains intact.

## Acceptance

- Fresh affected set:14 Jest suites /265 tests, zero skips, including9 actual
  PostgreSQL checks. New cases cover corrected pre-send retry, inactive billing,
  receipt replay during billing outage, a held pending claim, and a real
  PostgreSQL race between a diagnostic and a publication claim.
- Orchestrator and backend TypeScript pass on the corrected source.
- One owned disposable PostgreSQL container was removed; all foreign container
  IDs remain. No live provider, account, email or model invocation.
- Initially verified all23 source bindings,4 documentation bindings and20 log
  digests from the worker's canonical receipt. Its separate local receipt is an
  earlier component run; it is not a replacement for the canonical receipt.
  The canonical receipt is retained as historical evidence before this fix.
- All17 legacy workflow/activity files match both the saved hashes and their
  actual stage baseline bytes. Original Temporal contracts remain unchanged.
- Reuse the unchanged actual workflow bundle and additive-schema/apply proof:
  workflow files/exports, compiler/dependency lock, selected SQL and schema have
  matching inputs. The bundle does not contain the changed activity/store
  runtime modules. No additional schema change or full-suite replay is needed.
- Latest binding and documentation/process/prompt checks are recorded in
  `review-acceptance.json`; raw logs and the disposable runner stay local.

graph-reviewed: read-only sibling map in
`/home/me/code/content-factory-next-worktrees/editorial-release-20261008`, built
at `e2ec588d`. Bounded `postWorkflowV105` neighborhood is truncated; returned old
activity/workflow hashes match current source. New V106 files were reviewed
directly, not inferred from this older graph. No refresh, extraction or hooks.

## Remaining boundary

Beads dbxe.6 is accepted locally after this correction. The Post journal SQL
still requires a guarded production migration, candidate native-image proof
and authorized release. Old live recovery loops and V105 histories must be
inspected during that release; they are not covered by V106 fixture proof.
Task8's original full exact-SHA release gate, the epic and unrelated criteria
remain. No claim of real provider idempotency or changed running service.

Next bounded task: dbxe.7 worker/poller readiness. An idle healthy queue should
remain ready; a stopped worker or stale/missing pollers must be unavailable,
with recovery clearing it. Use the saved `../next-stage-prompt.md` in the next
chat; do not start this task or a release from the recommendation alone.
