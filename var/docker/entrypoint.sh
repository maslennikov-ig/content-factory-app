#!/bin/sh
# Entry point of the production image.
#
# Deliberately does not touch the database. The upstream start script runs
# `prisma db push --accept-data-loss` on every boot, which turns an ordinary
# restart into a schema mutation that may drop columns.
#
# Do not run `prisma db push` against the deployed database at all, from here or
# from a shell in this container: Mastra keeps its own tables in the same
# `public` schema and push removes the ones the schema does not describe. The
# `prisma-db-push` script in package.json exists for local development only.
#
# Applying the schema is a separate, deliberate deploy step: read
# `docs/operations/production-deploy.md`, section «Применение Prisma-схемы». It
# prints the SQL read-only, has you select your own statements, checks that
# selection with `scripts/operations/validate-prisma-migration-sql.cjs`, and
# applies the checked file in one transaction.
set -e

# The applications themselves read configuration from the process environment,
# which compose fills from `env_file`; since the `dotenv` wrappers went away
# nothing here parses the file. The check stays because the same compose file
# mounts it, so a container without it is one nobody configured, and failing on
# the first line is better than failing later with a missing DATABASE_URL.
if [ ! -f /app/.env ]; then
  echo "content-factory: /app/.env is missing." >&2
  echo "Mount it into the container; compose also passes it through env_file." >&2
  exit 1
fi

nginx

# `pm2-runtime` is PM2's own answer to running inside a container: it stays in
# the foreground as PID 1, so the daemon and the separate `pm2 logs --raw`
# process that used to keep the container alive collapse into one. `--raw`
# keeps the log format that `pm2 logs --raw` gave.
#
# The process list is a file rather than three `pm2 start pnpm -- start` calls,
# which left a `pnpm` and a `dotenv-cli` parent resident behind each
# application. See var/docker/ecosystem.config.js for the measurements and for
# why `dotenv` is not needed here.
#
# It also gives the container a shutdown it did not have: a `docker stop` now
# reaches PM2, which stops the three applications, instead of killing the log
# reader and leaving the rest to the ten-second timeout.
exec pm2-runtime --raw /app/var/docker/ecosystem.config.js
