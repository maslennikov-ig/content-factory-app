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

This conservative rule sacrifices recall: an actual decision with no certified
end or matching as-of statement may remain unknown. Retrospective current-rate
usefulness has not been proved by these offline guards. Contradictions remain
attributed, not resolved by invention. An exact requested name in related
headlines can only be a contextual mention, not a fabricated forecast. Absence
within clipped or omitted context is `unknown_due_to_bounds`; original spelling
and subject/source spans must match.

The full existing subject bound is 5000 UTF-16 units. At most eight sources have
up to 3000 context units each; URL/title/publication limits are 500/300/100.
Over-bound URLs are excluded whole. Packing shares available context fairly,
protects surrogate boundaries and records every presented excerpt's SHA-256,
original cleaned-excerpt digest, retained length, clipping and omission counts.
No unseen tail is admitted or shown in a card. Actual evidence JSON is at most
21,000 UTF-8 bytes; the complete serialized application HumanMessage/schema
input, including rules, language and escaping, is at most 25,000 bytes. The
fixed message/rules/schema allowance is at most 4000 bytes. Hidden provider
transport headers/tokens are outside this application-size measure. An input
that cannot fit whole subject/metadata returns `review_unavailable` before a
model call. Existing explicit evidence acceptance stores the chosen bounded
excerpt unchanged through its immutable tenant-scoped snapshot path.

Review transport/parse/quality failure is handled locally: empty summary,
zero takeable facts, `review_unavailable`, no unreviewed engine-answer fallback,
no second review, search retry, quality-triggered provider fallback or verifier.
A valid review with no eligible claims gives `insufficient_evidence`, preserving
candidate/provenance records. This prevents unsupported admission, not a
promise of useful retrieval. The three recorded search outputs remain immutable;
fresh semantic acceptance is root-owned and still pending.

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

Rollback is the local search-service/test diff; no schema, workflow or dependency
changes. Offline recorded-shape fixtures cover the reported forecast/current
example and Russian names, prompt grounding, one-call budgets and failure
behavior. They prove contracts, not live model faithfulness. The original real
search and semantic acceptance remain explicit until separately authorized and
performed.
