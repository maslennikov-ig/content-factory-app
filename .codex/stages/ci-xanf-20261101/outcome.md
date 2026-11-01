# xanf: CI routing and cold test fixtures

Task: content-factory-next-xanf. Baseline: 10468f04a, isolated existing release
checkout on codex/ci-xanf-20261101; original dirty checkouts/services preserved.
No app behavior, production change or paid inference is in scope.

Plan: reproduce exact timeout with cold coverage; restrict hosted jobs to the
public release repository and avoid branch push/PR duplication; move cold fixture
imports out of behavior tests; run affected checks and exact-source public CI;
merge, record results, clean only owned intermediates and close the canonical task.

Baseline reproduction: two suites, cold coverage/detectOpenHandles, 1 failure of
12 tests. Channel first case 7214 ms versus Jest 5000 ms; later cases 379–805 ms.
Private historical run also timed out email (5.831 s suite), then runner shutdown;
calendar reached its 30-minute job cap. No behavior assertion mismatch observed.

Focused acceptance: 54 tests pass under cold coverage/open-handle detection;
shifted +400-day execution passes all 34 affected tests. First channel behavior
case is 41 ms, email behavior 348 ms; default 5000 ms timeout is unchanged.
Real components, native workflow/service code and assertions remain in use.
No application/dependency inputs changed. Docs/diff pass. Original local records
match the saved baseline: 37 chats, 31 drafts/posts; 4337/3516 PIDs retained.
Authoritative public CI will execute the complete normal/calendar suites once.

## Final acceptance and delivery

[PR 1216](https://github.com/maslennikov-ig/content-factory-next/pull/1216) is merged
at private source `5069e06146226cdc185639829ca43971d3e0fb72`.
Public copied tree: `dfa9ae0c6b83ee424e1a0d0e369af4bbcf2ddb6c`.
[Build](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41314259757)
passes all four jobs; [CodeQL](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41314259844)
passes. Full and +400-day Jest each pass 804 suites / 13,853 tests (17 suites /
164 existing environment-gated test skips). Full Node half: 170 pass, 4 skips,
0 fail; Python: 50 pass. The three-halves guard passes. Both formerly timed-out
files pass on the intended hosted runner in ordinary and calendar execution.
Full coverage took about 51 minutes; calendar about 21 minutes. The earlier
20-minute estimate applied to calendar only, not full coverage.

Private PR Build 41314077898 and main Build 41316848005 / CodeQL 41316848004
have only skipped jobs and no allocated runner IDs. This is expected routing,
not a claim that private tests ran. No ordinary branch-push duplicate was created.

Commands (exact behavior flags; JSON/log outputs retained privately):

- `pnpm exec jest --runInBand --coverage --detectOpenHandles --no-cache --runTestsByPath tests/email-service-async-locale.guard.test.cjs tests/agent-screen.cards-channel.test.cjs tests/ci.full-suite.test.cjs tests/time-travel-check.test.cjs tests/repository-addresses.test.cjs`
- `pnpm run test:time-travel 400 --runInBand --no-cache --runTestsByPath tests/email-service-async-locale.guard.test.cjs tests/agent-screen.cards-channel.test.cjs tests/ci.full-suite.test.cjs`
- Cold coverage of the two affected files on one CPU with lower priority:
  12 pass; slowest behavior test 761 ms, retaining the 5000 ms limit.
- `pnpm run docs:check`, `bash scripts/orchestration/run_process_verification.sh`,
  `git diff --check`: PASS. No unchanged application build/full suite repeated locally.

Production remains accepted image `658f835b5f18`; no new image, deployment,
provider calls or live settings were needed. Original local 37 chats, 31
adaptations/posts and all protected row/message hashes pass preservation checks;
frontend 4337 PID 369 and backend 3516 PID 1598 remain running.

Cleanup complete: removed the exact owned, clean public clone after proving its
commit published and no active consumers; unlinked only this task's dependency
symlink. Accepted source/branch refs, unique private CI/reproduction/data-preservation
receipts and original worktrees/services are retained.
Existing ignored release receipts, unknown generated files and shared caches stay.
Evidence: `/home/me/.local/state/content-factory-next/ci-xanf-20261101` (private).
Docs-reviewed: updated - CI ownership, runbook, handoff and this closeout.
Graph-reviewed: no-change-needed - bounded workflow/test changes need no graph.
