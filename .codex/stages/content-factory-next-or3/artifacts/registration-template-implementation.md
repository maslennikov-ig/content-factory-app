---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:registration-template-implementation
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: root orchestrator for public-funnel integration acceptance
public_facade: public starter-template chooser and existing POST /auth/register
bounded_acceptance: LOCAL and OAuth registration preserve one allowlisted starter intent and atomically create exactly four workflow Tags for a new organization
non_goals:
  - schema model, migration, template authoring, or asynchronous seed workflow
  - pricing, trial, card, provider, region, legal-model, deployment, or live account decisions
  - broad release, browser lifecycle, production, remote, paid, credential, or real-user action
evidence:
  - none
task_id: content-factory-next-or3.registration-template-implementation
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: accessible progressive registration with one real starter-template seed
milestone_status: accepted
agent_type: worker
subagent_model: gpt-5.6-sol
reasoning_effort: medium
model_reasoning_rationale: auth, atomic persistence, compatibility, and accessible UI cross a high-risk product slice
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - libraries/nestjs-libraries/src/dtos/auth/**
  - libraries/nestjs-libraries/src/database/prisma/organizations/**
  - apps/frontend/src/components/public-saas/**
  - apps/frontend/src/components/auth/register.tsx
  - libraries/react-shared-libraries/src/translation/locales/**
  - tests/registration*.test.cjs
  - tests/public-saas*.test.cjs
  - tests/starter-template*.test.cjs
  - tests/auth-conversion.frontend.test.cjs
  - tests/newsletter.consent.frontend.test.cjs
  - tests/credential.fields.test.cjs
  - tests/telegram.auth.flow.test.cjs
  - tests/global.validation-pipe.test.cjs
  - tests/newsletter.subscription.test.cjs
  - .codex/stages/content-factory-next-or3/artifacts/registration-template-implementation.md
success_criteria:
  - blank remains the safe default and content-workflow is the only real allowlisted template
  - LOCAL and OAuth registration carry the chosen intent without putting email or intent in a URL
  - OAuth session intent is allowlisted, expiring, single-use, and contains no account, workspace, provider, or arbitrary payload
  - content-workflow nests exactly Plan, Draft, Review, and Schedule Tags in the new organization create
  - seed failure rolls back the account unit and duplicate identity cannot persist a second organization or tag quartet
  - public and auth choosers are accessible and all sixteen locale bundles are complete
selected_docs:
  - .codex/stages/content-factory-next-or3/artifacts/registration-template-map.md
  - .codex/stages/content-factory-next-or3/spec.md
  - .codex/stages/content-factory-next-or3/plan.md
  - docs/design/component-authoring-rules.md
  - PRODUCT.md
  - DESIGN.md
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - impeccable
  - lazyweb
selected_agents:
  - none
catalog_candidates:
  - existing tenant Tags model and accepted Plan, Draft, Review, Schedule workflow
parallel_group: registration-template-implementation
depends_on_streams:
  - registration-template-map
parallel_decision: sequential implementation after accepted discovery map
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: corrected implementation accepted; no child process, server, browser session, external session, temporary directory, child branch, worktree, remote state, or credential required cleanup
risk_level: high
risk_tags:
  - security
  - atomicity
  - retry
  - idempotency
  - rollback
  - public-api
  - data
  - ui
  - user-flow
affected_surfaces:
  - database
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - idempotency
  - rollback
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the accepted stage specification and discovery map already document the exact template, tag seed, OAuth privacy boundary, and no-migration decision
verification:
  - 'TDD RED catalog/seed/intent/UI: 3 focused suites failed with missing content-workflow allowlist, unsupported nested seed, absent chooser, and absent intent module'
  - 'TDD RED OAuth auth UI: 3 focused tests failed before chooser, session issue, consume, and body continuity existed'
  - 'TDD RED locale parity: 2 focused tests failed before the ten new strings existed in all sixteen bundles'
  - 'TDD RED design rhythm: design.guard rejected new 10px and 2px geometry before correction to the existing 8px and 4px scale'
  - 'CORRECTION TDD RED: rendered RegisterAfter integration failed because it did not load the owned chooser or intent modules; the previous source-grep test was removed'
  - 'CORRECTION STRICTMODE GREEN: real RegisterAfter in React.StrictMode captured content-workflow, removed session state after capture, submitted it, and retained the provider-only URL; stale and extended payloads submitted blank and were consumed'
  - 'CORRECTION 2 TDD RED: rendered LOCAL and OAuth RegisterAfter tests failed six cases because Company remained required and the optional workspace control did not exist'
  - 'CORRECTION 2 RESOLVER RED: real CreateOrgUserDto blocked untouched provider workspace values before setValueAs normalized blank and whitespace to undefined'
  - 'CORRECTION 2 GREEN: real LOCAL and OAuth forms omit blank workspaceName and company, trim and forward both names when nonblank, and retain selected content-workflow plus StrictMode single-use intent behavior'
  - 'FOCUSED GREEN: pnpm exec jest --runInBand tests/registration*.test.cjs tests/public-saas*.test.cjs tests/starter-template*.test.cjs tests/global.validation-pipe.test.cjs tests/newsletter.subscription.test.cjs passed 13 suites and 182 tests on Node 22.23.2'
  - 'AUTH AND UI GREEN: pnpm exec jest --runInBand tests/auth-conversion.frontend.test.cjs tests/newsletter.consent.frontend.test.cjs tests/credential.fields.test.cjs tests/telegram.auth.flow.test.cjs tests/design.guard.test.cjs tests/design.contrast.test.cjs tests/foundation.test.cjs tests/shared-form-control.contract.test.cjs passed 8 suites and 100 tests'
  - 'TYPECHECK: frontend and backend TypeScript noEmit checks passed on Node 22.23.2'
  - 'DIFF: git diff --check passed; schema and migrations have no diff'
changed_files:
  - apps/frontend/src/components/auth/register.tsx
  - apps/frontend/src/components/public-saas/email-first-signup.tsx
  - apps/frontend/src/components/public-saas/public-copy.ts
  - apps/frontend/src/components/public-saas/registration-intent.ts
  - apps/frontend/src/components/public-saas/starter-template-chooser.tsx
  - libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/dtos/auth/starter-template.ts
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
  - tests/public-saas-registration.test.cjs
  - tests/auth-conversion.frontend.test.cjs
  - tests/global.validation-pipe.test.cjs
  - tests/newsletter.consent.frontend.test.cjs
  - tests/newsletter.subscription.test.cjs
  - tests/registration-template-auth-ui.test.cjs
  - tests/registration-template-locale.test.cjs
  - tests/registration.growth-event.test.cjs
  - tests/registration.workspace-contract.test.cjs
  - tests/starter-template-intent.test.cjs
  - tests/starter-template-ui.test.cjs
  - .codex/stages/content-factory-next-or3/artifacts/registration-template-implementation.md
explicit_defers:
  - parent stage owns integrated browser lifecycle proof and final broad acceptance
---

# Summary

Implemented the one real `content-workflow` starter template end to end while
retaining `blank`, legacy `company`, and optional `starterTemplate`. The public
email-first flow and standard auth form expose labelled native radio choices.
LOCAL registration submits the selected allowlisted ID. OAuth keeps only the
ID and issue time in expiring browser-session state, captures it through a
pure read, then removes it idempotently after mount. This survives React
StrictMode and falls back to `blank` for missing, stale, malformed, or extended
payloads.

Correction round 1 removed the duplicated chooser, catalog, and intent logic
from `register.tsx`. The DTO re-exports one pure starter-template catalog for
legacy callers, and both registration surfaces now use the same chooser and
session-intent implementations. The old source-grep auth test was replaced by
a rendered `RegisterAfter` POST and storage lifecycle proof.

Correction round 2 makes the standard `RegisterAfter` workspace field truly
optional for LOCAL and OAuth. Its label and HTML semantics are optional; blank
or whitespace input becomes `undefined` before DTO validation and both name
properties are omitted from the request. A nonblank value is trimmed and sent
as both `workspaceName` and legacy `company`, preserving old server consumers
while keeping the repository's neutral `Workspace` fallback.

The organization repository adds Plan (`#7FB03A`), Draft (`#4D7CFE`), Review
(`#F59E0B`), and Schedule (`#8B5CF6`) through the existing nested Prisma
organization create. Account, membership, identity, AI setting, consent, and
the four tenant Tags therefore share one atomic statement. No schema model,
migration, raw SQL, or asynchronous workflow was added.

# Scope / Routing

All writes are inside the assigned zone in `/tmp/cf-vme2`. Graphify was used
for initial orientation, then exact repository files and the accepted map were
read. Impeccable enforced the existing component system and design guards.
Lazyweb did not trigger new external work; the stage's already accepted
email-first and explicit-label evidence was reused from the private result at
`https://www.lazyweb.com/agentic-search/0c060989-5b0f-4acd-ab6f-4ab09e951a68`.

# Verification

The artifact header records every focused RED and final GREEN command. The
final selected acceptance is 182 registration/public/template tests, 100
auth/design compatibility tests, both frontend and backend TypeScript checks,
and `git diff --check`. Schema and migration paths have no diff.

# Delivery / Cleanup

Returned to the root orchestrator for manual integration acceptance. No commit,
push, PR, deploy, database mutation, live account, paid request, credential,
or real-user action was performed. No disposable runtime remained to clean.

# Risks / Follow-ups / Explicit Defers

The parent stage still owns the integrated real-browser lifecycle and final
broad acceptance. The focused implementation proves the session contract,
rendered chooser, payload, atomic nested seed, rollback, duplicate-identity
boundary, locale parity, and compatibility without claiming that broader gate.
