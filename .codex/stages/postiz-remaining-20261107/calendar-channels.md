# T11 / T12 delivery — calendar channels and workspace names

Owner: `calendar_channels` child. Worktree: `/home/me/.codex/worktrees/postiz-remaining-20261107/content-factory-next`, branch `codex/postiz-remaining-20261107`. Source delivery is ready for root review; root acceptance and shared type checks are separate. No commit, push, deployment, real-account mutation, provider request or model call was made.

## Upstream provenance

Official GitHub PR metadata and patch responses were fetched with `gh api` on 2026-11-07. Upstream is AGPL-3.0 (checked `LICENSE` at PR2190's pinned head); local project remains AGPL-3.0 with its existing notices. Adaptation uses the upstream concepts, preserving local DTO/policy/data/UI contracts instead of applying the patches wholesale.

| PR | Pinned head | Merge commit | Local patch SHA-256 |
| --- | --- | --- | --- |
| [2205](https://github.com/gitroomhq/postiz-app/pull/2205) | `2a2c85c496ec5968ce2350fc0f28cb3b53b2d76d` | `86ba0f47b67391c83a5fa8958974712fbd7f0f69` | `9d6536ac748a61c9fb13ce85d400375584cc68c012a4d3546eda113d8819f4a5` |
| [2190](https://github.com/gitroomhq/postiz-app/pull/2190) | `bb2e01760d5460601222d20748b0f673c994039d` | `1af2885b106a2bc0c8bac576e9b68ce1d58ca18f` | `f4f3e88cc1265d459c5337f2d4ed3cbd775f76b6ed36c68db27a87c7812315e8` |
| [2183](https://github.com/gitroomhq/postiz-app/pull/2183) | `9cc6bf213658f234cc68a09d5706d1cc403c6a36` | `496c3804c419efcd27494fc4fcdde7c1d77ad773` | `92b02e3eeca7ab8b2c5f7e9332dd335eab4c210960439a915fab803525bcff13` |

Original patches are retained byte-for-byte in `/home/me/.local/share/content-factory-orchestration/postiz-remaining-20261107/upstream/` as read-only evidence. The stage `upstream/manifest.json` retains exact source identities and hashes. PR2205's first implementation filters fetched pages in the browser; this adoption performs the selection before database pagination and counting. PR2190 calls its field `customName`; the owner-selected local schema uses `displayName`. PR2183's group rename was absent locally, so a scoped endpoint and channel-menu action were added.

## Delivered behavior and files

- T11: `get.posts.dto.ts`, `get.posts.list.dto.ts` and `integration-ids.ts` accept optional validated `integrationIds` (comma string or repeated query array, max 200). Legacy `integrationId` continues to work; if both are supplied their predicates intersect. `posts.repository.ts` keeps tenant/deleted/channel/project/editorial/date/state predicates and uses one identical `where` for list and count.
- `calendar.context.tsx` carries selection through both server queries, saved URL and date/view changes; list selection resets to page zero. Project changes reset channel selection. `filters.tsx` renders the same searchable `SelectChannels` in day/week/month/list and gives plan-ahead the selected IDs. Existing timezone conversion and list editorial-stage behavior remain intact.
- T12: `Integration.displayName` is root-owned nullable schema work. `integration.display.name.dto.ts`, `integrations.controller.ts`, `integration.service.ts`, `integration.repository.ts` implement administrator-only local `PUT /integrations/:id/display-name`; empty alias resets to `null`; the write is constrained by organization and nondeleted channel. Safe response contains only ID/name/alias. No provider method is called.
- `integration-name.ts` is the shared alias/fallback helper. `/integrations/list` and post response serialization (`posts.list.minify.ts`) apply it, preserving provider `originalName` while all existing channel-label consumers receive the same `name`. Calendar/list projections include alias. Reconnect writes never set `displayName`, so it is retained. `bot.picture.tsx` starts provider nickname editing from `originalName`, keeping a workspace alias out of provider changes.
- Group rename: `PUT /integrations/customers/:id` checks current-workspace group existence, nonblank bounded name and duplicate name before a scoped write. Shared `ChannelNameForm` handles alias/group forms, original-name explanation, reset, loading and retained input on recoverable failures. `menu/menu.tsx` exposes local rename and group rename for administrators only. Inventory entries were added.

## Verification

Environment for all commands: Node `22.23.2`, pnpm `10.6.1`. Each command used `pnpm exec jest --runInBand --coverage=false` with the following explicit file set; no full suite was run.

1. New server/DTO/alias acceptance: `tests/calendar.multi-channel.test.cjs`, `tests/channel.display-name.test.cjs` passed. Coverage includes UTC window preservation, tenant/project intersection, legacy and empty selection, same list/count filter, page boundaries, malformed arrays, alias fallback/reset/idempotence, reconnect preservation, bounded names and refused foreign/duplicate groups.
2. New rendered controls: `tests/calendar.channels-ui.test.cjs` passed, covering multiple checked labels, alias/original search, all/reset, close/focus restoration, failed save retaining input, local-only reset endpoint and group name validation.
3. Reused matching green affected checks: `tests/editorial-stage.filter.test.cjs`, `tests/editorial-stage.calendar-filter-wiring.test.cjs` (selector expectation updated), `tests/posts-list.word-search.test.cjs`, `tests/integration.reconnect-tokens.test.cjs`, `tests/channel-menu.viewport.test.cjs`, `tests/launches.channel-rail.test.cjs`, `tests/integrations.writing-profile.routes.test.cjs`, `tests/integrations.channel-posts.routes.test.cjs`, `tests/channels.section.test.cjs`, `tests/integration.content.language.test.cjs`, `tests/channel-connect.role.test.cjs` all passed.
4. `tests/design.guard.test.cjs`, `tests/design.contrast.test.cjs`, `tests/foundation.test.cjs`, `tests/design.typography.test.cjs` passed. `git diff --check` passed.

Initial focused failures were investigated and corrected: class-validator child property metadata discarded inherited max/type validators, so group DTO has explicit validators; the old selector source assertion expected the replaced single-select; a pagination test fixture needed its real 25 returned rows; rendered labeled Input required the test's relative translation hook stub. These are resolved failures, not deferred checks.

## Boundaries and cleanup

Root owns final app type checks, Prisma generation/migration and integrated acceptance. No real database, full browser session, production deployment or live provider was exercised by this child. The rendered UI checks use real controls with a mocked overlay shell; they do not establish browser geometry or deployment acceptance. No task-owned server/process/container was started. Shared dependency installation belongs to root and was left intact; source patches and delivery evidence are intentionally retained. Unrelated concurrent edits were preserved. Graph report was absent from this worktree and main checkout; root was informed before wider orientation.
