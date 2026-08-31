---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-saas/stage-manifest.json
stream_owner: process_evidence_tracker
orchestration_level: integration
scope_kind: foundation
immediate_consumer: public SaaS, auth/metrics, and hybrid-AI implementation streams
public_facade: PRODUCT, Cloud-first growth spec, ADR-0010, and self-host claim guard
bounded_acceptance: durable managed-SaaS contract, operator readiness boundary, and focused guard RED/GREEN
non_goals:
  - public UI or application routing
  - backend, schema, auth, metrics, or AI implementation
  - pricing, trial/card, provider, region, legal, SLA, or certification decisions
  - production, credentials, paid calls, merge, push, PR, or deploy
evidence:
  - cloud-saas-contract-red-green
task_id: content-factory-next-saas.contract-operations
epic_id: content-factory-next-saas
stage_id: content-factory-next-saas
session_id: content-factory-next-saas
milestone: Cloud-first AGPL SaaS contract and operator boundary
milestone_status: accepted
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: local contract and operations stream assigned by root
repo: content-factory-next
branch: codex/cloud-saas-growth
base_branch: codex/cloud-saas-growth
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - PRODUCT.md
  - docs/product/cloud-saas-growth-spec.md
  - docs/adr/0010-cloud-first-agpl-saas.md
  - docs/operations/saas-readiness.md
  - tests/cloud-saas-contract.test.cjs
  - .codex/stages/content-factory-next-saas/artifacts/contract-operations.md
success_criteria:
  - Cloud-first managed SaaS is the durable delivery and support model
  - AGPL-3.0 attribution and exact-version Source offer remain explicit
  - new user-facing product-hosting claims fail while historical and operator records remain exact and shrink-only
  - operations readiness maps repository evidence to environment-level checks without claiming production readiness
  - undecided commercial, infrastructure, legal, and compliance claims remain explicit gates
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-saas/spec.md
  - .codex/stages/content-factory-next-saas/plan.md
  - .codex/stages/content-factory-next-saas/stage-manifest.json
  - PRODUCT.md
  - docs/adr/0005-release-content-factory-next-under-agpl.md
  - docs/adr/0009-external-services-allowed-when-justified.md
  - docs/operations/runtime.md
  - docs/operations/postgres-backup.md
  - docs/operations/error-collection.md
  - docs/operations/outbound-connections.md
selected_skills:
  - superpowers-test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: cloud-saas-growth-writers
depends_on_streams:
  - none
parallel_decision: parallel write-isolated documentation and guard stream
status: returned
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: shared worktree; no child branch, temporary artifact, external session, or runtime process created
risk_level: medium
risk_tags:
  - public-api
  - security
  - privacy
  - rollback
affected_surfaces:
  - ui
  - user-flow
invariants:
  - rollback
  - test-matrix
docs_impact: structural
docs_reviewed: updated
docs_review_notes: PRODUCT, new product spec, ADR-0010, and operator readiness now share one Cloud-first AGPL boundary.
verification:
  - TMPDIR=/tmp pnpm exec jest tests/cloud-saas-contract.test.cjs --runInBand RED: 4 passed and 1 failed because required Cloud-first contract files did not exist
  - TMPDIR=/tmp pnpm exec jest tests/cloud-saas-contract.test.cjs --runInBand GREEN: 1 suite and 5 tests passed
  - correction rerun after PRODUCT AI Delivery Model: 1 suite and 5 tests passed; docs check 78 files; owned diff check passed
  - ledger consistency correction: focused guard 5 tests passed; owned diff check and artifact validation passed
  - pnpm run docs:check: passed, 78 files checked
  - git diff --check on owned files: passed
changed_files:
  - PRODUCT.md
  - docs/product/cloud-saas-growth-spec.md
  - docs/adr/0010-cloud-first-agpl-saas.md
  - docs/operations/saas-readiness.md
  - tests/cloud-saas-contract.test.cjs
  - .codex/stages/content-factory-next-saas/artifacts/contract-operations.md
