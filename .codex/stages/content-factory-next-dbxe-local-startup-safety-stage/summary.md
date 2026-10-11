# Local startup/database safety — accepted source boundary

Selected task: content-factory-next-dbxe.25; root-owned medium closeout-lite.
Branch codex/dbxe-local-startup-safety-20261011; baseline1db88425ae8a.
No delegated streams, database/PM2/Docker mutations or paid/provider calls.

One local CLI guards root/app PM2 aliases, Dockerfile.dev startup and Prisma
push/reset. Exact existing cf-dev / cf-dev-db loopback:5433 profile only;
production/ambiguous/conflicting URLs, NODE_ENV, environment substitutions and
connection/schema argument overrides reject before child. Separate Mastra URL
must satisfy the same local boundary. Diagnostics never print passwords or URLs.

Startup delegates only to the existing foreground app start scripts: no PM2
commands, global process deletion or automatic schema push. Push/reset default
to no execution; --dry-run has no child. --apply --confirm-local cf-dev-db is
required. Installed Prisma6.5 used; ordinary push has no --accept-data-loss;
reset is one explicitly destructive invocation. App source/dependency versions,
production Dockerfile/entrypoint/ecosystem and schema/SQL guard stay unchanged.

60 new executable cases use isolated temporary copies and fake commands only.
The original failure log is retained; its nine argument-table harness failures
are distinguished from real unsafe legacy behavior. First corrected source run
passes51 cases with those nine harness failures; corrected final tests pass60.
Final acceptance additionally exercises the existing production startup guard,
documentation/process/diff and immutable source boundary.

docs-reviewed: updated - local setup/reset/legacy startup and both Telegram
documents use the explicit intent/profile; production schema procedure unchanged.
graph-reviewed: used - focused local pm2-run/prisma-reset lookup on d724 graph;
package.json initially matched indexed hash, exact current callers independently
read. No application import graph changed; new local CLI is documented in index.
No graph refresh, external extraction, query logging or hooks.

Production release2a53727594a1 remains the accepted .34 runtime. Fresh read-only
API/login/source identity proves availability only, not deployment of local
scripts. No release/full-suite replay or host cleanup needed. No live reset test:
the original acceptance explicitly requires fakes. Bypassing wrappers, untrusted
source modifications, deliberate tunnels or repurposing the dev profile are
outside the accidental-command guard.

Out-of-scope legacy docker-build.sh targets absent dist/devcontainer stages;
retain this concrete finding in existing OPEN dbxe.28. Parent epic stays OPEN;
all30 original criteria kept. Next candidate24 remains unselected.
