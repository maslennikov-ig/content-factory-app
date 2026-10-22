# MastraService native recovery integration

Status: the initial service integration was delivered and verified locally.
Source was reopened for the reproduced concurrent-observer defect; the new
public native view and current verification are recorded in
`native-run-observer.md`. Initial integration MastraService SHA-256:
`61cd7d65debfc77d04eeb90e146f52b20a67ff3ff5f5413c450f48fe4228a925`.
The initial receipt above remains evidence for its original source state.

Scope: R3/A30/A31 service integration, automatic bootstrap recovery, availability
continuation, Stop, and registration of the separately owned native queued-input
workflow. No deployment, push, commit, production database mutation, real model
call, or full suite was performed by this stream.

## Implemented service boundaries

- `MastraService` registers the same `DurableAgent` object on both the native
  agent registry and `AgentController`. Its Session is initialized, bound to
  the exact owned thread, and attached with public
  `session.thread.ensureCurrentSubscription()` before use. Native Session
  permissions, toolsets and step options survive availability continuations
  through public `session.machinery.buildStreamOptions()`.
- The service uses the installed official `RedisServerCache` and
  `RedisStreamsPubSub`, with database-scoped prefixes and 24-hour retention.
- `onApplicationBootstrap()` attaches native replay observers, repairs only
  persisted availability handoff intents with no predecessor/successor native
  snapshot, then starts native fleet recovery and native queued-workflow
  recovery without awaiting long-lived model work. Native fleet recovery owns
  lease-expiry rechecks. Bootstrap never force-steals a live owner.
- Availability waits are native workflow `sleepUntil` checkpoints. Exhausting
  the configured eligible model chain enters a bounded cooldown; after it,
  native queue-plus-abort starts a fresh generation on the primary model in the
  same thread/logical request. Saved tool results remain in native Memory.
- The existing `assistantNativeRun` pointer records the accepted successor ID,
  lineage and `continuationPending` before old-run abort. A one-shot bootstrap
  repair starts only that fixed native run ID. Existing active/suspended
  snapshots remain exclusively native recover/resume work. Native fencing
  prevents duplicate drivers when two fresh backends repair the same intent.
- Native input processors sometimes omit `abortSignal` on a retry boundary.
  The service reads the installed **public advanced-usage**
  `DurableAgent.runRegistry.get(runId).abortSignal`; it never mutates registry
  state. This prevents a live aborted predecessor from overwriting its queued
  successor pointer while preserving cold predecessor recovery.
- Every model attempt rechecks current membership, thread ownership, Stop and
  uncertain-operation guards across the exact prior native run lineage.
  Scheduled work also resolves current membership before building its context.
  Quota/authentication/consent/uncertain-write failures do not enter availability
  cooldowns.
- Explicit Stop first persists a separate logical-task `stopRequested` marker,
  clears availability handoff intent and stops native queued inputs. A delayed
  queue receipt cannot resurrect that logical task after restart. Availability
  cancellation handles the native canceled-before-live-abort race using only
  public `Run.abortController` and `Run.cancel()`, with final native cancellation
  reconciliation after the live sleep engine unwinds.
- A cold persisted native approval/question is explicitly canceled through
  public `DurableAgent.getWorkflow().createRun({runId}).cancel()`. The service
  strictly reads back the outer `canceled` snapshot because native cancel can
  swallow a storage failure. The canceled outer tombstone is retained; inner
  suspended rows are not native discovery candidates. Stop does not delete
  tool receipts or settle the crashed usage row. Explicit user cancellation
  does not acquire or steal the old driver's native claim.
- Stop also settles an accepted availability handoff with no current/prior
  snapshot, local driver or live native owner. No FINISH can arrive for that
  lost queue/checkpoint interval; the exact Stop intent becomes interrupted
  immediately and remains stopped across bootstrap.
- Forced recovery counts actual finish/error/abort/suspension outcomes and
  awaits metadata reconciliation before returning. A permanent tripwire is a
  failure; a native suspension stays waiting/resumable. It does not globally
  clear replay or delete suspended snapshots.

## Explicit queued input integration

