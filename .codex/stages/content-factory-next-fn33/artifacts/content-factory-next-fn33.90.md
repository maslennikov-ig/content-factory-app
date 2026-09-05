---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-B2
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: root integration stream for wave/owner-decisions-2026-09-05
public_facade: Sections.EDITOR + isOrganizationEditor
bounded_acceptance: three roles answer differently on the doors the owner named, and docs/product/roles-matrix.md is true
non_goals:
  - per-record access (a person in the workspace still sees every post, fact and voice)
  - a configurable permission matrix
  - any schema change; the roles were already in the database
evidence:
  - roles-matrix-guard
  - three-role-doors
  - backend-typecheck
  - frontend-typecheck
  - design-locale-guards
  - process-verification
task_id: content-factory-next-fn33.90
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: owner-decisions-2026-09-05
milestone: Роль Редактора получает содержимое, Пользователь остаётся читателем
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: role_default
model_reasoning_rationale: many coupled decorators plus a document that must stay true about all of them
repo: content-factory-next
branch: worktree-agent-a72dfcda83ce4b263
base_branch: wave/owner-decisions-2026-09-05
base_commit: 686d7f4b646b0ecf7f97e3458ef49499d6834871
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a72dfcda83ce4b263
write_zone:
  - apps/backend/src/api/routes/*.controller.ts (policy decorators, their imports, the two canManage helpers)
  - apps/backend/src/services/auth/permissions/**
  - libraries/nestjs-libraries/src/user/**
  - apps/frontend settings.component.tsx, content section, post window, calendar, new.post
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/** (16)
  - tests/**
success_criteria:
  - EDITOR passes posts, voice, avatars, sources, facts, briefs, materials, feeds, sets, signatures, autopost
  - USER is refused those with 403 and keeps reading and commenting
  - ADMIN keeps channels, team, AI keys, webhooks, OAuth apps, short links
  - the settings screen offers a role only the tabs it can use
  - tests/roles-matrix.guard.test.cjs green with an honest table
selected_docs:
  - docs/product/roles-matrix.md
  - docs/design/component-authoring-rules.md
selected_skills:
  - none
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: wave-cleanup-2026-09-05
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left for the root integration stream
risk_level: high
risk_tags:
  - authorization
  - api
  - ui
  - user-flow
affected_surfaces:
  - backend
  - api
  - ui
  - user-flow
invariants:
  - tenancy
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/product/roles-matrix.md rewritten — the doors table, the roles table, the settings screen; the sentence «Редактор равен Пользователю» is gone
verification:
  - "pnpm exec jest tests/roles-matrix.guard tests/tenant-isolation.guard tests/team tests/superadmin-role.guard tests/role tests/settings tests/content-intelligence tests/posts tests/permissions.service": passed
  - "pnpm exec jest <37 affected patterns> (1764 tests)": passed
  - "pnpm exec jest tests/design.guard tests/design.contrast tests/foundation tests/locale-key-set tests/locale-translated": passed
  - "node --test tests/content-source-registry.test.cjs tests/brand-profile.contract.test.cjs tests/content-search-evidence.test.cjs": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "scripts/orchestration/run_process_verification.sh": passed
changed_files:
  - apps/backend/src/services/auth/permissions/permission.exception.class.ts
  - apps/backend/src/services/auth/permissions/permissions.service.ts
  - libraries/nestjs-libraries/src/user/organization.roles.ts
  - apps/backend/src/api/routes/autopost.controller.ts
  - apps/backend/src/api/routes/brand-profile.controller.ts
  - apps/backend/src/api/routes/brand-voice.controller.ts
  - apps/backend/src/api/routes/content-archive.controller.ts
  - apps/backend/src/api/routes/content-brief.controller.ts
  - apps/backend/src/api/routes/content-context.controller.ts
  - apps/backend/src/api/routes/content-lead.controller.ts
  - apps/backend/src/api/routes/content-material.controller.ts
  - apps/backend/src/api/routes/content-source.controller.ts
  - apps/backend/src/api/routes/copilot.controller.ts
  - apps/backend/src/api/routes/posts.controller.ts
  - apps/backend/src/api/routes/sets.controller.ts
  - apps/backend/src/api/routes/signature.controller.ts
  - apps/backend/src/api/routes/webhooks.controller.ts
  - apps/frontend/src/components/layout/settings.component.tsx
  - apps/frontend/src/components/launches/calendar.tsx
  - apps/frontend/src/components/launches/new.post.tsx
  - apps/frontend/src/components/new-launch/compose-block-reason.tsx
  - apps/frontend/src/components/new-launch/manage.modal.tsx
  - apps/frontend/src/components/content-intelligence/content-intelligence.settings.tsx
  - apps/frontend/src/components/content-intelligence/content-leads.tab.tsx
  - apps/frontend/src/components/content-intelligence/content-write-right.tsx
  - docs/product/roles-matrix.md
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json (16)
  - tests/helpers/backend-doors.cjs
  - tests/role-doors.three-roles.test.cjs
  - tests/roles-matrix.guard.test.cjs
  - tests/brand-voice.routes.test.cjs
  - tests/brand-voice.rights-retention.test.cjs
  - tests/brand-profile.contract.test.cjs
  - tests/content-leads.role-visibility.test.cjs
  - tests/content-search-evidence.test.cjs
  - tests/content-source-registry.test.cjs
  - tests/settings-tab-address.test.cjs
  - tests/user-identity.settings.test.cjs
  - tests/locale-untranslated-allowlist.json
explicit_defers:
  - "libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts:462 still says «изменить голос может администратор». Stream A2 owns that file; the sentence should read «редактор»."
---

# Summary

Owner decision of 05.09.2026, option «в». `EDITOR` stopped being a name with no
door behind it, and `USER` stopped being a writer.

One boundary, drawn by subject rather than by danger: the editor makes what the
workspace **publishes**; the administrator keeps what the workspace **owns**.
Posts, brand voice and avatars, the source register and the facts on it,
briefs, materials, idea feeds, sets, signatures, the autopost rule and the
assistant went to the editor. Channels, people, model keys and spend, webhooks,
OAuth applications and short links stayed with the administrator. The user
reads and comments.

Sixty-eight doors carry `Sections.EDITOR` where before they carried
`Sections.ADMIN`, a plan limit alone, or nothing at all. The rule itself is one
function, `isOrganizationEditor`, and both halves of the product read it: the
server through a `ROLE_SECTIONS` table in `permissions.service.ts`, every
screen directly. The inline `['ADMIN', 'SUPERADMIN'].includes(...)` that used
to sit inside the permission loop — the source of every hand-written copy of
that list — is gone with it.

A second finding came out of the work and is worth naming on its own. Two
controllers declare their policies as file-level constants
(`const adminUpdate = [Update, Sections.ADMIN]`) and pass the name to the
decorator. The matrix guard read decorator argument text with a regular
expression, matched nothing, and dropped those handlers as policy-free —
**twenty doors**, every fact, every piece of evidence and the whole brand
profile, invisible to the guard and absent from the matrix with nothing
failing. The reader now follows an alias one hop, and those doors are in the
table.

# Scope / Routing

Write zone as assigned. Two deliberate widenings inside it, both one line and
both required for the result to be coherent:

`canManageVoice` in `brand-voice.controller.ts` and `canManageProfile` in
`brand-profile.controller.ts` are not decorators, but they are the flag the
avatars and profile screens read to decide whether to offer the form. Left on
`isOrganizationAdmin` they would have told an editor the section was read-only
while the door accepted the write. Both now call `isOrganizationEditor`.
Neither is inside `libraries/.../brand-voice/**`, which stream A2 owns.

The matrix table gained a notation: a comma joins policies on one door, a
semicolon separates different policy sets among the doors of one row.
`/webhooks` forced it — `POST` there is a plan limit and a role, `PUT` on the
same path is the role alone, and no split by path can tell them apart.

The settings screen's bracket convention gained a second mark: square brackets
stay «administrator only», round brackets mean «editor and administrator».

Client-side the existing mechanism of each section was reused, never a second
one. «Откуда идеи» and the sources tab read the role from the session
(`fn33.63`); facts and the archive learn it from the server's 403
(`cl19`, `content-write-right.tsx`) and needed no change at all to follow the
new threshold — which is what that module was written for. The post window
got its refusal through `composeBlockReason`, the one expression that already
computes why the main button will not press.

# Verification

Every command run by hand in this worktree under Node 22.23.2.

- `pnpm exec jest tests/roles-matrix.guard tests/tenant-isolation.guard
  tests/team tests/superadmin-role.guard tests/role tests/settings
  tests/content-intelligence tests/posts tests/permissions.service`
  — 22 suites, 360 tests, passed.
- `pnpm exec jest` over the 37 patterns covering every suite that names a
  changed file — 119 suites, 1764 tests, passed.
- `pnpm exec jest tests/design.guard tests/design.contrast tests/foundation
  tests/locale-key-set tests/locale-translated` — 54 tests, passed.
- `node --test` on the three suites `jest.config.cjs` ignores and that assert
  on these controllers' policies — 41 tests, passed.
- `pnpm exec tsc --noEmit` for `apps/backend` and `apps/frontend` — exit 0
  each, no errors, as before the change.
- `scripts/orchestration/run_process_verification.sh` — OK.

Red first, shown: `tests/roles-matrix.guard.test.cjs` failed 13 of 45 on the
new decorators before the document was rewritten.
`tests/role-doors.three-roles.test.cjs` failed 20 of 41 when
`isOrganizationEditor` was temporarily made to answer like
`isOrganizationAdmin` — the exact state the live walkthrough measured on
04.09 — and the probe was reverted immediately.

# Delivery / Cleanup

Returned on `worktree-agent-a72dfcda83ce4b263` for the root integration
stream. Nothing pushed, nothing merged, no bead closed. No schema change, no
data step: the roles were already in the database, so the release needs
nothing beyond the code.

# Risks / Follow-ups / Explicit Defers

**The one owner assumption that is not in the decision.** Webhooks went to the
administrator, not the editor. The owner said nothing about them; a webhook is
an outbound address after which everything the workspace publishes starts
arriving at somebody else's server, so the narrowest reading was taken. It is
one decorator and one matrix row to reverse. Comments stay with the user, as
instructed.

Two smaller judgements, both recorded in the matrix: the assistant
(`POST /copilot/agent`, `/copilot/research`) went to the editor because it
writes the post and spends the model budget, and «Взять в работу» on a lead
went with it because accepting a lead opens a draft.

**Cross-stream.** `libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice.service.ts:462`
still returns «Раздел открыт на чтение: изменить голос может администратор.»
The door is the editor's now, so that sentence names the wrong person to ask.
The file belongs to stream A2 and was not touched.

**Merge overlap to expect.** `tests/brand-voice.routes.test.cjs` and
`tests/brand-voice.rights-retention.test.cjs` were edited here (the section
they assert on is `editor`, and their `Sections` mock needed the new value).
If A2 touched the same tests, take both changes rather than either.

Doors that carry no policy at all and were left that way, named so they are
not mistaken for a decision: `POST /copilot/chat`, everything under `/media`
(image and video generation spends real money), and the channel-settings
routes `/integrations/:id/*`. The first two are gaps worth a bead; the third
is the channel boundary, which this task was told not to widen.
