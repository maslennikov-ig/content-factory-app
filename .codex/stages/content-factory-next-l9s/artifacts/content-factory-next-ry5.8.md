---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave2-ry5.8
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: local developers configuring social OAuth callbacks
public_facade: docs/development/local-development.md HTTPS tunnel runbook
bounded_acceptance: all social providers pass the redirect-domain guard and the five affected providers have exact FRONTEND_URL callback documentation
non_goals:
  - Opening a live tunnel or connecting a real social account.
  - Changing provider OAuth behavior that already satisfies the direct-callback rule.
  - Choosing or endorsing a paid tunnel vendor.
evidence:
  - none
task_id: content-factory-next-ry5.8
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: wave-2 local OAuth HTTPS tunnel documentation and redirect guard
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-luna
reasoning_effort: medium
model_reasoning_rationale: The user explicitly assigned gpt-5.6-luna to confirm this local provider audit and operational documentation criterion.
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-2
base_branch: main
base_commit: a1077e53
worktree: /home/me/code/content-factory-next
write_zone:
  - docs/development/local-development.md
  - tests/oauth-redirect-domain.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-ry5.8.md
success_criteria:
  - Every social provider implementation is scanned for foreign redirect services.
  - Threads, standalone Instagram, VK, TikTok, and Slack callbacks are derived from FRONTEND_URL.
  - Local HTTPS tunnel workflow documents exact callback registration and prohibits third-party OAuth-code redirectors.
selected_docs:
  - AGENTS.md
  - docs/operations/outbound-connections.md
  - docs/development/local-development.md
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
cleanup_notes: Shared worktree; no branch or temporary files created.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - oauth
  - external-callback
affected_surfaces:
  - documentation
  - regression-tests
invariants:
  - public-contract
  - test-matrix
  - oauth-state
  - callback-origin
docs_impact: docs-and-guard
docs_reviewed: yes
docs_review_notes: Existing authoritative runbook is docs/development/local-development.md; docs/operations/local-development.md does not exist and was not created as a duplicate.
verification:
  - 'RED mutation: Threads generateAuthUrl returned https://evil.example/return; focused Jest failed 1 test and passed 6, with the exact expected/received callback mismatch.'
  - 'GREEN: source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/oauth-redirect-domain.test.cjs --runInBand --coverage=false: passed, 7 tests'
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm run docs:check: passed, 62 files checked'
  - 'rg -n -i redirectmeto.com libraries/nestjs-libraries/src/integrations/social/*.provider.ts: no matches across 35 provider files'
  - 'git diff --check: passed'
changed_files:
  - docs/development/local-development.md
  - tests/oauth-redirect-domain.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-ry5.8.md
explicit_defers:
  - No live HTTPS tunnel or social-account OAuth flow was opened; this task only provides the reproducible local runbook and static guard.
---

# Summary

The five affected OAuth providers already build callbacks from `FRONTEND_URL`,
so no provider implementation rewrite was necessary. The focused regression
test executes each provider's real `generateAuthUrl()` and asserts the literal
first-party origin and exact callback path for Threads, standalone Instagram,
VK, TikTok, and Slack. A static scan of all 35 social provider implementations
remains as defense in depth against the known redirect service.

The local-development runbook now describes using an organization-approved
HTTPS tunnel, setting `FRONTEND_URL`, registering exact provider callbacks, and
keeping OAuth codes on the direct callback path to the local frontend.

# Scope / Routing

The provider implementations were audited, but none required a production-code
change: all five affected callbacks already derive from `FRONTEND_URL`. The
repository's authoritative local runbook is
`docs/development/local-development.md`; the assigned
`docs/operations/local-development.md` path does not exist, so no duplicate
runbook was introduced.

# Verification

The review finding was reproduced with a mutation that replaced the Threads
callback with `https://evil.example/return`, a URL containing neither
`redirect` nor `callback`. The focused suite failed only the Threads behavioral
case and reported the exact mismatch against
`https://local.content-factory.test/integrations/social/threads`. After
restoring the correct provider source, all seven tests passed.

The five behavioral cases transpile and execute each real provider class,
parse its returned authorization URL, and compare the decoded `redirect_uri`
to independent literal expectations. Network access is replaced with a
throwing test double and is asserted unused. The two static cases continue to
scan all 35 `*.provider.ts` implementations and check `FRONTEND_URL` source
coverage, but acceptance no longer depends on URL keywords.

The documentation checker passed all 62 files, the explicit provider scan
found zero `redirectmeto.com` matches, and `git diff --check` passed.

# Delivery / Cleanup

Changes remain in the shared wave-2 worktree for root acceptance. No commit,
branch switch, tunnel, OAuth flow, account connection, or external call was
performed. No cleanup is needed.

# Risks / Follow-ups

The executable proof covers the callback emitted by the five affected provider
implementations without external traffic, but it does not contact provider
consoles or prove their current dashboard configuration. A live provider check
remains an explicitly authorized operator action because it requires
credentials and a real social account. Root acceptance, independent re-review,
and wave-wide verification remain pending.