`queueNativeInput()` uses the separately reviewed native workflow module and
returns durable acceptance IDs. It rechecks identity/ownership and rebuilds
selected work context and unanswered proposal context from current server
state. `cancelNativeQueuedInputs()` also stops failed wrappers that may have
left a native child behind.

Queued execution uses the existing trusted acting-user scope, one
`beginAiOperation` admission, `ConductorExecution` and `AgentTurnLifecycle`.
Availability successors remain inside that same live admission. Normal
observer-only recoveries create no admission; a positive native skipped-driver
race uses `NativeQueuedInputObserveOnlyError` and `voidUnstarted()`, without
settling the actual owner's lifecycle. Permanent/provider-uncertain work is
never classified as unstarted merely because its usage ledger is empty.

Warm queued approval/question answers can identify and reuse that already open
service scope through `hasNativeTaskOwner()` / `runInNativeTaskScope()`. The
binding contains only live async callbacks and is removed when the owner exits;
native workflows still own durable state. Its liveness read uses the public
native run registry and exact thread/resource/request identity. Initial native
streams do not populate the registry's `workflowExecution` field, so that field
is not a prerequisite for a live owner. Stop closes the live scope as well.
Repeated Stop reconciliation preserves an already settled matching task marker:
native queued cancellation can finish the lifecycle before availability
cancellation writes its durable Stop intent. It must not overwrite that settled
outcome with `stopping` and make the public history report unknown.
The native Session subscription and full public stream options are prepared
inside the original execution/lifecycle/admission scope. The subscription's
asynchronous approval consumer retains the scope in which it was created;
preparing it before admission lost the execution scope on resumed model calls.
Observer-only workflow branches still open no admission or new subscription.
`bindNativeTaskSession()` also replaces an existing idle consumer through public
`thread.detachFromCurrent()` and subscription binding inside the new task's
scope. Native subscription deduplication would otherwise retain a finished
parent's async scope. The HTTP owner calls the same helper only for a fresh
message inside its admitted execution. Armed approval/question gates are
rejected by this helper and their answer/resume handlers do not call it.

The existing handoff pointer now retains the original queued-child ID and
selected work-object identity. A cold continuation rebuilds fresh server data
for that original object, even when the selected workspace object later changes.
It restores the queued-child context and reads the module's immutable Stop
witness before creating a fixed-ID successor. The same original-child witness
also gates every model attempt of an availability descendant.

Main, review, subagent and model-selection factories now capture the trusted
acting user. Late classifier execution uses the prepared-model callback rather
than relying on the original HTTP async context.

## Verification

All commands ran with Node 22.23.2 and pnpm 10.6.1. Model and domain calls were
synthetic; Mastra 1.78, PostgreSQL storage, Redis cache/pubsub, Session controller,
native workflow engine and service source were real.

| Check | Result | Evidence |
| --- | --- | --- |
| Availability + actual service suites | 2 suites, 15 tests passed, 138.687 s | `evidence/service-native-focused-jest.log` |
| Late context refresh + positive observer-only hook | 2 tests passed; 9 intentionally unselected | `evidence/service-native-late-hooks-jest.log` |
| Final queued context/observer hooks + cold gap target/immutable Stop after idle rebind | 4 tests passed; 13 intentionally unselected, 30.260 s | `evidence/service-native-cold-queued-jest.log` |
| Cold native Stop before killed-host lease expiry + cancellation persistence fault | 3 tests passed; 13 intentionally unselected, 28.629 s | `evidence/service-native-cold-stop-immediate-jest.log` |
| Stop in accepted handoff gap without a later pointer rewrite/FINISH | 1 test passed; 16 intentionally unselected, 11.141 s | `evidence/service-native-stop-gap-final-jest.log` |
| Joint native HTTP/model follow-up (includes queued approval/question/Stop) | 6 suites, 117 tests passed | `evidence/service-native-queued-http-final.log` |
| Previously finished HTTP parent, then fresh HTTP and queued approval children | 1 test, both paths passed, 8.970 s | `evidence/service-native-prior-session-owner.log` |
| Existing A11/A12/A13/A14 durable recovery suite after callback-race fix | 4 tests passed | `evidence/service-native-a12.log` |
| Actual service queue after context/router updates | model calls 2, tool calls 1, admission/finish 1 | `evidence/service-native-queued-final.log` |
| Actual queued task + all-model outage/partial output + availability successor | model calls 5, tool calls 1, admission/finish 1 | `evidence/service-native-queued-availability-final.log` |
| Backend TypeScript check | exit 0, no diagnostics | `evidence/service-native-types-final.log` |
| Backend TypeScript after final service scope/context/Stop changes | exit 0, no diagnostics | `evidence/service-native-queue-current-types.log` |
| Scoped `git diff --check` | exit 0 | recorded in this stream |

