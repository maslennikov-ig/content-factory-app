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
the new cap assertion. Root acceptance and release are recorded below when
they complete.
