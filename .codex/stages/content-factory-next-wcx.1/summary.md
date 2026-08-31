# Stage Summary: Internal Namespace And Package Rename

Status: accepted locally; the third documentation commit is the remaining Git
write, with no push, merge or deployment authorized.

## Scope

- Replace the legacy upstream import namespace with `@contentfactory/*` by a
  scripted sweep.
- Rename every workspace package that still uses the upstream brand and
  regenerate the pnpm lockfile.
- Record the 2026-08-14 owner decision in ADR-0006 and update affected
  documentation.
- Preserve AGPL attribution and compatibility-sensitive identifiers owned by
  separate tasks.

## Documentation Decision

`docs-reviewed: updated - no external/versioned boundary; ADR-0006, the
interface specification, architecture overview, SDK README, durable historical
records, project index and handoff now describe the migrated repository-owned
namespace/package names and the preserved runtime compatibility boundary.`

## Graph

`graph-reviewed: updated - Graphify 0.9.14 was refreshed locally at the accepted
integration boundary without external/model extraction; ignored graph outputs
are refreshed once more from the final third-commit HEAD.`

## Commit 1 — Import Namespace

- Commit: `2d94c22fbcd22416ae55d03357f2ea77b0556010`.
- Exact scripted sweep: [evidence/commit-1/sweep-command.txt](evidence/commit-1/sweep-command.txt).
- Sweep scope: 527 files and 2,637 matching lines. The complete commit contains
  532 changed files because it also establishes the stage/scope records and
  updates the obsolete branding assertion.
- Branding-test change: the match-dependent assertion for an alias that should
  disappear was replaced by direct README upstream/AGPL and LICENSE
  preservation assertions. Temporary violations prove the scanner still covers
  the orchestrator and chat surfaces.
- Verbatim successful command output (exit 0):
  [build](evidence/commit-1/pnpm-run-build.log),
  [full test](evidence/commit-1/pnpm-test.log),
  [brand scan](evidence/commit-1/brand-scan.log), and
  [process verification](evidence/commit-1/process-verification.log).

## Commit 2 — Workspace Package Names

- Commit: `211bb5cef9d77fe21d2ca188179cd179ce6f337b`.
- Exact scripted sweep: [evidence/commit-2/sweep-command.txt](evidence/commit-2/sweep-command.txt).
- Changed files: 7 package manifests.
- Exact lockfile regeneration command:
  [evidence/commit-2/lockfile-regeneration-command.txt](evidence/commit-2/lockfile-regeneration-command.txt).
  pnpm reported all seven workspace projects, but lockfile v9 does not serialize
  workspace package names, so the regeneration was intentionally a no-op. The
  SHA-256 before and after is
  `b49efedc6326ced26b6d656ad153d6dce24ee5467913f0bf9190c9ba2eba78bf`;
  see [regeneration output](evidence/commit-2/lockfile-regeneration.log),
  [before hash](evidence/commit-2/lockfile-before.sha256), and
  [after hash](evidence/commit-2/lockfile-after.sha256).
- Verbatim successful command output (exit 0):
  [build](evidence/commit-2/pnpm-run-build.log),
  [full test](evidence/commit-2/pnpm-test.log),
  [brand scan](evidence/commit-2/brand-scan.log), and
  [process verification](evidence/commit-2/process-verification.log).

## Commit 3 — Decision Record And Documentation

- Exact scripted sweep:
  [evidence/commit-3/sweep-command.txt](evidence/commit-3/sweep-command.txt).
- Scripted sweep scope: 13 documentation files. Focused manual edits clarify
  the ADR boundary, remove the obsolete contact, update durable navigation and
  normalize accepted historical records without changing their evidence.
- Complete commit scope: 46 files, including the durable review, prior and
  current verbatim acceptance logs, process metadata, documentation and guard
  wording.
- The exact evidence-log paths unset Git's whitespace-error attribute so the
  terminal bytes, including Jest coverage-table padding, stay verbatim while
  whitespace checks remain active for source, configuration and documentation.
- The commit hash will be reported from Git after this self-containing commit;
  a commit cannot embed its own hash.
- Verbatim successful outputs (exit 0) are stored as
  [build](evidence/commit-3/pnpm-run-build.log),
  [full test](evidence/commit-3/pnpm-test.log),
  [brand scan](evidence/commit-3/brand-scan.log), and
  [process verification](evidence/commit-3/process-verification.log).
- The root-owned release closeout additionally passed documentation links and
  `git diff --check`; its complete terminal stream is preserved in
  [stage-closeout.log](evidence/commit-3/stage-closeout.log).

## Preserved Boundaries

README lines 5, 56 and 58, LICENSE, copyright notices, Mastra agent/store ids,
`featured_by_gitroom`, the generated upstream-domain organization address,
Tumblr user agent, `POSTIZ_*`, the legacy deep-link scheme, the i18n branch and
epic `content-factory-next-we2` remain outside this migration. No push, merge,
deploy, live publishing, account connection, paid call or user messaging is
part of the stage.
