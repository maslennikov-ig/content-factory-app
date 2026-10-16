# Shared-host artifact lifecycle — 14 October 2026

Coordinator: Beads `content-factory-next-0qgn.24`; producer task in `issues.json`.
One root owner; AiDevTeam changes use an isolated worktree because its main tree
contains unrelated ongoing work. No application rebuild or continuous epic goal.

## Evidence and scope

The previous recovery left ~19GB free. Fresh inspection finds ~9GB, two newer
AiDevTeam rollback tags and an unchanged healthy CF image. AiDevTeam's canonical
deploy runs `docker compose up -d --build` without a capacity or retention step.
CF already has measured pre-pull refusal and repository-only verified rollback
retention; preserve those existing gates. Docker29.4.2/buildx0.33.0 use a shared
default builder. Its current GC reserves8GB; do not edit/restart the daemon.

## Contract

- Keep every container-referenced image, three latest distinct AiDevTeam rollback
  images, and the owner13Oct documented pins: `seo-20261011-before`,
  `dataset-license-20261011-825f1055`, `category-media-20261002`.
- Only exact `aidevteam-rollback:<simple-tag>` names may be removed, without force.
  Missing pins, failed health, active builds, changed container/image identity or
  unknown metadata refuse cleanup. No volume/container/data/live-config removal.
- Clean unused default-builder cache older than24h, targeting4GB of eligible
  cache. Fresh/in-use cache remains; this is not a hard total-cache guarantee.
- Before starting a build require16GB free on DockerRootDir and100,000 inodes.
  Unknown/insufficient capacity refuses the build; no cleanup credit is assumed.
  This is a conservative admission reserve, not a quota on unrelated growth.
- Before build tag the current accepted app as a rollback; after native health
  run retention again. Keep a deployment lock across the entire build/switch.
  Custom/manual builds must use the same prepare/finish contract.
- Install/activate only source operations on the existing host. Preserve the
  current AiDevTeam image/Caddy asset bank and CF current/verified rollback.

## Implementation and acceptance

1. Implement AiDevTeam's standard-library helper, explicit pin file, canonical
   deployment wiring and durable runbook. No new daemon, scheduler or dependency.
2. Exercise retention, repeated deployments, missing pins, current/stopped
   references, low space/inodes, concurrent work, failed health, dry-run and races.
   Run exact operations checks plus existing CF capacity/retention regressions.
   Reuse matching AiDevTeam frontend type/build proof: no frontend inputs change.
3. Commit/push isolated source after a fresh remote check. Install the exact
   committed helper on the host without app switching; run dry-run first, apply
   only the audited plan and compare all containers/config/images/volumes.
4. Record live health/capacity and unchanged deployed images, update both Beads
   tasks/handoff, save source/runtime receipts, remove only owned temporary work.

## Premortem and recovery

GO WITH CONDITIONS: preflight inventory, pins, healthy app and absent build.
Deleting a referenced/retargeted rollback is a confirmed risk: recheck full image
ID and every container reference before each exact non-force removal. Active
build cache is protected by Docker and the build check/locks. Capacity parsing or
a changed Docker mount could silently admit unsafe work: measure DockerRootDir,
fail on unknown bytes/inodes and retain the threshold. Executor scope drift could
rebuild the unrelated site or touch its bank: operations-only diff and unchanged
runtime/config comparison are required. Removed stale tags are irreversible;
current and three accepted rollback images plus pins preserve the recovery path.
Helper rollback disables the new operations code; it never changes app/env/data.

Docker references: https://docs.docker.com/reference/cli/docker/buildx/prune/
and https://docs.docker.com/build/cache/garbage-collection/ (read14Oct).
