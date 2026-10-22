# Focused correctness review: task 5rgn

Current follow-up status: no unresolved source-review blocker. Both projection findings below are resolved after bounded inspection of the final fixes and three new regression assertions. R1–R3 below retain their original evidence; all three fixes were subsequently inspected in code and the targeted new regression assertions were read. Execution and final integration acceptance remain root-owned.

Read-only source review on 2026-10-20 in the shared repair worktree. Findings
are based on the current implementation and existing test evidence, not on
new acceptance/model/provider runs. No application code was edited. Worker
fixture edits in progress are not treated as defects.

## Initial findings (all resolved in source)

### [RESOLVED] R1 — P1: `selection: person` bypasses required human fact selection on research reuse

Evidence: `libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts:1050`
checks `humanFactSelection` only when `researchSelectionPolicy === 'model'`.
The `researchReuse` entry disables ordinary research at line 485, so the
`research-selection-required` branch at lines 963–1025 is skipped. Lines
1026–1032 then call `finish` directly with a fabricated model-origin selection.
`libraries/nestjs-libraries/src/chat/capabilities/catalogue/piece.capabilities.ts:439`
sets policy `person` from the exposed `selection` parameter; lines 441–446
report a saved piece with `factsCard: not_shown` and model selection.

Trigger: run `piece.create` with an owned `res_*` snapshot and
`selection: 'person'`, while the supplied/interpreted request has
`constraints.humanFactSelection = true`. With an otherwise sufficient brief
and no editorial questions, the service invokes `recordCore` without ever
suspending for a facts card or receiving the person's selections. The existing
human-choice regression in `tests/intake.research-reuse.test.cjs` exercises
only the default model policy and therefore misses this branch.

Impact: an explicit person-owned choice can be replaced by model-selected
facts. Setting a policy is currently treated as evidence that the choice
happened.

Suggested fix: refuse this continuation regardless of policy until a real
stored person answer exists, or route reuse through the existing native fact
card/resume contract. Do not set `origin: person` merely from the parameter.
Include selection policy and any authenticated human-answer identity in the
continuation binding if that policy may change the allowed write.

Expected value: preserves the explicit human-selection contract at every
entry point. Tradeoff: the minimal safe refusal requires a later explicit
selection flow; implementing that existing flow costs more than a guard.
Confidence: high. Classification: must-fix.

### [RESOLVED] R2 — P1: a passed semantic review can save a post beyond the actual platform limit

Evidence: `libraries/nestjs-libraries/src/agent/agent.graph.service.ts:1529`
only sends provider/channel/caption limits as model input. The review/repair
path returns `adaptationCoverage.status = passed` at lines 1608–1610 without
measuring the complete final post. No check is applied when a model gives a
valid `passed` verdict. `libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts:1715`
now prepends a separate hook and persists the combined text at line 1735.
The downstream `ContentBriefRepository.createDraft` and
`PostsRepository.createOrUpdatePost` paths check provenance/tenant bindings,
not provider text length (`content-brief.repository.ts:122`,
`posts.repository.ts:1336`).

Trigger: Telegram limit 4096; generated body is 4050 ordinary characters and
its distinct hook is 100 characters; the semantic reviewer returns
`{status:'passed',missingRequirements:[],unsupportedClaims:[]}`. The saved
post is 4152 characters and is reported as passed. The same defect applies
after a repair and to the smaller media-caption limit. It does not require a
provider outage or malformed model output.

Impact: the repaired chain can call a structurally unpublishable post ready;
publication later fails or requires another paid rewrite. Adding the hook
makes a formerly in-limit body exceed the limit.

Suggested fix: use the existing provider/editor length semantics to measure
the exact composed hook/body, with the applicable caption/channel hard cap,
before authorizing persistence/readiness. Feed a concrete over-limit finding
into the existing single repair budget; fail incomplete if the final result
still exceeds it. Do not truncate text silently or add a second repair loop.

Expected value: a ready adaptation is valid for its selected platform.
Tradeoff: counting must match editor/provider rules so Markdown markup is not
incorrectly counted as visible text. Confidence: high. Classification:
must-fix.

### [RESOLVED] R3 — P2: the new completeness repair is still capped by the avatar's usual short length

Evidence: `libraries/nestjs-libraries/src/agent/agent.graph.service.ts:1568`
passes `tokenCeiling(state)` to the new full-post repair. That helper at lines
590–594 uses only `effectiveVoice.postLength.high`; it never considers the
core, requested coverage, explicit channel length, or JSON overhead. With
`high = 200` it yields only 512 tokens for the complete structured hook/body
response. `getChatModel` forwards this as actual `ChatOpenAI.maxTokens`
(`libraries/nestjs-libraries/src/openai/ai.clients.ts:244`).

