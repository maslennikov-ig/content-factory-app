# Access stage: dbxe.1–.5

Goal: close the five audited access defects locally, preserve legitimate sessions,
supported legacy clients and tenant data. Beads owns status; this is an execution
and acceptance design, not another task ledger. Root owns implementation.

## Scope and proof

- dbxe.1: UsersController organization-list output uses explicit safe fields;
  current admin `/self` and key rotation remain supported. Prove two tenants,
  USER/EDITOR/ADMIN, disabled/missing membership, and no disclosed public key.
- dbxe.2: separate session/reset/activation validation and issuance. Keep old
  legitimate full-user sessions, refuse old reset links with a fresh-link path.
  Reset expiry and password-bound compare-and-swap prevent replay/concurrent use.
  Prove wrong-purpose/expired/reused tokens and password-change behavior.
- dbxe.3: legacy public OAuth rechecks exact current membership and role per
  request. Refuse removed/disabled members and USER writes; preserve EDITOR,
  ADMIN and organization-key clients. MCP remains in its own authorization path.
- dbxe.4: central cookie-mutation origin fence before authenticated handlers;
  preserve explicit session-header clients, multipart frontend requests,
  unauthenticated OAuth callbacks and public bearer APIs. Prove local form/JSON
  POST, preflight and effects counters with synthetic credentials.
- dbxe.5: scope credential fan-out by organization and explicit provider family;
  preserve LinkedIn account/page sharing. Prove query and persisted-state
  isolation, refresh/connect/concurrent cases without real provider calls.

Acceptance: focused regression suites plus directly affected existing suites,
backend TypeScript check, docs/process checks and diff check. One root acceptance
records actual inputs/results; no full release suite just to change its date.
No production mutation, deploy, key/secret rotation, paid calls or remote push.

## Technical premortem

Verdict: GO WITH CONDITIONS. Reversibility: scoped local code rollback; no schema
or live credential changes. Rollback after future release must not re-open these
access defects; use a corrected forward release if reverting would do so.

| Symptom | Evidence / mechanism | Detection / mitigation | Disposition |
| --- | --- | --- | --- |
| Admin key absent internally | confirmed: session middleware needs org.apiKey | Project only at controller output, keep repository internal rows | preflight |
| Existing sessions stop working | confirmed: old full-user JWT has no purpose | Explicit legacy session shape; reset/activation shapes refused | preflight |
| Reset reused concurrently | confirmed: old password write has no token fence | Password-bound token + atomic conditional password update | preflight |
| OAuth token remains ADMIN after downgrade | confirmed: middleware synthesizes ADMIN | Re-read exact tenant membership/current role each request | preflight |
| Upload/client/callback breaks | confirmed: multipart and header auth exist | Origin check for cookie mutations; preserve independent client contracts | preflight |
| Other tenant credentials overwritten | confirmed: fan-out lacks tenant/provider | Exact organization + explicit LinkedIn family, state regression proof | preflight |
| Executor changes unrelated contracts | plausible: many generic JWT/Temporal consumers | Leave generic JWT and historical workflow/activity contracts intact | preflight |

Graph-reviewed orientation: local map baseline46ec4108 is older than HEADa4e5742a;
focused PublicAuthMiddleware query found the relevant auth/public API/organization
paths. Current exact source is authoritative; no graph refresh/API extraction.
Tracked tree started clean; pre-existing untracked audit/runtime artifacts remain.
