---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave2-ry5.7
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: public Node.js SDK integrators
public_facade: default export from @contentfactory/node
bounded_acceptance: SDK exposes ContentFactory with an explicit instance URL, contains no upstream brand or author, and is included in the brand scan.
non_goals:
  - No package publication or compatibility alias for the retired class name.
  - No API endpoint or request-shape change.
evidence:
  - none
task_id: content-factory-next-ry5.7
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: SDK public-brand boundary
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: The public SDK contract and brand guard need a compatible, deliberate change.
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-2
base_branch: main
base_commit: a1077e53
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/sdk
  - scripts/branding/brand-scan.cjs
  - tests/branding.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-ry5.7.md
success_criteria:
  - apps/sdk contains no Postiz, Gitroom, postiz-app, api.postiz.com, or inherited upstream author name.
  - The default SDK export and README usage both name ContentFactory.
  - The brand scanner covers SDK TypeScript, README, and package metadata without a new allowlist.
selected_docs:
  - AGENTS.md
  - PRODUCT.md
  - DESIGN.md
  - docs/operations/outbound-connections.md
  - scripts/branding/brand-scan.cjs
selected_skills:
  - superpowers:test-driven-development
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
cleanup_notes: Shared worktree; no package was published and no temporary files remain.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - public-api
  - brand
affected_surfaces:
  - sdk
  - tooling
invariants:
  - public-contract
  - test-matrix
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: The package README is the public SDK documentation and was updated in this stream; no repository-wide API documentation names this retired class.
verification:
  - 'RED: source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/branding.test.cjs --runInBand failed as expected because apps/sdk/src/index.ts exported Postiz.'
  - 'GREEN: source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/branding.test.cjs --runInBand passed: 1 suite, 12 tests.'
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm --filter ./apps/sdk exec tsc --noEmit -p tsconfig.json: passed.'
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm --filter ./apps/sdk exec tsup: passed; CJS and DTS builds succeeded.'
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && node scripts/branding/brand-scan.cjs: passed; 0 unexplained reference(s), 7 allowlisted reference(s).'
  - 'git diff --check: passed.'
changed_files:
  - apps/sdk/src/index.ts
  - apps/sdk/README.md
  - apps/sdk/package.json
  - scripts/branding/brand-scan.cjs
  - tests/branding.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-ry5.7.md
explicit_defers:
  - none
---

# Summary

The SDK now exports `ContentFactory` as its only public client class. Its README
uses that class with the required Content Factory instance URL, and its metadata
identifies Content Factory contributors rather than the upstream author.

The brand scan now treats the SDK as a public surface: TypeScript source, the
README, and package metadata are scanned. The new regression test both rejects
the retired terms in those files and proves a temporary upstream-branded SDK
source file is reported by the scanner. No new allowlist entry was added.

# Verification

TDD RED: the focused branding suite failed before implementation because the
new SDK-boundary test found `Postiz` in `apps/sdk/src/index.ts`. After the
minimal rename and scanner-root addition, the same suite passed all 12 tests.

The SDK type check and tsup build both passed under Node 22.23.2 and pnpm
10.6.1. The brand scanner reported no unexplained references, and whitespace
validation passed.

# Risks / Follow-ups

Renaming the default export is an intentional public API break required to
remove the upstream-branded class; a repository-wide consumer search found no
internal SDK consumer to migrate. No compatibility alias was retained because
it would reintroduce the retired public brand. Package publication remains a
separate, explicitly authorized delivery action.
