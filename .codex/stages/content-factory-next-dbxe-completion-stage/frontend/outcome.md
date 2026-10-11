# Frontend completion delivery: dbxe.9/.11/.12

Baseline: `5cc169032a452b245f6e0423ceaf38cea719f169`.
Branch: `codex/dbxe-completion-frontend-20261011`.
Acceptance ownership: root integrates and independently accepts/closes tasks; this child does not change Beads or central handoff/index.

## Result

- dbxe.9: core/adaptation dirty text is retained synchronously before debounce/network in a tab-local user/workspace/piece scope. Refused, rejected, interrupted and pending navigation saves leave a recoverable draft. Returning exposes the text and explicit save/retry; it does not silently send recovered words. Only an acknowledgement for the exact retained text removes recovery. Adaptation unmount flush waits for the earlier write; stale responses cannot update a closed screen. Core success still acknowledges persistence after unmount, skipping closed UI/cache updates. Ordinary successful navigation adds no confirmation.
- dbxe.11: calendar/list/media reads reject HTTP, network, JSON and unsupported response shapes; localized retry differs from successful empty data. Calendar/media/channel deletion checks HTTP success; 403/5xx/network never refresh deleted state/show success/clear extension credentials. Existing channel 406 refusal remains distinct. USER cards preserve preview, omit duplicate/delete/connect-write actions and cannot drag/edit; EDITOR retains supported writes. Actual backend deletes by `group` only, so singleton no-group rows remain previewable and unsupported mutations are suppressed/guarded; no guessed post-id target or `/undefined` request exists.
- dbxe.12: login and forgot settle loaders with `finally`; forgot only reaches sent state after OK response. OAuth registration handles failed transport/JSON/HTTP/missing-token with localized explicit retry. Login inactive/approval and OAuth approval/success routes are preserved. The shared fetch response contract is unchanged.

## Focused proof

Environment: Node `v22.23.2`, pnpm `10.6.1`; existing root dependency tree symlink, no installation.

- `pnpm exec jest` with the exact 14 affected suites in `focused-final.log`: **14 suites / 254 tests / 0 failures / 0 skips**. 59 added cases (54 in new focused files, 5 actual container cases); 195 retained checks. Includes real rendered components and actual callbacks with inert local HTTP fixtures, core/adaptation navigation recovery, interrupted promises, late save ordering, storage quota fallback, role cards, calendar/list/media reads, 403/5xx/network/success deletes, extension message capture, login/forgot/OAuth failure + retry + approval.
- Existing affected/design checks are included in that final run: profile autosave, role read-only screens, Farcaster lazy auth, calendar grouping/filter wiring, media opening, design guard/coherence/contrast/foundation. No JSDOM/open-handle warning in the final output.
- `pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --incremental false`: **exit 0**, `frontend-tsc.log` is empty.
- `git diff --check`: **exit 0**.
- Red evidence: `red-draft.log` captured 4 failures / 1 pass before implementing the autosave recovery. `red-auth.log` tests the pinned baseline via the loader: 9 failures / 4 passes. `red-actions.log` tests pinned baseline read/role/no-group/channel contracts: 16 failures / 2 passes / 13 unselected tests. Red baseline filters intentionally exclude the newly exported hook seam.
- `inputs.sha256` binds the changed production/tests/locales/inventory files to this evidence.

## Documentation and graph

`AGENTS.md`, canonical .9/.11/.12 Beads contracts, component inventory and authoring rules read. Inventory includes the shared recovery mechanism. Source/privacy .24/.37 paths and Temporal contracts are unchanged.

**graph-reviewed**: owner graph `/home/me/code/content-factory-next/graphify-out/graph.json`, built at `d724f3b792f4518eebc04c854448904f565323fd`, used read-only with explicit `--graph`; `useAutosave` and `usePostActions` focused neighborhoods guided navigation. Returned affected file hashes matched index at the child baseline; current source was then read. Graph is an older orientation snapshot and was not refreshed by this isolated stream.

## Limits and cleanup

Proof is local/JSDOM/type-level; no real account/provider/email/model call, real browser/live data, push, release, public-tree update or deployment was performed. Full-suite/release acceptance remains root-owned. Tab drafts survive app navigation/reload while session storage is available; when storage is denied, fallback recovery covers app navigation within the current browser process, not a destroyed browser process.

Owned scratch scripts and intermediate failed-fixture logs removed. JSDOM windows closed, no child-owned runtime remains. Keep this worktree/branch and dependency symlink for root integration; no unrelated files or central records changed. Scoped delivery commit is reported in the child completion message.
