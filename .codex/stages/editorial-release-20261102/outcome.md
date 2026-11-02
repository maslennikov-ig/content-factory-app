# Telegram editorial quality — production release 2 November 2026

Private source `dc1be38711f1e6f2c9b9f14d9b9c0357da588b35` was fast-forward merged
through PR 1220. Public tree/runtime `0bdd01349db6485b087c016a3d8f3bdbda1ef1d9`
was prepared by the tracked-tree export and carries its `Source-Commit` trailer.
Registry digest: `sha256:2d5d261f6a0d5b7d31c70b53cc249b1859a30f8b098dbbb3a8ab72c3bd90d867`.
Verified previous rollback: `658f835b5f18`.

The final exact-source release receipt records Jest 809 suites passed, 17 skipped;
13,917 tests passed, 162 skipped; Node 170 pass/0 fail; Python 50 OK. The application
build, release process verification, image nginx check and commands help passed.
[Public Build](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41433455820)
and [Code Quality](https://github.com/maslennikov-ig/content-factory-app/actions/runs/41433455799)
both passed on the exact public commit, including ordinary and +400-day Jest.

The new image was pulled with its digest verified; the standard switch script
reported release marker agreement and 0 container restarts. Independent checks:
healthy, backend/frontend/orchestrator online with 0 restarts, ~20 GB free, empty
Prisma diff before and after, no SQL applied, separate Mastra storage has 47 tables.
Public login, root and API endpoints returned 200; login rendered at 390 px without
horizontal overflow. Public source archive hash matched the running image and page:
`fa9f0c97d21729381cc1a33cd4d4d53e237fdcb43a7886f67d0f3bcccad3798d`.

No real Telegram publication or paid inference/search/image generation was performed;
therefore actual account-specific Telegram rendering and live-model editorial
quality are not production-accepted by this release. Local mocked/native acceptance
is recorded in the editorial quality stage. Preserve running shared services,
other worktrees and the dirty original public clone. Temporary host schema helpers
were removed by the preflight/postflight traps; no credential material is in Git.
The initial registry upload failed on a broken pipe; the safe retry passed.

Release evidence is retained privately under
`/home/me/.local/state/content-factory-next/release-editorial-20261102/`.
`graph-reviewed: blocked` — no project or checked sibling graph was present; no
external extraction or hook change was performed. `docs-reviewed: updated` —
release record and handoff updated after switch. No live social send or paid call.