Trigger: a short-post avatar adapts a 2–3k-character Russian core containing
several required subjects and an explanatory section, which fits Telegram's
actual limit. The new review detects an omitted subject, but the repair is
again restricted to the short-avatar token allowance. A full repair cannot
fit that output budget and either remains incomplete or fails structured
output parsing. Skipping `trimToAuthorLength` at line 1347 does not remove
this ceiling.

The existing regression already has `voice.high = 200`, but its stand
`getChatModel: async () => chatModel` discards all token-limit arguments
(`scripts/evidence/voice-eval/product-graph.cjs:45`), so its unlimited fixture
repair does not verify the real bound.

Suggested fix: provide an adaptation-specific bounded token budget that can
hold the supported requested scope under the real channel cap, including the
hook and structured-output overhead. Apply it to the initial adaptation and
the single repair; preserve the ordinary generator's current behavior.
Inspect/assert the actual model-factory token argument in a focused
regression rather than accepting an arbitrarily long mocked response.

Expected value: completeness repair can actually restore the topics that the
new review requires instead of reproducing the original truncation cause.
Tradeoff: some long requested adaptations consume more output tokens than
the short avatar default; the hard cap and single repair still bound cost.
Confidence: high. Classification: must-fix.

## Reviewed boundaries and residual verification gaps

- Reviewed owned standalone snapshots (`res_*`) including `piece.read`,
  retained quote/evidence pairing and source-registry acceptance, both create
  entry points, atomic continuation claims and confirmed/uncertain repeats,
  generator hints/context, bounded semantic review/repair, graph error
  propagation, hook/body persistence, and saved-result model output.
- The checked standalone read/reuse path uses organization plus user identity;
  an organization-only preview cache no longer authorizes a `res_*` read.
  Atomic write claims fail closed on uncertain/failed continuations. These
  positive observations are static, not additional runtime evidence.
- The one-review / at-most-one-repair / one-final-review sequence is bounded;
  failed or invalid reviews stop before adaptation persistence. Existing
  accounting reuses the active AI admission/ledger for nested calls; fixtures
  alone do not attest actual provider cost completeness.
- No tests, builds, browser acceptance, database access, paid calls or live
  mutations were run by this reviewer. Root retains final acceptance.
- Real semantic entailment, natural model behavior and prompt-injection
  resistance remain live/editorial gates; matching a retained quote is source
  integrity, not a semantic certificate. Original live variant/configuration
  preservation and both actual owner-request reruns were outside this source
  review and remain root-owned evidence.


## Follow-up resolution inspection

- R1 resolved: `intake.service.ts:680` now refuses standalone reuse when the
  policy is not `model`, or when an already supplied request requires human
  selection. The check is before atomic claims, pending promises and confirmed
  replay. The second guard at line 1057 covers a human-choice requirement
  learned by the brief call regardless of policy. The new regressions at
  `tests/intake.research-reuse.test.cjs:179` and line 193 check both a new
  `person` request (no model/write/claim) and an attempt to relabel a completed
  model write as an answered human card. The previously suggested policy hash
  addition is unnecessary with the explicit pre-replay refusal.
- R2 resolved: `agent.graph.service.ts:611` derives the cap from the existing
  provider/caption `channelHardLimit`, narrowed by explicit channel/post hard
  policy. Lines 1538–1539 compose the actual first post with the same
  `withAdaptationOpening` helper now used by `piece.service.ts:1717`; an already
  included hook is counted once. Lines 1584–1591 add an arithmetic over-limit
  finding even when semantic output says passed. Both reviews use this path,
  so an over-limit repair cannot pass or reach persistence. New focused tests
  at `tests/agent.adaptation-coverage.test.cjs:237` and line 255 exercise the
  whole-post hard cap and caption cap with valid but overoptimistic `passed`
  model replies. The character count is conservative over canonical text;
  Markdown-heavy text near the limit may be rejected earlier than a provider's
  rendered-text count. That does not reopen the reported over-limit bypass.
- R3 resolved: `agent.graph.service.ts:594` now derives the adaptation's bounded
  output allowance from core/material substance and the real hard cap, keeping
  the historical avatar-only branch for the ordinary generator. Both the
  initial generation and the one repair call use this helper. The regression
  at `tests/agent.adaptation-coverage.test.cjs:285` intercepts the actual
  factory `tokens` argument and asserts that both writing calls receive 2131,
  rather than the former 512, in a short-avatar/long-core case. Review calls
  remain capped at 3000 and the repair count remains one.

No test/build/acceptance command was run for this follow-up. No product code
was edited by the reviewer. Runtime and live semantic acceptance remain
separate from this source-level resolution.

