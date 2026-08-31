# Contributing

Content Factory is a private repository under active development, released
under AGPL-3.0. There is no open contribution programme and no Contributor
License Agreement: what you send stays under the AGPL, same as the rest of the
tree. This file describes how work is actually done here, so that a change
arrives in the shape the repository expects.

## Read the contract first

`AGENTS.md` is the authoritative contract for this repository — runtime
versions, monorepo boundaries, the backend request flow, the design-system
rules, and the safety limits on publishing and deployment. `CLAUDE.md` is the
same contract with a Claude-specific entry point. Read one of them before
changing anything; nothing below repeats what they already say.

Two further documents are worth reading before a first change:

- `.codex/project-index.md` — where things live.
- `.codex/handoff.md` — what is currently in flight.

## Beads is the only task tracker

Every unit of work has a Beads issue, and Beads holds the durable status
history. Do not open a parallel ledger — no `tasks.json`, no Markdown to-do
list, no status kept only in a commit message.

```bash
bd ready              # issues with no blockers
bd show <id>          # description, decisions and acceptance criteria
bd update <id> --status in_progress
```

A change that is worth making but out of scope for the issue in hand becomes
its own Beads issue rather than a `TODO` in the source.

## Set up

```bash
nvm use               # Node 22.23.2, from .nvmrc
pnpm install          # pnpm 10.6.1, against the committed lockfile
pnpm run dev:docker   # Postgres, Redis and the admin UIs
pnpm run dev
```

Use pnpm. npm or yarn will rewrite the lockfile and the resulting tree is not
the one anything else is verified against. `docs/development/local-development.md`
covers the rest.

## Run the focused checks for what you changed

Verification here is scoped to the surface you touched, not to the whole suite.
A frontend component change runs the design guards; a change to the supply-chain
metadata runs the supply-chain guard; and so on:

```bash
./node_modules/.bin/jest tests/design.guard.test.cjs
pnpm run docs:check
node scripts/branding/brand-scan.cjs
```

The full `pnpm test` and `pnpm run build` are release acceptance and belong to
whoever owns the release, not to an individual change.

## Open a pull request

Branch, commit, and open a pull request against `main` using
`.github/PULL_REQUEST_TEMPLATE.md`. One issue per pull request. Explain why the
change was needed rather than restating what the diff shows, and link the Beads
issue.

Pull requests are written here largely with AI assistance and that is fine.
What is not fine is a change nobody has read: you are answerable for the diff
you send, whoever or whatever typed it.

## Reporting a vulnerability

Not here. `SECURITY.md` has the private disclosure route — please do not open a
public issue for a security finding.

## Code of conduct

`CODE_OF_CONDUCT.md` applies to every interaction in this repository.
