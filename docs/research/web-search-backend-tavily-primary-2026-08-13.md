# Decision Memo: Web-Search Backend for a Russian-Language LLM Post Pipeline

**Prepared for:** CTO, AI studio. **Date:** 13 August 2026. **Scope:** the research step of a LangGraph pipeline that generates commercially-published Russian-language Telegram posts; one research call feeds four downstream prompts (topic selection, hook, post body, image prompt).

**One-line assumptions I made:** (1) "Searches per post" = distinct search-API calls the research node issues per post; I model a base case of 3, with sensitivity at 1 and 5. (2) The pipeline needs cleaned page text, not just links, because one research result is reused across four prompts. (3) Posts are commercial, so any "no commercial use / no derivative works / display-only" clause is disqualifying.

---

## 1. Recommendation

**Primary: Tavily (advanced depth, `country: russia`, `include_raw_content`).** Tavily is the only candidate that both returns cleaned, extractable page text in the *same call* that returns ranked results — satisfying the "one call serves four prompts" requirement — and carries terms that permit commercial use of outputs derived from public content. It is already wired in via `@langchain/tavily`, supports per-workspace keys with a `request_id` per call, and exposes a `country: russia` boost plus `topic: news` and date filtering. It loses if a Russian-query pilot shows its Russian-media recall is materially worse than Google-grade results, since Tavily has a documented non-English content-truncation weakness and no published Russian benchmark.

**Fallback: OpenRouter built-in web search (`web` plugin), engine set to Parallel `basic` or Perplexity.** This is the "consolidate onto what we already have" option: model calls already route through OpenRouter, so search adds no second key, no second bill, and no second per-workspace config — it bills to the same per-workspace OpenRouter key, giving clean cost attribution. It returns extractive highlights (Exa highlights are sized adaptively, typically ~2,000–4,000 characters per result) usable by all four prompts. It loses when Russian-media recall is the binding constraint, because its default Exa engine is English/tech-centric; mitigate by forcing `engine: parallel` (broad language support) or `engine: perplexity`.

