---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-j9p5-implementation-20261018/stage-manifest.json
stream_owner: intake_semantics
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: native conductor and shared services
public_facade: existing scoped domain services
bounded_acceptance: model intent, useful evidence and safe native execution
task_id: content-factory-next-j9p5.1
epic_id: content-factory-next-j9p5
stage_id: content-factory-next-j9p5-implementation-20261018
session_id: content-factory-next-j9p5
milestone: model-led-assistant
milestone_status: accepted
agent_type: worker
subagent_model: gpt-6.1-sol
reasoning_effort: max
model_reasoning_rationale: bounded backend semantics and accounting stream
repo: content-factory-next
branch: codex/j9p5-model-led-20261018
base_branch: codex/tgeq-manual-width-20261018
base_commit: 4305609a6
worktree: /home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018
parallel_group: intake_semantics
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared root worktree; no independent child branch, process or worktree remains. Source and evidence retained. No foreign cleanup.
risk_level: high
docs_impact: api-contract
docs_reviewed: updated
docs_review_notes: Generic model-led product contract and execution budget runbook updated.

risk_tags:
  - data
  - state-transition
  - public-api

affected_surfaces:
  - backend
  - api

invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback

verification:
  - Composed intake19 and root recovery84 checks: passed; native SDK schema conversion and continuity checks: passed

changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/request-understanding.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v12.ts
  - libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.v4.ts
  - libraries/nestjs-libraries/src/content-intelligence/pieces/core-write-prompt.v19.ts
explicit_defers:
  - content-factory-next-j9p5.6 root integrated acceptance and separately authorized delivery remain pending
---

# Summary

Original delegated source accepted; root completed manual URL/meaning follow-up after resume, fixed provider schema compatibility and instruction evidence consumption. Root then simplified conductor inputs to verbatim text plus labelled context, leaving typed interpretation to the existing native brief model. Focused source/provider-contract and continuity checks recorded under evidence. Root full-epic acceptance remains pending.

# Intake / research semantics delivery

Owner: `intake_semantics`; scope: j9p5.1, .2, .4. No commit, provider call,
deployment, or production mutation was performed by this child stream.
Root owns integration and the single final acceptance set.

## Consumed contracts

- `intake/request-understanding.ts`: `intakeRequestSchemaV1` and
  `IntakeUnderstandingV1`, supplied to `IntakeService.prepare(org, body)` as
  `body.request`. It carries goal, requested outputs, labelled material roles
  and origins, evidence needs, relevant constraints and unresolved choices.
  Machine calendar dates/timestamps are validated. `body.input` remains
  verbatim, independent of the understood goal.
- `IntakeService.researchExistingCore(..., direction?, context?)` accepts
  `context.request?: IntakeUnderstandingV1` alongside the compatible explicit
  researchTask/priorExample/timeZone fields. Root owns PieceService wiring.
- `readResearchSnapshot(org, user, snapshotKey)` returns null or the actual
  owner-scoped input/request/facts/summary/corrections/evidence/selection and
  continuation status. Root can expose the evidence before deciding to write.
- `selectCoreResearchForModel(state, input, language, selectedKeys)` applies
  existing native selection and records `researchSelection` with origin model,
  selected keys and timestamp. Unknown/unverified keys, requested human
  selection and empty/failed/clarification outcomes are rejected.
- `async *selectResearchForModel(org, user, snapshotKey, selectedKeys)` writes
  from the server-captured plan, preserving original goal and settings. It
  consumes `IntakeSnapshotStore.claim(key, value, seconds)`. Root supplied the
  native Redis SET EX NX provider shim. Successful repeats return saved events;
  writing/failed/uncertain receipts block automatic retry. Missing atomic
  support fails before writing. Genuine manual resumes also consume the native
  claim when available. Expired/foreign snapshots never repeat paid research.

## Result semantics and writing

- `research-intent.ts` no longer extracts task/reference/period meaning from
  phrases. It validates and calculates explicit model-selected boundaries with
  the trusted clock/timezone. Conflicting/invalid structured boundaries produce
  an unresolved result. Calendar grammar remains only for source retrieval.
- `intake.prompts.v12.ts` reuses brief filling for direct/manual understanding
  without an additional planner call. Questions are model-selected and limited
  to required author-owned information or private choices. Zero questions is
  valid. `inputSufficient` is consumed; an unsupported result is not fabricated.
- `research-digest.v4.ts` uses the existing digest call for source-grounded
  findings, temporal/source roles and request-specific sufficiency. General
  factual comparisons do not require event dates. The manual existing-core
  path can obtain its explicit temporal constraint from this same digest call.
  Code verifies known source/claim keys, faithful source spans, valid explicit
  calendar values and interval membership; neighbouring future wording and
  metadata phrase dictionaries do not decide event meaning. Original quote
  punctuation/whitespace is recovered from source material.
- Research summary adds status, assessment, requestedScope, gaps and
  suggestedQueries while preserving existing counts and temporal fields. Raw
  unverified snippets are inspectable material, not successful found facts.
  Empty/failed outcomes produce no successful selection card or fabricated core.
- `core-write-prompt.v19.ts` consumes the understood task and labelled material.
  Routine editorial decisions need no manual delegation. First person, stance
  and personal experience are required only when the actual goal/material
  calls for them. Source quotes/URLs/date provenance reach the writer. Explicit
  titles and native original data remain saved. Research selection origin and
  outcome are stored on the native core.
- Released prompt modules remain importable. Legacy direct/manual request
  fields remain accepted. Material ownership, source/quote integrity, tenant
  checks, source network rules, billing and source caps remain in their owners.

