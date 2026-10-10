# dbxe.14 — packaged extension renewal

Selected by the owner on 10 October 2026. Baseline `c8385e0439d139053b8656011a2d36d1a86c7737`.
One bounded local stage; Beads remains the task authority. Epic and dbxe.8 release gate stay open.

## Original criterion (verbatim)

Packaged extension obtains least necessary explicit/optional backend host permission and validates stored URL; actual background renewal reaches controlled mock backend and reports failures. Prove production manifest/build with a browser extension fixture, no real Skool credentials and no broad wildcard/all-host grant.

## Spec and ownership

Root owns extension code, focused unit checks, packaging, docs, final acceptance and delivery.
One bounded executor owns `tests/extension-runtime.browser.cjs`: independent native browser fixture preparation saves parallel latency; no extra reviewer.

- Production package grants only the existing Skool scope, HTTPS Factory and HTTP/HTTPS localhost (the already-supported local connection surface). Development manifest retains local scope. No all-host/subdomain backend permission or arbitrary environment expansion.
- Stored backend URL must be HTTP(S), match the exact trusted page hosts/schemes from the manifest, have no credentials/query/fragment, and have current Chrome host permission. A connection message also binds the backend host/scheme to its trusted sender; local frontend/backend ports may differ. Revalidate before reading/sending cookies, including legacy stored entries. Keep `/api` and trailing-slash compatibility.
- Inspect actual HTTP status and response: success only means 2xx with `success:true`; 401/403/404 or account mismatch ask for reconnect; 409, network/timeout, 5xx and malformed replies report a retryable failure; missing cookies asks for Skool login. Reject redirects and omit ambient credentials. No JWT, cookie values or server error bodies in diagnostics.
- Use native Chrome action badge/title, backed by a small per-connection status map; no new product page, popup, notification permission or external-message protocol. Clear errors on successful refresh/reconnect/removal. A short storage-mutation chain prevents stale results from changing a reconnected/removed entry; provider requests run outside it.
- Keep existing daily alarm and opaque JWT message shape. Preserve credentials on errors. Version package 2.0.1. Use available Python standard-library ZIP packaging instead of installing a system dependency; verify archive bytes against built files.

## Implementation and proof

1. Add a focused failing reproducer for unrestricted backend storage/silent renewal errors.
2. Implement the complete extension path, manifests/build and focused meaningful counterexamples.
3. Root final acceptance: production `pnpm run build:extension`, ZIP CRC/byte equality, native Chromium persistent extension context, actual external connect message and native alarm reaching a loopback server without CORS assistance, visible action status on success/rejection/transient failure, URL/exfiltration guards, extension types and affected unit suites.
4. Docs/diff, original-criteria preservation, scoped local commit and receipts; close only .14 on matching proof. Stop for next owner choice.

No release/full suite, production/CDP user profile, live accounts, provider/model calls, schema changes, source push, deployment or global key rotation. Browser is an owned disposable fixture using synthetic Skool cookies. Installed Playwright library is necessary for a native extension service-worker/alarm fixture; no Playwright test framework is added.

## Technical premortem

Verdict: GO. Reversibility: local code revert; disposable browser profile/server cleanup; no live state changed.
Blast radius: production manifest/build -> browser host permission -> stored backend/JWT -> alarm fetch -> native action status; frontend's existing opaque STORE message remains compatible.

| Failure symptom | Evidence | Mechanism/surface | Detection | Mitigation | Disposition | Owner/check |
|---|---|---|---|---|---|---|
| Cookies reach a foreign URL or redirect | confirmed unrestricted URL on baseline | stored entry plus fetch | foreign URL/redirect counterexamples | trusted-host validation before cookies, permissions, redirect error | preflight | root/unit/browser |
| Update silently fails again | confirmed ignored response on baseline | 401/mismatch/network | native alarm and action title/badge | classified durable status, preserved credential | preflight | root/browser |
| Late refresh misreports a new connection | plausible concrete concurrent reconnect | storage/status read/write | deferred-response reconnect/remove test | serialize only small storage mutations and compare current grant | preflight | root/unit |
| Executor proves mocks rather than Chrome or packages wrong manifest | confirmed two configs and missing zip | build/fixture evidence | exact shipped archive, native permission/alarm/server proof | use canonical build, owned persistent Chromium, source/package hashes | preflight | root/acceptance |

Recovery: revert the scoped local commit if needed; remove only owned browser/server/profile. Existing .13 grants and server remain intact; old untagged grants still need one reconnect after a future release. No production rollback required in this stage.

## Documentation consulted

- [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): backend fetch needs host permission; guard arbitrary URLs.
- [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions): current grant check and required/optional tradeoff.
- [Chrome action](https://developer.chrome.com/docs/extensions/reference/api/action): native badge/title provides accessible status without another page.
- [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms): restore important alarm at service-worker start.
- [Playwright extensions](https://playwright.dev/docs/chrome-extensions): persistent Chromium context and actual MV3 service worker.

Graph orientation: local graph built at46ec4108; focused `graphify query refreshAllCookies`; exact current files confirmed. No graph refresh/API backend.
Child delivery accepted as fixture preparation: `/root/extension_runtime_fixture`, gpt-6.1-sol/high,
`tests/extension-runtime.browser.cjs`; root inspected the full harness. Native Chromium153.0.8010.12
launch prerequisite passed with installed Playwright1.58.2; owned temporary profile removed.
No package/source-zone writes, delegated full acceptance or remaining child runtime. Root retains
the actual ZIP/permission/alarm/backend/action acceptance.
