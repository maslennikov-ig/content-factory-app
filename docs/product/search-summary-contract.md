# Search summary contract

Target for `content-factory-next-ec48.7`, within epic `content-factory-next-0qgn`.
Beads owns status and preserves the original observed examples and acceptance.

## Opted-in source readers

The source-search controller alone sets the internal `readerResponse === true`.

This user-triggered search for supports appoints the existing `research` task
on the server, without an explicit level. Automatic drafting retains the
unnamed `facts` default. The existing router chooses the engine and credential
source using available keys and operator policies; the DTO cannot appoint a
task, provider or level. Query generation, date and grounding rules, bounds
and failure behavior remain unchanged. Routing does not guarantee the
usefulness of a future result.

An unsupplied request with an explicit `ru` or `en` reader language, outside
discovery, receives at most one combined source review/synthesis invocation.
It replaces the old reader-summary call; a complete same-language engine answer
no longer bypasses it. That bypass now deliberately adds one accounted call.
Provider answers are not evidence and are absent from this prompt. The original
full subject and bounded cleaned source context are untrusted evidence, never
instructions. The generic relevance gate adds no topic/provider/domain hacks.

Only reviewed eligible references become reader facts/cards. The service still
retains candidate source provenance. The authenticated response adds bounded
`readerAssessment` status, source verdicts, coverage and exact presented-context
provenance; it does not certify a whole page or independently verify the world.
The [source-admission contract](source-search-admission.md) defines this subset
and preserves the prior advertising-context prefilter. Neither changes query
generation, search provider options, publication metadata, windows or quotas.

An explicit requested civil date governs fact applicability, not article
publication. Later retrospective articles remain eligible candidates. An
observed dated claim needs source-grounded `as_of` equal to the requested date,
or grounded `effective_from` and `effective_until` covering it. Missing ends
are not inferred from publication, the subject or current knowledge. Supported RU/EN civil-date constraints include `на` plus a date, `as at`, `as of`
and `on`; normalization inspects the full bounded subject. Numeric and named
calendar years have full token boundaries: a five-digit year cannot certify its
four-digit prefix, including in source evidence. A date reference must contain
the whole parsed date inside its original span and pass the adjacent token
boundary check; neighboring characters cannot repair a clipped date reference.
Date-looking unsupported forms, including RU/EN ordinal dates, or
ambiguous clauses, time/zone precision and invalid years fail before the review
call instead of silently becoming an undated request. No time or zone is stripped
to manufacture a day-only constraint. Month-name/locale forms that cannot be
normalized safely stay unavailable; this also sacrifices recall. Forecasts
need grounded announcement and target dates; announcement must be no later
than the requested date. Announcement and target remain distinct from current
observed facts. Invalid/reversed dates or ungrounded spans fail validation;
unknown applicability cannot become a current dated claim/card. Mixed articles
are filtered by claim, without rejecting the entire page for its later date.

A uniquely stated RU/EN `from … to …` interval in claim prose must agree with
its `effective_from`/`effective_until` annotations. A complete stated boundary
can expose a contradiction; an omitted/shared year stays unknown. After the
original date/source/token and interval-order checks, only contradicted
annotations are omitted, without supplying replacement dates. Undated output
may retain the cited claim with partial coverage; dated output still needs the
original grounded applicability proof and cannot bypass a stated boundary
using another event's `as_of` quote. Concise claims do not have to repeat every
separately cited date. This is a narrow explicit-interval check, not general
verification of date-kind semantics or resolution of conflicting sources.

This conservative rule sacrifices recall: an actual decision with no certified
end or matching as-of statement may remain unknown. Retrospective current-rate
usefulness has not been proved by these offline guards. Contradictions remain
attributed, not resolved by invention. An exact requested name in related
headlines can only be a contextual mention, not a fabricated forecast. Absence
within clipped or omitted context is `unknown_due_to_bounds`; original spelling
and subject/source spans must match.
Contextual entity qualifications mention a requested date only when there is
an explicit requested civil date. Undated qualifications remain neutral and
do not promote a contextual mention into a supported claim.

