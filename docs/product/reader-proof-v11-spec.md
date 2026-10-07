# Reader v11 literal coverage references

Owner: Beads `content-factory-next-0qgn.10`. C26 actual Telegram, 1C and
rate searches returned empty results after `v1_coverage_subject`. The rejected
raw question strings were not retained and remain unknown. Source confirms
that coverage questions remain free-form through v10, while unchanged v1
requires a literal contiguous substring of the exact input subject.

Replace only producer coverage `question` with integer `ref`, in a new v11
wire and cache namespace. Each integer denotes one nonempty UTF-16 substring
of the exact subject, at most 500 code units. Enumerate starts in increasing
order and lengths 1..min(500,N-start). Offset(start) is the sum of preceding
row lengths; ref=offset(start)+length-1. Every in-range ID decodes to a
legacy-valid question. Preserve repeated occurrences, whitespace, punctuation,
surrogate boundaries, row order, duplicate rows and all three statuses.
The full subject has ref=N-1 when N<=500; this is a convenient available
choice, not a restriction to that question.

Present the lossless v10 query parts and the coding convention; packing
separators never count as subject characters. Bind v11 to its exact trusted
v10 input and query. Compile the reference with String.slice, then pass
through unchanged v10/v9/v5/v4/v1 validators. Preserve foreign/cloned input,
binding, compiled identity and digest guards. The unchanged v1 substring
predicate remains the final check. Preserve every legacy-valid coverage
string; do not normalize, trim, deduplicate, whitelist or repair rejected
model output.

The scoped reader cache hashes the complete exact UTF-16 subject before
lookup. Leading/trailing whitespace and characters after the classifier
window must not collide with a different question. Identical queries still
reuse results; existing consumer/discovery cache behavior stays unchanged.

Keep all source/query/date/entity catalogues and budgets: view21000,
serialized input25000, fixed rules/schema4000, query5000 UTF-16 units,
max1200 output tokens, one invocation, no quality retry. No account, deadline,
fallback, source admission, date interpretation or semantic acceptance change.
The existing producer fallback remains a pre-invocation size-only decision.

Prove round-trip completeness and invalid-ID rejection, immutable provenance,
all legacy bodies unchanged, complete 54 retained envelopes (18 searches
times 3 languages), strict schemas and actual installed SDK serialization.
Then perform original exact-source release and fresh original MAIN. Local
encoding proof does not establish model usefulness. On semantic NO_GO retire
only owned test access and return the prior application. Original all8,
native15, 39 assertions, HOT strict memory and all EPIC criteria remain intact.
