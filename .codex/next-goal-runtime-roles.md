# Next goal: runtime roles and a separate Mastra database on production

## Outcome

Move `factory.aidevteam.ru` off owner-privileged database access and out of a
shared schema, in the order the runbook fixes. Beads epic
`content-factory-next-2t1` holds the five steps, chained so only the next one is
ever ready. The plan and the instance state this was written against are in
`docs/operations/runtime-roles-mastra-split-plan.md`; the procedure itself is in
`docs/operations/production-deploy.md`, section «Разовый переход на runtime-роли
и отдельную базу Mastra». Do not restate either — follow them.

Two things are wrong on the instance today, and one of them was demonstrated on
21 August rather than assumed.

**The application connects as the database owner.** It can drop tables, alter
schemas and grant rights. Any bug, injection or compromised dependency has a
whole database as its blast radius instead of a set of rows.

**Mastra's 29 `mastra_*` tables live in the product schema.** `schema.prisma`
describes 8 of them and does not describe the other 21, so every schema tool
reads those 21 as drift. On 21 August `prisma migrate diff` proposed `DROP
TABLE` for 21 tables, `DROP INDEX` for 5 and about 22 `DROP COLUMN`. Until this
is fixed, every schema change needs statements hand-picked out of a diff, and
the ordinary command `prisma db push` destroys Mastra's data silently.

State verified read-only on 21 August, which changes the shape of the work:

- **No runtime roles exist yet** — only `contentfactory` and `listmonk`. The
  fail-closed guard refuses when an *existing* runtime role owns objects or
  holds memberships; there is nothing here for it to catch, so expect bootstrap
  to pass on the first run. The three `pg_auth_members` edges are built-in
  (`pg_monitor` → `pg_read_all_*`). That `POSTGRES_USER` owns the objects is
  normal, not an obstacle. Keep the manual cleanup branch as a fallback.
- **The Mastra tables hold 0 rows and 768 kB**, one trigger, no enum or domain
  dependencies, only the `plpgsql` extension. This is the cheapest this
  migration will ever be. Moving empty storage and moving a year of agent
  history are different operations.
Steps 1 to 3 of the plan were carried out on 21 August and must **not** be
repeated. Verify each is still true, then start at the compose delivery below.

- The eight operational scripts are installed under `/srv/content-factory-next/`
  at mode 700 — `bootstrap-app-db.sh`, `migrate-mastra-storage.sh`,
  `check-postgres-role-isolation.sh` and the backup set.
- The five variables exist in `.env`, which is mode 600 and was backed up
  first to `.env.bak-before-runtime-roles-*`. The two passwords were generated
  on the host and appear nowhere else. Do not regenerate them.
- A full cluster dump is at
  `/srv/content-factory-next/backup-pre-split-20260821T112342Z.sql.gz` —
  152 tables, 29 of them `mastra_*`, 2 roles, integrity verified.

**The one thing that blocks the bootstrap, found by running it.** The script
reads `PRODUCT_RUNTIME_USER` and its four siblings *inside* the
`cf-next-postgres` container, not on the host, so loading `.env` into the owner
shell is not enough. The deployed `docker-compose.yaml` does not pass them: the
repository version adds exactly those five lines to the `cf-postgres`
environment and changes nothing else. Deliver
`deploy/production/docker-compose.yaml` to `/srv/content-factory-next/`, keep a
copy of the old one, and recreate the database container so it picks the
variables up — its data lives in a named volume, so recreation costs a short
reconnect and nothing else. Without this the bootstrap exits 2 with
`PRODUCT_RUNTIME_USER: parameter not set` and changes nothing, which is what it
did on the first attempt.

## Boundaries

- This touches a live instance serving a real account. Every step is reversible
  by design and none removes the original `mastra_*` tables — keep it that way.
- **Never `prisma db push` against this database.** The only path for schema
  change is `migrate diff`, hand-picking your own statements, the validator, and
  a targeted `psql`.
- **`migrate-mastra-storage.sh` is not idempotent.** If it creates the schema
  and fails during or before the copy, the target holds 29 empty tables and a
  retry refuses. Recovery is to drop the target database and redo bootstrap and
  migration, never to patch the target piecemeal. The original tables in the
  product database are the rollback point the whole time.
- Do not use `REASSIGN OWNED`. It touches every object of a role. If the guard
  ever does stop, fix exactly what it names: `ALTER ... OWNER` per object,
  `REVOKE <role> FROM <member>` per edge, revoke the exact extra privilege.
- Generate the two runtime passwords and the Mastra database name **on the
  server**. Never print a value into chat, a log, a Beads task, a document or a
  commit. Build each secret inside the command that consumes it.
- Do not change `app.env` until `check-postgres-role-isolation.sh` passes. If
  the copy or the preflight fails, leave `app.env` alone and do not switch the
  application.
- Take the verified backup before the first role change, not after. The current
  backup script already requires `MASTRA_DATABASE_NAME`, so use the previously
  delivered version for this one pre-split copy, or dump directly.
