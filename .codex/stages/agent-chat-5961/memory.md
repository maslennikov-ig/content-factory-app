# Task 4 — HONEY-5957 native memory bounds

Status: complete. The strict representative 12-turn native resource check and focused contract regressions pass; earlier linear-retention measurements remain rejected evidence.

Scope: local worktree `agent-chat-5961-20261024`, integration baseline `0e0cf070c6b88c8f042a7fba12945e73ba5e2cec`, Node 22.23.2, pnpm 10.6.1, installed Mastra core 1.78.0. Native MastraService, PostgreSQL and Redis are real; model streams and domain corpus are frozen and sanitized. No external model/search provider, deployment, production write or memory-limit increase was used.

## Historical evidence and reproduced allocation

The private incident proves a roughly 509 MiB backend OOM with JSON parsing, four research results (up to 50 sources), a roughly 155k-character tool result, and native snapshots around 6.95M / 4.72M characters. It does not identify the original allocating or retaining owner. Private contents and account identifiers were not copied into Git.

The committed probe uses 50 distinct synthetic source texts totaling 1,133,853 characters per research result (largest 321,788), four research operations and twenty 12k range results per native turn, followed by a saved final answer. This deliberately exercises native message lists, step accumulation, operation receipts, PG snapshot JSON, model-prompt projection and reconnect.

A full source archive of baseline `0e0cf070c` with only the current test harness copied in was run under `node --expose-gc --max-old-space-size=512`. It reproduces a native JSON.parse OOM after 13 frozen model steps, even after clearing MockLanguageModelV3's test-only prompt archive. Largest research output: 160,702 bytes; native snapshot: 19,677,438 bytes; model prompt: 1,175,529 bytes. This identifies a concrete local duplicated-payload allocation path. It is not proof of the historical production incident's exact cause.

The test model's `doStreamCalls` archive was separately found to retain prompts. The resource probe clears that fixture-only recorder before each call and keeps scalar attempt counts; production code does not depend on this fixture correction.

## Product and native storage changes

- Native completed outputs above 32 KiB keep their full original result in the existing native committed-tool receipt. The repeated result is an explicitly marked preview with a server-scoped `outputRef`, canonical SHA-256 and an exact retrieval route through `readConversationHistory` offset/length. Oversized reads use this same storage shape without acquiring a write claim or setting an uncertain-write guard. Missing read storage returns `CAPABILITY_RESULT_UNAVAILABLE`.
- Source/fact rows and order remain present when their machine metadata fits the preview. An oversized machine-only result explicitly reports saved-result availability; full ordered rows remain in its receipt. Original source read routes remain available. Prefixes are exact; no invented omission characters enter a source range.
- `NativeToolResultPromptProcessor` uses the supported `processLLMRequest` hook to remove only duplicated Mastra display/model/transcript metadata from the outgoing prompt. Actual tool output, provider namespaces/signatures/cache controls, native saved metadata, suspension payloads and snapshots remain intact.
- Previous-operation witness checks retain only witness/state booleans while reading older receipts, rather than accumulating every full previous result.
- MastraService uses the installed SDK's 30-second completed-stream cleanup default rather than a one-day override. Suspended snapshots and receipts are not purged. Late completion is read from saved native history.
- Research owner separately bounded the existing preview cache to 8 MiB with conservative object/string accounting, and compacted duplicated assessment prose. Complete captures remain in durable storage and authorized range readers fall back to that storage after eviction.

The completed `CapabilityToolOutput.card` is the existing kind/id reference. Full interactive card payloads are emitted/saved separately and do not pass through the completed-result preview budget; no claim is made that an arbitrary interactive question fits 32 KiB.

## Native SDK retention diagnosis and patch

After product projection, six real native runs completed under 512 MiB but retained approximately 17 MiB per turn after GC. That linear result was rejected as acceptance. Both local/global run registries were empty and the owned PG pool drained. A Session deletion experiment while independent retention roots were still present released less than 20 KiB; that result did not justify a cache policy.

