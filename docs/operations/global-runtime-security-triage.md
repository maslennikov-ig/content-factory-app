# Global runtime tool security — dbxe.34

Scope: final Content Factory image globals, outside `/app`. The application
dependency decisions remain in [dependency remediation](dependency-security-remediation.md),
and OS/native decisions in [OS triage](os-runtime-security-triage.md). Beads owns
status; original criteria are preserved in the stage baseline.

## Consumers and selected change

Serving755d had npm10.9.8, pnpm10.6.1 and PM2 7.0.3 outside the product lockfile:
378 package manifests and51 Critical/High scanner records. All51 match actual
installed name/version/path tuples. These are advisory records, not51 distinct
defects or evidence of an incident.

The entrypoint starts PM2 directly; all three roles are native Node forks. The
health/readiness and release helpers need no global package manager. The
documented runtime package-manager consumers were bootstrap (`pnpm exec`) and
schema update (`npx`) `migrate diff` commands. Both now use the direct native CLI.
Four older migration runbooks also use that installed CLI; their schema/guard
instructions stay unchanged. The dated quoted example keeps its historical
command with an explicit current invocation immediately above it.

| Tool | Selected runtime behavior | Compatibility evidence |
| --- | --- | --- |
| npm10.9.8 | Remove npm/npx and their global dependency graph/install cache. | No entrypoint, application, health or release consumer; runtime installs are not an operational procedure. |
| pnpm10.6.1 | Stop installing it in the final stage. | Replace bootstrap/update wrappers with the existing installed Prisma6.5 Node CLI; no package-manager version switching at runtime. |
| Corepack0.34.6 / base Yarn1.22.22 | Remove unused package-manager launchers and packages. | No configured runtime/operator consumer; developer/builder convention is unchanged. |
| PM2 7.0.3 | Keep exact supervisor version and existing native configuration. | Startup, process list, automatic restart, operator restart and graceful shutdown exercised without package managers. |
| PM2 js-yaml4.3.0 | Replace its direct pin with same-major4.3.2. | PM2's YAML reader still works; the official two affected ranges are covered. |
| Prisma6.5 schema engine | Ship its matching native engine, SHA256 `431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2`. | Offline real bootstrap SQL passes the unchanged guard; equal-schema diff exits0. No SQL is applied by this check. |

The older image lacked the Prisma schema engine; this is a preexisting operator
CLI limitation, revealed by the controlled offline fixture. Existing release
preflight used an independently verified mounted engine and remains unchanged.
The builder now runs the installed Prisma package's own engine postinstall and
checks the same known checksum. No Prisma version or schema change is involved.

Builder Node22.23.2/pnpm10.6.1, developer `packageManager`, application lockfile,
Temporal contracts, memory caps and supervisor flags stay unchanged. This audit
does not certify arbitrary external manifests, packages, PM2 modules or runtime
install commands. Build input is the reviewed repository/frozen lock; revisiting
developer/build package-manager policy is a separate scope if those inputs or
the build trust model change.

## Retained findings and triggers

| Advisory / installed dependency | Actual caller and current gate | Required reevaluation |
| --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), braces3.0.3; no published fixed range | PM2 → chokidar3.6.0 → braces, processing watch globs. All three configured roles have watch disabled; no product/user text reaches supervisor patterns. | Before enabling watch or accepting an untrusted PM2 pattern/configuration, inspect the upstream fix or choose a compatible supported graph. |
| [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r), basic-ftp5.3.1; fixed6.2.1 is outside the current parent range | PM2 monitoring agent → proxy-agent → PAC reader → get-uri FTP directory listing. No PM2 keys, monitoring modules or upper/lower proxy variables; agent/automation disabled. `pm2 serve --ftp` is unrelated HTTP listing. | Before enabling agent/PAC/FTP retrieval, update the compatible caller graph and test it. Do not force a transitive major beneath get-uri's5.x range. |

These packages are retained visibly, not called patched. Rebuilds must inventory
the actual PM2 graph because global installs do not use the application lock.
The exact source, package manifests, primary advisory matrix, controlled
fixtures, final scan and delivery receipts live in
`.codex/stages/content-factory-next-dbxe-global-runtime-stage/`.

Local fixture proof and the final release have separate receipts. Closure
requires configured exact-source release checks and current serving native,
source/archive, schema/Mastra and rollback proof. An old receipt or HTTP200
alone does not establish that this runtime change was delivered.

## Accepted delivery — 11 October 2026

Private release source `92f784757329f041fbf34de0dba0f0d9406a9680` passed all nine
configured exact-source release checks. Full suite:647 Jest suites/11946 tests,
123 Node tests and50 Python tests; existing skips are recorded separately.
Public copied source `2a53727594a13c15c8740af0686ebffb40d34bfd` produced the image
`ghcr.io/maslennikov-ig/content-factory-next:2a53727594a1`; source archive, registry
weight/capacity, native PM2/Prisma and live process checks passed.

Final scanner and fresh official npm advisory response agree: zero global
Critical findings, two High findings retained as above. Of51 baseline records,
47 were removed with unused runtime tools and two were patched with js-yaml4.3.2.
Live checks confirm all three roles have watch/monitoring disabled, no PM2
keys/modules or proxy variables, and the matching Prisma schema engine.

After switch and scoped retention, production is healthy with zero restarts and
the1792MiB cap. Native workers, API, login and source/archive respond correctly.
Both schema differences are empty; no SQL was applied. Product counts, all45
Mastra tables, the two existing periodic executions and21 other containers are
preserved. Verified rollback `755d19fa731d` is retained. Beads34 and8 are CLOSED;
the parent epic remains OPEN and the original criteria are unchanged.
