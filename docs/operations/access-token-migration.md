# Access-token compatibility and delivery

Implemented locally in `content-factory-next-dbxe.1–.5` on 9 October 2026.
This document does not authorize a production release or credential rotation.
The schema, JWT signing secret and existing Temporal contracts are unchanged.

## Sessions and password recovery

New sessions carry `purpose: session`. Existing signed full-user sessions remain
valid when they contain an active user's legacy shape (`id`, `email`,
`providerName`, `activated: true`, no reset `expires`); middleware still resolves
activation and tenant membership from the database on every request. Standard
JWT expiry, when present, remains enforced. Session lifetime remains unchanged.
Changing a password does not revoke supported existing sessions automatically.

New password-reset links carry `purpose: password_reset`, standard `exp` with
the existing 20-minute lifetime, and an HMAC bound to the current password hash.
The successful write atomically compares the old password hash, so concurrent
requests cannot both consume the link. A password change or unlink invalidates
older links. Reset and activation tokens never authenticate a session.

Existing reset links with only `id` and custom `expires` are refused, including
ones still within their old lifetime: they cannot safely provide single-use
semantics. Request a new letter through the existing forgot-password form.
No account or password data is migrated or removed.

New activation links carry `purpose: activation` and expire after one day;
the existing resend-activation flow can renew them. Legacy inactive full-user
activation links remain usable under their old contract until activation, but
cannot become sessions after activation. Activation rechecks the same account
and refuses an already activated or explicitly blocked account. Approval-mode
administrative activation remains separate.

## Organization credentials and legacy OAuth

The organization switcher returns explicit non-credential fields; `apiKey` and
`paymentId` are omitted for every role. Internal organization rows remain intact.
Administrators keep the explicit key surface in `/user/self` and key rotation.
The source projection fix itself retains existing key values and public API
behavior. The separately authorized 11 October rotation below revokes the old
values without changing the supported API contract.

Legacy `pos_` grants are supported with their existing token format. Each request
reads the grant owner's current membership in the exact organization. Removed,
disabled or inactive users are refused; a USER can read but cannot mutate.
The route policies preserve content operations for EDITOR and channel management
for ADMIN/SUPERADMIN. Organization-key clients retain ADMIN. MCP continues to use
its independent OAuth authorization and token format.

The old list could expose an active organization key to members. Historical
exposure or misuse is UNKNOWN; this code fix does not invalidate a key already
obtained. Before an authorized production release, inventory affected workspace
members and legitimate API consumers without disclosing their keys, then decide
whether coordinated rotation is required. Never rotate live credentials blindly;
replacement and dependent-client updates need their own explicit owner authority.

On 11 October 2026 the owner confirmed there are no external API-key consumers
and authorized replacement. Root privately inventoried all seven keyed
workspaces (two currently had active non-admin members), then replaced all
seven keys in one serializable, exact-old-value guarded transaction. Real
read-only API requests confirmed all seven old keys return 401 `Invalid API key`
and all seven replacement keys retain successful access. New values remain
available only through the existing authorized administrator surface. No keys,
live account identifiers, customer/provider writes or global signing-secret
changes are part of the tracked evidence. Historical exposure/misuse remains
UNKNOWN; revocation does not reconstruct it. Evidence:
`.codex/stages/content-factory-next-dbxe-completion-stage/key-rotation-apply.actual.json`.

## Browser requests and provider refresh

Cookie-authenticated mutations must present an exact Origin matching the origin
of configured `FRONTEND_URL` or `MAIN_URL`. Missing, `null` and foreign origins
are refused before authenticated effects. JSON and multipart are supported.
Explicit `auth`-header clients remain supported without Origin; callers using
cookies alone for server writes must supply the application's trusted Origin.
Unauthenticated OAuth callbacks, public organization-key/legacy-OAuth clients and
MCP bearer routes retain their independent contracts. CORS is still responsible
for response sharing and preflight, not for this mutation boundary.

One-time credential propagation is confined to the current organization and
provider family. LinkedIn account/page credentials can share inside that tenant;
other providers share only their own identifier. No cross-tenant copying or
backfill of previously overwritten credentials is attempted. Historical affected
rows and real provider behavior are UNKNOWN; reconnect/repair of actual accounts
requires an authorized, consumer-aware delivery step.

Primary channel writes also require the exact existing provider. The legacy
unique key is still organization plus external ID; when a different provider
collides, connect/refresh returns HTTP409 `CF_CHANNEL_PROVIDER_COLLISION` and
keeps the existing channel and credentials. Concurrent connections follow the
same rule. This does not add support for two different providers sharing that
legacy key or remove a conflicting historical record. Normal same-provider
reconnect and LinkedIn credential sharing between separate records remain.

## Browser-extension refresh grants (dbxe.13)

