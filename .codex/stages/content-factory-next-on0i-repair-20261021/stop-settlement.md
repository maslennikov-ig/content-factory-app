# Explicit Stop settlement repair

Status: source frozen; focused verification delivered; root compiled-browser acceptance pending.

## Confirmed failure boundary

The installed public `Session.abort()` returns `void`. `AgentThreadsService.stopTurn` acknowledged its exact request after requesting native cancellation, while the actual HTTP owner's `turn.finish()` and terminal PostgreSQL Memory commit were still pending. Its HTTP handle was also removed before that commit, so a Stop entering during natural finalization could no longer await the owner. Both orderings have controlled native Session/HTTP/PostgreSQL RED traces.

The frontend's original abort/Stop reads are finite. A later authoritative GET updated the execution state but did not rerun `confirmStopped`. The root's free focus read reproduced this on the actual failed compiled thread: exact settled/interrupted request, no pending gate, all four native messages, composer still disabled. A real installed `useChat` reproduction independently isolated the same omission after three nonterminal reads and one late terminal read. The original failed Stop GET order was not captured and remains unknown.

## Minimal intervention

The active HTTP handle now carries the completion Promise of that exact actual `turn.finish()` and Memory commit. Stop waits for it after issuing all native abort calls, avoiding an abort/finalizer dependency cycle. The handle remains discoverable through the terminal commit. A failed terminal store write rejects Stop and leaves the history nonterminal.

Fresh authoritative history now reuses the same `confirmStopped` predicate. Exact request/thread/human identity, terminal outcome, no pending/error/uncertain tool state, and generation protection remain required. No polling, private SDK method, queue, automatic retry, new provider call or fabricated action result was added. Cold-native cancellation keeps its existing persisted cancellation/reconcile proof.

## Focused evidence

`stop-settlement-evidence.json` records exact commands, source hashes, logs and boundaries. Native integration verifies successful interruption, failed Memory settlement and Stop entering during natural finalization. The pre-existing four frontend suites plus Stop identity and native settlement are covered. The first combined run passed five suites / 97 tests and found one overstrict new negative-fixture expectation; after correcting only that assertion, the actual Stop flow passed separately with 20 controlled SDK modes. Frontend/backend TypeScript and diff checks passed.

All application and test sources are frozen in `evidence/stop-settlement-source-freeze.json`. Root owns full acceptance and the newly compiled real-browser Stop check. This worker made no paid call, browser action, live-stand restart, production change, commit, push or deployment. Unknown action/cost remains unknown; a genuinely pending noncancellable action may keep Stop pending until the actual Promise settles.
