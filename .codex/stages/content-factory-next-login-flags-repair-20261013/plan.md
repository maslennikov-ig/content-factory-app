# Login and language flags repair — 13 October 2026

Beads IDs are recorded in `issues.json`; Beads owns status.

## Observed failures

- Host filesystem reports zero available bytes. PostgreSQL repeatedly fails
  writes with `No space left on device`, enters recovery, and refuses connections.
  App readiness is HTTP 503; app and PostgreSQL are unhealthy.
- Anonymous language flag requests receive HTTP 307 to `/auth`, rather than SVG.
  Flag files exist; the frontend proxy gates their directory.

## Bounded work

1. Under the owner's existing full-server-cleanup authorization, reclaim only
   unused builder cache older than 24 hours. First prove no build is running and
   snapshot container/config, image and volume identities. Keep data and rollback.
2. Verify PostgreSQL recovery, application readiness and protected resources.
3. Reproduce anonymous SVG routing in a focused regression, allow the existing
   flag directory, and prove protected neighboring routes stay gated.
   Related OAuth reproducers also require leaving a spent callback after an
   existing-account login, recognizing its session response, and restarting a
   failed Telegram attempt instead of replaying its code.
4. Deliver source and any necessary release through existing repository gates.
   Keep production success, local regression and real owner login distinct.
5. Save receipts, update Beads and handoff, and leave unrelated epics untouched.

No supplied OAuth callback, code, state, IP or profile data is saved or replayed.
No new social connection, model call, message, account or database schema change.

Owner13Oct selected retention of the latest three AiDevTeam rollback images and
documented reserves. Eight older unused tags were audited for removal, keeping
six rollbacks conservatively (three latest, pre-SEO, license and category media),
the active image, both Content Factory images, all containers and all data.
