# dbxe.13 — extension access accepted locally, 10 October 2026

Only `content-factory-next-dbxe.13`; baseline `b6c6cd1802460c0b16181a1a30255ed6cdf2d754`.
Original Beads criterion retained verbatim in [plan.md](plan.md).

Explicit extension connect/reconnect creates a random marker inside existing
AES-encrypted cookie JSON and issues a purpose-bound, generation-bound JWT.
Refresh rejects deleted/disabled/provider-mismatched or superseded connections
before provider authentication. Its conditional write cannot revive or overwrite
a connection changed while authentication was running. Account-mismatch handling
shares the same protection. Ordinary refresh retains its generation and writes
AES cookie JSON; existing AES and legacy JWT cookie reads remain supported.

**Compatibility:** old untagged refresh JWTs require one normal reconnect after a
future release. No schema/secret rotation, bulk credential rewrite, new Chrome
storage protocol or client package change. Actual browser permission and response
handling remain the existing dbxe.14 scope, not inferred from local server tests.

Root acceptance PASS: **8 Jest suites / 150 tests / zero skips**, including eight
actual disposable PostgreSQL cases; backend TypeScript PASS; docs/diff PASS.
Reconnection with identical cookies produces distinct grants; stale tokens make
zero provider calls. Mid-authentication deletion/disablement/reconnect and late
account mismatch preserve the current persisted row. Foreign-tenant row is intact.
Initial reproduction had five behavioral failures; separate fixture setup error
and all raw logs remain locally, not reclassified as product failures.

Source-bound proof: `root-acceptance.actual.json`; raw DB/tests receipt:
`acceptance.local.json`, `acceptance.local.log`; types: `backend-types.local.log`.
Node22.23.2/pnpm10.6.1/Prisma6.5.0, cached PostgreSQL17. Only the labelled temporary
DB container was removed; all 68 pre-existing container IDs stayed present.

One read-only consumer-map agent (`gpt-6-luna/max`) accepted in the plan; no child
writes or cleanup resources. Closeout-lite; the existing root acceptance is reused.
docs-reviewed: updated - reconnect/storage note and current navigation.
graph-reviewed: used - focused local graph_context.py controller/provider queries;
stale local46ec4108 oriented only; current sources confirmed, no refresh/API backend.

Local commit only; no production mutation, real account/provider/model call,
push, full release suite or deploy. Epic remains OPEN; dbxe.8 release gate retained.
Next candidate: dbxe.14, packaged extension permissions and actual background renewal.
