# Keyless community topic discovery

Scope: `content-factory-next-75xn.9`, under epic `content-factory-next-0qgn`.
This contract implements the existing free-only community discovery requirement;
it does not activate the conditional deep-research phase in `m0iy.6/.7`.

## Selected path

The operator may select `LEAD_TOPIC_COMMUNITY_ONLY=true`, default false, alongside
the existing `LEAD_TOPIC_CHECK_ENABLED=true`. In this path a topic subscription
reads anonymous HN, GitHub public Issues and arXiv metadata directly. It never
calls `WebResearchService.research`, query classification, discovery judging,
reader-summary synthesis or a paid fallback. With topic checking disabled, no
outbound act occurs, regardless of the new flag. With the new flag false, the
existing search path is preserved. No search-provider enum/settings/UI changes.

Reddit remains excluded by the owner's existing `m0iy.7` policy: no official API
setup and no donor browser bypass. Paid X/TikTok/Instagram wrappers and paid Exa
substitutes are excluded. The original task history remains intact; local proof
of these three interfaces does not prove Reddit delivery or live source quality.

## Acquisition and selection

Use the existing constrained HTTPS fetch, pinned DNS/redirect protection and
research egress policy. Send only the explicit public topic, never organization
profiles, private source text or model-derived hidden queries. Honor global,
tenant/provider kill switches and denied domains. Cap requests, total response
bytes, candidate count and wall time; per-response limits are 1 MiB for GitHub and 256 KiB for HN/arXiv, with 2 MiB per check; abort/deny rather than retry unboundedly.

- HN: one bounded list and at most 20 item reads, no comment-tree expansion.
  Retain title, article/discussion URL, timestamp, score and comment count.
- GitHub: anonymous lexical public Issue search, fixed `is:issue is:public`
  filters, `sort=comments`; at most one bounded page. A fixed repository list
  is optional, not an access prerequisite. No tokens/GraphQL/semantic search.
- arXiv: one bounded Atom metadata query, no PDF downloads. Its engagement is
  unknown. Enforce at least three seconds between requests across our processes.

Provider request admission must be shared across backend/orchestrator processes
using the existing Redis connection. No new credentials. A missing/unavailable
shared limiter fails closed for outbound requests. Honor 403/429 Retry-After/reset;
do not retry immediately or fall back to another paid interface.

Cache bounded results for 15 minutes, preserving tenant/topic/window identity.
Cache size is bounded. Provider limits/backoff also apply to different tenants;
cache hits perform no request. Return the existing `fromCache` signal.

All admitted candidates have an actual publication timestamp inside the gateway's
window and a valid canonical URL; undated, future, deleted and duplicate items
are excluded. Topic matching and reason text are deterministic, with no model.
Provider failure yields partial/empty candidates and a sanitized diagnostic; no
fabricated success, votes, comments, relevance probability or citation claim.

Ranking selects the bounded candidate set: HN by its actual score/comments,
GitHub by its actual comment count, arXiv by publication recency. Raw votes and
comments from different platforms are not a common numerical scale. Interleave
ranked provider sets deterministically before the final cap. Existing queue
ordering by observation recency remains; this slice promises ranked selection,
not a new persistent queue-sorting control. No Prisma schema change is needed.

## Consumer and proof

The collector returns the existing `LeadFeedCheckResultV1` item shape to
`LeadTopicGateway`, then the existing service/repository persists the candidates.
Canonical external identity and skip-duplicates preserve dismissal memory.
No existing Temporal workflow/activity contract changes. No new UI component.

Offline recorded fixtures cover each source, bounds, wrong/undated/old/deleted
rows, URLs/DNS/redirect refusals, kill switches, cache, shared pacing and backoff.
An end-to-end topic check proves persisted free candidates while spies reject
every paid/research call. The disabled/default paths and dismissal/tenant behavior
retain focused regression checks. Root owns final acceptance and backend types.

Official documentation reviewed 01.10.2026:
[HN](https://github.com/HackerNews/API),
[GitHub public Issue search](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests),
[GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
[arXiv manual](https://info.arxiv.org/help/api/user-manual.html),
[arXiv terms](https://info.arxiv.org/help/api/tou.html).
Deployment, activation, paid calls and real account connection remain separate
authority boundaries. No live-provider quality claim is made by fixture tests.
