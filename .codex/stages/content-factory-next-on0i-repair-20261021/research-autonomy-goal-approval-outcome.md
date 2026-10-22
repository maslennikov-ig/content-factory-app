# Native objective approval fixture delivery

Status: exact approved fixture patch applied; both test files frozen for root review. Application and authority guards were unchanged.

The prior A18 failure occurred before any piece_create or intake call. The first set_objective(action:set) correctly suspended for native approval; the fixture treated this pending result as a completed goal run. Its main model had run once, while the judge and artifact writer had not run.

The fixture now records and asserts that native boundary (suspended, zero created pieces, one main model call, zero goal evaluations), locates the owned suspended run and exact set_objective tool id, and explicitly approves it through the public resumeGenerate API with the same identity/thread/resource. Every original post-approval assertion remains: one created piece, four main model calls, two goal evaluations and a done objective. No permission rule or expected result was relaxed.

Validation: exact proposed bytes and patch hash verified before/after application; git diff --check passed; Node22/pnpm focused tests/agent-native-autonomy.test.cjs PASS7/7 with zero skips. Stage-only scripted native probes retained the original suspended result and successful explicit-approval continuation. All probe processes exited and InMemoryStore owns no persistent stand resources. No app writes, paid calls, stand runtime calls/restarts, build, full suite, push or deployment were performed by this stream. Root owns independent review and Gate8 acceptance.
