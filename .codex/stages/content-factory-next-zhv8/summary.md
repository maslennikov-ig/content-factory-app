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
the whole node:test half (125/0); docs check. Two integration defects found
and fixed by root: the quota imported `ioRedis` at module load, which opened a
live socket to 6380 in every suite that reaches the research service and kept
the node:test process alive (fixed by providing the client through the
`RESEARCH_QUOTA_STORE` token from `database.module.ts`, `d498b8e6`); the
screen-review guard compared the contract's `current_branch` with the stage
manifest (`eb5eb2fd`). Root acceptance on `eb5eb2fd`: three `tsc` zero,
`pnpm run build`, suite receipt Jest 417/5403, Node 125/0 (4 existing
environment skips), Python OK; process verification and docs check passed.

## Release 11.09.2026

Public `17088939db4029298bf0cf05e56cdcaeb355a92f` (`Source-Commit: eb5eb2fd`),
image `ghcr.io/maslennikov-ig/content-factory-next:17088939db40`, digest
`sha256:4f639160cf120a8c839658b67de0f6eea466f522ad271d68f2e50e9c675febef`,
rollback `92f0b95dfe3f`. Image weight unchanged (0%), no `.env` inside, nginx
config OK. `migrate diff` from the new image against the production database:
exit 0, empty; `schema.prisma` unchanged; Mastra product 0→0, dedicated 29→29,
fingerprint `310d75fc…acac8f7` unchanged. Host `helixa-prod`: healthy, restarts
0, marker `17088939db40`, three doors 200, source archive SHA
`98e786688d88fb60d0ca7ebdbb568d52e5ba3c9f6f117e87817b2f324fd8645e` matches the
local build; no «No research quota store» line in the log, so the Redis store
is injected. Retention kept `17088939db40` and `92f0b95dfe3f`, removed
`aaaf00afe664`. Evidence: `evidence/release-2026-09-11.json` and the logs
beside it.

Owner authority: «давай это разберём всё и исправим, что возможно» (11.09), on
top of the standing release authority of 07.09 reaffirmed 10.09 and 11.09.

project-index: reviewed-no-change - `.codex/orchestrator.toml` only re-points
the current stage at `content-factory-next-zhv8`; navigation did not change.
docs-reviewed: updated - specification §6 (keyless lane), handoff, runbook
release record.
graph-reviewed: no-change-needed - the change stays on the research seam the
previous stage already mapped; no extraction ran.
