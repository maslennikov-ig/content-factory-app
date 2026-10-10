# dbxe.14 — extension package accepted locally, 10 October 2026

Only `content-factory-next-dbxe.14`; baseline `c8385e0439d139053b8656011a2d36d1a86c7737`.
Original criterion retained verbatim in [plan.md](plan.md). Epic remains OPEN;
dbxe.8 full release gate remains IN_PROGRESS, not waived by this stage.

Extension 2.0.1 grants exact Factory/local backend hosts, validates the saved URL
and current permission before cookie access, binds connection messages to their
trusted page host/scheme and refuses redirects/ambient backend cookies. The daily
renewal now reads HTTP/body success. Native Chrome badge/title reports reconnect,
Skool login or retry guidance; success/reconnect/removal clears the relevant error.
Stored grants survive errors. A short storage mutation chain keeps delayed replies
from re-marking a reconnected/removed channel; network calls never hold the chain.
No popup/new product screen, notification permission, storage-token migration or
new external message protocol. dbxe.13 old untagged grants still require reconnect
after a future release. Chrome may require acceptance of the added host permission.

Canonical `pnpm run build:extension` PASS, including the actual ZIP packaging;
Python standard library replaces missing system `zip`. A two-line build-helper
type correction preserves Node22 recursive locale reading under pinned Node18
typings; actual nested JSON emission is covered, without a dependency upgrade.

Root acceptance PASS: **2 Jest suites / 56 tests / zero skips**, extension types,
and **21 native Chromium cases** with installed Playwright1.58.2/Chromium153.0.8010.12.
The browser loads the exact extracted production ZIP: CRC and all four file hashes
equal canonical dist. Actual Chrome host grants match the narrow manifest. A real
external message creates the daily alarm; native alarm delivers synthetic cookies
to the owned loopback backend without CORS headers. Auth/account mismatch,
conflict/5xx, invalid JSON, disconnected network, missing cookies, recovery,
legacy foreign URL and pending reconnect/removal are observed through real action
status. A 302 is not followed; ambient backend cookie is omitted. Fourteen owned
refresh POSTs, zero followed redirects. All owned alarms, browser, servers,
profile/extracted package are cleaned; unrelated/user browser/runtime untouched.

Proof: [root-acceptance.actual.json](root-acceptance.actual.json).
Raw build/tests/types/browser/doc logs remain local, including the original three
behavioral failures and inherited type-check failure; not reclassified as passes.
No production/provider/account/model call, source push, registry/store publication,
full application suite or deployment. This proves a packaged controlled-browser
renewal, not actual Skool account acceptance.

One isolated fixture-preparation child accepted immediately in plan; root owns
final acceptance. Closeout-lite uses the matching root results once.
docs-reviewed: updated - extension behavior/migration/build guide and navigation.
graph-reviewed: used - focused local `graphify query refreshAllCookies` on stale
46ec4108 orientation; exact current files confirmed, no refresh/external backend.

Local commit saved; only .14 closes against this proof. Next candidate is .15:
recheck current automation/channel/provider disablement when scheduled work wakes.
All original epic criteria and unselected work stay in Beads; no automatic next stage.
