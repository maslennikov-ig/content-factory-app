# Global runtime tools — dbxe.34

Owner selected this bounded stage on 11 October 2026. Original Beads criteria
are preserved in `baseline-task-contracts.actual.json`; the epic remains open.

## Outcome and scope

Inventory the serving image's global npm, pnpm and PM2 graph. Resolve applicable
Critical/High advisories with the smallest compatible change. Keep three native
application roles, operator diagnostics and the guarded Prisma schema procedure
working. No product dependency rewrite, Temporal contract change, provider call,
backup restoration, supervisor abstraction or automatic next stage.

## Execution

1. Capture exact global package paths/versions and runtime/operator consumers.
2. Check primary advisories and patched ranges; bind applicability to callers and
   input trust. A specialist may research advisory metadata in an isolated zone
   while root maps consumers and owns all implementation and acceptance.
3. Implement minimal pinned updates or remove a runtime tool only after proving
   its consumers are absent or preserved through the existing direct native CLI.
4. Verify the changed global graph, PM2 startup/restart/CLI, native Prisma CLI and
   schema guard on owned disposable resources. Keep justified exceptions visible.
5. If runtime changes, run configured exact-source release gates, publish the
   public tree/image and switch only Content Factory under existing authority,
   with fresh capacity, schema/data checks, rollback and live health/source proof.
6. Record outcome, Beads, handoff, graph/docs review and safe cleanup; stop for
   the owner's next stage choice. Close .8 only if all its original criteria and
   additional image findings are genuinely resolved.

## Risk and verification

Settled implementation: keep builder Node22.23.2/pnpm10.6.1 and the frozen
product graph. Keep runtime PM2 7.0.3, replace only its direct js-yaml pin with
4.3.2, and remove npm, unused Corepack and base-image Yarn tools and the install
cache from the final stage. Runtime pnpm is no longer installed. Preserve bootstrap/update by
invoking the installed Prisma6.5 CLI directly, as existing preflight already
does. No global-tool installation or dependency download is a supported runtime
operation.

Native fixture exposed a preexisting missing schema engine in serving755d:
Prisma's direct bootstrap CLI exits1, just as the old `pnpm exec` wrapper does,
because dependency postinstall scripts were skipped. Preserve CLI functionality
by explicitly running the existing Prisma6.5 engine postinstall in the builder
and requiring the already verified schema-engine SHA256 used by release preflight.
This changes no Prisma version, schema, guard, database or Temporal contract.

Premortem verdict: GO WITH CONDITIONS. The blast radius is the final-image global
tools, PM2 supervision/diagnostics and documented Prisma operator commands. A
missing PM2 runtime dependency or a hidden package-manager invocation is a
plausible startup/operator regression: block delivery until native startup,
restart, CLI and actual printed Prisma SQL checks pass. A package manager
silently selecting the repository's older version is confirmed for upgrade
options and avoided by removing the runtime wrapper. Executor error (misstating
base image IDs, copying private history, or accepting stale receipts) is held by
exact source/config/archive comparisons and existing release gates. Production
uses the verified serving755d image as rollback; on failed health/native/source
checks, run the existing switch helper back to755d. No schema/data changes are
planned, so rollback needs no data restoration. Fresh schema/Mastra checks and
capacity are mandatory before the switch.

- Global package installs are outside the application lockfile: retain before
  and after inventories and official advisory coverage, not just an install log.
- A newer pnpm can select the repository's old package-manager version. Check
  the actual executed CLI, rather than assuming the installed global pin wins.
- PM2 PID1, diagnostics and its process wrapper are current contracts. Preserve
  them and disabled agent/automation settings; use native controlled fixtures.
- Schema CLI changes must still print real Prisma diff output through the
  unchanged SQL guard. Never run production `prisma db push`.
- Do not claim general dependency safety from unexposed features. Retain exact
  exceptions, evidence and reevaluation triggers.
- Full tests are required once for the changed release, not for each research
  step. No production deployment is required for a documentation-only result.
