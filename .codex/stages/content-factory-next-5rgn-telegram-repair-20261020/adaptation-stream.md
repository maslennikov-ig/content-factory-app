# Adaptation completeness stream

Task: `content-factory-next-5rgn`.
Checkout: `/home/me/code/content-factory-next-worktrees/telegram-pipeline-repair-20261020`.
Branch: `codex/telegram-pipeline-repair-20261020`.
Owner: adaptation/completeness worker. Delivered to root; root owns final
integration, release acceptance and the two real model reruns. No commit made.

## Diagnosis and implementation

1. `briefBlock` carried the complete core, but `renderContext` simultaneously
   required every external name/date/number to occur in an 800-character source
   prefix. The rules now distinguish author statements, selected source-linked
   material and actual admitted source support. An unrelated excerpt is not an
   exhaustive list of the piece's topics. Source conflicts and unsupported
   external assertions remain disallowed; an id/URL/checked flag is not proof.
2. Structured original assignment goal/outputs/requirements and instruction text
   reach the generator separately from the core. Reference material is not
   copied into the assignment prompt. Existing selected facts now retain their
   optional `evidenceId` and literal `quote` in generation hints. Quote support
   matches the admitted evidence id, canonical URL and actual normalized literal
   source text. Semantic entailment is assessed by the reviewer, not inferred
   from matching ids or tokens.
3. Context selection v2 retains explicitly selected evidence and web-search
   supporting quotes up to 8,000 characters each, within the unchanged eight
   evidence / 12,000 total character budget. Ordinary ranked confirmed evidence
   retains its 800-character cap. Build and readback use the same limits, and
   old v1 snapshots keep their historical 800-character rendering. Over-budget,
   stale, removed, conflicted and unaccepted-source gates remain in place.
4. The final existing `generate-content-fix` node runs after bounded voice
   selection: one accounted `review`, at most one accounted `draft` repair, and
   one final accounted `review`. There is no recursive regeneration or second
   repair. Only a final `passed` verdict with empty findings reaches a ready
   version. A failed/partial/malformed/unavailable review raises
   `CONTENT_ADAPTATION_INCOMPLETE` before persistence. The owned error stream
   retains `missingRequirements`, `unsupportedClaims` and the paid
   `incompleteDraft` (`hook`, `content`) without logging its text.
5. Completeness means all requested major supported topics and purpose, not
   every original sentence/number. Hard channel/provider limits can justify
   combining entries and compressing secondary details. Voice sample lengths
   cannot justify dropping the requested scope. Statistical avatar trimming is
   skipped for a piece core; the actual channel/provider/caption limit still
   applies. Initial and repair output token budgets derive from core/selected
   material size within that actual limit, rather than the avatar's short
   sample range.
6. A deterministic final length check measures each complete post including the
   hook. The same opening/body deduplication helper is used by persistence.
   An over-limit result becomes a finding in the same bounded repair path;
   even a model verdict of `passed` cannot authorize an over-limit final post.
   Caption limits and scaled post/channel length policies are included.
7. Persistence now saves hook + body in the adaptation, channel-rendered post
   and emitted content. An opening already present at the start is not doubled.
   Citation-label removal still precedes persistence. The semantic repair keeps
   source-id validation and the existing anti-copy policy; final anti-copy
   reporting is recomputed for the complete accepted post when applicable.

## Changed paths

- `libraries/nestjs-libraries/src/agent/agent.graph.service.ts`
- `libraries/nestjs-libraries/src/agent/generator-run-input.ts`
- `libraries/nestjs-libraries/src/agent/adaptation-coverage.ts` (new)
- `libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts`
- `libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts`
- `tests/agent.adaptation-coverage.test.cjs` (new)
- `tests/content-context.builder.test.cjs`
- `tests/content-pieces.service.test.cjs`

No changes to `scripts/evidence/voice-eval/product-graph.cjs`; the token-budget
regression uses direct `loadWithMocks` with the real generation service.
Concurrent source/intake/chat/root changes were preserved. No schema changes.

## Focused verification

Environment confirmed: Node `v22.23.2`, pnpm `10.6.1`.
Commands run from the checkout named above. The output below is an excerpt of
observed tool output, not a claim that complete raw logs were saved to disk.

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand tests/agent.adaptation-coverage.test.cjs tests/content-pieces.service.test.cjs tests/agent.intake-hints.test.cjs tests/agent.citation-retry.test.cjs tests/agent.length-trim-measures-whole-post.test.cjs tests/agent.content-material-echo.test.cjs tests/agent.draft-pick-graph.test.cjs
```

Exit 0, tool exec session `65340`:

```text
PASS tests/content-pieces.service.test.cjs
PASS tests/agent.intake-hints.test.cjs (8 s)
PASS tests/agent.length-trim-measures-whole-post.test.cjs
PASS tests/agent.content-material-echo.test.cjs
PASS tests/agent.citation-retry.test.cjs
PASS tests/agent.adaptation-coverage.test.cjs
PASS tests/agent.draft-pick-graph.test.cjs
Test Suites: 7 passed, 7 total
Tests:       183 passed, 183 total
Snapshots:   0 total
Time:        18.86 s
```

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec node --test tests/content-context.builder.test.cjs
```

