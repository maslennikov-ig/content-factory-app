# .37 — mail queue logs: local source acceptance

Task content-factory-next-dbxe.37; root-owned branch
`codex/dbxe-mail-log-privacy-20261011`; baseline `1e80c202cf52`.

## Changed

Orchestrator installs a mail-only SDK Logger adapter before Nest starts workers.
Exact historical mail workflow/activity records emit fixed safe event codes,
canonical execution UUID and bounded numeric diagnostics. Raw message, recipient,
subject, body, token/cookie, error/stack/cause/details are never forwarded or
inspected. Severity/timestamp and default SDK INFO/Core filters stay unchanged.
Other SDK log messages and metadata pass through unchanged.

One command-free interceptor on main routes the historical mail sandbox console
through that safe sink. Reusable V8 freezes console methods: replace its virtual
binding rather than mutate shared methods. Active workflow type is checked on
calls; unrelated workflow console keeps its original arguments and behavior.

Historical V1/V2/V3 workflow/activity files, schemas/guards, production config and
lockfile remain byte-identical (45 protected files). No queued-mail deletion,
resignal, migration, provider failure mutation or retry policy change.

## Verification

8 affected Jest suites/141 tests, zero skips, including27 new logger/SDK/console/
bootstrap/wiring regressions. Backend/orchestrator types, docs/process/diff checks
are recorded in `root-acceptance.actual.json`.

Installed SDK1.15 native Worker, owned loopback Temporal server and fake delivery:
- V1/V2/V3 stdout/stderr contain none of4 distinctive synthetic privacy sentinels.
-13 activity attempts:3 permanent failures,3 transient retries and7 successful
  letters; no duplicate successful letter, queued order/arguments preserved.
- Actual legacy/current activity adapters retain non-retryable classification.
- Existing V2 survives the unchanged source selector and worker restart; a
  pending letter admitted while workers are stopped is delivered exactly once.
-3 native synthetic histories replay without a command discrepancy.
- Unrelated console, SDK and activity log markers remain visible; safe failure
  codes and legacy console routing remain visible.
- Own temporary container/volumes removed;70 existing containers preserved.

The unprotected native control reproduces the leak and fails solely on privacy.
Earlier fixture failures (metadata mock/shutdown and frozen console methods) are
retained in ignored local evidence and corrected before final acceptance.
No real provider/model/client messages or production queue access.

## Delivery and remaining

Safe private source push/readback is recorded in `source-delivery.local.json`.
No public snapshot, image, host mutation or new full release suite in this stage.
Fresh public API/login/source checks report availability of unchanged .34
public2a53727594a1/private92f784757329, separately from this source acceptance.
OPEN29 owns chosen exact-source deployment of24+37; this is not yet live proof.
OPEN31 owns the actual active-queue transition; it is not performed or closed.
Temporal history retains mail payload/error details needed by existing contracts;
its retention and old log cleanup remain separate (0qgn.5). No30-day claim.

Task37 closes at its provider-free source boundary; parent epic stays OPEN and
all30 original criteria remain preserved. Recommend a bounded24+37 delivery batch
under29 next. No automatic next task or continuous goal.
