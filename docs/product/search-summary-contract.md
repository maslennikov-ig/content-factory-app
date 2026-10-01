# Search summary contract

Target for `content-factory-next-ec48.7`, within epic `content-factory-next-0qgn`.
Beads owns status and preserves the original observed examples and acceptance.

The reader receives one coherent summary, rather than consecutive provider
answers. Multiple distinct answers are merged and translated together in at
most one cheap `classify` role call inside the existing metered search operation.
The subject, separate answers and bounded accepted-source titles/excerpts/dates
are evidence, never instructions. Source excerpts take priority for original
names and factual numbers. Current dated facts and forecasts stay distinct;
an unresolved contradiction is disclosed rather than resolved by invention.

Summary synthesis does not mutate the source/fact arrays or their provenance.
The separate [reader source-admission contract](source-search-admission.md)
introduces an intentional fact eligibility subset for Russian advertising
labeling; all candidate sources remain recorded. Neither change alters search
provider, generated queries, window, tariff or quota.
It does not add a verifier/retry/model call after synthesis. Single answers
already in the requested language retain the no-rewrite path. Duplicate answers
do not justify synthesis. Caller-supplied queries used by fact review never buy
a summary translation or synthesis. Without an explicit reader language, a
single answer keeps existing behavior; a necessary merge uses the classified
subject language when it is supported (`ru` or `en`). Other classified languages
fall back to the language of the first provider answer.

An unsupplied response with the server-owned `readerResponse === true` opt-in,
an explicit `ru` or `en` language, no nonempty provider answer and citable facts
buys one existing cheap summary pass grounded in those facts, outside discovery.
Only the source-search controller sets this internal option, which defaults to
false. This covers Exa's results-only response and deliberately adds
one metered model call in that branch. Citable sources precede the prompt cap;
discovery-only candidates cannot displace every grounding excerpt. No facts,
supplied queries, discovery and automatic/intake/copilot calls skip this new
branch even when they pass a language. Reader and consumer cache identities
are distinct. The historical multi-answer merge and language-correction paths
retain their existing caller behavior. There is no search backfill, summary
retry or additional verifier.

On unavailable, empty or malformed synthesis, search still returns its sources
and facts. Multiple answers fall back to the first nonempty original answer,
not the contradictory concatenation. No fallback claims that the underlying
sources are mutually consistent or verified.
With no provider answer, this same fallback is an empty summary while retaining
the admitted facts and all candidate sources.

Rollback is the local search-service/test diff; no schema, workflow or dependency
changes. Offline recorded-shape fixtures cover the reported forecast/current
example and Russian names, prompt grounding, one-call budgets and failure
behavior. They prove contracts, not live model faithfulness. The original real
search and semantic acceptance remain explicit until separately authorized and
performed.