explicit_defers:
  - content-factory-next-saas.6 retains provider, region, legal entity, subprocessors, support, and compliance decisions; no claim is made here.
  - content-factory-next-or3.9 retains pricing, plan, trial/card, and billing-entitlement decisions; no claim is made here.
completion_event: 8676d4fe-8894-4d7b-b279-d3184f82ef8e
supersedes_completion_event: fc705e1b-7839-4723-a071-ea5f0be4054c
---

# Summary

Content Factory now has one durable delivery model: a Cloud-first managed
multi-tenant SaaS whose operator owns runtime, updates, backup, recovery,
observability, and incident response. PRODUCT also fixes the hybrid AI
contract: `included` is the managed default, an administrator explicitly selects
an encrypted `workspace_key`, neither mode silently falls back to the other,
quota exhaustion is a bounded state, and the billing ledger stores only
operation-usage counters, with no monetary cost, prompt, or output. Token/cost
accounting remains deferred because providers do not report it consistently.
AGPL-3.0 remains unchanged. The visible `Source` link and exact-version
Corresponding Source are part of the product contract, while source availability
does not create a product promise to support separate user installations.

The product spec bounds the public route set, synthetic no-side-effect demo,
compatible registration handoff, explicit AI modes, and privacy-safe growth
events. It distinguishes current product capability from roadmap and from
decisions that still lack an owner-approved answer. The operator runbook maps
static evidence to environment checks and fails closed instead of treating a
green repository test as proof of production readiness.

# Scope / Routing

This stream changed only the six assigned contract, documentation, test, and
artifact paths. It used local repository truth; no external documentation or
asset was needed. ADR-0010 complements ADR-0005 and ADR-0009 rather than
rewriting accepted history. Historical research and existing operator runbooks
remain intact.

The behavioral guard scans the actual frontend, SDK, shared UI, and public SaaS
source roots. Synthetic fixtures prove that English and Russian product-hosting
claims are detected while AGPL Source language is not. Four existing
provider/comment/community-name occurrences are held in an exact shrink-only
user-facing ledger. Historical and operator occurrences are separately held in
an exact shrink-only ledger, so neither new exceptions nor stale exceptions can
pass unnoticed. Public SaaS sources are also checked for undecided commercial,
infrastructure, residency, SLA, and certification promises.

# Verification

RED used Node 22.23.2, pnpm 10.6.1, and `TMPDIR=/tmp`. Four guard behaviors
already passed; the contract-file assertion failed because the product spec and
ADR did not exist. After adding the durable documents, the exact command passed
all five tests. `pnpm run docs:check` checked 78 Markdown files successfully,
and the owned-file whitespace check passed.

No full suite or build was run; the root owns the stage integration acceptance.

# Delivery / Cleanup

Changes are present directly in the shared worktree for root review. No commit,
merge, push, PR, deploy, Beads mutation, external account, browser session, or
production action occurred. No stream-owned temporary resource needs cleanup.

Root accepted delivery `b19e2c3d-97d5-4181-9a87-4e17a1501970` after rerunning
the focused contract suite (5/5 passed) and the v3 artifact validator. Cleanup
remains not applicable because the stream created no isolated runtime or
temporary resource.

# Risks / Follow-ups / Explicit Defers

The guard is intentionally lexical and exact. It protects claims in
repository-owned user-facing source and forces explicit review of known
historical/operator mentions; it does not infer the meaning of generated copy
or externally supplied content. New phrasing outside its synthetic language
matrix still requires human review during product-copy changes.

`content-factory-next-saas.6` remains the authority gate for provider, region,
legal entity, subprocessors, support, and compliance. `content-factory-next-or3.9`
remains the product-decision gate for pricing, plans, trial/card policy, and
billing entitlement. Neither task was edited or claimed complete.
