# Provider stream delivery — T2 consumers, T3/T4/T5/T7/T10

Status: delivered in source to root; root acceptance and integrated type verification pending. No commit, push, live provider/account connection, real publication, paid request, deployment or remote addition was performed.

Worktree: `/home/me/.codex/worktrees/postiz-remaining-20261107/content-factory-next`; branch `codex/postiz-remaining-20261107`; private base `37242b6ca6c229b7e9b278e67ef77c553afb79d9`. Target released Postiz v2.25.3 `a5affe62c74e39c1e7ac960d50d8418b807d532c`. Selective adaptation only; no wholesale merge. Existing notices and AGPL licensing were retained.

## Delivered behavior

- T3: VK OAuth/API hosts use `id.vk.ru` / `api.vk.ru`. HTTP200 error envelopes from reserve/upload/save/wall/comment are rejected. Only numeric provider error codes enter failure details. Photos and videos require confirmed identifiers, owner-aware attachments and matching video reservation/upload receipts; video upload uses `video_file`. Missing/malformed receipt cannot produce a completed post with `undefined`.
- T4: Facebook and both Instagram login variants share `META_GRAPH_API_VERSION='v25.0'` in a provider-local constant, including capability lookups and existing insights routes. OAuth route paths and requested permissions stay as before. Instagram collaborator handles are normalized and JSON URL-encoded; carousel children omit collaborators and the parent receives them. Fixtures cover account/route/carousel contracts and preserve unavailable analytics instead of manufacturing zeros. **No separate `video_insights` hunk applied:** neither pinned selected PRs nor released target provider contains it; this fork already uses the existing post/media `/insights` family. Changing that endpoint without media type evidence would invent a new behavior.
- T5: Telegram/VK/Meta/YouTube return static actionable Russian diagnostics for content, permissions, reconnect, explicit rate-limit rejection and unknown outcomes. Provider payloads, SDK URLs, captions, tokens and request objects do not enter these public messages. Unknown outcomes instruct checking the platform before another send. Telegram SDK failures are nonretryable because a media-group send may have partially succeeded. Root owns generic HTTP retry, durable journal and workflow integration.
- T7: Pinterest post analytics reads `summary_metrics`, preserves observed zero and omits absent/null metrics through existing normalization. LinkedIn company listing includes approved Super/Content Admin roles, excludes nonposting roles and deduplicates pages. In-between company OAuth identifier is namespaced as `linkedin-page_<member-id>`, avoiding personal-channel collision. Existing reconnect token handling is unchanged.
- T10: shared media settings reuse the existing editor, add owned JPEG/PNG library selection, preserve explicit timestamp zero, clear competing frame/cover choices and report failed saves without closing. Generated frame JPEGs are saved as owned library media before `/media/information` validates them. The settings panel uses keyboard buttons, respects read-only/uncustomized channel state and merges current attachment data when saving. Provider support is explained; Stories/photo/inbox paths omit unsupported cover parameters. Reels send `cover_url` or `thumb_offset`; image posts carry encoded alt text. TikTok Direct Post uses `post_info.video_cover_timestamp_ms`; photos and inbox omit it. YouTube-specific thumbnails retain precedence; otherwise the media cover is used. Optional cover failure retains the confirmed YouTube video ID/URL and warning receipt.
- T10/T13 integration: `PieceAdaptationEditRequestV1` / DTO / `PieceService.editAdaptation` accept post-local alt, nullable owned-cover media ID and nullable nonnegative frame timestamp. `findMedia` includes type/timestamp while retaining organization/deletion filtering. Foreign/deleted/video-as-cover rows are rejected. Stored zero timestamps survive, empty alt clears, null clears cover/timestamp, and media originals are not mutated.

## T2 provider consumer audit

Root explicitly expanded ownership to all provider media consumers. All direct media `axios`/`fetch(...).blob/arrayBuffer`, arbitrary file path and `statSync` readers were removed from provider files. Sources now go through root `readMediaSource` / `spoolMediaSource`.

