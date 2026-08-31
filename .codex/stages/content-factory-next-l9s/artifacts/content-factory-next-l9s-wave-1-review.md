---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: content-factory-next-l9s.wave1.review
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: n/a
bounded_acceptance: read-only correctness review of wave 1 base 833795208137011f47ff7bf7f12d9058a176251c through head 60c74a69 plus stage-manifest registration
non_goals:
  - implementation edits
  - Beads writes
  - broad acceptance reruns
evidence:
  - none
task_id: content-factory-next-l9s.wave1.review
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: wave-1 independent correctness review
milestone_status: accepted
agent_type: correctness_reviewer
subagent_model: gpt-5.5
reasoning_effort: xhigh
model_reasoning_rationale: authorization, validation, SSRF, session exposure review requires an independent senior model
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-1
base_branch: main
base_commit: 833795208137011f47ff7bf7f12d9058a176251c
worktree: /home/me/code/content-factory-next
write_zone:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-1-review.md
success_criteria:
  - Findings include severity, confidence, file:line, concrete failure case, and fix.
  - Final verdict is ACCEPT or REJECT.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-l9s/plan.md
  - .codex/stages/content-factory-next-l9s/prompt.md
  - .codex/stages/content-factory-next-l9s/stage-manifest.json
  - five wave-1 stream artifacts
  - bd show for ao3/eh3/yhx/f36/d08
  - /home/me/.agents/skills/superpowers/requesting-code-review/SKILL.md
  - /home/me/.agents/skills/superpowers/requesting-code-review/code-reviewer.md
selected_skills:
  - superpowers:requesting-code-review
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - wave1-ao3
  - wave1-eh3
  - wave1-yhx
  - wave1-f36
  - wave1-d08
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only review; no runtime resources created.
risk_level: high
verification_tier: delta
risk_tags:
  - security
  - authorization
  - public-api
  - api
affected_surfaces:
  - backend
  - api
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - test-matrix
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Review-only artifact; no product documentation changes needed.
verification:
  - read-only git diff/stat/log/show and source inspection: completed
  - read-only targeted re-review of ssrf.safe.fetch.ts, AutopostService.loadUrl, ExtractContentService, and tests/server-url-ssrf.test.cjs: completed
changed_files:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-1-review.md
explicit_defers:
  - none
---

# Summary

Verdict: ACCEPT.

The previously reported P2 SSRF redirect bypass is closed in the current working tree. `fetchSafePublicHttpsUrl` now owns the shared fetch boundary, validates every hop with `isSafePublicHttpsUrl`, follows redirects manually, resolves relative `Location` headers, caps redirects, and passes `ssrfSafeDispatcher` on every fetch. `AutopostService.loadUrl` keeps its empty-string failure contract, while `ExtractContentService` still propagates unsafe URL errors.

# Findings

No P0-P3 findings in the targeted correction review.

Closed finding: the earlier P2 redirect bypass no longer reproduces from code inspection. Evidence: `libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.fetch.ts:11` validates `currentUrl` before every fetch, `ssrf.safe.fetch.ts:16` uses `redirect: 'manual'` and `dispatcher: ssrfSafeDispatcher`, `ssrf.safe.fetch.ts:26` caps redirects after five hops, and `ssrf.safe.fetch.ts:30` through `ssrf.safe.fetch.ts:38` rejects missing or invalid `Location` and resolves relative redirects before the next validation. The two call sites now delegate to this helper at `libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts:244` and `libraries/nestjs-libraries/src/openai/extract.content.service.ts:19`.

# Strengths

The correction is the right shape: one shared helper removes drift between the two user-controlled URL fetch paths, and the tests cover HTTPS-only redirects, loopback redirects, relative allowed redirects, dispatcher use on every fetch, missing/invalid `Location`, the redirect limit, and the distinct service error contracts.

# Verification

I did not rerun tests or broad wave acceptance by instruction. This pass was limited to read-only source and test inspection of the corrected SSRF files.

# Risks / Follow-ups

No residual correctness finding remains from this review. Root-owned broad wave acceptance is still required.

# Delivery / Cleanup

No implementation files, Beads state, Git index, branch state, external systems, or production resources were changed. This review artifact is the only write.
