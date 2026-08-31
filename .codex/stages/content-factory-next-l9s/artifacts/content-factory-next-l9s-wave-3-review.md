---
schema_version: orchestration-artifact/v3
artifact_type: independent-review
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: content-factory-next-l9s.wave3.review
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: root wave-3 acceptance
public_facade: wave-3 diff bd643d67..7079e256
bounded_acceptance: read-only independent correctness review of rcg.1, rcg.2, rcg.3, and rcg.4 source/tests/artifacts with focused verification rerun
non_goals:
  - No production, test, or task-code edits
  - No external API or browser validation
evidence:
  - source_review
  - diff_review
  - focused_acceptance_rerun
  - independent_ast_reconciliation
task_id: content-factory-next-l9s.wave3.review
epic_id: content-factory-next-rcg
stage_id: content-factory-next-l9s
milestone: wave-3 independent correctness review
milestone_status: accepted
agent_type: correctness_reviewer
subagent_model: gpt-5.5
reasoning_effort: high
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-3
base_branch: main
base_commit: bd643d67
reviewed_head: 7079e2560d56e0bbb9532e3d7945ada650ab1f8c
worktree: /home/me/code/content-factory-next
write_zone:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-3-review.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only review. No temporary source mutation, branch, stash, runtime, or external state was created.
risk_level: medium
verification_tier: slice_acceptance
risk_tags:
  - frontend-form-contract
  - design-guard
  - verification-confidence
affected_surfaces:
  - shared-react-form-button
  - design-guard-geometry-ledger
  - migrated-frontend-controls
docs_impact: no durable UI contract change required
docs_reviewed: no-change-needed
docs_review_notes: PRODUCT.md, DESIGN.md, docs/design/component-authoring-rules.md, and docs/design/content-factory-interface-specification.md remain accurate. The initial findings were implementation/test-guard defects and are closed by 7079e256.
verification:
  - "Initial prescribed command on 1f01aade failed before TypeScript: design.contrast reported apps/frontend/src/components/new-launch/manage.modal.tsx:714 text-cf-accent-ink on bg-newBgColorInner; foundation reported stale text-white allowances for developer.component.tsx and media.settings.component.tsx; desert-lab still searched a raw <button> calendar preview trigger."
  - "Follow-up reviewed at c568caaa fixed those three suite failures and updated rcg.4 artifact evidence."
  - "Final prescribed command on c568caaa passed: source \"$HOME/.nvm/nvm.sh\" && nvm use --silent && pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/desert-lab-screen-review.test.cjs tests/agent-opening-band.test.cjs tests/layout-primitives.test.cjs tests/raw-control.guard.test.cjs tests/shared-form-control.contract.test.cjs --runInBand && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && git diff --check bd643d67..HEAD."
  - "Final Jest result: 8 suites passed, 77 tests passed."
  - "Frontend TypeScript and git diff --check completed with exit code 0."
  - "Independent raw-control reconciliation: current AST scan is button=35, select=1, textarea=3, total=39; ledger declared total=39 and categories are semantic-special-case=21, third-party-adapter=13, intrinsic-primitive=5."
  - "Independent geometry reconciliation for the implemented exact-bracket scanner: declared total=1221, source off-rhythm total=1221, ledger sum=1221, groups=513, files=149."
  - "Second follow-up reviewed at 7079e256: tests/shared-form-control.contract.test.cjs now resolves absent variant to primary, dynamic legacy secondary to both branches, and normalizes state/important prefixes while excluding text layout/size utilities."
  - "Independent Button audit after 7079e256 returned conflicts: [] across the migrated file set, including the four prior callsites in add.provider.component.tsx, new.post.tsx, and render.analytics.tsx."
  - "Second follow-up geometry review: tests/design.guard.test.cjs now parses TSX/JSX through TypeScript AST string/template literal fragments, excludes comments, and extracts signed, decimal, and compound pixel values from arbitrary bracket payloads."
  - "Independent geometry v2 reconciliation after 7079e256: version=2, declared=1226, actual=1226, ledger=1226, groups=517, files=148, denominations=55, allPixelLengths=3272, allDenominations=109, added=[], stale=[]."
  - "Final prescribed command after 7079e256 passed: source \"$HOME/.nvm/nvm.sh\" && nvm use --silent && pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/desert-lab-screen-review.test.cjs tests/agent-opening-band.test.cjs tests/layout-primitives.test.cjs tests/raw-control.guard.test.cjs tests/shared-form-control.contract.test.cjs --runInBand && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && git diff --check bd643d67..HEAD."
  - "Final Jest result after 7079e256: 8 suites passed, 79 tests passed. Frontend TypeScript and git diff --check completed with exit code 0."
changed_files:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-3-review.md
explicit_defers:
  - "content-factory-next-rcg.5 remains a valid recorded follow-up for the 21 semantic raw choice controls."
---

# Verdict: ACCEPT

Follow-up `7079e256` closes both P2 findings from the initial independent
review. The wave-3 diff from `bd643d67` through `7079e256` is accepted.

# Summary

The initial independent review rejected wave 3 at `c568caaa` on two concrete
guard bypasses. The second follow-up fixed both: the shared Button audit now
covers default-primary and legacy-secondary branches, and the geometry guard now
uses an AST-backed v2 ledger for compound, decimal, signed, and multiple
arbitrary pixel values while excluding comments.

## Findings

No open P0-P3 findings remain after reviewing `7079e256`.

## Closed Initial Findings

### P2 closed: shared Button role-conflict audit skipped default-primary buttons