A settled V8 heap showed old range results retained through Node 22's global AbortSignal persistent set, an abort listener, `MastraModelOutput.#bufferedChunks`, and duplicated durable response messages. The original anonymous SDK stream forwarder closed over the complete method scope, including output. Public actual-stream tests reproduced listener retention; a resumed terminal also left its previous suspended segment's listener attached. Native Session disposal can release a registry entry directly, bypassing returned stream cleanup.

The pinned pnpm patch gives stream/resume/recover/generate forwarding a small file-scope closure and detaches it through both existing stream cleanup and compositional registry cleanup, including recovery setup failures. A further public native `untilIdle` regression identified the idle wrapper's own abort listener; it detaches when that wrapper actually closes. A settled heap also identified the long-lived thread-subscription generator's last consumed run local retaining its complete output while awaiting the next run. That consumed local (and the initial local after enqueue transfers ownership) is now cleared, preserving the live subscription and all queued/pending data. The public regression keeps two thread subscriptions live and verifies by GC WeakRef that both completed full outputs and consumed finish payloads are collected. Two actual cached AgentController Sessions independently exposed the implicit `for await` iterator-result register retaining the final payload. Their consumer now explicitly clears the read result before processing, clears the consumed chunk, and preserves iterator close/error semantics. Those actual Sessions also pass the GC WeakRef regression with subscriptions kept live. Active signals and parked native gates retain their cancellation/answer contracts. CJS and ESM distributed files are patched; no SDK private-field override or alternate replay runtime is used.

Patch packaging, provenance, installation and removal conditions: `patches/README.md`, `patches/@mastra__core@1.78.0.patch`, `package.json`, `pnpm-lock.yaml`. Parent owns packaging and native cold/Stop compatibility acceptance. Replacement SDKs must pass both the listener lifecycle regression and this 512 MiB stress probe before the patch can be removed.

The final eight-file patch SHA-256 is `c2de6ad67a8bc72cd6b4418e6b96c7355ac6fdfe000512ee9379b5508d8adb5e`. Its CJS and ESM durable-agent, agent, storage and AgentController chunks were byte-matched to the reviewed candidate. The probe independently records all eight installed chunk digests.

## Rebuildable native Session cache

The eight-file SDK correction passed its public lifecycle/WeakRef regressions but the strict 12-turn measurement still failed: matched settled heaps after turns 4/8/12 were 245,997,608 / 250,267,216 / 254,481,288 bytes, a spread of 8,483,680 bytes against the unchanged 8,388,608-byte bound. This was not accepted as a plateau.

A further settled heap identified the remaining retained owner precisely: `AgentController.#sessionsByResource -> Session.displayState -> currentMessage.content.parts[].toolInvocation.result` and `activeTools.result`, holding old range-result strings. These are legitimate display mirrors, duplicated in every indefinitely cached Session, rather than the consumed native outputs fixed by the SDK patch. The canonical display serialized to 504,379 bytes for one representative Session.

`NativeSessionCache` now indexes those existing native Sessions and calls the documented public `deleteSession({ resourceId, scope })` after 30 seconds idle, or releases the oldest idle mirror when more than eight are materialized. The SDK documents this teardown as runtime-only. It does not delete saved threads/messages, thread permission/model metadata, research captures, checkpoints or receipts. No alternate runtime or replay store was introduced.

Materialization/binding is pinned. A running native run, armed approval, pending suspension, or any owned task scope (including startup before its registry run exists) prevents eviction. An eviction rechecks both idleness and entry identity immediately before public teardown, so an earlier prune snapshot cannot delete a replacement Session. The SDK's existing `createSession` waits for an in-progress deletion of the same resource/scope. An early timer retries the remaining idle interval; protected or failed releases retry after the ordinary interval rather than spinning.

The actual MastraService/PG/Redis cache regression materializes twelve completed threads while a real question and a real provider call remain parked/running. It verifies at most eight idle mirrors, then only the two protected Sessions after 35 seconds. Cold recreation preserves exact saved history, read-category denial before any domain read, the saved selected model and its next actual frozen provider call, and the thread title. Small deterministic regressions also cover armed approval, task scope, materialization pins, an early timer, and concurrent replacement during a pending teardown.

