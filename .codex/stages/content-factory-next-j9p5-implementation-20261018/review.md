# Independent correctness review — j9p5

Read-only source/consumer review of the dirty integration at baseline `4305609a6`.
No builds, suites, browser acceptance, provider calls or production operations were run.
Source files were not edited. Root owns fixes and final acceptance.

## Bounded recheck — 18 October 2026

Rechecked only the human-selection policy, native answer/rebuild continuity,
choice-bound replay and terminal telemetry corrections. No acceptance rerun.
Original findings below are corrected in source. The bounded recheck also found
a direct-query regression, subsequently corrected by root:

- **P1 — Person-only core research substitutes a generic search goal.**
  `libraries/nestjs-libraries/src/chat/capabilities/catalogue/core.capabilities.ts:270`
  synthesizes `request.goal = 'Research this piece'` for the valid
  `{ pieceId, selection: 'person' }` input without request/direction.
  `researchExistingCore` takes that goal before the scoped core subject
  (`intake.service.ts:1915`), and `researchForIntake` uses it as the search query.
  Consequence: research no longer searches the contents of this piece.
  Use the trusted persisted selection policy without inventing a request, or
  obtain the actual subject from the owned core in the service. Value: retain
  human review without destroying the research subject. Tradeoff: optional
  request semantics stay absent until the existing model/service supplies them.
  Confidence: high. Classification: must-fix. Status: corrected; trusted selection policy is passed independently without a synthetic request. Root regression `agent.model-autonomy.test.cjs` passes the person-only core-search subject case.

## Original must-fix findings — corrected in source

1. **P1 — Human-review selection is not bound to its research snapshot.**
   `piece.capabilities.ts:312` and `core.capabilities.ts:266` do not pass
   `selection: person` into the saved intake/core research state. The later model
   gate (`intake.service.ts:assertModelResearchSelection`) only checks
   `request.constraints.humanFactSelection`, although `request` is optional and
   `selection` is a separate documented input. A valid `selection: person`
   preview without that duplicate request flag can therefore be continued by
   the model-origin tool. MCP returns the snapshot directly when no suspension
   function exists; existing-core legacy human-card snapshots also lack the new
   flag. Impact: requested human review can be bypassed without forging a native
   answer. Persist the effective review requirement before creating the snapshot
   and reject model selection for human-bound snapshots. Value: preserve the
   effective human boundary. Tradeoff: a legacy snapshot may require its actual
   card or a fresh preview. Confidence: high. Classification: must-fix.
   Recheck: trusted `prepare` third / `researchCore` sixth options persist
   `researchSelectionPolicy`; manual and legacy snapshots default to person;
   `assertModelResearchSelection` requires an explicit saved model policy
   (`intake.service.ts:483,627,1909,2038`). Both capability inputs also bind
   `selection: person` to the request flag. Original bypass resolved in source;
   the generic-query regression above is also corrected and covered by the root regression.

2. **P1 — Native answer/rebuild loses the new request contract.**
   Intake persists `request`, `researchSelection` and `researchSummary` beside
   the core (`intake.service.ts:1025`). `PieceService.coreOf`
   (`piece.service.ts:5450`) omits all three. `prepareAnswer` consumes that
   stripped core (`:3019`), and answer's `writeCoreWithDecisions` (`:3170`)
   and rebuild's `writeCore` (`:2855`) do not pass `request`. Trigger: a new
   generic task has a genuine missing author-owned fact, then the person answers,
   or later adds material and rebuilds. The writer falls back to V18 and loses
   explicit constraints/material supplied only in the request. The native
   detail reader also hides the stored selection provenance. Additionally,
   answer's automatic title choice (`:3286`) overwrites a supplied
   `request.constraints.title` when the deferred core is empty. Restore validated
   fields in `coreOf`, carry them into native writers/updates, and preserve the
   requested title. Value: retain the original goal through actual pauses and
   later native edits. Tradeoff: legacy cores must continue without new fields.
   Confidence: high. Classification: must-fix.
   Recheck: `coreOf` restores validated request/selection/summary
   (`piece.service.ts:5463`); answer and rebuild pass request (`:3178,2862`),
   answer retains all three persisted fields (`:3277`), `core-write.ts:789`
   retains request in shaped output, and answer preserves the requested title
   (`piece.service.ts:3292`). Resolved in source; continuity regressions and
   final acceptance remain root-owned.

