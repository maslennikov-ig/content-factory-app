# dbxe.22 and dbxe.23 backend completion

Baseline: `5cc169032a452b245f6e0423ceaf38cea719f169`.
Owner: backend child stream; root owns integration, acceptance, Beads and release.

## Contract and scope

- `.22`: one inherited image/video reservation and fake provider effect with
  enabled synthetic allowance 1 and overlapping requests. Preserve existing
  monthly anchor, image billing gate, video/trial policy and failure refunds.
  Commit admission before provider execution; no schema change or paid calls.
- `.23`: reject an explicit active channel whose provider is absent from the
  existing `PLATFORM_PROVIDERS[platform]` before writing Post/ContentDerivation.
  Prove Telegram/VK mismatch, matching channels and the site/WordPress and
  newsletter/Listmonk aliases already present in that map.
- Write only subscriptions/material service paths, focused tests and this
  backend stage directory. Do not touch central handoff/index, Beads, lockfiles,
  production configuration or Temporal contracts.

## Evidence map and premortem

`SubscriptionService.useCredit -> SubscriptionRepository.useCredit -> Credits`
is called by `MediaService.generateImage/generateVideo`, including both the media
door and chat. `checkCredits` currently reads usage separately from the insert.
`ContentMaterialService.createDraft -> ContentMaterialRepository.createDraft`
writes the post and derivation together, but its explicit channel branch checks
only active tenant ownership.

Verdict: GO with conditions enforced by the focused proof below.

| Failure symptom | Evidence / mechanism | Detection / mitigation |
| --- | --- | --- |
| Two paid effects for one credit | Confirmed: separate aggregate and insert | Real PostgreSQL read barrier, serializable admission and bounded conflict retries |
| Provider holds a DB transaction | Plausible if callback moves into admission | Independent client sees committed reservation; per-request transaction state is clear when fake provider starts |
| Unbilled image or refund behavior changes | Confirmed distinct inherited policy | Preserve image billing condition; prove unbilled counts, provider failure refunds and charged storage failures |
| Material provenance names another platform | Confirmed explicit channel omits provider check | Test error before any Post/ContentDerivation write; reuse existing platform map |
| Executor deletes foreign Docker resources | Plausible shared host contains unrelated resources | Save exact inventories; label/name-owned container and volume only; preserve all foreign inventory members |

Rollback: revert these source/test commits; no schema/data migration. In-flight
credits remain ordinary existing credit rows; existing provider failure deletes
only the reservation created by its request.

## Work and proof

- Reproduce mismatch and overlapping allowance defect at a disposable boundary.
- Add short Prisma serializable reservation with bounded P2034 retry and keep
  external callback/refund after commit. Reuse the existing allowance calculation.
- Reject material mismatch through `PLATFORM_PROVIDERS`; preserve normal writes.
- Focused PostgreSQL, media/material/privacy/tenant checks, backend types using
  Node 22.23.2 and pnpm 10.6.1, diff check. Root owns the final acceptance set.
- Record exact commands/results, source diff and owned-resource cleanup before
  scoped commit. No push, deployment, real accounts, models or messages.

## Documentation and graph

Read canonical owner Beads descriptions and acceptance for `.22` and `.23`,
AGENTS.md, owner project index/handoff and audit backend report. Memory was used
only for bounded/local-proof preservation guidance, not current status.
Graph-reviewed: focused readonly owner graph lookups for SubscriptionRepository
and ContentMaterialService. Graph baseline `d724f3b7`; returned relevant source
hashes matched the current baseline files. The bounded neighborhoods were
truncated and do not prove complete caller coverage; exact current source and
focused caller searches were read. No graph rebuild or external API call.
