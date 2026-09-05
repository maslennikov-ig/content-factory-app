---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-fn33/stage-manifest.json
stream_owner: stream-M
orchestration_level: inner_loop
scope_kind: product_slice
immediate_consumer: workspace administrator paying for AI, and the operator paying for included mode
public_facade: one role per AI call, with the model names kept in the organization's setting
bounded_acceptance: a call names its role; the organization setting routes a role to a model with textModel as the fallback; the ledger records the role; no call site names a model
non_goals:
  - a table of model names in the repository
  - changing what any AI call actually does
  - routing the call sites outside openai/ and content-intelligence/ (agent, autopost, chat, copilot) by hand
evidence:
  - ai-role-model-red-green
  - ai-role-routing-guard
  - ai-suites-green
  - locale-design-guards-green
  - tsc-backend-frontend-orchestrator
task_id: content-factory-next-x63z
epic_id: content-factory-next-fn33
stage_id: content-factory-next-fn33
session_id: content-factory-next-fn33
milestone: model chosen by the job, not one model for everything
milestone_status: in_progress
agent_type: worker
subagent_model: opus
reasoning_effort: high
model_reasoning_rationale: one seam touched by every AI call in the product, with a schema change and a tenancy question inside it
repo: content-factory-next
branch: worktree-agent-a4b29fd7045290f9f
base_branch: wave/cleanup-2026-09-05
base_commit: 555e08c4
worktree: /home/me/code/content-factory-next/.claude/worktrees/agent-a4b29fd7045290f9f
write_zone:
  - libraries/nestjs-libraries/src/openai
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-assist.service.ts
  - libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - docs/operations/ai-role-models-schema-apply.sql
  - docs/operations/production-deploy.md
  - sixteen frontend locales
  - tests
success_criteria:
  - every AI call in openai/ and content-intelligence/ names a role, none names a model
  - modelFor picks the organization's role model and falls back to textModel, imageModel for image roles
  - AiUsageRecord carries the role of each admitted operation
  - the settings screen sets a model per role and shows spend per role
selected_docs:
  - AGENTS.md
  - CLAUDE.md
  - docs/design/component-authoring-rules.md
  - docs/operations/post-context-review-schema-apply.sql
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
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch left in place for the integrator; nothing pushed
risk_level: high
risk_tags:
  - migration
  - tenancy
  - data
  - api
  - ui
affected_surfaces:
  - database
  - backend
  - api
  - ui
invariants:
  - tenancy
  - test-matrix
docs_impact: migration
docs_reviewed: updated
docs_review_notes: docs/operations/ai-role-models-schema-apply.sql written; production-deploy.md gained «Схема волны „зачистка“: модель на роль», marked not yet applied
verification:
  - "pnpm exec jest tests/ai": passed
  - "pnpm exec jest tests/locale-key-set.test.cjs tests/locale-translated.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs": passed
  - "pnpm exec jest tests/roles-matrix.guard.test.cjs tests/tenant-isolation.guard.test.cjs tests/backend-no-dynamic-alias-import.guard.test.cjs": passed
  - "pnpm exec jest tests/generator tests/brand-voice tests/autopost": passed
  - "pnpm exec tsc --noEmit -p apps/backend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json": passed
  - "pnpm exec tsc --noEmit -p apps/orchestrator/tsconfig.json": passed
  - "python3 -m unittest tests.test_docs_links": passed
