---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream_e_style_and_copy
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: settings signpost links, interface-review stand controls
public_facade: Button / ButtonLink action scale
bounded_acceptance: no interactive element outside the primitives paints the accent fill or border, and the guard says so
non_goals:
  - repainting non-interactive status panels and badges with the same fill
  - migrating the eight inherited files already in the debt ledger
task_id: content-factory-next-fn33.25
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: one action scale in the interface
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: interface change plus a new AST guard over the whole frontend tree
repo: content-factory-next
branch: worktree-agent-ad9dddf6377b4a572
base_branch: main
base_commit: 1fcb1c99
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-ad9dddf6377b4a572
write_zone:
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/settings/sign-in-methods.component.tsx
  - apps/frontend/src/components/admin/admin-telegram-connect.component.tsx
  - apps/frontend/src/app/(stand)/interface-review/page.tsx
  - tests/design.guard.test.cjs
success_criteria:
  - the five interactive hand-painted accent elements render through ButtonLink
  - the guard fails on the pre-change tree and passes after
  - contrast and foundation stay green in both themes
selected_docs:
  - docs/design/component-authoring-rules.md
  - DESIGN.md
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
docs_review_notes: the rule already exists in component-authoring-rules.md; this adds the machine check for it
verification:
  - "pnpm exec jest tests/design.guard.test.cjs -t 'hand-painted accent' (before the fix): failed as designed, named the two files"
  - "pnpm exec jest tests/design.guard.test.cjs: passed (23)"
  - "pnpm exec jest tests/design.contrast.test.cjs tests/foundation.test.cjs tests/design.typography.test.cjs: passed (34)"
  - "pnpm exec jest tests/interface-review-*.test.cjs tests/user-identity.settings.test.cjs tests/onboarding-access.test.cjs tests/content-section.route.test.cjs: passed (114)"
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json: passed"
changed_files:
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/app/(stand)/interface-review/page.tsx
  - tests/design.guard.test.cjs
explicit_defers:
  - eight inherited files in HAND_ROLLED_ACCENT_ALLOWED (filters, pick.platform, select.customer, media, ai.image, import-debug-post, missing-release, content-intelligence.view) — selection chips written before the choice family existed
---

# Summary

`border border-cf-accent bg-cf-accent-soft text-cf-accent hover:bg-cf-accent` was a
sixth button variant nobody designed, retyped by hand onto five interactive
elements. All five now draw from `ButtonLink`: `primary` where the link is the
panel's one action (settings signposts to Content and to the walkthrough),
`primary`/`secondary` where it marks the current selection (theme, language and
width on the interface-review stand). The 44px touch target survives as the
`cf-control-h` token rather than the pair of hand-typed heights it was.

The other two occurrences named in the bead — the "Connected" badge in
sign-in-methods and the connection chip in admin-telegram-connect — are a
`span` and a `p role="status"`. Nothing presses them, and the bead excludes
non-interactive panels with the same fill, so they were left alone.

# Scope / Routing

Write zone as assigned. Documentation: no external/version-sensitive behaviour
was involved, so no `docs-resolve` call; the rule being enforced is the
repository's own `component-authoring-rules.md`.

The guard is an AST check rather than a grep, because the question is whether
the element is *interactive*, and that is a fact about its attributes. It reads
an intrinsic tag or a `Link` that carries `href`/`onClick`, or is an `a`/
`button`. Components are skipped on purpose: the choice family
(`MenuOption`, `ControlButton`, `RadioOption`) takes its paint from the call
site by design, so flagging it would fight the authoring rules rather than
enforce them.

# Verification

See the `verification` block. The guard was shown red on the unmodified tree
before the two files were changed; its failure output listed exactly those two
files and nothing else.

# Delivery / Cleanup

Committed on `worktree-agent-ad9dddf6377b4a572` as `91e57dd7`. Not pushed, not
merged.

# Risks / Follow-ups / Explicit Defers

- The guard reads `className` on the interactive element itself. A wrapper that
  paints the accent while a child inside it carries the `onClick` — which is how
  `launches/tags.component.tsx` is built — is invisible to it. Widening the rule
  to wrappers would flag a large number of legitimate panels, so it was left
  narrow; the tags control is named as follow-up under fn33.28 instead.
- The eight ledger entries are selection chips, not signposts. Migrating them
  means moving them onto the choice family, which is a behaviour change
  (keyboard, roles) and belongs in its own bead.
