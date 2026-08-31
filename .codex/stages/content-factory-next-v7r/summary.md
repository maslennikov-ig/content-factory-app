# Stage Summary: Content Factory Next Foundation

## Baseline repair

Postiz `v2.22.1` could build but its root Jest configuration imported `@nx/jest`, which is absent from the manifest, lockfile, and workspace. The fork replaces that stale entrypoint with a local Jest configuration and non-empty toolchain/workspace checks. The repair is tracked as `content-factory-next-v7r.1`.

The inherited frontend also fetched Plus Jakarta Sans from Google during every production build. After the CDN returned `404` for generated font URLs, the exact OFL-licensed variable font files were pinned, checksummed, and moved behind one shared `next/font/local` definition.

## Goal

Create a separate, reproducible Content Factory Next foundation from the exact Postiz version already evaluated while keeping the existing Content Factory intact.

## Accepted Boundary

- Exact Postiz source and upstream provenance.
- Dedicated product branch and isolated Node/pnpm runtime.
- Compact project/orchestration contract.
- License-aware migration plan and named first vertical slice.
- No Content Factory implementation import, provider wiring, publishing, or deployment.

## Current Evidence

- Base tag: `v2.22.1`.
- Base commit: `c90b6c625bc0ec470d6dcdb57c63608aaa9b7b74`.
- Branch: `codex/content-factory-foundation`.
- Beads goal: `content-factory-next-v7r`.
- Frozen install: `pnpm install --frozen-lockfile` passed with pnpm `10.6.1` on Node `22.23.2`; NVM, `engines`, and Volta now agree on the same major runtime.
- Foundation tests: Jest passed 5/5 checks, including the self-hosted-font build invariant; the Python process regression also passes and prevents binary assets from being scanned as text debt markers.
- Product build: `pnpm run build` passed for frontend, backend, and orchestrator.
- Process contract: `scripts/orchestration/run_process_verification.sh --stage content-factory-next-v7r` passed.
- Donor repository: `/home/me/code/content-factory` remains clean on `main`.

## Remaining Acceptance

Foundation acceptance is complete. The user-owned AGPL/commercial-license decision remains the gate for the next product slice and is not treated as a failure of this stage.

docs-reviewed: updated - added the product index, handoff, foundation plan, license gate, test-baseline repair, and reproducible verification commands.

graph-reviewed: no-change-needed - Graphify is optional and not enabled in this new repository; this stage changes only repository foundation, tests, and durable planning, not product architecture code.

documentation-decision: first-party fallback - the test repair follows repository truth; for the Next.js 16.2.6 font behavior, `docs-resolve` was unavailable, so the official Next.js font API and official Google Fonts source/license were used.
