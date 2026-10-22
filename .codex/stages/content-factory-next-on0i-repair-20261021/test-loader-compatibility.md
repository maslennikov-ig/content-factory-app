# Focused Jest compatibility repair

Root's first full-suite inventory found one common loader error across legacy service/UI tests: installed Mastra 1.78 CJS entry points load `classifier/index.cjs`, which requires ESM-only `@ai-sdk/provider-utils-v7` and `@ai-sdk/provider-v7`. Their dependency closure includes the real `@ai-sdk/provider` and `@workflow/serde` ESM sources. Node 22 native subprocess probes already load them successfully; Jest 29's CJS runtime was parsing the same `.js` sources without transformation.

`jest.config.cjs` now allowlists only those SDK/provider/serde package locations, including nested and pnpm paths, for the synchronous `tests/helpers/esm-dependencies.transform.cjs` transformer. It uses the already installed TypeScript compiler to convert module syntax and preserves real dependency implementations and failures. Babel's prior default still handles other repository files. No SDK mock, skipped test, network access or provider call was added. Existing custom TS loaders remain unchanged. Context7 `/jestjs/jest` and installed Jest runtime were checked against the official [transform contract](https://jestjs.io/docs/code-transformation) and [pnpm ignore-pattern guidance](https://jestjs.io/docs/configuration#transformignorepatterns-arraystring).

Additional bounded test-fixture repairs:

- `ai.clients.test.cjs` now uses the existing shared TS loader instead of its private single-file loader, so the new relative `ai.native-retries` import resolves. Alias and sibling imports explicitly share the same real `ai.text-chain` module; the ALS budget/tenant assertions continue to exercise the same transport instance.
- `agent-doors.test.cjs` checks the exact guarded methods `chat` and `signalThread`, preserving the rule that passive reads are not throttled. The former source count assumed only the chat route existed.
- `agent-conductor.guard.test.cjs` retains exact capability hooks, step bound, refusal stop, provider role and registered-agent checks while recognizing native functional default options, the explicit classifier/goal-judge helpers, and the one shared DurableAgent wrapper used by the registry/controller.
- The original exact `APPROVED_ON_CARD`, stored-call/tampered-arguments, single-write and S1 primitive-whitelist assertions remain intact. A temporary fixture alignment exposed that production `cf.nativeStepNotes` arrays were persisted. Root fixed that concrete issue with execution-scope `initialStepNotes`; this worker changed only the probe's constructor to use that contract. No application source was edited by this worker.
- `agent-stop-reconciliation.probe.cjs` retains rejection of the old stopped callback. Its successor now runs through an actual registered native DurableAgent, Memory and Storage instead of invoking a tracked tool with no native persistence context. It proves exactly one domain write and one committed native operation receipt. The instrumentation wrapper also forwards the public invocation argument instead of dropping it.

## Verification

Node 22.23.2; pnpm 10.6.1. Focused only; root retains the full-suite acceptance gate. Historical failing batches remain as diagnostic evidence and are not called green:

| Focused run | Result | Evidence |
| --- | --- | --- |
| `agent-work-context` | exit 0; 1 suite, 22 passed; 4.097 s | [first loader proof](evidence/test-loader-first.log) |
| First 11 affected SDK suites | exit 1; 10 passed, 1 stale route-count guard failed; 289 assertions passed | [affected inventory](evidence/test-loader-affected.log) |
| Remaining SDK paths + corrected doors | exit 1; 6 passed, 1 old private-loader failure; 130 assertions passed | [remaining inventory](evidence/test-loader-final-affected.log) |
| Corrected `ai.clients` | exit 0; 1 suite, 47 passed; 1.023 s | [AI client proof](evidence/test-loader-ai-clients.log) |
| Execution, conductor unit/agent/guard and roles matrix | exit 0; 5 suites, 261 passed; 7.58 s | [final conductor proof](evidence/test-loader-conductor-final.log) |
| Native Stop reconciliation | exit 0; 1 suite, 1 passed; 1.96 s | [Stop fixture proof](evidence/test-loader-stop-reconciliation.log) |

The first affected batch covers piece core/edit, pieces service, intake own-facts/research/service/extract-v6, thread fork, background notifications, native acceptance matrix, doors and voice dictation. The second covers doors, conductor agent, intake kind-truth/kind, core-write-v13, web research usage and AI clients. The only two errors left in those historical loader batches were explicitly fixed and passed later focused checks. No assertion about a fresh combined/full suite is made here.

Exact final targeted commands:

```bash
pnpm exec jest --runInBand --no-coverage tests/ai.clients.test.cjs
pnpm exec jest --runInBand --no-coverage tests/agent-task-execution.test.cjs tests/agent-conductor.unit.test.cjs tests/agent-conductor.agent.test.cjs tests/agent-conductor.guard.test.cjs tests/roles-matrix.guard.test.cjs
pnpm exec jest --runInBand --no-coverage tests/agent-stop-reconciliation.test.cjs
```

`git diff --check` and changed JavaScript syntax checks pass. [Source hashes](evidence/test-loader-source-hashes.json) bind this handoff to the current scoped files. Roles matrix count was updated by root; UI scenario/live-walk failures remain with their assigned owners. No full-suite rerun, paid call, production access, commit, push or deployment was performed by this worker.

Delivery event: test compatibility changes complete and frozen for root acceptance. No runtime or schema artifacts were created by this repair; owned subprocess probes use in-memory stores only.
