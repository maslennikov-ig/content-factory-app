---
schema_version: orchestration-artifact/v3
task_id: content-factory-next-ry5.2.backend
stage_id: content-factory-next-ry5.2
stage_manifest: .codex/stages/content-factory-next-ry5.2/stage-manifest.json
stream_owner: newsletter_backend
repo: content-factory-next
branch: work/newsletter-subscription
base_branch: main
base_commit: 04f9f6d7dfc137e6b960b629f86a59c38b980d01
worktree: /tmp/cf-newsletter
orchestration_level: inner_loop
scope_kind: product_slice
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Root accepted the delivered files and focused evidence after the required v6.2.0 neutral-name correction. Review corrections were then applied in the same owned stream. Temporary Compose placeholder symlinks were removed; no container, image, database, network, volume, production host, push, or deployment was touched.
risk_level: high
verification_tier: inner_loop
risk_tags:
  - auth
  - consent
  - external-data
  - backup-restore
  - reverse-proxy
affected_surfaces:
  - api
  - backend
  - production-compose
  - nginx
  - operations-docs
invariants:
  - consent-default-false
  - new-account-only-side-effect
  - double-opt-in
  - no-beehiiv
  - private-admin-api
  - optional-listmonk-recovery
verification:
  - TDD RED on Node 22.23.2 failed 14 of 22 tests for missing boolean validation, LOCAL consent, activation isolation, Listmonk failure semantics, double opt-in payload, Beehiiv removal, Compose, nginx, bootstrap, and backup integration.
  - Follow-up API/nginx RED failed 2 of 2 because the v6.2.0-required neutral name and quoted nginx UUID regex were absent.
  - Focused provider-without-consent RED failed 1 of 1 because the old auth path subscribed every new provider account.
  - Focused optional Listmonk backup/restore RED failed 2 of 2 because listmonk.dump and its distinct owner were absent.
  - Focused backup-wrapper RED failed 1 of 1 because cf-listmonk was not quiesced.
  - Focused GREEN passed 4 suites and 58 tests covering newsletter, bootstrap stubs, backup, restore, and writer quiescing.
  - Adjacent auth regression passed 2 suites and 27 tests for approval and Telegram auth flows.
  - Final focused acceptance passed 8 suites and 126 tests, including backup contract, external-provider purge, and adjacent auth regressions.
  - Review RED failed 2 of 2 because nginx `^~` made UUID regex routes unreachable and the backup wrapper required a pre-existing cf-listmonk container; the exact GREEN passed 2 of 2 after precedence and optional-service fixes.
  - Security/correctness RED failed 12 targeted tests for silent 409 handling, unsafe/partial Listmonk configuration, shared owner secrets in cf-app, unsafe existing-role privileges, and unverified GitHub email selection.
  - Review GREEN passed 12 of 12 targeted tests; after the membership/password corrections the final Node 22.23.2 focused acceptance passed 8 suites and 111 tests covering newsletter/auth, GitHub verified e-mail selection, bootstrap stubs, backup, restore, and writer quiescing.
  - Integration-gap RED passed the split-env identity assertion and failed the bootstrap membership assertion (1 passed, 1 failed); the exact GREEN passed both targeted tests on Node 22.23.2.
  - docker compose config passed with deploy/production/env.example and app.env.example placeholders; no service was started and no image was pulled.
  - bash -n passed for bootstrap, backup wrapper, dump, restore, and disposable proof scripts.
  - git diff --check passed.
  - `pnpm run docs:check` passed all 68 checked documentation files after the root-owned runbook update.
changed_files:
  - .env.example
  - apps/backend/src/services/auth/auth.service.ts
  - apps/backend/src/services/auth/providers/github.provider.ts
  - deploy/production/backup/run-postgres-backup.sh
  - deploy/production/app.env.example
  - deploy/production/bootstrap-listmonk-db.sh
  - deploy/production/docker-compose.yaml
  - deploy/production/env.example
  - docs/README.md
  - docs/operations/newsletter.md
  - docs/operations/outbound-connections.md
  - docs/operations/postgres-backup.md
  - docs/operations/production-deploy.md
  - libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts
  - libraries/nestjs-libraries/src/newsletter/newsletter.service.ts
  - libraries/nestjs-libraries/src/newsletter/providers.ts
  - libraries/nestjs-libraries/src/newsletter/providers/beehiiv.provider.ts (deleted)
  - libraries/nestjs-libraries/src/newsletter/providers/listmonk.provider.ts
  - scripts/operations/postgres-backup-restore.sh
  - scripts/operations/postgres-backup.sh
  - scripts/operations/verify-postgres-backup-restore.sh
  - tests/newsletter.subscription.test.cjs
  - tests/github.verified-email.test.cjs
  - tests/postgres-backup.execution.test.cjs
  - tests/postgres-backup.restore.execution.test.cjs
  - tests/postgres-backup.wrapper.execution.test.cjs
  - var/docker/nginx.conf
  - .codex/stages/content-factory-next-ry5.2/artifacts/backend.md
explicit_defers:
  - content-factory-next-ry5.2.1 - durable retry after a transient internal Listmonk failure; adding persistence or a versioned workflow is a separate data/workflow decision.
  - Product runtime-role separation is blocked on an explicit Mastra schema-ownership decision. The pinned `@mastra/pg` runtime performs CREATE/ALTER/function/trigger DDL during initialization, so CONNECT/USAGE/DML/default grants are insufficient and granting broad schema ownership would not be the requested least-privilege boundary.
  - Real SMTP, double-opt-in mail, UUID confirmation/unsubscribe, least-privilege API role, and campaign delivery require owner configuration on the host.
  - The 384 MiB Listmonk ceiling is a reversible host-safety choice without an official vendor minimum and needs observation during a real test campaign.
