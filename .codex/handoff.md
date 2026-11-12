# Content Factory handoff — 12 November 2026

Current stage id: heygen-release-20261111

## Ready Telegram post through MCP

Local delivery branch `codex/cf-mcp-ready-post` tracks
`content-factory-next-u76d`. The MCP editor supplies an exact HTML caption, a
connected Telegram channel and an owned image. The first call checks the
caption and asks for confirmation. The normal post queue handles delivery
after the one-time code is redeemed. The request ID maps to a create-only post
ID so a repeated or concurrent call can read the first result. The status tool
returns the Telegram URL after the worker records it.

The Fable and Carbon caption was checked locally through the production
sanitizer and Telegram formatter. It renders as five paragraphs with seven
links and a bold price comparison within the photo caption limit. Production
rollout and the real channel post are pending. This change needs no Prisma
migration and uses the current publication workflow.

Acceptance used eight focused Jest suites (167 tests), including the MCP
transport, confirmation, repeated requests, queue writes and Telegram
formatting. The backend TypeScript check and Nest build passed with the
lockfile-matched dependencies and an isolated generated Prisma client. The release suite
remains a rollout gate. The MCP connection guide was updated. No repository
graph was available in the checkout or its Content Factory siblings.

## Production status

Production stage id: heygen-release-20261111

Production serves the scoped reader cache fix at public `688ea5901796`, built
from private `6c6b43f19dee`. Both regressions and the exact local suite passed.
Public Build and CodeQL passed. The schema comparisons were empty, and the
serving image, API, login, worker and source archive were verified. The host
retains `71d44fed1588` for rollback.
[Production release](../docs/operations/production-deploy.md#current-release-11-november-2026-688ea5901796).

The scoped reader cache hashes the exact query. This preserves leading
whitespace and date qualifiers after a common 5,000-character prefix.
Release task `content-factory-next-u7zd` / HONEY-6459.
[GitHub mirror](https://github.com/maslennikov-ig/content-factory-next/issues/1292).

The previous HeyGen release remains the verified rollback.
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

Next stage id: cf-mcp-ready-post-rollout

Recommended action: Complete the authorized release for `content-factory-next-u76d`,
followed by a real MCP publication and a Telegram receipt.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the next selected Hoba task. Start from the
production release record and preserve the owner preview and rollback image.
