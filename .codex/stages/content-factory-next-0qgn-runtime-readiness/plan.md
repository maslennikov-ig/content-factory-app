# Runtime readiness correction — accepted implementation plan

Goal: replace false-positive queue health and add bounded app dependency readiness
under content-factory-next-0qgn.5. Root approved the bounded design and delegates
implementation in this isolated worktree; root owns acceptance, integration,
release and all live verification.

Base: `8c247b33e5492e1a8d2367a618bc80e374a7139d`.
Branch: `codex/runtime-readiness-2026-10-02`.
Accepted read-only source map:
`/home/me/code/content-factory-next/.codex/stages/content-factory-next-0qgn-followup-release/evidence/saas-runtime-monitor-readonly.md`,
SHA256 `c77b809559d157cb9f15de75659a5a2d3459188691858013fc8ef0c4ef4e17f0`.
No memory facts are used. No new product decision or external API research is needed.

## Cohesive scope

Owned files: monitor controller; new monitor service; exact API module provider
import/registration; one focused readiness suite; new operations readiness doc;
this stage plan/evidence. Preserve every other file and all other owners.

Public contract: known successful queue response remains the same two fields.
Unknown queue is 404 with no dependency calls; unavailable is sanitized 503.
New `GET /monitor/ready` requires actual app-role ORM read, real Redis PONG,
configured Temporal namespace and fresh main workflow/activity pollers.
A successful empty ORM read is valid. Main uses both task types; providers
use activity only. Names derive from existing provider-worker rules and never
allocate request-owned cache keys. Locally excluded known queues can be polled
elsewhere. Poller last access must be present, valid, non-future and <=120s.

Implementation: borrow existing PrismaService, ioRedis and TemporalService raw
client/connection. No new clients/connections, resource closes, writes, intervals,
model/provider/workflow/activity execution, schema/dependency or throttle changes.
Use real Temporal RPC deadlines. At most 2s response wait; fixed 5s success/failure
cache and fixed-key coalescing. Keep one actually unfinished probe per key after
response timeout; observe late rejection, discard late success, never accumulate
replacement I/O while old operation remains unresolved. Owned timeout cleared.

Non-goals: alter root liveness/Docker/release/retention/orchestrator; accept
deployment/SaaS readiness/telemetry/retention/provider behavior or reconcile any
separate abuse, ledger, storage, backup or legal boundary.

## Verification and delivery

- Create own cached offline frozen pnpm installation only if dependencies absent;
  no shared node_modules edits and no network install/scripts.
- Add a meaningful RED on real current controller before production changes.
  Focused service fixtures then cover failure/cuts, secret-rich errors, all task
  types, namespace binding, timestamp boundaries, concurrency, stale response,
  stalled ORM/PING and late resolve/reject, cache TTL and no mutation/resources.
  Verify actual controller + route/public envelope + API provider binding.
- Run focused RED/GREEN; then exact focused suite, backend types and diff checks
  once on final source. No broad suite/live shutdown/provider/host calls.
- Record commands, tool versions, skip count, input hashes, limitations and
  resource inventory. Commit only owned files on isolated branch, return exact
  SHA/hash map and stop editing. Root alone handles combined release acceptance.

Graph-reviewed: accepted root local graph orientation is reused, with its older
`c1e44cfd` baseline explicitly limited; exact current owned files are read here.
Do not refresh or mutate another owner's graph.
