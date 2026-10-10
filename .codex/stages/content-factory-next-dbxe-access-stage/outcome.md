# Access stage outcome — 9 October 2026

dbxe.1–.5 implemented and accepted locally, root-owned, on
`codex/audit-readiness-20261009`. Scope and acceptance come from Beads. The full
epic and its unselected 24 children remain open; this stage stops for the owner.

Root follow-up review found and corrected an incomplete dbxe.5 boundary: a
primary upsert could replace another provider's channel sharing its external ID.
The atomic write now includes the provider; a collision is a safe HTTP409 and
preserves the existing record, including concurrent connections. Latest affected
acceptance: **34 suites/558 tests, zero skips, including11 real PostgreSQL tests**.
Detailed review: `review/review.md`; latest receipt: `review/review-acceptance.json`.
The initial554-test acceptance below is preserved as historical evidence.

## Changes and compatibility

- Organization list uses an explicit credential-free projection and excludes
  disabled/missing membership. Admin self/rotation and existing keys work.
- Session/reset/activation JWT purposes are separate. Standard reset expiry is
  20 minutes; password-bound HMAC and a real atomic password predicate prevent
  replay/concurrent consumption. Legacy full-user sessions remain valid, also
  after password changes. Old reset links require a fresh email; activation
  cannot turn into a session after use. Generic JWT and encryption readers stay
  compatible with their independent contracts.
- Legacy pos_ grants read current exact-tenant membership/role on each request;
  removed/disabled members are refused. Public route policies deny USER writes,
  keep EDITOR content operations and restrict channel administration to ADMIN.
  Organization keys retain ADMIN; MCP authorization remains independent.
- Central cookie mutation Origin fence rejects foreign/null/missing Origin
  before authenticated effects. Intended frontend JSON/multipart and explicit
  session-header clients pass. OAuth callbacks and public bearer APIs remain
  on their existing authentication paths.
- Credential fan-out is tenant- and family-scoped. LinkedIn account/page sharing
  survives inside the workspace; other providers and workspaces remain intact.

Migration/delivery detail: `docs/operations/access-token-migration.md`.

## Verification and evidence

- 34 affected Jest suites / 554 passed, zero skips and natural exit with
  `--detectOpenHandles`. Seven real PostgreSQL tests prove persisted isolation,
  refresh/connect/concurrent tenant cases, password CAS, current OAuth roles,
  key-list output and legacy-session compatibility. No real provider involved.
- Backend `tsc --noEmit --incremental false`, `docs:check`, process verification
  and `git diff --check` PASS. Failed initial fixture/document checks are retained
  as local diagnostics; actual corrected passing proof is the acceptance basis.
- A new labelled PostgreSQL17 tmpfs fixture was used, with an explicit loopback
  datasource. Only that empty disposable database received `prisma db push`;
  fixture removed and foreign container IDs preserved. No production schema work.
- Fresh unauthenticated GET of production API/login/source: 200/200/200, published
  source still `cae3cd8340e0`. This only proves public availability/unchanged source;
  the new fixes have not been deployed or accepted in production.
- graph-reviewed: local46ec4108 map used for bounded orientation, exact current
  source verified. No refresh, hooks, external extraction or spawned agents.

Root receipt: `root-acceptance.actual.json`; raw logs/Beads snapshots/public
readback remain local. The immutable Beads scope snapshot preserves all30
original parent/child criteria, with only five selected tasks accepted here.

## Delivery and remaining gates

Scoped local commit only. No remote push, public-tree refresh, deployment,
active key rotation, real social connection/publication, paid call or messaging.
The working production service remains on its prior version and still needs an
explicit authorized release to receive these fixes. Historical key exposure,
misuse and overwritten live refresh rows remain UNKNOWN. Assess actual consumers
before any coordinated rotation/reconnect; do not mutate them blindly.

Before an affected release, triage applicable critical notices in dbxe.8 and use
the repository's exact-SHA full release receipt/procedure. Existing SaaS/legal/
client/research/backup/invoice gates remain intact. Suggested next bounded work:
dependency applicability(.8), with `next-stage-prompt.md` prepared for the next
chat. Publishing/readiness(.6/.7/.13/.15) and concurrent manual-edit
preservation(.10) remain later candidates. No continuous goal.
