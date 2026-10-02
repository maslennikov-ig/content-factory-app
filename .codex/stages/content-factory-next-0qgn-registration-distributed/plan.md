# Registration distributed budget

Task: `content-factory-next-0qgn.5`. Root owns Beads, integration, final acceptance
and release. This stream is isolated at base
`8c247b33e5492e1a8d2367a618bc80e374a7139d` on
`codex/registration-distributed-2026-10-02`.

## Contract and boundaries

- Registration effects: one reservation per caller for 60 seconds in the
  existing shared Redis. Only the three existing typed pre-write form refusals
  release a reservation. Unknown/partial failures and success hold it.
- Registration abuse: keep the existing independent ten-attempt Nest guard,
  including DTO errors. Only this route receives a stable registration-specific
  JWT-derived minute HMAC; other auth/growth trackers keep their process salt.
- No raw address, email, invitation, cookie or user agent goes into Redis keys,
  values or logs. Effect and attempt HMAC domains are separate. No new secret.
- Atomic acquire reads current and previous minute identities, then stores two
  aliases for one random owner, each with a hard 60-second TTL. Atomic release
  compares that owner on both aliases. Both aliases also reject an old-minute
  request that arrives after the new-minute request.
- Fail closed on absent secret, absent/stand-in Redis, unavailable store,
  malformed replies, timeout or saturation. Effect operations use dedicated
  no-replay duplicates of the existing Redis configuration, a 1-second deadline,
  at most 16 concurrent connections per process and unconditional disconnect.
- The registration guard waits at most one second and allows at most 16 pending
  checks per process. Its cap is released only when the underlying check settles,
  not at the outer timeout. A late existing storage increment may count an
  attempt; it must never cause controller invocation.
- No general storage/service API, schema, dependencies, monitor, credential,
  live account, production, remote delivery or task-tracker writes.

## Documentation decision

`orch-prompts docs-resolve --cwd /home/me/code/content-factory-next --package
ioredis --topic 'eval commandTimeout offline queue
autoResendUnfulfilledCommands'`: installed/lockfile `5.10.0`, exact coverage,
L1 insufficient, first-party fallback required. Read official versioned
[ioredis README](https://raw.githubusercontent.com/redis/ioredis/v5.10.0/README.md)
and installed `Redis.js`, `Command.js`, `redis/event_handler.js`,
`redis/RedisOptions.d.ts`. A timeout alone does not prevent a pending command
from being resent on the shared client's reconnect.

Read [Redis Lua atomicity](https://redis.io/docs/latest/develop/programmability/eval-intro/)
and [owner-checked release](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/).
Use two constant EVAL scripts and owner comparison, with no retry loop.

Graph orientation: borrowed root's read-only graph at
`/home/me/code/content-factory-next/graphify-out/graph.json`, baseline
`c1e44cfdd0ccb5a819e20053b5206634a18a2ec9`; focused
`createTransientClientTracker` query found guard and growth consumers.
Confirmed current tracker source; graph guard source is stale and new limiter
edges are absent. No graph mutation. `graph-reviewed`: read-only orientation.

## Given / When / Then acceptance

1. Given two actual limiter instances and one disposable Redis, when concurrent
   acquisitions target one caller, then exactly one succeeds; a fresh instance
   remains denied and caller B stays independent.
2. Given a held effect slot, when the HMAC minute changes, then the previous
   identity keeps the slot held until its actual Redis 60-second TTL expires.
3. Given a typed ordinary refusal before effects, when it releases, then a
   corrected attempt is immediately admitted while the abuse counter still
   counts both attempts. Unknown errors and successful/partial effects do not
   release. An old owner cannot release a newer slot after expiry.
4. Given two registration guards using actual Redis, when ten requests (even
   safe refusals or DTO errors) have been charged, then a second/fresh guard
   denies request eleven in the same HMAC minute. Preserve the existing minute
   rotation semantics; this is not a new rolling attempt policy.
5. Given missing secret, MockRedis, disconnected store, slow connect/EVAL or a
   full process connection cap, when registration is attempted, then it fails
   closed before account/mail work; timed-out connect never sends a late EVAL,
   all own connections disconnect, and no unhandled errors expose metadata.

## Bounded work and evidence

1. Add focused regression fixtures/tests and record relevant RED against base.
2. Implement atomic Redis limiter, registration HMAC, narrow async controller
   integration and registration-only guard routing/fail-closed deadline.
3. Run focused GREEN, opt-in actual Redis tests, relevant auth/growth regressions,
   targeted type check and `git diff --check`; no full suite.
4. Document actual store/window/privacy/cancellation boundaries. Record exact
   commits, commands/counts and disposable resource IDs; remove only the owned
   local test container. Leave branch/worktree for root acceptance/integration.
