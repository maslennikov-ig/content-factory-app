---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-l9s/stage-manifest.json
stream_owner: wave3-rcg.4-survey
orchestration_level: inner_loop
scope_kind: foundation
immediate_consumer: later content-factory-next-rcg.4 implementation stream
public_facade: raw native control migration inventory and guard design
bounded_acceptance: every raw button/select/textarea occurrence is classified against the current source, with a shrink-only exception ledger proposed for intentional native implementations
non_goals:
  - Production, shared-primitive, test, Beads, or manifest edits
  - Reclassifying concurrent rcg.3-owned layout/admin changes as this stream's work
evidence:
  - rg_exact_tag_scan
  - shared_primitive_source_review
  - design_guard_source_review
task_id: content-factory-next-rcg.4.survey
epic_id: content-factory-next-rcg
stage_id: content-factory-next-l9s
session_id: n/a
milestone: map raw native controls before migration and guard introduction
milestone_status: accepted
agent_type: explorer
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: broad read-only classification of current frontend controls
repo: content-factory-next
branch: codex/2026-08-16-l9s-wave-3
base_branch: main
base_commit: e222ebed
worktree: /home/me/code/content-factory-next
write_zone:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.4-survey.md
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Shared workspace read-only survey; no temporary repository state or runtime resource is owned by this stream.
risk_level: medium
verification_tier: inner
risk_tags:
  - design-system
  - control-semantics
affected_surfaces:
  - frontend
invariants:
  - raw-control-count-reconciled
  - shared-form-contract-preserved
docs_impact: tests-only/planning evidence
docs_reviewed: no-change-needed
docs_review_notes: No product documentation changes; this is a migration map and test-guard proposal.
verification:
  - "rg exact opening-tag counts: button=100 in 47 files, select=4 in 3 files, textarea=9 in 8 files; union=54 files."
  - "Artifact-table reconciliation: 58 file+tag groups and 113 controls; 55 migrate-now + 5 intrinsic-primitive + 13 third-party-adapter + 15 semantic-special-case + 25 missing-capability."
  - "git diff --check and git diff --no-index --check passed for this artifact."
changed_files:
  - .codex/stages/content-factory-next-l9s/artifacts/content-factory-next-rcg.4-survey.md
explicit_defers:
  - "Later content-factory-next-rcg.4 worker: implement shared capabilities, migrate production call sites, and add the raw-control guard."
  - "rcg.3 owner: complete admin and shared-layout changes before this survey's corresponding migration batches run."
---

# Summary

Current exact baseline (TSX/JSX opening tags under `apps/frontend/src`): **100**
`<button>` in **47** files, **4** `<select>` in **3** files, and **9**
`<textarea>` in **8** files. The per-tag file totals are deliberately not
unioned: the union is **54 files**, because seven files contain more than one
control kind. This reproduces the root baseline rather than a conflicting
count. The rcg.3 worktree currently changes admin files and introduces
untracked layout primitives, but the scanned opening-tag totals still match.

Primary ownership path: raw JSX call site -> one of the two competing shared
layers (`libraries/react-shared-libraries/src/form/*` or
`apps/frontend/src/components/ui/*`) -> React DOM/native browser semantics.
The library `Button` supplies variants/loading. Its `Select` and `Textarea`
require `name` and `label`, register through `useFormContext` unless explicitly
disabled, and always render a wrapper/error slot. That contract is the point
where confidence drops for controlled inline controls: they cannot be a visual
drop-in without a small explicit standalone mode.

| Category | Groups | Controls | Decision |
| --- | ---: | ---: | --- |
| migrate-now | 19 | 55 | Standard actions; use existing `Button` variants/class override. Admin rows wait for rcg.3 ownership. |
| intrinsic-primitive | 3 | 5 | Native DOM is the implementation of a local shared primitive; ledger it. |
| third-party-adapter | 8 | 13 | Keep native boundary for Copilot/auth/media adapters; ledger it. |
| semantic-special-case | 7 | 15 | Radio/tab/list/navigation semantics need an explicit migration decision, not a blanket replacement. |
| missing-capability | 20 | 25 | Add narrow shared capabilities first, then migrate. |
| **Reconciled total** | **58 file+tag groups** | **113** | 100 + 4 + 9. |

