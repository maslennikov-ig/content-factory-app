# Frontend source audit

## Baseline and scope

- Audited the current private checkout at `5189430f175382d246629a461d62836c8811b241` on 2026-10-09. Read `AGENTS.md`, `.codex/handoff.md`, `.codex/project-index.md`, and the stage plan.
- Read-only orientation used `/home/me/code/content-factory-next-worktrees/editorial-release-20261008/graphify-out/graph.json`. Its report says it was built at `e2ec588dca449dcbaefe1b2a56ef42bcb2408a6d`, so graph results were navigation only; each cited route and source file was checked in this checkout. A graph miss was not treated as proof of dead code.
- Enumerated 87 route files, 723 frontend source files, 79 shared React source files, and 37 helper source files. Focused review covered the signed-in navigation and primary routes (`/launches`, `/content`, `/channels`, `/media`, `/agents`, `/analytics`, `/settings`, `/onboarding`), auth entrypoints, common fetch/autosave helpers, and targeted searches for stubs, no-op controls, and swallowed failures. This was not a line-by-line review of every inventoried source file.
- No tests, build, browser flow, live API, credentials, or external services were used. Findings below are source-confirmed; prevalence of legacy rows and runtime behavior were not measured.

## Actionable findings

### F1 — P2 — list request failures render as empty content

**Trigger and evidence.** `/launches` calls `CalendarWeekProvider`. Its calendar and list fetchers parse JSON without checking `response.ok` (`apps/frontend/src/components/launches/calendar.context.tsx:252-293`); both SWR hooks omit their `error` result (`:295-321`). `ListView` then renders the ordinary empty state when its list is absent (`apps/frontend/src/components/launches/calendar.tsx:697-721`). The `/media` route reaches `MediaBox`; its loader also parses JSON without checking status and the hook omits `error` (`apps/frontend/src/components/media/media.component.tsx:297-307`). When `data?.results` is absent, the page prints “You don't have any media yet” (`:650-680`). The media delete handler likewise ignores the response status and has no failure message (`:493-510`).

**Effect.** A dropped connection or failed API response can look like deleted/never-created posts or media, with no retry affordance. A failed media deletion can leave the item in place without explaining why. This is especially misleading on the main calendar and library.

**Smallest acceptance.** Distinguish a successful empty payload from a failed read in both routes, show a localized error with retry, and check mutation responses before treating a media delete as complete. Exercise network rejection and a JSON 5xx response; neither may render the empty state.

### F2 — P2 — calendar mutation actions are shown to read-only members

**Trigger and evidence.** The calendar builds duplicate and delete actions unconditionally (`apps/frontend/src/components/launches/calendar.tsx:1543-1595`); `PostCardActions` renders the supplied action list without a role gate (`apps/frontend/src/components/launches/post-card.parts.tsx:375-455`). `ListView` passes edit, duplicate, and delete callbacks for each row regardless of role (`calendar.tsx:742-755`). The `USER` role is read-only for `Sections.EDITOR`; `/posts/:group` requires that section (`docs/product/roles-matrix.md:21-30, 156-164`). On a denied delete, `usePostActions` does not inspect the `Response` and still shows “Post deleted successfully” and refreshes (`calendar.tsx:323-346`). The shared `customFetch` returns non-OK HTTP responses to callers rather than throwing (`libraries/helpers/src/utils/custom.fetch.func.ts:104-114`).

**Effect.** A read-only member sees controls the server will deny and can receive a false deletion-success message while the post remains. This is a UI/feedback defect; the source review does not indicate an API authorization bypass.

**Smallest acceptance.** Keep preview/read actions available, but gate write actions with `isOrganizationEditor`; only show success after an OK response and surface a retryable failure otherwise. Check the calendar as `USER` and `EDITOR`.

### F3 — P2 — failed channel deletion can clear the extension token

**Trigger and evidence.** From a channel detail, an administrator can invoke `actions.remove` (`apps/frontend/src/components/channels/channel-screen.tsx:394-403`). `deleteChannel` handles status 406 specially, but treats every other resolved response as success: it sends `REMOVE_REFRESH_TOKEN` to the browser extension and shows “Channel Deleted” without checking `response.ok` (`apps/frontend/src/components/launches/menu/menu.tsx:269-316`). `customFetch` returns a non-OK `Response` after its common response handler (`libraries/helpers/src/utils/custom.fetch.func.ts:98-114`).

**Effect.** If the server returns another refusal or a 5xx while the channel row remains, the UI may still delete the extension's refresh token and tell the user the channel was removed. That can leave a still-listed extension channel unable to refresh until reconnected.

