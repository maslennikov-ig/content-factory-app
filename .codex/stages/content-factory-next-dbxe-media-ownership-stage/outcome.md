# dbxe.21 — accepted local media ownership

Root accepted the bounded implementation on 10 October 2026. Beads owns task
status; original criterion is retained in plan.md. Current user authorized
publication/deployment after this local stage through .8 full release gates.
No continuous epic goal or automatic next-task execution is introduced.

R2 multipart pairs are bound to authenticated user+workspace in existing Redis
with fixed one-hour expiry, checked before all five continuation operations.
Missing/foreign/expired pairs and store outage fail closed; a stuck session read
or write answers 503 after five seconds. Part URLs retain
the deadline; validated completion/abort retries are cached. Lost completion
receipt reconciles only NoSuchUpload plus validation of the exact owned object.
Completed upload registration is bounded/serializable and returns one active
Media row for concurrent/retried registration. Controller does not save errors;
Uppy propagates non-success responses. Avatar nested connect atomically requires
active membership/nondeleted media, including another workspace of the user.
Rejected avatar leaves all profile fields unchanged. No schema or media
retention change. Existing pre-deploy multipart sessions must restart.

## Verification

Pre-fix actual-code diagnosis: foreign R2 sign returned200 and avatar connect
had only the media ID; both regression cases failed as expected. Final affected
acceptance:6 Jest suites/90 tests, no skips, including49 new fake-R2/Redis/HTTP
cases. Native Prisma/PostgreSQL:9/9, concurrent/retried registration, alternate
workspace and four atomic refusals. Owned loopback DB removed;69 preexisting
containers preserved. Backend/frontend types pass. Canonical docs/diff checks
and39 Temporal file/signature preservation are required in the root receipt.
The earlier 88-test acceptance is preserved as initial proof; the release
integration adds two regressions for pending Redis reads and writes. Native
PostgreSQL proof was repeated after this refinement, with the same nine passes.

## Delivery boundary

The accumulated release now deploys this implementation at public755d19fa731d
from exact tested private source d724f3b792f4. Full release/runtime/schema/source
proof is in [delivery outcome](../content-factory-next-dbxe-delivery-20261010/outcome.md).
Matching local/native proof is retained; production uses local storage, so no
live R2/provider effect is claimed. Epic/unselected original criteria stay open;
dbxe.8 remains IN_PROGRESS for newly recorded OS/global findings in33/34.
The local graph was refreshed at the accepted release boundary without models,
hooks or query logging. No live media/account/profile mutation was performed.
