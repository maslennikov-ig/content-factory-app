# Research provenance stream

Task: content-factory-next-5rgn. Implementation delivered to root; no commit,
provider call, network source fetch or production mutation by this stream.

## Delivered behavior

- `research.search` freezes its actual collected source passages through
  `ContentSourceRegistryService.acceptSearchResult(reuseBy: 'hash')`, and stores
  its structured capture in the existing private `IntakeSnapshotStore` scoped
  by organization and requesting user. Multiple quotes at one URL retain
  separate immutable evidence identities. Snapshot TTL remains one hour;
  accepted registry evidence and the resulting piece brief are durable under
  their existing contracts. No schema migration or alternate writer.
- `piece.create` and `piece.create.from-research` pass an owned snapshot/fact-key
  reference instead of flattening evidence into bounded context prose. Intake
  loads the saved passages and preserves each chosen statement, fact key, URL,
  quote and evidence id in the saved brief even when the brief model omits it.
  Known collected URLs do not need another source fetch. Research reuse cannot
  implicitly enable another paid search.
- Current request text is preserved verbatim and remains separate from labelled
  contextual/reference material. Query-only continuation remains supported;
  `requestBasis: research_query` honestly distinguishes that fallback from a
  supplied original request (`requestBasis: original_request`). Root owns the
  conductor's original-request verification and actual full-input replays.
- A source id alone no longer confirms an arbitrary new brief assertion:
  confirmation requires its supporting passage in the actual accepted source.
  Existing selected rows retain their exact server-captured statement/quote.
  Wrong-owner snapshots, any unknown selected key, mismatched source quote,
  unusable research assessment and model bypass of required human choice are
  refused. Transient `res_*` reads also require the private stored capture;
  the organization-only process preview map cannot grant access.
- Existing native paused-intake continuation remains separate. Its catch-all
  fallback to a fresh create was removed. Standalone reuse now uses the same
  snapshot store's atomic claim pattern: confirmed repeats replay the saved
  result; conflicting/uncertain writes never replay the writer.

## Changed paths

- libraries/nestjs-libraries/src/chat/capabilities/catalogue/piece.capabilities.ts
- libraries/nestjs-libraries/src/chat/capabilities/catalogue/research.capabilities.ts
- libraries/nestjs-libraries/src/chat/capabilities/catalogue/material-read.capabilities.ts
- libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts
- libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v13.ts
- libraries/nestjs-libraries/src/content-intelligence/intake/research-reuse.ts (new)
- libraries/nestjs-libraries/src/dtos/content-intelligence/content-intake.dto.ts
- tests/intake.research-reuse.test.cjs (new)
- tests/agent.model-autonomy.test.cjs (storage adapter fixtures updated)

The material-read write zone was explicitly extended by root. Concurrent
agent/conductor/PieceService/generator edits were preserved and not changed by
this stream.

## Verification

Environment: Node v22.23.2, pnpm 10.6.1, isolated repair worktree.

1. `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/intake.research-reuse.test.cjs tests/agent.model-autonomy.test.cjs tests/agent-capabilities.adapters.test.cjs tests/agent.model-intake-composition.test.cjs tests/intake.model-led.test.cjs tests/content-intake.service.test.cjs tests/content-intake.flow.test.cjs tests/content-intake.research.test.cjs tests/intake.provider-schema.test.cjs`
   - Exit 0: 9 suites, 151 tests passed. Log:
     `/tmp/cf-research-acceptance-20261020.log`.
2. After the final query-origin marker and binding changes:
   `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/intake.research-reuse.test.cjs tests/agent.model-autonomy.test.cjs`
   - Exit 0: 2 suites, 19 tests passed. Log:
     `/tmp/cf-research-final-20261020.log`.
3. `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit --pretty false -p apps/backend/tsconfig.json`
   - Exit 0, no diagnostics. This ran before the final requestBasis marker and
     extra continuation binding fields; root owns final integrated build.
     Log: `/tmp/cf-research-types-20261020.log`.
4. `git diff --check`: exit 0.

Focused regressions include two different sources with actual support after
character 800, a fresh service instance reading the stored capture, both native
create capabilities, loss/forgery by the brief model, own/foreign-user source
reads, unknown selection, mismatched quote, two passages at the same URL,
confirmed-repeat replay, uncertain-write refusal, required human choice and
query-only compatibility. All source/paid-model/network ports in these tests
are fixtures; these results prove wiring and integrity, not live editorial
quality or provider availability.

