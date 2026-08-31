Target: Deep research agent (ChatGPT / Gemini / Claude Deep Research)
Audience: Manual handoff — a person will paste this into a deep-research tool and read the result.

Goal: Recommend one web-search backend, plus one fallback, for the research step of an LLM post-generation pipeline that writes Telegram-channel content in English and in Russian, treated as equal languages. Deliver a decision with evidence, not a vendor survey.

Success criteria:
- A single primary recommendation and a single fallback, each with the reason it won and the condition under which it loses.
- Every candidate scored on the eight criteria below. The language axis is the heaviest, and it is scored separately for English and for Russian; a candidate's language score is the weaker of the two, never the average. A backend that is excellent in English and mediocre in Russian is a mediocre candidate.
- Each factual claim carries a source URL and the date the page states. Claims that exist only as vendor marketing are labelled as such; claims you could not verify are listed separately as unverified rather than smoothed over.
- Cost expressed per generated post, not per API request, using a stated assumption about how many searches one post needs. If a candidate prices differently by language or region, say so.
- An explicit statement of what evidence would flip the recommendation.

Context:
- The product is a self-hosted, multi-tenant social-publishing tool. Each workspace stores its own encrypted AI key; model calls already route through OpenRouter. Adding a second search vendor means a second key, a second bill, and a second place to configure per workspace.
- The generation pipeline is LangGraph. One research call produces a result that is then reused in four downstream prompts: topic selection, hook, post body, and image prompt. A backend that returns cleaned, extractable text is therefore worth more than one returning bare links.
- The product ships in English and Russian as fully equal languages. Neither is primary and neither is a fallback: the same pipeline generates posts in both, and a backend is only acceptable if it is good in both. Sources will therefore span English-language media and Russian-language media, and possibly Telegram and VK.
- Most published search-API comparisons are English-only. They say nothing about the Russian half of this decision; treat them as evidence for one language only and say so explicitly rather than generalising.
- Generated posts are published commercially.
- A later pipeline stage will add RSS feeds and Telegram donor channels as content sources.

Candidates to cover:
- Tavily (currently wired in, via @langchain/tavily)
- OpenRouter built-in web search — the `:online` suffix and the `web` plugin, including its selectable backends (Exa, Parallel, Perplexity, Firecrawl, provider-native)
- Brave Search API
- Serper.dev and SerpAPI
- Exa, used directly
- Perplexity Sonar API
- SearXNG, self-hosted
Add any candidate that materially beats these on either language axis, including candidates strong on Russian that English-centric roundups omit.

Criteria, in priority order:
1. Query and source quality in English and in Russian, reported as two separate scores: index coverage of media in each language, whether each language is officially supported, and any evidence of result quality on queries in each. State the gap between the two scores per candidate, because a large gap is itself disqualifying here.
2. Terms of service for commercial reuse: whether generated content derived from results may be published commercially, and any attribution, caching, or storage limits.
3. Output shape: cleaned page text and extracts versus links only; whether one call can serve four downstream prompts.
4. Per-tenant key support and billing attribution in a multi-tenant deployment.
5. Cost per generated post under a stated searches-per-post assumption.
6. Recency control: date filtering, index freshness, stated lag.
7. Reliability for scheduled runs: rate limits, latency, uptime commitments, free-tier limits.
8. Integration cost: existing LangChain or LangGraph support versus reaching the search through OpenRouter with no new dependency.

Constraints:
- Read-only research. Do not sign up for accounts, create API keys, or make paid API calls.
- Prefer independent measurements, changelogs, and dated documentation over vendor landing pages. Where only the vendor states a number, say so beside the number.
- Pricing pages change often. Quote the price with the date you read it.
- Do not assume the answer is the incumbent, and do not assume consolidating onto the existing vendor is automatically right; argue both.
- If a criterion cannot be answered from public sources, report the gap. Do not fill it with a plausible guess.
- Where a reasonable reading of the task could change the outcome, state the assumption you made in one line and continue; do not stop to ask.

Output:
1. Recommendation: primary and fallback, three sentences each.
2. Comparison table: candidates as rows, the eight criteria as columns, each cell a short verdict.
3. Language findings: the deepest section. Two parallel sub-sections, English and Russian, with whatever direct evidence exists on queries and sources in each, followed by the per-candidate gap between them.
4. Terms-of-service findings for commercial publication, per candidate.
5. Cost model: searches per post assumption, then cost per post and per 1,000 posts per candidate.
6. Unverified claims and evidence gaps, as a list.
7. What would change the recommendation.
Cite sources inline as links.

Stop: Stop and report when the seven output sections are written, even if some cells are marked unverified. Report gaps rather than filling them.
