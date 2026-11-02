# Evidence and editorial value stream

## Delivery

- Selected research preserves source publication/retrieval metadata separately from event-date provenance and exact quotes through reuse, brief and core writing. Brief evidence is structured and preserves the bounded passage rather than only its first 400 characters. Existing captures can recover source metadata from their owned snapshot.
- Intake v15, research digest v6 and core writer v21 distinguish an explicit relative availability statement in a dated primary announcement from publication/fetch metadata alone. A later platform date does not establish global launch. Partial coverage qualifies the missing claims rather than negating confirmed availability.
- Existing adaptation coverage review assesses practical benefit and, when appropriate, access or next steps; it distinguishes suggested experiments from factual capabilities and does not impose a call to action on unsuitable genres. No additional model call, automatic rewrite or Temporal contract change.
- Synthetic regressions cover primary/secondary source dates, exact evidence retention, selected confirmed facts under partial coverage, date admission and genre-sensitive review policy. One existing fixture had a reference URL unrelated to its no-fetch scenario; its understanding now reflects that scenario.

## Evidence and limits

- Focused Jest suites passed: 5 suites, 131 tests (intake reuse/model-led/provider schema, advisory presentation and evidence/value), using the existing dependency tree and Node 22.23.2. Scoped `git diff --check` passed. Type checking remains with root integration: this worktree had no node_modules.
- Model behavior is tested with deterministic mock outputs and prompt contracts, not a live model. No production, paid call or publication was performed.
- Changes are uncommitted and share the worktree with other streams. Root owns acceptance and safe-only cleanup; do not remove other streams' work.

## Follow-up: deterministic length findings

The existing advisory review already checked the hard character limit; the preferred range depended on model judgment. It now independently compares visible characters to the resolved per-post range, including accepted overrides, per series item. It records the measured count and range on passed or unavailable reviews, leaves `auto` without a preferred range, retains the existing hard-limit check, and does not rewrite or discard a draft. Focused review suite: 33 passed; series and editorial-value suites also passed. Hard-limit checks retain their existing raw-text counting contract, while preferred range uses visible text.

The library type check was attempted with the shared dependency tree and exited nonzero due to numerous unrelated dependency/generated-client errors and integration errors in `adaptation.capabilities.ts` (lines 477 and 502). After correcting the local `provider_max` type, no errors were reported in this stream's changed files. Full local log: `/tmp/cf-evidence-tsc-20261102.log`.

## Root acceptance
Accepted into the shared isolated task worktree; root integration and relevant follow-ups passed (see acceptance.md).
cleanup_status: cleaned
cleanup_notes: No child worktree/runtime was created; shared source and root-owned evidence retained.
