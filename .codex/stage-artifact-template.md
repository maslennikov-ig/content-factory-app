---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/<stage-id>/stage-manifest.json
stream_owner: <worker-or-root-owner>
orchestration_level: <inner_loop|slice_acceptance|integration|release>
scope_kind: <product_slice|foundation>
immediate_consumer: <consumer-or-n/a>
public_facade: <thin-facade-or-n/a>
bounded_acceptance: <bounded-acceptance-or-n/a>
non_goals:
  - <non-goal-or-n/a>
evidence:
  - <repo-relative-verification-evidence-sidecar-or-none>
task_id: <task-id>
epic_id: <beads-epic-id-or-n/a>
stage_id: <stage-id>
session_id: <durable-goal-or-n/a>
milestone: <cohesive-vertical-slice>
milestone_status: <planned|in_progress|accepted|replan-required|n/a>
agent_type: <worker|explorer|docs_researcher|skill_scout|custom-or-n/a>
subagent_model: <inherit_orchestrator|model-id|role_default|n/a>
reasoning_effort: <inherit_orchestrator|role_default|low|medium|high|xhigh|n/a>
model_reasoning_rationale: <short reason>
repo: <repo-or-n/a>
branch: <branch>
base_branch: <base-branch>
base_commit: <base-commit-or-unknown>
worktree: <absolute-path-or-unknown>
write_zone:
  - <path-or-module>
success_criteria:
  - <observable-criterion>
selected_docs:
  - <doc-source-or-none>
selected_skills:
  - <skill-or-none>
selected_agents:
  - <agent-or-none>
catalog_candidates:
  - <candidate-or-none>
parallel_group: <matrix-stream-id-or-n/a>
depends_on_streams:
  - <stream-id-or-none>
parallel_decision: <parallel|sequential|local|n/a>
status: <returned|accepted|merged|blocked>
delivery_method: <merge|cherry-pick|manual integration|not accepted|n/a>
accepted_by_orchestrator: <yes|no>
cleanup_status: <pending|cleaned|blocked|not_applicable>
cleanup_notes: <short cleanup result or blocker>
risk_level: <low|medium|high>
risk_tags:
  - <migration|rls|security|authorization|tenancy|concurrency|atomicity|retry|state-transition|idempotency|rollback|public-api|data|ui|user-flow|api|none>
affected_surfaces:
  - <database|data|api|backend|ui|user-flow|none>
invariants:
  - <tenancy|state-transition|idempotency|rollback|test-matrix|none>
docs_impact: <none|tests-only|refactor|behavior|structural|api-contract|migration|ops-deploy|docs-only|n/a>
docs_reviewed: <updated|no-change-needed|n/a>
docs_review_notes: <short reason or updated docs>
verification:
  - <command>: <passed|failed|blocked>
changed_files:
  - <path>
explicit_defers:
  - <none|bead-id-and-reason>
---

# Summary

Short outcome summary.

# Scope / Routing

Record the assigned write zone, success criteria, selected docs, selected skills, selected agents, catalog candidates, model/reasoning choice, parallel group, dependency boundaries, and any documentation impact.

# Verification

List the commands that were actually run and the result.

# Delivery / Cleanup

Record how the orchestrator accepted or rejected the stream, then record the safe-only cleanup result. Use `accepted-content, not-git-merged; manual cleanup required` when work was accepted through cherry-pick or manual integration but the child branch is not Git-merged.

# Risks / Follow-ups / Explicit Defers

List residual risks, blockers, explicit next steps, and any justified defer.
Do not leave silent technical debt behind this artifact.
