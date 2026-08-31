Target: Codex with write access to `/home/me/code/content-factory-next`, running in goal mode with subagents.
Audience: Manual handoff — a person starts this as a goal; the owner reviews the result before anything reaches the server.

Goal: Give the container back its memory headroom, and finish taking the product off other people's services. Two Beads epics: `content-factory-next-71m` (memory, six tasks) and `content-factory-next-ry5` (external services, nine tasks). Work the memory epic first — it is the one holding a production instance at the edge of its limit.

Success criteria:
- Ten branches off `main`, one commit each, named per task below, in the order given. Nothing pushed, nothing merged, nothing deployed.
- After every task, `pnpm test`, `pnpm run build`, `node scripts/branding/brand-scan.cjs` and `bash scripts/orchestration/run_process_verification.sh` are all green before the next task starts.
- For each memory task, the summed RSS inside the container is measured before and after, the same way the numbers below were measured, and the result is written down.
- No third-party address is added anywhere: a change that would add a row to `docs/operations/outbound-connections.md` is reported instead of made.
- The four blocked tasks named at the end are untouched, with the argument for each written down for the owner.
- Every commit says which model did the work.

Context:
- Read `AGENTS.md`, then `.codex/handoff.md`, then `docs/operations/outbound-connections.md`. Every task has a Beads issue carrying the detail: `bd show <id>`.
- The production instance runs from `deploy/production`; its container is at its memory limit, which is what makes the first epic urgent. The measured numbers are below and do not need re-deriving.
- Nine external integrations were switched off in code on 2026-08-16 rather than left to an absent environment variable. Each switch is a named constant or an unmounted component carrying its issue number.

## Which model for which task

Use the cheapest model that can do the job, and say in each commit which one did it.

- **Луна** — mechanical work with a known answer: editing documentation, moving a value into a config template, deleting a dead file, renaming a symbol, extending an allowlist. No design decisions.
- **Терра** — work that needs judgement inside one subsystem: changing how processes start, wiring a new container into compose, reading a library's source to pick a setting, splitting an import so a dependency stops being loaded.
- **Сол** — work where the design is not decided yet, where a mistake is expensive or hard to see: anything touching the Temporal worker lifecycle, anything that changes when a workflow runs, and the newsletter consent flow.

Per task below, the model is named. If a Луна task turns out to need judgement, stop and escalate it to Терра rather than guessing.

## Order and branches

One branch per task, one commit each, branch name given per task. After every task, all four gates must be green before the next task starts:

```
pnpm test
pnpm run build
node scripts/branding/brand-scan.cjs
bash scripts/orchestration/run_process_verification.sh
```

Never push. Never merge into `main`. Never deploy. Never touch the server.

## Measured facts you do not need to re-derive

Taken from the running production instance on 2026-08-16:

- Container limit 2 GiB. Before any change: 1.853 GiB used, 93%.
- Inside, RSS: orchestrator 1 344 252 KB with 119 threads; backend 380 600 KB with 20 threads; `next-server` 99 384 KB; three `node /usr/local/bin/pnpm` at ~61 MB each; PM2 daemon 50 MB; `pm2 logs --raw` as PID 1 at 36 MB; two `dotenv` wrappers at ~30 MB.
- `NODE_OPTIONS=--max-old-space-size=512` is applied to the orchestrator, so its JS heap is capped at 512 MB while RSS is 1.34 GB. The bulk is native memory — the Rust core of the Temporal SDK.
- Not a leak: over 7 minutes the orchestrator's RSS moved by 4 KB. Memory is claimed at startup.
- The cause, and it is already fixed: `libraries/nestjs-libraries/src/temporal/temporal.module.ts` handed `workflowsPath` to all thirty-three workers, so each one built the workflow bundle and held a worker thread with its own V8 sandbox — about 40 MB apiece. Only `main` ever runs a workflow; the provider queues carry activity tasks only. Commit `03e17d27` gives the sandbox to `main` alone. Deployed and measured: orchestrator 1.34 GB → 455 MB, container 1.853 GiB → 1.108 GiB, with all thirty-three queues still listening and thirty-two of them logging "No workflows registered, not polling for workflow tasks", which is the intended state.
- The installed `@temporalio/worker` is **1.15.0**, not the 1.14 the range in `package.json` suggests, and `nestjs-temporal-core` 3.2.3 declares a peer range of `^1.12 || ^1.13`. The installed version is outside what the wrapper claims to support — worth a look of its own.
- `maxConcurrentActivityTaskExecutions: 1000000` costs almost no memory: in the Rust core it is a tokio semaphore, an O(1) counter, and the poller count is capped at ten regardless. It is still worth fixing, as unbounded concurrency rather than as a saving.
- `env_file` in `deploy/production/docker-compose.yaml` already places every variable in the container's environment: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` and `REDIS_URL` were all confirmed present. The `dotenv -e ../../.env` wrapper inside the image is therefore redundant; outside Docker it is not.

