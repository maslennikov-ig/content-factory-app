# dbxe.16 — delayed deadlines accepted locally, 10 October 2026

Only `content-factory-next-dbxe.16`; baseline `f398dcfa7560a8220802b4fa73f73884fca30e95`.
The original criterion is verbatim in [plan.md](plan.md); all 30 epic criteria
remain intact. Epic stays OPEN and dbxe.8 stays IN_PROGRESS for its original
next full release gate. No next stage starts automatically.

V107 uses one delayed-phase origin after publication/webhooks and before loading
automation schedules. Each offset becomes an absolute deadline. Discovery,
previous actions and retries consume the remaining budget. Repeat retains its
workflow-entry origin; all deadlines are sorted together, including ties and
overdue repeats. Deadline metadata is removed before existing activity calls.

The original virtual-clock trace with 400ms processing starts actions at
1000/3400/6800ms in V105/V106. V107 starts them at 1000/2000/3000ms.
Native checking found another delay: SDK sleep(0) emits a 1ms timer. V107 creates
a timer only when the remaining time is positive. In the controlled native
case with three 100ms offsets and 350ms processing, old versions create three
timers; V107 creates one and runs the two overdue actions without further timers.
Actions remain sequential; already slow/provider-busy processing can still
overrun a deadline. No exact wall-clock punctuality under external load is claimed.

Normal new starts, recovery and repeat children deliberately select V107.
The small V107 recovery activity and hourly loop are registered beside the old
versions. Recovery retains USE_EXISTING, IDs and tenant attributes; explicit
reschedule/stop behavior remains unchanged. All **28 historical workflow/activity
sources** retain baseline bytes; the index only adds two exports, and the
signature baseline only adds three entries. Existing V106 publication claim
activities and dbxe.15 enabled/disabled action behavior are reused.

Root acceptance PASS: **5 Jest suites / 181 tests / zero skips**, including
18 new deadline cases, backend/orchestrator TypeScript and documentation/diff
checks. Actual SDK1.15.0 builds both the baseline and current workflow bundles.
One owned loopback Temporal dev server generates V101–V106 histories using the
baseline bundle and V107 using the current bundle; all seven complete three
synthetic actions and replay with the current bundle. This is **native synthetic
history proof**, not production-history replay or provider acceptance.
Receipt: [root-acceptance.actual.json](root-acceptance.actual.json).

The owned Temporal container was removed; all 68 pre-existing containers in the
final run remain. Earlier reproducer/failure/pre-fix logs are retained separately,
including a fixture serialization error and the zero-timer counterexample.
The selected final checks passed without skips; no full release suite/build,
production/app/server mutation, schema change, paid/model/provider call, push
or deployment. No customer data or foreign resources changed.

One read-only caller mapper is accepted in plan; no child writes or runtime tails.
Closeout-lite uses this one risk-selected root acceptance, with no extra reviewer.
docs-reviewed: updated — [timing and migration](../../../docs/operations/automation-deadlines.md),
publication guide, disablement cross-reference and navigation.
graph-reviewed: used — focused stale46ec4108 postWorkflowV105 lookup;
current sources/callers verified, no graph refresh/API extraction/git hooks.

Future release must inspect/retire the checked old missing-post loops before
enabling V107 registration and keep V107 worker exports through rollback while
its histories remain. Additive journal schema and full dbxe.8 release proof
remain required. Those conditions are in the operations guide and Beads notes;
all original SaaS/client/legal/research/security defers stay preserved.

Next candidate: dbxe.17, fix local/provider post identity in webhooks while
preserving existing histories. Stop for the owner's next-stage choice.
