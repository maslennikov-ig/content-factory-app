# Drafts with no posting times

Local source candidate for `content-factory-next-2q28.2.1`; root alone owns
integration, release, live fixture verification and task acceptance.

## Resulting path

The existing `PieceService.prepareAdapt` scopes the piece/channel to the
organization. Before starting the generation graph, `adapt` resolves the
effective mode again through `adaptPlanMode`: the piece's own setting wins,
otherwise the current channel setting applies. Only `draft` sends
`{ draftOnly: true }` in a separate third server argument to
`AgentGraphService.start`. Missing optional plan storage returns null and keeps
the old preliminary slot search.

This argument is not a public DTO/property and is never copied from body or
body.options. The existing public PostsController calls start with two
arguments. LangGraph declares/carries the trusted flag; postDateTime returns
without any scheduler/integration/date query when it is exactly true.

The model and material paths do not change: the same existing usage scope and
model attempts run, without new model/search/image calls or retries. The
generated content and provenance reach the existing draft/derivation save.
The pre-existing fallback date is DRAFT storage metadata, not a newly selected
publication time. Draft mode returns plan `draft`, displayed date null, no queue.

After save the existing short channel lock re-reads the effective mode and
applies its existing channel scheduler. A mode change during generation is
still decided there, with the existing validation/queue/Temporal rules.
Reserve/autopilot preserve their preliminary global-slot path and final
channel-specific scheduler; this repair does not replace either contract.

## Slot refusals and compatibility

`PostsService.findFreeDateTime(orgId, integrationId?)` reads existing posting
minutes with the same tenant/channel filtering. Empty lists, malformed stored
JSON/list shapes, or any non-integer/negative/>1439 minute are refused using
the existing `BadRequestException` (HTTP 400 for public find-slot routes).
It does not silently filter invalid values or manufacture a publication time.
Ordinary dependency errors are rethrown. SyntaxError/TypeError from the existing
JSON/list reader are converted to the fixed `Invalid posting times.` refusal.

For valid input, the existing repository keeps selecting the earliest future
unoccupied minute, UTC today then subsequent UTC days. Response formatting
remains `YYYY-MM-DDTHH:mm:00`. The recursive scan stops after today through day
+366 (at most 367 daily reads), matching the existing plan scheduler horizon.
If all are occupied it refuses rather than looping. This is a read-count
bound; it does not add a timeout for a stalled database call.

For a streamed non-draft generation refusal, existing error-stream handling
finishes the request and no draft/adaptation success is emitted. A failed draft
save or failed derivation save likewise never emits an adaptation success.
The latter may retain the already saved DRAFT as before; this slice adds no
deletion, transaction or compensation.

## Proof boundary

Focused tests exercise actual PostsService, IntegrationService and both
repository read methods against substituted ORM ports, and actual
PieceService -> compiled LangGraph -> owned draft save against substituted
repository/model ports. Actual public PostsController consumes adversarial
body flags and still passes only two start arguments. Business dates are
pinned; old infinite scans have a bounded diagnostic sentinel in RED.

Coverage includes empty/malformed draft bypass, own overrides/current/locked
mode changes, non-draft typed refusal, valid today/next-day/midnight/final
horizon slot, exhausted horizon, foreign piece/channel, ordinary dependency
error, mode-read/save failure, missing optional store, one generation/usage
scope and no additional scheduler/model/write calls. Commands, exact counts
and hashes are recorded separately in verification.json after final checks.

No actual database/provider/model/host request or live B1 execution occurred
in this stream. It proves this local causal correction, not the cause of an
earlier OOM, a production recovery, universal scheduling correctness or whole
EPIC/SaaS acceptance.
