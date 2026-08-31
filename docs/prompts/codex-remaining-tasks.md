Target: Codex with write access to `/home/me/code/content-factory-next`, running in goal mode with subagents.
Audience: Manual handoff — a person starts this as a goal; the owner reviews the branches before anything reaches the server.

Goal: Finish the seven tasks of Beads epic `content-factory-next-aay` — the ones that can be done now, without waiting for the owner and without waiting for anything external. Seven branches, seven commits, nothing published.

Success criteria:
- Every one of the seven tasks is either closed in Beads with evidence, or deferred with a reason recorded there. Nothing is silently dropped and nothing is quietly widened.
- Seven branches off `main`, one commit each, named per task below, in the order given. Nothing pushed, nothing merged, nothing deployed, no connection made to the server.
- After every task, all four gates are green before the next task starts. A red gate stops the run; it is not worked around.
- No schema is applied to the production database by this work. Schema changes live in `schema.prisma` and are applied locally only; the production step is the owner's, and task `content-factory-next-3tx` is what makes it safe.
- No third-party address is added anywhere. A change that would add a row to `docs/operations/outbound-connections.md` is reported to the owner instead of made.
- Every commit message says which model did the work.

Context:
- Read `AGENTS.md` first — it is the authoritative repository contract. Then `.codex/handoff.md` for current state and `.codex/project-index.md` for navigation. `CLAUDE.md` is the compact entrypoint of the same contract.
- Every task carries its own detail in Beads: `bd show <id>`. The descriptions there are the specification. They were written with the code open and they are not summaries — do not re-derive what they already settle, and do not overrule them from this document.
- The epic's membership is wired as `tracks` edges, not `parent-child`: four of the seven already belong to epics `content-factory-next-ry5` and `content-factory-next-71m` and keep those parents. `bd dep tree content-factory-next-aay` shows the seven; `bd epic status` will not, because it counts `parent-child` children only. Use the tree.
- Runtime is Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` with the committed lockfile. Never npm, never yarn.
- **The product is deployed and serving real data.** `https://factory.aidevteam.ru` runs commit `61897268` with one account and one organisation in its database. That is why nothing here touches the server, and why the schema tasks are careful.
- The tree is clean and `main` equals `origin/main` as of `61c38ba2`.

## Which model for which task

Use the cheapest model that can do the job, and say in each commit which one did it.

- **Луна** — mechanical work with a known answer: editing documentation, moving a value into a config template, extending an allowlist, recomputing a number from a measurement somebody else took. No design decisions.
- **Терра** — work that needs judgement inside one subsystem: adding a check to an existing guard, wiring a container into compose, reading a library's source to pick a setting, implementing a flow whose shape is already decided.
- **Сол** — work where the design is not decided yet, or where a mistake is expensive or hard to see: anything touching authentication, anything that adds a table, anything whose failure mode is a security hole rather than a broken screen.

If a Луна task turns out to need judgement, stop and escalate it to Терра rather than guessing. If a Терра task turns out to touch authentication or a schema, escalate it to Сол. Escalation is a normal event and is recorded in the commit; guessing is not.

## Order, branches and models

Do them in this order. The first one is first because the two after it add tables.

| # | Task | Model | Branch |
|---|---|---|---|
| 1 | `content-factory-next-3tx` | Терра | `work/schema-drift-guard` |
| 2 | `content-factory-next-rmp` | Сол | `work/user-identity` |
| 3 | `content-factory-next-omx` | Сол | `work/product-events` |
| 4 | `content-factory-next-ry5.4` | Терра | `work/own-error-collection` |
| 5 | `content-factory-next-ry5.2` | Терра | `work/newsletter-subscription` |
| 6 | `content-factory-next-71m.5` | Сол | `work/backend-memory-survey` |
| 7 | `content-factory-next-71m.6` | Луна | `work/compose-memory-limits` |

After every task, all four must pass before the next one starts:

```
pnpm test
pnpm run build
node scripts/branding/brand-scan.cjs
bash scripts/orchestration/run_process_verification.sh
```

Never push. Never merge into `main`. Never deploy. Never open an SSH session to the server. Never run a command against the production database.

## The finding that shapes tasks 1, 2 and 3

Discovered on the deployment of 2026-08-17 and already written into `docs/operations/production-deploy.md`:

**`prisma db push` must not be run against the deployed database.** Mastra keeps its own storage in the same database and the same `public` schema — twenty-nine `mastra_*` tables. Eight of them are described in `schema.prisma`, pulled in by upstream commit `c982e30e`; the other twenty-one are not, and push reads those as drift and removes them. That is the 21 in the preview on that deployment: it would have dropped 21 tables, 5 indexes on `mastra_ai_spans`, about 25 columns and a primary key, alongside the one `CREATE TABLE` it was asked for.

`--accept-data-loss` is not the guard it looks like: it stops a change Prisma can see is lossy, and drops an empty table without a word.

What this means for you:

- Task 1 turns that prose into something mechanical. It is not "write a document"; the acceptance criterion asks for a check that catches the divergence before anyone applies anything.
- Tasks 2 and 3 each add a table. Locally, apply them however you normally would. Do not write a runbook step that tells the owner to run `db push` on the server; the safe procedure already exists in the deployment runbook, and your job is to say which statements of it are yours.
- Task 2 also backfills rows into its new table from `User.providerName` and `User.providerId`. On the production database that is a data write, not a schema change, and it is the owner's step. Deliver it as a script that can be read before it is run, and that reports what it would do before it does it.

## Rules that are not yours to relax

- **Write zone is this repository.** `/home/me/code/content-factory` is a read-only donor.
- **Beads is the only durable tracker.** Claim before starting, close with evidence. New findings become new issues; they do not widen an existing one. Note: closing an issue while several agents run has been observed to roll back on this project — close at the end of a task, then verify with `bd show`, and do not trust the success line alone.
- **Authentication rules in `content-factory-next-rmp` are settled.** Linking happens only from an authenticated session by an explicit action, never by matching an email address; an identity already attached to another account is refused rather than moved; the last sign-in method cannot be removed. These are in the task description with the reasoning. If you believe one is wrong, stop and say so — do not implement a fourth behaviour.
- **No personal data in product events.** Task 3 records organisation and user identifiers and nothing else. Not the address, not the name, not to our own receiver either.
- **Do not mutate an upstream-used Temporal workflow or activity contract.** Add a versioned successor and migrate callers.
- **Keep provider-specific behaviour inside provider implementations.**
- **Interface work uses the `cf-*` semantic tokens** and the shared primitives in `apps/frontend/src/components/ui` and `libraries/react-shared-libraries/src/form`. Read `docs/design/component-authoring-rules.md` before touching a component. No hex literals in JSX; monospace for `label-sm` and `caption`; contrast holds in both themes.
- **Preserve AGPL and upstream attribution** and compatibility-sensitive identifiers: `@contentfactory` package names, environment variable names, database and provider identifiers.
- **Secrets stay out of everything you write.** Not in a prompt, not in a commit, not in a document, not in a command argument. Reading a local `.env` for a local task is expected; putting any value from it anywhere else is not.
- Resolve version-sensitive dependency behaviour through documentation rather than recall. If no external boundary applies, record why.

## When to ask, and what to ask

Two different things, and confusing them wastes the owner's time.

**Ask for product intent** when two or more outcomes stay plausible and the answer changes behaviour, acceptance, scope or rework — a workable technical default does not remove that need. Examples that will come up: where the error collector should live and how long it keeps anything; whether a newsletter subscription needs double opt-in for this audience; what the admin view of product events should answer first.

**Ask for authority** separately, and only at the exact action: connecting an account, a paid model call, a write against the production database, a push, opening a pull request. Name the action when you ask. Do not phrase a product question as a permission request, and do not ask permission for ordinary local edits.

## Output

- Lead with what changed in user-visible terms and how the owner can verify it by hand. A diff is supporting evidence, not the report.
- State which normal, failure and edge scenarios were exercised, and name the ones that were not.
- List every limitation and every deferral with its Beads id.
- Then the evidence: commands run with their results, and the changed files, per task.
- Record any decision-affecting finding a later agent would otherwise lose: what you saw, what it implies, how confident you are, and where it belongs.

## Stop

- Stop and report after each task, before starting the next. Seven stops, not one.
- Stop and ask when a task turns out to depend on a product decision the owner has not made.
- Stop and ask before any write against the production database, including the backfill of task 2.
- Stop and report rather than working around a failing gate, a failing brand scan, or a failing process verification.
- Stop and report if a task's Beads description contradicts this document. The description was written against the code and wins; say which line disagreed.

## Launcher

This is what a person pastes into Codex to start the run. It is deliberately short: everything else is above, in the repository, where the orchestrator reads it rather than carrying it in the launch message.

```
Use $orchestrator-stage in goal mode. Write access to this repository, subagents allowed.

Goal: execute Beads epic `content-factory-next-aay` — seven tasks, in the order it gives.

Context: `docs/prompts/codex-remaining-tasks.md` is the contract for this run — branch, model and gates per task, plus the rules. Read it, then `AGENTS.md` and `.codex/handoff.md`. Each task's spec is its Beads description: `bd show <id>`. Models by cost: Луна mechanical, Терра judgement in one subsystem, Сол authentication and schema. Escalate rather than guess; name the model in each commit.

Constraints: the product is deployed and serving real data. Never push, merge, deploy, reach the server, or run anything against the production database — `prisma db push` there drops 29 Mastra tables. Seven branches off `main`, one commit each.

Output: per task — what changed for a user, how to verify by hand, deferrals with Beads ids, then commands and files.

Stop: after every task. Ask for an unmade product decision; ask for authority separately, naming the action.
```

`orch-prompts prompt-check` passes on both this document (`--kind handoff`) and the launcher (`--kind launcher`). Both carry one warning, that they exceed the single-prompt size targets of 1500 and 1000 characters. The launcher is 1054; the remainder is load-bearing and was not cut to reach a round number.