The full existing subject bound is 5000 UTF-16 units. At most eight sources have
up to 3000 context units each; URL/title/publication limits are 500/300/100.
Over-bound URLs are excluded whole. Packing shares available context fairly,
protects surrogate boundaries and records every presented excerpt's SHA-256,
original cleaned-excerpt digest, retained length, clipping and omission counts.
For long admitted text, bounded contiguous paragraph windows are ranked by
the actual subject's lexical terms and complete requested-date evidence before
catalogue construction. Selection scans at most 12,000 UTF-16 units per source,
uses at most 128 candidate windows and 64 distinct subject terms, and keeps the
original prefix on ties or absent matching evidence. It has no domain/provider
preference, does not join distant paragraphs and supplies no additional fetch
or model invocation. A moved window cannot hide a trailing letter/year suffix
at its cut. Exact citation offsets remain relative to the selected excerpt;
clipped or omitted context still makes whole-source absence unknown. Window
ranking is a retrieval heuristic, not factual or temporal admission. No text
outside the selected excerpt is admitted or shown in a card. Actual evidence
JSON is at most 21,000 UTF-8 bytes; the complete serialized application HumanMessage/schema
input, including rules, language and escaping, is at most 25,000 bytes. The
fixed message/rules/schema allowance is at most 4000 bytes. Hidden provider
transport headers/tokens are outside this application-size measure. An input
that cannot fit whole subject/metadata returns `review_unavailable` before a
model call. Existing explicit evidence acceptance stores the chosen bounded
excerpt unchanged through its immutable tenant-scoped snapshot path.

The current source candidate's generation wire is `reader-source-review-wire/v8`. The
existing v5 producer is selected before invocation only when the complete v8
catalogue exceeds unchanged bounds. Integrity or date-catalogue failures do
not select a weaker producer. The choice adds no model call, and a v8 invocation
never accepts a legacy wire. The scoped cache discriminator is
`reader-source-review/v1:wire/v8`; tenant, route, task, language and TTL
boundaries remain intact. This is the source contract, not a claim of delivery
or fresh live usefulness. V7 release checks passed but all three original live
searches failed at reader invocation with an unobserved upstream rejection
reason. Production was rolled back to C22/v6, retaining both owner UI fixes.
Every prior result stays bound to its release.

Before the single review invocation, the server constructs at most 96 exact,
unique contiguous anchors from those same presented excerpts. All complete
civil dates have anchors accepted by the original date/token guards, or
preparation becomes unavailable. UTF-16 cuts preserve code points and date
tokens. Certified date-compatible core anchors may cover repeated dates;
remaining date windows use a bounded suffix index and nearest different dates.
Only optional bridges may be pruned for fit. No chosen excerpt is truncated
and no date is silently omitted. Index work and retained strings are bounded.

Each claim supplies a bounded `proofs` array. A group contains required
`source`, numeric local `refs` and local `dates`. Reference0 and date0 refer only
to that source's existing private anchors; they cannot select a different
article's span. Up to two groups retain the original total two references
and five dates. Every schema object property is required; source IDs are
restricted to the actual catalogue and numeric indices have finite bounds.
When all sources lack dates, the shared schema permits only an empty date array.
The compiler rejects duplicate groups, dates absent from a source and indices
missing from a source's shorter table, and checks all
membership independently of the provider schema. Every otherwise-valid
multi-source legacy proof remains representable; references are never moved,
deduplicated or inferred. Provider rows encode `index:first:last[:dateIndex]`
and retain all source text parts and original span/date boundaries.

Entities select `[first,last]` numeric query-part indices and a declared source
or null. Query rows are `index:literal`, split at their first colon; their
ordered literals reconstruct the exact original query. The indices map to the
original trusted Q table. The server retains case, inflection, whitespace,
punctuation and Unicode, and selects the shortest existing unique source
anchor containing the literal name, with catalogue order breaking ties. A name
absent from that declared source fails. Unknown/reversed/noninteger ranges,
repeated names, spans over80 UTF-16 units and extra free names reject the review.
Absence/unknown statuses still require null; supported claims still name the
entity and cite the same source. Headlines alone remain context, not a dated
financial claim. No normalization or new source span is admitted.

