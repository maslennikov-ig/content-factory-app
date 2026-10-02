# Grounded expressive style in avatar proposals

V2 voice assistance reads each selected author sample once through the existing
map/reduce pipeline. It explains measured habits and can also describe expressive
habits directly demonstrated by a verbatim quote: humour, self-irony, imagery,
directness or the relationship with the reader. Qualitative observations use the
existing nullable `metric`; no new field or schema version is needed. Numeric
observations still use the existing metric enumeration.

Self-irony is evidence about the author making fun of their own mistake,
expectation or pretension. It is not inferred from a profession, a topic, a
numeric score or the presence of a joke directed at someone else. The prompt
asks for this distinction, without requiring humour in every author. Within the
existing six-observation limit, distinctive evidenced expressive habits receive
attention alongside useful measured habits.

The reduce prompt preserves expressive habits in TONE and the portrait when
observations support them; a recurring habit needs evidence from different
samples. TONE gives ordinary writing directions. Portrait and TONE prose omit
metric keys, corpus counts, percentages and reference identifiers; those belong
to the separate analysis and `observationRefs`. An unsupported portrait question
is omitted instead of producing an analyst's sentence about missing evidence.
The existing portrait bounds, quote grounding, reference checks, cliché filter,
refusal status, sample selection, provider routing and retry limits still apply.
Exported V1 map/reduce prompts keep their previous text.
The instructions grow, so token usage and the cost of an existing call can vary;
the normal usage ledger and budget apply, with no additional model stage or call.

Adaptation keeps sentences about the same thought in connected paragraphs, with
a blank line at a change of thought. An explicit paragraph or line-break pattern
in the resolved voice or the person's request takes precedence. There is no
general instruction to break every period into a new line. This changes only
prompt instructions, not generated-text postprocessing or workflow contracts.

Offline regression tests prove the actual prompts, nullable evidence wiring,
grounding refusals and the normal eight-map/one-reduce usage route with recorded
answers. They do not prove a model will identify self-irony correctly. Root's
public27 fictional run still records the defect: all 46 observations had metrics
(13 TONE, 7 WHO_SPEAKS, 26 SENTENCE_LENGTH), and the 643-character portrait omitted
self-irony. Semantic acceptance requires root's newly journaled paid run after
the corrected source is released, with separate checks for presence of grounded
humour, absence of analyst/meta prose and paragraph shape.

New V2 reduce proposals additionally guard a source-confirmed dangling TONE
quotation across the existing schema-valid 2–600 UTF-16-character range. After
schema parsing and quote admission, outside the paid repair loop, one
unmatched trailing `«` qualifies only when its text is a uniquely matching,
word-boundary-started literal
excerpt within referenced admitted TONE quotations, with remaining source
content. It may end inside a word or after a whole word; the latter requires
at least one remaining word of three letters, conservatively excluding
punctuation-only, short or numeric-only continuations. Repeated matching
positions or observations abstain, as do mid-word starts and a full quotation
with no remaining prose. The guard keeps only the exact preceding complete
sentence prefix outside quotations; it adds no continuation or punctuation.
Without a safe prefix it omits that field. The existing pre-fold pass remains;
a second idempotent pass checks the final V2 field after the unchanged duplicate
fold has united its references. Raw winner references are not assumed from a
stored proposal. Other fields, portrait, observations, quotations and reference
arrays remain intact. V1 and historical proposal reads are unchanged, as are
schema limits, prompts, transport, retry and billing.

Sentence-boundary inspection is conservative: quoted internal stops, short or
capitalized abbreviation candidates, known longer abbreviations, URL/decimal
stops and ambiguous mixed quote forms do not establish a retained boundary.
This may discard a usable line or abstain on other incomplete forms; it is a
bounded generation guard, not a grammar or universal quotation verifier. The
original upstream cutoff remains UNKNOWN. Offline exact neutral replay proves
retained text and unchanged call counts; root still owns a newly authorized
actual analysis after release, with no automatic paid replay or historic repair.

The exact neutral 599-character replay retains the existing conservative
92-character complete prefix and discards the remaining 507 characters. The
guard deliberately does not improve sentence selection or complete the quote.
This can omit useful preceding prose; the upstream origin and raw pre-fold
references remain UNKNOWN. Empty fields retain the existing unavailable outcome
without a new call, retry or historical rewrite.
