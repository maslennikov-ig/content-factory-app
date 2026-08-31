---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/content-factory-next-ia0/stage-manifest.json
stream_owner: infrastructure_security
orchestration_level: integration
scope_kind: product_slice
task_id: content-factory-next-ia0.infrastructure-security
epic_id: content-factory-next-ia0
stage_id: content-factory-next-ia0
repo: content-factory-next
branch: codex/remaining-infrastructure
base_branch: codex/remaining-epic-coordination
base_commit: 07170871a4c6228e008d59319ac786a6171d66ee
worktree: /tmp/cf-ia0-infrastructure
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: blocked
cleanup_notes: Disposable PostgreSQL proof resources were removed. The infrastructure worktree and thematic branch are retained as required local deliverables; deleting either needs separate user approval.
risk_level: high
risk_tags:
  - security
  - migration
  - privacy
  - rollback
affected_surfaces:
  - database
  - backend
  - ui
invariants:
  - rollback
  - test-matrix
  - idempotency
verification:
  - focused-browser-relay-green
  - focused-postgres-role-backup-green
  - real-prisma-migrate-diff-green
  - disposable-postgres-proofs-green
  - p1-bootstrap-mutation-ordering-green
  - p1-exact-runtime-object-boundary-green
  - p1-comprehensive-owner-membership-public-acl-green
  - p1-global-public-default-acl-green
changed_files:
  - apps/frontend/src/app/api/browser-errors/route.ts
  - apps/frontend/src/instrumentation-client.ts
  - deploy/production/Caddyfile.snippet
  - deploy/production/app.env.example
  - deploy/production/bootstrap-app-db.sh
  - deploy/production/bootstrap-listmonk-db.sh
  - deploy/production/docker-compose.yaml
  - deploy/production/env.example
  - deploy/production/migrate-mastra-storage.sh
  - docs/operations/error-collection.md
  - docs/operations/outbound-connections.md
  - docs/operations/postgres-backup.md
  - docs/operations/production-deploy.md
  - libraries/helpers/src/errors/browser.error.relay.ts
  - libraries/helpers/src/errors/sanitize.error.event.ts
  - libraries/nestjs-libraries/src/chat/mastra.store.ts
  - scripts/operations/check-postgres-role-isolation.sh
  - scripts/operations/postgres-backup-restore.sh
  - scripts/operations/postgres-backup.sh
  - scripts/operations/verify-postgres-backup-restore.sh
  - tests/browser-error-relay.test.cjs
  - tests/error-collection.privacy.test.cjs
  - tests/external-services.purge.test.cjs
  - tests/newsletter.subscription.test.cjs
  - tests/postgres-backup.contract.test.cjs
  - tests/postgres-backup.execution.test.cjs
  - tests/postgres-backup.restore.execution.test.cjs
  - tests/postgres-role-isolation.test.cjs
  - tests/postgres-role-isolation.execution.test.cjs
  - var/docker/nginx.conf
explicit_defers:
  - owner-must-roll-out-role-and-mastra-split
  - owner-must-validate-deployed-proxy-log-exclusion
  - owner-must-choose-post-migration-source-table-cleanup
  - root-owns-final-epic-acceptance
---

# Summary

Returned two repository-only security deliveries on `codex/remaining-infrastructure`:

- `content-factory-next-ry5.10`, commit `e68241429b5fb003ecb6d11fb8f74c529251e0f9`: same-origin `/api/browser-errors` relay built on real Sentry browser/server SDKs. The browser sends only a bounded positive allowlist; the relay never accepts or forwards raw messages, arbitrary metadata, user/model/post content, URL queries, IP, User-Agent, cookies or request headers. The exact nginx path disables access/error retention. Origin, global non-identifier abuse limit, body limit, timeout and collector-outage isolation are explicit.
- `content-factory-next-ry5.2.2`, commit `4ace55ae1dde17c79e305b1637b13bcd70f7226c`: product and Mastra receive distinct non-owner runtime roles and databases. Mastra production runtime uses `disableInit: true`; pinned schema DDL is exported and applied only by an owner-run transactional migration. Product/Mastra roles cannot CONNECT across their boundaries, either Temporal database or Listmonk, and receive no database/schema ownership or CREATE. Existing and owner-created future tables/sequences receive bounded DML grants. Backup/restore now carries `mastra.dump`, while restore remains compatible with older artifacts.
- Root review event `8b1c158d-0c79-482e-bdd2-77d92ccd1c9c` is resolved by safety commit `7c58305c7312dd990892e50200b45598aed8306c`: runtime names, existing role attributes/memberships, database ownership, prerequisite databases and product/existing-Mastra schema ownership are validated before any password/database/grant mutation. PostgreSQL 17 failures now use a real SQL error under `ON_ERROR_STOP`; `\quit 1` was removed because PostgreSQL 17 ignores its argument and exits zero. Listmonk received the same fail-before-mutation ordering. The preflight calls `has_table_privilege` independently for SELECT, INSERT, UPDATE and DELETE.
- Accepted completion event `4de39e95-23b9-40a8-8c48-90cc0fc6f975` is superseded by combined-review safety commit `d24ecb2b579d82e471abef9a952f464c47904cca`: before any mutation, both existing runtime roles are rejected if they own a user database/schema/table/sequence/function or have an effective privilege outside their database's exact `public` DML/sequence allowlist. The same whole-database boundary is enforced by preflight, including independent denial of `TRUNCATE`, `REFERENCES`, `TRIGGER`, `EXECUTE`, schema `CREATE`, cross-role grants, and grants in non-public schemas. The owner remains the only object owner. Database-level behavior intentionally remains the prior CONNECT boundary: this correction does not revoke `PUBLIC` CREATE/TEMPORARY from product, Mastra, Temporal, or Listmonk and therefore does not change unrelated service capabilities.
- Returned completion event `d37e68f2-2c1e-4ed5-85ad-eee0150993fb` is resolved by combined re-review commit `1118e96b940a8caa0518b32314b8c9bf51ac9c16`: a current-database `pg_shdepend` owner dependency check covers enum/domain, extended statistics and other database-local catalog object types beyond `pg_class`; membership is rejected when either runtime role appears as `pg_auth_members.member` or `.roleid`; and current plus owner-created future table/sequence ACLs are stripped from `PUBLIC` before exact runtime grants are applied. Preflight independently proves no current/default `PUBLIC` ACL. Destructive privileges through `PUBLIC` remain fail-closed before password/grant mutation. Temporal/Listmonk database CREATE/TEMPORARY behavior remains untouched.
- Returned completion event `d032bc0a-69fc-48f2-b903-5c95cffbe298` is resolved by final review commit `2e5d157ee8c20fbf1ebda17ebf5303592c8c6d83`: owner-global defaults (`defaclnamespace = 0`) and schema-scoped defaults are both cleared for PUBLIC tables/sequences/functions in product and Mastra databases. Preflight evaluates explicit global/scoped rows plus PostgreSQL hard-wired defaults, so absence of a global function override cannot hide future PUBLIC EXECUTE. Future table, sequence and function proofs retain no PUBLIC ACL. Database CREATE/TEMPORARY behavior remains unchanged.

No Beads state, production host, deployed database, collector, credentials, remote branch, PR or external account was changed.

# Decisions and documentation evidence

Mandatory version-specific resolution command:

```text
orch-prompts docs-resolve --cwd /tmp/cf-ia0-infrastructure --ecosystem npm --package @mastra/pg --version 1.8.5 --topic 'PostgresStore disableInit exportSchemas explicit init role split' --json
```

Final result was `status=l1-hit`, `coverage=exact`, `docs_version=1.8.5`, `source=l1-local`, L2 `not-needed`. The first-party tag `refs/tags/@mastra/pg@1.8.5` peels to commit `a78b4232ff84f51ee60cc102f0799ee726f7f100`:

- tree: `https://github.com/mastra-ai/mastra/tree/a78b4232ff84f51ee60cc102f0799ee726f7f100/stores/pg/src`
- package: `https://raw.githubusercontent.com/mastra-ai/mastra/a78b4232ff84f51ee60cc102f0799ee726f7f100/stores/pg/package.json`
- config: `https://raw.githubusercontent.com/mastra-ai/mastra/a78b4232ff84f51ee60cc102f0799ee726f7f100/stores/pg/src/shared/config.ts`
- store/exporter: `https://raw.githubusercontent.com/mastra-ai/mastra/a78b4232ff84f51ee60cc102f0799ee726f7f100/stores/pg/src/storage/index.ts`

Exact facts relied on: an independent connection string is accepted; `disableInit: true` suppresses automatic runtime DDL; explicit `storage.init()` is supported; `exportSchemas(schemaName?)` emits registered table/constraint/index/trigger DDL without a database connection; the implementation passes `disableInit` to `MastraCompositeStore`.

