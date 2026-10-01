# Reader source admission implementation plan

**Goal:** prevent unrelated advertising-labeling candidates from becoming brief
facts, and obtain one accountable reader summary when Exa supplies only facts.
**Spec:** `docs/product/source-search-admission.md`.
**Base:** `5d822447a159f032c9f6527b80a18b7c36827761`, isolated branch
`codex/search-relevance-2026-10-01`.
**Decision:** root approved the internal `readerResponse === true` boundary,
set only by the source-search controller and defaulting to false. A caller audit
showed automatic generation/intake also pass a language, so language alone
cannot identify the reader UI. Preserve automatic/copilot, intake and discovery
behavior, including historical multi-answer/language correction.

## One cohesive change

Owned files: `web.research.service.ts`, the source-search controller,
focused tests/recorded public fixtures,
the admission spec, summary contract and this stage's private evidence.
Root owns primary checkout, frozen release, Beads, global verification and
delivery. No provider, browser, database, host or registry action belongs here.

Acceptance mapping:

- Record all five Telegram candidates; admit only two relevant excerpts,
  preserving accepted bytes and provenance → service fixture regression.
- Generic FAQ prose passes; commodity/list/fishing and embedded advertisements
  fail; other/English/supplied/no-language/discovery and automatic/intake paths
  retain their facts even with explicit language
  → focused admission tests.
- One source-only summary in the same usage scope, preserving five Exa sources
  and facts; no-fact/supplied paths skip; errors retain empty fallback
  → summary/usage regressions.
- Failed Tavily request and possible billing remain visible beside Exa dollars
  and both cheap calls, with no additional search or model retry
  → real usage-ledger fixture regression.
- Existing multiple-answer, forecast/current and proper-name contracts remain
  → existing six affected core search suites and backend types.
- Only the actual controller enables both new behaviors; an absent/false
  marker preserves generation/intake spend, and reader/consumer caches stay
  separate in either call order → controller and consumer-boundary regressions.

Sequence: write meaningful focused regressions and capture RED on the base;
implement the complete bounded behavior and durable docs; capture focused
GREEN; run the six existing core search suites once together with the new
suite and backend types; inspect diff/provenance/budget boundaries; commit and
freeze the isolated tree for root acceptance.
The second correction is committed on top of `d61e4190a` after its own RED/GREEN;
the first commit and its historical evidence remain available.

Commands use Node `22.23.2`, pnpm `10.6.1`, own offline frozen dependencies.
Final checks:

```sh
pnpm exec jest --runInBand --runTestsByPath tests/web.research.source-admission.test.cjs tests/web.research.service.test.cjs tests/web.research.summary-language.test.cjs tests/web.research.degradation.test.cjs tests/web-research.usage-record.test.cjs tests/research.phase-one.test.cjs tests/lead-discovery-judge.test.cjs tests/content-search-screen.guard.test.cjs --coverage=false
pnpm exec tsc --noEmit --incremental false -p apps/backend/tsconfig.json
git diff --check
```

Material risks: a narrow heuristic can lower recall; an advertisement cannot
earn admission from regulator acronyms alone. The new summary branch adds a
paid model pass, so tests check actual ledger attribution and failure evidence.
Recorded fixture/model doubles cannot prove live relevance or faithful prose.
No broad suite belongs to this child. No shared installation or runtime is
created; preserve the committed worktree and its own dependencies for review.
