# dbxe.19 — independent token refresh accepted locally, 10 October 2026

Only `content-factory-next-dbxe.19`; baseline
`d8862356e5dbeeea84f51ad0c2060303e7427c16`. Original criterion is verbatim in
[plan.md](plan.md); all 30 original epic criteria are retained. Epic stays OPEN;
dbxe.8 retains its original next full release gate. No automatic next stage,
push or deployment.

The batch continues after an individual failed/empty token refresh. Original
credentials stay, the existing tenant-scoped reconnect marker is saved before
notification, and later channels run. Notification failure has its own count;
lookup, marker and save errors count that row as failed and allow later work.
Initial candidate-query failure remains fatal. Existing query filters, provider
validation, scoped writes and credential-cohort semantics remain.

Service/command result has only total, refreshed, reconnectRequired, failed and
notificationFailures. The refresh command prints one bounded JSON result;
empty/all-success batches exit0. Partial/reconnect/notification/save failures
exit1 after the batch. A fatal query exits1 with a fixed error and no invented
totals. Tokens, IDs/names and raw provider/database errors are absent from output.

Dribbble no longer calls Pinterest or any network endpoint to renew its token.
Official v2 OAuth docs do not document a refresh grant, so it explicitly returns
DRIBBBLE_RECONNECT_REQUIRED with empty credentials/zero expiry. Existing batch
and single-channel paths retain the stored secret and require reconnection.
Authorization/publishing and generic provider interfaces remain unchanged.

Root acceptance PASS: **3 Jest suites / 93 tests, zero skips**, including **30
new cases** and **6 actual Nest/yargs command subprocesses**. First/middle/last,
throwing/empty/malformed/all-failed refreshes, two tenants with a shared external
ID, notification/lookup/marker/save failures, candidate filters and Dribbble
batch/single-channel cases pass. Actual service/repository logic uses a memory
Prisma adapter; providers and notifications are inert. Backend, orchestrator
and commands TypeScript, docs and diff checks pass.

Installed Temporal metadata's actual discovery extractor still registers the
flat refreshToken on PostActivity, with its existing error-to-false wrapper;
IntegrationsActivity's same-name method remains undecorated. All **35 tracked
Temporal files and the full signature baseline remain byte-identical**.
The original diagnostic failed specifically on skipped later channels and the
Dribbble cross-provider request. Final acceptance corrected a test's use of the
SDK property getter to the aggregate extractor actually used by discovery;
the failed log is retained. No application fix was needed for that test issue.
Receipt: [root-acceptance.actual.json](root-acceptance.actual.json).

Root-owned closeout-lite, no agents or extra reviewer. Owned Nest test contexts
close and command processes exit; no DB, provider, relay or server connection
was opened. Unrelated work/prior evidence remain. docs-reviewed: updated —
[batch output/exit/reconnect operation](../../../docs/operations/token-refresh.md),
navigation and handoff. graph-reviewed: used — stale46ec4108 bounded class
queries; current service/callers inspected, Dribbble/manager hashes match,
truncated neighborhoods do not imply complete callers; no refresh/API/hooks.

Local acceptance is not PostgreSQL, deployed renewal, provider availability or
real notification proof. Credential rotation can precede a persistence error;
failed counts do not assert rollback or a persisted reconnect marker. Existing
cohort writes are not a transaction across providers. No cache, lock, automatic
retry, activity/workflow migration, full suite/build, real token mutation,
schema or live service change was introduced. Operator scripts should inspect
a completed partial summary before retrying. Original SaaS/client/legal/research/
security requirements and all existing defers remain.

Next candidate: **dbxe.20**, bound the growing histories of periodic processes
with compatible versioned successors. It remains OPEN; stop for owner choice.
