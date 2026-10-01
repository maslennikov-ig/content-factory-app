---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-0qgn-search-summary/stage-manifest.json
stream_owner: search_summary
orchestration_level: slice_acceptance
scope_kind: product_slice
task_id: content-factory-next-ec48.7
stage_id: content-factory-next-0qgn-search-summary
epic_id: content-factory-next-0qgn
repo: content-factory-next
branch: codex/remaining-work-2026-10-01
base_branch: main
base_commit: 9275ea47272675bc761c4a54cfb9a1034188c011
worktree: /home/me/code/content-factory-next
subagent_model: gpt-6.1-sol
reasoning_effort: max
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: inspected shared checkout after acceptance, no child-owned runtime, branch or worktree to remove; unrelated work preserved
risk_level: high
risk_tags:
  - model-backed-summary
  - source-faithfulness
  - usage-budget
verification:
  - Worker focused RED then GREEN, final 25 tests passed
  - Root complete six-suite search set, 134 tests passed and zero skips
  - Root backend tsc --noEmit --incremental false passed
  - Independent bounded review found no implementation blocker; P3 language doc mismatch corrected
changed_files:
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - tests/web.research.summary-language.test.cjs
  - tests/review-fact-check.test.cjs
affected_surfaces:
  - research-summary
  - search-consumers
invariants:
  - one-metered-cheap-summary-pass
  - accepted-source-context
  - current-and-forecast-distinction
  - no-caller-query-summary-spend
  - single-answer-fastpath
  - source-and-fact-arrays-preserved
  - first-answer-failure-fallback
evidence:
  - search-summary-root-proof
explicit_defers:
  - Original live semantic faithfulness and source-name quality need separately authorized real search/model acceptance
  - No application deployment, provider/search calls, new credentials or pricing decision
---

# Summary

Root accepted the local reader-summary slice after stable worker delivery,
all six affected core search suites, backend types and independent review.
Different provider answers are deduplicated and merged/translated together in
one cheap classify-role operation. Bounded subject, answers, accepted source
titles/excerpts/dates are untrusted evidence. Prompt instructions preserve source
names and numbers, distinguish dated facts from forecasts, and disclose unresolved
conflicts. Source and fact arrays retain their original provenance and content.

Single same-language and duplicate-answer fastpaths remain. Caller-supplied fact
queries never buy synthesis or translation. Without an explicit language, a merge
uses classified ru/en; other classified languages use the first answer's language.
Malformed, empty or failed synthesis keeps the first nonempty provider answer,
while search sources/facts stay available. No retry or second translation call.

# Verification

Exact root command and source hashes: `../root-acceptance.json`. Root passed
134/134 tests without filtering/skips, covering full service, summary-language,
degradation, metering, phase-one and discovery-judge suites. Backend types passed.
Worker RED reproduced the original concatenation/no-grounding behavior; a further
RED reproduced provider-order language selection. Final focused GREEN was25/25.

Independent review returned no implementation blocker. Its P3 identified only
an unqualified language promise in docs; root specified supported ru/en and the
other-language fallback. No source changed after the passing code checks.

# Risks / Follow-ups

Prompt/mocked tests prove input/flow/failure/metering contracts, not actual model
truthfulness. The reported live source-name/current-forecast examples still need
real acceptance under separate paid-call authority. Original Bead scope is
unchanged and remains in progress; the epic is not complete.

# Delivery and cleanup

Shared-checkout delivery accepted by root. No child-owned runtime, worktree or
branch tail exists. Review was read-only; its finding/delivery/acceptance and
safe-only cleanup are recorded here. No dependency, schema, workflow, key,
provider, real account, live database or publication changed.

# Release correction — caller-query consumer

Full release attempt at 9ba899953030 identified a stale private-method spy in
review-fact-check.test.cjs after summaryInLanguage was replaced. Search worker
owned only that consumer test: original RED reproduced the TypeError; GREEN
passed 56/56. The test now observes all prompt invocations and proves none occur
for caller-supplied queries, preserving its model-role, query and unchanged-answer
assertions. Root inspected/accepted this bounded delivery. No service changed.
Shared-checkout cleanup not applicable; no runtime, worktree or external call.
The failed full run has no release receipt; exact corrected HEAD must rerun it.
