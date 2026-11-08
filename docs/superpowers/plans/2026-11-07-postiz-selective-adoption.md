# Remaining Selected Postiz Improvements — Implementation Plan

Goal: adopt thirteen selected released recommendations on `codex/postiz-remaining-20261107`, based on private origin/main `37242b6ca6c229b7e9b278e67ef77c553afb79d9`. Upstream target: v2.25.3 `a5affe62c74e39c1e7ac960d50d8418b807d532c`. No wholesale merge or upstream remote. Preserve accepted 03/07/10 and AGPL notices.

## Accepted decisions and boundaries

- Guest links show the current preview, expire after seven days by default, and can be revoked/reissued. Guests can read, comment and reply; only the team resolves/reopens and manages access. No publication approval follows from discussion state.
- All legacy preview/comment routes require a workspace member or a valid scoped grant. Old anonymous links require sign-in. Authenticate attachment requests too; redact credentials/internal metadata. Store random token hashes, never bearer tokens in logs or Git.
- Preserve existing Comments and its required userId. Add versioned discussion/grant storage, retain quote and text revision, and show legacy comments unanchored. Changed quotes are explicit, never silently attached elsewhere.
- Add optional Integration.displayName independent from provider name, and integrationIds filtering compatible with integrationId. Reconnect retains aliases.
- Prisma changes are additive and preserve all prior rows and Mastra tables. Never db push on deployed databases. Rollback retains new discussion/grant rows; do not erase data to fit an older binary.
- Preserve existing Temporal contracts; use a new version after V109 for new starts. Confirmed receipts survive; unknown send outcome never enables resend.
- Local implementation/preview only. No paid calls, account connections, publishing, push/PR/deployment. Do not alter existing ekqe/zlq6/kcxz.46 criteria.

## Scope and Beads mapping

Epic: `content-factory-next-npyu`. Beads/Linear own status; this is the immutable outcome mapping, not a parallel task ledger.

| Task | Beads | Report rows | Outcome and acceptance |
| --- | --- | --- | --- |
| T1 P0 | `content-factory-next-npyu.1` | 01 | Confine local reads/deletes to configured storage; reject traversal, symlink escapes, foreign/deleted Media and invalid save-media object names. Preserve normal uploads. Acceptance: Real filesystem tests cover traversal, symlinks, ownership, deletion and valid media. |
| T2 P0 | `content-factory-next-npyu.2` | 02,09 | Use one safe media reader with DNS/redirect guards, byte limits, deadlines and cancellation. Stream large LinkedIn/X transfers; buffer only bounded image transforms. Acceptance: Stalled body, redirect/private addresses, abort, truncated/large stream tests pass without buffering the entire video. |
| T3 P1 | `content-factory-next-npyu.3` | 04 | Adopt selected VK domain and response corrections for photos, videos and wall.post. Never report success without a confirmed provider identifier. Acceptance: Controlled photo/video/wall.post success and failure responses give truthful receipts. |
| T4 P1 | `content-factory-next-npyu.4` | 05,13-Meta | Use shared Graph API v25.0 constant; verify affected official methods. Adapt carousel collaborator and video_insights corrections without changing auth routes or permissions. Acceptance: Request-contract and error tests cover Facebook/Instagram routes, carousels and analytics; unsupported observations remain unavailable. |
| T5 P1 | `content-factory-next-npyu.5` | 06 | Classify Telegram/VK/Meta/YouTube content, permissions, reconnect, safe retry and unknown outcome consistently across calendar/API/agent results. Keep sensitive raw responses out. Acceptance: Representative failures have actionable localized diagnostics; unknown outcome never enables resend; redaction regressions pass. |
| T6 P1 | `content-factory-next-npyu.6` | 08 | Add a new post workflow/activity after V109, with heartbeat stage diagnostics. Route new starts to it while preserving all existing workflow/activity contracts and durable publication semantics. Acceptance: Controlled worker loss before send, after send and after receipt causes no duplicate; old contracts and running jobs remain compatible. |
| T7 P2 | `content-factory-next-npyu.7` | 13 | Use Pinterest summary_metrics and selected LinkedIn company/content-admin access corrections. Keep source provenance and distinguish unavailable from zero; Meta portion belongs to T4. Acceptance: Fixture responses verify supported metrics, missing data and personal/company identity isolation. |
| T8 P1 | `content-factory-next-npyu.8` | 11-team | Add text anchors, replies, resolve/reopen to existing preview; retain quote and source revision, mark changed anchors explicitly. Keep legacy Comments/userId and display old comments unanchored. Acceptance: Real service/database and UI tests cover thread/reply/resolve, changed text, legacy comments and two-tenant isolation. |
| T9 P1 | `content-factory-next-npyu.9` | 11-guest | Issue hashed 7-day scoped guest grants for one current preview and attachments; guests comment/reply only. Require member auth or valid grant on legacy preview/comment routes. Support revoke/reissue and label guest identity unverified. Acceptance: Expired/revoked/foreign grants and anonymous legacy URLs are refused; current text and anchored discussion work; no editing, resolving or publication authority leaks. |
| T10 P2 | `content-factory-next-npyu.10` | 12 | Reuse existing media fields and select owned library covers or timestamps. Carry supported settings through providers; optional cover failure preserves confirmed publication receipt. Acceptance: Provider payloads and UI ownership/unsupported settings checks pass; existing YouTube thumbnail receipt regression remains green. |
| T11 P2 | `content-factory-next-npyu.11` | 14 | Add integrationIds server filtering and multiselect with pagination; retain project/editorial/date/state filters and old integrationId compatibility. Acceptance: Multi/single/empty selections, pagination and filter combinations work with accessible controls. |
| T12 P2 | `content-factory-next-npyu.12` | 15 | Persist optional displayName independently from provider name; use one label helper, reset alias and preserve it on reconnect. Reuse existing group menu; no platform rename requests. Acceptance: Alias fallback/reset/reconnect, organization scoping and existing group rename behavior pass. |
| T13 P2 | `content-factory-next-npyu.13` | 16 | Extend shared capabilities with upload widget/ticket/status, owned media metadata and previewUrl. Binary goes through uploader, never model arguments. Preserve OAuth/policies/confirmations and manual fallback. Acceptance: Controlled SDK/widget flow covers upload/status/attach/preview, foreign/deleted ids, authorization and clients without widget support. |

