# Content Factory Claude Contract

Read `AGENTS.md` first. It is the authoritative repository contract; this file only adds a compact Claude-compatible entrypoint.

## Product And Repository

- This is Content Factory, an AGPL-3.0 fork of Postiz `v2.22.1` at `c90b6c625bc0ec470d6dcdb57c63608aaa9b7b74`.
- `/home/me/code/content-factory` is a read-only donor unless a task explicitly grants writes there.
- Preserve upstream attribution and compatibility-sensitive internal identifiers. Product rebranding follows `PRODUCT.md`, `DESIGN.md`, ADR-0006, ADR-0008 (dark-first desert-lab system), and the interface specification.

## Runtime And Architecture

- Use Node `22.23.2` from `.nvmrc`, pnpm `10.6.1`, and the committed `pnpm-lock.yaml`. Do not use npm or yarn.
- Main boundaries are `apps/frontend`, `apps/backend`, `apps/orchestrator`, and shared `libraries/`.
- Backend flow is DTO -> Controller -> Service/Manager -> Repository with Prisma, never raw SQL.
- Frontend data fetching uses SWR through the existing `useFetch` helpers and reuses the design system.
- Read `docs/design/component-authoring-rules.md` before writing or changing an interface component. `cf` tokens only, no hex literals in JSX, monospace for `label-sm` and `caption`, full state coverage, contrast in both themes. `tests/design.guard.test.cjs`, `tests/design.contrast.test.cjs` and `tests/foundation.test.cjs` enforce it.
- Never mutate an upstream-used Temporal workflow or activity contract. Add a versioned successor and migrate callers.
- Keep provider-specific behavior inside provider implementations.

## Orchestration And Safety

- Beads is the only durable task/status history. Read `.codex/handoff.md` for current state and `.codex/project-index.md` for navigation.
- Graphify stays local and extraction-only. Use its report and focused queries; do not install Graphify Git hooks or enable external/API extraction.
- Resolve version-sensitive dependency behavior through `orch-prompts docs-resolve`; otherwise record why external documentation is unnecessary.
- Do not add credentials, connect real accounts, publish, deploy, make paid model calls, message users, push, or open a PR without explicit current authority.
- Run focused checks for the changed surface and `scripts/orchestration/run_process_verification.sh`; release checks remain those declared in `AGENTS.md`.

## Claude Runtime Prerequisite

Claude CLI is not a repository dependency and was not installed by orchestration setup. A Claude-based operator must install and configure it outside this repository before use; Codex can use the same repository contract without it.
