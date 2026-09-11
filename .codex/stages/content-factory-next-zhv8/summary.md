# Open-items wave 11.09

Source: owner, 11.09.2026, «давай это разберём всё и исправим, что возможно»,
after the provider-cap release `92f0b95dfe3f`. Beads epic
`content-factory-next-zhv8` is the status authority; it closes `m0iy.8` and
`m0iy.9`. Root integrates on `main` from `a91c3abc`; two Opus 5 streams ran in
isolated worktrees and were merged with two hand-resolved conflicts in
`web.research.service.ts` (imports) and `tests/research.phase-one.test.cjs`
(adjacent new tests).

## Scope

- `zhv8.1` (`m0iy.8`, worker commit `db263310`): at an explicit research level
  the service reads Wikipedia and Wikidata without a key after the provider
  answers settle, through `constrainedResearchFetch` (DNS per hop, private
  ranges refused, manual redirects, SSRF dispatcher), gated by the egress policy
  with `kind: 'fetch'` and `wikipedia`/`wikidata` on the approved list, under an
  8-second lane deadline. A Wikipedia row is read again through
  `/api/rest_v1/page/summary/{key}` for a citable extract (≤ 2000 chars) and
  becomes a fact; Wikidata becomes a source without a fact. The lane never
  throws out of `research()`. Level-less callers never open it. The REST summary
  field names (`extract`, `type`, `content_urls.desktop.page`) were checked by
  root with one keyless GET on 11.09. `AcceptedResultProvider` and the autopost
  `ResearchSource` DTO accept the two new provider values; the public accepting
  DTO does not.
- `zhv8.2` (`m0iy.9`, worker commit `7027282e`): `ResearchQuotaService` counts in
  Redis, key `research:quota:{organizationId}:{level}:{YYYY-MM}` (UTC), `INCR`
  then `EXPIRE` 40 days on the first increment, `DECR` back on refusal; limits
  unchanged (quick 20, standard 10, deep 3); a Redis failure falls back to the
  in-process counter with one warning per failed command. `MockRedis` gained
  `incr`/`decr`/`expire`/`ttl`. No Prisma change.
- `zhv8.3`: the review-tail worktree and its merged branch are removed; the
  Telegram `409 Conflict` from the first review did not occur on the host in the
  last 24 hours; no local Tavily key exists, so the paid confirmation of the
  Tavily limit stays with the owner.

## Verification

Focused after integration: 18 Jest suites on the research seam, 293 tests;
node:test suites on the same seam; docs check. Root acceptance and the release
are recorded below when they complete.

project-index: reviewed-no-change - `.codex/orchestrator.toml` only re-points
the current stage at `content-factory-next-zhv8`; navigation did not change.
docs-reviewed: updated - specification §6 (keyless lane), handoff, runbook
release record.
graph-reviewed: no-change-needed - the change stays on the research seam the
previous stage already mapped; no extraction ran.
