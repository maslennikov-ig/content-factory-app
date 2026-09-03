Target: Codex with write access to `/home/me/code/content-factory-next`, running in goal mode with subagents.
Audience: Manual handoff — a person starts this as a goal; a Claude session accepts the result before anything reaches the server.

Goal: Finish the eight tasks of Beads epic `content-factory-next-fn33` — everything the owner found on 03.09.2026 walking the live product by hand, from registration to the settings page that crashed. One branch, eight commits, nothing published.

Success criteria:
- Every one of the eight tasks is closed in Beads with evidence, or deferred there with a reason. Nothing is silently dropped and nothing is quietly widened. The run does not wait on anyone: assumptions are recorded, not asked.
- One branch `work/walkthrough-2026-09-03` off `main`, one commit per task, in the order below. Nothing pushed, nothing merged, nothing deployed, no connection to the server, no write against the production database.
- After every task the focused checks for its surface are green and `tsc --noEmit` is zero for every app it touched. A red check is never worked around: the task is deferred in Beads with the reason and the run continues.
- At the end of the run, on the branch: `pnpm test` (all three halves reported), `tsc --noEmit` zero on all three apps, `git diff --check`, and `scripts/orchestration/run_process_verification.sh` — all green, with the output kept.
- Every guard added went red once before it went green, and the report says how.
- Every commit message says which model did the work.

