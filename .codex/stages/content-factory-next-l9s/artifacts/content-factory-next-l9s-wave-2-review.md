---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: content-factory-next-l9s.wave2.review
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: n/a
bounded_acceptance: read-only correctness review of wave 2 base a1077e53 through corrected head a426aee5
non_goals:
  - implementation edits
  - Beads writes
  - broad acceptance reruns
evidence:
  - none
task_id: content-factory-next-l9s.wave2.review
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: wave-2 independent correctness review
milestone_status: accepted
agent_type: correctness_reviewer
subagent_model: gpt-5.6-sol
reasoning_effort: xhigh
model_reasoning_rationale: supply-chain, public SDK, OAuth callback, localization, and AGPL product-boundary changes require an independent senior model
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-2
base_branch: main
base_commit: a1077e53
worktree: /home/me/code/content-factory-next
write_zone:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-2-review.md
success_criteria:
  - Findings include severity, confidence, file:line, concrete failure case, fix, expected value, tradeoff, and classification.
  - Final verdict is ACCEPT or REJECT.
selected_docs:
  - AGENTS.md
  - SECURITY.md
  - PRODUCT.md
  - docs/adr/0005-release-content-factory-next-under-agpl.md
  - docs/operations/outbound-connections.md
  - .codex/handoff.md
  - .codex/stages/content-factory-next-l9s/plan.md
  - .codex/stages/content-factory-next-l9s/prompt.md
  - .codex/stages/content-factory-next-l9s/stage-manifest.json
  - five wave-2 stream artifacts
  - bd show for 4ug/ry5.7/ry5.8/4w5/527
  - /home/me/.agents/skills/superpowers/requesting-code-review/SKILL.md
  - /home/me/.agents/skills/superpowers/requesting-code-review/code-reviewer.md
selected_skills:
  - superpowers:requesting-code-review
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - wave2-4ug
  - wave2-ry5.7
  - wave2-ry5.8
  - wave2-4w5
  - wave2-527
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only review; no runtime resources created.
risk_level: high
verification_tier: delta
risk_tags:
  - supply-chain
  - security
  - oauth
  - public-api
  - licensing
  - localization
affected_surfaces:
  - repository
  - sdk
  - frontend
  - documentation
  - regression-tests
invariants:
  - upstream-provenance
  - public-contract
  - external-boundary
  - callback-origin
  - locale-schema
  - test-matrix
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Review-only artifact; findings identify implementation and proof corrections for the owning streams.
verification:
  - read-only git diff/stat/log/show for a1077e53..d41bc763: completed
  - read-only inspection of all five Beads records and wave-2 artifacts: completed
  - read-only inspection of SDK scan, supply-chain guard, OAuth providers/runbook, locale guard/copy, upstream remote, and accepted ADR: completed
  - targeted correction review of commits 212fd018 and a426aee5 plus Beads content-factory-next-9jv: completed
  - 'source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/oauth-redirect-domain.test.cjs tests/locale-key-set.test.cjs --runInBand --coverage=false: passed, 2 suites and 10 tests'
  - git diff d41bc763..a426aee5 --check: passed
changed_files:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-l9s-wave-2-review.md
explicit_defers:
  - 'content-factory-next-9jv remains an external release blocker: an owner must publish the exact deployed Corresponding Source at a Content Factory-owned URL and wire the visible Source link. Wave 2 now states the truthful AGPL boundary without inventing or publishing that destination.'
---

# Summary

Verdict: ACCEPT.

Both previously reported must-fix findings are closed in corrected head
`a426aee5`. All 16 locale values and the component fallback now state the
AGPL-3.0 open-source boundary, do not present the upstream repository as this
product's source, and contain no private/closed-source claim. The still-missing
Content Factory-owned corresponding-source URL is separately and precisely
tracked as P1 `content-factory-next-9jv`, because choosing and publishing that
external destination is outside this wave's authority.

The OAuth suite now transpiles and invokes the real `generateAuthUrl()` method
for each of the five providers, parses its returned authorization URL, and
asserts the exact decoded `redirect_uri` against a sentinel `FRONTEND_URL` and
literal callback path without network access.

# Findings

No P0-P3 findings remain in the targeted correction review.

Closed P1: `apps/frontend/src/components/billing/faq.component.tsx:26-30` and
all 16 values of `faq_we_are_proudly_open_source` now say that Content Factory
is an AGPL-3.0 open-source product. They contain no upstream URL and distinguish
the upstream foundation from this product's source repository. The focused
locale guard rejects private/closed-source wording and requires an AGPL/open-
source statement for every locale. The unavailable corresponding-source URL is
not silently dismissed: `content-factory-next-9jv` is an open P1 with the exact
publication, deployed-commit, visible-link, provenance and secret-safety
acceptance boundary.

Closed P2: `tests/oauth-redirect-domain.test.cjs:121-149` executes the real
provider method for Threads, standalone Instagram, VK, TikTok and Slack with
`FRONTEND_URL=https://local.content-factory.test`. Each returned URL is parsed
and its decoded `redirect_uri` must equal the sentinel origin plus the exact
provider path. `global.fetch` is a throwing Jest double and is asserted unused.
The stream evidence records the required mutation: replacing Threads' callback
with `https://evil.example/return` produced one exact RED failure while the
other six cases passed; restoring the implementation returned 7/7 GREEN.

# Strengths

- `content-factory-next-4ug` removes the inherited upload workflows, dead
  submodule declaration, funding metadata, upstream issue routes, credential-
  shaped example, extension key and CodeRabbit config. The GitHub-settings gap
  is precisely deferred to `content-factory-next-woy`.
- `content-factory-next-ry5.7` intentionally changes the public default export
  to `ContentFactory`, removes the upstream default address/author, and adds
  `apps/sdk` to the existing scanner without adding an allowlist entry.
- `content-factory-next-4w5` preserves the Postiz fetch provenance while the
  actual local push URL is `DISABLED`; the new-machine runbook reproduces the
  split configuration.
- `content-factory-next-527` establishes exact 1165/1165 `ka_ge`/`en` key-set
  parity with zero missing or extra keys. The factual FAQ finding above is
  separate from that mechanically correct parity work.

# Verification

The two corrected focused suites were rerun together under Node 22.23.2 and
pnpm 10.6.1: 2/2 suites and 10/10 tests passed. `git diff
d41bc763..a426aee5 --check` passed. No broad acceptance was rerun; root-owned
wave acceptance remains separate.

# Risks / Follow-ups

`content-factory-next-9jv` remains a real P1 release blocker, but it is not an
untracked wave-2 defect: the local correction is truthful and the external
owner action has a dedicated Beads record. Live provider-console configuration
also remains an explicitly authorized operator action and is not a finding in
this review.

# Delivery / Cleanup

No implementation files, tests, documentation, Beads state, Git index, branch
state, external systems, or production resources were changed. This review
artifact is the only write.