A frozen request-owned catalogue retains the complete input digest and exposes
its128-bit binding. Preparation binds the full source catalogue, original Q
table and language. Full integrity, binding and membership are checked before
lookup. Stale bindings, free quotations, extra fields and invalid claims reject
the entire wire. Server lookup supplies the same private global K IDs to the
unchanged v5/v4/v1 compilers and date/provenance validators, including the
explicit-interval check. Legacy producers/parsers remain available. Preparation
and compilation expose only finite diagnostics, now including
`prepare_catalogue_v8` and `compile_wire_v8`, while retaining older stages;
no raw paths, IDs, bindings,
quotations or model text are exported. Nested proof-schema issues retain only
the existing finite refs/dates family and issue code.

Up to384 query parts and the actual generation schema count toward unchanged
21,000/25,000-byte limits; fixed rules/schema remain within4,000 bytes. A
bounds-only v5 choice preserves the full5,000-unit query before one invocation.
See [source-bound proofs](reader-proof-binding-spec.md) for the current contract
and [literal subject references](reader-subject-anchors-spec.md) for v6 history.
The historical TG/RATE raw Q/K pairs were not retained, so these new guards
cannot identify their particular failure or prove live usefulness.

Offline retained TG/1C/RATE checks measure the actual current service schema,
rules, HumanMessage serializer and validators against the exact captured reader
boundary evidence through synthetic test ports. Provider tails beyond that
captured boundary are unavailable. These checks prove input fit and retained
valid-claim projection; TG's failed raw wire remains absent and its historical
match class remains unknown. They prove neither generation quality nor live
search usefulness, and add no model or provider calls.

Review transport/parse/quality failure is handled locally: empty summary,
zero takeable facts, `review_unavailable`, no unreviewed engine-answer fallback,
no second review, search retry, quality-triggered provider fallback or verifier.
A valid review with no eligible claims gives `insufficient_evidence`, preserving
candidate/provenance records. This prevents unsupported admission, not a
promise of useful retrieval. The three recorded search outputs remain immutable;
fresh semantic acceptance is root-owned and still pending.

Valid reviewed output may add a bounded `claimDisposition` observation:
`empty_claims`, `all_claims_temporally_filtered`,
`some_claims_temporally_filtered` or `claims_retained`, plus provided/accepted/
temporally-filtered claim counts (0–8) and omitted contradictory annotation
count (0–40). It contains no raw model output, source/body text or identifiers.
Strict projection rejects extra fields, unknown enums, inconsistent counts and
accessor properties. It is distinct from fatal `failureDiagnostic`; historical
assessments may omit it and cannot identify a past empty-result cause. The
retained C18 RATE suffix and raw wire remain unknown; synthetic window and
temporal regressions do not prove that its live usefulness is repaired.

For an exact-quote compiler rejection, the optional public failure diagnostic
adds only `quoteMatch: absent | repeated`. `absent` means no exact substring
match in the referenced presented excerpt; `repeated` means a second match,
including an overlapping occurrence. The original `quote_unique_match`
predicate and failed-review outcome remain unchanged. Only the first rejection
is observed, and a diagnostic observer throwing cannot change that outcome.
The strict public projection permits this field only with that predicate,
compiler stage and `validation_rejected`; it exports no quotation, raw model
output, reference/source ID or private identifier. Historical diagnostics may
omit the field, so absence does not determine a past failure's cause. This
observation adds no model/provider call or retry and changes no quote, source,
date, provenance or v1 eligibility rule.

For a grounded-date or supported-entity rejection, the optional public diagnostic
adds one allowlisted `groundingReason`. Dates distinguish `date_missing`,
`date_ambiguous`, `date_source_mismatch` and `date_token_boundary`; entities
distinguish `entity_ref_missing`, `entity_claim_missing`, `entity_name_missing`
and `entity_source_mismatch`. Projection permits date reasons only at the v4/v5/v6
compiler's `date_quote_grounding`, and entity reasons only at v1 validation's
`v1_entity_supported_claim`, with `validation_rejected`. No names, dates,
source IDs, quotations or raw rejected values enter this field. The first
rejection and original eligibility decisions stay unchanged; missing historical
reasons do not identify a past cause.

