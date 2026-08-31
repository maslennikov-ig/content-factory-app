# Implementation log: content-factory-next-ry5.2

Status: accepted; canonical release receipt is `acceptance-receipt.json`.

## Decisions

- The task model is Сол because the same run contract escalates any
  registration/authentication change from the table's Терра default.
- Double opt-in is the delegated owner decision. Consent starts false and only
  requests an unconfirmed membership; Listmonk owns confirmation and unsubscribe
  state. Membership is independent of product approval/activation.
- Listmonk is pinned to `v6.2.0`, stays on the private product network, and uses
  a separate role/database inside the existing PostgreSQL container. The 384 MiB
  cap is a reversible host-safety starting point, not a vendor requirement.
- The Beads description's API-key contract remains the primary authenticated
  create path. A 409 uses the official internal public-subscription endpoint and
  public double-opt-in list UUID so existing/unsubscribed membership re-enters
  confirmation instead of being silently accepted. The API-required `name` is
  one fixed non-personal label.
- The application does not add an e-mail lookup/unsubscribe form. Listmonk's
  opaque UUID confirmation and unsubscribe pages are the safe public boundary.

## TDD and review evidence

- Backend/infra RED: 14 of 22 failed for the absent consent, provider, private
  runtime, proxy, bootstrap and recovery behavior. Follow-up REDs covered the
  required neutral API name, quoted Nginx UUID expression, consent-false
  provider path and optional backup identity/quiescing.
- Backend/infra GREEN after review corrections: 8 focused suites, 110/110.
- Frontend RED: 5/5 failed before the native consent and locale key existed;
  GREEN passed. Accessibility review then found unrecoverable loading after a
  rejected request. A second RED reproduced it; final UI/design/locale set
  passed 8 suites, 61/61.
- Independent accessibility review: ACCEPT after the retry recovery and provider
  matrix correction.
- Independent accessibility, security and correctness reviews: ACCEPT after
  corrections and explicit bounded defers.

## Integration and defers

- Root corrected one broken pre-existing documentation link in
  `docs/design/desert-lab/platform-card.md`; this was the only `docs:check`
  failure and is a mechanical release-gate repair.
- `content-factory-next-ry5.2.1` tracks durable retry after a transient internal
  Listmonk failure. The current bounded behavior preserves the account and logs
  no address, but requires operator remediation.
- `content-factory-next-ry5.2.2` tracks a true least-privilege product runtime
  database role. It cannot be added honestly while pinned `@mastra/pg` performs
  runtime CREATE/ALTER/function/trigger migrations for 29 `mastra_*` tables;
  granting schema ownership would preserve the unsafe boundary under a new name.
- Actual database bootstrap, Listmonk container, SMTP, list/API user, campaign,
  UUID browser flow, backup rehearsal, server access and deployment were not run.

## Final verification

The root-owned canonical release closeout passed on Node 22.23.2 with
`TMPDIR=/tmp`: all three application builds; 75/75 Jest suites and 695/695
tests; 6/6 Python tests; brand scan with 0 unexplained and 7 allowlisted
references; 68-file documentation check; process verification; diff check.
The exact result is `acceptance-receipt.json`.
