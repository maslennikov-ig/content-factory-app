# Content Factory handoff — 11 November 2026

Current stage id: heygen-release-20261111

The owner approved the HeyGen preview and authorized production delivery.
The integrated candidate is tracked by `content-factory-next-ekqe.22.5`.
[Release scope](stages/heygen-release-20261111/summary.md).

## Current production baseline

Production serves `588bb1fa244c` from private source `c5ef8ab7a`. The release
candidate and preparation record were fast-forwarded into private `main` at
`a75673ac7`. Public Build and CodeQL passed, all 23 schema operations were
applied after verified backup `20261111T072117Z`, and host and HTTPS checks passed.
The previous image `3d6b8c326e0e` is retained. Check workflow compatibility before
rollback. [Production runbook](../docs/operations/production-deploy.md#current-release-11-november-2026-588bb1fa244c).

Release task `content-factory-next-2fcd` / HONEY-6368. See the [stage record](stages/release-preparation-20261108/summary.md#production-delivery-and-cleanup--11-november-2026)
for verification and cleanup details. The prepared public checkout, archive and
private evidence remain under `/home/me/.local/share/content-factory-orchestration/release-preparation-20261108`.

Both canonical checkouts were fast-forwarded after preserving their original
local changes in verified private copies. Their local hook overrides were kept.
Three retired build worktrees were removed while preserving branch references,
commits and suite receipts. The retained worktrees hold active work, local
settings or private evidence. The HONEY-6013 worktree's product code is already
represented in `main` history. Its only unmatched source or test file was an
older loopback test helper for which `main` has stricter input validation.

## Explicit defers

The owner preview, original worktree and private reports are preserved. New paid
calls, account changes and creative experiments are outside this release.
Existing epic criteria beyond this verified delivery remain tracked separately.

## Next recommended

Next stage id: heygen-release-20261111

Recommended action: Finish the exact release verification, publish the accepted
public tree and image, and verify the serving version.

## Starter prompt for next orchestrator

Use $orchestrator-stage to resume the native HeyGen delivery from the current
candidate and its recorded checks. Preserve the original owner preview.
