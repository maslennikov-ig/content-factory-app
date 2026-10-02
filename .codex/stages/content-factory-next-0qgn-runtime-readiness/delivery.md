# Runtime readiness candidate delivery

Task: content-factory-next-0qgn.5. Local candidate only; root owns acceptance,
integration, release, live readback and tracker state.

Base `8c247b33e5492e1a8d2367a618bc80e374a7139d`;
branch `codex/runtime-readiness-2026-10-02`;
worktree `/home/me/code/content-factory-next-worktrees/0qgn-runtime-readiness-20261002`.
Exact delivery commit is returned in the completion event; this proof binds
source by content digest and the base, without a self-referential Git SHA.

## Result

- Known queue success preserves the old two-field response. Unknown is 404
  before I/O/cache admission; known unavailable is fixed sanitized 503.
- New public `GET /monitor/ready` checks the existing ORM client, actual Redis
  PONG, configured Temporal namespace and fresh main workflow/activity pollers.
  Provider queue checks require activity pollers only.
- Actual SDK `connection.withDeadline` bounds Temporal reads. Response budget 2s,
  success/failure cache 5s, recency <=120s. Fixed key count, coalesced concurrent
  requests, one actually unfinished probe per key after timeout. Late errors are
  observed and late success cannot overwrite the failure.
- No new clients, separate connections, intervals, resource closes, writes,
  provider/model calls or workflow execution. Existing root liveness and
  Docker/switch/retention gates compare byte-for-byte with the base.
- Operations contract is in `docs/operations/runtime-readiness.md`; readiness
  is not publishing, backlog, storage, telemetry, tenant or SaaS acceptance.

## Evidence

Meaningful controller RED on unchanged base: **2 failed / 1 passed**.
Timestamp-shape RED: **5 failed**, development name filter excluded 52 other
cases; this is not an acceptance run. Initial unfiltered GREEN was 52/52.
Final complete focused suite: **57/57**, **zero skips**, detectOpenHandles empty,
natural exit 0 without force-exit/suppression. Real controller/service and Nest
HTTP/module metadata are exercised with fake dependency ports, including
absence/cuts, timestamps, concurrency, stale/late results and stalled ORM/PING.
Backend types exit 0; diff check exit 0. Exact commands, tool versions, source
hashes and unchanged gate hashes: `verification.json`. Raw logs/results retained.

Own offline frozen pnpm installation: 2977 packages, downloaded 0, scripts
ignored. Prisma 6.5.0 generated only this worktree's client; no DB operation.
Its raw generator log is retained losslessly as `prisma-generate.log.gz`.
Node 22.23.2 / pnpm 10.6.1. Installed SDK declarations/source were used for
the borrowed client, namespace and genuine gRPC deadline; no external docs/API call.

Input SHA-256:

| File | SHA-256 |
| --- | --- |
| monitor.controller.ts | `2219503eed8add447069a30c06c5f5a67457a3631bca9296fa34acdce6d63d99` |
| runtime-monitor.service.ts | `890f9bb68dde11a98614668f76eddf2bf28beaa8200458555418caeab8abeb87` |
| api.module.ts | `7c48cd0aad75c7e8fd2e784e59827486fd0745c6ddcbe5630205f251ebcd7536` |
| runtime-monitor.readiness.test.cjs | `687c53e75fd435826e545f642167da0d02f0464b7f6943185599dc54281d8687` |
| runtime-readiness.md | `edf61c1000b33fadc171d1f96fd14b3cbd578a20549d2268425c2fddecc761cc` |

## Limits and resources

No production/dependency services or providers were contacted. Real SDK/server
interoperability and live route/readiness remain root-owned. Cache/coalescing is
per backend process; a permanently unfinished ORM/PING stays unavailable until
it settles or the process restarts. No shared resource is reset by monitor.

All owned ephemeral Nest HTTP fixtures closed in finally, request sockets use
agent:false and a finite timeout, test timers are zero, and test sessions exited.
Retain the isolated worktree, generated client/node_modules and evidence for
root review/integration; no shared cache or other owner's files/resources pruned.
Primary checkout, frozen search worktree, accepted read-only report and all
concurrent workers were preserved. Writer freezes after the completion event.

Graph-reviewed: accepted local graph orientation/source map reused, current base
files confirmed; older graph baseline is not completeness proof. No graph refresh,
hook/logging/config change, subagent, remote, host, account, Beads or paid action.
