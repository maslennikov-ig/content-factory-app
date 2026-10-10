# Independent channel token refresh

The `refresh` command processes the existing due-channel query sequentially.
A refused, throwing or empty token refresh preserves that row's stored tokens,
marks it `refreshNeeded` and continues with later candidates. Persisting this
marker precedes the reconnect notification. A failed notification cannot undo
the marker or stop other channels.

Each row has one counted outcome: refreshed, reconnectRequired or failed.
Provider lookup, marker or credential-save errors are failed; they are not
reported as successful persistence. Later candidates still run. A failure of
the initial candidate query remains fatal: it cannot become an empty success.
The existing deleted, between-step, reconnect-needed and expiry query filters,
tenant/provider write predicates and credential-family sharing remain unchanged.

The command prints one count-only JSON result, for example:

```json
{"event":"token_refresh_batch","total":3,"refreshed":2,"reconnectRequired":1,"failed":0,"notificationFailures":0}
```

The three row outcomes sum to total; notificationFailures is additional.
The command also returns these counts to its direct caller. Exit0 means an
empty or fully successful batch. Exit1 signals reconnectRequired, failed or
notificationFailures **after all candidates have been processed**. Initial
query failure also exits1 with the fixed error `Token refresh batch could not
start` and no fabricated totals. Output has no channel names/IDs, tokens, URLs,
provider replies or raw transport/database errors.

A reconnect-required row keeps its original credentials and existing content.
Use the existing channel reconnection flow. A failed count means lookup/marker/
save needs inspection; it does not assert that a reconnect marker persisted.
A save can fail after a provider has rotated its credential or after a partial
existing cohort write. The command does not roll credentials back, replay a
successful sibling or promise a transaction across providers.

## Dribbble

The published [Dribbble v2 OAuth flow](https://developer.dribbble.com/v2/oauth/)
describes the code/access-token exchange; it does not document a refresh grant.
This implementation therefore chooses explicit reconnect-only behavior.
Dribbble.refreshToken returns the existing AuthTokenDetails error code
`DRIBBBLE_RECONNECT_REQUIRED`, empty credentials and zero expiry, without a
network request. It never sends Dribbble credentials to Pinterest. Both batch
and existing single-channel refresh paths consume the invalid credentials as
requiring reconnection and preserve the stored secret. Dribbble authorization
and publishing are unchanged; no new renewal protocol is inferred.

## Acceptance and delivery boundary

Local tests execute the actual service/repository with memory persistence,
fake providers/notifications, and real Nest command discovery/yargs in separate
processes. They prove first/middle/last failures, malformed replies, ancillary
and persistence errors, two-tenant preservation, bounded output/exit status,
Dribbble reconnect and the installed Temporal metadata for the flat handler.
They do not establish PostgreSQL or live-provider renewal/notifications.

The flat `refreshToken` activity still belongs to PostActivity; the similarly
named IntegrationsActivity method remains undecorated. All 35 tracked Temporal
sources and their signature baseline are unchanged. No historical workflow
migration/cancellation or source-history retry change is performed. Deployment
and the original dbxe.8 full release gates remain separate. Stage evidence:
`.codex/stages/content-factory-next-dbxe-token-refresh-stage/`.