- LinkedIn: one owned spool, bounded range buffers (maximum16MiB) following each official `uploadInstructions.firstByte/lastByte/uploadUrl`; require contiguous complete ranges and each etag; preserve ordered etags/uploadToken for finalize; close descriptor and remove spool. Image/GIF transforms and image-to-PDF inputs remain bounded through10MiB `readOrFetch`; PDF generation combines bounded image inputs, not video bytes.
- X: same v2 initialize/append/finalize/status endpoints as installed SDK, one owned spool,1MiB append buffers, bounded polling and cleanup on every outcome. The SDK's Buffer-only video API is bypassed without downgrading API/auth.
- Telegram: SDK accepts guarded source streams; prior resolve/existsSync path shortcut removed; cleanup after complete or failed grouped send.
- VK/YouTube/Pinterest/Dribbble: guarded media streams and finally-close; YouTube image cover limit10MiB. Provider-returned multipart uploads use bounded-time guarded upload requests with no write retry.
- Discord/Reddit/Tumblr/Skool/Whop/Mastodon/MeWe/WordPress: native FormData receives disk-backed `fs.openAsBlob` from owned temporary spools, so video multipart never constructs a full video Buffer/ArrayBuffer. Spools close after awaited upload or failure. RuntimeNode22 supports this API; a narrow namespace type cast handles the repository's older Node declarations without changing dependencies.
- Bluesky: images use bounded `readOrFetch`; videos use an owned spool and file stream with explicit destruction/cleanup.
- TikTok: validation and transfer share one owned spool, MP4 metadata parser uses bounded seeks from that same copy, upload chunks use bounded file streams. SDK/provider upload requests do not retry unknown writes.

Remaining intentional reads are bounded image/GIF transformations and image-only PDF generation. Metadata/account/provider API fetches are separate. The provider-local `mediaUploadFetch` guards DNS/private destinations through the existing dispatcher, rejects redirects, sets a120s deadline, accepts explicit2xx upload statuses and never retries a write.

## Provenance

Fetched official PR metadata/files via `gh api repos/gitroomhq/postiz-app/pulls/<n>` and `/files`; then fetched original changed source with `/contents/<path>?ref=<head-sha>`. Also fetched released provider files by exact target SHA. Raw public upstream snapshots and content SHA256 pins are under `/tmp/postiz-provider-upstream-20261107` (temporary review evidence, contains no account data).

