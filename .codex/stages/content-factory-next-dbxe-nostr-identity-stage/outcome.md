# dbxe.18 — Nostr event identity accepted locally, 10 October 2026

Only `content-factory-next-dbxe.18`; baseline
`de533317b9cd8ff9a970ca7d5c915a2008b27ca4`. The original criterion is verbatim
in [plan.md](plan.md); all 30 original epic criteria are preserved. Epic stays
OPEN; dbxe.8 retains its original next full release gate. No automatic next
stage, push or deployment.

Nostr now confirms only a boolean-positive OK for its exact signed event ID.
Old author events, EOSE, wrong IDs, malformed replies and all-relay failures
cannot report completed. Existing response fields and event URL remain, with
the real event ID. Publication HEX keys are decoded to bytes for the installed
signer, and channel/signing identity is checked before opening a socket.
Media formatting and both comment reply/author tag paths remain compatible.

The provider signs once for the existing five-relay fanout. Every attempt,
including fallback after a lost acknowledgement, sends the same timestamp,
signature and event ID. One acceptance suffices; later failures cannot erase it.
Each connection/response has a six-second deadline and every acquired socket is
terminated, including CONNECTING sockets. All failures throw a fixed error;
transport reasons, keys and event bodies are not logged. Profile discovery,
dependencies, storage, UI and Temporal contracts stay unchanged.

Root acceptance PASS: **3 Jest suites / 85 tests**, including the native runner;
that runner passes **38 actual-code protocol cases**, zero skips. Actual
nostr-tools2.23.3 signing/hash/Schnorr verification and ws8.21.0 loopback servers
are exercised. Negative/malformed/old replies, refusal, duplicate acceptance,
all socket outcomes, identical-event fallback, media, key/identity validation
and comment linkage pass. Actual V106 claim logic with memory persistence proves
confirmed retries return the event receipt without sending, and uncertain
retries refuse a second provider invocation. Backend/orchestrator TypeScript,
docs and diff checks pass. All **35 Temporal source hashes and the complete
signature baseline** match the starting snapshot.

The pinned legacy diagnostic deliberately fails on the old completed receipt
for an unrelated author's event; it also records completed on empty EOSE and
all relay failures, with no failed-path close. Its signer is synthetic to
isolate that bug; acceptance uses the actual installed signer. An initial
diagnostic loader path and an undefined-key test-fixture default were corrected;
their failed logs are retained, final checks are green.
Receipt: [root-acceptance.actual.json](root-acceptance.actual.json).

Root-owned closeout-lite, no delegated work or extra reviewer. Disposable
loopback servers/sockets are closed; unrelated work and prior stage evidence
are preserved. docs-reviewed: updated — [Nostr operation/retry boundary](../../../docs/operations/nostr-publication.md),
navigation and handoff. graph-reviewed: used — focused NostrProvider query
against stale46ec4108, three relevant file hashes match; current callers checked;
no refresh/external extraction/hooks.

Local acceptance does not prove public-relay availability, deployed publication,
native Temporal execution or PostgreSQL persistence. Missing OK cannot prove a
relay did not store the event. Current V106/V108 claims suppress another provider
invocation after uncertainty; historical retry policies remain unchanged.
There is no cross-invocation signed-event cache, automatic recovery or historical
republish. Future release retains existing schema/starter/recovery inspection
gates under dbxe.8. No full suite/build, real relay/model call or live mutation.
All original SaaS/client/legal/research/security requirements and defers remain.

Next candidate: **dbxe.19**, continue refreshing other channels after a partial
token-refresh failure, preserving failed credentials and explicit reconnect
semantics. It remains OPEN; stop for the owner's next-stage choice.