**Smallest acceptance.** Check the deletion response before extension cleanup, success notification, and refresh. On failure, retain the extension token and show an error that can be retried. Cover 406, another non-OK status, and success.

### F4 — P2 — pending content edits are discarded after an unobserved save failure

**Trigger and evidence.** The core editor schedules saves after a one-second pause and flushes on blur (`apps/frontend/src/components/content-intelligence/pieces/core-edit.tsx:84-117`). On unmount, `useAutosave` clears the timer and pending reference, then calls `saveRef.current` without awaiting or observing its boolean result (`apps/frontend/src/components/ui/use-autosave.ts:90-98`). The adaptation editor has the same failure boundary: on `PieceContainer` unmount it sends pending text, swallows rejection, and clears the pending map (`apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx:359-385`).

**Effect.** If navigation or full-page unload happens before the pending save finishes and that request is refused, interrupted, or fails, the last text has no visible failure state, retry, or recovery copy. On an in-app route change the request may still finish, so loss is conditional on failure; the definite gap is that unmount removes the only UI path to retry.

**Smallest acceptance.** Do not abandon the only copy of dirty text until a flush succeeds. Keep navigation in the editor on refusal or retain a recoverable local draft, and show an actionable failure. Check immediate route change and rejected save for both core and adaptation edits.

### F5 — P2 — the legacy no-group calendar branch is display-only for deletion

**Trigger and evidence.** `groupPostsByGroup` intentionally renders a row without `group` under `post.id` as a standalone group (`apps/frontend/src/components/launches/calendar.tsx:235-253`). The same row’s delete callback still targets `/posts/${post.group}` (`:323-346`), producing `/posts/undefined` when the legacy field is absent; because it ignores `response.ok`, it then reports success.

**Effect.** A legacy row that the calendar deliberately keeps visible may not be deletable through its own card. The existence of such rows in current production data was not checked.

**Smallest acceptance.** Preserve group-level deletion for grouped posts and use the row ID for a no-group singleton, with success shown only after the server confirms the target was deleted. Include one no-group row and one multi-channel group in acceptance.

### F6 — P2 — auth request failures can leave terminal loading or false success states

**Trigger and evidence.** `Login.onSubmit` clears `loading` only after an HTTP refusal; a rejected fetch leaves it true (`apps/frontend/src/components/auth/login.tsx:84-123`). `Forgot.onSubmit` marks the email as sent for any resolved response, without checking `ok`, and a rejected fetch bypasses its `setLoading(false)` (`apps/frontend/src/components/auth/forgot.tsx:26-37`). On federated registration, `Register` calls `load()` from an effect; if the request or JSON parse rejects, `show` remains false and the render stays on `LoadingComponent` (`apps/frontend/src/components/auth/register.tsx:89-125`).

**Effect.** A transient network/server failure can make sign-in, password recovery, or OAuth sign-up look permanently pending; password recovery can also claim completion after an HTTP error.

**Smallest acceptance.** Put loading cleanup in `finally`, render a retryable localized error for transport/protocol failures, and show completion only for the endpoint’s success contract. Check rejected fetches and non-OK responses on all three paths.

## Intentionally retained behavior not counted as defects

- `/plugs` and `/third-party` remain directly addressable while hidden from ordinary navigation, by explicit product contract in `apps/frontend/src/components/layout/hidden-upstream-surfaces.ts:13-16, 23-31`. They are not dead routes.
- `/interface-review` synthetic states and stub panels are deliberately limited to development/test by `apps/frontend/src/proxy.ts:157-166`; production layout also rejects the route. They are not product stubs.
- `MediaLayoutComponent` passes no-op callbacks in standalone mode, but `MediaBox` hides the modal selection footer in that mode (`apps/frontend/src/components/new-layout/layout.media.component.tsx:5-9`; `media.component.tsx:832-851`). There is no visible dead “Add selected media” control on `/media`.
- The calendar’s no-`group` fallback is intentional compatibility for display (`calendar.tsx:235-247`); only the mutation path is inconsistent.
- Agent child routes that return `null` are drawn by the parent agent layout; the content-intelligence review scene’s stub content is synthetic. Neither was counted as reachable unfinished user behavior.

## Limitations

This is a static frontend/source review, not proof of absence. No real session/role matrix was opened in a browser, no live API status was injected, and no runtime or client acceptance was observed. Root should deduplicate these candidates against Beads and reuse any matching current-SHA proof before creating implementation tasks.