The actual service crash probe verifies:

1. A fresh backend bootstrap returns promptly (35 ms in the standalone receipt),
   leaves a live owner alone, then automatically resumes the **same native run**
   after SIGKILL and native lease expiry. Exactly two model calls occur: the
   killed attempt and its recovered attempt.
2. After real tool execution and partial provider outages, native queue
   acceptance and old-run settlement occur. The process is killed before the
   successor's first checkpoint. Two fresh processes repair the exact accepted
   successor ID; only one resumed model call occurs, the saved tool result is
   present, and the tool executes once.
3. Revoked membership blocks that same crash-gap continuation before another
   provider call.
4. Stop plus a simulated late queue-pointer write prevents resurrection after
   restart. A separate cross-process Stop during a native wait settles its
   parent and canceled wait in 532 ms without another model call.
5. Forced permanent authentication failure is failed; forced native approval
   suspension is waiting with its resumable snapshot retained.
6. Explicit native queue admission deduplicates the browser message ID and
   retains its original trusted logical request ID.
7. A queued task also survives the actual queue/checkpoint crash gap while
   retaining its original selected object and committed tool result. The resumed
   provider runs once and the tool is not repeated. A separate fresh-process
   case writes only the immutable original-child Stop witness (deliberately no
   logical `stopRequested` flag): bootstrap settles interrupted with zero new
   model calls and no successor checkpoint.
8. A killed host's persisted native approval and question can be stopped before
   the old lease expires. Both leave zero pending gates, keep the same native
   owner/generation without claiming it, record interruption and make zero
   provider/domain calls after Stop or fresh bootstrap. Injected native
   cancellation persistence failure is rejected instead of acknowledged.
9. A Stop during the accepted handoff/checkpoint gap settles immediately with
   no artificial late pointer rewrite and no future native FINISH. Fresh
   bootstrap performs no additional model calls.
10. After an actual HTTP parent finishes its execution and admission, both a
    fresh ordinary HTTP task and a queued task retain their own new execution
    object and open admission across initial/resumed provider calls. They do
    not retain the parent's closed scope; an approval opens no extra admission.

Test resources used isolated `cf_service_native_*` PostgreSQL schemas and
unique Redis prefixes. The reserved real-QA Redis DB 13 was not used. Three
owned failed-probe schemas were inventoried and removed by exact name. Final
`cf_service_native_*` schema inventory was empty; no shared Redis flush or
foreign cleanup was used.

## Evidence limits

- The service probes instantiate the actual service with domain/provider
  dependencies substituted. They do not independently prove the authenticated
  HTTP/browser path or real-provider quality; root/QA owns that acceptance.
- One admission across a live queued task and its availability lineage is
  proven. A genuinely cold recovered driver may create a fresh admission row;
  its prior crashed row must remain honest pending/unknown. This is not a
  promise of one persisted billing row across process death.
- Native waiting does not guarantee provider availability. Explicit configured
  execution limits, real quota/authentication/consent boundaries and user Stop
  remain authoritative. No implicit step/time/dollar cap was added here.
- Native events and caches have configured retention; this does not provide
  permanent replay archival.
- Root/QA separately verified the exact retained old skill task through the
  authenticated local HTTP stand: Stop produced pending `[]` and
  settled/interrupted, made zero provider requests and preserved its unknown
  admitted/cost-null usage row. That receipt belongs to root/QA; the source was
  their prior `b51118eb...` service boot. Root owns final combined-source
  browser/full-suite acceptance after this source freeze.

Source hashes at release are in `evidence/service-native-source-sha256.txt`.
Root owns the final combined acceptance and any subsequent edits.
