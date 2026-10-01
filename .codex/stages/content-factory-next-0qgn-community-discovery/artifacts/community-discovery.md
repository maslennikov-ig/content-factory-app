---
schema_version: orchestration-artifact/v3
stage_manifest: .codex/stages/content-factory-next-0qgn-community-discovery/stage-manifest.json
stream_owner: community_discovery
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-75xn.9
stage_id: content-factory-next-0qgn-community-discovery
epic_id: content-factory-next-0qgn
repo: content-factory-next
branch: codex/remaining-followups-2026-10-01
base_branch: main
base_commit: 7f9f44a2d2cb3f5e8a0cc1b3c573b5bfbeed4be9
worktree: /home/me/code/content-factory-next
subagent_model: gpt-6.1-sol
reasoning_effort: high
milestone_status: internal_ready
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared-checkout source delivery accepted; worker and reviewer created no runtime, branch or worktree resources; unrelated work preserved
risk_level: high
risk_tags:
  - anonymous-egress
  - cross-process-pacing
  - hidden-paid-fallback
verification:
  - Worker final three focused suites passed 66 tests with no skips
  - RED reproduced paid routing, actual MockRedis admission and unbounded raw text cleanup
  - Independent correction review accepted both P2 fixes and matched all six source hashes
  - Root final commands and their result are recorded only by the stage acceptance receipt
changed_files:
  - libraries/nestjs-libraries/src/content-intelligence/leads/community-topic-discovery.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/leads/lead-topic.gateway.ts
  - libraries/nestjs-libraries/src/database/prisma/database.module.ts
  - tests/community-topic-discovery.test.cjs
  - tests/lead-topic-gateway.guard.test.cjs
  - tests/content-lead-topic-subscription.guard.test.cjs
affected_surfaces:
  - topic-subscription-check
  - community-source-egress
  - lead-persistence
invariants:
  - default-disabled-no-egress
  - no-paid-fallback
  - real-shared-admission-required
  - bounded-request-and-raw-text-work
  - tenant-window-cache-identity
  - canonical-publication-dates
  - persisted-dismissal-preserved
explicit_defers:
  - Reddit retains m0iy.7 owner exclusion; original scope preserved
  - No live source quality, deployment, activation, paid call or deep-phase acceptance
---

# Summary

Root accepted the stable six-file source delivery and bounded correction review.
The default-off community-only branch collects anonymous HN/GitHub Issues/arXiv
metadata directly and sends deterministic bounded candidates through the existing
topic service/repository. It does not invoke research, models or a paid fallback.
This is source-delivery acceptance; the root integration result is recorded in
the stage acceptance receipt. Original Beads scope is anchored verbatim and the
task remains in progress, including the retained Reddit exclusion/live gates.

# Scope / Routing

The worker owns only community-topic-discovery.service.ts, LeadTopicGateway,
DatabaseModule and the three named focused tests. Root owns task truth, durable
docs, integration and final proof. Separate local memory diagnostics own unique
/tmp and disposable Docker resources; no write ownership overlaps.

Documentation: official HN/GitHub/arXiv APIs reviewed 01.10.2026 and accepted in
the programme's keyless-community-docs evidence. No paid API, credential, new
provider enum, schema, UI component or Temporal contract change.

# Verification

Worker final focused result: three suites, 66 tests passed, no skips, 1.411s,
Node22.23.2/pnpm10.6.1. The source-to-persistence fixture uses the actual collector,
gateway, service and repository with mocked Prisma. It proves persistence,
deduplication/dismissal and tenant refusal offline, not a real database/live API.

Independent review found two P2s. The actual missing-REDIS_URL singleton was
MockRedis, which ignores NX/PX; the collector factory now denies that store while
the other quota consumers retain their existing mock. A real-module factory
regression verifies no requests for two tenants and the usable quota counter.
Raw untrusted metadata now has its length capped before synchronous regex work;
an instrumented malformed-text regression checks the operation's input bound
without a timing threshold. Both corrections had meaningful RED then GREEN and
were accepted by a correction-only static review. No unresolved review finding.

Initial root82/type results preceded these corrections and are superseded.
The root final set is six affected lead suites, backend types, documentation and
diff checks through run_stage_closeout.py. See acceptance-receipt.json and
evidence/source-delivery.json for exact commands/result and reviewed source hashes.
Final root84/84 tests, types/docs/diff/process passed at2e6f3c221. The initial
artifact metadata gate failure was fixed and rerun; both logs remain preserved.
No source changed after the final passing set. Original task remains in progress.

# Risks / Follow-ups

Retain disabled/default paths, tenant/cache identity, canonical freshness and
dismissal memory. Shared Redis admission fails closed on outage. Ranking selects
the bounded candidates; current queue observation ordering remains. Review the
actual delivered source before authorizing any activation or publication.

# Delivery and cleanup

Root accepted delivery and review immediately in this central artifact. All six
hashes were independently checked. The worker/reviewer created no runtime,
network/API calls, worktrees or branches; no removal or termination was needed.
No schema, dependency, workflow, credential or deployed configuration changed.
