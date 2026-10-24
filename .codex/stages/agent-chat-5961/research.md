# Research recovery delivery — HONEY-5958

Owner: research_recovery. Local-only, 24 October 2026.

## Delivered

- `material-read.capabilities.ts`: literal misses now return the actual authorized bounded range with `literalMatch:false`, no `matchOffset`, original `MATERIAL_PASSAGE_NOT_FOUND` code/reason in recovery metadata, source identity/revision/date and exact next range arguments. No fuzzy match, new fetch or invented confirmation. Stale, missing and foreign sources remain failures. New `research_assessment` part exposes full durable assessment as revision-bound JSON ranges.
- `research-progress.ts`: semantic evidence identity for root-owned native progress guard. Rephrased literals/searches, source reordering and new search snapshot IDs cannot count as new evidence. New source revisions, actual ranges, factual contents and date provenance do count. Unknown tools return `undefined` for existing generic identity.
- `research-evidence.ts`: preview cache limited to 8 MiB conservative retained bytes and 250 entries, oversized entries bypass cache; durable domain evidence stays intact. No corpus-sized JSON serialization for cache accounting. Compact sources now include source revision. Compact assessment preserves every evidence/source/coverage/claim metadata row, dates, disposition, scope and status while removing duplicate page excerpts and bounding repeated prose; full content remains explicitly readable.
- `research.capabilities.ts`: uses compact assessment projection, without changing research service, quota or durable captures.
- `conductor.instructions.ts` / `conductor.skills.ts`: preserve original goal and fixed absolute window, treat old references as input, reuse retained evidence, handle literal misses honestly, stop equivalent no-progress research, answer authoritative manual questions in chat, resume authorized unfinished work automatically and inspect saved core/adaptation before claiming readiness.

## Investigation and proof

Graph-reviewed against borrowed owner map `/home/me/code/content-factory-next/graphify-out/graph.json` (older baseline `dd67538d`); focused graph queries did not resolve the current reader implementation. Actual owning files verified directly. No graph refresh or external extraction.

Private incident export inspected read-only. All five actual missing literal strings were identified: `October 2026`, `28 days`, `October 9, 2026`, `Ultrafast is rolling out today`, `Ultrafast`. Only the first two share a subsequently recorded successful source range (offset 0, 16,000 of 166,720 characters). The other three have no successful full-source range in the supplied export. Their original complete retained snapshots were unavailable; no claim of replaying those full historical bodies is made. Tests use clearly labelled synthetic equivalents, exact miss strings, public-shaped synthetic URLs and fixed 9–23 October 2026 scope; no private export/account identifiers were committed.

Baseline-vs-current direct source probe, using original `0e0cf070c` reader plus current domain dependencies and identical five synthetic captures:

- Baseline: 5 misses without range, 0 bounded recoveries.
- Current: 0 misses without range, 5 truthful bounded recoveries.

Focused verification under Node 22.23.2 / pnpm 10.6.1:

- `tests/intake.research-reuse.test.cjs`: 69 passed, including exact five misses, truthful contiguous fallback/next ranges, revision, retained date/source, foreign/stale failure, no fetch/search/model call; byte eviction with complete durable oversized retrieval; compact assessment and full revision-bound reassembly; equivalent/new semantic progress identity.
- `tests/agent-conductor.unit.test.cjs`: passed.
- `tests/agent-conductor.guard.test.cjs`: initial run exposed unregistered `MATERIAL_PASSAGE_NOT_FOUND` and concurrent `AGENT_QUESTION_STALE`; backend/frontend contract owners notified. Root final focused set owns recheck after shared registration.
- `git diff --check`: passed at delivery review.

## Integration / limits

Root owns native execution guard wiring and combined native/browser final acceptance. This stream's passing tests prove domain recovery and retained evidence contracts; they do not prove real-provider editorial quality, historical source completeness, production behavior or complete research→piece→Telegram native continuation. Native memory stress is owned by memory_bounds; 8 MiB is a conservative preview-cache budget, not a claim about whole-process heap peak. All full snapshots remain in existing domain storage; eviction never grants read authority. No paid provider/search call, production mutation, credential change, push or deployment occurred. No global staging or commit. Shared work preserved; no cleanup required.

Root integration acceptance (24 October): implementation delivered and accepted
for integration; final native/browser acceptance remains root-owned and pending.
No cleanup needed: shared worktree and bounded source/test files are retained.
Task3 worker continues with an independently owned local native/domain fixture.


## Root integration acceptance — final functional source

Completion event accepted by root at source `36c4ae749` (implementation
`d93fa1bce`). The latest affected set has 32 suites / 700 passing tests, zero
skips; the final pinned SDK compatibility subset passed 13 suites / 37 tests.
The real browser and saved-data proof at `browser-proof.json` includes exact
questions, human/custom and delegated answers, reload, a real owned backend
restart, lost accepted HTTP 200, automatic next-call recovery and one saved
Telegram draft shown on the right. Canonical seven-option/multiple/confirmation,
RU/EN, keyboard, 390/1440 and stale/Stop cases are separately recorded there.

This accepts this child stream's delivered implementation and local functional
integration. The epic still requires the separate strict resource gate and
canonical task closeout; see `memory.md` and `acceptance.md`. Safe-only cleanup:
retain the owned worktree, private fixture data and preview for owner review;
no foreign runtime, source, data or private incident evidence was removed.