## Exact changed source files

- `libraries/nestjs-libraries/src/content-intelligence/intake/request-understanding.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v12.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.v4.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/intake-snapshot.store.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/intake.errors.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/research-intent.ts`
- `libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.ts`
- `libraries/nestjs-libraries/src/content-intelligence/pieces/core-write.ts`
- `libraries/nestjs-libraries/src/content-intelligence/pieces/core-write-prompt.v19.ts`
- `libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts`
- `libraries/nestjs-libraries/src/dtos/content-intelligence/content-intake.dto.ts`
- `libraries/nestjs-libraries/src/dtos/content-intelligence/piece-research.dto.ts`
- `libraries/nestjs-libraries/src/openai/research-event-material.ts`

## Verification handoff

Performed: TypeScript transpile syntax diagnostics for nine owned source files,
zero errors (not a typecheck); modified CJS syntax checks; scoped
`git diff --check`, exit 0. No test suite or paid model replay was run by this
stream. Root must inspect/run the combined final checks.

Add to root's focused set:

- `tests/intake.model-led.test.cjs` (new): original/understood composition,
  manual no-search path, exact title/author material, useful/private questions,
  stable factual evidence, temporal context, exact quotes, empty outcome,
  private snapshots, model provenance, native atomic race/repeat, missing
  atomic support, uncertain saves, insufficient inputs and expired snapshots.
- `tests/research-intent.period.test.cjs` (updated): frozen incident with an
  explicit model boundary; varied wording; trusted calendar/DST; invalid and
  missing explicit boundaries; source integrity without phrase vetoes.
- `tests/intake.period-research.test.cjs` (updated): common manual/chat scope,
  retained original input/reference, temporal provenance and empty outcomes.
- `tests/research-digest.temporal-provenance.test.cjs` (updated): common
  provenance aliases, punctuation normalization, source absence and date gaps.
- `tests/content-intake.kind-truth.test.cjs` (updated fixtures): explicit
  material ownership and genuinely model-issued personal questions; snapshot
  tests use an actual supported research result instead of an empty success card.
- `tests/content-intake.research.test.cjs` (updated additive summary and honest
  digest-failure expectations).
- `tests/content-intake.service.test.cjs` (updated removed forced-stance rule).
- Existing `tests/core-write-*.test.cjs`, `tests/intake-research-digest.test.cjs`,
  `tests/web.research.service.test.cjs` and DTO/contract tests remain relevant.

Remaining acceptance limits: model quality/generalization and real provider
research have not been established by these local fixtures. Native graph was
borrowed read-only from owner checkout baseline `dd67538d`; the focused
IntakeService import query identified the controller, module, piece capability
and PieceService consumers, then current sources were checked. The graph is
stale against this worktree and was not refreshed. `graph-reviewed`.

## Review correction and composed diagnostic

The follow-up review found that a snapshot's pending/completed events could be
returned before checking the new selection. Corrected in IntakeService: the
in-process pending entry, native atomic claim and saved continuation receipt
now bind both origin and the canonical sorted fact-key set. A different valid
selection, unknown selection after a claimed write, or person/model origin
change returns `INTAKE_RESEARCH_SELECTION_CONFLICT` (409). The same set in a
different order can reuse the saved result; malformed first selections do not
claim the snapshot. Concurrent different choices cannot join one write.

Human-selection authority now has a trusted internal policy. The exact APIs are
`prepare(org, body, { researchSelectionPolicy: 'model' | 'person' })` and the
same optional policy in `researchExistingCore`'s internal context. Default and
legacy policy is person; HTTP/body fields cannot grant the model policy.
Model-origin selection requires an explicit saved model policy and no requested
human-selection constraint. Root wired these internal call-site arguments.

Changed in this correction: `intake/intake.service.ts`,
`tests/intake.model-led.test.cjs` and new
`tests/agent.model-intake-composition.test.cjs`. The composition test passes the
actual IntakeService through `loadRegistry`/`servicesFrom` and the real
`piece.create` adapter. It covers empty, failed and needs-clarification research
events with no selection-required/piece event, no card suspension or write,
trusted top-level machine status and source data under the native untrusted
evidence wrapper. It verifies original scope and actual gaps reach model output.

Executed with Node 22.23.2, without network or paid calls:

```bash
pnpm exec jest --runInBand --runTestsByPath tests/intake.model-led.test.cjs tests/agent.model-intake-composition.test.cjs --coverage=false --watch=false
```

Result: 2 suites, 19 tests passed, exit 0. The first diagnostic exposed a test
assertion that omitted the required untrusted-data wrapper; that assertion was
corrected against the real adapter contract. After root finalized the projection
with machine fields outside the evidence wrapper, only the affected composition
suite was rerun:

```bash
pnpm exec jest --runInBand --runTestsByPath tests/agent.model-intake-composition.test.cjs --coverage=false --watch=false
```

Result: 1 suite, 3 tests passed, exit 0. Service/correction source was unchanged
after its 16 passing cases. Root still owns integrated build/full acceptance.
Source frozen after this delivery; no commit or cleanup of other owners' work.

# Verification

The scoped observations above are accepted for integration. Root release acceptance is pending and no provider or production success is inferred from fixture checks.

# Risks / Follow-ups

Root owns the integrated acceptance and delivery boundary under content-factory-next-j9p5.6. Source rollback preserves native history, originals, consent and ledger records. Shared-root resources have been cleaned only where ownership was verified; no foreign runtime, graph, branch or data was changed.
