# dbxe.10 — bounded local correction, 9 October 2026

Accepted locally on `codex/audit-readiness-20261009`, from `f1c9fdcd5121`.
Only `content-factory-next-dbxe.10` selected; original acceptance criteria preserved.
Root executed directly: one small command fix did not benefit from delegation.

`adaptations:rerender-bold --apply` now conditionally updates the Post using the
exact read content and related derivation ID, organization, raw body and existing
`updatedAt`. A moved row is counted skipped. No new schema, versioning system,
locks, confirmations or changes to normal editing/AI rewriting.

Regression reproduction: six affected cases failed before the correction.
Root acceptance: **3 Jest suites / 51 tests / zero skips PASS**, including eight
real PostgreSQL tests. Post/body/version edits after reading survive unchanged;
raw spacing, state and deletion changes skip; two concurrent rerenders write
once; repeat runs do not change the derivation. Dry-run behavior remains covered.

Command: `pnpm exec jest --runInBand --runTestsByPath tests/adaptation-bold-backfill.test.cjs tests/adaptation-bold-backfill.postgres.test.cjs tests/editor-html.bold.test.cjs`.
Node `22.23.2`, pnpm `10.6.1`, Prisma `6.5.0`, owned disposable PostgreSQL 17.
Raw evidence and exact tested-input hashes: `acceptance.local.json`,
`acceptance.local.log`; initial reproduction: `reproducer.local.log`.
Only the labelled disposable container was removed; all 69 pre-existing
container IDs remained. No customer data or production backfill was touched.

Epic stays OPEN; dbxe.8 retains full release acceptance. No push/deploy or
automatic next task. Next candidate: dbxe.13, stale extension refresh access.