## Runnable proof

From the worktree with the required local PG/Redis available (existing native helper accepts `CF_TEST_PG_URL` / `CF_TEST_REDIS_URL`):

```sh
export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm exec jest --runInBand --runTestsByPath tests/agent-native-abort-cleanup.test.cjs tests/agent-native-output-projection.test.cjs
pnpm exec jest --runInBand --runTestsByPath tests/agent-native-session-cache.test.cjs
node --expose-gc --max-old-space-size=512 tests/helpers/agent-native-memory.probe.cjs --runs=12 --hold-ms=35000 --checkpoint-every=4
```

Each runtime creates an owned PG schema/Redis namespace and normal close drops only those owned test data. The probe records the SHA-256 of all eight loaded SDK chunks, raw summary/snapshot/prompt byte maxima, 20ms sampled peak heap/RSS, GC points, local/global registry sizes, provider/domain counters, live reconnect tool results, original source digests, PG JSONB full-receipt range reads and saved-history reconnect after at least 35 seconds. Immediate post-run points include the SDK's normal completed-stream grace and can show ~14 MiB downward releases. The bound is asserted across matched settled checkpoints after turns 4, 8 and 12, each following the full 35-second grace; all raw immediate points remain reported. Optional heap snapshot flags are diagnostic only: heap snapshot generation itself increases RSS and is excluded from final resource acceptance.

Focused projection proof reconstructs the complete >1 MiB native result in ranges, validates digest and tenant/thread scope, preserves every source/fact row, replays one domain write once, and proves a read-storage outage does not create write uncertainty. Provider metadata projection preserves real signatures/options and leaves native history metadata unchanged.

Final focused cache/lifecycle/projection checks: 3 suites / 3 subprocess tests PASS, exit 0, 50.419 seconds, `/tmp/cf-memory-final-focused.log`. The three tests contain the multiple contract assertions above; this is not a claim of three isolated assertions. Root owns broader native/UI acceptance and backend/frontend type evidence.

## Final measurements

Source checkpoint: `79b5b819c7a052e0799ba8d9802168e45fd8b3a9`, plus the exact probe/source input digests recorded in `memory-proof.json`. SDK patch and all eight loaded chunks were independently verified against that artifact. The native subprocess completed and closed its owned runtime with exit 0.

| Measure | Baseline `0e0cf070c` | Final |
| --- | ---: | ---: |
| Native result | JSON.parse OOM at the 512 MiB limit | 12 complete turns, exit 0 |
| Largest research summary before repeated-output projection | 160,702 bytes | 109,273 bytes |
| Largest native snapshot | 19,677,438 bytes | 4,341,121 bytes |
| Largest outgoing model prompt | 1,175,529 bytes | 290,638 bytes |
| Sampled peak heap | Fatal run; not a comparable complete-run peak | 405,972,632 bytes / 387.17 MiB |
| Sampled peak RSS | Fatal run; not a comparable complete-run peak | 652,910,592 bytes / 622.66 MiB |

Snapshot and prompt maxima decreased by 77.94% and 75.28% respectively on the same sanitized workload. The configured 512 MiB flag limits V8 old space, not RSS. Peak values are sampled every 20 ms; synchronous allocation peaks may fall between samples.

| Matched checkpoint | Idle grace | Heap | Local / global run registry |
| --- | ---: | ---: | ---: |
| Turn 4 | 35 seconds | 243,944,728 bytes / 232.64 MiB | 0 / 0 |
| Turn 8 | 35 seconds | 245,695,800 bytes / 234.31 MiB | 0 / 0 |
| Turn 12 | 35 seconds | 247,501,288 bytes / 236.04 MiB | 0 / 0 |

The matched spread is 3,556,560 bytes / 3.39 MiB, below the unchanged 8,388,608-byte / 8 MiB bound. Final GC heap is 247,497,592 bytes / 236.03 MiB; final RSS is 423,378,944 bytes / 403.77 MiB. The owned PG pool had one idle client and no pending query at completion. This finite acceptance establishes the tested envelope; it does not claim exactly zero heap change or an unlimited-duration production proof.

