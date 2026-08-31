# Stage Summary: Architecture Documentation Baseline

## Goal

Create a repository-native documentation system that explains the exact Postiz foundation, its dependencies and runtime flows, and the intended Content Factory migration seams before implementation begins.

## Accepted Boundary

- Current Postiz architecture and ownership map derived from repository evidence.
- Stable documentation navigation, glossary, ADRs, and maintenance contract.
- Local Graphify code graph with ignored generated output and focused validation queries.
- Target Content Factory capability map and migration seams without implementation import.

## Current Evidence

- Base product commit: `9441349f224ea85b37d0534be05b804d64559eed`.
- Branch: `codex/architecture-documentation`.
- Beads goal and stage: `content-factory-next-6vk`.
- Graphify CLI: `0.9.14`, local extraction only; no semantic/model/API calls and no Graphify git hooks.
- Local graph: 5,977 nodes, 14,686 edges, 98% extracted / 2% inferred, zero token cost; volatile cluster count is intentionally not treated as an acceptance contract.
- Focused graph proof: `PostsService` is imported by `PostsController` and `PostActivity`; `PostsService -> PostActivity` resolves in two hops; `IntegrationManager` selects `SocialProvider` implementations.
- Documentation: stable `docs/README.md` plus product, architecture, development, operations, ADR, maintenance, and glossary sets.
- Integrity behavior: focused tests were observed RED before `scripts/docs/check_docs.py` existed and GREEN after implementation.
- Selected slice checks: `pnpm run docs:check` passed for 23 Markdown files; `pnpm test` passed 5 Jest tests and 4 Python tests; `git diff --check` passed.

## Acceptance Review

- AC-1 documentation navigation and source links: covered by `docs/README.md` and the link checker.
- AC-1 module, runtime, data, publishing, provider, Temporal, auth, development, and operations maps: covered by `docs/architecture`, `docs/development`, and `docs/operations`.
- AC-1 target ownership and migration seams: covered by `docs/product` and ADRs; no donor implementation was copied.
- AC-1 Graphify setup: `.graphifyignore`, ignored `graphify-out/`, local graph build, focused queries, and disabled git hooks are recorded.
- Full product build/browser/provider checks are not selected: this stage changes documentation, local analysis configuration, and the documentation checker; it changes no product TypeScript, dependency, database, UI, provider, or deployment behavior.

docs-reviewed: updated - added and source-linked the complete current/target documentation baseline, migration map, ADRs, runbooks, glossary, and maintenance contract.

graph-reviewed: updated - rebuilt and queried the local no-API Graphify index; focused queries confirm the documented PostsService/PostActivity/IntegrationManager boundaries. Refresh again after the local stage commit so the ignored report records the accepted HEAD.

## Closeout

- Root-owned slice acceptance: passed; receipt is `acceptance-receipt.json`.
- Process verification: passed.
- Beads task: closed with the accepted boundary.
- Stage manifest: accepted.
- The ignored graph is refreshed once more after the local commit so `GRAPH_REPORT.md` records the accepted `HEAD`; this is a local delivery step, not a new acceptance run.
