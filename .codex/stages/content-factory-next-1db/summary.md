# Stage Summary: desert-lab screen consumer adoption

> Namespace/package-label amendment (2026-08-14): the package labels in the
> verification excerpts below were normalized after
> `content-factory-next-wcx.1`. Commands, outcomes and metrics are unchanged,
> but those excerpts are no longer byte-for-byte copies of the earlier output.

## Goal

Put the desert-lab primitives into real product screens, adopt `ChannelMark`
without replacing real account pictures, and replace the calendar's new-tab
post preview with a shared accessible dialog while preserving the public
`/p/[id]` route.

## Outcome by screen

| Screen / surface | Files | Result | Revert boundary |
| --- | --- | --- | --- |
| Channel list | `apps/frontend/src/components/launches/launches.component.tsx` | Real `integration.picture` still wins; `ChannelMark` is the missing-picture fallback by channel name, while the platform logo remains the provider overlay. | `c125c941`, `8ea0fdb4` |
| Provider picker | `apps/frontend/src/components/launches/add.provider.component.tsx` | Providers keep their distinct platform logos. | `b3b686bc`, `8ea0fdb4` |
| Calendar customer menu | `apps/frontend/src/components/launches/select.customer.tsx` | Existing selection behavior now uses `Popover` and `MenuItem`. | `5af2db32` |
| Copy-public-link feedback | `apps/frontend/src/components/preview/copy.client.tsx` | Existing copy action now uses ui `Button` and `Toast`; an explicit post id produces `/p/[id]`. | `c3d06464` |
| Connection state screen | `apps/frontend/src/components/launches/continue.integration.tsx` | Loading, success and failure branches use `Panel`, `Status`, `PageHeader`, `ErrorState` and `Skeleton`. | `8080917f` |
| Statistics modal | `apps/frontend/src/components/launches/statistics.tsx` | Uses semantic ui table primitives and shared restricted, empty and loading states. | `1a9e2e2d` |
| Internal-channel settings | `apps/frontend/src/components/launches/internal.channels.tsx` | Existing React Hook Form registration and errors are preserved through `Field`, `Input`, `Textarea`, `Select`, `Toggle`, `Panel`, `EmptyState` and `Skeleton`. | `7d77e0b8` |
| Public post preview | `apps/frontend/src/app/(app)/(preview)/p/[id]/page.tsx`, `apps/frontend/src/components/preview/post.preview.tsx` | The public server route still fetches `/public/posts/:id`; its post/comments markup moved into one shared client-safe component. | `b85ed021`, `51d799bd` |
| Preview dialog | `apps/frontend/src/components/preview/post.preview.dialog.tsx` | `Dialog` loads the same public endpoint and renders the shared markup, copy-public-link action, loading/error/empty states and compact close action. Its wordmark is non-navigating inside the modal. No iframe. | `8aaec11a`, `e137db18`, `8ea0fdb4` |
| Calendar preview entry point | `apps/frontend/src/components/launches/calendar.tsx` | The preview button opens `PostPreviewDialog` instead of `window.open`; it remains rendered while not hovered, and Escape returns focus to the visible trigger. | `93706d4a`, `a54c593b`, `8ea0fdb4` |
| Account picker | `apps/frontend/src/components/launches/helpers/pick.platform.component.tsx` | Real picture remains primary; `ChannelMark` is the missing-picture fallback by channel name and the platform logo identifies the provider. | `d700781d`, `8ea0fdb4` |
| New-launch social picker | `apps/frontend/src/components/new-launch/picks.socials.component.tsx` | Real picture remains primary; broken pictures fall back safely, platform logos remain distinct, and the selected outline also covers `ChannelMark`. | `0429b557`, `8ea0fdb4` |
| New-launch active channels | `apps/frontend/src/components/new-launch/select.current.tsx` | Real picture remains primary; broken pictures fall back safely, `ChannelMark` uses the channel name, and the platform logo remains visible. | `507f1235`, `8ea0fdb4` |
| Agent channel list | `apps/frontend/src/components/agents/agent.tsx` | Real picture remains primary; broken pictures fall back to the platform logo and `ChannelMark` is only the missing-picture fallback by channel name. | `c24cbf7b`, `8ea0fdb4` |
| Import picker | `apps/frontend/src/components/launches/import-debug-post.modal.tsx` | Real picture remains primary; `ChannelMark` is the missing-picture fallback by channel name and the adjacent provider keeps its platform logo. | `5ce68725`, `8ea0fdb4` |

The process metadata is isolated in `47030975`. The original migration commits
remain screen-scoped. Review correction `8ea0fdb4` deliberately restores one
cross-screen identity and fallback contract; its replacement browser evidence
is kept in a separate commit. The shared-preview extraction and dialog remain
separate from the calendar entry point, so the latter can be reverted without
deleting the public route or shared markup.

