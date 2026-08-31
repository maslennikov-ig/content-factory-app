---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave3-rcg.2
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: tests/design.guard.test.cjs
public_facade: checked-in design geometry debt ledger
bounded_acceptance: every numeric pixel length inside an arbitrary bracket payload in TSX/JSX string or template literal fragments is canonicalized and checked against an exact shrink-only file/value/count ledger
non_goals:
  - No production UI or component changes
  - No weakening of the 4px rhythm
  - No stale or file-only allowance
evidence:
  - metric_scan
  - git_history
  - review_correction
  - ast_reconciliation
  - mutation_proof
task_id: content-factory-next-rcg.2
epic_id: content-factory-next-rcg
stage_id: content-factory-next-l9s
session_id: n/a
milestone: close the review bypass and mutation-prove the AST geometry-debt guard
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-sol
reasoning_effort: xhigh
model_reasoning_rationale: exact debt baselines and non-bypassable shrink-only ledgers are high-risk quality-gate semantics
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-3
base_branch: main
base_commit: bd643d67
worktree: /home/me/code/content-factory-next
write_zone:
  - tests/design.guard.test.cjs
  - tests/design-geometry-allowlist.json
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.2.md
success_criteria:
  - Preserve proof that 3284 arbitrary-pixel occurrences, 101 denominations, and 1228 off-rhythm occurrences existed at 7e09f75d and use the already-shrunk current 3279/101/1224 baseline.
  - Scan all AST string and template literal fragments, including constants later passed to clsx, while excluding comments.
  - Extract and canonicalize every integer, decimal, and signed pixel length inside each arbitrary bracket payload.
  - Reject compound grid, decimal spacing, and arbitrary-property mutations with their exact file path and value.
  - Keep the existing debt behind a checked-in shrink-only occurrence ledger.
selected_docs:
  - AGENTS.md
  - PRODUCT.md
  - DESIGN.md
  - docs/design/component-authoring-rules.md
  - tests/design.guard.test.cjs
selected_skills:
  - superpowers:test-driven-development
  - superpowers:test-driven-development/writing-good-tests.md
  - superpowers:receiving-code-review
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - impeccable
  - impeccable/reference/product.md
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: none
depends_on_streams:
  - none
parallel_decision: sequential_gate
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree; all compound, decimal, property, and stale-ledger TSX mutations were reverted and no branch or runtime cleanup was needed.
risk_level: high
verification_tier: inner
risk_tags:
  - design-system
  - test-infrastructure
affected_surfaces:
  - frontend-tests
invariants:
  - exact-debt-ledger
  - shrink-only-allowance
docs_impact: tests-only quality gate
docs_reviewed: no-change-needed
docs_review_notes: The project contract still requires a 4px rhythm. The review correction aligns the executable guard with that existing contract and needs no product-doc change.
verification:
  - "Historical positive-integer exact-bracket scan at 7e09f75d: 3284 occurrences, 101 denominations, 1228 off-rhythm."
  - "The same scan at current HEAD b088d5a8: 3279 occurrences, 101 denominations, 1224 off-rhythm."
  - "Multiset diff 7e09f75d..HEAD: media.component.tsx removed one each of 5px, 6px, 8px, 10px, and 30px; four removed values are off-rhythm."
  - "git diff 7e09f75d..HEAD identifies b3aae4fa as the change that removed the disconnected Polotno editor controls carrying those five occurrences."
  - "TDD RED, pnpm exec jest tests/design.guard.test.cjs --runInBand: existing debt produced 513 unallowed file/value groups and actualTotal 1224 against an empty ledger."
  - "TDD GREEN, same target: passed 1 suite, 9 tests after the exact checked-in ledger was added."
  - "New-group mutation RED: temporary button.tsx w-[7px] failed with apps/frontend/src/components/ui/button.tsx: 7px occurs 1 time(s), allowed 0; cleanup GREEN passed 9/9."
  - "Increased-group mutation RED: temporary second 7px in creation.method.badge.tsx failed with 7px occurs 2 time(s), allowed 1."
  - "Stale-ledger mutation RED: temporary 7px to 8px repayment in github.component.tsx failed with 7px occurs 1 time(s), allowed 2."
  - "Final focused Jest after all mutation cleanup: passed 1 suite, 9 tests."
  - "Initial scanner proof: 3279 arbitrary occurrences, 101 denominations, 1224 off-rhythm at b088d5a8; declared total and exact ledger sum were both 1224 before later wave-3 debt repayment."
  - "Independent review reproduced a bypass: grid-cols-[7px_1fr], p-[2.5px], and [margin:7px] each left the exact-integer raw-source guard green."
  - "Review-correction RED: AST scan against the prior 1221 ledger reported actualTotal 1226, newly visible compound/decimal/signed groups, and 12 stale comment-only occurrences."
  - "Coverage reconciliation at c568caaa: prior scanner 1221 occurrences/513 groups/149 files/52 denominations; AST scanner 1226/517/148/55."
  - "Gross coverage expansion: 17 occurrences = 9 compound integers + 5 decimals + 3 signed values; AST exclusion of 12 non-code comment matches yields net +5 and is not design-debt reduction."
  - "AST fixture covers a class constant, clsx conditional, template literal with multiple px lengths, decimal normalization, signed normalization, and comment exclusion."
  - "Post-fix grid mutation RED: button.tsx grid-cols-[7px_1fr] reported 7px occurs 1 time(s), allowed 0."
  - "Post-fix decimal mutation RED: button.tsx p-[2.5px] reported 2.5px occurs 1 time(s), allowed 0."
  - "Post-fix property mutation RED: button.tsx [margin:7px] reported 7px occurs 1 time(s), allowed 0."
  - "Post-fix shrink proof RED: replacing one calendar p-[2.5px] with p-[4px] reported 2.5px occurs 3 time(s), allowed 4."
  - "Final focused design acceptance: design.guard, design.contrast, and foundation passed 3 suites and 36 tests."
  - "Frontend TypeScript: pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json exited 0 with no output."
  - "git diff --check passed; button.tsx and calendar.tsx temporary mutation targets have no diff."
