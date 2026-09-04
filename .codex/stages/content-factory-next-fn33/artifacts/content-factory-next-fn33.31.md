---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream_e_style_and_copy
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: settings tabs in a non-English interface
public_facade: i18next catalogue
bounded_acceptance: no visible English literal left on a settings tab, and no debug logging on timezone change
non_goals:
  - translating brand names and licence identifiers
  - the settings surface layout
task_id: content-factory-next-fn33.31
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: settings speak the interface language
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: small code change, sixteen-language catalogue edit
repo: content-factory-next
branch: worktree-agent-ad9dddf6377b4a572
base_branch: main
base_commit: 1fcb1c99
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad9dddf6377b4a572
write_zone:
  - apps/frontend/src/components/settings/**
  - libraries/react-shared-libraries/src/translation/locales/**
success_criteria:
  - "Date format", "24 hours" and "AM:PM" read in the interface language
  - the grep over every settings tab finds nothing else visible and untranslated
  - console.log removed from changeTimezone
selected_docs:
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: fn33-stream-e
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: branch left for the root to integrate
risk_level: low
risk_tags:
  - ui
affected_surfaces:
  - ui
invariants:
  - none
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: no product decision changed
verification:
  - "pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/i18n.ui-literals.test.cjs: passed (9)"
  - "pnpm exec jest tests/interface-review-settings-admin.test.cjs tests/user-identity.settings.test.cjs tests/design.guard.test.cjs: passed (65)"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed"
changed_files:
  - apps/frontend/src/components/settings/metric.component.tsx
  - apps/frontend/src/components/settings/github.component.tsx
  - apps/frontend/src/components/settings/settings-surface.component.tsx
  - apps/frontend/src/components/settings/signatures.component.tsx
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
explicit_defers:
  - none
---

# Summary

"Date format" and the "24 hours" / "AM:PM" options were literals in the markup
and stayed English under a Russian interface. Six keys now carry them, entered
in all sixteen catalogues next to `global_settings` rather than appended at the
end, so parallel streams adding keys do not land on the same line.

The same sweep over every settings tab found four more visible English strings
that never reached the catalogue: the repository URL placeholder, the signature
placeholder, and the two programmatic names on the settings navigation
(`aria-label="Settings"`, `aria-label="Settings sections"`) — the last two are
what a screen reader reads out, so they are interface text with no pixels.
`AGPL-3.0` and the `OpenAI` / `OpenRouter` option names were left alone: a
licence identifier and two product names are the same in every language. The
`Email`, `Role` and "Auto add signature?" labels are already translated —
`TranslatedLabel` derives `label_email` and friends from the label text.

The `console.log(value)` in `changeTimezone` is gone.

# Scope / Routing

Write zone as assigned plus the catalogues. Documentation: none needed; nothing
version-sensitive or external is involved.

# Verification

See the `verification` block. `tests/locale-key-set.test.cjs` proves all sixteen
carry the new keys; `tests/locale-translated.test.cjs` proves the eight
script-bearing locales received real text rather than English.

# Delivery / Cleanup

Committed on `worktree-agent-ad9dddf6377b4a572` as `d1910bb3`. Not pushed, not
merged.

# Risks / Follow-ups / Explicit Defers

- The `12 hours (AM/PM)` wording is a change of words as well as of language:
  the option used to read `AM:PM`, which is a format string, not a choice. The
  owner may prefer the terser form.
- The interface-review stand does not hydrate i18next (known), so the two new
  `aria-label` values read English there regardless of the scene language. That
  is the stand's existing behaviour, not a regression.
