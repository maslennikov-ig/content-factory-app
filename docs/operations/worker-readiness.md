# Native worker readiness

The container health command requires API liveness at `/api/` and the native
orchestrator's loopback `/health/status`. The orchestrator returns HTTP 200 with
`{"status":"ok"}` only when every configured local worker is running and its
required pollers are available. Otherwise it returns HTTP 503 with
`{"status":"error"}`. The response contains no worker identities, client
configuration or exception details. Nginx does not expose this worker endpoint.

Readiness consumes the existing registered Temporal worker options. The default
placement remains 32 provider activity queues plus `main`; only `main` requires
workflow pollers as well as activity pollers. `EXCLUDE_QUEUE` retains its existing
placement meaning. An empty local worker placement is unavailable. In-flight
task counts, queue backlog and outstanding-poll flags are not readiness gates:
an idle queue is healthy when it still has running pollers.

On every request, readiness reads the existing SDK worker state and poller state.
It reads Temporal task-queue poller metadata for the current worker identity,
requiring `lastAccessTime` within 120 seconds. A recently stopped process's
identity cannot mask a replacement worker that has not yet polled. Replacing a
worker also invalidates its metadata cache, even if its identity stays the same.

One metadata batch has a shared two-second RPC deadline and at most four active
`describeTaskQueue` calls. Concurrent readiness requests share that batch, and
the result is cached for five seconds. A timed-out operation retains admission
until its native RPCs settle, so repeated requests cannot multiply stuck work.
The default batch reads 34 task types: activity for all 33 queues and workflow
for `main`. No workflow is started, scanned or signalled by readiness; no
database, provider, model or mail activity is invoked. Local lifecycle failure
overrides a cached healthy metadata result immediately.

The health shell bounds the API curl to one second and the worker curl to three
seconds, inside the existing five-second Docker timeout. It uses
`ORCHESTRATOR_PORT` when set, otherwise 3002. Docker retains its existing
30-second interval, 180-second startup period and five retries: the command
refuses as soon as a worker is unavailable, while Docker's final `unhealthy`
state follows those existing thresholds. PM2 remains responsible for process
restart; health itself does not restart or mutate any worker.

These APIs were verified against installed `@temporalio/worker` and
`@temporalio/client` 1.15.0 and `nestjs-temporal-core` 3.2.3. The installed SDK
types define `Worker.getStatus()`, `Worker.options.identity` and
`Connection.withDeadline()`; core's exported `TEMPORAL_MODULE_OPTIONS` contains
the registered placement and `TemporalService.getWorker(queue)` supplies the
actual worker. Authoritative references:
[Worker API](https://typescript.temporal.io/api/classes/worker.Worker),
[SDK worker source at v1.15.0](https://github.com/temporalio/sdk-typescript/blob/v1.15.0/packages/worker/src/worker.ts),
[Connection API](https://typescript.temporal.io/api/classes/client.Connection),
[Temporal task-queue metadata](https://docs.temporal.io/develop/worker-performance/task-queues).
The 120-second threshold is this product's explicit readiness policy, shared
with the backend runtime monitor; it is not a Temporal guarantee about provider
effects or host recovery.

## Bounded local proof

The dbxe.7 stage's `native-readiness.py` creates fresh isolated PostgreSQL,
Redis and Temporal resources on an internal Docker network, with no host ports.
It derives a local candidate from the existing release image using freshly
compiled current orchestrator modules and the exact production health command.
It compares source/dist/image file hashes and checks the inherited Temporal
SDK/core versions. The inherited backend only supplies the API-liveness check.

The proof requires healthy idle 32+main pollers, stops only its owned native
orchestrator, verifies API200 plus refused readiness/health, queues an owned
missing-integration workflow, and restarts the worker. Readiness must recover
and the safe read-only activity must complete. The app retains its 1792 MiB
memory and swap cap. Cleanup checks exact container/image/network ownership
and preserves the foreign inventory.

This derivative proof covers the changed readiness modules and native health
wiring. It does not replace a full current release image, task8's exact-SHA
release suite, production deployment or provider/client acceptance. No workflow
or activity contract, database schema, process placement or concurrency option
changes in this stage.

## Current exact-release proof — 12 October 2026

The deployed `ec58af8b31b1` image includes the readiness implementation above.
Read-only production checks returned 200 for backend dependencies, main queue
and the private worker endpoint; all three PM2 roles were online with zero
restarts. Production processes and dependencies were not stopped for testing.

The [operational completion stage](../../.codex/stages/content-factory-next-ops-completion-20261012/outcome.md)
used the unmodified current image with fresh isolated PostgreSQL, Redis and
Temporal on an internal Docker network. All 1,236 compiled files matched the
reference; both scanners exclude only the same compiler cache. With its own
Redis paused, backend dependency readiness returned 503 and recovered to 200.
With its own orchestrator stopped, the API stayed available but the native
health command refused in 85 ms. After restarting that worker, one queued
missing-integration workflow completed once with one read-only activity, and
native health succeeded in 76 ms. This is safe workflow recovery evidence,
not proof of exactly-once external provider effects or host-loss recovery.

The combined harness later failed to start registration tests because the
runtime image intentionally lacks pnpm. The raw failure remains recorded;
runtime assertions were accepted separately and only registration was rerun
with a read-only mount of the existing pnpm tool. All owned disposable
containers and networks were removed; the release image and foreign inventory
were preserved. No application source, workflow or activity contract changed.
