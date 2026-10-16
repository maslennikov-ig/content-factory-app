# Telegram login and language flags — 13 October 2026

Status: DELIVERED; root technical acceptance PASS. Beads `2q28.43/.44/.45` owns status.

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
12 Jest suites/191 tests, no skips. Four-app `pnpm run build` PASS. Full local
release suite:661 Jest suites,12191 passed/71 skipped; Node123 passed/4 skipped;
Python50 passed. Exact Node22.23.2 suite receipt preserved under `evidence/`.
Public CI all5 jobs PASS including Docker proofs, build, calendar+400 and code
analysis. Full-suite log read independently:12190 Jest/72 skips,123 Node/4 skips,
50 Python. Environment skip differences are explicit.

Private source `3cd254a7417d6b7d7e3478f8f49b3ae9b65882a4` pushed and merged;
public snapshot `0e8f25e5fe9f20c0fcca9d860bee70d0ed9300e7` pushed separately.
Running image `ghcr.io/maslennikov-ig/content-factory-next:0e8f25e5fe9f`, registry
digest `sha256:8c985bce9e41b2a978788bbfe698a275444d33d3ab00df2956f89936659bd4fd`.
Source version and actual12,679,340-byte archive bind to that snapshot; archive
SHA256 `6575a5df3d4c337a0f326cb50362e09f3c5dfe8acee8150eeaf19088c6bfef48`.
Native backend/orchestrator/frontend online with0 restarts; app/PostgreSQL/Redis
healthy; public API/login/readiness/main queue and private worker checks PASS.
All16 live SVGs200 and byte-identical to source; neighboring private path307/auth.
Fresh Telegram start/state200 with bound secure HttpOnly cookie, unbound state400;
PKCE S256 preserved. No provider page followed or real code exchanged.
Browser fixtures prove17 flag renders, clean existing-session destination and
fresh failure restart with one exchange each. Actual owner login is unverified;
start a new attempt at `https://factory.aidevteam.ru/auth/login`.

Prisma before/after diff0; schema not applied. Separate Mastra database currently
has45 tables. The auxiliary metadata-before probe failed before reading data;
current table metadata is proof of availability, not a before/after row comparison.

Owner approved bounded old AiDevTeam rollback removal:8 exact unused tags removed,
6 named reserves retained. Aged builder cache reclaimed1.811GB then15.58GB.
Final available space18,973,564,928 bytes (~19GB). All21 foreign container identities
and configuration hashes, all20 volumes preserved at switch and final cleanup.
Canonical CF retention keeps current0e8 +verified rollbackec58, removes obsolete2a
and exactly2 old config copies. No foreign data, live config or backup removed.
Owned schema helper files, temporary release worktree, browser and preview retired;
suite receipt preserved, unrelated dirty/untracked work and worktrees untouched.
Exact cleanup packets and raw receipts stay under private `evidence/`, excluded
from the public tree. Documentation/process/whitespace closeout is recorded there.

Follow-up `content-factory-next-0qgn.24` OPEN: prevent recurring shared-host disk
exhaustion at the artifact producer. This repair does not implement that lifecycle.

No original requirement or epic is closed. Original client acceptance, SaaS,
Skool, legal, pricing, finance, offsite and research defers remain as recorded.

docs-reviewed: updated - repair causes, boundaries and continuation recorded.
graph-reviewed: used - `graphify query TelegramProvider --graph graphify-out/graph.json`;
existing runtime symbols/call boundaries unchanged, no structural refresh required.
