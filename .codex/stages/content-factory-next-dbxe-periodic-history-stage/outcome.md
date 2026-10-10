# dbxe.20 — periodic history rotation accepted locally, 10 October 2026

Only `content-factory-next-dbxe.20`; baseline `31e7170fba4edb26214a8618dca62ebdb0aeff13`.
Original criterion is verbatim in [plan.md](plan.md); all 30 original epic
criteria stay intact. Beads owns status: close only .20 locally, epic OPEN and
.8 IN_PROGRESS until its original next full release. No automatic next stage.

New autoPostWorkflowV2/autoPostDraftV3Workflow/missingPostWorkflowV109 continue
after 100 hourly turns. IDs/organization and immediately=true cross the
checkpoint; an initial false skips only the first original turn. Final hourly
sleep occurs before rotation, preventing extra immediate work at the boundary.
Draft/recovery activity errors stay fatal; ordinary legacy AutoPost failures
still allow later turns and count toward the bound. Activity/retry contracts
and V108 publication recovery stay unchanged.

New sendEmailWorkflowV3 counts successful and failed settled sends toward the
30-attempt bound. Five sendEmailV2 arguments, priority insertion, bounded
retries, visible failed send and 700ms pacing stay. Pending queue crosses the
checkpoint after pacing; synchronous signals delivered during the final send
or pacing are included. Processed mail is not reinserted; direct and wrapped
SDK cancellation propagates. No new retry/deduplication/mail storage mechanism.

Actual source consumers inspected: AutopostService.processCron/processCronV2,
InfiniteWorkflowRegister, EmailService.sendEmail. Fresh executions select new
types with **all prior workflow IDs preserved**. Mail keeps USE_EXISTING;
recovery adds USE_EXISTING. Existing running types are not replaced/cancelled.
Explicit user disable/delete AutoPost targets stay unchanged. This local stage
does not migrate live consumers, and old V2 self-continuations remain V2.

Root acceptance PASS, closeout-lite, no additional agents/reviewers:

- **9 Jest suites / 162 tests, 10 Node consumer tests, zero skips**: two virtual
  hourly runs, initial true/false, fatal/cancellation/ordinary errors, all-failed,
  mixed and successful mail, empty/default queue, invalid signals, last-send
  and pacing signals, priority/no repeated processed subjects, actual consumer
  IDs/tenant attributes/disable behavior and retained V2/V106–V108 rails.
- Actual **SDK1.15.0** builds baseline/current bundles; one owned loopback
  Temporal proves **30 failed attempts → new Run ID**, four pending mails
  retained (including two boundary signals), **34 distinct processed subjects**
  across runs, same workflow ID/type/main queue/five args/ru. The actual
  EmailService V3 selector signals an existing V2 execution without replacing
  its type. All **7 synthetic histories replay** in the current bundle: four
  legacy hourly types, legacy mail V2 and both new mail runs.
- Backend/orchestrator/commands TypeScript, documentation and diff checks PASS.
  **34 historical workflow/activity bodies** are byte-identical; the 35th
  tracked file, index, only adds four exports. Signature baseline only adds
  four workflow entries, with every prior entry unchanged.
- Native fixture removed by exact owner/stage labels; before/after inventory
  retains **all 68 preexisting containers** with no foreign additions/removals.

The original diagnostic reproduces four unrotated loops after 101 hourly
sleeps and 33 failed V2 mails without continuation. Initial added Node consumer
check caught an inadequate empty TypedSearchAttributes stand-in; the fixture
now uses the actual SDK and actual organization key. Its failing log is retained;
the final ten consumer tests pass. No product fix was needed for that test issue.

Root inspected exact owned diff and source/receipt hashes. Durable proof:
[root-acceptance.actual.json](root-acceptance.actual.json). Diagnostic and native
scripts are committed; synthetic histories/bundles/logs/Beads snapshots remain
local evidence, untouched outside this stage. No full suite/build, production
inspection/mutation, real mail/social/model call, source push or deployment.

docs-reviewed: updated — [rotation and stable-ID consumer behavior](../../../docs/operations/periodic-workflow-history.md),
V108/deadline guides, documentation/navigation/handoff.
graph-reviewed: used — focused autoPostWorkflow/EmailService against stale46ec4108
local graph, relevant exact current source/callers verified; one neighborhood
truncated, no completeness claim/refresh/external extraction/hooks.

Limits: hourly rotation is proved with a virtual clock, not 100 real hours.
Synthetic/native histories prove SDK/state behavior, not real delivery,
live-history compatibility/inventory or an existing production incident.
Per-run work bounds do not cap arbitrary signals/queue payload or archived
history across the entire chain. Actual production sizes/limits remain UNKNOWN.
Future selected .8 release must inspect running legacy consumers/queues and
preserve successor exports and pending work during rollback. Existing old
recovery-loop retirement and Post journal schema/full release gates remain.
All original SaaS/client/legal/research/security requirements/defers are kept.

Next candidate: **dbxe.21**, media/avatar and R2-session ownership. It remains
OPEN; stop and wait for the owner's next-stage choice.