## Consumer recount

The dated specification used a lexical name count, not an import-identity
count. Its authoritative baseline is retained verbatim here:

| Specification row | Measured consumers at `1e1e6d74` |
| --- | ---: |
| `Dialog`, `Popover`, `MenuItem`, `Toast` | 0 |
| `PageHeader`, `ErrorState`, `RestrictedState`, `Skeleton` | 0 |
| `Toggle` | 0 |
| `ChannelMark` | 0 |
| `Table`, `Th`, `Td`, `Tr` | 1 |
| `Panel` | 1 |
| `EmptyState` | 2 |
| `Status` | 3 |
| `Button` | 66 |

For acceptance, the same TypeScript-AST import audit was run on `1e1e6d74`
and on this branch. It counts distinct files that import the exact value from
`apps/frontend/src/components/ui/**`, excluding the ui implementation itself.
This avoids treating a legacy upstream shared-form import as a consumer of
`ui/button`.

| Primitive | Direct consumers before | Direct consumers after |
| --- | ---: | ---: |
| `Dialog` | 0 | 1 |
| `Popover` | 0 | 1 |
| `MenuItem` | 0 | 1 |
| `Toast` | 0 | 1 |
| `Panel` | 0 | 2 |
| `Status` | 0 | 1 |
| `PageHeader` | 0 | 1 |
| `EmptyState` | 1 | 4 |
| `ErrorState` | 0 | 2 |
| `RestrictedState` | 0 | 1 |
| `Skeleton` | 0 | 2 |
| `SkeletonRows` | 1 | 3 |
| `Table` | 0 | 1 |
| `Th` | 0 | 1 |
| `Td` | 0 | 1 |
| `Tr` | 0 | 1 |
| `Section` | 0 | 1 |
| `Field` | 0 | 1 |
| `Input` | 0 | 1 |
| `Textarea` | 0 | 1 |
| `Select` | 0 | 1 |
| `Toggle` | 0 | 1 |
| `Button` | 0 | 2 |
| `ChannelMark` | 0 | 8 |
| `CloseIconSmall` | 0 | 1 |

All other exported ui values were also audited. Their consumer counts stayed
non-zero: `CalendarIcon` 1, `CfMark` 1, `CheckIconComponent` 1,
`CheckmarkIcon` 1, `ChevronDownIcon` 1, `ChevronLeftIcon` 2,
`ChevronRightIcon` 2, `ChevronUpIcon` 1, `CloseCircleIcon` 1, `CloseIcon` 1,
`CollapseIcon` 1, `ConnectionLineIcon` 1, `DelayIcon` 3,
`DeleteCircleIcon` 1, `DesignMediaIcon` 1, `DocsLink` 2, `DragHandleIcon` 1,
`DropdownArrowIcon` 4, `DropdownArrowSmallIcon` 1, `EmojiIcon` 1,
`ExpandIcon` 1, `GlobalIcon` 1, `InsertMediaIcon` 1, `LockIcon` 1,
`MediaSettingsIcon` 1, `NoMediaIcon` 1, `PlusIcon` 3, `RepeatIcon` 1,
`ResetIcon` 1, `SettingsIcon` 1, `TagIcon` 1, `TrashIcon` 3, `UserIcon` 1,
`VerticalDividerIcon` 1, `Wordmark` 4 and `useHasScroll` 1.

Two zero-import exports have recorded reasons:

- `PRODUCT_NAME` is a constant used internally by its consumed `Wordmark`, not
  a standalone UI primitive that needs an application import.
- `ui/translated-label.tsx::TranslatedLabel` duplicates the canonical shared
  implementation in
  `libraries/react-shared-libraries/src/translation/translated-label.tsx`.
  Real form consumers intentionally use the canonical shared component; adding
  a second source of truth only to increase a count would be wrong.

## ChannelMark semantics

Eight application files directly consume `ChannelMark`: the launches channel
list, calendar, account picker, import picker, new-launch social picker,
new-launch active channels, agent channel list and shared public preview. Every
account surface keeps its existing non-empty picture. The mark is rendered only
when that picture is absent and is derived from the channel name. Provider
identity uses the existing distinct platform logos; `ChannelMark` is never
derived from a provider identifier.

The remaining `/no-picture.jpg` uses are provider-specific simulated previews,
not channel-list or provider-label surfaces. They were left unchanged because
replacing a network-specific simulated avatar would change the screen's data
representation rather than adopt a shared account fallback. The AI-provider
settings screen and `libraries/nestjs-libraries/src/openai/**` were not touched.

## Browser proof