## Exact file+tag map

`rcg.3` means implementation must wait: that stream owns shared layout plus
admin users/errors. Counts are opening-tag counts, not line counts.
There are 22 files with any shared form-primitive import; 17 of them have 35
raw buttons while importing the shared Button. No raw select imports shared
Select and no raw textarea imports shared Textarea, so those migrations must
prove the standalone contract rather than rely on an already-used call shape.

| File + tag | Count | Category | Rationale / batch |
| --- | ---: | --- | --- |
| `app/(app)/oauth/authorize/page.tsx` button | 2 | migrate-now | Approve/deny are ordinary primary/secondary actions. Batch A. |
| `components/admin/admin-errors.component.tsx` button | 1 | missing-capability | Mantine-styled icon close; wait rcg.3, then `Button` icon-only. |
| `components/admin/admin-errors.component.tsx` select | 2 | missing-capability | Controlled pagination/filter selects need wrapper-free shared Select; wait rcg.3. |
| `components/admin/admin-stats.component.tsx` button | 1 | migrate-now | Ordinary retry/action with existing Button import; wait rcg.3 admin slice. |
| `components/admin/admin-users.component.tsx` button | 2 | migrate-now | Retry/filter action with existing Button import; wait rcg.3 admin slice. |
| `components/agents/agent.chat.tsx` select | 1 | missing-capability | Controlled language picker; `form/Select` adds required form wrapper. |
| `components/agents/agent.input.tsx` button | 2 | third-party-adapter | CopilotKit input upload/send controls are adapter-local. |
| `components/agents/agent.textarea.tsx` textarea | 1 | third-party-adapter | Auto-resizing Copilot textarea owns imperative height behavior. |
| `components/auth/nayner.auth.button.tsx` button | 1 | third-party-adapter | Federated sign-in wrapper owns provider message/modal protocol. |
| `components/auth/providers/provider.button.tsx` button | 1 | third-party-adapter | Reusable federated-provider adapter, not product action vocabulary. |
| `components/billing/embedded.billing.tsx` button | 4 | semantic-special-case | Native `role=radio` plan/period selectors need a radio-choice primitive decision. |
| `components/billing/faq.component.tsx` button | 1 | migrate-now | Accordion trigger can retain ARIA props on shared Button. Batch A. |
| `components/billing/finish.trial.tsx` button | 1 | missing-capability | Mantine icon close; use future icon-only Button. |
| `components/billing/first.billing.component.tsx` button | 3 | semantic-special-case | Billing period/plan radio controls, not action buttons. |
| `components/developer/developer.component.tsx` button | 11 | migrate-now | Create/cancel/media/token actions are standard Button variants. Batch B. |
| `components/developer/developer.component.tsx` textarea | 2 | missing-capability | Controlled descriptions need standalone Textarea. |
| `components/launches/add.provider.component.tsx` button | 3 | migrate-now | Existing Button import; ordinary modal actions. Batch B. |
| `components/launches/ai.image.tsx` textarea | 1 | missing-capability | Controlled generation prompt needs standalone Textarea. |
| `components/launches/bot.picture.tsx` button | 1 | missing-capability | Mantine icon close; use future icon-only Button. |
| `components/launches/calendar.tsx` button | 2 | migrate-now | Preview/continue actions fit existing Button; preserve ARIA and explicit type. Batch B. |
| `components/launches/comments/comment.component.tsx` button | 1 | missing-capability | Mantine icon close despite existing Button/Textarea imports. |
| `components/launches/helpers/linkedin.component.tsx` button | 1 | migrate-now | Standard provider action with existing Button import. Batch B. |
| `components/launches/helpers/media.settings.component.tsx` button | 6 | migrate-now | Save/cancel/edit actions; map variants, retain handlers. Batch B. |
| `components/launches/import-debug-post.modal.tsx` textarea | 1 | missing-capability | Controlled JSON editor needs standalone Textarea (monospace via className). |
| `components/launches/launches.component.tsx` button | 1 | missing-capability | 28px icon-only channel-collapse control. |
| `components/launches/new.post.tsx` button | 1 | migrate-now | Main create action. Batch A. |
| `components/launches/time.table.tsx` button | 2 | missing-capability | Dense add plus icon-only remove; complete after icon-only Button. |
| `components/launches/up.down.arrow.tsx` button | 2 | missing-capability | 20px directional icon controls require icon-only size support. |
| `components/layout/impersonate.tsx` textarea | 1 | missing-capability | Controlled announcement description needs standalone Textarea. |
| `components/layout/logout.component.tsx` button | 1 | missing-capability | Icon/nav geometry requires icon-only or nav-action capability. |
| `components/layout/mode.component.tsx` button | 1 | missing-capability | 32px icon-only theme toggle. |
| `components/layout/new-modal.tsx` button | 1 | third-party-adapter | Mantine modal close class is an adapter boundary; keep in exception ledger. |
| `components/layout/organization.selector.tsx` button | 3 | semantic-special-case | Organization picker options use selection/navigation semantics. |
| `components/layout/settings.component.tsx` button | 2 | semantic-special-case | Navigation choice plus hidden submit are not visible action-button replacements. |
| `components/media/media.component.tsx` button | 3 | migrate-now | Upload/cancel/confirm actions; existing Button import. Batch B. |
| `components/new-launch/delay.component.tsx` button | 2 | migrate-now | Dense set/remove actions map to existing Button + `dense`/variant. |
| `components/new-launch/dummy.code.component.tsx` button | 1 | missing-capability | Mantine icon close. |
| `components/new-launch/manage.modal.tsx` button | 5 | migrate-now | Delete/schedule actions map to destructive/primary/secondary; remove literal colour. Batch B. |
| `components/new-launch/mention.component.tsx` button | 1 | semantic-special-case | Mention-list option must preserve listbox keyboard/selection behavior. |
| `components/new-layout/layout.component.tsx` button | 1 | missing-capability | Mobile navigation icon-only trigger; wait rcg.3 shared-layout owner. |
| `components/new-layout/menu-item.tsx` button | 1 | semantic-special-case | Navigation adapter conditionally renders a button versus link; wait rcg.3. |
| `components/new-layout/sidebar.tsx` button | 2 | missing-capability | Collapse icon and backdrop close; wait rcg.3 and use icon-only Button only for the former. |
| `components/onboarding/onboarding.modal.tsx` button | 4 | migrate-now | Ordinary step/close actions; map variants. Batch A. |
| `components/platform-analytics/analytics.screen.tsx` button | 1 | semantic-special-case | View tabs use `aria-current`; decide tab primitive/semantics first. |
| `components/platform-analytics/render.analytics.tsx` button | 1 | migrate-now | Refresh is a standard action. Batch A. |
| `components/plugs/plug.tsx` textarea | 1 | third-party-adapter | Hidden registered textarea backs a Copilot editor; preserve native form bridge. |
| `components/post-url-selector/post.url.selector.tsx` button | 1 | missing-capability | Mantine icon close. |
| `components/preview/comments.components.tsx` textarea | 1 | missing-capability | Registered comment field needs standalone/form-compatible Textarea without forced wrapper. |
| `components/public-api/public.component.tsx` button | 8 | migrate-now | API key create/copy/revoke controls are Button variants. Batch B. |
| `components/settings/ai-provider.component.tsx` button | 1 | migrate-now | Existing Button import; ordinary clear action. Batch A. |
| `components/settings/signatures.component.tsx` button | 1 | migrate-now | Existing Button import but Mantine close styling; migrate with icon-only capability if preserving icon geometry is required. |
| `components/third-parties/slider.component.tsx` button | 3 | third-party-adapter | Overlay carousel arrows/dots intentionally use media-specific semantics/contrast. |
| `components/third-parties/third-party.media-library.tsx` button | 3 | third-party-adapter | Integration picker/import flow is provider/media adapter-local. |
| `components/ui/button.tsx` button | 1 | intrinsic-primitive | This is the product-local Button DOM implementation. |
| `components/ui/field.tsx` button | 1 | intrinsic-primitive | This is the product-local Toggle DOM implementation. |
| `components/ui/field.tsx` select | 1 | intrinsic-primitive | This is the product-local Select DOM implementation. |
| `components/ui/field.tsx` textarea | 1 | intrinsic-primitive | This is the product-local Textarea DOM implementation. |
| `components/ui/layers.tsx` button | 1 | intrinsic-primitive | This is the local `MenuItem` DOM implementation. |

