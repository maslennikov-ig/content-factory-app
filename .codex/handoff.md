# Content Factory handoff — release preparation, 8 November 2026

Current stage id: `release-preparation-20261108`

Current task: `content-factory-next-2fcd`. Owner requested readiness/merge inventory and preparation
of the next version, excluding the active HeyGen chat/branch. Owner will deploy
later. This stage does not switch production, apply live SQL or make paid calls.

## Candidate and exclusions

Branch `codex/release-ready-20261108`, existing isolated worktree
`/home/me/.codex/worktrees/postiz-remaining-20261107/content-factory-next`. Baseline origin/main `e3b4257edecdde397185a244b86944843a0a85a5`.
The previous Postiz PR1283 is merged; its13 tasks are Done in Linear and central
Beads. It did not produce a clean full release receipt. A new gate is in progress.

Excluded: `codex/chat-owner-feedback-20261106` and
`/home/me/.codex/worktrees/social-factory-epic/content-factory-next`, including
its uncommitted changes, jobs, assets and active preview. Preserve original dirty
`/home/me/code/content-factory-next`, all other worktrees, detached release/rollback
heads and all branch refs. Current Postiz4497 source/runtime is retained; only
test fixture preparation and release docs change here.

## Inventory and verification

99 local/origin refs excluding HeyGen and Dolt metadata:41 ancestors,50
patch-equivalent,8 historical unmatched refs. No unique additional code is
established ready. Some outcomes were reworked into main; old C/measurement heads
are unproved as a whole, and the reader prototype is unaccepted/rolled back.
Do not merge those heads to make the branch list look clean.

The PlanCard cold module fixture now prepares a fresh graph before each case;
22/22 affected cases pass, with all assertions/default deadlines retained.
Root must complete the exact configured release set on one frozen candidate.
No successful new release/image/CI result is claimed in this source snapshot.

[Plan](../docs/superpowers/plans/2026-11-08-release-preparation-with-heygen-exclusion.md),
[stage summary](stages/release-preparation-20261108/summary.md),
[production runbook](../docs/operations/production-deploy.md).
Private current facts: `/home/me/.local/share/content-factory-orchestration/release-preparation-20261108`.
Never print private stand/environment data or credentials. Canonical task and
private artifact manifests own later progress and exact resulting identifiers.

## Explicit defers

Live production migration/switch, paid calls, account/provider acceptance,
active HeyGen work and unaccepted historical heads. Public publication is a
separate reviewed artifact delivery action; never push private history to the
public repo. Preserve Mastra, review/grant/journal data and old workflow contracts.
Use only guarded additive SQL for a later owner-authorized deployment.

## Next recommended

Next stage id: `release-preparation-20261108`
Recommended action: finish exact-source release checks, prepare the reviewed tree/image/schema/rollback handoff, then safe-only cleanup and canonical closeout. Deployment remains an owner action.

## Starter prompt for next orchestrator

Use $orchestrator-stage to continue `content-factory-next-2fcd` from the existing candidate and private
release evidence. Keep the HeyGen exclusion strict, reuse matching proof, and
report public/artifact readiness separately from production/provider acceptance.
