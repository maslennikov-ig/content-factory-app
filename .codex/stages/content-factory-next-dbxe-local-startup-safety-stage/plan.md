# Local startup and database safety — dbxe.25

Owner selected25 on11Oct2026. Root owns this one coupled maintenance stream;
no additional agents have a material benefit. Beads owns task/status truth;
original selected and30 epic criteria remain unchanged. Parent stays OPEN.

## Acceptance and implementation

1. Reproduce current package commands using fake pnpm/PM2 executables in an
   owned temporary tree only. No real database, PM2 daemon or Docker mutation.
2. Keep the existing local profile: PostgreSQL cf-dev / cf-dev-db on explicit
   localhost,127.0.0.1 or[::1] port5433. Reject production NODE_ENV, remote or
   ambiguous URLs, alternate connection options and conflicting environment
   sources before any child process. Never print passwords/complete URLs.
3. One small local CLI handles the old root/app PM2 aliases and Prisma push/reset.
   Startup calls the existing app start scripts in the foreground, with no PM2
   deletion or schema command. No new supervisor or compose infrastructure.
   Push/reset default to no execution; dry-run is explicit and schema mutation
   requires --apply --confirm-local cf-dev-db. Ordinary push no longer accepts
   data loss implicitly; reset is one explicit installed Prisma6.5 invocation.
4. Cover inherited/.env conflicts, schema-folder environment sources, unsafe
   URL/argument attempts, all legacy startup paths, normal local setup/reset,
   dry-run, secret-safe diagnostics and child failure propagation. Fakes only.
5. Update local/Telegram instructions, record root focused acceptance, Beads,
   handoff, delivery and cleanup. No full suite or runtime release is necessary:
   production Dockerfile/entrypoint/ecosystem/schema stay byte-identical and
   production never invokes these legacy local scripts. Current2a53727594a1
   runtime remains the accepted .34 release; local proof is kept separate.

## Technical Premortem

Verdict: GO WITH CONDITIONS. Blast radius: package scripts -> local CLI ->
existing app start or installed Prisma CLI -> explicit local development target.
The persisted development volume remains unchanged by this stage; tests use fakes.

| Failure | Evidence / mechanism | Gate / proof |
| --- | --- | --- |
| Working DB loses schema/data on launch or reset | Confirmed inherited DATABASE_URL and unguarded db push/reset | Exact local profile, env/argument checks before child; startup never invokes Prisma |
| Unrelated PM2 processes disappear | Confirmed pm2 delete all, generic app names | Startup does not invoke PM2; exercise root,app and Dockerfile.dev routes |
| Validation and actual CLI read different targets | Plausible root/schema .env, inherited values, dotenv expansion/query overrides | Reject conflicts and substitutions; pin checked DATABASE_URL in child environment and fixed --schema |
| Developer setup becomes unusable | Plausible implicit-data-loss behavior changes | Preserve existing profile and installed CLI; document explicit dry-run/apply/reset commands |
| Executor accidentally tests real destructive commands | Material and avoidable | Isolated temporary source copy; fake all command executables; zero live mutations |

Recovery: stop using the legacy alias if its local preflight fails; correct the
local profile or roll the guard forward, without restoring unconditional schema
push/global PM2 deletion. The default refusal/no-child path is tested. This
stage applies no live schema/data/process mutation and needs no DB restoration.
The existing production runtime and rollback remain untouched. Intent is explicit
for local data loss; URL validation does not attest arbitrary SSH tunnels or a
local machine repurposed as a production host. Use this profile only for the
known development stand; bypassing it via direct Prisma is outside the wrapper.

Graph: focused pm2-run/prisma-reset lookup on local d724 map; package.json matched
its indexed digest before edits. Missing neighbors do not prove absent consumers;
current tracked source/doc/Dockerfile.dev calls independently read.
Prisma6 docs: https://docs.prisma.io/docs/orm/v6/more/dev-environment/environment-variables
Installed dotenv-cli confirms inherited-environment priority and expansion.
