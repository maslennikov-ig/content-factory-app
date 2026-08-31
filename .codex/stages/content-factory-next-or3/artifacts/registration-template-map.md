---
schema_version: orchestration-artifact/v3
artifact_type: discovery-map
stage_manifest: .codex/stages/content-factory-next-or3/stage-manifest.json
stream_owner: subagent:registration-template-map
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: root contract synthesis for registration-template seeding
public_facade: allowlisted starterTemplate in public chooser and POST /auth/register
bounded_acceptance: one real template crosses LOCAL and OAuth registration into one nested tenant seed without URL leakage or a schema migration
non_goals:
  - multiple template catalog or user-defined template authoring
  - new Temporal workflow or activity contract
  - pricing, trial, live provider connection, deployment, or full SaaS lifecycle acceptance
evidence:
  - none
task_id: content-factory-next-or3.registration-template-map
epic_id: content-factory-next-or3
stage_id: content-factory-next-or3
session_id: content-factory-next-or3
milestone: public template choice with a one-time workspace seed
milestone_status: accepted
agent_type: explorer
subagent_model: gpt-5.6-terra
reasoning_effort: medium
model_reasoning_rationale: focused local contract, persistence and compatibility mapping
repo: content-factory-next
branch: codex/public-funnel
base_branch: codex/image-editor-integration
base_commit: 49631977d3c9a3ad24bf2aa5c443ff8f954bac4a
worktree: /tmp/cf-vme2
write_zone:
  - .codex/stages/content-factory-next-or3/artifacts/registration-template-map.md
success_criteria:
  - factual map distinguishes already working registration forwarding from the missing real choice and seed
  - one minimal real template and its existing-model records are specified without a migration
  - LOCAL and OAuth intent boundary, exactly-once behavior and focused red tests are explicit
selected_docs:
  - AGENTS.md
  - docs/product/cloud-saas-growth-spec.md
  - .codex/stages/content-factory-next-or3/stage-manifest.json
  - .codex/stage-artifact-template.md
selected_skills:
  - orchestrator-stage
selected_agents:
  - none
catalog_candidates:
  - existing Tags model plus public synthetic-demo workflow stages
parallel_group: registration-template-map
depends_on_streams:
  - none
parallel_decision: parallel read-only map with isolated artifact ownership
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: accepted read-only map; no runtime, child branch, external session, worktree, or temporary resource required cleanup
risk_level: high
risk_tags:
  - data
  - public-api
  - user-flow
  - state-transition
affected_surfaces:
  - api
  - backend
  - ui
  - user-flow
invariants:
  - compatibility
  - idempotency
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: current product specification already requires a real transactional idempotent starter template; this artifact fixes the implementation choice only
verification:
  - focused Graphify query mapped StarterTemplate, CreateOrgUserDto, OAuthService and auth-related graph nodes before file inspection
  - repository and Beads evidence separated completed contract forwarding from absent catalog and seed consumer
changed_files:
  - .codex/stages/content-factory-next-or3/artifacts/registration-template-map.md
explicit_defers:
  - full SaaS lifecycle/browser proof remains a parent-stage acceptance concern after the focused seed slice
---

# Summary

`content-factory-next-or3.2` and `.7` have a working *transport* contract but
no real starter-template feature yet. The only accepted value is `blank`, and
it is deliberately an idempotent no-op. Therefore the current `/demo` CTA is
not deceptive—it forwards `blank`—but it is not a public template choice and
cannot satisfy the two Beads acceptance criteria that require a real choice,
one application, and a visible effect in the new workspace.

Focused Graphify query: `Map registration template choice, starterTemplate,
workspace creation, LOCAL signup, OAuth signup, and organization seed flow`.
It identified `StarterTemplate` in the shared registration DTO, `OAuthService`,
the auth/organization area, and the existing registration tests. Exact local
files below were then checked; the graph was orientation only.

# Scope / Routing

Owned write zone is this artifact only. The proposed implementation boundary is
one public-choice/registration/repository/test slice: it extends the shared DTO
allowlist and public copy, carries a single non-sensitive intent through LOCAL
and OAuth, and nests four existing `Tags` records in the existing organization
create. It does not add a template API, migration, workflow, provider behavior,
or asynchronous seed consumer. The root owns contract selection, integration,
browser proof and final acceptance; this parallel map has no dependency on the
other two discovery streams.

## Current end-to-end path

