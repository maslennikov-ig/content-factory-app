# Shared-host release artifacts

Beads `content-factory-next-0qgn.24` coordinates recurrence prevention after the
13October2026 disk exhaustion. Content Factory's existing release tools already
measure actual image capacity before pull and retain current plus an explicitly
verified rollback after release checks. Those gates are unchanged.

The responsible on-host builder is AiDevTeam. Its canonical `scripts/deploy.sh`
now consumes `scripts/operations/release-artifacts.py prepare` before build and
`finish` after native readiness. The deployment lock spans the whole operation;
custom/manual builds must use the same contract (AiDevTeam `AGENTS.md` and
`docs/operations/release-artifacts.md`). No new daemon or scheduler is required.

The owner13October policy keeps every container-referenced image, three most
recent distinct AiDevTeam rollback images and documented independent reserves.
Explicit pins live in its `release-artifacts.json`; only exact obsolete tags in
`aidevteam-rollback` may be removed, without force. Missing pins, failed native
health, active build, changed identity or unknown capacity refuse the action.
Unused eligible builder cache older than24hours is pruned toward4GB, reserving1GB;
fresh/in-use cache remains. Before a new build, actual DockerRootDir must have
at least16GB free and100,000 free inodes. Insufficient reserve stops the build.
This bounds admission; it is not a quota on unrelated data growth or all cache.

Applications, volumes, live environment/compose, Caddy and asset banks are not
modified by maintenance. Docker daemon/GC settings are not changed or restarted.
Deleting unused tags/cache is irreversible; working images, rollback history
and explicit pins are protected before each deletion. Never use global Docker
system/image/volume pruning as a substitute.

Stage proof: `.codex/stages/content-factory-next-host-artifact-lifecycle-20261014/`.
Local simulation, actual host maintenance and a future real application build
are separate evidence. Installing operations scripts does not rebuild the
currently deployed application or certify later unrelated producers.
