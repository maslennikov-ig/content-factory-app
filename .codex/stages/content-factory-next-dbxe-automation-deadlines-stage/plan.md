# dbxe.16 — absolute deadlines for delayed actions

Selected by the owner on 10 October 2026. Baseline `f398dcfa7560a8220802b4fa73f73884fca30e95`.
One local stage; Beads is the status authority. Epic and dbxe.8 full release gate remain open.

## Original criterion (verbatim)

Versioned successor respects absolute deadlines/elapsed processing time for several plugs and repeat, has no negative sleeps and preserves declared repeat base. Virtual-clock proof includes nonzero processing. Historical V101–V105 exports/replay remain unchanged and new starts migrate deliberately.

## Specification and decisions

- Add `postWorkflowV107` from the accepted V106 publication path. Keep every historical workflow/activity source byte-identical; retain all exports and registration. Reuse V106 publication claims/receipts and existing plug activities.
- Capture one delayed-phase origin after publication/webhooks and before loading plug schedules. Convert each internal/global offset to an absolute deadline from that origin. Schedule discovery, previous actions and retries consume elapsed time; they never add a new full delay.
- Repeat deadline remains workflow entry time plus the declared interval in days, as in V106. It has its own absolute origin and is sorted by its actual deadline alongside plugs. V107 repeat children stay V107 with the existing ABANDON/operation-ID semantics.
- Before each action, compute `max(0, deadline - workflow clock now)` and sleep only when positive. Native proof found that SDK sleep(0) still emits a timer; overdue actions must omit that command. Overdue actions run immediately in order; do not parallelize provider writes, discard actions or claim that an already busy provider can meet an expired deadline.
- Keep deadline metadata inside the new workflow. Remove it before calling existing activities; preserve their argument shapes, returns, skip/retry behavior and dbxe.15 execution checks.
- Normal new starts select V107. Add a small V107 recovery activity and missing-post loop, register both, and select that loop in the existing startup service. Keep legacy recovery and child targets intact. Recovery retains USE_EXISTING and never upgrades/terminates an existing history automatically.
- Existing reschedule/stop behavior remains unchanged. The future release must inspect and retire the old missing-post loops before enabling the new starter; no live loop is changed in this local stage. Rollback stops new starters and retains V107 worker exports while its histories remain.
- Add only new entries to the Temporal signature baseline. Update current-selector test expectations, retaining all existing publication and legacy counterexamples.

The installed Temporal SDK1.15.0 overrides workflow Date/Date.now with its deterministic activation clock (`workflow/lib/global-overrides.js`). [Official replay API](https://typescript.temporal.io/api/classes/worker.Worker#runreplayhistory) supplies native offline history compatibility checking; use controlled synthetic histories, never user histories or live providers.

## Ownership and accepted child delivery

Root owns workflow/recovery implementation, caller adoption, virtual-clock proof, focused final acceptance, docs and local delivery.
One read-only `automation_contract_map` delivery is accepted: it found the normal service start, V106 recovery activity, V106 repeat child and backend loop registration. New loop needs a new recovery activity; old loop IDs persist unless deliberately retired. Current selector tests and additive signature rails are identified. Concrete benefit: caller-context isolation while root designed deadlines. No child writes/resources/cleanup or additional reviewer.

## Implementation and final acceptance

1. Preserve all 30 original criteria and historical source hashes. Reproduce cumulative waits with actual V105/V106 workflow functions and a controlled clock.
2. Implement the complete V107 path, migrate only future entrypoints, preserve activity payloads and legacy bytes.
3. Root accepts one risk-selected set: actual virtual-clock workflow cases with nonzero discovery/action/retry time; overdue/tied/global/internal/repeat/skip cases; normal/recovery/cron registration; existing publication/disablement/fire/signature rails; backend/orchestrator types; exact SDK workflow bundle and historical replay where matching synthetic proof is executable; docs/diff and criterion preservation.
4. Close only .16 against matching proof; scoped local commit, handoff/index and continuation point. Stop for next owner choice.

No full release suite/build, deployment, push, paid calls, real accounts/provider writes, shared-host cleanup or database/schema changes. Native Temporal proof, if needed, uses one exact-owned local loopback dev-server container with synthetic activities, then removes only that container. Old production history replay and actual runtime rollout remain separate claims.

## Technical premortem

Verdict: GO. Reversibility: local revert before deployment; no production/data mutation. Future rollback must preserve V107 exports for existing V107 histories.
Blast radius: normal/recovery/cron starters -> V107 -> deadline ordering -> existing publication/plug activities; provider queues, claims and schema stay unchanged.

| Failure symptom | Evidence | Detection / mitigation | Disposition / owner |
| --- | --- | --- | --- |
| Delays accumulate, including action runtime | Confirmed full-offset sleeps in V105/V106 | Actual failing clock trace; absolute deadlines with nonzero processing proof | preflight / root |
| Changed old commands break history replay | Confirmed Temporal history contract | New version only, old source hashes/exports/signatures retained; native SDK bundle/replay | preflight / root |
| Repeat origin silently shifts | Confirmed old repeat subtracts elapsed from workflow entry | Direct workflow-entry deadline; mix repeat and plug clocks in proof | preflight / root |
| Deadline leaks into old activity arguments or skip semantics | Plausible | Strip internal metadata; exact payload and true/void skip cases | preflight / root |
| Old and new recovery loops compete or recovered job stays legacy | Confirmed old loops persist; USE_EXISTING preserves active type | Deliberate future retirement in release guide; retain old histories and never auto-cancel | preflight at release / owner |
| Publication safeguards regress in successor | Plausible | Reuse V106 claim activities; actual successor refusal/receipt/repeat tests plus existing publication rails | preflight / root |
| Executor changes unrelated/frozen files or claims fixture as production | Executor error, plausible | Read-only bounded child; exact diff, byte hashes and explicit evidence boundaries | preflight / root |

graph-reviewed: used — focused local postWorkflowV105 lookup on stale46ec4108; current source and caller map verified. No graph refresh, external extraction or git hooks.