changed_files:
  - tests/design.guard.test.cjs
  - tests/design-geometry-allowlist.json
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.2.md
explicit_defers:
  - none
---

# Summary

`tests/design.guard.test.cjs` now parses every frontend `.tsx` and `.jsx` file with the TypeScript AST and visits all string and template literal fragments. This catches direct class names, `clsx` branches, template literals, and class constants used later, while comments and code syntax are not mistaken for active classes. Every bracket payload is scanned for all numeric `px` lengths; integers, decimals, explicit signs, compound grids, `calc(...)`, shadows with multiple lengths, and arbitrary properties share one canonical `file + value + count` ledger.

The original metric remains recorded exactly: `7e09f75d` contains 3,284 occurrences across 101 denominations, 1,228 of them off-rhythm. Current HEAD `b088d5a8` is already lower at 3,279 / 101 / 1,224 because `b3aae4fa` removed one each of `5px`, `6px`, `8px`, `10px`, and `30px` from `media.component.tsx`; four were off-rhythm. Root accepted the current 1,224 repository-truth baseline so the guard does not reintroduce paid debt as stale allowance.

Later wave-3 UI work reduced that exact-integer ledger to 1,221 before review. The review correction is a scanner-scope replacement, not a debt claim: the AST scanner exposes 17 previously invisible active occurrences and drops 12 comment-only raw-source matches, resulting in a 1,226-occurrence AST baseline.

# Guard Semantics

The ledger is non-bypassable in both directions. A new file/value pair or a count increase appears in `added`; a removed occurrence appears in `stale`. The checked-in `total` must equal both the sum of all exact allowances and the source's actual total. File-only, wildcard, aligned-value, non-canonical decimal/signed spelling, zero-count, and malformed allowances are rejected. Negative canonical values such as `-10px` and canonical decimals such as `2.5px` are explicit exact keys.

# Verification

- Historical boundary `7e09f75d`: 3,284 total / 101 denominations / 1,228 off-rhythm.
- Current boundary `b088d5a8`: 3,279 total / 101 denominations / 1,224 off-rhythm.
- Exact source delta: `media.component.tsx` counts changed `5px 7→6`, `6px 7→6`, `8px 13→12`, `10px 14→13`, `30px 2→1`.
- `git log 7e09f75d..HEAD -- media.component.tsx` identifies `b3aae4fa feat(privacy): send nothing to anyone but ourselves`.
- Initial TDD RED reported 513 exact groups and total 1,224 against the missing ledger; GREEN passed all 9 guard tests after the generated counts were checked in.
- New-group mutation: temporary `w-[7px]` in `components/ui/button.tsx` failed with the exact file, `7px`, actual count 1 and allowed count 0. After removal, 9/9 passed.
- Increased-group mutation: a second temporary `7px` in `creation.method.badge.tsx` failed with actual count 2 and allowed count 1.
- Shrink proof: temporarily replacing one of two `7px` values in `github.component.tsx` with aligned `8px` failed as stale with actual count 1 and allowed count 2.
- Initial pre-review clean scan: source total 1,224, ledger sum 1,224, declared total 1,224; focused Jest 9/9 and `git diff --check` passed before later wave-3 debt repayment.
- Review reproduction before the fix: all three bypass mutations—`grid-cols-[7px_1fr]`, `p-[2.5px]`, and `[margin:7px]`—left the guard green.
- New AST baseline at `c568caaa`: 1,226 off-rhythm occurrences, 517 groups, 148 files, 55 off-rhythm denominations; all numeric px lengths are 3,272 occurrences across 109 denominations.
- Prior exact scanner at the same source snapshot: 1,221 occurrences, 513 groups, 149 files, 52 denominations.
- Scope reconciliation: 17 newly visible active occurrences comprise 9 compound integers, 5 decimals, and 3 signed values; 12 old occurrences existed only inside a JSX comment block. Net `+5` describes scanner coverage, not new or repaid UI debt.
- The synthetic AST fixture proves a class constant, a `clsx` conditional, a template literal, multiple lengths separated by Tailwind underscores, decimal and signed canonicalization, and comment exclusion.
- After the fix, each required bypass mutation failed with `button.tsx` and the rejected canonical value (`7px`, `2.5px`, `7px`). A temporary decimal repayment also failed stale at `calendar.tsx: 2.5px occurs 3 time(s), allowed 4`.
- Final correction acceptance passed `design.guard`, `design.contrast`, and `foundation`: 3 suites / 36 tests. Frontend TypeScript and `git diff --check` both exited zero, and both temporary production mutation targets are clean.

# Risks / Follow-ups

Only statically visible string and template literal fragments are enforceable; truly runtime-computed arbitrary Tailwind classes are outside any static guard and are also not discoverable by Tailwind's normal class extraction. No residual bypass is known for literal TSX/JSX class construction; root-owned wave acceptance remains pending.

# Documentation / Cleanup

This is a tests-only gate and does not change product documentation. No external API, persistent production edit, branch operation, or commit was made. All temporary TSX mutations were restored before return.