All 48 research results (2,400 source rows), 288 domain/tool calls and 156 frozen model calls completed. All 12 earliest-source digest checks after preview-cache eviction passed; all 12 complete-receipt PG JSONB digest/range reads passed. Live reconnect replayed all 288 tool results. Saved-history reconnect after the SDK cleanup grace recovered the exact final completion once, with no extra model/provider attempt. Full captures, operation receipts, native snapshots and saved history were retained throughout; cleanup dropped only this test runtime's owned schema/namespace.

Raw private local evidence: `/tmp/cf-memory-final-bounded-512.log` and `/tmp/cf-memory-final-bounded-512.json` (the final structured JSON line; other stdout lines are SDK shutdown diagnostics). Sanitized, parseable, versioned metrics and eight chunk digests are in `.codex/stages/agent-chat-5961/memory-proof.json`. The original historical production allocator remains unproven; the local duplicated-payload allocation and specific native retention owners above are reproduced findings.

## Graph review and boundary

Graph-reviewed using the owner graph `/home/me/code/content-factory-next/graphify-out/graph.json` (older `dd67538d` baseline), with focused receipt/research queries. Newly introduced symbols were absent there; all relied-upon paths were verified against this current worktree and installed core 1.78.0 source/types. The borrowed graph was not refreshed or modified.

## Completion event

- Delivery: bounded completed-result projection/full native receipt retrieval, supported prompt metadata projection, compact receipt-witness reads, SDK completed-stream default cleanup, eight-chunk SDK retention correction, and bounded rebuildable native Session mirrors.
- Owning production paths: `conductor/native-tool-result.ts`, `conductor/native-session-cache.ts`, `conductor/conversation-history.ts`, `conductor/agent-operation-receipts.ts`, `mastra.service.ts`, and the completed-output/replay/model-output region of `capabilities/mastra.adapter.ts`. Other owners' approval, domain-question and research changes were preserved; parent owns conductor processor wiring and dependency packaging.
- Owning probes: `agent-native-memory.probe.cjs`, `agent-native-abort-cleanup.probe.cjs`, `agent-native-output-projection.probe.cjs`, `agent-native-session-cache.probe.cjs`, their three focused Jest wrappers, and the fixture-risk/summary seam in the existing native MastraService helper. Parent's later helper seams were preserved.
- Verification: focused 3/3 PASS; strict native PG/Redis 12-turn subprocess PASS with exit 0; threshold, corpus and 512 MiB cap unchanged. Root-owned broader native/UI/types evidence remains separate. No full repository suite was run by this stream.
- Safe cleanup: ordinary probes closed and dropped only their own witnessed schema/Redis namespace; five earlier witnessed aborted-probe schemas/namespaces were removed. No shared service was stopped or unrelated data removed. Sanitized local heap diagnostics remain outside Git for review; private incident contents were never copied into the repository.
- Graph-reviewed: owner graph orientation checked against current source; no graph refresh/mutation. No provider/search calls, push or deploy. No global stage/commit performed by this worker.


Root integration acceptance: accepted the final delivery and process exit 0.
Root independently parsed the raw passing summary, verified all counters,
settled bound, eight installed SDK digests, raw-log hashes and owning input
hashes. The final root native set at source `79b5b819c` passed 14 suites / 38
tests; the full affected union passed 33 suites / 701 tests, zero skips, and
backend/frontend types passed. Full Nest/Next heap512 browser case
`a5222c3c-2cc7-4c30-aec1-fef81687b8a9` independently covered pending retention
past 39.9 seconds, cold restart, accepted-response loss, automatic continuation
and the exact saved Telegram draft. Safe cleanup accepted: retain the owned
preview/worktree/data for owner review; no additional cleanup is requested.

Safe cleanup caveat: an early cache-test registry-validation failure occurred
before its initializer returned the owned runtime. It may have left an empty
test schema without a retained exact identity. It was intentionally retained;
no shared schema was guessed or deleted. Later probes closed their owned
runtime normally. Preview data and private diagnostics are also retained.
