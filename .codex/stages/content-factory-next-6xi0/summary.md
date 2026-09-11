# Provider-cap wave 11.09

Source: independent review of release `aaaf00afe664` (Claude, 11.09.2026, in
the owner's chat); Beads epic `content-factory-next-6xi0` is the status
authority. Root executes on `main` from `330ad2f3`; no worktrees, no subagents.

## Scope

- `6xi0.1` One Tavily or OpenRouter query is capped at 20 results again; Exa
  keeps 100. The review-tail wave had removed `Math.min(20, …)` so a deep
  research sent `max_results: 50` to Tavily, whose documented range is 0–20
  and whose client does not clamp. Deep research reaches its 50-source preset
  as the sum over 25 queries; specification §6 records this.
- `6xi0.2` `web.research.service.ts` imports `decideResearchEgress` from the
  research egress module; the hand-written fallback copy is gone. Jest maps
  the alias to the real compiled module (`tests/helpers/research-egress.cjs`),
  the same pattern as `organization-roles.cjs`. The policy now receives the
  elapsed wall clock; bytes, sources and cost are still not metered and the
  code comment says so.
- `6xi0.3` Handoff carries the transfer decision instead of the prompt
  literal; the review-tail summary names only what the egress check meters;
  `m0iy.10` (benefit measurement, threshold for `.6`) and `m0iy.11` (owner
  Exa key) are open tasks; handoff compacted back under 200 lines.

## Verification

Focused: 19 Jest suites that load the research service, 306 tests, including
the new cap assertion. Root acceptance on `3f84df3d`: three `tsc` zero,
`pnpm run build`, suite receipt Jest 417/5393, Node 125/0 (4 existing
environment skips), Python OK; process verification, docs check (141 files)
passed. No paid call: the Tavily limit is taken from docs.tavily.com.

## Release 11.09.2026

Public `92f0b95dfe3f8eaf07129e077276cb997a42d6b8` (`Source-Commit: 3f84df3d`),
image `ghcr.io/maslennikov-ig/content-factory-next:92f0b95dfe3f`, digest
`sha256:145c989f3c591663df297d98cd8b8fb82043370b6c16e890dfd48cc7bdcb9ffa`,
rollback `aaaf00afe664`. Image weight 0.75 GB (0% against the previous), no
`.env` inside, nginx config OK. `migrate diff` from the new image against the
production database: exit 0, empty; `schema.prisma` unchanged since the
previous release; Mastra product 0→0, dedicated 29→29, canonical fingerprint
`310d75fc…acac8f7` unchanged. Host `helixa-prod`: healthy, restarts 0, marker
`92f0b95dfe3f`, three doors 200, source archive SHA
`2d7523d061f1874090816fac922992910f382762de6131b821406458dd5012b4` matches the
local build. Retention kept `92f0b95dfe3f` and `aaaf00afe664`, removed
`cc513632d93d`, 21 GB free; nothing else on the host touched. Evidence:
`evidence/release-2026-09-11.json` and the logs beside it.

Owner authority: «Тогда исправь все сам» (11.09, after the review named the
deep/Tavily defect), on top of the standing release authority of 07.09
reaffirmed 10.09 and 11.09.

project-index: reviewed-no-change - `.codex/orchestrator.toml` only re-points the
current stage paths at `content-factory-next-6xi0`; navigation did not change.
docs-reviewed: updated - specification §6, runbook release record, handoff,
review-tail summary wording.
graph-reviewed: no-change-needed - two files touched on an existing seam; the
local graph was not consulted and no extraction ran.