## Memory epic — `content-factory-next-71m`

### 1. `71m.1` — write down what the worker split now is — **Луна** — branch `codex/queue-doc`

`EXCLUDE_QUEUE` is no longer set anywhere: the workflow-sandbox fix made every queue cheap, so all of them are served again. Record the shape in `docs/operations/configuration.md` and in the channel section of `docs/operations/production-deploy.md`: `main` runs workflows, every provider queue runs activities only, and `EXCLUDE_QUEUE` exists for the multi-server case where a provider with a concurrency limit of one has to be pinned to a single server.

Keep the warning that goes with that variable, because the failure is silent: a queue nobody serves swallows that provider's posts — they wait rather than fail.

### 2. `71m.4` — stop paying for process wrappers — **Терра** — branch `codex/pm2-direct`

Three chains of `pm2 start pnpm -- start` → `pnpm` → `dotenv-cli` → `node` keep about 270 MB of parents resident. Replace them with a pm2 ecosystem file that starts `node` directly.

Requirements that must survive: the three applications keep their current names in pm2 (`frontend`, `backend`, `orchestrator`); logs still reach the container's stdout; the health check on `/api/` at port 5000 still passes; `NODE_OPTIONS` still applies; and running the apps outside Docker still works, where `dotenv-cli` is still needed because there is no `env_file` there.

Measure the result the same way it was measured: sum of RSS inside the container, before and after.

### 3. `71m.3` — tune the workers — **Сол** — branch `codex/temporal-worker-tuning`

Read the installed packages rather than recalling the API: `node_modules/@temporalio/worker` (1.14) and `node_modules/nestjs-temporal-core` (3.2). One worker carries workflows now, so this is about that one. Decide values for `maxCachedWorkflows` and `maxConcurrentWorkflowTaskExecutions` — the default cache works out at 295 slots from a 704 MiB heap limit, which is generous for a queue serving one organization. Leave `reuseV8Context` alone: turning it off doubles the thread count.

Then replace `maxConcurrentActivityTaskExecutions: 1000000` with a number that means something. It is not a memory question — it is that a backlog would let one worker take as many activities as the server offers, each holding a database connection and an outbound HTTP call.

A shared prebuilt bundle is no longer worth building: there is one workflow worker to give it to.

Cite file and line in `node_modules` for every claim about the API. Record memory before and after.

### 4. `71m.2` — already solved, close it — **Луна** — no branch

Lazy workers were the plan while `EXCLUDE_QUEUE` was the remedy. The sandbox fix removed the reason: every queue is served again and an idle provider worker now costs a poller rather than 40 MB. Verify against the running instance, then close the issue with that evidence rather than building the machinery.

### 5. `71m.5` — account for the backend's 380 MB — **Терра** — branch `codex/backend-memory`

Find what is loaded eagerly at boot: the module graph of `apps/backend/src/api/api.module.ts`, every social provider class instantiated through `IntegrationManager` and the SDKs they pull with them, the generated Prisma client, and the heavy dependencies. Either propose a specific change with a measured saving, or conclude with evidence that 380 MB is the honest floor for this application. Both are acceptable answers; a guess is not.

### 6. `71m.6` — set the limits to the truth — **Луна** — branch `codex/compose-limits`

Recalculate the limits in `deploy/production/docker-compose.yaml` against actual usage, remembering that this host runs other people's services and the limits are deliberately set so this stack fails first. Note that `NODE_OPTIONS=--max-old-space-size=512` currently applies to all three processes at once although they are nothing like the same size.

## External services epic — `content-factory-next-ry5`

Nine integrations were switched off in code on 2026-08-16 — not merely left without an environment variable — because the owner's rule is that nothing leaves for anyone but us. Each switch is a named constant or an unmounted component carrying its issue number. `docs/operations/outbound-connections.md` is the register.

Four of these tasks are ready to run. Three wait on a decision the owner has not made, and one does not fit on the server.

### 7. `ry5.8` — already done, close it — **Луна** — no branch

`redirectmeto.com` is gone from all five providers; `grep -r redirectmeto apps libraries` returns nothing. Verify, then `bd close content-factory-next-ry5.8` with the evidence.

### 8. `ry5.7` — finish taking the upstream name out of the SDK — **Луна** — branch `codex/sdk-rename`

The default base URL is already gone. What remains: the exported class in `apps/sdk/src/index.ts` is still called `Postiz`; `apps/sdk/package.json` still credits the upstream author; and `apps/sdk` is not in `SCAN_ROOTS` in `scripts/branding/brand-scan.cjs`, which is why the brand scanner never saw any of this. Add the directory to the scanner in the same commit, so the check can never miss it again.

