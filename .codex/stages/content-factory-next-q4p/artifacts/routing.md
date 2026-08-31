---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-q4p/stage-manifest.json
stream_owner: routing
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: public route proxy and shared public shell
bounded_acceptance: complete anonymous invite capture, invite-first home routing, signed-in application-root redirect, and persistent public sign-in action
non_goals:
  - auth page or registration-flow changes
  - public copy ownership
  - broad UI redesign
  - build, release acceptance, delivery, or live actions
evidence:
  - none
task_id: content-factory-next-q4p.1
epic_id: content-factory-next-q4p
stage_id: content-factory-next-q4p
session_id: content-factory-next-q4p
milestone: cloud-saas independent-review routing repair
milestone_status: accepted
agent_type: frontend_developer
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: focused auth-routing and shared-shell UI repair in an isolated write zone
repo: /home/me/code/content-factory-next
branch: codex/cloud-saas-growth
base_branch: main
base_commit: 36f5947265a4e081912ccc260a72283f157efb7b
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/frontend/src/proxy.ts
  - apps/frontend/src/components/public-saas/public-shell.tsx
  - tests/public-saas-routing.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/routing.md
success_criteria:
  - A signed-in /?org=<jwt> request runs the existing /user/join-org flow and redirects to /?added=true.
  - An anonymous /?org=<jwt> request redirects to /auth?org=<jwt> without attempting the join call.
  - The anonymous /auth?org=<jwt> hop stores the invite cookie and redirects to query-free /auth so the auth UI renders on the next pass.
  - A signed-in / request redirects to the existing application root while other public allowlisted pages remain public.
  - Every public route inherits a separate sign-in entry beside the demo action from PublicShell.
selected_docs:
  - AGENTS.md
  - .codex/stages/content-factory-next-q4p/spec.md
  - .codex/stages/content-factory-next-q4p/plan.md
  - .codex/stages/content-factory-next-q4p/stage-manifest.json
  - docs/design/component-authoring-rules.md
  - PRODUCT.md
  - DESIGN.md
  - graphify-out/GRAPH_REPORT.md
  - https://www.lazyweb.com/agentic-search/5e4bbf7e-a611-4826-afb4-a63f7541a59b
selected_skills:
  - superpowers:using-superpowers
  - lazyweb
  - impeccable
  - superpowers:test-driven-development
  - superpowers:receiving-code-review
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - frontend_developer
catalog_candidates:
  - none
parallel_group: routing
depends_on_streams:
  - guards-docs supplies the public-copy signIn key
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared worktree; no branch, worktree, process, or temporary file was created, so no residual resource remains.
risk_level: medium
risk_tags:
  - authorization
  - state-transition
  - ui
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: The local stage spec already records the repaired routing behavior; no external or versioned contract is involved.
verification:
  - 'Graph review: graphify query and explain located proxy(), internalFetch(), the existing root redirect, and the shared public shell before focused source inspection.'
  - 'RED: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest tests/public-saas-routing.test.cjs --runInBand --coverage=false — failed as expected, 3 failed and 5 passed; invite and signed-in root returned next, and PublicShell had no sign-in action.'
  - 'GREEN: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest tests/public-saas-routing.test.cjs --runInBand --coverage=false — passed, 8 tests and 1 suite.'
  - 'Integration RED 1: after guards-docs adoption, the same focused suite failed 1 test and passed 7 because the routing test still expected removed local en/ru PUBLIC_COPY maps.'
  - 'Integration RED 2: after replacing the stale assertion with executable useT key mapping and adding the full anonymous invite chain, the same suite failed 1 test and passed 7 because /auth?org=<jwt> stored the cookie but redirected to public / instead of /auth.'
  - 'Integration GREEN: Node 22.23.2, TMPDIR=/tmp, pnpm exec jest tests/public-saas-routing.test.cjs --runInBand --coverage=false — passed, 8 tests and 1 suite.'
  - 'Artifact: python3 scripts/orchestration/validate_artifact.py .codex/stages/content-factory-next-q4p/artifacts/routing.md — passed.'
  - 'Self-review: confirmed invite routing precedes the allowlist, non-root public pages stay public for signed-in users, the existing analytics/IS_GENERAL launches destination is unchanged, and both actions are semantic links with visible focus styles.'
changed_files:
  - apps/frontend/src/proxy.ts
  - apps/frontend/src/components/public-saas/public-shell.tsx
  - tests/public-saas-routing.test.cjs
  - .codex/stages/content-factory-next-q4p/artifacts/routing.md
explicit_defers:
  - none
---

# Summary

The public home exception no longer swallows organization invites or signed-in root requests. Anonymous invites now traverse `/?org=<jwt>` to `/auth?org=<jwt>`, persist the invite cookie, and return to query-free `/auth` so the auth UI renders. Signed-in invites use the existing join flow, signed-in plain-root requests retain the existing application destination, and the shared public shell exposes a separate sign-in link beside the demo action on every public page.

# Scope / Routing

The change is limited to the assigned proxy, public shell, focused routing test, and this artifact. The selected Lazyweb result was used only as pattern evidence for keeping sign-in as a distinct secondary action beside the primary demo action; existing Content Factory tokens and layout conventions remain authoritative. No child agent, external write, protected landing/auth file, or public-copy file was touched.

# Verification

Strict focused RED→GREEN was observed under Node 22.23.2 and `TMPDIR=/tmp`. The original RED failed on the three intended missing behaviors. During integration, the same suite first exposed its stale local-copy assertion, then the corrected test exposed the broken second anonymous invite hop. After switching that redirect to `/auth`, the exact suite passed 8/8 tests. No broad suite or build was run because final acceptance belongs to the root stream.

# Root acceptance

The root orchestrator accepted the current stream after the independent reviewer verified the complete anonymous invite chain, the signed-in join/root paths, and the corrected shared-translation test. Cohesive build and release checks remain root-owned.

# Delivery / Cleanup

Changes are present in the shared worktree for root review. No commit, merge, push, pull request, deploy, live action, worktree cleanup, or Beads mutation was performed.

# Risks / Follow-ups / Explicit Defers

The `copy('signIn')` dependency is supplied by the accepted guards/docs stream in all shipped locales, and the routing test now executes the shared `useT` key mapping instead of guarding removed local maps. Runtime routing still depends on the existing `auth` cookie/header contract, the browser preserving the written `org` cookie across redirects, `internalFetch('/user/join-org')`, and `IS_GENERAL` selection between `/launches` and `/analytics`. The focused test uses deterministic NextResponse/internalFetch boundary doubles and does not replace root-owned build or browser integration verification.
