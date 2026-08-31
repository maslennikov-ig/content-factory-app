# Stage 6 summary

Status: accepted.

Stage `content-factory-next-or3` completes the public product-to-registration
funnel without starting stage 7. Existing truthful `/`, `/product`, `/security`,
`/docs`, and synthetic `/demo` surfaces were retained. The public and standard
registration flows now share an allowlisted starter-template chooser, preserve
a short-lived single-use intent across LOCAL and OAuth, and keep workspace name
optional. `content-workflow` atomically seeds exactly four tags — Plan, Draft,
Review, Schedule — while blank/default remains a no-op.

The conversion boundary retains exactly six aggregate events without a
persistent visitor identity or arbitrary properties. A protected super-admin
report reads only daily aggregates and returns six totals plus five zero-safe
ratios for a bounded UTC range.

## Evidence

- Browser proof: 40 route × viewport × theme × locale cases and 5 demo-flow
  frames (45 PNG total), with 0 horizontal overflows, visible focus in 40/40,
  reduced-motion coverage, and RU/EN in both themes at 390 and 1440 px.
- Network ledger: 2,053 requests, exactly 10 same-origin growth-event POSTs,
  and 0 external or forbidden mutations and 0 sensitive payload fields.
- Disposable PostgreSQL/Nest proof: 15/15 checks, zero skips, green twice;
  step one creates no User/Organization/Tags, LOCAL and local OAuth create the
  four tags exactly once, replay is a no-op, and invalid templates fail before
  repository access.
- Required Docker contour: Jest 31/31, native source registry 1/1, native
  content context 13/13, real PostgreSQL 17 Mastra migration proof, and local
  dump/restore proof; cleanup inventory was empty.
- Independent review found two P1 gaps (optional workspace and real auth E2E)
  plus a closeout P2. Both P1 findings were corrected and re-proved; the P2 is
  closed by this release closeout. No P0 or P3 findings remained.

The first full-suite candidate exposed release-only compatibility gaps before
acceptance: the chooser used a raw input, a manual font weight, and an
off-rhythm 3 px offset; two local test loaders lacked the new shared imports,
orchestration delivery metadata pointed at the review branch, and two
fail-closed child-process checks had too little parallel-run startup headroom.
The chooser now uses the shared `RadioGroup` and a 4 px rhythm. The Docker guard
`tests/docker-ci-contract.test.cjs` passes 33/33, and runtime evidence is
byte-stable across consecutive disposable runs. The authoritative totals for
every other set are the receipt's, not a number retyped here.

One of those gaps was not a compatibility gap at all. `tests/post.content-context.test.cjs`
carried absolute fixture dates that expired at `2026-08-21T10:00:00Z`, so five
of its subtests began failing on the wall clock rather than on any change —
first on this branch, and on `main` for everyone else. The repair replaced the
absolute dates with `now ± 86_400_000` and proved sensitivity by reversing the
`sourceStale` value until the guard failed again; the production validator was
not touched, because it correctly reads the real clock. The record is
`artifacts/docker-contour-fixture-repair.md`. Until this branch lands, the same
five failures remain on `main`; that is `content-factory-next-wgi`.

The authoritative final build/test/brand/docs/process/diff totals are recorded
in the release receipt generated under this stage directory. A later audit
round re-ran the same release set independently, reproduced those totals, and
left its own receipt beside the first: `acceptance-receipt.json` is the
acceptance at `f7c13e5a`, `acceptance-receipt.audit.json` the re-acceptance
after the audit's corrections. No schema or
migration was changed. No live publishing, provider connection, paid call,
credential wiring, push, PR, merge, or deployment was performed.

docs-reviewed: updated — handoff and project index now describe the accepted
public funnel and its stable entrypoints.

graph-reviewed: updated — local Graphify was refreshed at the integration
boundary; a focused path confirmed that `registration-intent.ts` imports the
shared `starter-template.ts` contract, which is also consumed by both auth
surfaces, the DTO, and the chooser. A final refresh also confirmed the direct
chooser → shared `RadioGroup`/`RadioOption` edge. The report test node is
present in the refreshed graph.