## Integration concerns

- Root/adaptation stream must carry optional `quote` and `evidenceId` from the
  saved brief into generator hints. That consumer handoff was sent directly to
  the adaptation worker; this stream does not own PieceService/generator edits.
- A capture older than its existing one-hour private TTL is unavailable for a
  new continuation; it is never silently fetched or searched again. Once a
  piece exists its registry evidence and brief retain the selected provenance.
- For this task's real reruns root will provide the full original request in
  `text`; query-only fallback cannot recover a verbatim original it never saw.
- Full release acceptance, actual paid reruns, production rollback and original
  variant comparisons remain root-owned.

Delivery: complete. Acceptance: pending root integration. Safe-only cleanup:
no child processes remain; logs are task-scoped under /tmp, retained for root.

## Review correction: person-selection policy (2026-10-20)

Confirmed and fixed the review finding. Standalone `researchReuse` previously
checked a model-understood `humanFactSelection` constraint only when the policy
was `model`; passing `selection: person` skipped that guard without ever showing
or answering a native facts card. A completed model result could also be
replayed under that person policy because it was not a human consent receipt.

The standalone service now refuses a non-model selection policy or an already
known human-selection constraint before any atomic claim, model call, completed
result replay or writer. A human-selection constraint first discovered by the
brief model also refuses writing regardless of policy. The refusal names
`INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON`; the supported native signed
person-card intake/continuation remains unchanged. This is a fail-closed
boundary, not a newly implemented human-card flow for standalone captures.

Changed only `intake.service.ts`, the two meaningful regression cases in
`tests/intake.research-reuse.test.cjs`, and this artifact during correction.
Both regressions first failed against the reported route (2 failed, 8 passed;
`/tmp/cf-research-person-red-20261020.log`).

After the fix:
`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/intake.research-reuse.test.cjs tests/intake.model-led.test.cjs tests/content-intake.research.test.cjs tests/agent-capabilities.adapters.test.cjs`
passed with exit 0; exact summary is in
`/tmp/cf-research-person-green-20261020.log`. `git diff --check` passed. No full
suite, commit, provider/network call or production mutation was performed.

## Recorded-scenario fixture correction (2026-10-20)

Root's integration run found the recorded scenario world's service fixture
still lacked the new standalone research capture/read ports. Changed only
`tests/fixtures/agent-scenarios/world.cjs`: added scoped
`storeResearchEvidence` / `readStoredResearchEvidence`, preserving the actual
source/quote pair and returning private organization+user snapshots. The
capture map belongs to one scenario world and is separate from externally
asserted workspace rows, like its existing native intake snapshots. Snapshot
storage admits no extra model/search operation and creates no piece. Existing
scenario scripts, tenant checks, quota/admission assertions and write assertions
were unchanged.

Verification:

- `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH node tests/helpers/agent-scenarios.runner.cjs model-led-research-continuations`
  exited 0; only that exact argv-filtered scenario played. Report:
  `/tmp/cf-research-scenario-world-20261020.json`; stderr file empty.
- Ran its unchanged `scenario.check(report[id])` using the existing `expect`
  package. It passed, including actual search request, exact paid admissions,
  no read-only piece write, native model continuation and saved versions.
  Additional checks passed for four clean ended turns, one succeeded agent
  admission per turn and zero pending cards.
- `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/agent-scenarios.coverage.guard.test.cjs`
  exited 0; log `/tmp/cf-research-world-coverage-20261020.log`.
- `git diff --check`: exit 0.

No full suite, commit/push, live/provider calls or production changes. Root's
already-running full scenario child retained the pre-fix loaded fixture; this
focused result is fresh evidence for the corrected world.

## Live producer coverage correction and R4 (2026-10-20)

The stopped first diagnostic on public source `0ca38ed190f3` exposed a distinct
producer/admission defect, not an error in accepting an actual provider
`fact.text` passage. Private trace:
`/tmp/cf-adaptation-audit-20261020/diagnostic-0ca38ed190f3/rerun-0.json`.
Three research results had 50/50/20 retained sources but only 5/7/9 selectable
fact rows; 45/43/11 readable captured pages lacked a selectable fact. Explicit
queries disabled the semantic reader despite `readerResponse: true`. The
shared 32k fact budget and FIFO source admission favored early query results;
the current semantic pack also required a pre-existing fact and kept only
its first eight sources. Reading a later private page could not turn it into
durable evidence for native create without another path/fetch.

Implemented bounded correction:

