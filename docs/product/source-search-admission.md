# Reader source admission

Scope: the recorded brief-search defects under `content-factory-next-fn33.132`
and the source relevance/fact-date contract under `content-factory-next-0qgn.10`.
The previous observations and acceptance history remain unchanged.
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
subjects retain the same advertising-prefilter bypass. A separate generic
reader review now judges every opted-in unsupplied non-discovery reader result;
caller-supplied fact-check queries retain their existing path.

Language alone is insufficient: automatic `AgentGraphService.searchForMaterial`
and `IntakeService.researchForIntake` pass it but discard the search summary.
Root corrected the initially delegated language-only assumption after this
caller audit. The opt-in is part of cache identity, so consumer and reader
results cannot reuse each other's admitted facts or empty/nonempty summaries.

Every usable candidate is recorded in `sources` using the existing URL,
provider, date, title and score rules before the gate runs. The prefilter keeps eligible cleaned text and exact URL identity. The reader
review below exposes only its presented bounded prefix, with clipping and
digests recorded; it never rewrites a URL to make it fit. Rejected excerpts are absent from
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

The advertising prefilter performs no model judgment, search retry or backfill. It changes no
query anchors/count, provider routing, date window, source cap or tariff.
It may sacrifice recall; it does not prove that an article contains an exact
2026 legal change or that a future live search finds sufficient evidence.

## Combined source review for readers

An unsupplied request with strict `readerResponse === true`, an explicit `ru` or
`en` language, outside discovery receives at most one combined source
review/summary call when usable context can be packed. This replaces that
reader's previous summary call, including results-only Exa output. A complete
same-language provider answer now also buys this accounted call. Provider
answers are excluded from review evidence; only cleaned source context is used.
Supplied queries, discovery, absent/false opt-in and absent language retain
their previous path. No usable packed context means no review call, an empty
reader summary and no takeable reader facts.

The model judges article relevance against the complete bounded subject, with
source verdicts, claims, question coverage and conditional-name coverage. No new
topic, domain, provider, PDF or keyword allowlist is added. The server validates
strict output shape, presented-source membership and exact UTF-16 evidence/date
spans. Rejected or unpresented contexts cannot become cards.
Each date reference must contain the complete parsed date within its original
span; adjacent characters are checked only for token boundaries and cannot
supply a missing digit. Unsupported ordinal date requests fail closed instead
of entering the undated path.
General explanatory references need relevant verdicts and a usable reviewed
summary; dated factual references need at least one eligible claim. Candidate provenance remains in
service `sources`, while the controller's `results` come only from reviewed
`facts`.

The authenticated response adds `readerAssessment`: status, requested date,
bounds, presented evidence/digests, source verdicts, validated claims and
question/name coverage. These are source-grounded judgments, not independent
verification. Presentation records can include rejected candidate context;
only `results` are takeable evidence. Names absent from clipped or omitted
context are `unknown_due_to_bounds`, never absent from the whole source/web.
An over-500-character URL is omitted whole, preserving all remaining provider
URL joins. Up to eight sources have at most 3000 UTF-16 context units each.
The complete subject is retained up to its existing 5000-unit bound. Actual
serialized evidence is at most 21,000 UTF-8 bytes and the complete application
model input (serialized HumanMessage plus structured schema, rules and language)
is at most 25,000 bytes. Escaping and multibyte text count toward both caps.
Omitted/clipped context is explicit; no source outside the ceiling is shown as
accepted evidence. See [the summary contract](search-summary-contract.md) for
date rules, errors and accounting.

Review transport, parsing or validation failure returns an empty summary,
zero takeable facts and `review_unavailable`. A valid review without an eligible
claim returns `insufficient_evidence`. Neither falls back to an unreviewed
provider answer nor enters provider fallback/search retry. A scoped
`review_unavailable` response is not cached. A later explicit outer request can
run its one normal review; there is no automatic retry within the failed
request. Valid and insufficient-evidence reader results and all non-reader
results keep their existing 30-minute TTL and `fromCache` behavior. Existing provider
fallbacks and credential-ledger attribution run before this step and remain
unchanged. The output ceiling stays 1200 tokens; malformed/truncated structured
output is not repaired with another model call.

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

## Reader admission diagnostics

Only strict `options.readerResponse === true` adds optional
`admissionDiagnostics` to the service result and authenticated source-search
HTTP response. No DTO controls this marker. Absent/false and ordinary discovery
calls preserve their previous result shape. A historical cache result without
this property keeps it absent. Reader and consumer cache identities remain
separate; a cached reader response carries its original traversal snapshot,
not evidence of a new provider request.

The object contains numbers plus `needsAdvertisingContext`, never source text,
URLs, titles, prompts, tenant/person identifiers or credentials. The controller
projects an explicit field allowlist. Every count is a finite integer in
0–1,000,000; larger counts saturate, nonfinite values become zero. Saturation
changes observation only, never source/fact admission, caps or traversal.
The counters themselves add no calls, retries or admission changes. The
combined reader contract above adds its declared accounted bypass call and a
versioned reader cache identity; cached results keep the original assessment.

`provider.rowsVisited` counts rows actually entered in each answered provider's
admission loop. Its decision counters are `invalidUrl`, `duplicateWithFact`,
`sourceCapStops`, `noUsableExcerpt`, `contentExhausted`,
`advertisingContextRejected` and `truncationEmpty`. A cap stop counts the
encountered stop, not unseen rows after the break. If an excerpt is absent and
the content budget is also exhausted, the existing first check records
`noUsableExcerpt`; these are traversal decisions, not independent tests of
every upstream row.

The separate `keyless` counters describe the existing encyclopedic lane.
`urlRowsChecked` counts its initial URL-filter traversal; `rowsVisited` counts
the subsequent valid-URL admission-loop entries, including a cap-stop row.
`invalidUrl` records URL rejection, `existingSourceSkipped` records the lane's
existing source skip regardless of whether that source has a fact; the remaining
five rejection/stop counters have the same decision meanings as the provider
loop. Its visited population is already normalized by the lane, not a raw
upstream search population.

`candidateSourceCount` is final `sources.size`, including reserved/keyless
sources; `admittedFactCount` is the final returned fact count after reader review
(or the existing `facts.size` outside its scope). Counts do not expose rejected
candidates for acceptance or relax eligibility. They can distinguish branches
of a future zero-fact response. The old saved fn33.132 response did not retain
these measurements, so this change does not determine its historical cause.
