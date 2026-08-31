Target: ChatGPT with write access to `/home/me/code/content-factory-next`, on branch `codex/rename-namespace`, running unattended overnight.
Audience: Manual handoff — a person pastes this into a ChatGPT session; another agent reviews the result before merge.

Goal: Rename the internal namespace from the upstream brand to this product's own, without breaking anything. Import alias `@gitroom/*` becomes `@contentfactory/*`, and every workspace package name loses the upstream brand. The owner's priority for this run is that nothing breaks, not that it finishes fast.

Success criteria:
- `grep -rn "@gitroom" . --include=*.ts --include=*.tsx --include=*.json --include=*.md` returns nothing outside `node_modules` and `.next`.
- No workspace `package.json` carries `gitroom` or `postiz` in its `name`.
- `pnpm run build` exits 0, `pnpm test` is fully green, `node scripts/branding/brand-scan.cjs` reports `0 unexplained`, and `bash scripts/orchestration/run_process_verification.sh` passes — after each of the three commits, not only at the end.
- Three commits on `codex/rename-namespace`, in the order below.

Context:
- The alias is declared once, in `tsconfig.base.json:29-36`, as eight prefixes: `backend`, `frontend`, `helpers`, `nestjs-libraries`, `react`, `plugins`, `orchestrator`, `extension`. Everything else is usage.
- Footprint by prefix, in files: frontend 247, nestjs-libraries 244, react 211, helpers 176, backend 26, orchestrator 14, plugins 0. Roughly 2032 lines across 400 source files, plus about 19 files under `tests/` that mock modules by their alias string, plus `README.md`.
- Package names today: root `gitroom`; `postiz-backend`, `postiz-command`, `postiz-extension`, `postiz-frontend`, `postiz-orchestrator`; SDK `@postiz/node`. The owner decided on 2026-08-14 to rename all of them, the SDK included. Nothing imports `@postiz/node` — its name appears only in its own `apps/sdk/package.json:2`. No Dockerfile, compose file or workflow refers to any of these names.
- **`tests/branding.test.cjs:34` will fail when you succeed.** It asserts `rules.has('legacy-import-alias')` against rules that actually *matched*, so the moment the last `@gitroom/` disappears the assertion is false. That is the test becoming obsolete, not a regression: replace that one line with an assertion of what still matters — that the AGPL attribution in `README.md` and the `LICENSE` file are intact — and say so in your report. Leave the rule itself defined in `scripts/branding/brand-scan.cjs`; a rule that matches nothing costs nothing, and the same test still checks `legacy-env-key`, which another task owns.
- `docs/adr/0006-*` currently keeps compatible module specifiers on purpose. Amend it with the owner's decision and the date rather than deleting the reasoning.

Constraints:
- **Do the replacement with a scripted sweep, never by editing four hundred files by hand.** A hand edit at this scale introduces a typo that the build may not catch in a file no test imports.
- Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` only; never npm or yarn. Renaming workspace packages legitimately changes `pnpm-lock.yaml`; regenerate it with pnpm and commit the result.
- Do not touch `README.md:5`, `:56` or `:58`, the `LICENSE` file, or any copyright header. AGPL requires that attribution, and this product will be published under it.
- Do not rename anything else that carries the upstream brand: the Mastra agent id and store id, `featured_by_gitroom`, the generated organisation e-mail domain, the Tumblr user agent, `POSTIZ_*` environment keys, the `postiz://` scheme. Separate tasks own them; touching them here mixes two reviews into one diff.
- Do not work on `codex/i18n-complete-locales` and do not start the four tasks of Beads epic `content-factory-next-we2`; both conflict with this sweep.

Output: per commit, the exact command you used for the sweep, the number of files changed, and the verbatim result of all four verification commands. Then the three commit hashes, and anything you could not finish with the reason.

Stop: Do not stop for permission — commit each stage and continue. Never push, never merge into `main`, never deploy. If a verification goes red, do not commit that stage: report the exact failing output, revert that stage's changes, and stop rather than pressing on with a broken tree — a half-renamed repository is worse than an unrenamed one.

Stages, in order, one commit each:
1. The alias. `tsconfig.base.json`, all `.ts`/`.tsx` under `apps/` and `libraries/`, the mock strings under `tests/`, and `README.md`. Then the `tests/branding.test.cjs:34` amendment described above.
2. The package names. Root `gitroom` and the five `postiz-*` workspaces take the product's name; `@postiz/node` becomes `@contentfactory/node`. Regenerate the lockfile.
3. The record. Amend ADR-0006 with the decision and its date, and update any documentation that still names the old alias or the old package names.