## Dependencies and execution

T1/T2 first. T5 depends on T3/T4; T6 on T2/T5; T9 on T1/T2/T8; T10 on T2/T4; T13 on T2/T10. Remaining work is ordered by the agreed plan, using isolated owners only where parallel latency/context benefits outweigh coordination. Shared schema, media contracts, integration and acceptance stay root-owned.

Use existing components and cf tokens; read inventory/authoring rules before UI changes and add inventory rows for new components. Preserve keyboard/mobile/both-theme behavior and normal local auto-login using the configured existing test profile.

## Verification and evidence

Each outcome receives affected meaningful checks; root owns one integrated set on the final candidate. Verify filesystem/DNS/redirect/body limits and streaming, two-tenant ownership, old/new schema compatibility, publication recovery/receipt semantics, guest lifetime/revocation/legacy links, changed anchors, calendar/aliases/covers and controlled MCP SDK/widget behavior. Run types for affected apps and git diff --check. A complete release suite belongs to a separately authorized release.

Update the historical HTML with a separate adoption snapshot, truthful local/provider/deployment distinctions and current commits/check receipts. Keep private fixture/runtime/source evidence outside Git when it contains user material. Reuse immutable matching passes; do not repin historical receipts.

## Premortem and recovery

- Media resolver changes can break trusted own-upload URLs: cover local and configured object-storage round trips before converting consumers. Keep explicitly bounded buffers only for image transforms.
- Stream interruption after a remote submit can cause duplicate publishing: classify unknown separately and preserve the durable ledger/no-resend invariant.
- Guest preview paths can bypass revocation through legacy routes/cache/media: check grants on every boundary and use private/no-store guest responses, including attachment delivery.
- Anchor drift can misattribute feedback: store quote and revision, mark stale without silently relocating.
- Schema changes can invalidate older apps: preserve legacy tables and records, add new versioned tables and nullable alias; retain newer data on rollback.
- Executor mistakes can copy incompatible upstream workflows or weaken tests: pin original patches and compare behavior, preserve frozen contracts and actual meaningful tests.

Recover by reverting the specific compatible code change or forward-fixing while retaining new database rows, shared runtimes, original media and accepted receipts. No production mutation is part of this stage.

## Owner-authorized source delivery addendum — 7 November 2026

The owner subsequently requested full local verification and ordinary source
integration into private main. The reference to a pre-stage branch was withdrawn
as another project's instruction. Source push/PR/merge is authorized through
[PR1283](https://github.com/maslennikov-ig/content-factory-next/pull/1283).
The original no-push/PR phase boundary above is historical. Production deployment,
real accounts, paid calls and publishing remain excluded. Exact full-attempt and
focused-recovery results are in the stage summary; a clean complete release gate
is still required before a separately authorized image publication.
