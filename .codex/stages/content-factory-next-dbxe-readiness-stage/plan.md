# Native worker readiness — dbxe.7

Owner: delegated readiness executor; final acceptance, Beads, handoff and delivery belong to root.
Base: `8e5fcdc870e8bc3f18f097417daa26c5166014c5`.

## Outcome and boundary

Readiness fails when a configured native worker/poller is unavailable, when its
current identity has no recent Temporal poller, or when metadata cannot be read
within a bounded budget. Healthy idle queues remain ready. The Docker health
command requires both API liveness and private orchestrator readiness. The
existing 32 provider activity queues plus main and the 1792 MiB cap stay intact.

No workflow/activity bodies or contracts, worker placement/options, production,
provider calls, packages, schema, release, shared monitoring or backup restore.
Other tracked/untracked work is preserved.

## One cohesive implementation

- `apps/orchestrator/src/worker-readiness.service.ts`: use injected existing
  Temporal options/client/workers. Check local lifecycle on every request;
  coalesce metadata reads, four concurrent RPCs maximum, two-second deadline,
  five-second result cache and 120-second poller recency. Match current worker
  identity and reject old identities after restart. No backlog/workflow scans.
- `apps/orchestrator/src/health.controller.ts` and `app.module.ts`: existing
  `/health/status` becomes ready200/unavailable503 with generic envelopes.
- `var/docker/healthcheck.sh` and `Dockerfile`: keep API liveness, require
  loopback orchestrator readiness and bound curl durations.
- `tests/orchestrator.worker-readiness.test.cjs`: focused observable regressions
  for idle, lifecycle/poller loss, missing/stale/old identity metadata,
  timeout/refusal, bounded admission/cache and real Nest/health wiring.
- `docs/operations/worker-readiness.md`: operational behavior and proof boundary.
- `native-readiness.py` here: fresh internal Docker network/PostgreSQL/Redis/
  Temporal, derivative release image with freshly compiled current orchestrator
  plus exact health wiring. Preserve foreign inventories and clean exact owned
  resources even on failure. Record source/dist/base/candidate/dependency hashes.

## Evidence and acceptance ownership

The existing audit `isolated-recovery-final.actual.json` already establishes
the native red case (worker stopped, API200, health exit0) and safe missing-row
refresh workflow recovery; retain it without rerunning or overwriting it.
Executor runs only a focused diagnostic red/green while implementing, and one
scoped orchestrator compile to prepare the runnable native fixture. Root runs
the final affected checks and native runner; `root-acceptance.*`, coordination,
Beads, handoff, commits/push/delivery are root-only.

The fixture must show healthy idle 32+main pollers; stopped owned orchestrator
with API200 and health refusal; restart clears refusal and completes the owned
pending missing-integration read-only workflow. Current readiness modules are
compiled from current source and compared byte-for-byte inside the candidate.
Inherited backend is solely API liveness; inherited SDK/core versions must match
installed versions. This bounded derivative is not a full release/task8 proof.

Graph-reviewed: read local graph46ec4108 TemporalRegister one-hop neighborhood;
stale/truncated corpus is orientation only. Current module/options/client/worker
sources and installed public SDK/core types are authoritative; no refresh,
external extraction or git hooks.