## Additional source-producer provenance check

Root requested a focused trace of the `storeResearchEvidence` fallback that
accepts `fact.text` without finding it in a separate `source.text` body. No
additional blocker was found for the current production callers:

1. The only production call is `research.capabilities.ts:35`; `facts` and
   `sources` come directly from `WebResearchService.research`, not from tool
   input or a retyped conductor claim. The `researchReuse` DTO exposes only a
   private snapshot reference and keys, never an injectable facts array.
2. Provider facts are emitted at `web.research.service.ts:2793` from cleaned,
   bounded `item.content` or `item.rawContent` (selection at lines 2735–2737).
   Keyless facts at line 2843 come from bounded `row.extract`; their matching
   source keeps the same extract (lines 2811–2820). Temporal retrieval may
   first select a dated window and passes that actual material onward at
   lines 2707–2718; it is not a model-synthesized statement.
3. The reader path builds its input only from the per-URL fact passages:
   `reader-source-review.ts:527` and lines 535–547. The source windows are
   frozen by `prepareReaderSummary` (`reader-summary.ts:52–61`).
   `compileReaderSummary` returns facts from those exact retained excerpts at
   `reader-summary.ts:276–284`; it never substitutes `raw.answer`. The final
   service returns these `reviewed.facts` or the original passage facts at
   `web.research.service.ts:2973`.
4. Provider adapters keep synthesis separate from excerpts: Exa maps actual
   `text` to `rawContent` and leaves highlights non-citable
   (`ai.clients.ts:749–786`); Tavily maps `answer` separately from
   `result.content`/`raw_content` (lines 854–860); OpenRouter maps
   `message.content` to `answer` and only the URL-citation's `content` to
   result content (lines 915–924). A snippet-only source legitimately has no
   separately retained full body, explaining why the fallback is needed.

This verifies the local source-port provenance boundary. Provider snippets
and citation excerpts remain untrusted external data; this does not prove
verbatim agreement with an independently fetched full page or certify every
semantic assertion. A future caller that accepts model-generated `fact.text`
would need a different explicit contract; no such current caller was found.

## Live follow-up review: research coverage

The source-producer trace above describes the first accepted source d1caf509.
Its first-eight, fact-backed reader selection is superseded by the additional
correction after an actual rerun demonstrated coverage loss. Independent
reviewer `pipeline_review` read the stable additional diff and its real
producer-to-capture-to-native-create regressions. The current reader honors
explicit queries, fairly admits query results, presents up to 50 bounded actual
source windows in one call, and uses reader-summary/v2 cache identity. Private
source-only candidates expose their keys and unverified/unselected status;
default selection excludes them. Explicit selection checks owner scope,
literal statement/quote and registry evidence pairing. No other concrete
correctness blocker was found in that additional scope.

R4 (P2) was found and resolved: `insufficient_evidence` was missing from the
reuse refusal statuses. This allowed an explicit literal candidate to bypass
an assessment with no usable answer/relevant source. The guard now refuses
before selection, claim or writer. The actual-producer regression returns an
empty answer and all-irrelevant references, leaves a candidate inspectable,
and verifies native reuse refusal with no intake model, claim or writer. Root
accepts this source-level resolution; root release checks and actual post
quality remain separate gates. The reviewer ran no tests and edited no files.

Bounded limitation: 50 full pages cannot fit into one 25k-byte reader input.
Windows can be short, and oversized metadata can make the reader refuse. This
is fail-closed; captured full sources remain inspectable, while relevance and
completeness for the original request still require actual-result assessment.

## Local date-scope review

The first actual local diagnostic exposed the legacy single-day gate rejecting
valid ranges with reference dates before any semantic reader invocation.
Independent review then found two remaining concrete defects in the narrow v3
patch: slash ranges still failed its parser gate, and a correctly repeated
period in the answer was treated as an unsupported event date and discarded
all facts. These findings are resolved by the v4 scope contract, not a
whitelist of dates appearing anywhere in the query.

Reviewer read and accepted the stable v4 implementation and meaningful
English/Russian/slash and unsupported-date assertions: required exact
scopeQuote/scopeStatus, request-context rendering outside the factual answer,
hint-only parsing and no event-date exception for even a single as-of hint.
needs_clarification becomes insufficient_evidence with no selectable facts;
native reuse refuses before writing. No new model loop or call, no legacy V1
change, and no remaining concrete review blocker. Reviewer ran no tests or
network calls and edited no files. Root accepts the source-level resolution;
actual saved-post quality remains separate.

## Piece evidence projection review, 2026-10-20