changed_files:
  - libraries/nestjs-libraries/src/openai/ai.roles.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.config.ts
  - libraries/nestjs-libraries/src/openai/ai.clients.ts
  - libraries/nestjs-libraries/src/openai/ai.usage.service.ts
  - libraries/nestjs-libraries/src/openai/ai.provider.service.ts
  - libraries/nestjs-libraries/src/openai/openai.service.ts
  - libraries/nestjs-libraries/src/openai/web.research.service.ts
  - libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-assist.service.ts
  - libraries/nestjs-libraries/src/dtos/settings/ai.provider.dto.ts
  - libraries/nestjs-libraries/src/database/prisma/schema.prisma
  - apps/frontend/src/components/settings/ai-provider.component.tsx
  - docs/operations/ai-role-models-schema-apply.sql
  - docs/operations/production-deploy.md
  - tests/ai-role-model.test.cjs
  - tests/ai-role-routing.guard.test.cjs
  - tests/ai.clients.test.cjs
  - tests/ai.search.config.test.cjs
  - tests/ai.provider.component.test.cjs
  - tests/ai-provider.usage-mode.test.cjs
  - tests/ai-usage.execution.test.cjs
  - tests/locale-untranslated-allowlist.json
  - libraries/react-shared-libraries/src/translation/locales/*/translation.json
explicit_defers:
  - .env.example line for AI_ROLE_MODELS — the file is outside this stream's write zone; production-deploy.md says so and root should add it
  - the AI call sites outside this write zone (agent, autopost, chat, copilot) inherit their operation's role and are not routed by hand; a later bead can name finer roles there
  - users.repository.ts «untouched registration workspace» predicate does not list roleModels among the null AI-setting columns; the file is outside this write zone, the gap is narrow, and it is described under Risks
---

# Summary

Every AI call in the product resolved to one configured model. Classifying a
research subject — one sentence in, five short fields out — was billed at the
price of writing a draft, and the ceiling on what an included workspace could
cost the operator was set by the most expensive operation in the product. There
was no lever at all: the model id was read at the call site, so no setting could
move it.

The lever is a role. `libraries/nestjs-libraries/src/openai/ai.roles.ts` holds
the six roles (`classify`, `extract`, `research`, `draft`, `judge`, `image`) and
is the only place a role becomes a model id. The names of the models stay in the
organization's own setting, in one `roleModels` JSON column beside `textModel`;
nothing in the repository holds a table of them.

Three decisions worth reading before merging.

**In `included` mode the tenant's role map is ignored.** The key there is the
operator's, and a model id chosen by whoever opened the settings screen would
spend it. This is exactly how the stored `textModel` is already treated. The
operator's own lever is `AI_ROLE_MODELS`, one JSON environment variable — that
is where the included bill can actually be cut, and it is the mode the bead
calls out as «our bill, not the tenant's».

**`brief` is not a role.** The bead named it as an example, but
`content-brief.compose.ts` calls no model: a brief is assembled from sentences
the author already wrote. A row on the settings screen that no call ever reads
teaches a person nothing, so the list only holds roles with a real call site.
`research` was added instead, for the OpenRouter search fallback.

**The ledger records the operation's role, not every inner call's.** Admission
is per operation, so one row carries one role. A call finer than its operation —
the subject classifier inside a research run — names its own role for the
provider request without splitting the ledger row. Stated in the schema comment
so nobody later reads the breakdown as per-call.

Call sites outside this write zone (agent, autopost, chat, copilot) were not
edited. They pick up their operation's role through the active AI context, so
they keep exactly the model they had and can be routed by a setting rather than
by an edit.

# Scope / Routing

Write zone as declared above. `.env.example` was deliberately left alone: it is
outside the zone, and the `AI_ROLE_MODELS` line it needs is named in
`production-deploy.md` for root to add.

No new HTTP door: the role map rides the existing administrator-only
`GET`/`POST /settings/ai`, so `docs/product/roles-matrix.md` needs no row and
the guard confirms it.

# Verification

Both new suites were red first: 20 failed / 20 total before the implementation
(`tests/ai-role-model.test.cjs`, `tests/ai-role-routing.guard.test.cjs`).
Commands and results are in the front matter.

# Delivery / Cleanup

Returned on the stream branch, nothing pushed, nothing merged. The schema change
is not applied to any database.

# Risks / Follow-ups / Explicit Defers

The two columns must reach the production database **before** the image of this
wave is switched: the new code reads `roleModels` on every AI credential resolve
and writes `role` on every admission, so without them it is not a rare screen
that fails but every AI operation.

Routing anything to a cheaper model is a decision nobody has made yet. Nothing
in this change moves a single call off the model it uses today; it only makes
moving one possible.

One narrow gap left untouched because the file is outside this write zone.
`users.repository.ts` decides whether an organization is «an empty registration
workspace nobody has touched» by naming the AI-setting columns that must be
null — `apiKey`, `textModel`, `imageModel`, `searchApiKey`. `roleModels` is not
among them, so a workspace whose only act was routing a role still reads as
untouched. It matters only on the account-deletion path, for the deleting
person's own workspace, and only when every other relation is genuinely empty.
Adding `roleModels: null` to that `is` block closes it.