Implemented locally on 10 October 2026; not yet deployed. Every explicit extension
connect/reconnect stores a fresh random `__cfExtensionConnection` marker alongside
the cookie keys in the existing AES-encrypted `customInstanceDetails`. Its refresh
JWT carries `purpose: extension_refresh` and the matching `connectionGeneration`.
Ordinary cookie refresh preserves that generation; reconnect rotates it even when
the account and cookie bytes are identical. The request/response and extension
storage shapes are unchanged, so no extension package update is needed for the
server-side generation check itself.

Refresh checks the current channel's organization, account, provider, deletion,
disablement and generation before calling the provider. It then conditionally
updates the existing row with its exact read credentials; a deletion, disablement
or reconnect during authentication returns 409 and never revives or overwrites
the channel. Account-mismatch diagnostics use the same conditional update.
Successful refresh writes AES-encrypted JSON, retaining the generation.

Old untagged extension JWTs return 401: they cannot establish which connection
issued them. After the future release, reconnect an existing Skool channel once
through the normal flow to store a bound token. Existing encrypted and legacy
signed cookie records remain readable; no stored data or signing secret is rotated.

The separate dbxe.14 package implements host permissions and visible renewal
failure handling described below. Server tests alone do not establish native
browser behavior or an actual Skool renewal.

## Browser-extension package and renewal (dbxe.14)

Extension 2.0.1 is implemented locally; not published or deployed. Its production
manifest grants the existing Skool scope and only these backend hosts:
`https://factory.aidevteam.ru/*`, `http://localhost/*`, `https://localhost/*`.
The localhost hosts preserve the existing local connection contract. There is
no all-host grant. Development uses the local hosts only. Both build paths read
their actual manifests; arbitrary environment values cannot expand permissions.
Chrome may ask the user to accept the added host permissions when updating an
existing installation. Re-enable the extension if Chrome has paused that update.

Before storing a grant and before every renewal, the backend URL must match a
trusted manifest host/scheme and have current Chrome host permission. Credentials,
query strings, fragments and other protocols/hosts are refused. On connection,
the backend host/scheme must also match the trusted sending page; local frontend
and backend ports may differ. `/api` paths and a trailing slash remain supported.
An operator using another backend host must deliberately adjust both manifest
host permissions and `externally_connectable.matches`; a runtime URL alone
grants no access. This is a source configuration procedure, not an additional
permission granted by the shipped extension.

The existing daily alarm sends to `/integrations/extension-refresh`, omits ambient
backend cookies, refuses redirects and bounds the request to 15 seconds. Only a
successful HTTP reply with `success:true` counts as success. Missing Skool cookies
asks the user to sign in there; 401/403/404 or an account mismatch asks for channel
reconnection. Conflict, temporary HTTP/network errors and malformed replies keep
the grant and report that the next daily cycle will retry.

Failures set a native Chrome `!` badge. Hover/focus the extension icon to read the
Russian action guidance. The status survives worker restart and clears on success,
reconnection or removal; other failed channels still keep the badge. Pin the
extension in Chrome if immediate toolbar visibility is wanted. No popup, new
product screen, notification permission or credential-bearing error log is added.
Late replies cannot re-mark a removed/reconnected channel. Error handling never
rewrites stored grants or cookies; explicit channel removal retains its existing
behavior. Old untagged dbxe.13 grants still need one normal reconnect after release.

Build with `pnpm run build:extension` (Node 22.23.2/pnpm 10.6.1, Python 3 standard
library for ZIP). This produces `apps/extension/extension.zip`; the system `zip`
binary is no longer required. The canonical four-entry archive contains exactly
the built worker, production manifest and two existing icons.

Local acceptance uses `tests/extension-runtime.browser.cjs` after that build:
an owned persistent Chromium context installs the extracted, byte-checked ZIP,
sends the real external connection message and triggers a native alarm against
a controlled loopback backend without CORS headers. Synthetic cookies exercise
success, auth/account mismatch, transient errors, redirect refusal, recovery,
legacy URL rejection and late reconnect/removal responses. This is packaged
browser proof, not real Skool/provider, store publication or production proof.
Result: `.codex/stages/content-factory-next-dbxe-extension-runtime-stage/outcome.md`.

Chrome contract references: [cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests),
[permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions),
[action status](https://developer.chrome.com/docs/extensions/reference/api/action),
[native alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms).
Browser fixture reference: [Playwright extensions](https://playwright.dev/docs/chrome-extensions).

## Release boundary

Local acceptance uses synthetic credentials, local HTTP and disposable PostgreSQL.
It is not production, real-account cookie availability or real-provider acceptance.
The active service is not restarted or redeployed by this stage. Before shipping,
triage applicable critical dependency notices in `dbxe.8`, use the production
release procedure and its SHA-bound full-suite receipt, then verify the changed
runtime. No production `prisma db push` is needed or permitted for this change.