**Not recommended as primary, and why:** Yandex Search API is structurally the best for Russian media but is disqualified for a commercial Western product by compliance and access friction (contracting through Yandex's Dubai/Serbia entities, USD-only manual-approval onboarding, sign-ups blocked from unspecified countries, and Russian-ownership/sanctions exposure). Serper.dev / SerpApi inherit Google's strong Russian index but return links+snippets only (failing the output-shape requirement) and carry live SERP-reselling legal exposure — Google filed suit against SerpApi on 19 December 2025 in the U.S. District Court for the Northern District of California, alleging DMCA §1201 anti-circumvention violations (bypassing "SearchGuard"); per Google's complaint, "SerpApi sends hundreds of millions of artificial search requests each day to Google. Over the last two years, that volume has increased by as much as 25,000%." SearXNG is operationally fragile (upstream engines actively block instances). Brave, Exa-direct, and Perplexity-direct are each beaten on one or more weighted axes by the two picks above.

---

## 2. Comparison table

Criteria are weighted with **Russian-language quality (col. 1) highest**. Verdicts are short; detail follows in §3–§5. Prices read 13 August 2026.

| Candidate | 1. RU query/source quality | 2. Commercial ToS | 3. Output shape | 4. Per-tenant key/billing | 5. Cost/1k posts (3 searches) | 6. Recency control | 7. Reliability | 8. Integration cost |
|---|---|---|---|---|---|---|---|---|
| **Tavily** | `country: russia` supported; **non-English content truncation documented** (issue #29); no RU benchmark | OK — outputs from public content; commercial use permitted | **Best**: cleaned raw text + ranked results + optional answer in one call | Per-workspace key; `request_id` per call; separate bill | ~$24 basic PAYG / ~$30 advanced Growth / ~$48 advanced PAYG | day/week/month/year + date range | SOC2; caching; acquisition by Nebius agreed Feb 2026 | **Lowest**: already wired in (`@langchain/tavily` v1.2.0) |
| **OpenRouter web plugin** | Default Exa weak on RU; Parallel `basic`/Perplexity broaden language | Passthrough to chosen engine's terms | Highlights (~2–4k chars) + `url_citation` annotations | **Best**: same OpenRouter key as model calls; no 2nd bill | ~$15–21 + LLM tokens | Engine-dependent; date filters via Exa/Parallel | Inherits OpenRouter uptime; 1 search/request in plugin mode | **Lowest**: no new dependency |
| **Brave Search API** | Independent index; Brave itself defers to Yandex for localized RU; `search_lang=ru`, `country=RU` supported | **Tiered**: base tier forbids AI inference; need "Data for AI"; storing raw JSON needs Storage Rights | Links+snippets; new LLM Context endpoint returns text chunks | Per-tenant key; separate bill | ~$15 ($5/1k requests) | day/week/month/year | Independent index; high RPS claimed | Community/MCP integrations |
| **Serper.dev** | Inherits Google RU index via `gl=ru`/`hl=ru` — structurally strong | **Exposure**: resells live Google SERP; Google v. SerpApi (Dec 2025) | Links+snippets only — **fails "one call → 4 prompts"** | Per-tenant key; separate bill | **~$0.90** ($0.30/1k) — cheapest | date filters | Fast (1–2s); 2,500 free | LangChain `GoogleSerperAPIWrapper` (community) |
| **SerpApi** | Same Google-inherited RU strength | Legal Shield covers collection, not downstream use; SERP-reselling exposure | Structured SERP, links+snippets | Per-tenant key; separate bill | ~$30 (~$0.01/search) | date filters | 100 free/mo | Community integrations |
| **Exa (direct)** | English/tech/academic-centric index — **weak for RU media** | Commercial use permitted | Clean text + highlights | Per-tenant key; separate bill | ~$21 ($7/1k) | date filters; weak freshness (FreshQA) | $2.2B co.; SOC2 | `@langchain/exa` v1.0.2 |
| **Perplexity Sonar** | RU quality undocumented; synthesizes rather than returns sources | Commercial use permitted | Synthesized answer + citations | Per-tenant key; separate bill | ~$15 + tokens ($5–12/1k req) | recency built in | 100M+ MAU scale | Via OpenRouter or direct |
| **Yandex Search API** | **Best for RU media** (native RU index, `ru`/regional codes) | RU law governs; commercial reuse not clearly granted; Russian-heritage | v2 offers snippets + "generative response"; text excerpts | **Hard**: non-resident onboarding via Dubai/Serbia entity, manual approval | ~$12 ($4/1k sync); generative ~$125 | index refresh every few days | <1s; Yandex Cloud SLA | No official LangChain JS package found |
| **SearXNG (self-host)** | Can enable Yandex engine → RU coverage; but Google engine actively blocked | AGPL self-host; upstream engines' ToS still apply | SERP snippets (JSON `format=json`); not full page text | Self-hosted; no per-tenant billing | Server cost only (~flat) | engine-dependent | **Fragile**: Google/Bing block instances | LangChain `SearxSearchWrapper` |

---

## 3. Russian-language findings (deepest section)

**The single most important finding is a gap:** there is **no public, apples-to-apples benchmark of Russian-media result quality** for any of these APIs. Russian-language developer coverage (Habr, vc.ru) discusses features, pricing, and agent-fit, not Cyrillic result quality. Treat all English-only search-API benchmarks as weak evidence for this decision. What follows is the direct evidence that does exist, plus explicitly-labelled structural inference.

**Direct evidence:**
- **Tavily has a documented non-English content weakness.** GitHub issue tavily-python #29 (opened 2 Aug 2024) reports that for non-English queries (Korean), "the length of the sentences in the content of the results is too short" — the same "Who is Messi?" query returned long English content but truncated content in the non-English language, with no vendor rebuttal posted. This is Korean, not Russian, but points to a general Cyrillic/non-Latin extraction risk. Tavily's `/search` endpoint does expose `russia` as a valid `country` enum value, plus `topic: news` and date filtering.
- **Brave supports `search_lang=ru`** (the Brave API 422 validation error enumerates `ru` among accepted language values) and `country=RU`, but Brave's own materials position its index as a *complement to* localized options "like Yandex" — an implicit concession that Brave is not the strongest for Russian media.
- **Serper/SerpApi return the actual Google SERP** with `gl=ru`/`hl=ru`, so they inherit Google's strong Russian-media indexing. This is the strongest structural argument for good Russian-media recall among the Western options, but no explicit Russian-quality test was found.
- **Exa is neural search over an English/tech/academic-leaning proprietary index**, making broad Russian-media recall structurally unlikely; no Cyrillic test found.
- **Yandex Search API is natively strongest for Russian.** Yandex holds roughly 70% of Russian search queries; per Dmitry Masyuk, head of Yandex search technology and AI, the company reached a "psychological mark" of "roughly seven out of 10 user queries nationwide," with Google handling the remaining ~30% (bne IntelliNews). StatCounter (March 2026) puts Yandex's Russian desktop share at 78.9% and mobile at 65.8%. The API provides a dedicated "Russian" search type with regional codes — this is vendor/industry consensus, not an independent quality benchmark.

**Structural ranking for Russian-media breadth (inference, not measured):** Yandex (native) > Serper/SerpApi (inherit Google's strong RU index) > Brave (independent, defers to Yandex for localized) > Tavily ≈ Exa (English-centric; Tavily has documented non-English truncation).

**Telegram / VK sourcing:** none of the general search APIs reliably index Telegram-channel or VK content. Telegram content is surfaced via third-party directories (e.g. tgstat.ru) or pulled directly through Telegram's own API (Telethon-based trackers); VK via the official VK API. **Recommendation:** treat Telegram/VK as a separate ingestion path (the later RSS/donor-channel stage), not something to expect from the web-search backend. This aligns with the user's roadmap.

**Note on Tavily's ownership (watch item):** Nebius (NASDAQ: NBIS) announced on 10 February 2026 an agreement to acquire Tavily for $275 million (Bloomberg, citing a person familiar with the transaction); Tavily "will continue operating under its current brand," with CEO Rotem Weiss and team joining Nebius. Nebius Group NV "split from Russian internet company Yandex in 2024," retaining Yandex's international assets under founder Arkady Volozh after Yandex N.V. sold its Russian operations for RUB 475bn (~$5.2bn). Tavily states its API, data policies, and zero-data-retention commitments are unchanged. Yandex-heritage ownership could improve Russian coverage over time but also warrants monitoring of terms and any change of legal footing.

---

## 4. Terms-of-service findings for commercial publication

- **Tavily** — Platform ToS + Acceptable Use Policy. Outputs "are derived from publicly available content … and may be generated or processed using AI technologies." Commercial use is permitted; downstream users must be bound by terms at least as restrictive. No display-only or no-derivative-works bar found. **Verdict: OK for commercial publishing.**
- **OpenRouter web plugin** — terms pass through to the selected engine. Exa/Parallel/Perplexity permit commercial use; Firecrawl is BYOK (accepting Firecrawl ToS auto-creates a linked account). **Verdict: OK, engine-dependent.**
- **Brave Search API** — **tiered and consequential.** The base "Data for Search" tier's Terms of Use *prohibit* using responses for AI inference and prohibit "storing, modifying, re-using, or re-selling" responses. AI inference requires the "Data for AI" tier; caching/storing raw API JSON requires "Data with Storage Rights." A Brave employee (Jonathan Sampson) clarified this split publicly on GitHub (17 Jan 2025). The current consolidated Search plan ($5/1k) is stated to include AI-inference rights and the LLM Context endpoint. The API ToS also bars creating derivative works of Search Results and storing/caching them beyond transient operation. **Verdict: usable only on the AI-inference tier; read the storage clause before caching.**
- **Serper.dev / SerpApi** — both resell live Google SERP data. SerpApi's "US Legal Shield" (Production plan and above, up to $2M coverage) covers *lawful collection* but explicitly "not … how that data is ultimately used." Google filed suit against SerpApi (19 Dec 2025). SerpApi is contesting: CEO Julien Khaleghy responded, "Google thinks it owns the internet… The problem is, no one owns the internet. And the law makes that clear," and SerpApi filed a motion to dismiss in February 2026 (The Register, 21 Feb 2026). **Verdict: legal exposure for downstream commercial use sits with you; Google's own ToS creates residual, currently-litigated risk.**
- **Exa (direct)** — commercial use permitted; clean text returned. **Verdict: OK.**
- **Perplexity Sonar** — commercial use permitted; returns synthesized answers + citations. **Verdict: OK, but synthesis-first shape is a poorer fit than raw text.**
- **Yandex Search API** — governed by Russian law; the Yandex.XML / Search API terms let Yandex impose restrictions by location/language and reserve broad discretion. Commercial reuse of results as derived published content is not clearly granted. **Verdict: unresolved for a commercial Western publisher; compliance review required.**
- **SearXNG** — AGPL self-hosted; the project itself warns that public instances are rate-limited/blocked by upstream engines, and upstream engines' ToS still apply to scraped results. **Verdict: self-host shifts the compliance burden to you.**

---

## 5. Cost model

**Assumption:** 3 search-API calls per post (base). Sensitivity shown at 1 and 5. Costs are search-fees only unless noted; native/LLM token costs for OpenRouter and Perplexity are additional. All prices read 13 August 2026 from the sources in §2–§4.

Per-search unit prices used: Serper $0.30/1k; Yandex $4/1k (synchronous, USD, net of VAT); Brave $5/1k; OpenRouter Parallel-basic/Perplexity $5/1k, Exa-auto $7/1k; Exa-direct $7/1k; Tavily basic = 1 credit ($0.008 PAYG / $0.005 Growth), advanced = 2 credits; SerpApi ~$0.01/search; Perplexity Sonar $5–12/1k + tokens.

| Candidate | Cost/post @1 | Cost/post @3 (base) | Cost/post @5 | Cost / 1,000 posts @3 |
|---|---|---|---|---|
| Serper.dev | $0.0003 | $0.0009 | $0.0015 | **$0.90** |
| Yandex (sync, non-generative) | $0.004 | $0.012 | $0.020 | $12 |
| Brave Search | $0.005 | $0.015 | $0.025 | $15 |
| OpenRouter (Parallel basic / Perplexity) | $0.005 | $0.015 | $0.025 | $15 (+ LLM tokens) |
| OpenRouter (Exa auto) / Exa direct | $0.007 | $0.021 | $0.035 | $21 (+ LLM tokens for OR) |
| Tavily basic (PAYG $0.008/cr) | $0.008 | $0.024 | $0.040 | $24 |
| SerpApi (Developer ~$0.01/search) | $0.010 | $0.030 | $0.050 | $30 |
| Tavily advanced (Growth $0.005/cr) | $0.010 | $0.030 | $0.050 | $30 |
| Tavily advanced (PAYG $0.008/cr) | $0.016 | $0.048 | $0.080 | $48 |
| Perplexity Sonar | $0.005+ | $0.015+ | $0.025+ | $15+ tokens |
| Yandex (generative response) | $0.042 | $0.125 | $0.208 | $125 |
| SearXNG (self-host) | — | — | — | ~flat server cost (small VPS), 0 marginal |

**Derivations:** Tavily advanced on Growth = 2 credits × $0.005 = $0.01/search × 3 = $0.03/post → $30/1k. Tavily basic PAYG = 1 credit × $0.008 = $0.008/search × 3 = $0.024/post. Yandex sync = $4/1k × 3 = $0.012/post. OpenRouter Exa auto = $0.007/request × 3 (plus prompt-token cost for the injected results). SearXNG has no per-call fee; its cost is a fixed server plus operational time.

**Reading:** at 3 searches/post, the entire field except Tavily-advanced-PAYG and Yandex-generative sits between $0.90 and $30 per 1,000 posts — **search cost is not the deciding factor at Telegram-channel volumes.** Even Tavily advanced on the Growth plan ($30/1k posts) is trivial next to the model-inference cost of four prompts per post. **Optimize for Russian quality and output shape, not search unit price.**

---

## 6. Unverified claims and evidence gaps

- **No independent Russian-media quality benchmark** exists for Tavily, Exa, Brave, or Serper. All Russian-quality rankings above (beyond documented issues) are structural inference. **This is the biggest gap and must be closed by a pilot.**
- **Tavily Russian recall** — only indirect evidence (Korean truncation, issue #29). Its actual Cyrillic behavior is unverified.
- **OpenRouter per-request search attribution** — OpenRouter returns server-tool usage counts (number of web searches) and bills search to the same key; whether per-search cost is itemized per-request in the activity export to the granularity needed for per-workspace reconciliation is not fully verified from public docs.
- **Yandex non-resident access from your specific jurisdiction** — official docs (updated 7 May 2026) confirm non-residents can register and pay in USD via the Dubai entity (Direct Cursus Technology L.L.C.) or the Serbia entity (Iron Hive doo Beograd), at ~$4/1k synchronous requests. But sign-ups are blocked from unspecified "certain countries," non-resident activation requires manual document approval (up to 3 business days), and account creation may hit Russian/CIS phone-verification friction. Whether *your* jurisdiction is permitted is unverified without an actual registration attempt. Sanctions/export-control due diligence is your responsibility given the Yandex-heritage counterparties.
- **Brave "Data for AI" current terms** — the AI-inference/storage split is documented via a Jan 2025 employee clarification and blog posts; the exact current contractual language for the consolidated Search plan should be confirmed in-dashboard before relying on it.
- **Serper commercial-reuse posture post-lawsuit** — Serper (a distinct company from SerpApi) has not published a clear commercial-reuse position; exposure is inferred from its Google-SERP-reselling model and the parallel SerpApi litigation.
- **Exact npm publish dates** — `@langchain/tavily` v1.2.0 (~8 months old as of read date) and `@langchain/exa` v1.0.2 (~2 months) per libraries.io/npm; exact dates not pinned.

---

## 7. What would change the recommendation

1. **Pilot Russian recall (do this first).** Run 30–50 representative Russian queries through Tavily (`country: russia`, advanced) and, in parallel, Serper (`gl=ru`, `hl=ru`) and OpenRouter with `engine: parallel`. Score top-5 Russian-media relevance and whether returned text is usable by all four prompts. **Threshold:** if Tavily's usable-Russian-media recall is ≥ ~80% of Serper/Google's, keep Tavily primary. If it is materially worse (say < 60%), demote Tavily and promote a Google-SERP backend (Serper) paired with Tavily Extract for page text.
2. **If a compliance review clears Yandex** (commercial reuse permitted, your jurisdiction can register and pay in USD, sanctions/export exposure acceptable to counsel), Yandex becomes the primary on the Russian axis — it is the strongest for Russian media and, at ~$12/1k posts, competitive on cost.
3. **If output-shape needs relax** (you accept links+snippets plus a separate scrape step), Serper's cost advantage ($0.90/1k posts) and Google-grade Russian recall make it the primary and Tavily the extractor.
4. **If minimizing vendors dominates** (the "second key/bill/config" pain outweighs quality tuning), promote the OpenRouter plugin to primary with `engine: parallel`/`perplexity` and drop Tavily — accepting weaker Russian recall for zero added integration surface.
5. **If Tavily's post-acquisition terms change** under Nebius in a way that restricts commercial reuse or alters Russian coverage/legal footing, re-open the whole decision.
6. **Reliability trigger:** if scheduled runs hit rate limits or latency spikes on the primary, the fallback (OpenRouter, no new key) absorbs traffic immediately; escalate to a dedicated backend only if quality — not availability — is the failure mode.

---

### Bottom line
Keep **Tavily** as primary for its unique combination of one-call cleaned-text output, commercial-friendly terms, and zero added integration cost; keep **OpenRouter's web plugin (Parallel/Perplexity engine)** as the zero-new-vendor fallback. Both choices are provisional on one thing you can settle cheaply and quickly: a **Russian-query recall pilot**, because the entire published-benchmark literature is English-only and the deciding axis for this product is precisely the one no vendor has measured in Russian.