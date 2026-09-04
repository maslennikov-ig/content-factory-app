---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: worker-stream-d
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: person setting a profile picture or a bot picture
public_facade: the media library modal
bounded_acceptance: every path into the library opens the same full-screen modal with a height, and the chosen image reaches the field that asked for it
non_goals:
  - upload transport, storage or permissions
  - the media library's own layout
  - the "Открыть раздел «Контент»" link in settings (another stream)
task_id: content-factory-next-fn33.15
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: one way to open the media library
milestone_status: delivered
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: bounded UI wiring with one extraction and three callers
repo: content-factory-next
branch: worktree-agent-a082639c1fb9b017b
base_branch: main
base_commit: 1fcb1c99
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a082639c1fb9b017b
write_zone:
  - apps/frontend/src/components/media
  - apps/frontend/src/components/launches/bot.picture.tsx
  - apps/frontend/src/components/layout/settings.component.tsx (showMediaBox call only)
  - apps/frontend/src/components/new-layout/layout.component.tsx (ShowMediaBoxModal line only)
  - tests
success_criteria:
  - one function opens the library, used by the editor, the profile picture and the bot picture
  - the modal is full screen with height calc(100% - 80px)
  - the selected image reaches the single-image field as one item, not as the list
selected_docs:
  - none (local repository behavior only)
selected_skills:
  - none
selected_agents:
  - worker
catalog_candidates:
  - existing new-modal manager
parallel_group: fn33-wave-04-09
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for root to merge
risk_level: medium
risk_tags:
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - none
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: no new door or role; the same library, opened correctly
verification:
  - pnpm exec jest tests/media-box.opening.test.cjs: passed (8/8; all 8 failed before the fix)
  - pnpm exec jest (full suite, 293 files): passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
  - pnpm exec tsc --noEmit -p apps/backend/tsconfig.json: passed
  - scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - apps/frontend/src/components/media/media.component.tsx
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/launches/bot.picture.tsx
  - apps/frontend/src/components/new-layout/layout.component.tsx
  - tests/media-box.opening.test.cjs
  - tests/helpers/load-ts-module.cjs
  - tests/user-identity.settings.test.cjs
explicit_defers:
  - none
---

# Summary

`useOpenMediaBox()` in `apps/frontend/src/components/media/media.component.tsx` is now the only way the media library is put on screen. It opens `modals.openModal` with one shared set of options (`MEDIA_BOX_MODAL_LAYOUT`: full screen, `calc(100% - 80px)` size and height, escape closes, no ask-on-close) and mounts `MediaBox` in exactly one place in the file. The event emitter, `showMediaBox` and `ShowMediaBoxModal` are gone, along with the `<ShowMediaBoxModal />` line in the page layout that rendered the library into the document flow with no height.

# Scope / Routing

Write zone as assigned; the settings link at ~254 was not touched. No external documentation needed.

Two further defects were found in the same two callers and fixed with them: both stored the whole selection list into a field that holds one `MediaDto`, so even a correctly opened library left the avatar and the bot picture empty. Both now read `values[0]` and ignore an empty selection.

# Verification

Listed above. The new suite was run against the pre-fix files first (`git stash`), where all eight of its checks failed.

`tests/helpers/load-ts-module.cjs` gained `jsx: ReactJSX` so a `.tsx` hook can be loaded and rendered through it; the full jest suite was run afterwards to prove no other consumer of that helper changed behavior.

# Delivery / Cleanup

Returned on the stream branch for the root to merge. No push.

# Risks / Follow-ups / Explicit Defers

- Not exercised in a browser: no stand was raised (ports 3000/4200 belong to the main copy). The modal options are byte-for-byte the ones the post editor already ships, which is the path the owner confirmed works.
- Worth re-checking on production afterwards: the original report was "upload does nothing". Part of that was this collapse. Whether the upload itself is also refused is still open under fn33.15's own notes.
