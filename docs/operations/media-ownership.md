# Media and multipart upload ownership

Avatar selection accepts only nondeleted Media belonging to a workspace where
the current user has an active membership. Another workspace of that same user
is allowed. The membership/media conditions are part of the nested Prisma
connect in the profile update: refusal leaves all profile fields unchanged.
Missing, foreign, deleted or disabled-membership media answers HTTP 404 with
`PROFILE_MEDIA_UNAVAILABLE`. Removing the picture remains supported.

R2 multipart creation records the provider's exact bucket/key/uploadId together
with the authenticated user and organization in the existing Redis client.
Records have a fixed one-hour deadline, including retries; part URLs cannot
extend it. Other members, another selected workspace, unknown pairs and expired
records are refused before any signing or R2 operation. Redis failure or a
request that remains pending for five seconds answers 503 and does not authorize
the request. The bound applies to session reads and writes without changing the
shared Redis client's retry policy. No client token or schema is added.

Validated completion and abort receipts remain retryable until that deadline.
A lost completion response can be recovered only after `NoSuchUpload` and
validation of the exact owned object; a generic provider failure is not a
receipt. Completed media registration uses the existing bounded serializable
Prisma helper so concurrent/retried HTTP responses return one active Media row.
Existing deleted rows are not revived. File content validation and its existing
invalid-owned-file deletion remain; there is no other media retention change.
Uppy's existing HTTP helper propagates non-success responses as upload errors.

On deployment, old unbound multipart pairs cannot be adopted. A user with an
upload started before deployment must restart it. Finished media and avatar
records are retained. Restarting an expired upload creates a fresh pair; no
automatic cleanup of provider objects or historical incomplete uploads is added.

Local acceptance: fake R2, actual Redis stand-in with virtual expiry, controller
and Uppy calls, plus actual Prisma with one owned disposable PostgreSQL. No live
bucket, upload, account, social provider or paid model is used. This proves the
application boundary, not a live R2 deployment or bucket lifecycle policy.