## Findings corrected during this review

3. **P1 — Empty/failed intake research was discarded by the capability adapter.**
   `run` emits `research-ready`, then finishes without a piece or selection for
   an empty/failed/unresolved result. The initial `collectIntakePass` handled
   only `research-selection-required` and returned generic `INTAKE_FAILED`,
   losing summary, status and gaps before the conductor could assess them.
   Root now captures `research-ready` and returns a distinct research outcome
   (`piece.capabilities.ts:195,218,390`), with real pieces taking precedence.
   Value: truthful tool feedback. Tradeoff: callers handle another outcome.
   Confidence: high. Classification: must-fix, source correction inspected;
   acceptance remains root-owned.

4. **P1 — Failed existing-core research could show old facts and buy a rewrite.**
   The initial human branch checked `status: empty` but omitted `failed` and
   `needs_clarification`; the service retained original own/reference facts.
   A human card could therefore hide failure and its accepted result could
   enter the writer, which checked only temporal `periodStatus`. Root now
   returns actual evidence for all terminal non-results
   (`core.capabilities.ts:276`) and rejects them before a continuation claim
   (`piece.service.ts:4901`). Value: prevent misleading cards and paid writes
   after failed evidence. Tradeoff: a new explicit research attempt is needed.
   Confidence: high. Classification: must-fix, source correction inspected.

5. **P2 — New-piece continuation replay ignored the selected keys.**
   The initial `selectResearchForModel` returned pending/completed events by
   snapshot alone, before key validation. A repeat with different/unknown keys
   claimed success for the first selection and reported the new key count.
   The worker now binds normalized origin/keys to pending, saved and Redis
   claim state (`intake.service.ts:1967,1970,1984`) and rejects mismatches;
   the human resume also checks its own choice fingerprint (`:677`).
   Value: accurate receipts without duplicate writing. Tradeoff: a changed
   selection is an explicit conflict. Confidence: high. Classification:
   must-fix, source correction inspected; bounded recheck confirms both
   normalized origin/keys and unknown-key validation precede a completed
   replay (`intake.service.ts:1974-1985`). Race regressions remain root-owned.

## High-value observation — corrected in source

6. **P2 — Execution measurement was logged before pending work settled.**
   `agent.controller.ts:500` logs `execution.snapshot()` before `turn.finish`
   waits for actual capability Promises (`:506`). On Stop, a non-cancellable
   domain call can record cost/tokens/uncertainty afterwards, so this apparent
   terminal measurement is incomplete. Move the log after settlement in a
   `finally`, or label it partial. Value: truthful cost/latency evidence.
   Tradeoff: logging waits for pending work. Confidence: high. Classification:
   high-value improvement. Recheck: the log is now after the awaited
   `turn.finish` and its catch (`agent.controller.ts:504-512`), so tracked
   capability work has settled first. Resolved in source.

## Residual verification gaps

- Structural source review is not evidence of natural-model request quality,
  source entailment, paid multi-step usefulness, provider invoices or production.
- Root must accept actual service-to-capability empty/failed composition,
  model/person selection boundaries, native answer/rebuild persistence,
  controller Stop/terminal receipt and cross-instance continuation races.
- No apparent new private-thread/tenant disclosure was found in the inspected
  native history reader or `piece.read`; this is scoped source evidence only.
- Graph reviewed: focused `IntakeService` lookup on the owner's graph at
  `dd67538d`; it is stale orientation, and current source was inspected directly.
