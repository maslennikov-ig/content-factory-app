---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave2-4ug
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: repository metadata, GitHub issue intake, and extension development manifest
bounded_acceptance: Nine inherited supply-chain findings are removed or delegated without restoring any external integration.
non_goals:
  - Editing apps/sdk, FAQ copy, or locale files owned by sibling wave-2 streams.
  - Changing GitHub repository settings, installed apps, configured secrets, or production systems.
  - Removing intentional upstream provenance from SECURITY.md.
evidence:
  - none
task_id: content-factory-next-4ug
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: inherited supply-chain metadata cleanup
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-luna
reasoning_effort: medium
model_reasoning_rationale: Mechanical supply-chain cleanup with a deterministic static acceptance criterion.
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-2
base_branch: main
base_commit: a1077e53
worktree: /home/me/code/content-factory-next
write_zone:
  - .github/workflows/build-extension.yaml
  - .github/workflows/publish-extension.yml
  - .gitmodules
  - .github/FUNDING.yaml
  - .github/ISSUE_TEMPLATE/**
  - .env.example
  - apps/extension/manifest.dev.json
  - .coderabbit.yaml
  - tests/supply-chain.supply-chain.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-4ug.md
success_criteria:
  - Upstream extension publishing, dead submodule, funding, issue/advisory routes, credential-shaped example, extension key, and CodeRabbit configuration are absent.
  - The focused Jest regression demonstrates RED against the inherited tree and GREEN against the changed tree with 16 tests.
  - FAQ/locales and apps/sdk remain owned by content-factory-next-527 and content-factory-next-ry5.7.
  - GitHub-settings work is returned as an exact defer for content-factory-next-woy.
selected_docs:
  - AGENTS.md
  - SECURITY.md
  - docs/operations/outbound-connections.md
  - .codex/stages/content-factory-next-l9s/prompt.md
selected_skills:
  - /home/me/.agents/skills/superpowers/test-driven-development/SKILL.md
  - /home/me/.agents/skills/superpowers/systematic-debugging/SKILL.md
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: wave-2
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree; no branch, commit, or temporary environment owned by this stream requires cleanup.
risk_level: medium
verification_tier: inner
risk_tags:
  - supply-chain
  - security
  - external-integrations
affected_surfaces:
  - repository
  - ci
  - extension
invariants:
  - external-boundary
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: SECURITY.md remains the reporting-policy authority; outbound-connections.md already records the inherited paths and needs root-owned closeout updates only after acceptance.
verification:
  - 'SUPPLY_CHAIN_ROOT=<git archive of HEAD> pnpm exec jest tests/supply-chain.supply-chain.test.cjs --runInBand: RED failed, 16 tests failed against the inherited state.'
  - 'pnpm exec jest tests/supply-chain.supply-chain.test.cjs --runInBand: GREEN passed, 16 tests.'
  - 'node scripts/branding/brand-scan.cjs: passed, 0 unexplained references and 24 allowlisted references.'
  - 'git diff --check: passed.'
changed_files:
  - .coderabbit.yaml
  - .env.example
  - .github/FUNDING.yaml
  - .github/ISSUE_TEMPLATE/01_bug_report.yml
  - .github/ISSUE_TEMPLATE/02_feature_request.yml
  - .github/ISSUE_TEMPLATE/config.yml
  - .github/workflows/build-extension.yaml
  - .github/workflows/publish-extension.yml
  - .gitmodules
  - apps/extension/manifest.dev.json
  - tests/supply-chain.supply-chain.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-4ug.md
explicit_defers:
  - 'content-factory-next-woy: Verify GitHub App installations, Actions permissions, repository security-advisory settings, and whether any external extension-publishing secrets remain configured; remove or rotate anything not owned by Content Factory. This repository change only removed inherited workflow and configuration call sites.'
---

# Summary

Inherited extension publishing and upload workflows, the dead private submodule,
upstream funding metadata, CodeRabbit configuration, upstream issue routes, the
credential-shaped Resend example, and the upstream extension key are removed.
No external integration was added or restored.

# Scope / Routing

The change is limited to the assigned repository metadata, example environment,
development extension manifest, issue templates, and one focused static test.
FAQ/locales and `apps/sdk` remain assigned to `content-factory-next-527` and
`content-factory-next-ry5.7`. Intentional upstream provenance in `SECURITY.md`
was reviewed but not edited.

# Verification

The Jest test registers 16 independent static checks. Against a `git archive`
of the inherited `HEAD`, all 16 fail. Against the changed worktree, the exact
target passes 16/16. Brand scan and whitespace validation also pass.

# Delivery / Cleanup

Returned to the orchestrator for acceptance. The stream did not switch branches,
commit, merge, stash, reset, clean, publish, or change an external system. No
stream-owned cleanup is required.

# Risks / Follow-ups / Explicit Defers

Repository files cannot prove GitHub App ownership or delete repository-level
secrets and settings. `content-factory-next-woy` should verify those surfaces
using the exact defer in the frontmatter before the owner task is closed.
