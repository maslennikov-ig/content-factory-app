# Content Factory video: subscription, API and manual access

Local implementation of [subscription plan revision 1](../superpowers/plans/2026-10-23-video-subscription-access.md)
and [A1–A10](../superpowers/specs/2026-10-23-video-subscription-access.md#8-acceptance-examples-and-ownership),
additive to [API plan revision 3](../superpowers/plans/2026-10-22-video-generation.md).
Current results and source identity live in
[root evidence](../../.codex/stages/content-factory-next-zlq6-subscriptions-20261023/implementation.md).
Actual provider access, billing and output acceptance remain in task `.7`.
Subsequent [independent review and corrections](../../.codex/stages/content-factory-next-zlq6-subscriptions-20261023/review.md)
supersede the original acceptance for credential fencing and receipt recovery.
[Post-review browser and Temporal reacceptance](../../.codex/stages/content-factory-next-zlq6-subscriptions-20261023/reacceptance.md)
confirms those fixes through the local product and actual workers.

## Product and consumers

Media, piece actions and chat open the same saved draft/result. A first visit
requires a choice: personal subscription, existing API payer, or manual upload.
Changing access preserves edited text and invalidates approval; selection makes
no generation call. Existing V1 jobs and pending API launch intents remain readable.

`VideoAccessService` owns V2 approvals, route intents, permissions and result
doors. `VideoConnectionsController` and `VideoAccessController` are registered
before the existing Media controller. Native `video.*_v2` capabilities call the
same facade. Launch requires an original authored message and native approval
of the saved snapshot; chat cannot log in or supply arbitrary remote tool calls.
Existing V1 capabilities and inbound Content Factory MCP remain available.

Subscription settings belong to the authenticated person. Each workspace grant
is explicit and launch enablement is admin-only. A colleague cannot spend the
owner's credits. Limits are positive provider-specific Decimal amounts, shared
by the wallet across all grants; they are admission controls, not a provider
billing cap. Unresolved reservations survive reconnect, disconnection and month
rollover. Unknown actual expense is never shown as zero or converted into USD.
An owner's explicit reconciliation records evidence and its own certainty label.

Manual mode offers explicit copy/export and a fixed provider website link with
no draft data in its URL. The existing uploader/Media picker registers the MP4.
Attachment validates owned actual bounded MP4 bytes and current draft/source
revision; repeated attachment resolves to one result. Uploaded provenance and
unknown external cost remain visible. Upload does not assert model or language
quality and makes no quote or generation call.

## Authentication and execution

OAuth uses the native MCP SDK, PKCE/S256, one-use expiring state, exact redirect,
issuer/resource and original authenticated session. Impersonation cannot grant
personal access, including the middleware's early impersonation branch. The
browser callback uses `NEXT_PUBLIC_BACKEND_URL`, retaining its public path;
`BACKEND_INTERNAL_URL` is not an OAuth return address. Each new MCP HTTP request
rechecks membership, workspace grant, generation and token version, so a chain
cannot keep using a cached bearer after disconnect/removal. A request already
sent at the moment of revocation may still finish.
Issuer registration is encrypted and serialized; provider
wallet identity must come from an authenticated issuer-bound identity response.
Refresh uses database leases and generation/token-version checks. Disconnect
invalidates all workspace grants and credentials before best-effort revocation.
Deleting the user clears pending verifiers/tokens/grants and preserves job/media
audit records. Callback redirects remove codes/state and carry no-referrer/no-store.
The nginx access-log map also strips callback query arguments; deploying this
configuration and checking upstream log handling remain separate rollout work.

Subscriptions use separate Prisma jobs, reservations and versioned
`videoSubscriptionWorkflowV1` / activities. Workflow payloads contain local IDs
only. Database leases, a persisted submit marker and activity `maximumAttempts: 1`
bound mutating calls to one; ambiguous delivery becomes `submission_unknown`.
It never auto-submits again or silently changes access, payer or engine.
Persisted dispatch recovery closes the admission-before-workflow gap. Status is
bounded to 24 hours; receipt-only resume can follow reauthentication. Saving
and explicit status recovery get a fresh persisted 24-hour deadline; status
recovery resets the read-only polling budget. The original creation time,
provider receipt and submit count remain unchanged. A delayed expiry from an
older workflow cannot terminate the new window. Retry-save may adopt the new
generation only for the same owner/wallet and still allows an accessible
captured file to be saved without credentials. Saving
first uses the captured result URL, and may refresh that same receipt's URL;
retry-save never regenerates. Completion requires atomically attaching one
owned Media under the current lease. Existing API Temporal contracts are unchanged.

## Provider compatibility boundary

The production registry keeps both subscription providers disabled with no
reviewed schema digest or wallet-identity endpoint. Loopback fixture classes
inject synthetic profiles directly; there is no deployable test-mode switch.
Discovery checks an exact tool-name/input-schema digest and an allowlist before
any operation. Credentialed HTTP has public-HTTPS, origin, redirect, DNS, size
and time bounds outside loopback fixtures. SDK errors cannot expose remote
payloads or tokens as product errors.

Higgsfield implements a non-generating cost operation, explicit supported
Wan/Kling mapping, immutable generate arguments and receipt-bound wait/import.
Unsupported variants/options fail closed. The explicitly synthetic generic
Kling profile does not claim live Standard/Pro compatibility. Web Unlimited is
never assumed to apply. Image references must be owned and provider-reachable.

HeyGen implements eligible avatar/voice reads, a separate quote, exact-script
`create_video`, explicit engine and receipt-bound status/import. Numbers,
negations and chosen locale are preserved. Account eligibility is a bounded
trial; no regular-use entitlement or numeric trial quota is invented. Missing
quote, unsupported schema and `api_key_required` block launch. Video Agent and
implicit Avatar IV substitution are forbidden. See fixture provenance under
`tests/fixtures/video-subscription/` for every invented schema field.

## Reproduce local acceptance

Use Node 22.23.2 and pnpm 10.6.1. Create only task-owned loopback PostgreSQL and
Temporal instances as described in [the original local runbook](video-v1-local-acceptance.md).
Set `CF_VIDEO_DATABASE_DISPOSABLE=1` and `CF_VIDEO_DATABASE_URL` to that isolated
`/cf_video_v1_test` database. Do not reuse live environment files or a shared queue.
Apply/generate Prisma only against that disposable database. The additive SQL references are
[connections](video-subscription-connections-schema-apply.sql) and
[execution](video-subscription-execution-schema-apply.sql); the SQL guard must
accept only their nine newly introduced tables. The follow-up
[recovery deadline](video-subscription-recovery-deadline-schema-apply.sql) adds
one nullable column to `VideoSubscriptionJob`; its guard allows that table only.
These files are references for selecting the actual live diff through the
single guarded apply procedure, not an automatic migration history.
Production application is separately gated.

The focused commands are in the plan's root acceptance section. The new Node
contract files are registered in `package.json` and excluded from Jest. Reuse
passing affected API checks when inputs match; full repository build/suite is
a future release gate.

For an actual browser run, start
`pnpm exec node scripts/development/video-subscription-local-fixture.cjs` with
`CF_VIDEO_FIXTURE_INFO` pointing to a private temporary JSON file. It starts
actual Nest controllers/policies, Prisma, storage and loopback OAuth/MCP. Only
sessions, text and providers are synthetic. The default ports are 43321/43320.
Start Next from `apps/frontend`, using the returned upload directory,
`STORAGE_PROVIDER=local`, `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY=/uploads`,
frontend/main URL on 43320 and both backend URLs on 43321; use an explicitly
synthetic `JWT_SECRET` and `NOT_SECURED=true`. Run
`pnpm exec next dev --webpack --hostname 127.0.0.1 --port 43320` there.
Starting it from the repository root changes Tailwind configuration resolution.

Run `scripts/development/video-subscription-browser-acceptance.cjs` from the
worktree root. It uses installed Chrome, blocks public egress, follows local
OAuth by clicking the UI, checks both subscriptions and retained API, exact
saved edits/approval, one submit, reload, actual playback and download hash.
It also uses the real uploader for manual attachment, verifies copy/export,
intercepts the provider website navigation, checks reader/foreign denial and
1440/1024/768/390 widths. Provider navigation is never sent to the public host.
The manual result is reopened after the workspace's URL-driven remount before
playback; approval-save checks use HTTP persistence rather than transient notices.

Run `scripts/development/video-subscription-temporal-acceptance.cjs` against a
dedicated loopback Temporal dev server via `CF_VIDEO_TEMPORAL_ADDRESS` and
`CF_VIDEO_TEMPORAL_DISPOSABLE=1`. It
bundles the actual workflow/activity, persists both receipts, restarts the
worker/service and imports those same results without another submit. A third
lost-submit case remains uncertain with one attempt. Provider counters, opaque
payload checks and Prisma result IDs are written to the stage receipt.
The runner also exhausts the persisted 24-hour deadline/poll budget, explicitly
resumes the same receipts and verifies a fresh recovery window with no submit.
It disconnects/reconnects the same wallet after a save failure and checks
retry-save with an expired captured URL through a fresh worker/service.

Run `scripts/development/video-v1-temporal-acceptance.cjs` separately for both
retained API modes and busy-lease expiry/continue-as-new. These runners use the
same `main` queue: run them sequentially on the dedicated dev server, never
concurrently with each other or a shared application worker. The browser fixture
drives domain steps on a local timer; only these separate runners prove Temporal
transport/restart. `CF_VIDEO_BROWSER_EVIDENCE` sets the browser evidence directory;
`CF_VIDEO_TEMPORAL_EVIDENCE` sets each runner's distinct receipt filename.

Stop only the processes/containers whose exact IDs were recorded when created;
helpers delete only their own synthetic rows, servers and temporary uploads.
Preserve this worktree, test fixture provenance and evidence. No global prune.

## Real-provider and release gates

Task `.7` and the epic stay open. Separately authorize registration/OAuth and
read-only schema, wallet identity, eligibility, settings and quote inspection.
Then separately approve an exact account/tool/settings/attempt cap and credit
ceiling for actual samples. Observe every accepted/failed/uncertain attempt,
real charges, returned media, selected language, facts/negations and independent
quality assessment. Fixture audio and account counters prove none of these.
Provider schema pins and production enablement require that evidence and review.
Push, merge, deployment, live migration/configuration and release acceptance are
separate actions; existing API pilot funding does not authorize subscriptions.