## Batches, capabilities, and guard

Safe bounded batches after imports are added: **A** oauth, FAQ, new-post,
onboarding, analytics refresh, settings AI (11 controls); **B** developer,
add-provider, calendar, LinkedIn helper, media settings/media, manage modal,
public API (40 controls); **C** delay (2 controls). `admin-*` and
`new-layout/*` are deliberately excluded until rcg.3 delivers. The table's
calendar/signatures rows should be rechecked for icon geometry immediately
before mutation; current confidence is medium because each file mixes old
Mantine styling with shared imports.

Small compatible additions, each followed by migration rather than a new style
system:

1. **`Button`: `iconOnly` plus `size` (`20 | 28 | 32`)**—preserve all existing
   variants/loading/disabled handling, set square padding and require an
   accessible name. Follow-up: `content-factory-next: add icon-only Button sizes
   and migrate native icon actions`.
2. **`Select`: standalone controlled mode**—make label/name/error slot optional
   when `standalone` is true; do not call `form.register`, do not render the
   wrapper/error gutter, retain native attributes and current CF control frame.
   Follow-up: `content-factory-next: add standalone controlled Select mode`.
3. **`Textarea`: standalone controlled mode**—same opt-out of label/error/form
   registration, retaining `className`, `ref`, native resize/rows and invalid
   semantics. Follow-up: `content-factory-next: add standalone controlled
   Textarea mode`.
