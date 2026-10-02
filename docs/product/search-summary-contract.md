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

Language correction uses a bounded script heuristic, not a language detector.
It samples only the first existing `RESEARCH_SUMMARY_ANSWER_CHARS` (4000 UTF-16
code units), before trimming, script scans and word-array allocation; an opposite
language tail cannot vote or grow that allocation. The returned provider answer
and facts are not truncated. Sampling may miss a later language shift or abstain
on a whitespace-only prefix. This is the same prefix the existing cheap summary
prompt receives, with no new constant or call.
Single-script short prose keeps its correction/no-rewrite path, including the
historical non-Cyrillic fallback for other scripts; empty and purely numeric
answers do not justify a correction. For mixed Cyrillic/Latin prose,
words with at least two consecutive lowercase letters vote by script; uppercase
acronyms and single-letter names do not vote. A different reader script needs
at least three such words and at least twice the requested script's word count
to trigger the existing one cheap summary pass. Thus English paragraphs naming
`1С:Предприятие` are not treated as Russian, and Russian prose can retain English
technical names without buying a Russian rewrite. Balanced bilingual and short
ambiguous mixed answers keep the provider answer; they previously passed through
for Russian readers but could buy a correction for English readers. Proper-name
heavy or other-language text can still evade this heuristic. There is no second
correction, new verifier or guarantee of model translation quality.

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

The search panel shows summary prose only alongside a positive usable result
count after its existing adapter has removed rows without a URL or excerpt.
With zero usable results it hides both summary and summary heading, and says no
suitable source excerpts were found, suggesting a refined subject. This is an
evidence boundary, not a claim that the web contains no material. It can hide
useful provider context/absence answers; the service still returns the same
summary and candidate/admitted-source provenance for its other consumers. This
UI guard does not weaken source admission or turn candidate links into evidence.

Rollback is the local search-service/test diff; no schema, workflow or dependency
changes. Offline recorded-shape fixtures cover the reported forecast/current
example and Russian names, prompt grounding, one-call budgets and failure
behavior. They prove contracts, not live model faithfulness. The original real
search and semantic acceptance remain explicit until separately authorized and
performed.
