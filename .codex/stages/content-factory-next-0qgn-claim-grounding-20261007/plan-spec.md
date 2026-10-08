# Claim grounding: bounded source stage, 07 October 2026

Owner selected Beads `content-factory-next-0qgn.10`. Beads remains the sole task/status ledger; this document describes the implementation boundary. The whole EPIC and original acceptance criteria are preserved.

## Goal and diagnosis

Prevent selected source/date IDs from certifying an unrelated assertion. The exact saved V12 checkpoint is `44b67e07c43cfd30f12457e08f2dd77b43ce4cf8` in `/home/me/code/content-factory-next-worktrees/reader-subject-anchors-20261006`. An offline reproducer accepts a FAS forecast from a quotation about a 3% levy. V1 validates provenance/temporal rules, not semantic entailment. Additional model self-attestation and keyword whitelists do not repair that boundary.

## One cohesive change

Root owns V12 producer/compiler/qualification, affected tests and specification. Independent child `claim_support_review` is read-only (`gpt-6.1-sol/max`, context isolation); no overlapping writers. Owner graph at primary checkout, built46ec4108, is stale orientation only; focused V12 queries have no matching node, so exact current source is the authority.

Confirmed guards: each selected date span must be contained in its selected citation slot; an entity candidate may become supported only if a temporally eligible claim both names it and quotes it in the same source. Original V1 and eight preceding modules remain unchanged. Invalid wire rejects explicitly, never purchases a fallback review. A legitimate concise paraphrase with contained dates and a quoted entity remains representable.

Pending product choice: a deterministic claim-entailment guarantee requires exact source quotations instead of free translated propositions. Owner was asked whether to accept extractive claims now or preserve free translation and qualify semantics separately. Do not implement this dependent restriction before an answer. These guards alone do not establish full semantic entailment or event/date identity.

## Acceptance and remaining gates

Local: reproduce old false-support boundary; negative controls for unrelated date and entity citations; positive controls for real dates, multilingual concise claims and retrospective evidence; preserve immutable provenance, limits, routing, one invocation, shared retries and previous producer bytes. Cache identity must separate prior qualification behavior.

Verification: affected V12 tests plus impacted service boundary tests, backend type check and `git diff --check`, root-owned once at final source acceptance. Reuse matching prior receipts for untouched code. No full suite, publication, deployment, fresh paid call, old QA action replay, recovery or unrelated cleanup. Keep raw historical NO_GO evidence immutable.

Original .10 usefulness/date/source requirements, a fresh clause-by-clause model control with raw wire, MAIN and release acceptance remain separate unproved gates. End this short stage with a saved source checkpoint, Beads/handoff evidence and a concise report; do not close the whole EPIC or resume continuous work.

## Saved boundary

Source checkpoint `1c519edf34fcf9c388ed4237df20d4556c7c924c`. Root191 affected tests, types and SDK63 passed; independent design/diff review accepted. The two citation guards are saved, but the exact semantic counterexample still passes. Owner choice remains pending, original .10 stays OPEN; do not claim semantic fix/completion. Final receipt: `root-source-acceptance.actual.json`.

Owner08Oct resolved the pending product choice: FREE TRANSLATION. Subsequent bounded translated-date source accepted at `54b81be24af66d6d1b4e7a9f42a43c8c7d8dc76a`; see ../content-factory-next-0qgn-translated-dates-20261008/plan-spec.md. General semantic gates remain incomplete. Original snapshot/receipts above are historical and preserved.
