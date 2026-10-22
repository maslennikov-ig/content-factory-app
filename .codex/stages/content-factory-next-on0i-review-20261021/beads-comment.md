Independent owner-requested review 2026-10-21: CHANGES REQUIRED at current implementation HEAD e74e059ea104593d2fac831eb989714a5b151263. Full A1-A31 completion is not substantiated; source defects originate in on0i and remain after later fixes.

Fresh focused verification: 6 suites / 73 tests passed, including existing PostgreSQL crash/fencing, fallback and native UI probes. Independent combined/boundary probes found:
1. P1 live-stream UI Stop: local stop=1, server Stop requests=0. Durable backend treats the connection close as detach and continues.
2. P1 model selection uses legacy getAiSdkProvider transport inside native fallback/retry processing: 3 models with 1 retry each make 16 HTTP attempts, versus 6 without routing.
3. P1 all-model outage: 0 active runs and 0 recoverable runs after chain exhaustion, despite recovery.durableAgents=auto; required A31 wait/resume lifecycle absent.
4. P1 receipt storage failure + fresh process-local state: the same operation executes twice, both results ok=true.
5. P2 A19 queue/steer still a single browser React-state queue; claimed signals endpoint is absent.
6. P2 fresh service observer receives no live text because reconnect depends on in-memory activeTurns.

Evidence and reproducible probes: .codex/stages/content-factory-next-on0i-review-20261021/review.md and evidence.json in /home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018. The all-A1-A31 matrix checks filenames, the root receipt names four nonexistent test files, and real-model quality was not demonstrated (implementation report states zero paid calls). Code/application/server unchanged by this review; no production access/deploy/paid calls. Task statuses left unchanged; this comment records the independent non-acceptance and required corrective work.
