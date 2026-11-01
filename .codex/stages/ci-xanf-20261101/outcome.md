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
