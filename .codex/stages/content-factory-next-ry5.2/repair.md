# Repair log: content-factory-next-ry5.2

Status: applied on top of `f0e3258e` as a second commit; the first commit is
unchanged. Driven by the branch audit, which accepted the work with fixes and
blocked on one P1.

## P1 — deploying the branch without Listmonk stopped the whole product

`var/docker/nginx.conf` proxied to `http://cf-listmonk:9000` in three locations
with a literal host name. nginx resolves such an upstream once, while it loads
the configuration, and refuses to start when the name is missing; the entrypoint
runs it under `set -e`, so the refusal ended the container and
`restart: unless-stopped` repeated it — with the backend, the frontend and the
orchestrator inside. The state that triggers it is the one the branch's own
runbook declares normal: the newsletter container is owner-run and absent until
its database is bootstrapped.

- `var/docker/nginx.conf`: `resolver 127.0.0.11 valid=30s ipv6=off`, the address
  held in `$cf_listmonk`, and `proxy_pass $cf_listmonk` in all three locations,
  which moves the lookup to request time. A missing newsletter now costs a 502
  on `/newsletter/*` and nothing else. `proxy_connect_timeout 5s` keeps that 502
  fast.
- `deploy/production/docker-compose.yaml`: says in writing why `cf-app` has no
  `depends_on: cf-listmonk`.
- `docs/operations/production-deploy.md` step 5 now starts the stack by name and
  without `cf-listmonk`; `docs/operations/newsletter.md` step 3 says the same
  thing from its side. The two runbooks contradicted each other.
- `scripts/release/verify-nginx-config.sh` asks the built image to load its
  configuration with `--network none` — the state of a host with no newsletter.
  Reading the file cannot see this failure, which is why the branch's tests did
  not. The step is part of the deploy runbook.

## P2 — synthetic identities were excluded only in the browser

The rule now lives in `libraries/helpers/src/auth/newsletter.consent.ts` and is
read by both `register.tsx` and `auth.service.ts`. An eligible-provider list plus
a deliverable-address shape decide it, so a direct
`POST /auth/register {"provider":"TELEGRAM","subscribeToNewsletter":true}` is
refused where it is enforceable.

## P2 — the consent was recorded nowhere

`User.newsletterConsentAt` and `User.newsletterConsentSource` are written by the
same `create` statement as the account. The same two facts travel to Listmonk in
the subscriber's `attribs`, and the failure log now names the account id, so the
manual recovery `newsletter.md` promises is possible and
`content-factory-next-ry5.2.1` has a source to retry from. Both columns are
optional and additive; the runbook carries the two `ALTER TABLE` statements,
because `prisma db push` is not usable on this database.

## P2 — the registration answer waited up to twenty seconds

`listmonk.provider.ts` holds one `AbortSignal.timeout(2_500)` for the whole call,
so the conflict path spends what is left of the budget rather than a second one.

## P2 — the address had stopped being configuration

The provider compared `LISTMONK_DOMAIN` with the literal `http://cf-listmonk:9000`,
which put one deployment's Docker service name inside a shared library. It now
checks the shape that matters — internal plain HTTP, no credentials, no path,
query or fragment. `.env.example` and `deploy/production/app.env.example` ship all
five values empty, so a copied environment selects the empty provider instead of
failing on every registration with the box ticked.

## P3 — reuse, the guard's blind spot, and the receipt

- `libraries/react-shared-libraries/src/form/checkbox.field.tsx` is the shared
  checkbox: native input, `cf` tokens, 44px target, `CONTROL_FOCUS_RING` from
  `choice/control.button.tsx` — including the `focus-visible:outline-none` the
  hand-rolled copy was missing. The registration form uses it.
- `tests/raw-control.guard.test.cjs` counts `input`. The 25 existing occurrences
  are grandfathered in `tests/raw-control-allowlist.json` with reasons; the
  ledger is 47 and shrink-only.
- `getHelpfulReasonForRegistrationFailure` was dead and is gone.
- `scripts/orchestration/run_stage_closeout.py` records Jest's own totals. The
  receipt attested `Ran 6 tests` for a run of several hundred because Jest's
  summary matched no pattern and the last-N window kept only the unittest tail.

## Cross-branch note, owner decision

`docs/operations/newsletter.md` now says to add up the memory ceilings of the
whole host before deploying: this branch adds 384 MiB and the parallel error
collection branch about 896 MiB more, on a host with roughly 3 GB free and a
dozen containers belonging to other people. No limit was changed — how much
capacity to give either is the owner's call.

## Verification

Run in this worktree, Node 22.23.2, pnpm 10.6.1.

- `pnpm exec jest --runInBand`: 75 suites passed, 726 tests passed.
- `pnpm run build`: frontend, backend and orchestrator built after
  `pnpm run prisma-generate` picked up the two new columns.
- `python3 -m unittest tests/test_orchestration_closeout.py tests/test_docs_links.py`:
  8 tests, OK.
- `node scripts/branding/brand-scan.cjs`, `pnpm run docs:check`,
  `bash scripts/orchestration/run_process_verification.sh`, `git diff --check`:
  all passed.

Known unrelated flake: a parallel `pnpm exec jest` can fail
`tests/external-services.purge.test.cjs` with `ENOENT` on
`apps/frontend/src/__brand_scan_display_name_fixture__.ts`. That fixture is
created and deleted inside the repository tree by `tests/branding.test.cjs` while
the purge suite walks the same tree. It predates this work and is not caused by
it; `--runInBand` passes.

Not done: nothing was executed against Docker, a container, a real Listmonk or a
database. `verify-nginx-config.sh` is proven by its own test through a stubbed
`docker`, not by a real image.