The first `docs-persist` attempt ran the harness CLI under repository-required Node `22.23.2` and exited before writing. Stdout was empty; stderr reported the harness `better-sqlite3` native module was compiled for ABI `137` (Node 24), while Node 22 requires ABI `127`. This was a harness PATH/ABI mismatch, not a repository dependency failure. Root reran only harness persistence under Node 24; all repository commands remained on Node `22.23.2`. The resolver command above then returned the exact L1 hit and removed the temporary blocker. The persist journal records topic `PostgresStore connectionString disableInit explicit init exportSchemas DDL role split`.

For the PostgreSQL 17 catalog correction, the mandatory resolver command was:

```text
orch-prompts docs-resolve --cwd /tmp/cf-ia0-infrastructure --ecosystem npm --package pg --version 8.20.0 --topic 'PostgreSQL 17 pg_shdepend owner dependency deptype o dbid current database pg_auth_members roleid member' --json --no-download
```

It returned `status=fallback-needed`, `coverage=exact`,
`docs_version=8.20.0`, `results=[]`, L1 `insufficient`: the repository package
is the Node `pg` driver and its exact docs do not describe PostgreSQL server
catalogs. No fact was inferred from that empty result. The fallback used exact
first-party PostgreSQL 17 catalog pages:

- `https://www.postgresql.org/docs/17/catalog-pg-shdepend.html`: `dbid` scopes
  a dependent object to its database and `deptype = 'o'` identifies ownership
  by the referenced role;
- `https://www.postgresql.org/docs/17/catalog-pg-auth-members.html` and
  `https://www.postgresql.org/docs/17/role-membership.html`: `roleid` is the
  granted role, `member` is its member, and membership may be indirect;
- `https://www.postgresql.org/docs/17/catalog-pg-default-acl.html`:
  `pg_default_acl` stores privileges for future objects, with namespace zero
  for global entries and `r`, `S`, `f` for relations, sequences and functions;
  absent global entries fall back to the hard-wired defaults.

All relied-on catalog behavior was then exercised against disposable
`postgres:17-alpine`; no server, account or external API was mutated.

# Verification

## Browser relay

RED command:

```text
pnpm exec jest tests/browser-error-relay.test.cjs tests/error-collection.privacy.test.cjs tests/external-services.purge.test.cjs --runInBand
```

Initial result: six expected failures because the positive-allowlist helper, first-party route, SDK transport and exact proxy boundary did not exist.

GREEN: the same command passed 3 suites and 46 tests. A real `@sentry/browser` in-memory transport proves the stored envelope has no user/request/extra/contexts/raw message/model content and retains only a canonical relative `_next` frame path. `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json --pretty false` passed.

## PostgreSQL roles, migration and recovery

RED command:

```text
pnpm exec jest tests/postgres-role-isolation.test.cjs tests/postgres-backup.contract.test.cjs --runInBand
```

Initial result: six expected failures for missing separate URLs, owner bootstrap, owner-run Mastra migration, role preflight, Listmonk CONNECT revocation and `mastra.dump`.

Final GREEN commands and results:

```text
pnpm exec jest tests/postgres-role-isolation.test.cjs tests/postgres-backup.contract.test.cjs tests/postgres-backup.execution.test.cjs tests/postgres-backup.restore.execution.test.cjs tests/postgres-backup.wrapper.execution.test.cjs --runInBand
# 5 suites, 54 tests passed

pnpm exec jest tests/newsletter.subscription.test.cjs --runInBand --testNamePattern='production Listmonk boundary'
# 10 focused tests passed; 51 unrelated skipped

pnpm exec jest tests/prisma-schema-apply-guard.execution.test.cjs tests/prisma-schema-apply-guard.migrate-diff.test.cjs --runInBand
# 2 suites, 56 tests passed; second suite used real prisma migrate diff SQL
```

Additional disposable PostgreSQL 17 proofs passed:

- bootstrap plus `check-postgres-role-isolation.sh` proved restricted role attributes, owner separation, existing/future DML, no schema CREATE and no cross/Temporal/Listmonk CONNECT;
- the actual `exportSchemas('public')` migration copied a `mastra_threads` row, left the source row intact, kept target ownership at `cf_owner`, and allowed target DML as the Mastra runtime role;
- `scripts/operations/verify-postgres-backup-restore.sh` passed on PostgreSQL 17.10 with `Dump: 2s`, `Restore: 2s`, including the Mastra sentinel. Containers, network, volumes and artifacts were removed.

