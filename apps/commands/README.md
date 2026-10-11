# Content Factory commands

Use Node 22.23.2 and pnpm 10.6.1 from the repository root:

```bash
pnpm --filter ./apps/commands run build
pnpm --filter ./apps/commands run start --help
pnpm --filter ./apps/commands run start config:check --strict
```

`config:check` reads the environment of this process. Load a chosen `.env` with
your usual environment loader before invoking it. It does not discover a file,
connect to PostgreSQL/Redis/Temporal, or contact a provider. Its checks validate
the existing required variables and URL syntax; they do not prove connectivity,
credentials, schema compatibility, or provider readiness.

The existing report mode `config:check` still exits zero when issues are found.
Opt in with `config:check --strict` for automation: invalid configuration exits
1, valid configuration exits 0. CLI parsing errors also exit nonzero. `--help`,
command help, and `--version` use the same lightweight route. Operational tasks
keep the existing Nest application context and cleanup for Redis/Temporal/Nest.
Their descriptions and adaptation switches share pure metadata with help.
Operational commands may connect to services; their authority boundaries still
apply, including `--apply` for adaptation writes.

The compiled entry is `apps/commands/dist/apps/commands/src/main.js`; the package
`start` script invokes it. The local compiled proof observes actual socket/DNS
calls and loaded modules while delegating the original functions. It does not
substitute a Prisma connection or infer offline behavior from the normal
application-graph unit fixture.

See [auxiliary support boundaries](../../docs/development/auxiliary-tool-support.md)
for retained SDK/extension/Jenkins/local Docker consumers and test cleanup.