4. **Do not generalize radios/tabs/listboxes in rcg.4**—their state/keyboard
   model is not expressed by Button props. Track separately: `content-factory-next:
   decide shared choice-control primitives for radio, tab, and listbox roles`.

Recommended ledger: `tests/raw-control-allowlist.json`, versioned and
shrink-only, e.g. `{ "version": 1, "total": 18, "allowances": { "path":
{ "button": 1, "select": 0, "textarea": 0 } } }`. The guard should AST-scan
TSX/JSX opening elements (not text/comments), calculate exact `(file, tag)`
counts, fail `actual > allowed` as a new raw control, and fail `actual < allowed`
as stale debt. It should also fail **any** raw tag in a file importing its
corresponding `@contentfactory/react/form/*` primitive unless that exact
file+tag is in a named exception class (`intrinsic-primitive`,
`third-party-adapter`, `missing-capability`) with a concise reason. The ledger
must reject unknown categories, zero/negative counts, and total mismatch.

# Verification

- `rg -o --glob '*.{tsx,jsx}' '<button\\b' apps/frontend/src | wc -l` → 100.
- Equivalent scans for `<select\\b` and `<textarea\\b` → 4 and 9.
- Per-tag file scans → 47 button files, 3 select files, 8 textarea files;
  union scan → 54 files.
- Table reconciliation: 55 migrate-now + 5 intrinsic + 13 third-party + 15
  semantic + 25 missing-capability = 113 controls.
- Reviewed contracts: `libraries/react-shared-libraries/src/form/button.tsx`,
  `select.tsx`, `textarea.tsx`; local intrinsic counterparts are
  `apps/frontend/src/components/ui/button.tsx`, `field.tsx`, `layers.tsx`.
- Reviewed current guard pattern: `tests/design.guard.test.cjs` has a
  bidirectional, exact-count geometry allowlist that the proposed raw-control
  ledger can mirror.

# Risks / Follow-ups

- **must-fix | high confidence:** adding a broad raw-control ban before the
  standalone Select/Textarea and icon-only Button capabilities will block known
  valid behaviors or force local style bypasses. Implement capabilities first.
- **high-value improvement | high confidence:** a shrink-only AST ledger stops
  new raw controls while making every intentional DOM boundary reviewable.
- **high-value improvement | medium confidence:** consolidate the two Button /
  Select / Textarea layers before declaring migration complete; this audit maps
  the current boundary but does not choose a canonical export.
- **optional/nit | medium confidence:** re-evaluate slider/media overlay
  controls after a dedicated media-control primitive exists; keeping them native
  is safer today because white-on-media contrast and carousel semantics are
  external-content-specific.
- Explicit defer: all production and test implementation remains with the
  later rcg.4 worker. No product documentation change is needed.
