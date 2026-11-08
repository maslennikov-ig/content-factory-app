# Content Factory release preparation with HeyGen exclusion

**Goal:** Prepare one verified deployment candidate containing accepted work,
with a truthful ready/merged/unmerged inventory and operator handoff.
**Owning task:** `content-factory-next-2fcd`; one cohesive release-preparation boundary.
**Baseline:** private main `e3b4257edecdde397185a244b86944843a0a85a5`.
**Exclusion:** active `codex/chat-owner-feedback-20261106`, its unique commits,
dirty worktree, runtimes, provider jobs and future active changes.
**Non-goals:** production switch, live schema/data mutation, paid calls, real
account setup, social publication, and completion of unaccepted old candidates.

## Scope ledger

1. Inventory all other refs and distinguish ancestry, patch equivalence and
unproved old heads; report ready code and existing production separately -> task.
2. Preserve all existing behavior assertions and deadlines while moving the
cold PlanCard fixture's module compilation before each behavior case -> task.
3. Freeze one candidate, run the configured release set once, inspect all three
suite halves and require its real exact-source receipt -> release gate.
4. Prepare the sanitized public tree/source archive, immutable image identity,
image startup/nginx/weight checks, additive SQL/rollback plan and concrete owner
deployment commands -> artifact gate. Public publication is its own reviewed
step; never publish private Git history or switch the live app during preparation.
5. Reconcile task status, handoff and safe-only disposable cleanup. Keep branch
refs, current/dirty worktrees, active runtimes and recovery assets -> closeout.

## Execution

- Reuse the current isolated checkout on `codex/release-ready-20261108`; preserve
its prior branch ref and all original/foreign work.
- Do not integrate unmatched old heads merely because Git says unmerged.
- Affected verification: the22 real PlanCard cases with coverage and open-handle
checks. No assertion, timeout, skip, CI membership or release guard relaxation.
- Root final gate: `python3 scripts/orchestration/run_stage_closeout.py --stage
release-preparation-20261108 --level release --receipt-suffix deploy-preparation`
using the exact configured three typechecks, four-app build, complete suite
recorder, branding/docs/process/diff commands. Failures are collected, fixed by
cause and rerun only where inputs were invalidated.
- Follow `docs/operations/production-deploy.md` and existing scripts. Build only
from a clean sanitized public-tree clone; bind private source, public commit,
archive checksum and image digest. Preserve Mastra and new review/publication
records; never db push. Production migration/switch remains an owner step.
- Produce a private owner-facing inventory/deployment report with actual status,
artifact identifiers, remaining steps and exact exclusions. Do not repin old
receipts or infer live-provider success from fixtures/CI.
