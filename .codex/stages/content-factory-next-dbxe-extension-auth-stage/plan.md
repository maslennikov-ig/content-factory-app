# dbxe.13 — extension refresh access, 10 October 2026

Only `content-factory-next-dbxe.13`, baseline `b6c6cd1802460c0b16181a1a30255ed6cdf2d754`.
Root-owned medium correction; parent epic and release task dbxe.8 stay open.

## Acceptance contract (unchanged Beads wording)

Deleted/disabled/reconnected channel rejects stale refresh before provider calls and never resurrects. New refresh writes use the established encrypted format; valid connection refresh and legacy reads continue. Use synthetic token/cookies and two generations, preserve secret history safely; no real accounts or global JWT rotation.

## Design and ownership

- Root: controller JWT issuance/validation, service forwarding, repository conditional
  update, focused tests, documentation and final acceptance.
- Every explicit extension connect creates a random generation in the existing
  AES-encrypted JSON; the dedicated-purpose JWT binds that generation and identity.
  Ordinary refresh preserves the generation. No schema or new version column.
- Old untagged extension JWTs cannot establish a connection generation and return
  401; a single explicit reconnect issues the bound token. Stored encrypted and
  legacy signed cookie reads remain intact; no existing data is rewritten.
- The refresh endpoint updates only its existing active row, with the exact
  read identity, token and encrypted details in the same conditional write.
  A race fails 409 instead of reviving or modifying a newer connection.
- Wire request/response and Chrome storage are unchanged. No browser-extension
  rewrite, secret rotation, model/provider calls, live DB changes or deploy.

## Technical premortem

Verdict: GO; local-only tests use synthetic credentials and a labelled temporary DB.
Blast radius: connect/refresh endpoint -> IntegrationService -> IntegrationRepository
-> existing Integration row; Skool cookie reads and frontend token delivery consume it.

| Risk | Evidence / mechanism | Detection and mitigation |
| --- | --- | --- |
| A deleted/disabled/reconnected row is revived | Confirmed: generic upsert clears deletedAt; old token lacks generation | Refuse before authenticate; exact active-row conditional update; test a mid-RPC deletion/reconnect |
| Cookie bytes become readable or old posts fail | Confirmed: refresh writes signed JWT; Skool already reads AES and legacy JWT | Write AES only; retain flat cookie keys and existing read path; exercise real encryption and both legacy read formats |
| Existing extension stops refreshing | Confirmed: old JWT has no marker; client discards HTTP response | Document one reconnect for old grants; existing callback stores fresh token; no broad JWT rotation or silent legacy exemption |
| Executor changes unrelated UI/contracts | Read-only explorer limited to consumer mapping; backend root-owned | No child writes; root reviews scoped diff and original criterion before closure |

Recovery: local source revert before any release. No schema/backfill/secret rotation;
old encrypted and signed records are retained. Future rollout must publish the reconnect
note. A rollback restores earlier insecure grant handling and is a release decision.

## Execution and final verification

- Reproduce stale/disabled refresh and readable cookies against actual controller.
- Implement connect-generation binding and conditional writes together.
- One root acceptance: new focused JWT/controller/legacy-cookie tests, affected
  connect/access/event/role suites, real disposable PostgreSQL races and backend types.
- Record outcome, source-bound receipt and Beads/handoff; commit only selected files.

## Read-only stream delivery and acceptance

`/root/extension_refresh_contract` (`gpt-6-luna/max`) delivered current consumer map.
Accepted immediately: callback STORE replaces the stored JWT by integration ID;
daily refresh ignores response; rejecting untagged JWTs needs no client contract edit.
Safe cleanup: none required (no edits, processes, browser or runtime resources).
Graph-reviewed: stale local46ec4108 oriented only; controller, provider and client
files were confirmed in the current checkout. No graph/backend API refresh.
