# dbxe.20 — bounded periodic workflow histories

Owner-selected local stage, 10 October 2026. Baseline
`31e7170fba4edb26214a8618dca62ebdb0aeff13`. Root owns the cohesive change and
acceptance; no child agents, release, full suite, production inspection/mutation
or provider calls. Beads owns statuses. Preserve all 30 original criteria.

## Original criterion (verbatim)

Versioned periodic successors rotate after bounded processed attempts while preserving input/queue state, including failure-heavy mail. Virtual clock/counters and compatibility proof retain original exports; inspect actual owned consumers before migration. No blanket replacement/cancellation of live workflows or invented incident/limit.

## Specification and plan

1. Preserve all 34 historical workflow/activity source bodies and signatures;
   the index is the 35th tracked Temporal file and receives additive exports.
   Reproduce the absence of rotation on the actual legacy loops, including
   mail failures, with a deterministic counter/virtual clock.
2. Add autoPostWorkflowV2 and autoPostDraftV3Workflow. After 100 hourly turns,
   continue as the same new type with original id/organization and
   immediately=true. The initial immediately=false still skips only the first
   turn. Preserve the existing activities/retry options/hourly delay and fatal
   errors in draft V2; legacy AutoPost's ordinary errors still permit another
   turn, but cancellation must propagate.
3. Add missingPostWorkflowV109: 100 hourly checks then continue with no args;
   keep searchForMissingThreeHoursPostsV108 and therefore the V108 publication
   recovery path. Ordinary activity failure remains fatal as before.
4. Add sendEmailWorkflowV3, keeping the existing signal, five activity args,
   bounded retry policy, 700ms pacing, priority insertion and visible failed
   sends. Count each settled send, including failure, toward the 30-attempt
   limit. Continue from the main loop only, after pacing, passing the entire
   pending queue. Synchronous handlers have no unfinished async work. Do not
   retry a processed email across runs or swallow cancellation.
5. Inspect the actual owned source consumers before changing selectors:
   AutopostService.processCron/processCronV2, InfiniteWorkflowRegister and
   EmailService.sendEmail. Preserve their existing workflow IDs. Recovery
   start uses USE_EXISTING; mail already uses it. They select successors only
   for fresh executions and never forcibly replace an existing execution.
   Existing explicit user disable/delete paths remain unchanged. No new
   singleton IDs, blanket terminate, migration or invented live inventory.
6. Focused acceptance: two consecutive virtual runs, exact cadence/input,
   failure-heavy/mixed mail and signals during the last activity/pacing,
   priority ordering, empty/invalid signals, cancellation/fatal errors and
   real consumer behavior. Actual SDK1.15.0 builds baseline/current bundles;
   one owned loopback synthetic server proves mail continue-as-new and
   USE_EXISTING behavior and replays legacy periodic histories in the current
   bundle. Hourly bounds are proved with the virtual clock, not 100 real hours.
   Type-check backend/orchestrator/commands and run only affected tests,
   docs/diff. Clean up only the fixture created by this stage.
7. Update operations/navigation/handoff, close only .20 after acceptance,
   scoped local commit, keep .8 and epic open, and stop for the next choice.

## Compact premortem — GO

| Risk | Evidence / mitigation | Owner / disposition |
| --- | --- | --- |
| Replay changes existing commands | 34 historical bodies/signatures immutable; baseline histories replay in current SDK bundle | root / preflight |
| New singleton duplicates an old running consumer | Stable workflow IDs; USE_EXISTING; real server verifies old mail receives a new-selector signal | root / preflight |
| Failures never reach the rotation bound | Counter outside ordinary mail error catch; all-failure and mixed proof | root / preflight |
| Signal/queue lost or a processed send repeats | Synchronous handler, rotation after pacing, carry pending queue only; native and virtual boundary signals | root / preflight |
| First skipped hour repeats each run / extra immediate call | Continue with immediately=true only after the final hourly sleep; two-run virtual clock | root / preflight |
| Cancellation swallowed / live histories cancelled by executor | Installed SDK isCancellation; scoped fixture labels/IDs only; no live cancellation | root / preflight |
| Executor reports a local fix as live migration | Explicit source/native/virtual boundaries, current live history size and consumers UNKNOWN | root / preflight |

100 turns is a conservative repository-style batch size, not an inferred
Temporal server limit. 30 mail attempts preserves the existing intended bound.
This bounds per-run processed work, not queue payload size, arbitrary signal
floods or archival retention across the run chain. Existing running types stay
as they are until separately inspected at the .8 release boundary. No automatic
legacy retirement. Rollback is a code revert; keep successor exports if any
execution has started them, and preserve its queued work.

graph-reviewed: used — stale46ec4108 local graph, focused autoPostWorkflow and
EmailService; exact current loops and consumer strings verified. Graph hashes
match relevant files, one neighborhood truncated; no completeness claim,
refresh, external extraction, telemetry or hooks.

Primary API evidence: https://docs.temporal.io/develop/typescript/workflows/continue-as-new
and installed @temporalio/workflow1.15.0 makeContinueAsNewFunc: continuation
inherits workflow type/task queue and receives explicit state. Signal handlers
must finish first; these handlers are synchronous.