Exit 0, tool exec session `10268`; builder inputs unchanged after this check:

```text
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 617.040976
```

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec tsc --noEmit --project apps/backend/tsconfig.json --incremental false
git diff --check
```

Both exit 0. Latest TypeScript session `24168`, empty diagnostic output.
New helper and test were formatted with:

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec prettier --write libraries/nestjs-libraries/src/agent/adaptation-coverage.ts tests/agent.adaptation-coverage.test.cjs
```

Exit 0. No broad suite/build/release acceptance run by this worker.

## Meaningful regressions

- Multi-topic snippet -> one repair -> re-review with all topics; captured
  original request, admitted support and complete hook/body in each review.
- Source conflict (`21` claimed, source says `12`) remains incomplete after
  a failed repair; no automatic success from an evidence id.
- Literal support rejects wrong evidence ids, URLs, invented or absent quotes.
- Explicit source support beyond offset 800 survives snapshot readback, while
  ordinary ranked and historical v1 excerpts keep their cap.
- `piece generation and repair budgets cover the core under the real cap
  despite a tiny avatar`: actual `getChatModel` calls use token ceilings
  `[2131, 3000, 2131, 3000]` for initial draft / review / repair / review when
  the core is larger than 1,500 chars, channel hardMax is 1,500 and avatar high
  is 200. The repair uses role `draft`; both reviews use role `review`.
- `whole-post hardMax, including the hook, forces the one repair even if the
  model says passed`: a 210-char body plus 20-char opening and separator is
  232 chars against a 220-char hardMax; the deterministic finding triggers
  the single repair, then an accepted complete result fits.
- `a passed semantic verdict cannot save a repaired whole post above the
  caption limit`: a 70-char body plus 20-char opening and separator exceeds
  caption limit 80 both before/after repair; final model `passed` is refused.
- Source-free repair accepts nullable optional citations as an empty list.
- Real assembled `StateGraph` success exposes final `adaptationCoverage` and
  opening/body. Failure emits the explicit incomplete diagnostic without a
  `content[]` ready result. No-core ordinary generation makes no new reviews.
- Native PieceService adaptation persists hook/body into the post,
  adaptation and event, including a hook's sole number, with no duplicate;
  selected evidence identity/quote reaches generation hints unchanged.

## Boundaries and remaining acceptance

Documentation: current local source/contracts and the accepted repair plan;
no external dependency/version behavior was introduced or claimed.
Asset routing: existing AgentGraph, source context and PieceService only.
Graph-reviewed: the working checkout has no local graph. A focused read-only
query against the owner's `/home/me/code/content-factory-next/graphify-out/graph.json`
for `generateContent` returned `no_match`; that graph is based on `dd67538d`,
different from this checkout's `ec3839123f9b1341d078b273955f4812e7d2a951`.
The exact current source was verified directly; no graph refresh/mutation.

No paid/model/provider/live calls, production writes, social publication,
credentials changes, deployment, commits or pushes. No temporary services,
worktrees or external resources created by this stream.

The tests prove data flow, gates, budgets, retry bounds and persistence with
mocked model verdicts. They do not prove actual semantic/editorial quality,
source entailment by a real model, or production delivery. Root must read both
real saved reruns against the original scope, voice, sources and publication
state. Missing live proof remains UNKNOWN.

## Release-suite fixture follow-up

The root's first full run on source `6cbd9ffb0` exposed an outdated integration
fixture in `tests/draft-empty-schedule.test.cjs`: the real compiled graph now
calls `executeAiOperation(..., 'review')`, but that fixture only supplied stream
admission and the four original category/topic/hook/content model responses.
This was a fixture contract gap, not a production bypass or scheduling defect.

Only that test was changed: its model recognizes the bounded coverage-review
schema and inspects the known complete tiny core; its usage port records and
asserts the separate tenant-scoped `review` operation. Adaptations assert four
original drafting nodes plus exactly one review. Public two-argument generator
and controller cases have no piece core, so they retain four original calls and
no additional review. All prior scheduling, lock/re-read, reserve/autopilot,
unscheduled DRAFT, UTC, tenant and save-failure assertions remain in place.
Other inspected graph fixtures either use no core or a deliberately empty
compiled graph; no analogous confirmed failure required edits.

```sh
PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH pnpm exec jest --runInBand tests/draft-empty-schedule.test.cjs
git diff --check
```

Both exit 0. Focused test tool session `92090`:

```text
PASS tests/draft-empty-schedule.test.cjs (6.207 s)
Test Suites: 1 passed, 1 total
Tests:       41 passed, 41 total
Snapshots:   0 total
Time:        6.241 s
```

No production source changes, bypasses, model/provider calls or commits in this
follow-up. Root owns the next clean-HEAD full-suite run and release receipt.