| Segment | Current behavior | Status |
|---|---|---|
| Public entry | `/demo` renders `EmailFirstSignup` with `DEMO_STARTER_TEMPLATE`, which is hard-coded to `blank`. No component offers a catalog or records a visitor's choice. | Missing real choice |
| Email-first LOCAL | Email stays React state, never URL/storage; step two POSTs `workspaceName?`, compatibility `company?`, `starterTemplate?`, consent, and LOCAL credentials to `/auth/register`. The boundary drops any value other than `blank`. | Transport complete; choice limited to no-op |
| Standard LOCAL / OAuth registration | `RegisterAfter` uses `CreateOrgUserDto` and posts its form to `/auth/register`. Its input type and rendered form have only legacy `company`, not `workspaceName` or `starterTemplate`; provider redirects start from `/auth/oauth/:provider`, so a public intent is not retained across OAuth. | Existing compatibility path works; template intent missing |
| Server LOCAL | `AuthService.routeAuth` forwards the validated DTO plus resolved newsletter consent to `OrganizationService.createOrgAndUser`. | Complete forwarding |
| Server provider/OAuth | `loginOrRegisterProvider` verifies provider identity, creates only new accounts, and forwards `company`, `workspaceName`, and `starterTemplate` to the same organization service. Returning accounts do not create or seed again. | Complete forwarding for a body that contains the intent |
| Persistence | `OrganizationRepository.createOrgAndUser` resolves name as `workspaceName → company → Workspace`, then permits only `blank`. Its nested Prisma `organization.create` creates organization, included AI setting, membership, user, identity and consent in one statement; analytics happens afterwards. It creates no template records and does not use `PrismaTransaction`. | One account-create statement exists; transactional seed and idempotency record are missing |

## Contracts and compatibility that must remain true

- Shared DTO: `STARTER_TEMPLATES = ['blank']`; `starterTemplate` is optional
  and allowlisted. Unknown values are rejected by validation before the
  repository. The real catalog must extend this single source of truth, not
  introduce a second frontend list.
- Existing callers may send only legacy `company`; a missing workspace name
  must still create `Workspace`, and `workspaceName` continues to win when both
  fields are present. Email must never become the workspace name.
- LOCAL retains the 12–64 character password rule. Provider registration uses
  the verified provider identity/email rather than submitted email, and only
  first provider registration reaches `createOrgAndUser`.
- Approval, activation, newsletter-consent and trusted registration-event
  order are separate existing behavior. Seed failure must not be silently
  swallowed after a user-visible successful registration, and analytics must
  remain outside the required account-plus-seed atomic unit.
- No existing Temporal workflow/activity should be changed. This seed belongs
  to registration persistence, not a post-registration asynchronous activity:
  the product contract requires the chosen template to be present exactly once
  when the workspace is returned.
- Schema has viable tenant-owned records (`Organization.post`, `Sets`, `Tags`),
  but no `StarterTemplate`, marker, catalog table, or seed service. The
  smallest accepted seed can use the existing `Organization.tags` relation,
  nested in the current single Prisma organization create; it needs neither a
  new table nor `PrismaTransaction` injection.

## Exact gaps

1. **Product catalog is absent, but its smallest in-scope first entry is now
   decided.** Keep `blank` as the safe default and add exactly one real ID:
   `content-workflow`. Its public label/description say that it starts a
   workspace with workflow labels. Its exact seed is four existing `Tags`
   rows, all nested under the new organization: `Plan` (`#7FB03A`), `Draft`
   (`#4D7CFE`), `Review` (`#F59E0B`), and `Schedule` (`#8B5CF6`). The four
   names are the existing synthetic-demo workflow (`plan → draft → review →
   schedule`); Tags are already tenant-owned, visible in the launch flow, and
   require no integration, AI, provider, or post. This is the minimal real
   content-workflow template, not a promise of a populated publishing calendar.
2. **Public selection UI is absent.** `/demo` has an interactive synthetic
   workflow but no template chooser. It hard-codes `blank`; the email-first
   component accepts a prop rather than producing an accessible selected value.
   The required public choice therefore cannot currently be observed.
3. **OAuth intent continuity is absent.** Direct OAuth starts before any
   registration body exists. The callback obtains a short-lived provider token
   and `RegisterAfter` has no fields for `workspaceName` or `starterTemplate`.
   Passing arbitrary query parameters would violate the email/intention privacy
   direction and is not a supported durable contract. A browser-local,
   single-use, allowlisted registration intent (or an equivalently server-bound
   opaque state) must be designed with the auth state binding; do not invent it
   in the provider token.
