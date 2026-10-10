# Content Factory delivery preflight — 10 October 2026

Read-only procedure and evidence map for the release that may follow root acceptance of `dbxe.21`. The source/tracker baseline was captured at 2026-10-10 17:44 UTC on private checkout `codex/audit-readiness-20261009` at `a30a6d997d009222ac67554873bdeec7b8ad9891`. A follow-up read-only host capture ran at 17:49–17:51 UTC. Root acceptance of `dbxe.21` and the eventual exact-SHA release candidate remain separate gates; this report does not claim to describe that final SHA. No suite, build, database query, migration, push, image operation, or deployment was run.

## Source and tracker boundaries

- The private checkout has only `origin = git@github.com:maslennikov-ig/content-factory-next.git`. Do not add the public repository as a remote or push this checkout's history there. The repository contract assigns ordinary commits/pushes to the private `origin` and the public copy to the separate clone.
- `/home/me/code/content-factory-app` is on `main` at `cae3cd8340e06058365a9c9adca8194858abbb12`, with `origin = git@github.com:maslennikov-ig/content-factory-app.git`. At initial capture it had a clean tracked worktree and index, and zero non-ignored untracked files. It is still the old public tree; it has not received `dbxe.21`.
- The public clone has three ignored entries, now inventoried without reading their contents. `.gitignore` and release scripts identify all three as generated release artifacts, not user data. `prepare-public-tree.sh --update` checks ordinary Git dirt, then runs `rsync --archive --delete --exclude='.git/'`: it removes the old source archive/manifest; the subsequent `make-source-archive.sh` regenerates them from the prepared public commit. It carries `suite-receipt.json` only when the private receipt covers the exact private source SHA; otherwise the old receipt is removed. The existing public receipt contents and coverage were not read, so it is not current release evidence. No entry was deleted or changed.

  | Ignored path in public clone | Type, size, owner:group | Classification and refresh treatment |
  | --- | --- | --- |
  | `var/release/suite-receipt.json` | regular file, 369 bytes, `me:me` | generated suite receipt; copied only if the matching private receipt covers the prepared source SHA, otherwise removed |
  | `var/source/content-factory-source.tar.gz` | regular file, 12,485,122 bytes, `me:me` | generated corresponding-source archive; replaced by `make-source-archive.sh` after tree refresh |
  | `var/source/source.json` | regular file, 333 bytes, `me:me` | generated source manifest; replaced with its archive after tree refresh |

  Evidence: `git -C /home/me/code/content-factory-app ls-files --others --ignored --exclude-standard -z`, followed by metadata-only `lstat` of each path; `.gitignore`, `scripts/release/record-suite-receipt.sh`, `scripts/release/make-source-archive.sh`, and `scripts/operations/prepare-public-tree.sh`. No contents were read. `--update` has a known generated-artifact effect, not a user-data preservation blocker.
- `bd show dbxe.8` reports `IN_PROGRESS`. Its original next full exact-SHA release acceptance remains required before `.8` closes; the epic also remains open. The accepted dependency-stage receipt is local evidence, not this release gate.

The dependency stage at `.codex/stages/content-factory-next-dbxe-dependencies-stage/outcome.md` and its accepted review preserve 160 critical/high decisions. The minimum patches eliminated 120 of 143 original production critical/high range records; the current production graph still records 2 critical and 21 high, while the graph including shipped development tools records 5 critical and 21 high. The extra three critical matches are dormant Vitest UI/Tinypool surfaces. These are advisory-range matches with documented caller/platform exceptions and reevaluation triggers, not confirmed exploited application paths. Examples include Linux-inapplicable Windows-only Next cases, no current `next/og`/`ImageResponse`/custom-server/remotePatterns consumer, Happy DOM with no untrusted-code execution, and `tar` limited to native installer archives rather than customer archives. The system-`zip` extension packaging command failure remains recorded; the separate ZIP integrity check does not turn that command into a pass. Local dependency/build/test acceptance does not satisfy `.8`'s original next-release gate.

## Documented release order

The controlling local sequence is `docs/operations/production-deploy.md`, “Обновление версии” (around lines 2579–2655), plus the schema and post-deploy sections. After root has committed and accepted the final exact source SHA:

1. Run the release acceptance on that exact private SHA: `pnpm run build`, `scripts/release/record-suite-receipt.sh` (the single `pnpm test` invocation and SHA-bound receipt; read all three halves: Jest, `node --test`, Python), `git diff --check`, and `scripts/orchestration/run_process_verification.sh`. The receipt script refuses a tree that differs from `HEAD`. Do not run a duplicate full suite or reuse a receipt from an earlier SHA.
2. Before any private push, fetch the private remote and prove the target branch is not ahead/diverged; keep the public remote out of this checkout. Refresh the separate public clone only after resolving its three ignored entries:

   ```bash
   ./scripts/operations/prepare-public-tree.sh --update /home/me/code/content-factory-app
   cd /home/me/code/content-factory-app
   git add -A && git commit -F .git/PREPARE_PUBLIC_COMMIT_MSG && git push origin main
   ```

   Preserve the generated `Source-Commit` trailer. Fetch/check the public clone's `origin/main` before its push too. `--update` copies from the private index, holds back `.codex/stages/*/**/evidence/**`, and deletes removed paths; the public clone is an output directory, not a place to edit product source.
3. Build only from the prepared public clone, tagging with its short commit SHA. The documented order is `scripts/release/make-source-archive.sh`, `scripts/release/build-local-image.sh <tag> --min-free-gib <measured-headroom>`, `scripts/release/verify-nginx-config.sh content-factory-next:<tag>`, then the no-write `apps/commands/.../main.js --help` check against the existing test DB/Redis. The 12 GiB figure in the runbook is an example, not a measurement. The image package remains `ghcr.io/maslennikov-ig/content-factory-next`.
4. Publish with `scripts/release/push-image.sh <tag>`; it requires the SHA-bound suite receipt and performs local and registry image-weight checks (registry growth limit defaults to 25%). Record the returned digest. Stage the exact image on the documented target with `CF_DEPLOY_HOST=helixa-prod scripts/release/pull-image-on-host.sh <tag> <digest>`; that script checks host disk/inodes and digest but does not switch the running app.
5. Resolve schema and live Temporal gates below before `CF_DEPLOY_HOST=helixa-prod scripts/release/switch-host-image.sh <tag>`. The switch backs up `.env` and `app.env`, changes `CF_IMAGE` and `CONTENT_FACTORY_RELEASE` together, restarts only `cf-app`, waits for healthy, and checks the actual running image and release marker.
6. Run the runbook's post-deploy checks: `/api/`, `/auth/login`, and `/api/public/source` return 200; verify the app health and deployed marker. Avoid saving raw application logs in this preflight because they can contain private data. Keep the verified previous image/config available until these checks pass. Only then may the standing retention script run, with the verified rollback tag explicitly supplied; it is scoped to our release tags and release config backups, never other containers, volumes, or live config files.

## Pending Post journal schema

The `.6` local acceptance and [publishing review](../content-factory-next-dbxe-publishing-stage/review/review.md) leave one production schema change unapplied. Exact saved SQL in `schema-diff.local.sql` (ignored local evidence) and [publication-journal-v106-schema-apply.sql](../../../docs/operations/publication-journal-v106-schema-apply.sql):

```sql
ALTER TABLE "Post" ADD COLUMN "publicationJournal" JSONB;
```

It is nullable/additive. Its disposable-schema check proves only that the selected statement preserved fixture data and left the new journal null; it is not a production migration receipt. The live candidate image must regenerate the full diff before switching, using the runbook's one-shot container on `content-factory-next_internal`:

```bash
docker run --rm --network content-factory-next_internal \
  --env-file /tmp/cf-schema/db.env -v /tmp/cf-schema:/out \
  --entrypoint sh <candidate-image> -c 'cd /app && npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
    --script --exit-code > /out/cf-prisma-diff.sql'

/srv/content-factory-next/scripts/operations/postgres-backup.sh

docker run --rm -v /tmp/cf-schema:/out --entrypoint sh <candidate-image> -c \
  'cd /app && node scripts/operations/validate-prisma-migration-sql.cjs \
     --mode update \
     --diff /out/cf-prisma-diff.sql \
     --selected /out/cf-prisma-selected.sql \
     --allow-table Post'

docker cp /tmp/cf-schema/cf-prisma-selected.sql \
  cf-next-postgres:/tmp/cf-prisma-selected.checked.sql \
  && docker compose exec -T cf-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
       -v ON_ERROR_STOP=1 --single-transaction \
       --file /tmp/cf-prisma-selected.checked.sql
```