The v5/v6 rules state the same-source date/entity conditions explicitly. Provider
excerpt cleanup removes a numeric list marker only when its separator is followed
by whitespace, preserving dotted dates such as `01.10.2026` and decimal rate
prefixes such as `14.00%`. Ordinary numbered lists and nested bullet/table
markers still clean normally. Local regressions prove this preservation; the
specific causal link to historical live refusals remains unknown.

Both query classification and combined review use the existing `classify` role;
there is no new role or operation. The review output remains capped at 1200
tokens. The successful configured no-fallback QA path has at most two direct
model calls and its existing one `web_research` admission. This is not a global
universal count: pre-existing provider failures/fallbacks can add prior query
classifier attempts, own-to-system fallback can retain distinct credential
ledger rows, and a paid OpenRouter search plugin keeps its own role/cost. All
those existing paths, errors and attribution remain intact. Review attempts and
failures are metered through the same admitted usage ledger; they do not reopen
an operation. A versioned reader cache keeps its original assessment and cannot
reuse an automatic consumer's result. Scoped `review_unavailable` results are
excluded from cache writes, allowing recovery only through a new explicit outer
request with its normal accounted search/review. There is no automatic retry.
Valid or insufficient-evidence reader entries and non-reader fallbacks retain
their existing 30-minute TTL, hit behavior and `fromCache` marker.

Scoped reader research has one absolute 170-second internal deadline, measured
from entry to `research`, within the existing 180-second caller envelope. Query
classification and source review share its SDK request cancellation signal;
model fallback does not restart the deadline. The signal is carried in SDK
request options rather than Runnable cancellation, so the service awaits the
actual transport and its usage recording before the original single
finalization. Cancellation marks the admitted operation failed while retaining
already observed usage and possibly-billed attempts; missing cost is not zero.
It returns `review_unavailable`, an empty summary and no takeable facts, and
cannot cache a success or start another model/search stage.

Search tools retain their existing bounded primary/fallback waits. Since their
fetch cannot be canceled through the current adapter, scoped dispatch requires
room for the original 12 + 8 second search window; each actual provider dispatch
also checks its remaining bounded wait after admission/client resolution. A
search window that no longer fits makes the reader unavailable without a new
provider request. These guards may stop useful work earlier than the deadline.
The keyless lane likewise requires its existing eight-second window before a
new lookup. General consumer/discovery timing and provider policies are
unchanged. The ten-second settlement margin is a budget, not proof of live
provider responsiveness or fresh search usefulness.

## Existing non-reader and supplied-query behavior

Automatic generation/intake/copilot, supplied fact-review queries, discovery
and requests without strict reader opt-in or explicit language keep their
previous paths. Multiple distinct provider answers can still merge/translate
in at most one existing cheap pass. Single same-language or duplicate answers
retain the no-rewrite path; supplied fact-review queries buy no summary pass.
Without explicit language, an existing necessary merge uses classified `ru` or
`en`, otherwise the first engine answer's language. This legacy path continues
to use separate provider answers plus bounded accepted-source metadata as
untrusted evidence. Its original-name/numerical grounding rules remain intact.

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

On unavailable, empty or malformed legacy non-reader synthesis, search still returns its sources
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
useful provider context/absence answers; the service retains its candidate provenance and assessment while other
consumers keep their established behavior. This
UI guard does not weaken source admission or turn candidate links into evidence.

Rollback is the local search-service/test diff; no database schema, workflow or
dependency changes. Offline recorded-shape fixtures cover the reported forecast/current
example and Russian names, prompt grounding, one-call budgets and failure
behavior. They prove contracts, not live model faithfulness. The original real
search and semantic acceptance remain explicit until separately authorized and
performed.
