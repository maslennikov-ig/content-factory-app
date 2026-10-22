# Gate7 regression review

Verdict: approve the four exact proposed patches and the subsequent permanent queue-test patch below. No open correctness findings were found in this bounded delta. The ten applied files match the reviewed candidates. Root Gate8 and the complete three-part suite remain separate acceptance gates; the failed Gate7 receipt is not waived or reclassified.

This was a read-only source/evidence review in `j9p5-model-led-20261018`, branch `codex/on0i-native-repair-20261021`, baseline `e74e059ea104593d2fac831eb989714a5b151263`. Only this report and its JSON companion were written. The reviewer ran no tests, paid/provider calls, browser/runtime actions, store commands or restarts, and edited no application/test files. Previous reviews remain unchanged. Candidate application and focused checks were performed by their authorized owners after Gate7 finished.

## Exact approvals

| Scope | Approved patch SHA-256 |
| --- | --- |
| Queued native response identity, two app files | `b143b5ab1655e4ad5c41401a5ad1df408d557a17d8705dbfafb59a902b5d01b3` |
| Held Stop fixture with actual native controller | `5ae1864e8d80726bbbf19ab0d96f30544aeec0c8b52b1f968c545558de80609f` |
| Native objective approval fixture | `9703cf74c39f738f4a05d831eeb39b09ebd48c7d592faba09b34a7133e9c81c4` |
| RU/EN copy, media privacy and full-source assertions | `50e333362c2e4585a8203b8a96f9f37661a7a30a69546ad24d5c9351fb542024` |
| Permanent queued response regression tests, two existing test files | `c4d228ab4e91d7e0863adfa24f09ddc089f097f3fc718dbe5394cc31da360570` |

Each patch was independently reconstructed or reversed in memory against the declared source hashes, without writing source or executing it. All original/candidate context and hash checks matched. Full paths and before/after hashes for three app files and seven test/helper files are recorded in the JSON manifest. Stage JSON status strings describing an unapplied candidate are historical; the reviewed applied-file hashes determine the final state.

## Queue application repair

This is a real application regression exposed by stricter Stop proof. Existing queued native work saved an assistant message, but its original reader did not record the matching response identity. A valid queued Stop therefore reached settled/interrupted metadata and pending zero yet returned 503. The diagnostic actual PostgreSQL/native stream shows the native start message ID already matching the saved assistant; it does not justify weakening Stop.

`native-queued-input.ts` now forwards an optional identity callback from the existing original `fullStream` and existing child-completion consumer when the public native start chunk supplies run/message IDs. It adds no observer, stream, polling, retry, scheduler or private/internal SDK call. Waiting for another task does not grant that task's identity to this one.

`MastraService.queuedInputRuntime` records proof only for the trusted resource and execution marker, exact logical request, current native run, and non-stopped/non-settled task. A different predecessor, same-request older run or successor is rejected. Its initializer retains a previously recorded response only when request and run both match; replacing either discards proof. Failed persistence continues to fail the unchanged strict saved-assistant Stop predicate. Controller draining and frontend proof guards remain unchanged.

The installed public `updateThreadMetadata` contract serializes callers using that updater within one storage instance. It does not establish a PostgreSQL cross-process transaction or exclude all independent direct metadata writers. The reviewed evidence and approval claim only that bounded behavior, with the existing native ownership/fencing mechanisms retained.

The permanent test patch keeps all prior queued approval/question/Stop assertions and additionally requires the response ID to name an actual saved assistant in each case, including queued Stop with no HTTP owner. It retains one original native admission, zero HTTP admissions and repeated-answer refusal. Actual PostgreSQL tests cover held same-run initialization, new request/run proof clearing, late/wrong request/run callbacks, stopped/settled tasks and failed proof persistence retaining Stop503. Synthetic callback tests do not independently prove cross-process race exclusion.

## Fixture corrections and copy

The durable fixture formerly awaited settling Stop before releasing noncooperative capability work, contradicting the new settlement contract and preventing the helper from producing its report. The final patch starts Stop, observes the actual capability abort signal, checks Stop remains pending while the capability is held, releases it and then awaits Stop. It registers an actual DurableAgent and public controller/session, replacing the undefined legacy session path. It does not fabricate pointer metadata or relax the saved-response guard. Existing interrupted outcome, zero writes, false admission and late-callback rejection assertions remain; A11 disconnect/reconnect and PostgreSQL crash/recovery/fencing assertions also remain.

The initial supplied `agent-durable-recovery-held-stop-inmemory.log` is an earlier RED for patch ea855. The equivalent-transform GREEN for b70d is also historical. Final approval uses only exact patch `5ae186…`, its manifest and `agent-durable-recovery-held-stop-final-inmemory.log` SHA-256 `b4c0ec841a04566eab8ec58910643976c2154add1f6e5859d841241953537aad`, followed by the applied wrapper receipt. This evidence-reference issue is resolved.

The autonomy fixture now exercises the existing native `set_objective` mutation approval boundary (`conductor.autonomy.ts:582`). It verifies the first result is suspended with no artifact or judge effect, selects the initial run within the owned thread/resource and exact `set_objective` tool-call ID, and resumes through public `resumeGenerate` with explicit fixture approval. All old artifact, goal-judge, model-call, objective and hidden-thread assertions remain. No application approval policy or automatic production consent changes.

The new required-snapshot error code now has RU/EN copy without claims about fees or effects. The media test removes an obsolete static ban on observability/package text; its privacy purpose is covered by the already passing actual native producer/exporter/PostgreSQL consumer using the application's `createNativeObservability`. That behavior checks secret/header/image/PDF/instruction/tool-description/error sentinels, omitted raw span input/output, actor/thread isolation and external request restrictions. The full-text test preserves all source metadata assertions, compares intake fullText separately with the complete provider fixture body, and retains facts, summary, model/search counts and cost assertions. No privacy or provenance requirement was removed.

## Receipts and remaining gates

Gate7 Jest actually ended with 728 suites passed, 5 failed, 7 skipped; 12888 tests passed, 9 failed, 70 skipped. Node and Python halves did not run. The nine failures map to one queued Stop failure, four assertions sharing the blocked durable helper, one missing objective approval, missing error copy, the obsolete observability ban and the source metadata/fullText mismatch. This remains a failed, incomplete full-suite baseline. Root reported source stable during that run; the accepted edits occurred afterward.

Reviewed existing receipts establish:

- Queue repair and permanent tests: 6 suites / 19 passed, 85.907 seconds; backend TypeScript exit 0.
- Applied durable wrapper: 4 passed, including expected crash exit 99, recovery without duplicate writes and stale-generation refusal.
- Applied autonomy wrapper: 7 passed; pre-approval suspended/create0/main1/judge0 assertions and every prior post-approval assertion remain.
- Media/source/privacy candidate and applied checks: 3 suites / 92 passed. The actual native privacy test also passed in the original Gate7 full run.

These focused receipts do not replace Gate8's compiled/UI checks or the complete Jest, Node and Python sequence. Any additional product/test delta requires its own review. No production, real-provider quality or client acceptance is implied. Commands, inspected log/manifests, hashes, applied-state readback and the reviewer action counts are in the JSON companion.
