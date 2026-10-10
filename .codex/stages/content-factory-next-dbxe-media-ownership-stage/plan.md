# dbxe.21 — media and multipart ownership, then authorized delivery

Selected 10 October 2026 at `a30a6d997d009222ac67554873bdeec7b8ad9891`.
User: “Давай делать. Потом всё выложишь.” Complete .21 locally, then publish
the accumulated accepted branch and deploy through .8's full release gates.
Root owns security implementation, integration and acceptance. One bounded
read-only release-preflight agent runs in parallel (context/latency benefit).
Beads remains task truth; original criteria and unselected work are preserved.

## Original .21 criterion (verbatim)

Two-tenant fake R2 sessions cannot cross sign/list/complete/abort; legitimate retry/completion works with expiry. Avatar accepts active media only from a workspace with current membership (including own alternate workspace), rejects foreign/deleted without user update. No live bucket/upload/account mutation; keep existing media retention.

## Specification

1. Bind server-created multipart (bucket, key, uploadId) records to authenticated
   user and organization in existing ioRedis. Fixed 3600-second lifetime matches
   existing part-signature lifetime. Missing/expired/foreign records fail before
   signing or any R2 command; store failure fails closed. No new secret, schema,
   client capability token or provider API. Existing request/response shape stays.
   Part signatures cannot outlive the recorded lifetime. Other members of the
   same organization cannot operate the owner's session.
2. Preserve retry until expiry. Cache validated successful completion and abort
   receipts for their owner. If completion already happened but its response
   was lost, NoSuchUpload permits authoritative verification of the exact owned
   object; a generic error never proves completion. Content validation remains;
   existing invalid-owned-object deletion is retained, no retention/backfill.
3. Controller passes current user + organization, returns immediately after an
   error response, and registers only successful owned completion. Repeated
   registration uses a bounded serializable find/create in MediaRepository,
   retaining one active row per owned completed path on retry/concurrency.
   This uses the existing helper and Prisma, with no schema or general media
   deduplication change. Existing saveFile callers remain unchanged.
4. Avatar's nested Media connect includes deletedAt=null and an active workspace
   membership for the current user in the same Prisma update. Rejection leaves
   all profile fields unchanged. Own alternate workspace is valid; disabled
   membership, foreign/deleted/missing media are not. No preliminary read/write
   gap, new transaction framework or permission UI.
5. Existing Uppy HTTP helper throws on a rejected upload request so errors cannot
   be interpreted as multipart success. No component redesign or new UI.

## Focused acceptance and delivery

Reproduce actual pre-fix cross-owner R2 signing/avatar predicate. Real code with
fake R2 + actual Redis stand-in/virtual expiry checks owner, alternate owner/
workspace, all five operations, malformed/expired/missing pairs, store outage,
retry/complete/abort, content validation and error-response early return. Owned
disposable PostgreSQL proves actual nested connect, no rejected profile update,
active alternate membership and concurrent/retried registration; keep all
preexisting containers. Run affected tests/types/docs/diff, then scoped commit
and close only .21. Preserve every historical Temporal byte/signature.

Authorized release is sequential after local acceptance: reconcile remote
ancestry/ownership, exact candidate, complete release acceptance and suite
receipt; prepare/publicize copied tree, build/publish registry image; inspect
host capacity/current rollback, schema/Mastra and actual legacy consumers;
apply only reviewed additive journal SQL if needed, then switch only Content
Factory. Verify health/queues/API/login/source/schema and other projects.
No paid model call, real social/mail/R2 action or old-history blanket termination.
Running legacy singleton transition is conditional on actual inspected state;
report any residual migration instead of guessing. Preserve successor exports
and queued work on rollback. Root owns every external mutation.

## Premortem — GO with release preconditions

| Failure symptom | Evidence / mitigation | Disposition / owner |
| --- | --- | --- |
| Disclosed pair crosses tenant/user boundary | Confirmed identity-free handler; stored owner checked before SDK/signing | preflight / root |
| Redis expiry/outage accidentally authorizes | Fixed stored deadline + TTL; missing/failed store denies, real stand-in expiry | preflight / root |
| Retried completion repeats registration / assumes external success | Cache receipt; only NoSuchUpload + owned-object validation reconciles; serializable registration | preflight / root |
| Foreign/deleted avatar changes other fields | Confirmed unchecked connect; single conditional nested update, native PG refusal proof | preflight / root |
| Executor leaks credentials / deletes unrelated state | Synthetic fixtures, exact owned cleanup; sanitized host preflight and scoped release helpers | preflight / root |
| Release loses Mastra or overwrites current code/consumer | Current remote/schema/host inventory, additive SQL guard, retained histories and rollback | release gate / root |

Rollback: local code revert before deployment. After a release, keep new
workflow exports and journal fields; use verified previous image only if its
schema/consumer compatibility holds. Redis records expire naturally; deployment
rejects preexisting unbound uploads, whose user must restart, never adopt a
foreign pair. Preserve live media and user data.

graph-reviewed: used — stale46ec4108 focused handleR2Upload; exact helper,
controller, Uppy and profile source verified. changePersonal missing from graph;
known repository path inspected directly. No graph refresh/API extraction/hooks.
Primary external facts: Cloudflare multipart docs and AWS CompleteMultipartUpload
docs; recorded owner authorization is application policy, not a provider guarantee.
