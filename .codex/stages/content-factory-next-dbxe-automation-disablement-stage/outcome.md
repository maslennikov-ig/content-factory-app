# dbxe.15 — automation disablement accepted locally, 10 October 2026

Only `content-factory-next-dbxe.15`; baseline `60f4c6f615c8d5abeb49ef02ff6eaf000872702c`.
Original criterion remains verbatim in [plan.md](plan.md), with all 30 epic
criteria preserved. Epic stays OPEN; dbxe.8 full release gate stays IN_PROGRESS.

The service now checks the freshly loaded global plug's activation, channel
disabled/deleted state and current provider capability before fields/dispatch.
Internal actions recheck both source and destination channels and their current
capability. Removed/disabled actions return a safe skip; the fixed diagnostic
contains kind/reason only, without IDs, credentials or text. Unknown providers,
removed methods and inconsistent global organization ownership also skip safely.

X's two analytics-dependent global actions check the current switch before
credentials/SDK/API and again before their delayed write. Existing truthiness,
enabled thresholds, arguments and internal repost availability are preserved.
An already sent remote request is not recalled. No schema, UI/journal, scheduling
refactor, cancellations, contract migration or new provider-switch framework.

All 29 workflow/activity source files have the same bytes as the baseline.
Global safe skip returns true, allowing the existing workflow to drop only that
plug's remaining repetitions; internal result remains void. All six actual
V101–V106 workflow functions are exercised with a controlled sleep and the
unchanged PostActivity delegation. Enabled actions and a second independent
cached plug continue to run. These are workflow fixtures, not native Temporal
history replay or live-provider proof.

Root acceptance PASS: **5 Jest suites / 212 tests / zero skips**, including
**8 real disposable PostgreSQL tests**, backend and orchestrator TypeScript,
legacy byte/signature guards, documentation (185 files) and diff checks.
Proof: [root-acceptance.actual.json](root-acceptance.actual.json).
The original four service failures and two X failures remain in local logs;
the focused X diagnostic deliberately selected two tests, not the whole suite.
Final acceptance ran all selected suites without skips.

Exactly one owned PostgreSQL container was removed; all 68 pre-existing
containers remained. No production, real provider/account/model call, source
push, full release suite/build or deployment. Raw local evidence is preserved.

One read-only caller-mapping child accepted in plan; no writes or runtime tails.
Closeout-lite reuses the matching root checks, without another reviewer or suite.
docs-reviewed: updated — automation behavior, execution boundary and navigation.
graph-reviewed: used — focused local `.processPlugs()` lookup on stale 46ec4108;
exact current callers/files verified, no refresh/API extraction/git hooks.

Scoped local commit and Beads completion bind to this proof. Next candidate is
dbxe.16: correct accumulated delays with a versioned successor and controlled
clock proof while preserving old histories. Its original scope stays in Beads;
it is not started automatically. Unselected tasks and all prior defers remain.