- Another agent is working in `/tmp/cf-vme2` on `codex/public-funnel` (stage 6,
  the public funnel). Do not touch that worktree, that branch, or its files.
  This work is on the server and in
  `/home/me/code/.worktrees/content-factory-next-runtime-roles` on
  `codex/runtime-roles-mastra-split`.
- Do not close anything in Beads while another agent is running: `bd dolt pull`
  fires from the `bd prime` hook on every subagent start and has rolled back
  seventeen closures at once. Accumulate, close in one batch, `bd dolt push`,
  then verify each by name with `bd show` — `bd close` reports success before a
  rollback too.
- Push, remote branches, pull requests and merges to `main` are a separate
  authority. Ask by name.

## Sources

- `docs/operations/runtime-roles-mastra-split-plan.md` — the instance state and
  the stop points. Read first; it is short.
- `docs/operations/production-deploy.md` — the procedure, the guard semantics,
  the rollback, and why `pg_dump -t` alone is not enough.
- `docs/operations/postgres-backup.md` — the backup and restore path.
- `deploy/production/` — `bootstrap-app-db.sh`, `migrate-mastra-storage.sh`,
  `check-postgres-role-isolation.sh`, `env.example`, `app.env.example`.
- `scripts/operations/verify-mastra-storage-migration.sh` — the local proof of
  the migration script on disposable containers. Runs on a workstation with
  local Docker; it is not delivered to the server and never connects to
  production. It already covers a successful copy with data and a trigger, and
  refusals on a missing table, an extra table, a dependency the dump would not
  carry, and a repeat run.
- Host: `root@<боевой хост>`, `/srv/content-factory-next`. Containers are
  `cf-next-app`, `cf-next-postgres`, `cf-next-redis`, `cf-next-temporal`,
  `cf-next-listmonk`. Current image `content-factory-next:49631977`; the
  previous image `ghcr.io/…:1ab0c6198333` is kept on the host as the rollback.
- The 21 August pre-deploy database copy is in `/srv/content-factory-next/`.

## Done

- `check-postgres-role-isolation.sh` passes: the runtime roles are neither owner
  nor superuser, hold no schema `CREATE`, see only their own database, have no
  `CONNECT` to Listmonk, and hold DML on the existing tables.
- The application runs under the runtime roles, and the public routes `/`,
  `/product`, `/security`, `/docs`, `/demo`, `/auth/login` answer 200.
- Mastra is served from its own database, and the original 29 tables are still
  in the product database, untouched, as the rollback point.
- A post-migration backup is taken and a restore is actually exercised, not
  assumed. Nothing — database, roles, original tables — is deleted before that.
- `prisma migrate diff` against the product database is either empty or contains
  only our own objects. Show the statement count; that number is the point of
  the whole exercise.
- Beads: the five children of `content-factory-next-2t1` closed with the exact
  commands and counts, verified by name after `bd dolt push`.
- No secret value appears in any artefact. No temporary container, dump or
  script is left on the host.

## Progress

**Run this in a fresh session with room to spare.** The migration script is not
idempotent, and the gap between "schema created" and "data copied" is the one
place where losing context costs a recovery procedure instead of a retry. Do not
start this at the tail of a long session. If a compaction happens mid-window,
stop where you are, re-read this file and the plan, and re-establish the
instance state from the database before touching anything.

**Re-verify before acting.** Every figure in this objective and in the plan was
taken on 21 August 2026. Anything may have moved since: another deployment, a
schema change, rows arriving in the Mastra tables. Before step 1, re-run the
read-only inventory — role list, `pg_auth_members`, `mastra_*` table count, row
count and size, trigger count, enum and domain dependencies, which owner scripts
exist on the host, which `.env` variables exist. If any of it disagrees with the
plan, say which and stop: the two conclusions this objective rests on — that the
guard should pass and that the copy is nearly empty — both depend on it.

**Run the whole window end to end.** There is no owner checkpoint in the middle
and no step that waits for approval. Sol owns every in-scope choice, decides
from the evidence in front of it, and continues. Do not pause to confirm, do not
pause to show state, do not ask whether to proceed to the next step — the
sequence and its guards are the approval. Report once, at the end.

Keep a running record as you go so the final report can carry it: for each step,
what changed on the instance in observable terms, the command run, and the
counts before and after — table counts, role lists, row counts. Where a guard
refuses, record exactly what it named, then follow the documented recovery and
keep going.

## Stop

Stop and report at a non-delegable authority boundary: deleting the original
`mastra_*` tables, dropping any database other than a failed migration target,
pushing, opening a pull request, merging to `main`, or changing anything for the
Listmonk instance.

Stop also if the fail-closed guard names something the plan did not predict, if
the migration script fails after creating the schema, or if the isolation check
does not pass — in each case the answer is the documented recovery, not a
workaround, and the application stays on its current connection until it does
pass. A green result reached by relaxing a check is worse than a red one.