The production credential belongs in the restricted temporary `db.env` generated from `app.env`; do not print or copy it into this report. Select only exact current additive statements. For this column, use `--allow-table Post` only if the fresh full diff and selected file contain exactly the reviewed change. Then verify the `mastra_*` table count is unchanged and the candidate's post-switch `migrate diff` is empty. Any additional, destructive, or type-changing diff stops this path and needs its own migration plan. Never use `prisma db push` on the deployed database.

The `schema-preflight.sh <tag>` path is for a genuinely empty diff; it uses an existing verified `CF_SCHEMA_ENGINE_PATH`, makes no pull, and fails closed. It does not apply the pending journal column. On rollback, keep the nullable column and journal data. Do not return a Post with an unresolved pending claim to an old writer that ignores the journal; recovery requires authoritative receipt reconciliation.

## Temporal and consumer migration boundary

The current [periodic history guide](../../../docs/operations/periodic-workflow-history.md) and `dbxe.20` outcome are the newest local consumer evidence. New starts use `autoPostWorkflowV2` under `autopost-${id}`, `autoPostDraftV3Workflow` under `autopost-draft-v2-${id}`, `missingPostWorkflowV109` under the stable ID `missing-post-workflow-v108`, and `sendEmailWorkflowV3` under `send_email_v2`. Recovery and email use `USE_EXISTING`; IDs are deliberately preserved. Existing V2 mail can receive a new signal and continue as V2. Existing workflow histories are not replaced or cancelled by this code. AutoPost disable/delete still targets its existing workflow ID.

The `.6` V106 path preserves V101–V105 histories and old recovery histories; repeat children from an old history keep their old type. V106 claims and confirmed receipts live in `Post.publicationJournal`. The future-release procedure in [publication-recovery-v106.md](../../../docs/operations/publication-recovery-v106.md) still uses “V108” for the recovery service/ID, while current code registers V109 under the preserved V108 ID. Reconcile type-versus-ID wording before executing any manual retirement/enable steps. The current periodic guide explicitly requires inspection of active types/IDs before a selected `.8` release; neither local fixtures nor `USE_EXISTING` proves live migration or safe retirement.

Before the release, collect only the requested live Temporal metadata: active workflow type, workflow ID, and counts. Do not fetch histories, inputs, or queue payloads; do not terminate, drain, signal, or restart workflows as part of this preflight. The inventory must guide a separate decision for old `missing-post-workflow`, V106/V107 and any V108/V109 execution, plus `send_email`/`send_email_v2` and active AutoPost IDs. The pending mail queue and publication state must remain intact through either release or rollback.

## Live host and Temporal checks — read-only capture

The runbook itself names the target in `docs/operations/production-deploy.md:11`: `CF_DEPLOY_HOST=helixa-prod scripts/release/switch-host-image.sh 4a8e57d96545`. `ssh -G helixa-prod` resolved that exact static alias to user `root` and a configured hostname; the address is omitted from this repository artifact because the host is shared and its address is intentionally not persisted here. A bounded `BatchMode=yes`, `ConnectTimeout=5` SSH to `helixa-prod` succeeded. No other host was tried. `CF_DEPLOY_HOST` being unset in the local shell did not mean the documented target was unavailable.

The read-only commands were `ssh -G helixa-prod | awk '$1 == "hostname" || $1 == "user" { print }'`, followed by `timeout 30s ssh -o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 helixa-prod 'sh -s'`. In that bounded session the checks were `df -P -h /`, `df -P -h /srv/content-factory-next`, `df -P -h /var/lib/docker`, `docker inspect cf-next-app`, `docker inspect cf-next-temporal`, `docker exec cf-next-temporal sh -c 'ss -ltn'`, and the installed CLI's `workflow list --help`.

At `2026-10-10T17:49:10Z`, read-only `df -P -h /`, `df -P -h /srv/content-factory-next`, and `df -P -h /var/lib/docker` each reported the same filesystem: 79G total, 45G used, 31G available, 60% used. `docker inspect cf-next-app` reported container ID `3d0effee1ab4dc018955e539c050c25834a0ae6d4fbb9d6fb27e1a1c6ec7d083`, image `ghcr.io/maslennikov-ig/content-factory-next:cae3cd8340e0`, image config ID `sha256:a70e865a332aeae3701bfabc5fbb97f9c9b1d04596ab64536fa3c8eef0e8a053`, state `running`, health `healthy`, start `2026-10-08T19:16:04.656007531Z`, and restart count `0`. This is current host evidence at the capture time, not an image for the pending release.

