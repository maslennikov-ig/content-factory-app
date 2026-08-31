# Content Factory Next Foundation Plan

**Goal:** Make Postiz `v2.22.1` the reproducible product foundation and define a safe path for moving the valuable Content Factory capabilities into it.

**Approach:** Postiz becomes the product shell and operational runtime. Content Factory remains the donor for content intelligence and governance. The migration starts with one visible draft-production slice and expands only after the data ownership and AGPL boundary are settled.

**Non-goals:** This stage does not copy Content Factory implementation code, rebrand the UI, connect real providers, publish content, call paid models, create a remote repository, deploy, or migrate production data.

## Product Boundary

Postiz owns:

- users, organizations, teams, and permissions;
- editor, drafts, media, calendar, integrations, scheduling, analytics;
- Prisma/Postgres operational data;
- Temporal workflows for durable scheduled work.

Content Factory contributes:

- Project Profile, brand kit, author voice, and channel policies;
- source intake, source memory, Entity Memory, and Content Radar;
- brief and draft generation through a controlled model gateway;
- naturalness, voice, fact, translation, media, and policy audits;
- approvals, autonomy limits, cost budgets, release gates, and audit receipts.

Git remains the source for code, schema, migrations, durable decisions, and public-safe export fixtures. Postgres becomes the source for interactive product state after each accepted migration. Content exports must remain deterministic and auditable.

## Licensing Decision Gate

Postiz is AGPL-3.0. A modified version used through a network must offer its corresponding source to those users. Before any Content Factory implementation is copied, choose one path:

1. **Open AGPL product:** place the Content Factory engine inside the monorepo and publish the corresponding source under compatible terms.
2. **Commercial Postiz license:** obtain a written license that permits the intended closed or white-label distribution, then record its boundaries.
3. **Independent implementation:** use Postiz only as product research and rebuild the required shell under our own licensing model.

Keeping code in a separate service is not treated as an automatic AGPL escape; that conclusion requires legal review. This plan is an engineering boundary, not legal advice.

## First Vertical Slice

`Project Profile -> assisted Draft in the Postiz composer -> voice/naturalness review -> human-approved saved draft`

Observable outcome:

- an organization creates or selects a Project Profile;
- an editor opens the existing Postiz composer and requests a draft from an approved source packet;
- the Content Factory engine returns a structured draft plus voice and naturalness findings;
- the user edits or accepts it and saves a normal Postiz draft;
- scheduling and publishing remain manual and use Postiz's existing flow.

This slice proves the product thesis without first rebuilding Content Radar, full knowledge ingestion, autonomous pipelines, or analytics feedback.

## Scope Ledger

- Exact Postiz foundation and upstream provenance -> Task 1.
- Reproducible Node/pnpm dependency and build baseline -> Task 1.
- Explicit AGPL and branding boundary -> Task 1 / licensing gate.
- First visible migration slice -> Task 2 after the licensing gate.
- Existing Content Factory stays intact -> invariant across all tasks.

### Task 1: Reproducible Fork Foundation

**Files:** repository metadata, `.nvmrc`, `AGENTS.md`, `.codex/`, and this plan.

**Boundary:** repository setup and planning only; rollback is deleting or archiving this separate clone.

**Interfaces:** consumes Postiz tag `v2.22.1` and the Content Factory architecture map; produces a buildable local fork and migration contract.

**Verification lane:** foundation-smoke — no product behavior changes; verify exact provenance, frozen install, a non-empty root test entrypoint, deterministic local-font build, process contract, and clean donor repository. Postiz `v2.22.1` shipped a stale Nx-based Jest entrypoint without Nx dependencies or projects, so this stage replaces that entrypoint rather than reporting a false baseline pass.

- [x] Establish exact Postiz tag, commit, upstream, and product branch.
- [x] Install Node `22.23.2`, pnpm `10.6.1`, and frozen dependencies.
- [x] Run the selected baseline build, foundation tests, and process verification.
- [x] Record the license gate, first slice, and rollback boundary.

### Task 2: Project Profile To Reviewed Draft

**Files:** exact Prisma models, backend DTO/controller/service/repository, frontend composer components/hooks, and Content Factory adapter package will be selected after the license decision and a focused code map.

**Boundary:** one organization-scoped profile and one draft-generation/review path ending in an ordinary unscheduled Postiz draft.

**Interfaces:** consumes organization, project profile, source packet, and model-gateway request; produces a saved draft and metadata-only review result.

**Verification lane:** tdd-required — adds persistent organization-scoped behavior, model boundary, and user-visible editor flow.

- [ ] Prove organization isolation, exact profile/source binding, and no publish side effect with focused failing tests.
- [ ] Add the minimum persistence and API facade through existing Postiz layers.
- [ ] Add the composer entrypoint and review result using existing UI patterns.
- [ ] Run focused backend/frontend acceptance and one local browser flow.

## Technical Premortem

Verdict: **GO WITH CONDITIONS**.

- **License failure:** proprietary Content Factory code is copied into an AGPL network product before the licensing model is chosen. Detection: copied modules or imports appear while the gate is open. Mitigation: this stage imports no implementation code.
- **Upstream failure:** unpinned Postiz changes make the evaluated product irreproducible. Detection: base commit or lockfile drifts. Mitigation: pin `v2.22.1`, retain `upstream`, and merge upgrades explicitly.
- **Data failure:** Git-first artifacts and Postgres records become competing truths. Detection: the same profile/draft has divergent active versions. Mitigation: Postgres owns interactive state; Git receives deterministic exports and durable decisions only.
- **Workflow failure:** an existing Temporal contract is modified and breaks in-flight executions. Detection: edits to an existing workflow/activity signature. Mitigation: version successors and migrate callers.
- **Executor failure:** the migration becomes a broad rewrite before proving user value. Detection: multiple new subsystems without the reviewed-draft flow. Mitigation: the first vertical slice is the only initial product acceptance boundary.

Recovery: the new product is a separate clone. Before any data migration or live integration, rollback is to stop work on this branch and retain the original Content Factory and the running unmodified Postiz container unchanged.
