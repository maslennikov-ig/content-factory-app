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
Public whole-population comparison and measured speed are verified below.

## Delivered measurement and acceptance

Private functional source `9470882b6535cb03ddfb930b0b0a4a545d76b5d1`,
[PR 1218](https://github.com/maslennikov-ig/content-factory-next/pull/1218).
Published CI source `074e4105dd41ac7dd0882509795e8e65c35b2e6f`.
[Build 41322025499](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41322025499)
passes all 10 jobs; [CodeQL](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41322025531)
passes. Wall time measured from first job start to last completion:
3090 s (51:30) -> 1118 s (18:38), 63.82% less time / 2.76x faster.
The full ordinary Jest parts alone complete in 918 s (15:18); the calendar
and final join now determine the remaining critical path. Preparation/build
cost was minor compared with the original serial Jest async-hooks/coverage run.

Hosted verification.json proves exact 822-file populations in both modes,
including all original 821 files plus one new CI merge test file. No missing
or duplicate original files. Ordinary and calendar each: 805 passed suites,
17 existing skipped suites; 13,869 passed tests, 164 existing skips (14,033 total).
The 16 extra passed cases are CI guard/merge tests. Node 170 passed / 4 existing
skips / 0 failed, Python 50 passed. All-three-halves guard passes.
Canonical half command strings, Jest config, calendar runner/setup and application
inputs are byte-identical to baseline; only command composition/parallel placement changed.

Merged coverage contains 248 files. Excluding the single newly added CI helper,
all four legacy global metrics exactly match baseline: statements 67.02%,
branches 42.26%, functions 65.74%, lines 67.83%. Combined including the new helper:
67.06% / 42.61% / 65.73% / 67.88%. The small function-percentage difference is the
new helper's denominator; previous code coverage did not fall. Full JSON, LCOV,
HTML and Clover outputs are retained in the native full-suite-results artifact.
The required check rejects a failed/cancelled/skipped upstream job before accepting
any results; independent negative tests cover missing/bad/duplicate artifacts.

Original local 37 chats, 31 drafts/posts and protected message/record hashes
remain verified. Services 4337 PID369 / 3516 PID1598 retained. No production,
provider, paid inference or schema changes; production remains 658f835b5f18.
Evidence is private under ~/.local/state/content-factory-next/ci-speed-20261101/.
Cleanup complete: removed the own clean published clone, own release-checkout
dependencies and downloaded lint binary/archive after saved proof/consumer checks.
Original worktrees/services, shared stores, unknown ignored files, accepted
code/branch refs and unique baseline/CI/coverage/preservation receipts are retained.