Evidence: `tests/shared-form-control.contract.test.cjs:162-164` collects literal `variant` fragments and returns early when no explicit `variant` prop exists. The shared `Button` defaults to the primary variant in `libraries/react-shared-libraries/src/form/button.tsx:158-159`, so default-primary migrated buttons are still part of the contract. The follow-up fixture at `tests/shared-form-control.contract.test.cjs:388-394` proves `clsx`/template fragments only for an explicit `variant="quiet"` case.

An independent AST pass over the migrated files still finds these role classes on default-primary `Button` instances:

- `apps/frontend/src/components/launches/add.provider.component.tsx:310` has `!bg-transparent border border-tableBorder text-textColor`.
- `apps/frontend/src/components/launches/add.provider.component.tsx:374` has `!bg-transparent border border-tableBorder text-textColor`.
- `apps/frontend/src/components/launches/new.post.tsx:79` has `text-cf-accent-ink bg-btnPrimary`.
- `apps/frontend/src/components/platform-analytics/render.analytics.tsx:150` has `text-cf-accent-ink bg-cf-accent hover:bg-cf-accent-hover`.

Impact: rcg.4's stated invariant says migrated buttons must not mix shared variants with caller-owned Tailwind role classes. These four current call sites either retain redundant primary role ownership or rely on caller classes to override primary styling. Because the audit skips default-primary buttons, a future default `Button` can carry `bg-*`, `border-*`, or `text-*` role classes without failing tests.

Suggested fix: Treat absent `variant` as `primary` in `variantConflicts()`, treat `secondary` as the secondary variant, and normalize leading `!` before role checks. Add a fixture without a `variant` prop. Then either remove the role classes from default-primary call sites, set the intended variant explicitly, or introduce a real shared variant if `bg-btnPrimary`/transparent cancel styling is required.

Expected value: Restores the rcg.4 audit promise across every migrated file and removes fragile Tailwind color/background ownership from call sites.

Tradeoff: A few migrated call sites need small class/variant cleanup, and the test may flag additional legacy role classes that were previously hidden.

Confidence: high.

Classification: must-fix.

Closure evidence: `7079e256` updates the audit to resolve absent `variant` as
primary, dynamic `secondary` as both possible branches, and state/important
prefixes to their final utility token. It also removes the four hidden role
conflicts. My independent AST pass returned `conflicts: []` across the migrated
file set, including the four prior callsites.

### P2 closed: geometry guard remained bypassable by normal Tailwind arbitrary geometry forms

Evidence: `tests/design.guard.test.cjs:199-206` first greps only `\\[[0-9]+px\\]`, then counts only `/\\[(\\d+)px\\]/g`. This catches exact single-length classes like `w-[7px]`, but ignores standard Tailwind arbitrary values whose bracket payload contains more than one token or a decimal. Current source demonstrates such forms: `apps/frontend/src/components/admin/admin-users.component.tsx:243` contains `grid-cols-[1fr_140px_150px_170px_180px]`, and `apps/frontend/src/components/launches/calendar.tsx:888` contains `p-[2.5px]`.

Impact: A new off-rhythm class such as `grid-cols-[7px_1fr]`, `p-[2.5px]`, or `[margin:7px]` would not change the guard's actual total and would not require an allowance. That contradicts the rcg.2 review criterion that normal TSX/JSX geometry forms cannot bypass the guard.

Suggested fix: Scan Tailwind class literal fragments in TSX/JSX and extract every `px` length inside arbitrary bracket payloads, including compound and decimal values. Either add an exact ledger for existing compound/decimal debt or explicitly narrow the documented contract and open a Beads follow-up; do not claim non-bypassable coverage until the scanner and contract match.

Expected value: Makes the geometry gate match the documented 4px rhythm rather than only one subset of arbitrary pixel syntax.

Tradeoff: Expanding coverage may surface pre-existing compound/decimal debt that needs a checked-in baseline before the guard can be green.

Confidence: high.

Classification: must-fix.

Closure evidence: `7079e256` replaces the exact-bracket grep with a TypeScript
AST scanner over string and template literal fragments. The fixture covers
class constants, `clsx`, template literals, multiple values, decimal
canonicalization, signed values, and comment exclusion. My independent
reconciliation matched the v2 ledger exactly: 1,226 occurrences, 517 groups, 148
files, no added or stale entries.

# Verification

Final command:

`source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/desert-lab-screen-review.test.cjs tests/agent-opening-band.test.cjs tests/layout-primitives.test.cjs tests/raw-control.guard.test.cjs tests/shared-form-control.contract.test.cjs --runInBand && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json && git diff --check bd643d67..HEAD`

Result: 8 Jest suites passed, 79 tests passed; frontend TypeScript and
`git diff --check` passed.

## Positive Checks

- `OpeningBand` centralizes the agents opening band with `h-16`, `items-center`, and `mb-4`; the three consumer bands use it and no longer name `64px`.
- `PageShell` is a non-landmark `div`, so it does not duplicate the existing app-shell `main`. Admin users/errors use `PageShell`, `PageHeader`, and compact `Panel` without the previous duplicate padding pattern.
- The raw-control ledger is exact and shrink-only for the current AST boundary: 39 controls remain, reconciled as 21 semantic, 13 adapter, and 5 intrinsic. The rcg.5 defer is real and bounded.
- Shared `Button`, `Select`, and `Textarea` preserve the tested ref, loading-name, icon-only, standalone, and explicit submit contracts in the focused suite.

# Risks / Follow-ups

The separate `content-factory-next-rcg.5` choice-control work remains a bounded
post-wave defer and is not a regression in this diff. No new bypass or wave-3
regression was found in this re-review.
