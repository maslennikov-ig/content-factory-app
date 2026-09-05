# Content Factory Agent Contract

## Three addresses, and which is which

Since 31.08.2026 this product has three GitHub-shaped names that differ by one
word. Read this before touching a remote, a release script or a deploy step.

| address | what it is | what goes there |
| --- | --- | --- |
| `maslennikov-ig/content-factory-next` (private) | this working repository, the whole history, `origin` of this checkout | every ordinary commit and push |
| `maslennikov-ig/content-factory-app` (public) | the published tree, one commit deep, no history | only `scripts/operations/prepare-public-tree.sh --update` plus a commit and push in that clone |
| `ghcr.io/maslennikov-ig/content-factory-next` | the image registry the production host pulls from | release images, under the **old** name |

Three rules follow, and each of them has cost something already:

- **Never add the public remote to this checkout.** `git push` sends commits,
  and commit `575404c7` carries screenshots with the owner's personal address.
  The public repository holds a copied tree for exactly that reason. The
  separation is the safeguard: publishing history has to be a deliberate act,
  not a mistyped remote.
- **Never rename the image package to match the public repository.** The
  registry path is hardcoded in `scripts/release/push-image.sh` and
  `pull-image-on-host.sh`, and the production host's `CF_IMAGE` points at
  `content-factory-next`. Renaming it breaks the deploy and the rollback target
  in the same move. The name is a fossil of where the package was created, not
  a claim about where the source lives.
- **Work happens here, never in the public clone.** `/home/me/code/content-factory-app`
  is an output directory. An edit made there is lost at the next refresh, which
  copies over it with `--delete`. The one thing that does happen there is the
  release build: since 31.08.2026 the image is built from the published tree, so
  it cannot contain a file Git does not track. The suite still runs here — the
  two trees differ only by stage evidence, which no test reads. Order and
  reasoning: `docs/operations/production-deploy.md`, «Обновление версии».

`tests/repository-addresses.test.cjs` holds all three, so this is a fact the
suite checks rather than something to remember.

## Product

- This repository is the new Content Factory product, based on Postiz `v2.22.1` at commit `c90b6c625bc0ec470d6dcdb57c63608aaa9b7b74`.
- There is one remote, `origin`. The `upstream` remote to `gitroomhq/postiz-app` was removed on 2026-08-22 by owner decision: all work happens in this repository and no upstream merges are planned. It also stopped `gh` from resolving commands against the donor repository. Licence attribution in `README.md`, `LICENSE` and `SECURITY.md` is unaffected and stays — AGPL requires it and `scripts/branding/brand-scan.cjs` guards it.
- The existing `/home/me/code/content-factory` repository is a read-only donor unless a task explicitly assigns writes there.
- Postiz and Content Factory are AGPL-3.0. ADR-0005 records the open-source product decision. Before copying donor code, verify ownership, third-party license provenance, AGPL compatibility, and public safety; any integrated implementation must be releasable under AGPL.
- Communicate with the user in Russian unless they ask for another language.

## Development

- Use Node `22.23.2` through `.nvmrc` and pnpm `10.6.1`. Use pnpm only.
- Follow the existing monorepo boundaries: `apps/frontend`, `apps/backend`, `apps/orchestrator`, and shared `libraries/`.
- Backend flow is DTO -> Controller -> Service or Manager -> Repository. Use Prisma; do not add raw SQL.
- Frontend data fetching uses SWR through the existing `useFetch` helpers. Reuse the existing design system before adding UI primitives.
- `PRODUCT.md`, `DESIGN.md`, ADR-0006, ADR-0008, and `docs/design/content-factory-interface-specification.md` are the durable brand and product-UI contract. Preserve Postiz attribution and compatible internal identifiers while replacing user-facing branding.
- Before writing an interface component, read `docs/design/component-inventory.md`: it answers "does this already exist", and a component missing from it is rewritten from scratch within a month — the file itself exists because that happened. Adding one means adding its row in the same commit. Before writing or changing one, read `docs/design/component-authoring-rules.md`. Its rules are enforced by `tests/design.guard.test.cjs`, `tests/design.contrast.test.cjs` and `tests/foundation.test.cjs`: `cf` tokens only, no hex literals in JSX, monospace for `label-sm` and `caption`, full state coverage, contrast in both themes.
- Never mutate an existing Temporal workflow or activity contract used upstream. Add a versioned workflow/activity and migrate callers.
- Keep provider-specific behavior inside provider implementations rather than generic services.

## Orchestration

- Beads (`bd`) is the only durable task and status truth. Do not create `tasks.json` or a parallel Markdown task ledger.
- Current operational state lives in `.codex/handoff.md`; stable navigation lives in `.codex/project-index.md`; stage artifacts live in `.codex/stages/`.
- Graphify is enabled as a local code graph: read `graphify-out/GRAPH_REPORT.md` and use focused `graphify query`, `path`, or `explain` before broad architecture or impact searches. The graph answers code-structure questions; read documents for their content. Never paste `graphify-out/graph.json` into chat context.
- A missing local graph is not permission to hand-search. Use a suitable sibling or owner graph explicitly with `--graph <path>`, say whose graph you used, and treat it as read-only orientation. It may describe another branch or worktree, so confirm the exact file in the current tree before relying on it.
- The project-local Codex `PreToolUse` hook may run `graphify hook-check`. Do not install Graphify git hooks, enable query logging, or use external semantic/model/API backends without explicit authority. Record `graph-reviewed` during closeout and refresh only at an accepted relevant integration or release boundary.
- Simple and ordinary medium work stays root-owned. Use `orchestrator-stage` for complex cross-boundary work only when orchestration materially helps.
- Complex delegation requires a visible spawned agent and a concrete latency, context, specialist, or write-isolation benefit. Use `.codex/subagent-spawn-template.md` with Documentation, Asset Routing, bounded ownership, verification, and completion-event fields; this rule does not itself authorize delegation.
- After accepting a child stream, immediately record delivery, acceptance, and safe-only cleanup in its central artifact. Broad review, E2E, and smoke checks remain risk-triggered.
- Apply brainstorming before new product behavior, durable plans for multi-step work, TDD for observable behavior, systematic debugging for failures, and verification before completion claims.
- No silent technical debt. Fix in-scope issues or record a bounded defer in Beads and handoff. Do not introduce untracked `TODO/FIXME/HACK/XXX` markers.