TypeScript for `libraries/nestjs-libraries`, all touched shell scripts under `bash -n`, Compose config with production templates, and `git diff --check` passed on Node `v22.23.2`. No full test/build was run; root owns final acceptance.

## P1 bootstrap safety remediation

RED command:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs --runInBand
```

On the original implementation both tests failed: configuring the existing owner/superuser as `PRODUCT_RUNTIME_USER` changed its SCRAM verifier and created the second runtime role before the eventual guard, while the preflight still used the combined `'SELECT,INSERT,UPDATE,DELETE'` privilege string. The real PostgreSQL 17 run also proved `\quit 1` prints `extra argument "1" ignored` and returns zero.

GREEN:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs tests/postgres-role-isolation.test.cjs --runInBand
# 2 suites, 7 tests passed

pnpm exec jest tests/newsletter.subscription.test.cjs --runInBand --testNamePattern='ships an owner-run idempotent database bootstrap'
# 1 focused test passed; 60 unrelated skipped
```

The execution test uses disposable PostgreSQL 17, captures the owner's exact SCRAM verifier, runs the invalid bootstrap, and proves: nonzero exit; verifier byte-for-byte unchanged; no second runtime role; no Mastra database. It separately guards four explicit DML checks. A disposable success-path rerun then passed app bootstrap, Listmonk bootstrap, repeated idempotent bootstrap and `check-postgres-role-isolation.sh`; the container was removed. `bash -n` and `git diff --check` passed.

## P1 exact runtime object boundary remediation

RED command:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs --runInBand --testNamePattern='rejects owned objects'
```

Against the accepted implementation, the disposable PostgreSQL 17 bootstrap
returned zero even though the product runtime role owned a table, sequence and
function and held `TRUNCATE`, `REFERENCES` and `TRIGGER`; the test therefore
failed while expecting a pre-mutation rejection. That result demonstrated that
the existing schema-owner check did not cover persistent object ownership or
destructive object privileges.

GREEN commands and results:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs tests/postgres-role-isolation.test.cjs --runInBand
# 2 suites, 8 tests passed

pnpm exec jest tests/newsletter.subscription.test.cjs --runInBand --testNamePattern='production Listmonk boundary'
# 10 focused tests passed; 51 unrelated skipped
```

The evolved PostgreSQL 17 execution proof isolates table, sequence and function
ownership; each of `TRUNCATE`, `REFERENCES` and `TRIGGER`; non-public DML; and a
Mastra-owned table. Every case exits before changing either captured SCRAM
verifier or granting baseline SELECT. After each contaminant is removed, the
normal idempotent bootstrap and preflight pass. The test then reintroduces every
case after bootstrap and proves preflight rejects it, followed by a clean
preflight pass. All disposable containers were removed.

Bootstrap now checks effective privileges, so grants inherited through
`PUBLIC` cannot hide destructive table privileges or function EXECUTE. Exact
grants are normalized for current and future owner-created public tables and
sequences; function EXECUTE is revoked from both runtime roles and `PUBLIC`.
The permanent rollout runbook documents the fail-closed recovery: inventory the
specific object, return its owner explicitly with `ALTER ... OWNER`, revoke the
reported excess privilege (from `PUBLIC` when applicable), never use broad
`REASSIGN OWNED`, and rerun bootstrap/preflight before switching URLs.

`bash -n` passed for all touched PostgreSQL scripts, Prettier passed for the
execution test, and `git diff --check` passed. No full suite/build was run; root
owns final acceptance.

## P1 comprehensive owner, membership and PUBLIC ACL remediation

Focused RED command for ownership coverage:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs --runInBand --testNamePattern='rejects owned objects'
```

The accepted guard returned `status=0` for `product enum ownership` instead of
the required pre-mutation `status=3`. A second representative non-`pg_class`
case uses runtime-owned extended statistics (`pg_statistic_ext`). After adding
the comprehensive owner check, both cases fail closed, preserve both captured
SCRAM verifiers and preserve the denied baseline SELECT; preflight rejects the
same contaminations after a clean bootstrap.

Focused RED command for membership direction:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs --runInBand --testNamePattern='membership edges'
```

