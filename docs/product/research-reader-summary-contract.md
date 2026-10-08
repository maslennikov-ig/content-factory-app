# Search reader: useful answer, sources and gaps

This bounded contract implements `content-factory-next-0qgn.10.1` and `.10.2`.
The owner selected free translation and natural inflection, readable useful
text, low cognitive load and human final review on 8 October 2026. The original
`.10` acceptance criteria and historical failures remain unchanged in Beads.

## Active path

An opted-in reader search without caller-supplied queries or discovery uses
`WebResearchService.reviewReaderSources` and
`content-intelligence/research/reader-summary.ts`. The model returns:

```json
{
  "answer": "A coherent answer in the requested language.",
  "references": [{ "id": "S1", "relevance": "relevant" }],
  "gaps": ["A material missing detail, conflict or uncertainty."]
}
```

`references` assesses the presented source excerpts; relevance is one of
`relevant`, `irrelevant` or `insufficient_context`. The model must assess the
actual article context, not keyword overlap, menus, related headlines or ads.
An unfamiliar domain or a PDF is not intrinsically ineligible.

The answer may freely translate or paraphrase source prose. Preserve material
names, numbers, units, dates, attribution and meaning. A natural case change
such as `Банка России` to `Банк России`, or the useful source term `erid` absent
from the question, does not invalidate the answer. There are no entity/query
tables, character arithmetic, exact coverage substrings or per-clause formal
certificates in the generation contract.

## Dates, missing evidence and acceptance

An explicit civil date means facts in force at that date. A later publication
may describe an earlier event. Publication date alone neither proves nor
disqualifies applicability. The single synthesis must distinguish decision
date, effective date and forecast timing; a later forecast must not be
presented as an earlier expectation. Bank or forecaster attribution requires
the relevant article evidence, not a related headline. Unknown dates,
unavailable prices, conflicting material and incomplete coverage are concrete
gaps in the same answer, not claims of a complete result.

Code binds references only to the immutable presented source IDs and preserves
their URL and excerpt provenance. An invalid auxiliary reference or gap does
not erase useful answer prose: it produces a visible limitation and a partial
assessment. A broken reference does not become a takeable source fact. Repeated
or conflicting verdicts cannot qualify that source. Legacy entity and coverage
fields are not consumed by the new reader.

Simple conservative presence checks flag new complete civil dates or numbers
absent from relevant excerpts. A requested date may frame the question; it is
not evidence of an event. If dated applicability has no complete date in the
source excerpts, it remains uncertain. These cases preserve prose with an
explicit limitation, return no takeable facts and cannot report `supported`.
Useful partial material remains visible for the person's review.

These checks do not prove event meaning, forecast attribution or numerical
entailment. A reused number or date can still describe the wrong event, and
not every natural date format is recognized. Quality acceptance requires the
fresh root-owned model/search review; a local fixture or SDK interception is
not that acceptance. The product review asks whether the answer is useful,
coherent and readable, with no material distortion and honest gaps.

Original `.10` requirements remain:

1. The requested date constrains supported facts before summary and citations,
   including retrospective evidence; unknown dates remain explicit.
2. The recorded unrelated/garbled 1C results cannot be accepted relevant facts;
   useful retrieval needs its own qualification.
3. Observed facts and forecasts stay distinct; bank attribution is conditional
   on applicable source evidence.
4. Affected tests, exact release evidence and the required new owned search
   run establish acceptance. Historical outputs and ledgers are retained and
   never replayed.

## Compatibility and limits

The current source windows, source/access/organization isolation, usage ledger,
router, primary/fallback retrieval, cancellation, input cap of 25,000 serialized
bytes and synthesis cap of 1,200 tokens remain. There is one synthesis
invocation, with no additional model reviewer and no internal retry following
a reader failure. A new outer request may retry an unavailable result. The
new `reader-summary/v1` cache identity separates this contract from earlier
reader results, consumer searches and other organizations.

The authenticated V1 `ReaderAssessment` response shape is retained. `claims`
and `entities` are empty because the new answer does not manufacture old
clause certificates. Status, evidence, source relevance, bounds and a general
coverage status remain; readable limitations are part of `summary`.
Unrelated consumer/discovery paths retain their existing behavior. Legacy
V1/V5/V6 modules and pure wire/validator tests remain for compatibility;
removing them requires a separately selected caller/cache audit.

The public fixture `reader-summary-retained-public.json` contains selected
public passages and answer prose from the retained Telegram/rate/1C control,
with original public titles and publication metadata. It is a local projection,
not historical wire, a replay, fresh retrieval or a new model response.