## Safety And Delivery

- No live publishing, real social-account connection, production deployment, paid model call, credential wiring, or real-user messaging without explicit current user authority.
- One standing exception, granted by the owner on 03.09.2026 and scoped in `docs/operations/production-deploy.md`, section «После переключения: удержать на хосте только нужное»: `scripts/release/retain-host-artifacts.sh` may remove our own release tags beyond the two it keeps, and the configuration copies our own releases left behind beyond the three it keeps per file, on the deployment host, after the release checks pass. It covers nothing else on that shared host — not other images, volumes or containers, not the live `.env`, `app.env` or `docker-compose.yaml`, and not a hand-run `docker rmi` or `rm` outside the script. `tests/host-artifact-retention.guard.test.cjs` holds the rails.
- Keep secrets, tokens, private client material, and live account identifiers out of Git.
- Never run `prisma db push` against the deployed database: Mastra owns tables in the same schema and push drops the ones `schema.prisma` does not describe. Production schema changes go through `docs/operations/production-deploy.md`, section «Применение Prisma-схемы», gated by `scripts/operations/validate-prisma-migration-sql.cjs`. Changing that guard or that procedure requires `tests/prisma-schema-apply-guard.execution.test.cjs` and `tests/prisma-schema-apply-guard.migrate-diff.test.cjs`; the second one runs real `prisma migrate diff` output through the guard, so a fixture cannot drift away from what Prisma prints.
- Preserve AGPL notices and replace Postiz names, logos, and product assets only in an explicit rebranding stage.
- Pushing, creating a remote repository, opening a pull request, or deploying requires an explicit delivery step and the repository safety checks.

## Verification

- Focused work uses exact affected checks. Release acceptance uses `pnpm run build`, `pnpm test`, `git diff --check`, and `scripts/orchestration/run_process_verification.sh`.
- `pnpm test` is three runs in sequence — jest, then `node --test`, then python `unittest`. A green jest summary says nothing about the other two; read all three. Between 25.08.2026 and 30.08.2026 fourteen tests in the second run were red and five releases shipped anyway.
- Publishing an image now proves it rather than asking: `scripts/release/record-suite-receipt.sh` runs the suite and records the commit it covered, and `push-image.sh` refuses without a receipt for `HEAD`. GitHub Actions has not started a job since 25.08.2026 (private-repo spending limit); the owner decided on 31.08.2026 not to restore payment but to move to a public repository, so until that move no release step may depend on CI and the receipt is the only gate.
- `.github/workflows/build.yml` gained a `full-suite` job that runs the whole `pnpm test` and then reads its log through `scripts/ci/assert-suite-halves.cjs`, which refuses unless all three halves reported. It is inert until the move — the point is that a job whose exit status is green while a half never ran is the same blindness in a new place.
- A test must not depend on today. `pnpm run test:time-travel 400` runs the jest half again with the calendar moved forward, and CI runs it on every push; a failure there is a test that ages, not a broken feature. It exists because five backup tests went red at 12:00 UTC on 31.08.2026 on untouched code — a pinned artifact name judged against the real clock — and the same shape had already appeared on 21.08.2026. Only "what is the date" moves: an explicit moment and real timers are left alone, and the filesystem cannot move at all, so a test that ages a file measures against the filesystem rather than the process clock. `tests/time-travel-check.test.cjs` holds the shift's behaviour and its wiring.
- The shift stops at a `date` call inside a spawned shell script, so that edge is held by a rule instead: a script may stamp a name or a receipt with the real clock, but a moment it **compares** takes its base from a variable a caller can pin — `CF_BACKUP_NOW` in `scripts/operations/postgres-backup.sh`. `tests/shell-clock.guard.test.cjs` enforces both halves, and a variable in the offset does not make the base pinnable: `date -u -d "-${retention_days} days"` is the defect that started this and it fails the guard. A `date` wrapper faking the clock for child processes was the other option and was refused — it must decide per call whether a spec means "now" or a fixed instant, and a check that can be quietly wrong reads as coverage it does not give.
- An intermediate orchestration check may skip a rerun only through `scripts/orchestration/verification_evidence.py run`, which addresses its receipt (`verification-evidence/v2`, stored under `.codex/evidence/verification/`) by the SHA-256 of what the check depends on: the declared input files with content digests, the command, the working directory, tool versions such as node, and the digest of the script itself. No clock, branch, or commit name enters the hash. A missing, malformed, edited, or renamed receipt means the check runs again, and `ORCHESTRATION_EVIDENCE_REUSE_DISABLED=1` (off by default) only forces more work. It covers orchestration steps only and does not replace the release gate: `pnpm test` and `scripts/release/record-suite-receipt.sh` stay exactly as they are. `tests/test_verification_evidence.py` holds the rails.
- Product UI work routes to Impeccable for craft and Lazyweb for evidence or review flows; this does not authorize delegation or external writes.
