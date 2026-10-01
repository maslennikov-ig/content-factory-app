# Reader source admission

Scope: the two recorded 2026-10-01 brief-search defects under
`content-factory-next-fn33.132` and the existing search-summary contract.
Root accepted this bounded design under the owner's delegated engineering
decisions. Beads remains the status owner; this document is a behavior contract.

## Eligibility before factual use

A reader response requires the internal `options.readerResponse === true`
opt-in and an explicit `options.language`. The opt-in defaults to false and
is set only by `ContentSourceController.searchForEvidence`; no DTO or client
flag controls it. Only a Russian original subject naming advertising labeling,
without caller-supplied queries and outside `task=discovery`, receives the
advertising-context gate. Automatic, intake and copilot calls retain their
existing admission even when they pass a language. Other topics, English
subjects and fact-check queries retain their existing admission behavior.

Language alone is insufficient: automatic `AgentGraphService.searchForMaterial`
and `IntakeService.researchForIntake` pass it but discard the search summary.
Root corrected the initially delegated language-only assumption after this
caller audit. The opt-in is part of cache identity, so consumer and reader
results cannot reuse each other's admitted facts or empty/nonempty summaries.

Every usable candidate is recorded in `sources` using the existing URL,
provider, date, title and score rules before the gate runs. Eligible excerpts
keep their exact cleaned text and URL. Rejected excerpts are absent from
`facts`; their candidate source remains visible. This is an intentional fact
eligibility subset, not preservation of every previous fact.

Eligibility requires advertising-law article context: an informative title,
semantic URL path, or genuine explanatory main prose. A generic FAQ title can
pass through explanatory prose about advertising duties and regulatory data.
Commodity-labeling material, unrelated news lists and fishing material with
embedded promotional advertising copy do not become factual evidence merely
because that copy repeats ЕРИР, ОРД or ERID. Context inspection is bounded;
unknown context retains the source but does not invent a fact. Domains and
the five recorded URLs are fixtures, never production allowlists. Query
strings and fragments do not establish article identity.

The original-subject check reads at most the classifier's 5,000 characters and
requires the Russian advertising-labeling phrase. Identity reads at most a
500-character title and 1,500-character URL path, including a decoded Russian
or transliterated path. A title explicitly about commodity labeling, fishing
or a digest cannot qualify from embedded advertising copy. The prose fallback
reads at most 8,000 characters and 80 statements; a statement must have at least
120 characters, advertising context, a concrete duty and regulatory detail,
without a promotional promise such as «под ключ» or «без штрафов». These are
bounded heuristics, not a legal verifier or an article parser.

The gate performs no model judgment, search retry or backfill. It changes no
query anchors/count, provider routing, date window, source cap or tariff.
It may sacrifice recall; it does not prove that an article contains an exact
2026 legal change or that a future live search finds sufficient evidence.

## Source-only reader summaries

For an unsupplied, explicitly opted-in reader response in `ru` or `en`, outside
discovery, zero nonempty provider answers and at least one admitted citable fact
justify one existing cheap
`readerSummary` call. This covers Exa's results-only response. Its bounded
subject/source excerpts are untrusted data, and it runs under the existing
operation and model-key usage attribution. This deliberately adds one
accounted model call in this branch, not another search request.

No facts, supplied queries, discovery, absent/false reader opt-in and calls
without a reader language skip this new branch. Single answers already in the
requested language and duplicate-answer
fast paths stay intact. Errors, malformed output and empty summaries keep the
existing fallback: an empty summary when no provider answer exists, retaining
all sources and admitted facts. No retry manufactures an answer.

## Proof and rollback

Offline fixtures retain the public source results recorded on 2026-10-01,
without tenant, journal, credential or ledger identifiers. They exercise real
service admission and metering with fake provider/model transports. Coverage
includes generic FAQ recall, unrelated/ad-copy rejection, unchanged bypasses,
actual controller opt-in, unchanged automatic/intake calls with a language,
separate reader/consumer cache entries, Exa source-only synthesis and
Tavily-failure/Exa-success accounting.
They prove bounded data flow and budgets, not live model semantics or source
coverage. Root owns any subsequent live acceptance and deployment.

Rollback is the service/test/doc change. There is no schema, dependency,
workflow, production configuration or runtime resource change.
