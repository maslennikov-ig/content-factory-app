---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-N-translations-and-gaps
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: media library empty state
public_facade: n/a
bounded_acceptance: the empty media library names the ceiling that actually refuses a file
non_goals:
  - changing the session upload ceiling or the validation pipe
  - touching new-launch/editor.tsx (another stream's zone)
evidence:
  - none
task_id: content-factory-next-fn33.71
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-fixes-2026-09-04
milestone: translations and small gaps outside other streams' zones
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: mechanical copy fix with a shared-constant reuse decision
repo: content-factory-next
branch: worktree-agent-a4c37b91494b5f279
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4c37b91494b5f279
write_zone:
  - apps/frontend/src/components/media/** (empty-state copy only)
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - the caption prints both ceilings from libraries/nestjs-libraries/src/upload/upload.limits.ts
  - the old select_or_upload_pictures_max_1gb key is gone from code and all 16 locales
selected_docs:
  - libraries/nestjs-libraries/src/upload/upload.limits.ts
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: stream-N
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state left in the repository
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: copy-only change, the limits module already documents the numbers
verification:
  - pnpm exec jest tests/media-empty-state-limits.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/media/media.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/media-empty-state-limits.test.cjs
explicit_defers:
  - the session ceiling constant MAX_UPLOAD_SIZE still lives twice (media.component.tsx and new-launch/editor.tsx); editor.tsx is another stream's zone
---

# Summary

The empty media library promised "maximum 1 GB per upload" — the session
ceiling — while a 14 MB image was refused by the per-file ceiling of 10 MB in
`upload.limits.ts`. The caption now prints both ceilings from that module, so
the sentence and the check cannot drift apart again. The old key
`select_or_upload_pictures_max_1gb` is replaced by
`select_or_upload_pictures_limits` in all 16 locales.

# Scope / Routing

Write zone was the empty-state copy only; the session ceiling and the upload
path itself were left alone. The `formatUploadSizeLimit` helper already existed
for exactly this and was reused rather than re-derived.

# Verification

- `pnpm exec jest tests/media-empty-state-limits.test.cjs` — 4 passed. Red
  before the fix: 3 of 4 failed with the change stashed.
- `pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs` — 5 passed.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 errors.

# Delivery / Cleanup

Committed on the stream branch, waiting for the root to merge.

# Risks / Follow-ups / Explicit Defers

The units stay Latin ("10 MB", "1 GB") inside the Russian sentence, because
`formatUploadSizeLimit` is shared and formats one way for every locale. The
bead noted this as a second, smaller complaint; changing the formatter would
reach into `libraries/nestjs-libraries/src/upload/upload.limits.ts` and its
other callers, which is outside this stream. Worth a follow-up bead.

The seven non-Latin locales that had a human translation of the old key now
carry the English sentence and an allowlist entry, per the wave convention
(`ru`/`en` human, the rest English). That is a small translation regression
traded for a correct number.
