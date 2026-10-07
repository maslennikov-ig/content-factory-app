# Reader v9: structural proof limits and candidate entity support

Beads: `content-factory-next-0qgn.10`; original acceptance and owner remain.
C24 passed release checks, but three original fresh searches returned empty
reviews. Telegram and RATE rejected `compile_wire_v8/wire_schema` without an
issue code; the exact raw output is unknown. The two possible nondiagnostic
branches are duplicate source groups and aggregate proof limits. V8's provider
schema permits four references and ten dates across two groups although the
compiler permits only two and five. 1C rejected
`validate_api_v1/v1_entity_supported_claim/entity_name_missing`. B1's fictional
grounded adaptation passed. Four actions and billing records are retained;
the six owned access rows were retired, then native rollback restored C22.

## Chosen representation

Introduce v9 and a distinct cache identity; preserve every older producer,
compiler, and the v1 validator. A claim has `refs` (one or two objects with
required `source` and numeric local `ref`) and `dates` (up to five objects
with required `kind`, `via` (an index into this claim's refs), and numeric
local `ref`). The date source is the selected claim reference's source, so
an uncited source is unrepresentable; an out-of-range `via` still rejects. Both totals are
structural provider constraints. Multiple references from the same source
are valid. No grouping, deduplication, truncation, inferred date, or moved
reference is needed. Source-specific table membership remains authoritative.
Unknown sources, foreign dates, malformed indices and stale bindings reject.

Entities select the exact existing numeric query range and a source or null.
Their `mode` is `claim_candidate`, `contextual_mention`,
`not_observed_in_presented_evidence`, or `unknown_due_to_bounds`.
`claim_candidate` requests qualification; it does not assert support. A
containing exact unique source anchor is mandatory for either present mode.
Absence/unknown requires null; the existing bounded-absence rule still applies.

The decoder initially represents each candidate as a proved contextual mention.
Run unchanged v1 validation to qualify claims, including date filtering.
Only an eligible claim containing the exact entity name and citing the same
source qualifies a candidate as `supported_claim`. Otherwise it stays a
contextual mention with the existing explicit uncertainty sentence. Any unqualified candidate also
changes otherwise-supported coverage to partial; explicit contextual mode
does not request claim qualification. Original provided/filtered disposition
counts are retained by passing the original claims into the final validation. Explicit
context mode remains context even when a matching claim exists. Run unchanged
v1 validation on the derived classifications to render the final answer.
This is a deliberate new wire contract, not a repair or replay of old output.
Invalid name/source proof, dates, or claims still reject; classification does
not add names, claims, dates, sources, or financial attribution.

Every legacy-valid supported or context classification has a corresponding
mode. Date-filtered candidates cannot support a requested-date claim. The
two deterministic validation passes buy no extra model call. Source membership
alone does not establish same-event meaning; actual usefulness still requires
root semantic acceptance of the fresh live results.

## Invariants and proof

Retain complete source/query/date catalogues, view <=21000 bytes, actual
serialized input <=25000 bytes, fixed rules/schema <=4000 bytes, query <=5000
UTF16 and <=384 parts, output limits, maxTokens1200, original SDK/caller
deadlines/cancellation/accounting, and one model invocation with no paid retry.
Bounds-only v5 selection remains before invocation. No quality fallback.
Every new rejection reports an allowlisted issue or grounding predicate.

First reproduce the provider/compiler aggregate mismatch offline, explicitly
without asserting the unobserved C24 wire. Then test valid same/two-source
proofs, structural totals, foreign/unknown references, clone/stale binding,
candidate support after date filtering, context-only and bounded absence,
and unchanged legacy refusals. Use the actual installed SDK transport and all
retained complete envelopes in three languages. Any budget failure is NO_GO.
Run affected checks/types, independent review, original release acceptance,
then otherwise-required fresh original live QA once. Old actions stay immutable.

Native all8/15 actions/39 operations, HOT31>=1800s/strict<60%, and external
owner defers remain pending; this work alone cannot complete the epic.