- `readerResponse: true` now remains an explicit semantic-reader opt-in with
  supplied queries. Queries are used unchanged (apart from the pre-existing
  explicit event-retrieval contract); supplying them still skips the query
  classifier. `readerResponse: false` keeps the old no-reader/model budget.
- Existing round-robin/water-filling admission now also covers reader
  multi-query responses. The established source cap and shared 32k snippet
  budget remain; original full captured page text is retained separately.
- Current `reader-summary/v2` considers up to the existing deep source cap of
  50 using generic verbatim source windows, including source-only page text.
  It makes one existing semantic reader call, bounded by the existing 21k
  evidence envelope and 25k actually serialized input limit. Output budget is
  1200 for up to eight sources, scales to 2880 for 50, with a hard 4096 cap.
  Hashes remain in authenticated assessment metadata; they no longer displace
  actual passages in the semantic prompt. The strict legacy V1 pack/validator
  is unchanged; its generic verbatim-window helper is merely exported.
- Full retained page passages become private durable registry-backed
  `sourcePassage: true` candidates exposed with real fact keys. They remain
  `status: unverified`, `verified: false`, `selected: false`; default selection
  excludes them. Explicit selection validates actual saved URL/evidence/quote
  and requires literal `statement === quote`. It verifies captured source
  material, not an arbitrary paraphrase or a fabricated semantic judgment.
  Tool descriptions explain this distinction. Saved original source content
  remains readable before selection, without another network request.
- Cache identity changes to `reader-summary/v2`; explicit-reader queries
  cannot hit the old `reader` bypass key or first-eight summary version.
  No global cache purge or TTL change.
- Review R4 was independently reproduced with the actual producer: an empty
  semantic answer/all sources irrelevant gave `insufficient_evidence`, but a
  literal candidate could previously be selected. The shared reuse guard now
  rejects that actual status before model/claim/writer. Candidates stay
  inspectable. `supported`/`partial` explicitly selected source material works.

Changed production paths for this follow-up:

- chat/capabilities/catalogue/{piece.capabilities,research.capabilities,research-evidence}.ts
- content-intelligence/intake/{intake.service,research-reuse}.ts
- content-intelligence/research/reader-summary.ts
- openai/{web.research.service,reader-source-review}.ts

All are under `libraries/nestjs-libraries/src/`. Focused tests changed:
`tests/intake.research-reuse.test.cjs`, `tests/web.research.service.test.cjs`,
`tests/web.research.source-admission.test.cjs`, and
`tests/web.research.summary-language.test.cjs`. Old fixture cases intended to
prove the no-reader consumer path now explicitly request `readerResponse:
false`; their original no-summary/no-extra-model assertions remain.
Root-owned handoff/outcome/plan edits were preserved, not edited by this stream.

Final focused acceptance:

`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/intake.research-reuse.test.cjs tests/web.research.reader-summary.test.cjs tests/web.research.reader-source-review.test.cjs tests/web.research.source-admission.test.cjs tests/web.research.service.test.cjs tests/web.research.summary-language.test.cjs tests/agent.model-autonomy.test.cjs tests/agent.model-intake-composition.test.cjs tests/intake.model-led.test.cjs tests/intake.provider-schema.test.cjs tests/agent-capabilities.registry.guard.test.cjs tests/agent-capabilities.adapters.test.cjs`

Exit 0: **12 suites, 517 tests passed**. Log:
`/tmp/cf-research-multiquery-final-acceptance-20261020.log`.

`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit --pretty false -p apps/backend/tsconfig.json`
exited 0, no diagnostics; log
`/tmp/cf-research-multiquery-types-20261020.log`. This preceded only the tool
description clarification and R4 status-string addition; root owns final build.
`git diff --check`: exit 0.

Meaningful new regression runs the actual WebResearchService producer with
three exact supplied queries. The first has 55 long pages (enough to exhaust
the old cap/budget); the relevant later query page appears as S23, after the
old first-eight boundary, with support beyond character 800. The actual reader
compiler sees/assesses it, the real intake capture persists it, and both that
semantic row and a separately exposed literal source candidate reach the saved
brief via existing native create, with no second fetch/search. It also checks
owner refusal, literal-statement tampering, exclusion from broad default
selection, query preservation, false-reader spend, and poisoning the old reader
cache key. R4's actual-producer all-irrelevant regression first failed (1 failed,
13 passed), then passed with refusal before intake model/claim/write; red log:
`/tmp/cf-research-insufficient-red-20261020.log`.

