# Auxiliary tooling support boundaries

Status: `runbook`. Source inventory reviewed 2026-10-11.

| Retained target | Exact current source consumer | Acceptance boundary |
| --- | --- | --- |
| SDK `apps/sdk` | root `publish-sdk` script; SDK README documents package consumers | Standalone client package excluded by name/reason in the core build coverage guard; explicit SDK `build` and `typecheck`, no package publication authorized by a core build |
| Commands `apps/commands` | root `build` and `commands:build:development`; operational task registry | Compiled offline help/config proof and normal graph/task checks; service readiness stays separate |
| Extension `apps/extension` | root `dev`, `build:extension`; extension manifest and cookie-auth routes | Explicit extension build/archive/browser checks; core `build` excludes it and does not accept it |
| `Jenkins/Build.Jenkinsfile` and `BuildPR.Jenkinsfile` | Optional external Jenkins SCM job paths; no repository workflow invokes them | Agent must already provide Node 22.23.2, pnpm 10.6.1, curl and unzip; exact versions fail closed; no Jenkins execution or external-job absence inferred |
| `var/docker/docker-build.sh` / `Dockerfile.dev` | root `docker-build`, `docker-create`; `.devcontainer/devcontainer.json` consumes second image tag | Single existing Dockerfile stage builds both local tags; fake-command proof covers selectors/failure only, not a real Docker build |
| `MastodonCustomProvider` / commented registry construction | inherits Mastodon provider; `mastodon-custom` remains recognized by platform families/assets and historic data | Retained as compatibility source, registry stays disabled; no automatic row deletion or new provider support |

Both Jenkins files retain their SonarQube and PR/commit analysis flows and use a
frozen install. Provision the pinned tools on their agents before enabling a
job; the pipeline no longer installs drifting Node 20/pnpm 8 system packages.
Jenkins access and execution are outside this local change. Repository CI is
`.github/workflows/build.yml`: core build, full-suite, time-travel, and dedicated
Docker proofs. These definitions alone are not proof that remote jobs ran.

The local Docker helper no longer asks a single-stage Dockerfile for nonexistent
`dist`/`devcontainer` stages. It builds `localhost/content-factory` and tags that
same output `localhost/content-factory-devcontainer`, preserving both local
consumers. It does not pre-delete an existing image, mutate persistent volumes,
or alter the local database confirmation guard. Production image/release and
`cf-cj4_postgres-volume` are outside this helper's change.

Owner-controlled read-only production aggregates on 2026-10-11 17:00 UTC found
94 organizations and 68 Telegram integrations (2 enabled, 66 disabled), no
persisted `mastodon`/`mastodon-custom` rows even including deleted/disabled rows.
The namespace had running `digestEmailWorkflow` and `sendEmailWorkflowV2` types;
`RUN_CRON=false`, `EXTENSION_ID` unset. These observations do not prove absence
of external Jenkins consumers or historical workflow events. Custom Mastodon,
versioned Temporal source, the flat refresh-token alias, legacy encrypted/JWT
readers, hidden routes and donor license notices remain retained. No dormant
provider/version source was deleted or activated.

## Disposable PostgreSQL role fixtures

`tests/postgres-role-isolation.execution.test.cjs` labels each owned container
with its producer and a fresh owner UUID, records the full returned container
ID, and tears down that exact ID with `docker rm --force --volumes`. Cleanup
requires matching ID, producer, owner, fixture image and data mount. It never
selects by a name prefix, prunes resources, or removes a named persistent volume.
Success, assertion failure, SIGINT/SIGTERM and normal process exit share cleanup.

SIGKILL or host failure cannot run process handlers. Inspect the exact remaining
fixture ID and its `ru.content-factory.test-owner` label, then pass both to the
bounded recovery path:

```bash
node tests/helpers/postgres-role-fixture.cjs FULL_64_HEX_CONTAINER_ID OWNER_UUID
```

This path verifies ownership again before deletion and rejects foreign labels,
mounts, IDs or an uncertain daemon error. Unknown historical volumes stay
untouched. If the container has already been manually removed, this path has no
container ownership proof for an orphaned volume and does not delete that volume.
