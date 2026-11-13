# Content Factory handoff — 13 November 2026

## Telegram rich posts and local photo transfer

`content-factory-next-bqc9` is implemented on `codex/telegram-rich-mcp`.
`telegram_publish_ready` accepts an ordered list of up to ten owned photos
and supports a classic album caption or one Telegram rich message with
headings, lists and a photo collage. Existing one-photo calls remain supported.
The confirmation binds the destination, format, text and ordered photos.
`media_upload` can reserve a two-minute multipart upload using a local proof
and photo digest. The existing picker remains available.

Verified 192 focused tests, the backend and worker builds, the stored HTML
path and real multipart transmission to a loopback Telegram endpoint.
The MCP SDK tests cover direct upload, authorization, checksums and replay.
Production deployment and live Telegram delivery remain pending.
[Operator instructions](../docs/operations/mcp-connect.md#опубликовать-готовый-пост-в-telegram).

Current stage id: heygen-release-20261111

## Release verification

Task `content-factory-next-2vi4` runs the optional local complete suite with four
concurrent Jest shards, each with its own disposable PostgreSQL and Redis.
It verifies native discovery, coverage, JUnit and cleanup before the single
Node and Python runs.

Production builds and image publication use the verified Build artifact for the
exact public checkout. Calendar CI and the pre-switch CodeQL check still apply.
The importer was exercised against public Build `43238459016` for the existing
production source. [Release procedure](../docs/operations/production-deploy.md#обновление-версии).

The complete local run at `846869c222ab` passed 16,857 Jest tests in 958
suites, 351 Node tests and 51 Python tests. The four Jest processes started
within 6 ms, used eight distinct loopback ports, and removed their containers
before Node and Python ran. Jest took 16m 18s versus 59m 42s for the previous
sequential release on this machine. The complete local receipt took 16m 54s.
The first parallel attempt hit the added 4 GiB heap limit. The passing run
inherited the existing Jest heap configuration. The changes entered private `main` at `44af89093fc9` and shipped as public `f7eca4e83263`.

Production Build `43260294023` and CodeQL `43260293548` passed for the
deployed public commit. The hosted artifact supplied the receipt for both
image gates. Four ordinary Jest shards, two calendar shards and one aggregate
suite ran on GitHub, with zero new local complete-suite runs during rollout.
The serving digest, API, login, worker, schema and source archive were verified.
The previous image `2c59cd8ab84a` is available for rollback.
[Production release](../docs/operations/production-deploy.md#current-release-12-november-2026-f7eca4e83263).

## Ready Telegram post through MCP

`content-factory-next-u76d` was delivered at public `2c59cd8ab84a` from private
`b4c57fa52b30`. The exact release suite, public Build and CodeQL passed.
The running digest, API, login, worker and source archive matched the release.
The schema comparison was empty on both sides of the switch.
[Production release](../docs/operations/production-deploy.md#previous-release-12-november-2026-2c59cd8ab84a).

The authorized Fable and Carbon post with its approved cover and formatting
was published through the live OAuth MCP tools. The provider reported
`PUBLISHED` with a Telegram message URL. The private delivery record holds the
channel and receipt. That rollout retained `688ea5901796` as its rollback image.

## Production history

Production stage id: heygen-release-20261111

The scoped reader cache hashes the exact query. This preserves leading
whitespace and date qualifiers after a common 5,000-character prefix.
Release task `content-factory-next-u7zd` / HONEY-6459.
[GitHub mirror](https://github.com/maslennikov-ig/content-factory-next/issues/1292).

The previous HeyGen release remains part of the release history.
[HeyGen release](../docs/operations/production-deploy.md#previous-release-11-november-2026-71d44fed1588).

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