4. **Seed consumer and atomic boundary are absent.** Add the four tags to the
   existing nested `organization.create` data only when
   `starterTemplate === 'content-workflow'`. That one Prisma nested write
   already creates the organization, AI setting, membership, user and identity
   together; a seed failure rolls the whole statement back. No marker or new
   migration is needed: one organization creation has one nested tag set;
   subsequent LOCAL attempts stop at the existing email check and returning
   providers stop at the existing provider-user lookup. A concurrent identity
   uniqueness conflict rolls the nested write back rather than making a second
   workspace. This design must be proven with a failure fixture and duplicate
   registration tests rather than inferred from a marker.
5. **Proof stops at forwarding.** Present tests prove DTO allowlisting,
   workspace-name fallback, LOCAL email-memory submission, provider forwarding,
   approval/activation handoff, and server registration events. They neither
   prove a non-blank public selection nor a persisted seed, one-time retry, or
   OAuth round trip preserving selected intent. There is no browser test for
   an actual template choice.

## Smallest TDD implementation boundary

Do this as one focused cross-boundary slice using the decided
`content-workflow` template and four tag records:

1. Add a single shared catalog module (IDs, public copy keys, deterministic
   tag definition) and extend `STARTER_TEMPLATES` with `content-workflow`;
   keep `blank` default/no-op. No Prisma schema or migration change is in this
   slice.
2. Add one public accessible chooser before sign-up. Feed its selected,
   allowlisted value into `EmailFirstSignup`; retain it in component state for
   LOCAL. For OAuth, write only this allowlisted ID to a namespaced,
   single-use `sessionStorage` registration-intent key immediately before the
   provider redirect, read it after the same-browser callback fills
   `RegisterAfter`, and remove it on final submit/cancel/expiry. It never
   contains email, provider credentials or workspace name and never enters a
   URL.
3. Centralize account-plus-template creation in the existing organization
   repository data builder. Both `routeAuth` branches already converge there,
   so no provider-specific seed code is needed. Nested `tags.create` runs only
   for the newly created organization; a retry cannot attach the four records
   to a second account for the same identity.
4. Keep post-create analytics and provider `postRegistration` outside this
   unit, as today. If the seed transaction fails, return registration failure
   and create neither account nor seed.

Suggested red tests, before code:

- DTO/catalog: accepts `blank` and `content-workflow`; rejects other values;
  missing `starterTemplate` retains blank workspace behavior.
- Repository: `content-workflow` creates exactly the four named tags in the
  same nested organization write; injected tag-create failure rolls back
  account/membership; repeated LOCAL/provider registration does not make a
  second organization or second tag quartet.
- Auth service: LOCAL and first provider registration both send the chosen ID
  to the same transaction; returning provider registration does not re-install.
- Public UI: a visitor selects the approved template, proceeds through
  email-first LOCAL registration, and the POST carries exactly that ID while
  email remains out of URL/storage. A browser scenario must cover keyboard
  selection and the created workspace's seeded first state.
- OAuth browser flow: `content-workflow` survives provider redirect/callback
  through completion without appearing in URL; a missing, malformed or expired
  session intent falls back to `blank` and is consumed after use.

Given a visitor selects `content-workflow`, when a new LOCAL or provider
identity finishes registration, then exactly one new organization contains the
four workflow tags; when the registration has already produced that
organization, then retry creates no second tag quartet; when the selected value
is missing, the new organization remains the current blank workspace.

# Verification

- `graphify query "Map registration template choice, starterTemplate, workspace creation, LOCAL signup, OAuth signup, and organization seed flow" --budget 1800` completed before manual inspection.
- `bd show content-factory-next-or3.2` and `.7` confirm both tasks remain open
  specifically for the real catalog/consumer and lifecycle proof.
- Read exact contracts and paths named in the summary; no code, schema,
  tests, credentials, remote state, live service, or donor repository changed.
- Artifact validation: run
  `python3 scripts/orchestration/validate_artifact.py .codex/stages/content-factory-next-or3/artifacts/registration-template-map.md` after this file is written.

# Delivery / Cleanup

Returned for root synthesis; not Git-merged and no implementation was made.
The only owned artifact is retained. No runtime, child branch, external session
or temporary resource was created, so safe-only cleanup is complete.

# Risks / Follow-ups

- **Auth-state risk:** preserve OAuth's existing browser binding and do not use
  query strings or a provider credential to carry registration intent. The
  chosen `sessionStorage` value is allowlisted and single-use, but needs expiry,
  cleanup, stale-value and tampering tests.
- **No-migration boundary:** do not change existing workflow contracts, add a
  template marker or run `prisma db push`. The first seed is exactly four
  existing `Tags` nested inside the already atomic organization create.
- **Acceptance scope:** template choice/seed is a focused slice. Full SaaS
  lifecycle, distributed abuse budget and deployment are not evidence that may
  be claimed by this work.