---

# Summary

The backend now accepts only an optional boolean `subscribeToNewsletter` and
requests newsletter membership only after a new LOCAL or provider account has
been persisted with the value exactly `true`. Returning sign-in and later
product activation never create newsletter consent. A Listmonk failure cannot
roll back the account and logs one fixed message without the address.

The provider posts only e-mail, the fixed non-personal name required by
Listmonk v6.2.0, enabled status, one list id, and
`preconfirm_subscriptions: false`. It sends no welcome `/api/tx`. On HTTP 409,
it uses v6.2.0's internal public subscription endpoint with the target list
UUID; Listmonk then restores an existing or unsubscribed membership to the
double-opt-in flow instead of silently treating a possibly unsubscribed member
as success. Other HTTP failures reach the safe auth boundary. Both requests
have a 10-second timeout and reject redirects. The provider refuses every
origin except `http://cf-listmonk:9000`, non-positive or unsafe list ids,
invalid list UUIDs, and empty writer credentials before any network call.
Beehiiv selection and implementation were removed, so a stale Beehiiv key
cannot send an address outside the host.

Production Compose pins `listmonk/listmonk:v6.2.0`, uses the tagged install /
upgrade / run sequence, keeps Listmonk on the private network without ports,
and reuses `cf-postgres` through a separate role and database. `cf-app` reads a
separate `app.env`; the Listmonk database and Super Admin secrets remain only
in Compose owner configuration and never enter the application container. A
focused contract keeps the main PostgreSQL user, password placeholder and
database name identical between the owner settings and application URL. The
owner-run bootstrap is idempotent, validates identifiers and existing
ownership, rejects pre-existing roles with elevated direct flags or any
`pg_auth_members` membership (including inherited/SET ROLE paths), and keeps
the role password out of host argv/stdin. Nginx exposes only UUID
confirmation/unsubscribe paths plus static assets under `/newsletter`; its
plain-prefix fallback allows the exact UUID regex locations to win while
returning 404 for admin, API, e-mail form, export, and wipe routes.

Backup now discovers the optional Listmonk database and role from the
PostgreSQL container, writes a checksummed `listmonk.dump`, records both in the
manifest, restores the database under its own recovered role, and refuses
collisions, incomplete identity, an unchecksummed dump, dirty targets, and role
conflicts before mutation. The wrapper always quiesces `cf-app` and
`cf-temporal`; it quiesces and restores `cf-listmonk` only when that optional
service exists and is running, so installations predating Listmonk keep their
nightly backup path.

# Backend path and failure semantics

Entry remains DTO -> auth controller (unchanged) -> `AuthService` -> existing
organization persistence. The newsletter call sits after successful
`createOrgAndUser`, not inside repository/transaction helpers. This makes the
consent decision local to new-account domain behavior and keeps persistence
semantics explicit: account creation wins, newsletter delivery is a best-effort
side effect, and Listmonk owns unconfirmed/confirmed/unsubscribed membership.

No Prisma schema/table, auth permission, controller response, Temporal
contract, or existing-client required field changed. Missing consent remains
backward compatible and behaves as false.

The fixed `Content Factory subscriber` name is an explicit compatibility
exception to the original no-name plan: official v6.2.0 rejects a subscriber
without `name`. It neither copies the e-mail nor collects a user's real name,
so the minimum-personal-data boundary remains intact.

GitHub's documented e-mail response marks both `verified` and `primary`.
Provider registration now chooses a verified primary address, falls back to
another verified address, and rejects the provider result when none is
verified. The prior first-array-entry behavior could persist an unverified
address and is no longer used.

# Operator handoff

`docs/operations/newsletter.md` is the complete owner path: generate secrets,
run the separate DB bootstrap, start only after bootstrap, configure admin over
a temporary loopback-only port plus SSH tunnel, set Root URL under
`/newsletter`, configure SMTP and a double-opt-in list, create a least-privilege
API token, require `{{ UnsubscribeURL }}`, remove the temporary port, and verify
404 boundaries. Environment templates contain only placeholders.

# Verification and residual risk

No full suite/build was run because final acceptance is root-owned. The real
Docker PostgreSQL proof was intentionally not run: the task prohibited starting
or pulling containers. `nginx -t` was unavailable locally, so proxy syntax is
covered by the focused location-precedence contract and final runtime
verification remains with the owner/root. The documentation checker passed.

# Risks / Follow-ups

- Root owns full-suite/build and final release acceptance.
- A dedicated product application role was not shipped: `PostgresStore.init()`
  performs runtime DDL, including table/index creation, function replacement,
  triggers and migrations. The safe follow-up must either disable runtime init
  and add an owner-run Mastra DDL/migration path, or isolate Mastra in its own
  database/role. Granting application schema ownership here would disguise,
  not solve, the privilege boundary.
- This limitation is tracked as `content-factory-next-ry5.2.2`; the current
  `app.env` split keeps Listmonk DB/admin secrets out of the application file
  but is not claimed as PostgreSQL privilege isolation.
- Owner must perform real SMTP, UUID page, campaign-template, backup recovery,
  and memory checks before production use.
- Durable delivery retry remains an explicit separate storage/workflow choice;
  the current bounded behavior preserves account creation and emits a generic
  operator error without leaking the address.
