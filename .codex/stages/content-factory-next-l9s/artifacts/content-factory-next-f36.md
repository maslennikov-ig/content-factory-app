---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: subagent:frontend-security
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: proxy authentication decision and shared browser fetch wrapper
public_facade: /provider/* loggedAuth bridge
bounded_acceptance: query token is accepted only on /provider/* in proxy and customFetch
non_goals:
  - UI components, provider protocol, cookie and header authentication behavior
evidence:
  - none
task_id: content-factory-next-f36
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: restrict loggedAuth query authentication to provider routes
milestone_status: accepted
agent_type: frontend_developer
subagent_model: gpt-5.6-terra
reasoning_effort: high
model_reasoning_rationale: session token exposure boundary
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-1
base_branch: unknown
base_commit: 833795208137011f47ff7bf7f12d9058a176251c
worktree: /home/me/code/content-factory-next
write_zone:
  - apps/frontend/src/proxy.ts
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/logged-auth.route-scope.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-f36.md
success_criteria:
  - ordinary routes never use loggedAuth as authorization or an API auth header
  - /provider/* continues to accept loggedAuth for the WebView bridge
  - a behavioral regression test fails when the pathname guard is removed
selected_docs:
  - AGENTS.md
  - graphify-out/GRAPH_REPORT.md
  - .codex/stages/content-factory-next-l9s/stage-manifest.json
selected_skills:
  - superpowers:test-driven-development
  - writing-good-tests.md
selected_agents:
  - frontend_developer
catalog_candidates:
  - none
parallel_group: wave1
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no temporary files or external resources created
risk_level: medium
verification_tier: inner
risk_tags:
  - security
  - authorization
  - user-flow
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: route scope is local implementation behavior; existing provider-page contract remains accurate.
verification:
  - source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/logged-auth.route-scope.test.cjs --runInBand: failed before implementation (2 failed, 2 passed); passed after implementation (4 passed)
  - git diff --check and git diff --no-index --check /dev/null tests/logged-auth.route-scope.test.cjs: passed
  - root rerun pnpm exec jest tests/logged-auth.route-scope.test.cjs --runInBand: passed, 4 tests
changed_files:
  - apps/frontend/src/proxy.ts
  - libraries/helpers/src/utils/custom.fetch.func.ts
  - tests/logged-auth.route-scope.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-f36.md
explicit_defers:
  - none
---

# Summary

`loggedAuth` from the URL is now authorization only under `/provider/*`. An
ordinary URL with the parameter reaches the normal login redirect and its
shared browser fetch does not receive an `auth` header. The provider WebView
flow retains both behaviors.

# Scope / Routing

Only the assigned proxy, shared fetch wrapper, focused behavioral test, and
stage artifact changed. The Graphify report and focused query were reviewed;
no external documentation or assets were needed. This is a security boundary,
not a visual interface change.

# Verification

RED: before the production change, the focused Jest command reported two
expected failures: `/analytics?loggedAuth=query-token` was accepted by proxy
as authenticated and its fetch emitted `auth: query-token`. Both provider
cases already passed.

GREEN: after the pathname guards, the same command passed all four cases.
The test runs the real transpiled proxy and `customFetch` modules with
controlled request/browser boundaries; removing either guard makes the related
ordinary-route assertion fail.

# Delivery / Cleanup

Returned for root-owned wave acceptance. No Git operations, external calls,
temporary files, or cleanup actions were performed.

# Risks / Follow-ups / Explicit Defers

The provider flow is verified at the proxy/fetch boundary, without a real
provider or WebView. Root-level integration acceptance should retain the
focused test; browser navigation and real-provider testing are not required
for this scoped change. No explicit defers.
