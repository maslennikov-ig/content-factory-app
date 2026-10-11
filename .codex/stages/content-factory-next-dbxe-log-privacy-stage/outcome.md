# .24 — ordinary mail/video logs: local source acceptance

Selected task: content-factory-next-dbxe.24. Branch:
`codex/dbxe-log-privacy-20261011`; baseline `2b1485ba3081`.

## Changed

- EmailService no longer logs recipient, provider result, raw error or malformed
  recipient input. Fixed event/code, attempt/retryability and random UUID preserve
  useful local diagnosis. Disabled mail is reported as skipped, not delivered.
- MediaService no longer logs customParams. Fixed completion/failure records
  carry only random correlation. Success is emitted after credit/generation/
  upload/persistence completes, not after validation.
- The slide-video provider no longer logs generated image/audio URLs.
- Delivery arguments,3 attempts with700ms waits, permanent rejection, thrown
  provider failure identity, video errors/credit/storage behavior remain intact.
  Historical Temporal activities/workflows, production configuration, schema and
  lockfile remain byte-identical (45 protected files).

## Verification and delivery boundary

Root affected acceptance:6 Jest suites/37 tests, zero skips (23 new synthetic
privacy/behavior cases); backend and orchestrator type checks. Documentation,
process checks and diff validation recorded in `root-acceptance.actual.json`.
No real messages, paid/provider calls, customer logs or global logging settings.
Root owns the coupled stage; no delegated streams or owned runtime tails.

Read-only production API/login/source checks return200; serving public source
`2a53727594a13c15c8740af0686ebffb40d34bfd` remains the accepted .34 release.
This stage publishes private source only after safe remote checks; the exact
private delivery readback is retained in `source-delivery.local.json`.
No public snapshot, image or production switch. Changed application source is
pending the chosen exact-source release batch in existing OPEN dbxe.29.
Local acceptance does not mean these fixes are already deployed.

## Remaining

New OPEN dbxe.37: unchanged mail workflows log recipient/subject/raw failure;
installed Temporal SDK also forwards raw activity errors to its logger. Scope
its fix to mail, preserve recorded contracts/retries and pending messages, and
coordinate with OPEN31 active-queue migration. This confirmed gap prevents a
claim that all ordinary logs are free of personal data. No live prevalence was
measured. Original24 acceptance covers the generic service call sites; original
criteria were not rewritten to hide the separate queue/SDK finding.

OPEN0qgn.5 retention remains separate: neither30-day retention nor historical
log cleanup is inferred. Original epic remains OPEN, all30 criteria preserved.
Recommend37 next; do not start it automatically or close the entire epic.