A real Windows Chrome session exercised the actual calendar route with a local
draft card. The preview trigger was focused, the dialog opened, the pointer was
moved away from the card, and Escape closed the dialog. The returned focus and
computed visibility were:

```json
{
  "url": "http://localhost:4200/launches?startDate=2026-08-10&endDate=2026-08-16&display=week",
  "title": "Calendar · Content Factory",
  "triggerLabel": "Предпросмотр поста",
  "triggerDisplay": "block",
  "triggerVisibility": "visible",
  "triggerOpacity": "1",
  "focusReturnedToTrigger": true,
  "focusReturnedToVisibleTrigger": true,
  "activeElement": {
    "tag": "BUTTON",
    "ariaLabel": "Предпросмотр поста"
  }
}
```

Evidence: `output/playwright/desert-lab-calendar-focus-return.png` and
`output/playwright/desert-lab-calendar-focus-return.json`. The old temporary
stand screenshot was removed from `a54c593b`; that commit now contains code
only. The dedicated local user, organization, channel, post, browser profile
and test servers were removed after the run. No account was connected and no
post was published.

## Verification

The required commands were run fresh on the finished implementation. Their
terminal result summaries, with the package-label amendment above, were:

### `pnpm run build`

```text
> content-factory@1.0.0 build /home/me/code/content-factory-next-desert-lab
> pnpm -r --workspace-concurrency=1 --filter ./apps/frontend --filter ./apps/backend --filter ./apps/orchestrator run build

Scope: 3 of 7 workspace projects

> content-factory-frontend@1.0.0 build /home/me/code/content-factory-next-desert-lab/apps/frontend
> next build

▲ Next.js 16.2.6 (Turbopack)
- Experiments (use with caution):
  · clientTraceMetadata
  · proxyTimeout: 90000

  Creating an optimized production build ...
✓ Compiled successfully in 17.0s
  Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 410ms
  Running TypeScript ...
  Finished TypeScript in 10.6s ...
  Collecting page data using 23 workers ...
✓ Generating static pages using 23 workers (3/3) in 145ms
  Finalizing page optimization ...

> content-factory-backend@1.0.0 build /home/me/code/content-factory-next-desert-lab/apps/backend
> cross-env NODE_ENV=production nest build

> content-factory-orchestrator@1.0.0 build /home/me/code/content-factory-next-desert-lab/apps/orchestrator
> cross-env NODE_ENV=production nest build
```

Exit code: `0`. The route manifest still contained `ƒ /p/[id]`.

### `pnpm test`

```text
Test Suites: 31 passed, 31 total
Tests:       197 passed, 197 total
Snapshots:   0 total
Time:        4.491 s
Ran all test suites.
....
----------------------------------------------------------------------
Ran 4 tests in 0.524s

OK
```

Exit code: `0`. All three design suites and the new desert-lab review
regression suite passed as part of the 31 suites.

### `node scripts/branding/brand-scan.cjs`

```text
0 unexplained reference(s); 2211 allowlisted reference(s).
```

Exit code: `0`.

The same root closeout additionally reported, verbatim:

```text
Documentation links OK (50 files checked)
orchestration contract OK (balanced-v2.19 via orchestration-setup)
git diff --check OK
process verification OK
blocking review findings OK
stage closeout verification OK
```

The first closeout attempt stopped before running commands because the
completion-inbox paths still named the closed `ja3` stage. They were retargeted
to `content-factory-next-1db`; a dry run then passed, and the release run above
completed. This was a process-metadata correction, not a product change.

## Assumptions

- “Consumer” means a distinct application file that imports the exact exported
  ui value; the specification's older lexical count remains visible for audit
  continuity but is not used to prove import identity.
- Provider simulation previews that intentionally show a platform-specific
  placeholder are not account-avatar fallbacks and are outside this migration.
- The post used in browser proof was dedicated local test data and was removed
  with its user, organization and integration after capture; no post was
  published and no real user was messaged.
- The manual reviewer will review this branch before merge. This stage does not
  push, merge, deploy, connect an account, call a paid model or publish content.

## Durable reviews

`docs-reviewed: updated - this summary, handoff and project index record the corrected ChannelMark/platform-logo contract, visible calendar focus return, updated rollback boundaries and replacement evidence; no API, architecture or operations contract changed.`

`project-index: updated - the shared public preview component and calendar dialog entrypoint are now stable frontend navigation points.`

`project-index: reviewed-no-change - retargeting the completion inbox from the closed ja3 stage to the current 1db stage is process metadata only and adds no stable navigation entrypoint.`

`graph-reviewed: updated - the ignored local graph was refreshed at this release boundary after the report commit, with external model/API extraction and query logging disabled; its report was checked against the current source commit.`
