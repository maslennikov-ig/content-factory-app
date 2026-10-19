---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-j9p5-implementation-20261018/stage-manifest.json
stream_owner: acceptance_fixtures
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root epic acceptance
public_facade: existing native controller and tools
bounded_acceptance: test fixture wiring; whole epic acceptance remains root-owned
task_id: content-factory-next-j9p5.6
epic_id: content-factory-next-j9p5
stage_id: content-factory-next-j9p5-implementation-20261018
session_id: content-factory-next-j9p5
milestone: model-led-assistant
milestone_status: accepted
agent_type: worker
subagent_model: gpt-6.1-sol
reasoning_effort: high
model_reasoning_rationale: isolated test fixture updates while root repairs actual source
repo: content-factory-next
branch: codex/j9p5-model-led-20261018
base_branch: codex/tgeq-manual-width-20261018
base_commit: 4305609a6
worktree: /home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018
parallel_group: acceptance_fixtures
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
  - concurrency
  - retry
  - atomicity
  - idempotency

affected_surfaces:
  - backend
  - api

invariants:
  - tenancy
  - idempotency
  - state-transition
  - rollback

verification:
  - Focused five Jest files65checks and eight native HTTP scenarios18turns passed; see delivery evidence
changed_files:
  - tests/agent-doors.test.cjs
  - tests/agent-piece-explicit-title.test.cjs
  - tests/agent-proposal-preview.contract.test.cjs
  - tests/web.research.event-material.test.cjs
  - tests/fixtures/agent-scenarios
explicit_defers:
  - Whole epic acceptance, actual model quality and separately authorized delivery remain root-owned
---

# Summary

Accepted test-only delivery: sixty-five checks across five affected Jest files and eight native controller scenarios with eighteen HTTP turns. Four new capabilities are exercised through the real controller, Mastra adapter, client stream reader and operation ledger. Native scenario models and domain ports are scripted. No natural-model or production acceptance is inferred. Root reviewed changed fixtures and retained their persistence, provenance, ownership and no-write assertions.

# Verification

See ../evidence/acceptance-fixtures-delivery.md and ../evidence/acceptance-fixtures-scenarios-receipt.json for exact commands and logs. Focused checks passed; root owns the complete configured release acceptance.

# Risks / Follow-ups

Shared root worktree; worker finished without commits, paid calls or background runtimes. Source and evidence retained. Safe cleanup complete. No foreign runtime or data changed.


## Production date-role contract diagnosis, accepted by root

Read-only follow-up on a0d00a42b found that invalid_event_context conflates model date-basis/status decisions with source-span failures; it does not establish a lexical source-context veto. Brief V12 and digest V4 leave ambiguity between subject-identifying dates and requested report intervals, and between a common dated heading and a distant item in its section. Root accepts these bounded findings and owns versioned prompt/diagnostic corrections plus natural acceptance. Exact raw production digest fields were unavailable, so no particular missing span is claimed. The first production control is retained as incomplete: zero pieces, terminal failed agent admission and possible provider billing after the shared deadline. The browser draft assertion targeted an administrative input and is a harness defect, not demonstrated product data loss. Worker made no edits, tests, paid calls, SSH, configuration reads or runtime resources; safe-only cleanup is complete.


Root accepts the subsequent read-only correction review: the real service consumes V13/V5; their schemas remain compatible and V5 delegates all admission to unchanged V4. Only date-role instructions and finite diagnostic counters change. No further defect was found in the bounded diff; success still requires the natural control. No edits, tests, paid calls, SSH, configuration access or resources were made by the reviewer; cleanup complete.


Read-only V2 review found two mode-dependent priorCoverageEnd branches. Root reproduced the overlapping-boundary failure in a regression and accepts the finding for correction. Explicit boundaries must apply irrespective of a descriptive mode; legacy resolver policy remains frozen. Reviewer made no edits, tests, paid calls, configuration reads, SSH or resources. Safe-only cleanup complete.


Read-only confirmation accepts the corrected V2 prior-coverage overlap and derived-interval branches irrespective of descriptive mode. Legacy policy remains unchanged; service V2 -> V5 -> V4 consumers are consistent. No further regression found in the bounded correction. No edits, tests, paid calls, SSH, configuration access or resources; cleanup complete.


Read-only follow-up confirmed a duplicate sufficiency veto: native conductor-selected admitted facts still bought a second brief assessment and could be refused despite permitted gaps. Root accepts the bounded finding, reproduced the refused save, and is correcting only trusted model-origin continuation. Manual/person/legacy flow, unanswered private questions, source admission, ownership, atomic claims and no-replay remain required. Existing actual research limitations must reach the writer and survive subsequent native writes. Reviewer made no edits, tests, paid calls, configuration access, SSH or resources; cleanup complete.


Read-only review accepts the actual duplicate-veto correction. Only trusted model-origin continuation with nonempty admitted selected research skips the extra sufficiency call and blanket veto; status remains partial and inputSufficient is not promoted. Native questions, manual/legacy flow, ownership/key/source admission and atomic no-replay remain. V20 receives actual research coverage/gaps, including model-origin existing-core apply, author answers and rebuild. No further bounded finding. Reviewer made no edits, tests, paid calls, SSH, configuration access or resources; safe cleanup complete.


Read-only final scope-propagation review accepted (completion event ed089534-59f8-4bd5-9456-a75d296746c3). The current request stores its resolved intent before digest, including normalized general scope; requestless legacy remains unchanged. The positive regression checks resumePlan rather than inventing a temporal summary field. Inverted explicit-boundary refusals still prove no search/model/write. Root verified 52 affected suites and 1070 tests. Reviewer made no edits, tests, paid calls, SSH, configuration reads or runtime resources; safe-only cleanup is complete.
