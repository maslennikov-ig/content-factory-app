# Literal subject references in the search reader

The current C20 live rate query returned no useful answer. Its four presented
sources included the official rate table and decision; the paid call settled.
The recorded rejection is `compile_wire_v5/entity_subject_quote`. The exact
model wire was not persisted, so its particular invalid name is unknown.

The current compiler correctly rejects a missing, ambiguous or broken Unicode
subject quote. Free model-written names can nevertheless pass the generation
schema and then invalidate the entire review. Keep that compiler and all
source, date, entity-support, catalogue and billing checks.

Introduce a versioned producer format in which an entity selects a contiguous
range of server-issued subject-part IDs. The server renders the exact original
substring, including Russian inflection, case, punctuation and Unicode. No
translation, canonical-name substitution, normalization or repair is allowed.
The full request catalogue binds those IDs to the same query and sources.
Unknown IDs, reversed ranges, spans over 80 UTF-16 units, foreign tables and
ambiguous rendered names must fail closed. Existing v1/v4/v5 consumers and
historical results remain unchanged.

The provider view encodes each query part as `Qid:literal`, separating at the
first colon only. Literals retain colons, quotes, whitespace and Unicode; their
ordered concatenation is the complete original query. This view omits the
duplicate plain subject. The trusted server input still retains the full
original subject and positions; the compiler never parses model-written
literal rows. Source parts, source windows and date anchor enums are identical
to the existing v5 catalogue. Compact fixed instructions leave room for the
query without reducing source evidence or increasing either byte limit.

A realistic large catalogue is part of acceptance: reconstruct the retained
reader evidence with the original v5 input size, then require the new format to
fit the same source/date catalogue. A small successful fixture alone misses
the case where query duplication forces the original failing producer back in.

Prepare and freeze the subject parts before model invocation. Count their
generation schema and prompt in the existing 25,000-byte bound; retain the existing
v5 producer before the single model call if the new catalogue cannot fit.
The fixed rules/schema allowance stays at 4,000 bytes. The Q table is limited
to 384 parts to leave room for the existing finite/date schema enums; a larger
table selects the same v5 producer without shortening the original query.
There is no paid fallback or automatic retry. The existing 5,000-unit query
bound, source windows, provider routing and time limit remain.

Execution: first prove exact subject assembly and refusal offline; then wire
the versioned schema/compiler through the existing reader and actual SDK
transport. Verify the original source/date/name counterexamples and meaningful
service behavior. Release only after the repository's exact full acceptance.
Fresh live verification uses a new owned fixture; the failed C20 action and
its ledger stay intact and cannot be replayed.

Beads `content-factory-next-0qgn.10` owns status and acceptance. This document is
the contract for the fix, not a second task ledger. The original 36 records,
seven epic criteria, all8/native15/HOT acceptance and owner defers remain.