Read-only bounded inspection of the frozen projection stream: producer
`PieceService.hintsOf` -> `AgentGraphService.start` -> context builder and
repository -> nullable persisted `evidenceProjection` -> literal-span consumer
and final draft validation. The reviewer ran no tests, build, database,
network, model or runtime actions. Only this existing review artifact was
updated. Worker-reported passing suites are existing evidence, not a reviewer
acceptance run.

### [RESOLVED] Projection finding 1 — P1: valid new evidence citations E9–E16 cannot be finalized

Evidence: `context/piece-evidence-projection.ts:6` permits 16 evidence items;
`context/content-context.builder.ts:515–516` assigns E1 through E16. Generator
structured output uses strings and validates membership against the actual
context (`agent/agent.graph.service.ts:280`, lines 1168–1186 and 1609–1636).
However `context/content-context.finalize.ts:163` still accepts only
`/^([FE])[1-8]$/`.

Trigger: build the supported nine-source v3 pack, then finalize a valid draft
using `['E9']` or `['E1', 'E9']`. Finalization refuses with
`CONTENT_CONTEXT_CITATIONS_INVALID` after generation despite the selected
source and its projection being valid. The new nine-source finalization test
only chooses E1, so it misses the consumer mismatch.

Fix: admit E1–E16 only for the new projection version, preserve F1–F8 and legacy
E1–E8, and retain actual snapshot membership validation. Add actual-finalizer
positive E9/E16 and negative E17/legacy-E9 assertions.

Expected value: all newly admitted sources can actually support a saved draft.
Tradeoff: the new citation range must remain versioned rather than weakening
legacy acceptance. Confidence: high. Classification: must-fix.
Resolved in source: `content-context.finalize.ts:160–162` now accepts F1–F8
and E1–E16 only for version 3+, while legacy snapshots retain F/E1–8. Actual
snapshot membership is still checked at line 178. The regression at
`tests/content-context.builder.test.cjs:586` builds a real 16-item v3 context
and calls the actual finalizer: E9/E16 succeed; E17/F9 fail; removing E12 from
the snapshot proves that a numerically valid id still fails membership;
changing the same snapshot to version 2 rejects E9. Reviewer inspected these
assertions without executing them. Source resolution accepted.

### [RESOLVED] Projection finding 2 — P2: normal long semantic quotes are misclassified as whole-page background

Evidence: `context/piece-evidence-projection.ts:132` drops the mandatory span
when normalized quote equals the complete registry excerpt and exceeds 1024
characters. This does not identify a full-page candidate: the actual normal
semantic-fact producer stores its supporting quote itself as the registry
excerpt (`intake/intake.service.ts:2240–2249`).

Trigger: an otherwise valid selected semantic fact has a short paraphrased
statement and a 1200-character quote. Registry excerpt equals that quote by
the production acceptance contract. The new branch skips the mandatory span
even with ample 24k budget and retains at most 160 plus 800 background
characters. `materialSupport` cannot match the complete normalized quote in
any literal span; generation is explicitly told there is no matching admitted
quote (`agent/agent.graph.service.ts:444–449`). This quote previously fitted
the ordinary 4k selected excerpt. The failure is proof loss, not fabricated
confirmation.

Fix: retain semantic quotes as mandatory. Whole-page background needs an
explicit producer role (or at least the literal statement/quote identity
contract), not equality with registry excerpt. Add an actual capture ->
piece hints -> builder -> materialSupport regression with quote 1025–2000 and
statement different from quote; keep the separate whole-page background case.

Expected value: valid semantic support is not silently discarded before the
paid adaptation. Tradeoff: large essential quotes must consume the real proof
budget or produce an honest preflight deficit. Confidence: high.
Classification: must-fix.

Resolved in source: `piece-evidence-projection.ts:132–133` skips a complete
long capture only when its normalized statement also equals the quote.
A semantic paraphrase (or absent statement) keeps the actual quote mandatory
even when the entire registry excerpt equals it. The new regression at
`tests/content-context.builder.test.cjs:494` exercises the builder and actual
`materialSupport` for normalized semantic quotes of 1025, 1600 and 2000
characters with a short different statement. The separate complete-page
regression retains statement=quote, verifies compact relevant background,
and confirms the original raw source is unchanged. Reviewer inspected both
assertions without executing them. Source resolution accepted.

No other concrete blocker was identified in this bounded inspection. Raw
excerpt hash, span offset bounds, saved rendered hash and organization checks
are present; projection reload preserves individual literal spans so omission
markers do not prove continuity. The finalizer also checks projected sources
outside chosen citations. Legacy nullable projection fallback remains
separate. Semantic entailment remains the model review's responsibility;
literal provenance alone is not a semantic certificate. Root owns schema,
type/build integration and live result acceptance following this source-level
resolution inspection. No additional tests, runtime or provider calls were
made for the final delta.
