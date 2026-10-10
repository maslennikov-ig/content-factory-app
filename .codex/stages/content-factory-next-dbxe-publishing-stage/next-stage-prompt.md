Target: Codex, /home/me/code/content-factory-next. Audience: owner; communicate in Russian.

Goal: Complete only content-factory-next-dbxe.7: report unavailable readiness when the publication worker or its pollers stop.

Context: Read AGENTS.md, .codex/handoff.md, outcome.md and review/review.md beside this prompt; bd show content-factory-next-dbxe.7. Audit reproduction: .codex/stages/content-factory-next-audit-20261009/audit-report.md. All fixes are local; task8 keeps its full release gate.

Success criteria: Bounded readiness distinguishes worker/process failure and stale/missing pollers from an idle healthy queue. On an owned native-image/Temporal fixture, stop the worker: readiness must fail while the API stays available. Restart it: readiness recovers and a pending safe workflow resumes. Bind proof to tested source/image; preserve all32 provider queues+main and1792MiB cap. Beads criteria govern closure.

Constraints: Node22.23.2/pnpm10.6.1; reuse existing health/lifecycle data, no heavy probes. Preserve V106 journal/old histories and other scopes. No production fault injection, global monitoring changes, backup restore, real provider/paid calls or push/deploy. One focused root acceptance; reuse matching proof.

Output: Saved fix, source-bound native fixture proof, Beads/handoff and .codex/stages/content-factory-next-dbxe-readiness-stage/outcome.md.

Stop: Report after this stage; wait for owner choice. Keep epic/task8 gates; no automatic next stage or release.
