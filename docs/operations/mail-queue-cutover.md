# Mail queue V2 → V3 transition

The owner authorized whole-dbxe completion on 11 October 2026. The actual
`default` namespace now runs `sendEmailWorkflowV3` on `main`, preserving singleton
`send_email_v2`. Historical V1/V2 workflow and activity bodies are unchanged.
No letters were sent as a production test and no queued payload was copied into
Git or ordinary logs. Historical delivery/provider acceptance is separate.

Before the transition, exact history conservation established two initial
letters plus sixteen admitted signals, eighteen scheduled and completed
activities, zero failed activities, zero pending letters, activities, timers or
workflow tasks. The downloaded 260-event V2 history replayed successfully
against the unchanged workflow with SDK 1.15.0. A list of Running workflows
alone cannot establish that the queue is empty.

## Empty-queue procedure

1. Verify the exact owned application, release, namespace, mail ID/type/run and
   all admission producers. Account for HTTP callers, background digest and
   administrative commands. Check native worker health and current histories;
   preserve every other workflow/container. If any caller is unaccounted for,
   stop before mutation.
2. Download history and description privately. Run
   `node scripts/operations/inspect-mail-queue-state.cjs <history> <description>`.
   It validates the supported workflow/signal/activity contracts and admitted
   occurrence conservation; output has counts only. Exit 2 means pending work;
   exit 1 means unverifiable shape/codec/scope. Neither permits a cutover.
3. Close admission briefly. This deployment stopped only its `backend` and
   `orchestrator` PM2 roles; `frontend`, databases, Temporal and other projects
   remained running. HTTP requests during this short window can fail and be
   retried. Verify both stopped roles/PIDs, then read the exact old run twice:
   both complete histories must remain identical, empty and fully settled.
   If pending work is found, resume normal workers/admission and drain it;
   never terminate it, reconstruct/re-send it speculatively, or mutate V2.
4. Terminate **only that proven-empty run**, then start V3 with `{queue: []}`
   under the same workflow ID and `main` task queue. Reconcile an uncertain
   start by describing the current execution before another start. Resume both
   roles even if the operator procedure fails. If V3 is not Running, repair
   its start while admission remains closed; preserve the empty-state proof.
5. Require a completed workflow task from the actual deployed V3 worker, normal
   native readiness and API availability. Keep its exports in any code rollback.
   Existing verified rollback images already contain V3 and the same consumer
   selector, so they attach to the current singleton with `USE_EXISTING`.
   Do not terminate a V3 queue after normal admission resumes.

The authorized operation completed in 11.21 seconds. Old eighteen completed
letters were not re-enqueued. The new worker completed its first task, with an
empty four-event history, and all three application roles were online. Root
evidence: `.codex/stages/content-factory-next-dbxe-completion-stage/`.

The separate native synthetic transition proves three pending legacy letters
drain in priority order, no duplicate effects, V3 rotation after thirty settled
attempts including failures, one pending letter carried to the next run, and
three successful history replays. This is local fake-provider evidence. The
actual serving V3 source bytes match that native proof; the live transition
does not create thirty synthetic messages to demonstrate the bound.

## SDK/operational boundaries

Supported history payloads are Temporal's `json/plain` and `binary/null`.
Unknown event/codec/type/argument shapes fail closed and require an updated
inspection with actual contract evidence. History contains mail payloads and
must remain private; ordinary-log redaction does not redact Temporal history.

Termination closes an execution without running workflow cleanup, which is why
the procedure requires complete settled empty state. See the primary
[Temporal termination contract](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow/cancellation-and-termination.mdx)
and [message passing contract](https://docs.temporal.io/develop/typescript/workflows/message-passing).
