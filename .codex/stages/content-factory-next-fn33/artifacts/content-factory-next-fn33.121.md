---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-W1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: Russian interface
public_facade: ru translation dictionary
bounded_acceptance: no Russian string says a bare AI where it means ИИ
non_goals:
  - renaming keys
  - changing English or any other locale
evidence:
  - ai-one-russian-word-guard
task_id: content-factory-next-fn33.121
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: walker cleanup wave, wording
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: wording decision with a written-down count, mechanical to apply
repo: content-factory-next
branch: worktree-agent-aa87be6131f0092ac
base_branch: wave/walker-p3-2026-09-05
base_commit: c6bd64ae
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-aa87be6131f0092ac
write_zone:
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - tests/ai-one-russian-word.guard.test.cjs
success_criteria:
  - the AI provider settings screen uses one word throughout
  - English is unchanged
  - a new mixed string fails a test rather than reaching a reader
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: walker-p3-cleanup
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: no scratch state outside the worktree
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: wording rule now lives in the guard beside the dictionary
verification:
  - pnpm exec jest tests/ai-one-russian-word.guard.test.cjs: passed
  - pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs: passed
  - pnpm exec jest tests/ai.provider.component.test.cjs tests/ai-allowance.hint.test.cjs: passed
changed_files:
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - tests/ai-one-russian-word.guard.test.cjs
explicit_defers:
  - none
---

# Summary

Fourteen Russian strings said «ИИ» and fourteen said «AI», four of them on the
AI provider settings screen one after another. «ИИ» wins — it already carried
the section name, the settings heading and the billing lines — and the other
fourteen strings were rewritten to it. No key was renamed and no other locale
was touched. `OpenAI` and the rest of the product names keep their spelling:
the guard only looks for `AI` standing alone as a word.

# Scope / Routing

Write zone as assigned. The bead spoke of «ru-словари этого экрана»; there are
none — the screen reads entirely from the shared dictionary, and the only
Russian `AI` left in component sources is inside a code comment.

# Verification

The new guard listed all fourteen offenders before the change and is green
after. The two AI-screen component tests keep their own fixture strings, so
they are unaffected and still pass.

# Delivery / Cleanup

Returned on the stream branch for the root to merge.

# Risks / Follow-ups / Explicit Defers

Assumption taken without the owner: «ИИ» is the product's word in Russian,
chosen because it was already the majority and holds the visible headings.
