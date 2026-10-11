# Mail queue log privacy — dbxe.37

Root owns the coupled SDK/sandbox logging stage. Preserve original criteria,
parent OPEN, active queues and recorded workflow/activity bodies/signatures.

1. Installed SDK1.15 evidence: activity raw errors reach Runtime.logger; V2/V3
   dropped-mail messages reach its workflow sink. V1 console bypasses that sink
   through vm-shared.js. Capture synthetic stdout/stderr on both paths.
2. At orchestrator bootstrap install an SDK Logger adapter that transforms only
   exact mail workflow/activity records. Keep default INFO logger/Core filters,
   original log levels/timestamp and all unrelated logs intact. Whitelist fixed
   event codes, canonical SDK execution UUID and bounded numeric diagnostics;
   never print/inspect user payloads or provider error messages/details/causes.
3. Register one command-free workflow interceptor on main. Its console wrapper
   checks the active workflow on every call (reuseV8Context) and redirects only
   mail calls through the safe SDK sink; non-mail console retains original args.
   No global host console interception or collector/retention settings changes.
4. Focused adversarial logger/SDK sink/activity tests plus an installed native
   Worker on an owned loopback disposable Temporal server with fake activities.
   Exercise unchanged V1/V2/V3 bodies, permanent/transient failures, multiple
   queued letters, unrelated workflow/activities, existing-consumer selection,
   worker restart and replay of synthetic histories. No real mail/providers.
5. Root focused types/docs/process/diff checks, contract preservation and safe
   private source delivery. OPEN31 migration is not performed or closed. OPEN29
   owns chosen exact-source production release; no deployment/full-suite replay.

## Technical Premortem

Verdict: GO WITH CONDITIONS. Runtime Logger -> SDK activity/workflow sinks;
main workflow interceptor -> legacy sandbox console. No queue/state commands.

| Failure | Evidence and gate |
| --- | --- |
| Raw data survives an alternate log path | Confirmed V1 host console bypass; native capture covers V1 plus V2/V3 SDK drops and activity raw errors |
| Other workers lose useful logs | Plausible Runtime logger is process-wide; exact mail types only, unchanged delegate message/meta/level elsewhere, native non-mail probe |
| Shared VM leaks console routing across workflows | Confirmed reusable VM; check active type per call, retain original non-mail console functions; native concurrent mail/non-mail plus replay |
| Redaction changes retries/queue behavior | Avoid payload/error mutation; unchanged historic source digests, native attempt/count/recovery and replay proof |
| Logger initializes too late | SDK install throws after Runtime.instance; entrypoint integration test proves install before Nest creation/worker startup, fail visibly rather than silently bypass |
| Fixture contacts production or leaves resources | Exact cached image, owned random name/loopback port, fake activities only; exact container removal with volumes, pre/post inventory; no general cleanup |

Recovery: roll forward logging adapter/interceptor after a failed local proof;
keep production unchanged until accepted batch29. No application data or mail
queue mutations occur here; no restore/termination/resignal on production.
Deploy rollback remains accepted34 target755d, addressed by release batch only.

Official references (checked11Oct; installed1.15 sources own version facts):
https://typescript.temporal.io/api/classes/worker.Runtime
https://docs.temporal.io/develop/typescript/platform/observability
https://typescript.temporal.io/api/interfaces/workflow.WorkflowInterceptors

Graph: read-only local d724 getTemporalModule neighbors/current hashes matched;
new log modules are deliberately separate Node/workflow-safe modules. Refresh
only after accepted relevant integration when ownership safe. No external API,
query logging or hooks.
