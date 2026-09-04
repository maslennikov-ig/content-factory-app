---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-N-translations-and-gaps
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: /third-party integrations screen
public_facade: n/a
bounded_acceptance: every visible string on the integrations screen goes through a translation key
non_goals:
  - translating provider titles (HeyGen, Reel.Farm are product names)
  - editing the provider classes in libraries/nestjs-libraries/src/3rdparties
evidence:
  - none
task_id: content-factory-next-fn33.74
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-fixes-2026-09-04
milestone: translations and small gaps outside other streams' zones
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: copy routing with one decision about where server text gets translated
repo: content-factory-next
branch: worktree-agent-a4c37b91494b5f279
base_branch: wave/fixes-2026-09-04
base_commit: 3b901ad0
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4c37b91494b5f279
write_zone:
  - apps/frontend/src/components/third-parties/**
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/**
success_criteria:
  - no English sentence remains hard-coded in the two integrations components
  - both shipped provider descriptions read in Russian on a Russian interface
selected_docs:
  - libraries/react-shared-libraries/src/helpers/delete.dialog.tsx
  - libraries/nestjs-libraries/src/3rdparties/*/*.provider.ts
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
docs_review_notes: copy-only change, no new door or action for the roles matrix
verification:
  - pnpm exec jest tests/third-party-screen-translated.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed
changed_files:
  - apps/frontend/src/components/third-parties/third-party.component.tsx
  - apps/frontend/src/components/third-parties/third-party.list.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - tests/locale-untranslated-allowlist.json
  - tests/third-party-screen-translated.test.cjs
explicit_defers:
  - none
---

# Summary

The heading said "Интеграции" and everything under it was English. Four strings
were written straight into the markup ("No Integrations Yet", the "Add" button,
the delete confirmation, the "API Key" field label) and two more — the HeyGen
and Reel.Farm descriptions — arrive from the server in English and were printed
as they came. The markup strings now go through keys (`add` and `label_api_key`
already existed and were reused), and a provider description is looked up as
`third_party_description_<identifier>` with the server text kept as the
fallback.

# Scope / Routing

The screen lives in `components/third-parties/`, not `components/launches/` as
the write zone named it; no other stream in this wave touches that directory.
The provider classes in `libraries/nestjs-libraries/src/3rdparties` were read
but not edited: translating on the client keeps the backend free of locale
concerns and still degrades to the English server text for a provider the
locales do not know yet.

# Verification

- `pnpm exec jest tests/third-party-screen-translated.test.cjs` — 5 passed. Red
  before the fix: all 5 failed with the change stashed.
- `pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs` — 5 passed.
- `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json` — 0 errors.

# Delivery / Cleanup

Committed on the stream branch, waiting for the root to merge.

# Risks / Follow-ups / Explicit Defers

`String(...)` wraps the description lookup because a template-literal key loses
i18next's literal return type. That is a type narrowing, not a behaviour
change.

A third provider added later will show its English server description until
someone adds `third_party_description_<identifier>`. The test asserts a key
exists for every directory under `3rdparties`, so the omission fails a check
rather than reaching a person silently.