`GRANT cf_runtime TO delegated_role` left the runtime role in `roleid`, so the
old member-only guard returned `status=0` and rotated its password. GREEN checks
both adjacent directions, proves nonzero bootstrap plus unchanged SCRAM, proves
preflight rejection, removes the exact edge, and repeats for the other
direction. Any indirect chain involving a runtime role necessarily has one of
these direct adjacent `member`/`roleid` edges.

The PUBLIC ACL loop produced two further RED states with the ownership-focused
command: benign current/default PUBLIC SELECT/USAGE caused bootstrap to fail
instead of normalize, and after normalization a default PUBLIC table ACL made
preflight return zero. GREEN now removes all current and owner-default PUBLIC
table/sequence ACL before exact runtime grants, creates future table/sequence
objects in both databases, and proves zero PUBLIC ACL plus exact preflight.
`PUBLIC TRUNCATE` remains a separate fail-before-mutation and post-bootstrap
preflight contamination.

Final focused results:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs tests/postgres-role-isolation.test.cjs --runInBand
# 2 suites, 9 tests passed

pnpm exec jest tests/newsletter.subscription.test.cjs --runInBand --testNamePattern='production Listmonk boundary'
# 10 focused tests passed; 51 unrelated skipped
```

`bash -n`, Prettier and `git diff --check` passed. The runbook now explains
`pg_shdepend`/two-sided membership inventory and exact owner-run cleanup. No
full suite/build was run; root owns final acceptance.

## P1 global PUBLIC default ACL remediation

Focused RED/GREEN command:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs --runInBand --testNamePattern='rejects owned objects'
```

The first RED contaminated only the owner-global table default. Preflight
returned `status=0` for `global future PUBLIC table ACL` instead of `3`, proving
that its inner `pg_namespace` join ignored `defaclnamespace = 0`. The second RED
gave bootstrap global PUBLIC SELECT on tables, USAGE on sequences and EXECUTE
on functions in both databases. After the old schema-scoped cleanup, the
hand-calculated effective global ACL count was `3` instead of `0`.

GREEN adds owner-global REVOKE statements without `IN SCHEMA`, retains the
schema-scoped cleanup for additive per-schema defaults, and makes preflight
evaluate both explicit global/scoped ACLs and `acldefault(...)` when a global
row is absent. The disposable PostgreSQL 17 proof creates a future table,
sequence and SQL function in both databases, proves no PUBLIC ACL, and passes
the exact role preflight. It separately reintroduces global PUBLIC table,
sequence and function defaults and proves each preflight rejection.

Final focused result:

```text
pnpm exec jest tests/postgres-role-isolation.execution.test.cjs tests/postgres-role-isolation.test.cjs --runInBand
# 2 suites, 9 tests passed
```

`bash -n`, Prettier and `git diff --check` passed. No full suite/build was run;
root owns final acceptance.

# Risks / Follow-ups

- Repository changes do not claim the split is deployed. The owner must deliver Compose/env/scripts, take a pre-split backup using the prior compatible script, run role bootstrap, run `migrate-mastra-storage.sh --copy-existing`, pass preflight, switch both runtime URLs, and take/prove a new backup. The permanent order is in `docs/operations/production-deploy.md`.
- Product-side `mastra_*` tables are deliberately retained. Rollback points `MASTRA_DATABASE_URL` at the product runtime URL so `disableInit` stays true, then returns the old image. Old-table cleanup is a later owner choice only after accepted recovery evidence.
- The owner must validate deployed Caddy/nginx composition excludes the exact relay path from ingress/access logging. Local nginx/caddy binaries were unavailable; no host config was touched.
- Collector outage remains bounded and returns first-party `202`; no live collector/network test was made.

Branch/base/implementation head at return: `codex/remaining-infrastructure` / `07170871a4c6228e008d59319ac786a6171d66ee` / `2e5d157ee8c20fbf1ebda17ebf5303592c8c6d83`. Cleanup is `pending` for root acceptance.

# Orchestrator acceptance

Root previously accepted completion event
`4de39e95-23b9-40a8-8c48-90cc0fc6f975`, resolving review
`8b1c158d-0c79-482e-bdd2-77d92ccd1c9c`. Completion
`d37e68f2-2c1e-4ed5-85ad-eee0150993fb` then returned the exact
table/sequence/function boundary; `d032bc0a-69fc-48f2-b903-5c95cffbe298`
returned comprehensive ownership, membership and PUBLIC ACL coverage. This
correction resolves the final global-default gap and awaits root re-acceptance.
The remaining actions above are explicit owner-run deployment steps; no live
system or credential was touched.