### 9. `ry5.9` — remove the AgentMedia hand-off — **Луна** — branch `codex/drop-agent-media`

The endpoint is already refused by a flag. Delete it properly: `getAgentMediaSsoUrl` in `apps/backend/src/api/routes/users.controller.ts`, the modal `apps/frontend/src/components/layout/agent.media.modal.tsx`, whatever renders it, and the `AGENT_MEDIA_SSO_KEY` references. It advertised another company's product from inside ours and told it which organizations exist here.

### 10. `ry5.6` — delete the advertising machinery — **Терра** — branch `codex/drop-ad-tracking`

The owner buys no advertising, so none of this earns its place. Remove the Facebook pixel component, the GTM component, `dubAnalytics`, `apps/frontend/scripts/fetch-gtm.mjs`, the vendored `apps/frontend/public/f.js` (512 KB), `TrackService` and its two call sites in `users.controller.ts` and `public.controller.ts`, the `/user/t` and `/public/t` routes if nothing else needs them, and the `facebook-nodejs-business-sdk` dependency together with its types.

Careful: `useTrack` on the frontend calls those routes. Follow the chain before deleting, and take the callers with it.

### 11. `ry5.2` — the newsletter, on our own machine — **Сол** — branch `codex/newsletter-listmonk`

The mechanism is intact and waiting: `NewsletterInterface`, `NewsletterService.getProvider()` and three providers, of which the empty one is active. Wire up listmonk, which is self-hosted, so subscriber addresses stay on our server. Do not use beehiiv; it is an external service.

Add a compose service for listmonk in `deploy/production/docker-compose.yaml`, on the pattern the other services follow: a name prefixed `cf-`, no published port, a memory limit, and its database as a separate database inside the existing `cf-postgres` rather than a new Postgres container — the host has about 2.6 GB free and cannot afford another one.

Then the part that matters more than the plumbing: today the product subscribes people silently when they register. That is wrong however self-hosted it is. Add an explicit consent checkbox to registration and an unsubscribe page, and only call the newsletter when consent was given. New interface strings go into all sixteen locale files in the same commit, or the locale guard turns red.

### 12. Blocked, do not start

- `ry5.1` — the Polotno image editor: pay for a key, replace it with a self-hosted editor, or drop the editor. The owner has not chosen. Do not choose for them.
- `ry5.5` — the support channel: the owner has not said what channel the product has.
- `ry5.3` — product analytics: the owner has not said whether any is wanted.
- `ry5.4` — error collection: GlitchTip needs roughly 700 MB to 1 GB and the host has about 2.6 GB free with other people's services on it. Do not add it until the memory epic has finished and the number is known. If the memory work frees enough, say so and leave the decision to the owner.

## Constraints

- Node `22.23.2` from `.nvmrc` and pnpm `10.6.1` only; never npm or yarn.
- Read `AGENTS.md` first, then `.codex/handoff.md`, then `docs/operations/outbound-connections.md`. Every task has a Beads issue with detail: `bd show <id>`.
- The Temporal contract used by the upstream product — queue names, workflow names, activity signatures — does not change. A successor is versioned and callers are migrated; nothing is mutated in place.
- Interface code uses `cf` tokens only, no hex literal in JSX, and must pass `tests/design.guard.test.cjs` and `tests/design.contrast.test.cjs`. That guard is checked in both directions: a file that stops breaking a rule must leave its allowlist, or the suite fails from the other side.
- No secret in the repository, in a prompt, or in a command argument. No paid model call. No real call to any vendor, in tests or in a build.
- Do not touch payments, the approval mode for new accounts, or anything under `libraries/nestjs-libraries/src/database/prisma/schema.prisma` without an issue that says to.
- Nothing that puts a third-party address back into the product. The register in `docs/operations/outbound-connections.md` is the standard: if a change would add a row to it, stop and say so instead.

## Output

Per task: which model did it, what changed by file, the verbatim output of the four gates, and the branch and commit hash. For the memory tasks, the measured RSS before and after, taken the same way as the numbers above.

Then two lists: everything deliberately left undone, and everything that could not be finished, with the reason.

## Stop rules

Do not stop for permission — commit each finished task on its own branch and keep going. If one task fails, write down where it stopped and why, leave that branch as it is, and start the next one; a single failure does not cancel the rest.

Never push, never merge, never deploy, never touch the production server or its database, never start a container on the host, never register anything with a vendor, never spend a model key. The four blocked tasks stay blocked: if you believe one of them is obvious, write the argument down for the owner instead of acting on it.