| PR | Pinned head | Merge | Source SHA256 |
| --- | --- | --- | --- |
| [#2131](https://github.com/gitroomhq/postiz-app/pull/2131) | `96bca725519587b145502838ab6d9b3a2fb973c8` | `a722357e5a7df234cd252cc2e2903eab358bb4df` | `0ad7e18bb02b9e4396d12bd36bf45a0e5764862ff838b04f94688470775cd789` |
| [#2242](https://github.com/gitroomhq/postiz-app/pull/2242) | `b757cdf007d22a32416dacb542bfb573040ebcf0` | `8c75711800ff0d13d0a90c9e700bb49f5c42f045` | `b42ee27f234d7ce1dfb522c7ca4e32e93053da9c6d725444a4f995ca94560bb5` |
| [#2264](https://github.com/gitroomhq/postiz-app/pull/2264) | `5a5da1aed41994007b1b3999f5726dbf22b8768c` | `fc29b82590cb6750f17946d1f8b5e273c04b58a2` | `bd6c0f90058e84e7ab657614e885c1a09adfdc6910929ef168fdad3a4198d382` |
| [#1917](https://github.com/gitroomhq/postiz-app/pull/1917) | `67ada32adcf46edb4fee8af7482e05ba16aca03e` | `afac5f8f8fafe7c1de98ff885d64f96c788f4bea` | `7aaa3efa0d62314b2d332ba76032b0899ee30c8a700726a7461691acc709f6fb` |
| [#1969](https://github.com/gitroomhq/postiz-app/pull/1969) | `81af6c9761f2c50e4741438a9e31bda222b32d2c` | `67ada32adcf46edb4fee8af7482e05ba16aca03e` | `f9f92253c0b60d6b4857e22afbc2ee4b2254b9fe1c27bc9b8b1086f2611bc6ab` |
| [#2088](https://github.com/gitroomhq/postiz-app/pull/2088) | `1de1537041943b2663197e54bcaa5e2a6be58916` | `30ba6359a059ecfc0b34f2c3015ab76b9d057812` | `0fef9e3526f19983a12116d4243514251d9bad5402f62f20a67e0a2309152156` |
| [#1851](https://github.com/gitroomhq/postiz-app/pull/1851) | `8f92a37e0c5824c61d1598d889fa7664832ab72b` | `a371160961cdf6d50f99cf4630e2eaba722f385b` | `c74af0b7e0d253db7113de1253b7d2edbc30f8012644dd68784edf0321a0b0a4` |
| [#1767](https://github.com/gitroomhq/postiz-app/pull/1767) | `03bea3def3c339344842e7169e7008d678a1fb4f` | `07ebfc79333cb503c41888d6418973c3ae5db2e1` | `455a779813fb4943606e6fe533fe8cff51278e25951442937caebf464abb96ad` |
| [#1808](https://github.com/gitroomhq/postiz-app/pull/1808) | `671946b56944d884674e5b73d743b61a2aefe320` | `35992feb26b4a0ae022b96acbece819b401164df` | `1dac0de0d39c776c0ea72c2706a79cd295b8c92339d7bd907c96ebbf9c761a22` |
| [#1855](https://github.com/gitroomhq/postiz-app/pull/1855) | `3205ce10e736cf95794993b2dad887d1d1d75108` | `b2220ae1cc670b50a5baf58390dd57e30b2347e0` | `bdfbcdaa66a0dcaaff15d2969bd810364194ba7308031f29ea26dee59f38566c` |
| [#2174](https://github.com/gitroomhq/postiz-app/pull/2174) | `148cc961ca374b92246b4b26412399c1b94a4a59` | `72d6015b1a169581eb45286a08d6566c76ddff96` | `6a0636c29ff0008d9b1738c6aa7e2b38f99a9032bb32ec9aa71b3b533c9aff9b` |
| [#1856](https://github.com/gitroomhq/postiz-app/pull/1856) | `d0ad7058cd80f383da93362985efe207ad73b5d5` | `c2ee7b4ea84badeae1ae1bb2ff298240d7dfad21` | `cb9dc573f021eb73ef5d79281f447dd59aed9fde174f94ee21e3a943c5381648` |
| [#2285](https://github.com/gitroomhq/postiz-app/pull/2285) | `cd2136b3017ae4301899f833f42360dfec87d1df` | `8f4f72f7d6f8a56a68108e264e6b1495e46ff3eb` | `b4b02706e86d41b58992c8210bea6413bef1ea4525423c0bd2c795bf2ca1d839` |

## Official provider documentation checked

- [TikTok Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started): `video_cover_timestamp_ms` belongs to `post_info`; supports `FILE_UPLOAD`.
- [LinkedIn organization roles](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role?view=li-lms-2026-10): Content Administrator role and approved state.
- [LinkedIn Videos API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api?view=li-lms-2026-10): instructed inclusive ranges, individual upload URLs, ordered etags and finalize contract.
- [VK official error schema](https://github.com/VKCOM/vk-api-schema/blob/master/errors.json): codes5,6,7,9,15,29 etc. Selected provider domain change corroborated by exact released upstream source.
- [Telegram Bot API](https://core.telegram.org/bots/api): structured success/error and multipart file API contracts.
- [Pinterest analytics overview](https://developer.pinterest.com/docs/content/analytics/) retrieved; the specific reference page rendered only a login shell, so detailed summary-metric contract relies on pinned original PR#1851 and controlled fixtures.
- Meta Graph25 changelog returned429 and Instagram content-publishing reference was inaccessible through web tooling. Record this as unavailable documentation, not provider acceptance. Version/carousel/cover adaptations are pinned upstream source adoption with local request-contract tests.
- X media quickstart and VK method reference were inaccessible via web tooling. X endpoint contract matches the installed official-API SDK implementation (`twitter-api-v2` v2 client), with focused transfer fixtures. No live provider result is claimed.

## Validation

Node22.23.2 / pnpm10.6.1. Root restored the missing own-worktree bcrypt binding; no install/generate/shared build was run by this worker.

1. `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/postiz-provider-adoption.test.cjs tests/backend-memory.bluesky-lazy.test.cjs tests/backend-memory.linkedin-pdf-lazy.test.cjs tests/telegram.editorial-format.test.cjs tests/telegram.release.url.test.cjs tests/tiktok-publication-settings.test.cjs tests/tiktok-video-inspection.test.cjs tests/tiktok-publication-policy.test.cjs tests/tiktok-settings-current-account.test.cjs tests/youtube-thumbnail-receipt.test.cjs tests/telegram.log.redaction.test.cjs tests/provider.analytics.evidence.test.cjs tests/postiz-media-settings-ui.test.cjs tests/media-box.opening.test.cjs tests/discord.markdown-entities.test.cjs tests/piece-adaptation-workspace.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs --runInBand --silent` —19 suites /334 tests passed before three final additive route/namespace/YouTube-precedence fixtures; only a YouTube callback type annotation and new-file formatting followed that source acceptance.
2. `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/integration.reconnect-tokens.test.cjs tests/postiz-provider-http-safety.test.cjs --runInBand --silent` —2 suites /33 tests passed. Covers accepted reconnect03 and root generic HTTP guard.
3. `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/postiz-provider-adoption.test.cjs tests/youtube-thumbnail-receipt.test.cjs --runInBand --silent` —2 suites /41 tests passed, covering the final additive namespace/route/cover-precedence fixtures. After the callback annotation, YouTube-only12/12 passed.
4. Provider TypeScript transpile/syntax check —0 errors. This is syntax evidence; root owns full affected-app type checks.
5. `git diff --check` —passed at stream handoff.

Existing YouTube07 optional-thumbnail/confirmed-receipt and Telegram10 no-private-content-logging regressions passed. Provider/API request fixtures are synthetic and credential-free. No live OAuth, account permissions, external publication, CDN reachability, production startup or deployment was verified. No full repository suite or build was requested or run by this worker. Root owns integrated runtime/UI acceptance.

## Delivery and cleanup

All implementation remains in the assigned worktree and write zones expanded explicitly by root. Other owners' edits were preserved. No worker runtime/server/background job was created. Temporary public upstream snapshots are task-owned and may be removed after root acceptance; no customer file, account identifier, source media original, shared cache or foreign runtime was removed. Root records final acceptance in this artifact after integration.

## Additional root-assigned T13 disk-storage boundary

Root assigned this bounded follow-up after the provider consumer audit. Added `upload/disk.upload.v1.ts`, optional `IUploadProvider.uploadFileFromDiskV1`, and exactly the new methods in `LocalStorage` / `CloudflareStorage`. Existing root edits in both storage files were preserved.

Contract: server-owned `{path,size,originalname,mimetype?}` receipt only, returning `{filename?,originalname,path,mimetype}`. The temporary source remains caller-owned and must be removed by the caller's finally block. The helper pins a regular non-symlink single-link source descriptor, verifies exact declared size, sniffs at most4100bytes, ignores claimed MIME/name, and enforces the existing image10MiB / MP4 video1GiB ceilings. Transfers use64KiB streams and reject truncated/mutated files. Independent streams open through `/proc/self/fd/<pinned-fd>` so stream destruction does not close the validation descriptor; close waits for pending stream opens before releasing that descriptor. No new dependency, schema or provider call was introduced.

Local storage creates random dated output through pinned destination directories, copies to a private staging inode, syncs, and links a complete file without overwriting an existing object. R2 receives a Readable body with exact ContentLength and sniffed ContentType. Returned results have no `buffer` property. Caller cleanup ownership is unchanged.

`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/disk-upload-v1.test.cjs tests/media.upload-limit.test.cjs tests/local-storage-reel-upload.test.cjs tests/cloudflare.storage.delete.test.cjs --runInBand --silent` —4 suites /57 tests passed. New6 tests include real32MiB local streaming copy,16MiB+7 R2 stream/chunk interface with mocked SDK, MIME/size refusal, source symlink/invalid content/size mismatch, mutation during transfer, destination symlink refusal and preserved caller source. No full-file Buffer allocation is allowed by the local test interface.

Post-format provider/UI/style recheck: `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest tests/postiz-provider-adoption.test.cjs tests/postiz-media-settings-ui.test.cjs tests/design.guard.test.cjs --runInBand --silent` —3 suites /64 tests passed. Full affected-app type verification remains root-owned.

## File ownership delivered

- Providers: `facebook`, `instagram`, `instagram.standalone`, `vk`, `telegram`, `youtube`, `tiktok`, `linkedin`, `linkedin.page`, `pinterest`, `x`, `bluesky`, `discord`, `dribbble`, `reddit`, `tumblr`, `skool`, `whop`, `mastodon`, `mewe`, `wordpress` provider files; related `tiktok-video-inspection.ts`.
- New provider helpers: `meta.constants.ts`, `provider-error-diagnostic.ts`, `media-upload-chunks.ts`, `media-upload-sources.ts`.
- Frontend: media settings editor, media library static-image filter, new `new-launch/media.settings.section.tsx`, manage modal/provider-settings integration, YouTube-specific override note; English/Russian keys and component inventory row.
- Post-local media contract: exact adaptation image DTO/type, `PieceService.editAdaptation`, and `PieceRepository.findMedia` select/type.
- New disk boundary: `upload/disk.upload.v1.ts`, `upload.interface.ts` and new storage methods only.
- Focused tests: `postiz-provider-adoption`, `postiz-media-settings-ui`, `disk-upload-v1`; existing reader fixtures and Piece/YouTube/TikTok/Telegram/Bluesky tests adjusted for the shared safe readers while retaining behavioral assertions.