Context:
- Read `AGENTS.md` first — it is the authoritative repository contract. Then `.codex/handoff.md` for current state and `.codex/project-index.md` for navigation.
- Every task carries its own detail in Beads: `bd show <id>`. The descriptions are the specification, written with the code open and with the exact file and line the defect lives in. Do not re-derive what they settle, and do not overrule them from this document. `bd dep tree content-factory-next-fn33` shows the eight.
- **The product is deployed and serving real people.** `https://factory.aidevteam.ru` runs `efafe77fe64e`; the owner and two more accounts use it. The findings come from that instance. That is why nothing here touches the server.
- Runtime is Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` with the committed lockfile. `/home/me/.local/bin/node` shadows nvm — check `node -v` first, or prefix `PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`. Never npm, never yarn.
- The tree is clean and `main` equals `origin/main` at the commit that added this file.

## Order, and which model for which task

Use the cheapest model that can do the job, and name it in each commit. **Луна** — mechanical work with a known answer. **Терра** — judgement inside one subsystem. **Сол** — authentication, anything whose failure is a security hole rather than a broken screen. If a task turns out to need more than its model, escalate and say so in the commit; guessing is not an option.

| # | Task | What it is | Model |
|---|---|---|---|
| 1 | `content-factory-next-fn33.1` | `/settings` crashes on `Reflect.getMetadata`; the only P1 | Терра |
| 2 | `content-factory-next-fn33.3` | an invitation link joins a workspace silently, with the role in the link, for whoever holds it | Сол |
| 3 | `content-factory-next-fn33.2` | settings tabs ignore the role; a member sees Teams, AI and the API key | Терра |
| 4 | `content-factory-next-jdfy` | an approved account gets no email and never learns it may sign in | Терра |
| 5 | `content-factory-next-3r4a` | a pending registration cannot be declined, only approved | Терра |
| 6 | `content-factory-next-f4ai` | password rule: 7 characters with a letter, a digit and a symbol, one rule in one place | Терра |
| 7 | `content-factory-next-yyiy` | one password field with a show/hide toggle, used in all five places | Луна after the component exists; Терра for the component |
| 8 | `content-factory-next-fn33.4` | a visible way into the profile | Луна |

Task 1 is first because the owner cannot open settings at all. Task 2 is second and is Сол's because it is authentication: read `docs/product/roles-matrix.md` before it, and add the `/user/join-org` door to that table — `tests/roles-matrix.guard.test.cjs` reconciles the table with the controllers and will tell you if the row is wrong.

## What you need to know that the tasks do not repeat

- **Proving task 1 needs a production build.** The crash does not happen on `next dev`: it is a chunk-ordering failure of the built bundle, and `tsc` is clean. Build the frontend, serve it, and open `/settings` by direct navigation with Playwright, reading the console. Playwright here needs an explicit executable — `node_modules/playwright` asks for a Chromium revision that is not installed and you must not download one: `chromium.launch({ executablePath: '/home/me/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })`, navigate with `waitUntil: 'load'`, run the script from the repository root, keep it under `tmp/` (ignored). If you cannot get a production build to run locally, say so and show the guard test instead — do not report the task done on a dev-server check.
- **The guard for task 1 is a tree scan, not a unit test**: every client module that imports a class from `libraries/nestjs-libraries/src/dtos` must be covered by one root-level `import 'reflect-metadata'`. Pattern to copy: `tests/content-section-tabs.boundary.guard.test.cjs` reads files and asserts on their text.
- **Tests must not write into `apps/**` or `libraries/**`.** `tests/helpers/source-tree-guard.cjs` refuses it and says to use `mkdtemp`. A full Jest run no longer breaks the dev stand; do not add advice about `.next` to anything.
- **Locale keys come in sixteen.** Every new user-facing string is a key in all sixteen files under `libraries/react-shared-libraries/src/translation/locales/`, and backend mail strings in `libraries/nestjs-libraries/src/locale/backend-strings.ts` with the same sixteen; `tests/locale-key-set.test.cjs` refuses an uneven set.
- **Mail goes through Temporal `send_email_v2`.** Task 4's email is queued the way the awaiting-approval email is queued today (find it in `users.service.ts` / the auth flow), with the user's locale. Do not touch `send_email` v1 — it is terminated.
- **Tooltips are counted per file** by `tests/hint.guard.test.cjs` against `tests/tooltip-allowlist.json`; a new `data-tooltip-id` needs the allowlist updated in the same commit.
- **Interface work uses `cf-*` tokens** and the primitives in `apps/frontend/src/components/ui`; read `docs/design/component-authoring-rules.md` before writing the password field or the profile menu item. No hex in JSX; monospace for `label-sm` and `caption`; full state coverage; contrast in both themes. `tests/design.guard.test.cjs`, `tests/design.contrast.test.cjs` and `tests/foundation.test.cjs` hold it.
- **The second hand-rolled copy of one decision is a duplicate to extract.** The password rule (task 6) exists today in two DTOs and three screens; deliver one function both sides import, not five edits. The password field (task 7) is one component, not five toggles.
- **Roles are read through `isOrganizationAdmin` from `libraries/nestjs-libraries/src/user/organization.roles.ts`**, never by comparing strings again. That file is deliberately free of `@prisma/client` because the browser imports it — keep it so.

## Rules that are not yours to relax

- **Write zone is this repository.** `/home/me/code/content-factory` is a read-only donor.
- **Beads is the only durable tracker.** Claim before starting, close with evidence at the end of each task, then verify with `bd show` — closures on this project have rolled back while several agents run; the success line alone is not proof. New findings become new issues under the epic; they do not widen an existing one.
- **No production write of any kind.** Not the database, not the host, not `app.env`. Deleting the two stale pending accounts on production is the owner's step after task 5 ships a decline action; do not script it against the server.
- **Do not mutate an upstream-used Temporal workflow or activity contract.** Add a versioned successor and migrate callers.
- **Keep provider-specific behaviour inside provider implementations.**
- **Preserve AGPL and upstream attribution** and compatibility-sensitive identifiers: `@contentfactory` package names, environment variable names, database and provider identifiers.
- **Secrets stay out of everything you write.** Reading the local `.env` for a local task is expected; putting any value from it anywhere else is not.
- **Never `prisma db push`** anywhere but a throwaway local database, and none of these tasks should need a schema change. If one does, stop and say which.
- Resolve version-sensitive dependency behaviour through documentation rather than recall. If no external boundary applies, record why.

## Run autonomously

The owner asked for this run to go end to end without waiting on him. So: no stop between tasks, no check-in, no question that a credible default answers. Where two outcomes stay plausible, take the one the Beads description names as default, record it as an assumption in the commit and in the final report, and keep going. The two defaults already decided: a declined registrant gets no email; an invitation without an address — the «copy link» path — goes through the same confirmation screen without address binding.

Only two things end the run early, and both are recorded, not asked around: an action that needs authority (any push, merge, deploy, server or production-database write — none of these tasks should reach one), and a red check you cannot make green without weakening it. In the second case commit what is green, defer the task in Beads with the reason, and continue with the next task rather than blocking the run on it.

## Output

- One report at the end. Lead with what changed in user-visible terms and how the owner can verify it by hand on the stand, per task.
- State which normal, failure and edge scenarios were exercised, and name the ones that were not.
- List every limitation and every deferral with its Beads id.
- Then the evidence: commands run with their results, and the changed files, per task; for task 1 the Playwright console transcript of the built `/settings`.
- Record any decision-affecting finding a later agent would otherwise lose.

## Stop

- One stop: at the end, after the eighth task and the final checks. One report covering all eight.
- A failing check is never worked around; it is deferred with its reason and the run continues (see «Run autonomously»).
- If a task's Beads description contradicts this document, the description wins — it was written against the code; say in the report which line disagreed.
- Stop early only for an action that needs authority, naming it.

## Launcher

What a person pastes into Codex to start the run.

```
Use $orchestrator-stage in goal mode. Write access to this repository, subagents allowed.

Goal: execute Beads epic `content-factory-next-fn33` — eight tasks, in the order `docs/prompts/codex-live-walkthrough-fixes.md` gives.

Context: that document is the contract for this run — order, model per task, checks, and what the tasks do not repeat. Read it, then `AGENTS.md` and `.codex/handoff.md`. Each task's spec is its Beads description: `bd show <id>`. Models by cost: Луна mechanical, Терра judgement in one subsystem, Сол authentication. Escalate rather than guess; name the model in each commit.

Constraints: the product is deployed and serving real people. Never push, merge, deploy, reach the server, or write to the production database. One branch `work/walkthrough-2026-09-03` off `main`, one commit per task. Task 1 is proved on a production build with Playwright, not on `next dev`.

Output: one report at the end — per task what changed for a user, how to verify by hand, assumptions taken, deferrals with Beads ids, then commands and files.

Stop: only at the end, or for an action that needs authority (name it). Do not pause between tasks or ask about product intent — take the default the task names, record the assumption, continue; defer a task you cannot make green and move on.
```
