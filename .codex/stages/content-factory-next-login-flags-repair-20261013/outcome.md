# Telegram login and language flags — 13 October 2026

Status: SOURCE_ACCEPTED; RELEASE_IN_PROGRESS. Beads `2q28.43/.44/.45` owns status.

## Confirmed causes and fixes

- Shared disk exhaustion made PostgreSQL panic and refuse connections. The
  first effective stale-cache cleanup recovered original PostgreSQL, app and
  worker without restart or data removal. Readiness and main queue returned200.
- Anonymous local language SVGs were redirected to `/auth`. The proxy now
  permits their existing directory; neighboring protected paths stay gated.
- Existing-account OAuth returns a session/reload response, not a registration
  token. The frontend now recognizes it and replaces the spent callback with
  the clean application root. Saved same-site return paths retain priority.
  Failed Telegram exchange starts fresh login instead of replaying the code.

The owner's OAuth URL, code/state, browser IP and profile were never saved or
replayed. Actual owner login after release remains a distinct external check.

## Evidence and delivery

Initial reproducers:16 anonymous SVG failures and6 OAuth lifecycle failures;
neighboring routes and existing behavior passed. Corrected focused acceptance:
12 Jest suites/191 tests, no skips. Four-app `pnpm run build`, documentation,
process and Git whitespace checks PASS. Full release suite/image/runtime gates
are pending and must be read before claiming deployment.

Owner approved bounded old AiDevTeam rollback removal; six named reserves,
current production and both Content Factory images are retained. Exact packet,
inventories and actual cleanup receipts live under `evidence/`; raw host evidence
must remain excluded from the published tree.

No original requirement or epic is closed. Original client acceptance, SaaS,
Skool, legal, pricing, finance, offsite and research defers remain as recorded.

docs-reviewed: updated - repair causes, boundaries and continuation recorded.
graph-reviewed: used - `graphify query TelegramProvider --graph graphify-out/graph.json`;
existing runtime symbols/call boundaries unchanged, no structural refresh required.
