---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave3-rcg.1
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: apps/frontend/src/components/agents/agent.tsx
public_facade: @contentfactory/react/layout/opening.band
bounded_acceptance: AgentList, AgentChat, and Threads use one opening-band primitive that owns their common height, vertical centring, and an aligned following gap without consumer-side 64px literals or off-rhythm arbitrary gap geometry.
non_goals:
  - No agents-page redesign or behaviour change
  - No sidebar breakpoint or collapse-state change
  - No API, SWR, or chat-state change
evidence:
  - focused_jest
  - mutation_proof
  - frontend_typecheck
  - geometry_ledger
task_id: content-factory-next-rcg.1
epic_id: content-factory-next-rcg
stage_id: content-factory-next-l9s
session_id: n/a
milestone: replace duplicated agents-page opening-band geometry with one shared primitive
milestone_status: accepted
agent_type: frontend_developer
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: bounded shared-component UI refactor with geometry invariant and test contract
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-3
base_branch: main
base_commit: 904fb640
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/react-shared-libraries/src/layout/opening.band.tsx
  - apps/frontend/src/components/agents/agent.tsx
  - apps/frontend/src/components/agents/agent.chat.tsx
  - tests/agent-opening-band.test.cjs
  - tests/design-geometry-allowlist.json
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.1.md
success_criteria:
  - AgentList, AgentChat, and Threads render their opening band through @contentfactory/react/layout/opening.band.
  - The shared primitive owns h-16, vertical centring, and the aligned mb-4 gap.
  - The primitive contains no mb-[15px] off-rhythm gap.
  - Consumers do not name 64 as a literal.
  - A focused test fails when one column stops rendering OpeningBand alone.
selected_docs:
  - AGENTS.md
  - PRODUCT.md
  - DESIGN.md
  - docs/design/component-authoring-rules.md
  - docs/design/content-factory-interface-specification.md
  - task Bead content-factory-next-rcg.1
selected_skills:
  - superpowers:test-driven-development
  - impeccable
  - impeccable/reference/product.md
skill_execution_notes:
  - Read the selected TDD and Impeccable instructions before edits.
  - Impeccable context was loaded with its project-targeted context script; this was a scoped consistency refactor, not a visual redesign.
selected_agents:
  - frontend_developer
catalog_candidates:
  - none
parallel_group: wave3-rcg.1
depends_on_streams:
  - content-factory-next-rcg.2
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The temporary single-column mutation was reverted. No branch, commit, stash, runtime, or external cleanup was created.
risk_level: low
verification_tier: inner
risk_tags:
  - frontend-layout
  - shared-component
  - geometry-invariant
affected_surfaces:
  - agents-page
  - design-geometry-guard
invariants:
  - all-three-first-controls-share-one-centre-line
  - shared-opening-band-owns-height-centering-and-gap
  - geometry-debt-ledger-only-shrinks
docs_impact: structural/tests-only
docs_reviewed: no-change-needed
docs_review_notes: The existing component-authoring and interface contracts already prescribe the 4px rhythm, token use, accessibility, and responsive sidebar behaviour. This extraction changes neither product behaviour nor documentation.
verification:
  - "TDD RED: pnpm exec jest tests/agent-opening-band.test.cjs --runInBand failed 2/2 before production changes: the primitive was absent and both consumers lacked the required shared use while retaining 64px literals."
  - "Review-fix TDD RED: after the focused test was changed to require mb-4 and reject mb-[15px], pnpm exec jest tests/agent-opening-band.test.cjs --runInBand failed 1/2 because the primitive still used mb-[15px]."
  - "Review-fix GREEN: source '$HOME/.nvm/nvm.sh' && nvm use --silent && pnpm exec jest tests/agent-opening-band.test.cjs tests/design.guard.test.cjs --runInBand passed 2 suites, 11 tests after the primitive changed to mb-4."
  - "Mutation RED: temporary replacement of only AgentChat's OpeningBand opening tag with div failed the focused test with renderCount 0 where 1 was required; the mutation was restored."
  - "Final GREEN: the same focused Jest command passed 2 suites, 11 tests after cleanup."
  - "TypeScript: source '$HOME/.nvm/nvm.sh' && nvm use --silent && pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json passed."
  - "No consumer 64px literal: rg found no h-[64px] or 64px in agent.tsx and agent.chat.tsx."
  - "Geometry debt: declared and exact-ledger totals changed only from 1224 to 1222; the Agent 15px allowance changed from 8 to 6, matching the two removed consumer-owned gaps. The shared-library replacement is aligned mb-4 and adds no off-rhythm debt."
  - "git diff --check passed."
changed_files:
  - libraries/react-shared-libraries/src/layout/opening.band.tsx
  - apps/frontend/src/components/agents/agent.tsx
  - apps/frontend/src/components/agents/agent.chat.tsx
  - tests/agent-opening-band.test.cjs
  - tests/design-geometry-allowlist.json
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.1.md
explicit_defers:
  - No browser screenshot was captured: this is a geometry-preserving extraction with focused structural, mutation, and TypeScript evidence. Root acceptance may run integration/browser checks if the stage risk assessment requires it.
---

# Summary

`OpeningBand` is the single shared agents-page opening band. It fixes the common `h-16`, `items-center`, and rhythm-aligned `mb-4` invariant; each consumer supplies only its own border, horizontal padding, or content alignment.

`AgentList` and `Threads` call it from `agent.tsx`; `AgentChat` calls the exact same import from `agent.chat.tsx`. The first controls therefore retain their established common centre line without repeating a `64px` literal.

# Verification

Focused Jest passed 11/11 after both the 4px-rhythm correction and the root-owned single-column mutation. The frontend TypeScript check passed, the Tailwind content configuration explicitly scans `../../libraries/**/*.{ts,tsx,html}`, and the final geometry ledger is internally consistent at 1,222.

# State and accessibility review

No state transition, asynchronous update, route, or interactive element changed. The existing button/link, select label association, focus-visible treatment, sidebar collapse classes, and responsive variants remain on their original children. The shared wrapper is a non-interactive `div`, so it adds no keyboard or focus target.

# Risks / Follow-ups

The class composition relies on the existing Tailwind build scanning shared-library source files; the focused frontend TypeScript check verifies module resolution but not generated CSS. If the stage's root acceptance starts the frontend, it should confirm the shared-library Tailwind classes are present in the built CSS. The common gap changed by one pixel from the legacy 15px value to the documented 16px rhythm step.
