# Toolset delivery for root acceptance

Scope: dbxe.26/.27/.28/.36 only. Baseline `5cc169032a452b245f6e0423ceaf38cea719f169`.
Beads was read in the owner checkout; this stream does not close tasks.

- SDK: optional third constructor argument `{ httpErrors: 'throw' }`; exported typed HTTP error with status/code/body/raw-body/raw Retry-After/transient-status hint. Default documented 409 JSON and raw deletion Response remain compatible. No automatic retries or package publication.
- CLI: offline config/help/version route precedes lazy operational imports. `config:check --strict` opts into exit 1 for invalid config; default remains report/exit 0. Shared command/option metadata retains operational help text. Corrected existing package start entry from nonexistent singular `command` to actual compiled plural `commands`.
- Auxiliary source: exact local/CI/SDK/extension/provider inventory retained. Optional Jenkins requires preprovisioned exact supported tools and frozen install; external Jenkins use remains unknown. Single-stage local Docker build supplies both existing tags without nonexistent targets or pre-deletion. Custom Mastodon, historical workflows, compatibility readers/aliases/routes retained; owner aggregate is evidence only, not deletion authority.
- Disposable PG: exact returned container IDs plus per-run UUID/producer labels gate cleanup. `rm --force --volumes` removes owned anonymous volume. Foreign IDs/labels/mounts and uncertain daemon state are preserved. SIGINT/SIGTERM/exit cleanup and exact-ID/UUID manual recovery are bounded; no prune, persistent volume change, or unknown historical-volume deletion.

## Evidence

- `build-coverage-green.log`: 3 suites / 69 checks pass (build coverage, auxiliary helpers, existing local safety). SDK is explicitly excluded as a standalone package; automatic discovery and the strict equality/valid exclusion/duplicate guards remain intact. The core four-app selector is unchanged.
- `focused-acceptance.log`: 9 suites / 163 tests pass, including actual normal command graph and affected token/adaptation/local-command guards. Existing graph fixture is graph proof only; its connection stand-in is not used as offline CLI evidence.
- `sdk-build.log`, `sdk-types.log`: own SDK tsup CommonJS/declarations and tsc pass.
- `sdk-compatibility.actual.json`: all five baseline/candidate public method signatures match. Actual compiled TypeScript consumer uses two-argument client, guarded unknown 409 and typed opt-in error. Genuine built SDK and compiled consumer pass legacy/opt-in 409 over an isolated loopback server. SDK source is unchanged; matching build/types receipts were reused after checking artifact SHA-256.
- `commands-build.log`, `commands-types.log`: own commands Nest compilation and tsc pass.
- `compiled-cli.actual.json`: actual compiled CLI with original-delegating socket/DNS observer; no Prisma connection substitution and no operational modules loaded. Strict valid/invalid, legacy invalid, help, version, parse error and leading-option validation covered.
- `package-cli-help.log`: actual package start resolves compiled entry and prints help.
- `extension-build.log`, `extension-archive.actual.json`: explicit Vite build and exact ZIP contents/CRC/manifest-v3 pass. No browser cookie/provider runtime acceptance inferred.
- `postgres-role-execution.log`: 4 real disposable PostgreSQL role-isolation tests pass.
- `postgres-cleanup.actual.json`: real success/failure/SIGTERM/exact-ID-owner recovery; foreign container/volume inventory identical before/after; synthetic foreign sentinel preserved during cases, then exact-owned sentinel cleanup. Persistent `cf-cj4_postgres-volume` preserved.
- `docs-check.log`: 194 durable documentation files checked; `git diff --check` clean.
- `source-inventory.json`: graph-reviewed; borrowed owner graph baseline explicitly older, exact current sources confirmed. No graph refresh/hooks/query logging/external backend.

SDK/CLI initial red reproductions remain in `sdk-red.log` and `cli-red.log`.
`focused-before-fixture-repair.log` records a test-fixture prerequisite failure
(local unzip absent); the isolated Jenkins test now supplies fake curl/unzip
executables and tests the exact version-gate shell without network or installs.

No full suite, push, deploy, provider call, secret wiring, customer row write or
package publish was performed. Root owns integration, final acceptance, task
status and central handoff. No technical defer introduced by this stream; live
Jenkins/Docker image/extension/provider behavior remains explicitly unverified.
