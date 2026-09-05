---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: agency applicant who was declined
public_facade: n/a
bounded_acceptance: the decline branch sends to a real address, in the owner's language, naming the agency
non_goals:
  - changing who reviews an agency application
  - sending any real email
evidence:
  - agency-decline-email-guard
task_id: content-factory-next-p3gq
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: wave-cleanup-2026-09-05
milestone: cleanup wave, stream B
milestone_status: accepted
agent_type: worker
subagent_model: opus
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-file backend defect with a locale contract
repo: content-factory-next
branch: worktree-agent-a8e448f85ada45206
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4257143f6b05351118fe8c4ba0e9ffb06
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a8e448f85ada45206
write_zone:
  - libraries/nestjs-libraries/src/database/prisma/agencies/**
  - tests/*.cjs
success_criteria:
  - a declined agency's email has a non-undefined recipient
  - the email is in the owner's account language and names the agency
selected_docs:
  - none
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: nothing to clean; no change was needed
risk_level: low
risk_tags:
  - none
affected_surfaces:
  - none
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: no behaviour changed in this stream
verification:
  - "pnpm exec jest tests/agency-decline-email.guard.test.cjs: passed"
changed_files:
  - .codex/stages/content-factory-next-fn33/artifacts/content-factory-next-p3gq.md
explicit_defers:
  - none
---

# Summary

Nothing to fix: the defect was already repaired in the tree this stream
started from. `48b77f55` («fix(audit): … письмо отклонённому агентству …»)
added `AgenciesRepository.getAgencyForDecision` — the same lookup without
`approved: true` — and pointed `AgenciesService.approveOrDecline` at it, so
after a decline the row is found with `approved: false` and the email has a
recipient, a language and a name. `tests/agency-decline-email.guard.test.cjs`
already covers exactly what the acceptance criterion asks for, with a Prisma
fake that honours `where.approved` so the test would fail on the query rather
than on a permissive stub.

This stream verified that claim rather than trusting it: the guard was run and
both cases (decline and approve) pass.

# Scope / Routing

Write zone as above; nothing was written. No documentation lookup was needed —
the whole surface is repository-local Prisma and the project's own locale
catalog.

# Verification

- `pnpm exec jest tests/agency-decline-email.guard.test.cjs` — 2 passed.

No email left the machine: the test replaces `NotificationService.sendEmail`
with a collector, and `EMAIL_PROVIDER` is empty on the stand regardless.

# Delivery / Cleanup

Returned with no code change. The bead can be closed as already delivered by
`48b77f55`; root closes it, not this stream.

# Risks / Follow-ups / Explicit Defers

None. One thing worth a root eye: this bead was still OPEN while its fix was
already merged, so the same wave may hold other beads whose work landed under
an unrelated commit message.
