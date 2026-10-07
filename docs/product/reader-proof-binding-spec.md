# Source-bound reader proofs

Status: historical v8 producer contract. C24/v8 passed release gates, then
fresh original live searches rejected wire aggregate/group shape or entity
qualification and returned empty reviews. The raw rejected model wire was
not saved; the exact TG/RATE branch remains unknown. Native rollback restored
C22 with both owner UI fixes. Current source candidate is described in
[Reader v9](reader-proof-v9-spec.md); its release/live acceptance is pending.

Beads `content-factory-next-0qgn.10` retains the original acceptance and owner.
The C22 live checks returned empty Telegram and rate answers after rejecting
`entity_source_quote` and `date_source_mismatch`. The rejected raw Q/K pairs
were not recorded. Tests cover these failure classes, not invented historical
model outputs. The saved outputs and billing records stay unchanged.

## Versioned producer contract

Add wire v8 and a separate cache version. Keep v7/v6/v5/v4/v1 producers and
validators intact. A claim groups its proofs by declared source: each group
has one source ID, one or two numeric local references from that source, and
its numeric local date references. `claim.proofs` is a bounded array of
objects with required `source`, `refs` and `dates` fields. Reference0 and date0
are local to that source and resolve only to its existing K anchors.
A reference cannot select an anchor in another source. The generation schema
uses integer bounds equivalent to the finite contiguous local index sets,
reuses the proof shape, and
allows only actual source IDs. Every object property is required and extra
properties are forbidden, matching the provider's
[structured output contract](https://developers.openai.com/api/docs/guides/structured-outputs).
V7's dynamically named proof object violated that documented required-field
contract. A regression reproduces the discrepancy for one, three and five
sources; this does not identify the unobserved upstream response message.
The compiler rejects duplicate source groups and a local index
outside the declared source's shorter table. A source without date
anchors permits only an empty dates array. The compiler enforces this for
each source; when every source lacks dates, the generation schema also has
`dates.maxItems=0` with complete `items`. Source-specific membership remains
mandatory even when output did not follow the generation schema.

Flattening groups retains the existing overall limits of two claim references
and five date references. At most two distinct source groups are allowed.
Shared local-proof definitions keep the schema compact without discarding
per-source restrictions. Every otherwise-valid legacy multi-source proof
remains representable. No deduplication, inferred date, moved reference or
automatic correction occurs.

An entity selects `[first,last]` numeric query-part indices, status, and a
source ID or null. The indices map exactly to the original trusted Q table,
not to guessed UTF16 offsets. Unknown/reversed/overlong/noninteger ranges fail.
The server selects the shortest existing unique catalogue anchor containing
that exact literal name in the declared source, with catalogue order breaking
ties. This is the new producer contract, not a repair of an old model-written
K selection. Names absent from that source fail. No normalized/translated
name, new source span, headline-based financial support or cross-source proof
is admitted. Absence/unknown statuses still require null; supported claims
still require a claim using the name and citing that same source. The original
v5/v4/v1 compilers and validator remain the final authority.

The provider view encodes rows as `index:first:last[:dateIndex]` while retaining
all source text parts, inclusive ranges and date markers. Local indices map
one-to-one to the existing K IDs in the frozen server catalogue; model output
contains no global K ID. Every original anchor remains available. Query rows
are `index:literal` and concatenate to the exact original query. The compiler
uses the trusted catalogue and Q table, never a table returned by the model.
Preparation binds the complete view, source catalogue, Q table and language.

## Limits and execution

Keep view <=21,000 bytes, actual serialized HumanMessage plus generation
schema <=25,000 bytes, fixed rules/schema <=4,000 bytes, query <=5,000 UTF16
units and Q table <=384 parts. Keep one model invocation, maxTokens1200,
the original SDK/caller deadlines, cancellation, usage finalization, and no
paid fallback/retry. A bounds-only fallback is selected before invocation;
integrity failures never select a weaker producer.

1. Prove the two failure classes and original refusals with the real module.
2. Verify multi-source/date/entity cases and installed SDK schema transport.
3. Reconstruct all three retained C20 and C22 envelopes in three languages;
   require complete unchanged source/date catalogues and no fallback before
   integrating or publishing. Oversize is NO_GO, not permission to cut facts.
4. Integrate the versioned producer/cache and run affected checks and types.
5. Apply the repository's original release acceptance, then a fresh owned
   once-only live search fixture. Keep prior actions and failures intact.

This change does not establish native15/all8/HOT or complete the epic. Those
original conditions, the 36 records, seven criteria and owner defers remain.