During the same 17:49–17:51 UTC follow-up window, a separate read-only inspect found `cf-next-temporal` running as container ID `5a91727c62c169428164ec5eda52536b3b901fb05b2426197d270719ac500179`, image `temporalio/auto-setup:1.28.1`, image config ID `sha256:2277dbccadde9f01a0ce2376661363e1a77056ee1b940a0be7e3f7c4dac05be1`, and restart count `0`. Docker inspect exposed no health field for this container, so this report makes no Temporal health claim. The installed `/usr/local/bin/temporal` reported `temporal version 0.0.0-DEV (Server 1.28.0, UI 2.39.0)`. Its local `workflow list --help` confirms `--query`, `--page-size`, `--limit`, and JSON output. The initial CLI default `127.0.0.1:7233` was refused because the service listens on its Docker-network interface; `ss -ltn` inside this exact container exposed the listener used for the successful query. No remote environment values or config-file contents were read; the local `CF_DEPLOY_HOST` check only established that it was unset.

At `2026-10-10T17:51:08Z`, the installed CLI ran `docker exec cf-next-temporal /usr/local/bin/temporal --disable-config-env --disable-config-file --address 172.24.0.5:7233 --namespace default --command-timeout 15s --log-level error --color never --output json workflow list --query 'ExecutionStatus="Running"' --page-size 1000 --limit 100000`. Its JSON was passed directly to an in-memory Python allowlist that emitted only workflow type, workflow ID, and counts; the raw JSON was not saved or shown. It returned two active executions:

| Workflow type | Workflow ID | Count |
| --- | --- | ---: |
| `digestEmailWorkflow` | `digest_email_workflow_<organization-id>` | 1 |
| `sendEmailWorkflowV2` | `send_email_v2` | 1 |

The query used the documented CLI and installed `--query` option; its syntax matches the repository's own `ExecutionStatus="Running"` filter in `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`. The live query used the Temporal listener discovered by `ss` inside `cf-next-temporal`, not a guessed host or endpoint. The server deployment and app example default to namespace `default`; the live app's environment was not read, so a runtime namespace override remains unverified. The inventory is conclusive for the queried namespace only. No workflow history, inputs, queue payloads, database rows, remote environment values, or tokens were read; no workflow was signalled, stopped, drained, or changed.

This live observation shows one pre-existing `sendEmailWorkflowV2` history under `send_email_v2`. Current code may register V3 for that same ID with `USE_EXISTING`; an existing V2 history remains V2 and must continue without termination or replacement. No running AutoPost or missing-post workflows appeared in the queried default namespace at capture, but re-inventory before release and resolve any namespace override before treating that as a complete production inventory. Full sanitized metadata and capture times are in `observations.local.json` (ignored local metadata).

## Rollback and remaining owner steps

The live capture establishes `cae3cd8340e0` as the currently running image and the rollback candidate to verify/retain for the next switch. The runbook's `4a8e57d96545` rollback entry predates the currently running `cae3cd8340e0` image; do not reuse that older entry as the next rollback target without fresh host verification. If health or version-marker checks fail, follow the runbook rollback procedure with the exact verified prior image; preserve the added journal column/data and all active Temporal workflow histories/queues. Do not run host retention until release verification passes. The measured build/headroom checks and host baseline must be refreshed immediately before their respective steps; this report is not deployment authorization evidence or a current snapshot after `dbxe.21` root acceptance.

Root still needs to complete and accept `dbxe.21`, run the exact-SHA release gate required by `dbxe.8`, refresh and publish the prepared public tree through its documented sequence, check remote ancestry before each push, regenerate and validate the live schema diff, and reconcile the observed Temporal V2 execution plus the unverified live namespace override. Before switching, refresh disk/image/health and workflow metadata, then retain `cae3cd8340e0` only after confirming it is still the running rollback image. No push, public-tree refresh, build, provider call, SQL application, workflow action, deployment, or cleanup is covered by this read-only preflight.

## Root acceptance of the read-only stream

Delivered and accepted by root on 10 October 2026 after reading the report and
sanitized observation JSON. Accepted as preparation at baseline a30a6d997d00,
not final candidate/release acceptance. Current host, generated public artifacts
and two legacy workflow types are useful verified inputs; namespace completeness
and exact candidate gates stay open. The live organization-bearing workflow ID
is redacted here and remains only in ignored local metadata. No extra worktree,
fixture container or process was created by this child; no cleanup is needed.
All source, tracker, release and host mutations stay root-owned.
