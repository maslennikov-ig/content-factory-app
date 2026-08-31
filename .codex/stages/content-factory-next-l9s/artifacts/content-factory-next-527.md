---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave2-527
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root orchestrator
public_facade: n/a
bounded_acceptance: exact ka_ge/en key-set parity and AGPL open-source FAQ boundary across all locales
non_goals:
  - translation of unrelated keys
  - production or external repository changes
evidence:
  - none
task_id: content-factory-next-527
epic_id: content-factory-next-l9s
stage_id: content-factory-next-l9s
session_id: n/a
milestone: wave-2 localization and AGPL FAQ boundary correction
milestone_status: accepted
agent_type: frontend_developer
subagent_model: gpt-5.6-luna
reasoning_effort: medium
model_reasoning_rationale: exact locale key synchronization and copy safety checks
repo: /home/me/code/content-factory-next
branch: codex/2026-08-16-l9s-wave-2
base_branch: main
base_commit: a1077e53
worktree: /home/me/code/content-factory-next
write_zone:
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
  - apps/frontend/src/components/billing/faq.component.tsx
  - tests/locale-key-set.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-527.md
success_criteria:
  - en and ka_ge contain identical key sets with zero missing and zero extra keys.
  - All 16 locale FAQ values describe the AGPL-3.0 open-source product and contain no upstream repository URL.
  - FAQ component fallback states the AGPL-3.0 open-source product boundary without an upstream URL.
selected_docs:
  - AGENTS.md
  - PRODUCT.md
  - scripts/i18n/collect-ui-keys.cjs
selected_skills:
  - /home/me/.agents/skills/superpowers/test-driven-development/SKILL.md
selected_agents:
  - frontend_developer
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
risk_level: medium
verification_tier: inner
risk_tags:
  - localization
  - user-facing-copy
affected_surfaces:
  - frontend
invariants:
  - locale-schema
  - privacy-accurate-copy
docs_impact: user-facing copy
docs_reviewed: no-change-needed
docs_review_notes: Local product visibility statement and task context were authoritative; no external docs required.
verification:
  - 'RED review correction: the private-product wording failed the AGPL-3.0 open-source product contract.'
  - 'RED TDD: strengthened focused Jest test failed on English upstream wording embedded in non-English FAQ strings.'
  - 'GREEN: source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/locale-key-set.test.cjs --runInBand --coverage=false — passed, 3 tests.'
  - 'GREEN: source "$HOME/.nvm/nvm.sh" && nvm use --silent && pnpm exec jest tests/i18n.ui-literals.test.cjs --runInBand --coverage=false — passed, 4 tests.'
  - 'git diff --check — passed.'
changed_files:
  - libraries/react-shared-libraries/src/translation/locales/ar/translation.json
  - libraries/react-shared-libraries/src/translation/locales/bn/translation.json
  - libraries/react-shared-libraries/src/translation/locales/de/translation.json
  - libraries/react-shared-libraries/src/translation/locales/en/translation.json
  - libraries/react-shared-libraries/src/translation/locales/es/translation.json
  - libraries/react-shared-libraries/src/translation/locales/fr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/he/translation.json
  - libraries/react-shared-libraries/src/translation/locales/it/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ja/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ka_ge/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ko/translation.json
  - libraries/react-shared-libraries/src/translation/locales/pt/translation.json
  - libraries/react-shared-libraries/src/translation/locales/ru/translation.json
  - libraries/react-shared-libraries/src/translation/locales/tr/translation.json
  - libraries/react-shared-libraries/src/translation/locales/vi/translation.json
  - libraries/react-shared-libraries/src/translation/locales/zh/translation.json
  - apps/frontend/src/components/billing/faq.component.tsx
  - tests/locale-key-set.test.cjs
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-527.md
explicit_defers:
  - 'content-factory-next-9jv: publish the exact deployed Corresponding Source at a Content Factory-owned URL and add the required visible Source link; this wave cannot authorize publication or invent the destination.'
---

# Summary

The Georgian locale now has exactly the English key set: 1165 keys in each locale, with 0 missing and 0 extra after adding 20 keys and removing 3 stale keys. Following the P1 review finding, FAQ availability copy in all 16 locales and the component fallback now state that Content Factory is an AGPL-3.0 open-source product; non-English locales use fully localized wording for the upstream foundation and contain no upstream URL.

# Scope / Routing

The stream stayed within locale JSON files, the billing FAQ component, and one focused Jest regression suite. No external docs, assets, production systems, or upstream repositories were touched.

# Verification

The initial regression suite was RED. It was then converted to native Jest tests so it participates correctly in the repository's Jest-based acceptance suite. The exact target passed 3/3 tests; the existing i18n UI guard passed 4/4 tests; `git diff --check` passed.

# Delivery / Cleanup

Changes are present in the shared wave-2 worktree for root review and acceptance. No commit, staging, branch switch, or external action was performed.

# Risks / Follow-ups / Explicit Defers

The initial private/closed-source wording was rejected because it contradicted AGENTS.md, ADR-0005, and the AGPL-3.0 product status. A follow-up quality check also rejected literal English upstream wording in non-English locales; all 15 non-English FAQ values were localized and guarded by the focused test. The still-owner-bound publication and visible corresponding-source URL are tracked in `content-factory-next-9jv`.
