---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-vme.3/stage-manifest.json
stream_owner: subagent:relay-isolation
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: root-integration-and-release-acceptance
public_facade: n/a
bounded_acceptance: focused relay SDK proof and required Docker runner contract
non_goals:
  - production-or-deploy-changes
  - package-or-operational-script-changes
evidence:
  - none
task_id: content-factory-next-vme.3.relay-proof-hardening
epic_id: content-factory-next-rpt
stage_id: content-factory-next-vme.3
session_id: n/a
milestone: privacy-safe-relay-proof-hardening
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Existing relay and Docker paths required one bounded integration hardening pass.
repo: content-factory-next
branch: detached-head
base_branch: codex/cloud-saas-growth
base_commit: b3f18aceafeef51855b91d5ee4a8f4df23e41d2c
worktree: /tmp/cf-vme2
write_zone:
  - scripts/ci/run-docker-backed-ci.sh
  - tests/browser-error-relay.test.cjs
  - tests/docker-ci-contract.test.cjs
  - docs/operations/error-collection.md
  - docs/development/docker-backed-ci.md
  - .codex/stages/content-factory-next-vme.3/artifacts/relay-isolation.md
  - .codex/stages/content-factory-next-vme.3/artifacts/docker-ci.md
  - .codex/stages/content-factory-next-vme.3/artifacts/relay-proof-hardening.md
success_criteria:
  - real @sentry/nextjs transport proves contaminated isolation metadata cannot expand the external payload
  - clean required CI obtains nginx:alpine before executing the real proxy-hop proof
  - required JSON result rejects every skipped Docker-backed test
selected_docs:
  - docs/operations/error-collection.md
  - docs/development/docker-backed-ci.md
selected_skills:
  - superpowers:receiving-code-review
  - superpowers:test-driven-development
  - writing-good-tests.md
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: content-factory-next-vme.3
depends_on_streams:
  - relay-isolation
  - docker-ci
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root accepted the hardening after 100 focused tests, frontend typecheck, independent security review with no P0-P3 findings and exact cleanup verification.
risk_level: high
risk_tags:
  - security
  - privacy
  - ci
affected_surfaces:
  - api
  - telemetry
  - ci
invariants:
  - payload-minimization
  - fail-closed
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Error collection and Docker-backed CI contracts now describe the executable SDK and nginx proofs.
verification:
  - 'SDK PROOF: pnpm exec jest tests/browser-error-relay.test.cjs --runInBand --testNamePattern=real Next SDK (1/1 passed)'
  - 'DOCKER RED: pnpm exec jest --runInBand tests/docker-ci-contract.test.cjs (exit 1; nginx:alpine image preflight missing)'
  - 'DOCKER GREEN: pnpm exec jest --runInBand tests/docker-ci-contract.test.cjs (5/5 passed)'
  - 'RELAY GREEN: pnpm exec jest tests/browser-error-relay.test.cjs --runInBand (14/14 passed)'
  - 'REQUIRED RUNNER: ./scripts/ci/run-docker-backed-ci.sh --require-docker (3 suites, 31/31 passed, 0 skipped; both operational proofs passed)'
changed_files:
  - scripts/ci/run-docker-backed-ci.sh
  - tests/browser-error-relay.test.cjs
  - tests/docker-ci-contract.test.cjs
  - docs/operations/error-collection.md
  - docs/development/docker-backed-ci.md
  - .codex/stages/content-factory-next-vme.3/artifacts/relay-isolation.md
  - .codex/stages/content-factory-next-vme.3/artifacts/docker-ci.md
  - .codex/stages/content-factory-next-vme.3/artifacts/relay-proof-hardening.md
explicit_defers:
  - none
---

# Summary

The relay proof now executes the real `@sentry/nextjs` client configured by the
production `createErrorCollectionOptions`. Its in-memory transport observes an
event captured through the actual Next route while the active isolation scope
and request are deliberately contaminated with URL/query, headers, cookie,
User-Agent, document nonce and user/model-like content. The rebuilt event keeps
the closed payload schema, and the SDK client is closed after assertions.

The required Docker runner now checks both `postgres:17-alpine` and
`nginx:alpine`, pulls a missing image only in required mode, and includes the
browser relay suite in the same machine-readable zero-skipped Jest result. A
clean CI runner therefore cannot pass by skipping the actual nginx proxy proof.

# Scope / Routing

This was a sequential hardening pass over the already implemented relay and
Docker CI streams. No production, deployment, package, operational script,
secret, database or external environment changed.

# Verification

The executable Docker contract first failed because the runner inspected only
`postgres:17-alpine`. After the minimal runner change it passed all five tests,
including the missing-nginx pull branch and the three-suite command matrix.

The real required runner passed 3 suites and 31 tests with 0 skipped, then both
existing operational proofs. Their own cleanup checks reported no disposable
containers, networks, volumes or temporary artifacts. The real Next SDK proof
passed both alone and as part of the relay suite.

# Delivery / Cleanup

Delivery is manual integration into the shared detached worktree. Orchestrator
acceptance and final cleanup status remain pending; no commit, push, PR or
delivery action was performed by this stream.

# Risks / Follow-ups / Explicit Defers

No new runtime behavior was introduced beyond making the required runner obtain
the nginx proof image. The relay residuals remain unchanged: deliberate nonce
rotation is not authentication, cached old tabs fail closed until reload,
application limiters are per process/replica, and bounded cleanup is lazy.
