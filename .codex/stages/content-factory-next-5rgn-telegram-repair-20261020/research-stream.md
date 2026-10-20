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
