# Content Factory handoff — 11 November 2026

Current stage id: heygen-release-20261111

The owner-approved native HeyGen release is running on production. Public
`71d44fed1588` was built from private `d0a9589f0`. The local release suite,
public Build and CodeQL passed. The Prisma comparison was empty before and
after the switch. The serving image, source archive, API, login and worker
were verified. The host retains `588bb1fa244c` for rollback. Review new HeyGen
records and in-flight work for compatibility before switching back.
[Production release](../docs/operations/production-deploy.md#current-release-11-november-2026-71d44fed1588).

Release task `content-factory-next-ekqe.22.5` / HONEY-6420.
[HeyGen delivery record](stages/heygen-release-20261111/summary.md).
The owner confirmed acceptance of the HeyGen epic after delivery.
[HeyGen epic](https://github.com/maslennikov-ig/content-factory-next/issues/1280).
The preceding Postiz release and its guarded schema backup and apply are recorded
under `content-factory-next-2fcd` / HONEY-6368.
[Postiz delivery record](stages/release-preparation-20261108/summary.md#production-delivery-and-cleanup--11-november-2026).

The release-owned diagnostics, build clone and test fixtures were removed.
The original owner preview and other dirty worktrees hold independent work or
private material. Both canonical checkouts retain their local hook overrides.
The historical reader branch remains available. Its task was delivered through
the accepted alternative on `main`.
[Reader task](https://github.com/maslennikov-ig/content-factory-next/issues/1015).

## Explicit defers

New paid provider calls, account changes and live social publication require
separate scope. The deferred HeyGen speech-markup task stays outside the
accepted epic. [Deferred task](https://github.com/maslennikov-ig/content-factory-next/issues/1282).

## Next recommended

Next stage id: none

Recommended action: Select the next scoped task in Hoba.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the next selected Hoba task. Start from the
production release record and preserve the owner preview and rollback image.
