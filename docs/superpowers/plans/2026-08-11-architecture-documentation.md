# Architecture Documentation Baseline Plan

**Goal:** Make the exact Postiz-based product understandable and safely changeable from repository documentation alone: where each subsystem lives, what it owns, what it depends on, how data and publishing flow, and where Content Factory capabilities will enter later.

**Approach:** Build a local code graph and combine focused graph queries with source, schema, route, workflow, configuration, and package evidence. Separate current-state documentation from target-state and migration documentation. Add an automated integrity check so navigation and repository source links cannot silently rot.

**Non-goals:** This stage does not copy Content Factory implementation code, decide the commercial/AGPL path, redesign the UI, change product behavior or persistence, connect providers, publish, deploy, or create a remote repository.

## Documentation set

- `docs/README.md` — stable documentation home and reading routes.
- `docs/product/` — current capabilities, target product boundary, and migration map.
- `docs/architecture/` — repository, runtime, modules, data, content lifecycle, providers, workflows, frontend, backend, and tenancy.
- `docs/development/` — setup, verification, and safe change guide.
- `docs/operations/` — configuration, local runtime, and deployment topology.
- `docs/adr/` — durable decisions and their consequences.
- `docs/maintenance/` — documentation ownership and freshness rules.
- `docs/glossary.md` — shared product and engineering vocabulary.

## Scope ledger

- Stable docs navigation -> documentation index and integrity checker.
- Current architecture and dependencies -> source-backed architecture set plus Graphify queries.
- Runtime, data, publishing, provider, and workflow flows -> focused flow documents with code entrypoints.
- Development and operations -> setup, verification, configuration, and runtime documents.
- Target Content Factory ownership and migration seams -> target architecture and capability migration map.
- Durable maintenance -> ADR convention, documentation contract, Beads/handoff/project-index integration.
- No implementation import -> stage invariant and AGPL gate.

### Task 1: Repository-native architecture documentation baseline

**Files:** `.graphifyignore`, `.codex/hooks.json`, `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/project-index.md`, `docs/**`, a documentation-integrity checker and its focused tests.

**Boundary:** One root-owned documentation and tooling stream. Rollback is reverting this stage commit; product code and data are unchanged.

**Interfaces:** Consumes exact repository source, Prisma schema, application routes, provider implementations, Temporal workflows, Docker/config manifests, and donor capability names. Produces stable Markdown navigation, evidence links, diagrams, ADRs, a local code graph, and a deterministic integrity check.

**Verification lane:** tdd-required — the documentation checker adds observable validation behavior for broken navigation and stale repository links; the Markdown content itself is verified against code evidence and focused graph queries.

- [x] Establish the local Graphify configuration and build a code-only graph without external model/API calls.
- [x] Map current modules, dependencies, runtime, data, provider, workflow, security, and content flows from source evidence.
- [x] Write the current-state, target-state, migration, development, operations, ADR, glossary, and maintenance documents.
- [x] Prove the documentation checker fails for broken links and passes for the accepted corpus.
- [x] Run one final documentation/process acceptance and record graph/docs review evidence.
