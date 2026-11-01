# Full CI latency reduction

Task content-factory-next-sbci; baseline 96e6751b3, isolated existing checkout,
branch codex/ci-speed-20261101. Original dirty worktrees/services are protected.
Baseline public Build 41314259757: full about 51 minutes, calendar about 21;
Jest dominates; Node/Python finish in under one minute. Native Jest 29.7
--detectOpenHandles implies serial execution and is retained.

Plan: native 4-way full and 2-way calendar Jest sharding on independent hosted
PG/Redis fixtures; retain coverage/open-handle diagnostics/timeouts/assertions.
Required full-suite aggregation must reject failed/missing shards, wrong commit,
missing/duplicate test files and invalid results; merge coverage through Istanbul;
execute the canonical Node/Python halves once and retain the three-halves guard.
Default pnpm test remains all three complete halves, with no sharding env switch.
Keep required check names and private-repository routing. Compare exact-source
public wall time and complete test membership, then deliver/close/clean owned outputs.

Docs-reviewed: updated - CI runbook and split canonical commands required.
Documentation-decision: explicitly pin existing Istanbul coverage/report libraries
as development dependencies for canonical merge/report APIs; app deps unchanged.
Graph-reviewed: no-change-needed - bounded CI/test graph is read directly.

Local proof: 82 focused tests pass, including real 2-way Jest subprocess shards
and coverage/report merge; failed/cancelled/skipped upstream gates separately
exercise shell failure. Shifted focused tests pass. Missing shard/calendar,
wrong commit, duplicate file/index, interrupted/failed result, false totals and
missing coverage all refuse aggregation. Native JSON's successful `focused` and
`skipped` suite statuses are retained, including genuine skip/todo cases.
Actionlint 1.7.12 from the official checksummed release passes; docs/process/diff
pass. Explicit Istanbul pins reuse the exact locked transitive versions; unrelated
lockfile resolver changes were removed. No application/Prisma/Temporal code change.
Public whole-population comparison and measured speed are still pending.
