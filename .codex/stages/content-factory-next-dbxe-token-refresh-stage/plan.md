# dbxe.19 — independent channel token refresh

Owner-selected bounded local stage, 10 October 2026. Baseline
`d8862356e5dbeeea84f51ad0c2060303e7427c16`. Root owns implementation, proof and
closeout, no extra agents. Only .19 is selected; Beads owns statuses, epic and
.8 remain open. No full suite/build, real token/provider call, push or deployment.

## Original criterion (verbatim)

First/middle failure preserves original secret, marks reconnect and permits later valid channels; command exposes partial result. Dribbble expiry never requests Pinterest: use documented Dribbble refresh or explicit reconnect-only capability. Preserve flat refreshToken activity alias/history; no real token mutations.

## Specification and cohesive plan

1. Preserve all 30 original criteria, 35 Temporal source files and the complete
   signature baseline. Reproduce the batch stopping before a later healthy
   channel, then use focused cases for the complete fix.
2. IntegrationService.refreshTokens continues sequentially after each row.
   Failed/empty refresh leaves stored credentials unchanged, marks refreshNeeded
   before notifying, and proceeds. Notification failure cannot undo the marker
   or stop the batch. Lookup, marker or save errors are counted per channel;
   they cannot prevent later work or be counted as successful persistence.
   Initial candidate-query failure stays fatal, never an invented empty batch.
3. Return count-only totals: total, refreshed, reconnectRequired, failed and
   notificationFailures. The three channel outcomes sum to total; notification
   errors are additional. The refresh command prints that bounded result and
   returns it; any reconnect/failure/notification problem yields process exit1
   after the batch, while empty/all-success batches exit normally. No tokens,
   channel IDs/names, provider error text or new monitoring framework.
4. Dribbble.refreshToken returns the explicit existing AuthTokenDetails.error
   code DRIBBBLE_RECONNECT_REQUIRED with empty credentials/zero expiry, without
   any network call. Official Dribbble OAuth docs describe access-token exchange
   but do not document a refresh grant. Choose reconnect-only; do not invent an
   endpoint or change authentication/publishing or generic provider interfaces.
5. Keep existing scoped repository updates/credential-cohort behavior. No schema,
   concurrency lock/cache, new activity alias/decorator or Temporal change.
   Focused proof covers first/middle/last and thrown/empty token failures,
   ancillary/save/marker failures, two tenants, command output/exit behavior,
   Dribbble batch and existing single-channel refresh paths. Type-check backend,
   orchestrator and commands; inspect docs/diff and immutable contracts once.
6. Update operations/navigation/handoff, close only .19, scoped local commit,
   preserve all remaining work and stop for the next owner-selected stage.

## Compact premortem — GO

| Risk | Evidence / mitigation | Disposition / owner |
| --- | --- | --- |
| Later channels skipped / partial success hidden | Confirmed return/true; real service/command cases and count/exit summary | preflight / root |
| Notification failure blocks reconnect flag | Confirmed notify-before-marker order; persist first, count notification errors separately | preflight / root |
| Empty or failed credentials overwrite another channel | Existing validator/scoped Prisma updates; first/middle and two-tenant preservation proof | preflight / root |
| Dribbble sends another provider's secret/request | Confirmed Pinterest copy; explicit reconnect-only result, fail-on-network fake | preflight / root |
| Historical refreshToken handler silently replaced | Confirmed flat PostActivity alias; all 35 source/signature bytes remain | preflight / root |
| Executor expands scope or claims live recovery from fixtures | Root-owned exact diff and local-only evidence; no dependency/UI/Temporal refactor | preflight / root |

Rollback is a local code revert; no live state is changed. A later deployment
does not roll back legitimately refreshed tokens or clear reconnect markers.
graph-reviewed: used — stale46ec4108 focused IntegrationService/DribbbleProvider;
service changed since graph, exact current methods/callers verified. Dribbble and
manager hashes match; neighborhoods truncated, no completeness claim. No refresh,
external extraction or hooks. Primary research: https://developer.dribbble.com/v2/oauth/.