Limits: bounded windows are not exhaustive coverage or live editorial quality.
Semantic review may truthfully return partial/insufficient evidence. Dates absent
from actual captured text remain unknown; no date inference or source-specific
extraction rule was introduced. Existing source cleaning can strip a linked
short heading (`cleanExcerpt` link/prose threshold), but the retained live trace
alone does not prove whether the provider supplied such date headings; no crawler
rewrite was made. Full canonical release checks and fresh exact-original paid
reruns remain root-owned. No paid/provider calls, production changes, deploy,
full suite, commits or pushes by this stream. Source is stable for root review
and integration; temporary task logs are retained under /tmp only.

## Local-only current semantic date-scope correction — final focused evidence

The preserved local v3 diagnostic exposed an actual pre-model refusal: the
strict legacy single-date parser marked a reporting range plus reference dates
ambiguous; current `prepareReaderSummary` returned null before any reader call.
The same parser cannot recognize a slash range. A first hint-only correction
also exposed answer framing as a second problem: ordinary reporting boundaries
in answer prose failed the factual date check, while exempting query dates
would falsely authorize invented events on those dates.

The current reader now resolves scope in its existing single semantic call.
Required wire fields `scopeStatus` and `scopeQuote` carry its temporal judgment
and an exact contiguous original-subject quote (maximum 500 characters).
The server presents that quote explicitly as request context, outside the
factual answer; it never acts as source evidence. All answer dates/numbers
continue to require the actual relevant source text, including a date matching
a recognized single-day hint. `needs_clarification` emits no reusable facts and
returns `insufficient_evidence`, which existing native reuse refuses before
intake model/claim/writer. Current preparation treats the legacy date parser
only as a hint, preserves the entire original task and permits named/slash
ranges to reach the same reader; strict legacy V1 pack/validator is unchanged.
Cache identity is now `reader-summary/v4`; there is no global cache purge,
legacy-output fallback, extra reader call or custom date-language classifier.

Production path for this correction:
`libraries/nestjs-libraries/src/content-intelligence/research/reader-summary.ts`.
Frozen file SHA256:
`909111c69923098d27c18d836d676106b57975a70dfce0a000f69ced4433ca45`.
Root independently built this hash before starting its local final rerun;
production source remained unchanged throughout the final tests.

Meaningful regressions exercise the real producer with explicit exact queries
and English, Russian and slash ranges plus prior-reference dates. The model
port receives the original task, source event 15 October is retained, and
scope is displayed separately. Pure compiler checks refuse invented event
19 October, scope-end event 20 October and a single as-of hint 20 October when
none is in source text. An actual-producer impossible-date response with an
otherwise relevant literal source remains inspectable, but native create is
refused before any intake model, continuation claim, writer or fetch. The
installed SDK test asserts every new wire property is required. Shared fake
endpoints supply the actual new fields; the production boundary has no repair
fallback. Existing query, usage, quota, admission and legacy validation checks
remain intact. The admission diagnostics fixture explicitly judges retained
irrelevant/repetitive source pages instead of defaulting every capture to
relevant.

Focused final command (Node 22.23.2 / pnpm 10.6.1):

`PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand --coverage=false tests/web.research.*.test.cjs tests/intake.research-reuse.test.cjs tests/agent-capabilities.adapters.test.cjs`

Exit 0: **18 suites / 595 tests passed**. Log:
`/tmp/cf-research-scope-contract-consumers-final-20261020.log`.
The earlier focused six-suite pass was **312 tests**; broader first pass caught
three stale fake-endpoint expectations, corrected with explicit current wire
or precise reader-only/semantic verdict assertions. No production weakening.
`git diff --check`: exit 0. Root-owned handoff/outcome/plan preserved.

Additional focused test paths changed in this correction:
`tests/helpers/reader-source-review.cjs`,
`tests/intake.research-reuse.test.cjs`,
`tests/web.research.reader-summary.test.cjs`,
`tests/web.research.reader-source-review.test.cjs`,
`tests/web.research.reader-schema-transport.test.cjs`,
`tests/web.research.advertising-query.test.cjs`,
`tests/web.research.admission-diagnostics.test.cjs`.

This is local implementation and focused contract evidence, not live editorial
acceptance. Scope interpretation remains the one semantic reader's bounded
judgment. Root owns private local paid reruns, runtime and outcome; this stream
made no provider calls, runtime edits, restarts, deploys, full-suite runs,
commits or pushes.
