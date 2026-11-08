# Preview review V1 — T8 / T9

Owner: preview_review child stream. Tasks: `content-factory-next-npyu.8` and `.9`.

## Provenance and design decisions

Behavioral reference: upstream Postiz PR [2079](https://github.com/gitroomhq/postiz-app/pull/2079), head `32ca6ff5b77172a6700b1d48d75e4787ed44cb00`, merge `33e126a9e2d467d4999c5f08850275c7a799b4df`, merged 2026-09-24. GitHub API verified the exact commits and `AGPL-3.0` license. The original patch was inspected through `gh api` and retained in the private task evidence directory. This is a local versioned implementation of anchored discussion, replies and resolve/reopen. It does not copy upstream's anonymous public comment door, nullable legacy `Comments.userId`, captcha/provider integration, or destructive anchor detachment. Product attribution and AGPL notices remain intact.

Approved plan: `docs/superpowers/plans/2026-11-07-postiz-selective-adoption.md`. Read PRODUCT, DESIGN, component inventory/authoring rules and Supabase Postgres best practices before schema changes. The existing design system, typography, cf tokens and shared Input/Textarea/Button/Status/SectionLabel/Dialog/ConfirmButton are reused. New text is centralized in a RU/EN copy module.

## Delivered behavior

- A discussion retains its exact quote, UTF-16 text offsets and SHA-256 text revision. Different current text explicitly marks the saved quote stale, even if its original substring remains unchanged. Stale anchors are never searched for, relocated or silently reassigned. Current anchors are highlighted; pointer, touch and keyboard text selection use the exact server text representation.
- Team members can start discussions, reply and resolve/reopen. Guests can read the current preview, comment and reply. Every guest name is marked unverified. Discussion state never changes publication approval, editorial stage, post delivery state or Temporal workflows.
- Legacy `Comments` and its required `userId` remain unchanged and are displayed as earlier unanchored comments.
- Team members can create seven-day review grants, list safe grant metadata, revoke and replace a selected grant. Reissue revokes the selected old grant in the same transaction. Only SHA-256 hashes of cryptographically random 256-bit bearers are stored. Bearers are returned once on creation and kept in the client URL fragment and request headers, never API query strings or persistent frontend storage.
- Every old/new preview/comment read and every review attachment request requires live team membership or a valid grant scoped to its organization and preview post. Team sessions re-resolve active, unblocked membership; guest tokens are validated for expiry/revocation and live post status on every request. Writes revalidate their actor inside the database transaction. Explicit grants retain guest privileges beside an existing team session.
- Mutations require JSON, a dedicated request header and a configured application origin. Route-specific shared throttling bounds review reads and writes; DTOs and services bound comment, name and quote lengths. Responses use private/no-store. Existing error collection rebuilds events from a strict allowlist and drops request headers, cookies, URLs, messages and extras; the new diagnostic regression proves the review bearer is absent.
- Guest media exchanges the fragment bearer through a same-origin POST for a host-only HttpOnly, SameSite=Lax cookie, restricted to that post's media API path. Its lifetime is at most 30 minutes and never exceeds the grant. Production cookies are Secure. Each native image/video/thumbnail request verifies the live grant and current owned media reference before calling `MediaService.openOwnedMediaV1`; the source is closed on completion/disconnect. Storage paths are absent from review JSON and markup. Native video forwards a single byte Range through the owned-media service and shared reader, returning partial-response metadata without a whole-file Blob.
- `/p/:id` is a client loader with no post data in server metadata, noindex/no-referrer, explicit restricted/loading/error/empty states, and scoped SWR data. Existing anonymous links now request sign-in or a new grant. Split-host frontend preflights allow only the existing configured origins and the two new review headers.

## Data compatibility and storage boundary

New additive models: `PreviewReviewGrantV1`, `PreviewReviewThreadV1`, `PreviewReviewCommentV1`. Organization/post/thread/grant composite foreign keys enforce scope; all foreign-key lookup columns are indexed. Only inverse relations were added to Organization/User/Post. Root's nullable `Integration.displayName` is preserved and uses the shared display-name helper.

`docs/operations/preview-review-v1-schema-apply.sql` contains the actual Prisma old-schema-to-current diff, including the nullable alias column: 23 additive statements. Existing Comments rows, userId requirements and unrelated schema objects are untouched. The guarded schema procedure remains authoritative. No deployed database was changed and no `prisma db push` was used.

The existing public asset proxy, static upload URLs and public object storage required for provider fetching remain separate public storage surfaces. This change secures every review API/media door and removes storage URLs from review responses; it does not make previously public assets private or revoke bytes a recipient already received. Root owns the shared media resolver and public proxy hardening. A bounded review correction added Range forwarding to the review and MCP private preview routes, including HTTP 206, Content-Range, Accept-Ranges, segment Content-Length and invalid-range HTTP 416. Local/remote exact-byte behavior belongs to the existing shared-reader tests; no additional whole browser pass was required for unchanged UI.

## Files

- `libraries/nestjs-libraries/src/preview-review/v1/preview-review.dto.ts`
- `libraries/nestjs-libraries/src/preview-review/v1/preview-review.repository.ts`
- `libraries/nestjs-libraries/src/preview-review/v1/preview-review.service.ts`
- `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (new review models/relations only; alias belongs to root)
- `docs/operations/preview-review-v1-schema-apply.sql`
- `apps/backend/src/api/routes/preview-review.v1.controller.ts`
- `apps/backend/src/api/routes/preview-review.v1.guard.ts`
- `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` (bounded Range option/forwarding in `openOwnedMediaV1` only)
- `apps/backend/src/api/routes/mcp-media.controller.ts` (private preview method only; MCP owner forwarded the matching service options)
- `apps/backend/src/api/routes/public.controller.ts` (preview/comment methods only; root owns stream transfer)
- `apps/backend/src/api/routes/posts.controller.ts` (bounded/throttled legacy comment write)
- `apps/backend/src/api/api.module.ts`, `apps/backend/src/cors.options.ts`
- `apps/frontend/src/app/(app)/(preview)/p/[id]/{page,layout}.tsx`
- `apps/frontend/src/components/preview/{comments.components,copy.client,post.preview,preview.wrapper}.tsx`
- `apps/frontend/src/components/preview/{post.review.content,preview.review.context,preview.review.page,secure.preview.media}.tsx`
- `apps/frontend/src/components/preview/review.copy.ts`
- `docs/design/component-inventory.md` (preview rows only)
- `tests/preview-review-v1{,.ui,.http,.postgres}.test.cjs`
- `tests/backend.cors.test.cjs`, `tests/design-typography-allowlist.json` (exact removed preview debt only)

## Verification

Node 22.23.2 / pnpm 10.6.1. Focused commands use `pnpm exec jest --runInBand --no-coverage`.

- `tests/preview-review-v1.test.cjs tests/preview-review-v1.ui.test.cjs`: **17/17 passed**, including exact revision/quote validation, stale anchors, grant-only privilege, expiry/revocation/foreign scope, blocked membership, bounded content, guest identity, retained failed input, replies, resolve/reopen, keyboard selection and diagnostic stripping.
- `tests/preview-review-v1.http.test.cjs tests/preview-review-v1.test.cjs tests/backend.cors.test.cjs tests/design.guard.test.cjs`: **55/55 passed** before the final diagnostic test was added; the unchanged media/cookie/preflight/style cases remain matching evidence. The added diagnostic case passed in the subsequent 17-test run.
- `tests/posts.save-refusal.test.cjs tests/post.context-review.test.cjs tests/draft-empty-schedule.test.cjs tests/backend.cors.test.cjs`: **84/84 passed**. The review rate guard lives separately so ordinary post routes do not import the full review/media implementation.
- `tests/preview-review-v1.ui.test.cjs tests/design.typography.test.cjs tests/post-comments-tenant.guard.test.cjs`: **18/18 passed** before the passive inline-highlight extension; service/UI tests were subsequently rerun. The old jjvz regression remains present and passed; root added a real loader mapping for the concurrently introduced integration-filter parser.
- Real Prisma/PostgreSQL: root ran `tests/preview-review-v1.postgres.test.cjs` on a separate acceptance schema initialized from the old schema plus the actual additive SQL: **3/3 passed**. This exercised real tables, nested creates, cross-tenant composite foreign keys, current previews, blocked actors, legacy rows and revoke/reissue. The test requires an explicitly marked loopback disposable database and a non-public schema, and cleans only its exact synthetic organizations/users.
- `node scripts/operations/validate-prisma-migration-sql.cjs --mode update --allow-table Integration --allow-table PreviewReviewGrantV1 --allow-table PreviewReviewThreadV1 --allow-table PreviewReviewCommentV1 --diff <private actual Prisma diff> --selected docs/operations/preview-review-v1-schema-apply.sql`: **passed, 23 explicitly selected statements**.
- `git diff --check`: **passed** at child checkpoint.
- Final bounded Range correction: `tests/preview-review-v1.http.test.cjs tests/postiz-media-source.test.cjs tests/mcp.media-upload.test.cjs`: **3 suites / 30 tests passed**. This covers both private route Range forwarding, HTTP 206 and segment headers, HTTP 416, the owned-media service boundary, existing real local/remote exact-byte ranges, and the real MCP SDK regression. Root owns any additional shared-reader error-mapping change and its affected rerun.

Real browser acceptance passed on the sole task-owned candidate at port 4497. Fresh `/auth` reached `/agents` automatically using the explicitly selected local profile, then `/p/:id` showed the current preview. Real browser selection created a team thread and reply; a real ORM edit to only the named synthetic fixture produced an explicit stale quote; resolve/reopen worked. The original fixture text was restored after the stale screenshots. The same unchanged team evidence was reused during the guest continuation.

An anonymous browser created an anchored guest comment and reply, displayed unverified identity and had no team management actions. The real scoped HttpOnly cookie delivered the actual preview attachment with HTTP 200 and no-store. Anonymous legacy preview/comment URLs returned 403; a valid guest could read those doors but could not resolve a discussion. UI reissue invalidated the old bearer (403), and the replacement link loaded successfully. UI revocation then refused both preview and native media (403). Every generated test grant was revoked.

The guest preview passed 1440 px and 390 px in both dark and light themes, with no horizontal overflow; screenshots were inspected. Browser result: zero page errors and zero bearer query-string requests. All browser evidence remains private: `review-browser.json`, `review-desktop-dark-stale.png`, `review-guest-{dark,light}-{1440,390}.png` in the task evidence directory. No screenshot exposes a bearer input. Early stand startup and browser-wait failures were corrected before these assertions; they are not claimed as passes.

Root owns the integrated type/check acceptance; its final result is separate from these passing child checks. No release suite, deployed/runtime production identity or provider publishing acceptance is claimed here.

No production deployment, publishing, paid model/provider call, real account connection, client message, Git push or commit was performed by this stream.
