# CF-only error retention — feasibility result, 12 October 2026

Beads: `content-factory-next-0qgn.5.1` CLOSED for feasibility only; retention policy
choice accepted: keep90 days, explicitly defer30. Parent gate0qgn.5 remains BLOCKED.
Audit dbxe stays CLOSED; store32 independent DEFERRED; other owner defers unchanged.

## Owner decision, 12 October 2026

Exact reply: «Оставить 90 дней с пометкой (рекомендую)».
Keep the current90-day shared policy; original30-day retention/pruning target is
explicitly owner-DEFERRED, not implemented or rewritten. No due date or automatic
resumption. Record the defer under parent0qgn.5, whose other acceptance gates
remain unfinished. No separate janitor, collector or application delivery.
Decision evidence: [owner reply](owner-decision.actual.json).

## Confirmed current state

GlitchTip6.0.5 is the existing shared collector. Both effective event/file
lifetimes are90 days. Runtime Project has no retention override fields.
Own project:15 grouped issues,100 events;39 events older30days under both
server receipt (native UUID7) and payload timestamp. Own DIF records:0; this
is not universal proof of exclusive FileBlob ownership. Native version setting
and five installed source files match the officialv6.0.5 source archive.
Application ec58 is healthy with0 container restarts. All host inspection used
read-only DB connections; no event bodies, credentials or account identifiers
were printed/stored in tracked evidence. No rows/config/runtime changed.

## Why a project setting cannot deliver30 days

The stock management command drops entire shared daily event partitions and
weekly aggregate/tag/stat partitions. It cannot filter to one project, so a
30-day global setting would also remove other projects' history. Native age is
server receipt time, not the caller-supplied event timestamp.
File cleanup is global; deduplicated FileBlob rows have no project ownership.
A project DIF link alone does not prove an exclusively owned physical blob.
v6.0.5 also reads the event-life environment variable for the file-life setting;
current equal90/90 settings are confirmed, and no global patch is justified here.

## Minimal choices

1. Retain the existing90-day shared policy with explicit owner-approved defer
   of the original30-day requirement. No collector fork, additional service,
   recurring destructive helper, app release or new provider setup. This is
   recommended given the owner's preference to reduce complexity; it does not
   satisfy or silently rewrite the original operational acceptance.
2. If30days is required now, implement a scoped native-Django ORM janitor,
   with dry-run default and an explicit application boundary, in a following
   implementation stage. Never call global maintenance, Project.delete or
   drop partitions. Filter events through Issue.project, use native receipt
   age, and handle corresponding aggregate/tag/project-hour rows and empty
   groups consistently. Preserve groups containing newer events and every
   foreign project. Shared File/FileBlob/release resources stay untouched;
   unexpected owned file references must block an unsupported cleanup.

A dedicated collector can use stock instance-level retention but adds another
service/database and conflicts with this repo's reuse-existing-collector rule;
it is not selected. The researcher proposed it as an isolated operating option;
root accepts the source findings and adjusts the recommendation to owner scope.

## Proof required for option2

On the exact native schema in an isolated database: mixed own/foreign projects,
old/recent/boundary events; backdated client timestamp with recent receipt;
aggregate/tag/hour consistency and a group containing both old and recent
records; no broad cascade or partition drop; fail-closed version/target drift,
repeat safety and bounded batches. Read-only candidate inventory and exact
pre/post counts must precede any live apply. File references require separate
ownership proof; no file30-day acceptance is inferred from0 current DIF rows.
Use a caller-pinned clock for tests and never change the live clock or old data.
No app rebuild/full suite/deployment is needed for this investigation.

## Evidence

- [Sanitized runtime metadata](runtime-readback.actual.json).
- [Official-source byte match](official-source-match.actual.json).
- [Source research](research/source-notes.md) and
  [versioned support findings](research/official-support.actual.json).
- [Stage scope/ownership](plan.md).

Root accepted both research artifacts and all five source matches. The bounded
worker is complete and created no runtime/worktree resources; ignored source
archive retained, no broad cleanup. `pnpm run docs:check` PASS with Node22.23.2
and pnpm10.6.1 (195 files checked). Root Git diff acceptance is recorded in
[acceptance](acceptance.actual.json). This closes the investigation only;
owner-approved90-day continuation is recorded; actual30-day deletion is deferred.

docs-reviewed: updated — current runtime finding and next-stage entrypoint saved.
graph-reviewed: no-change-needed — no application or collector source changed;
known native files were inspected directly for version/support evidence.
