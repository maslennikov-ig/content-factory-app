# Recovery-storage supplement

Base delivery: `645cbd6bcade1c5a03498cb2577de042a8b1ebcb`.

Root review identified two concrete storage edges. The helper now consults its memory overlay first: a new dirty value retained after a quota refusal cannot be hidden by older readable session storage. Matching acknowledgement installs a null overlay before removal; failed removal cannot resurrect that acknowledged draft. A later edit replaces the overlay normally; stale acknowledgements cannot clear newer text.

Only production delta: `apps/frontend/src/components/ui/recoverable-draft.ts`. Added two actual regressions in `tests/frontend-dirty-text-recovery.test.cjs`, covering old stored text + failed new write, failed remove + repeated recovery reads, next edit and stale acknowledgement.

- Red: **2 failed / 10 passed**, `supplement-red.log`.
- Affected green: **3 suites / 71 tests / 0 skips**, `supplement-green.log` (dirty recovery, actual piece container, profile autosave), exit 0.
- Frontend `tsc --noEmit --incremental false`: exit 0, `supplement-tsc.log` empty.
- Environment unchanged: Node 22.23.2 / pnpm 10.6.1. `git diff --check` passed.
- `supplement-inputs.sha256` supersedes the original manifest for these two files; original evidence remains bound to base delivery.

The affected subset emits Jest's delayed-exit warning, then exits normally with code 0; no forceExit was used and no running child process remains. Full-suite acceptance remains root-owned.

Memory recovery and acknowledgement overlays survive navigation within the current process. If browser mutation is denied, such an overlay cannot be persisted across a destroyed browser process; no stronger durable-storage claim is made. No new UI behavior, public/global API, dependency edge or external action was introduced. Original docs/graph review applies; other owners and central records were unchanged. Worktree remains for root integration.
