# Video V1: local acceptance and activation boundary

Implemented on `codex/video-v1-api`, from `e326aab7a7940814bc63f6dc229b018e53c759ac`,
against [plan revision 3](../superpowers/plans/2026-10-22-video-generation.md).
Provider schemas, dated prices and the bounded future pilot are recorded in
[API evidence](../research/video-v1-api-contracts.md).
The additive subscription/manual implementation and its local-only provider
gates are documented in [video access acceptance](video-subscription-local-acceptance.md).

## Product path

The piece action and Media → Create video open the same `/media?video=1`
workspace as video cards in chat. A source-backed brief is saved independently
of chat history. The person chooses clip/presenter, provider/model, locale and
supported settings, edits the prompt/script, checks price and launches the saved
preflight. Preparing with AI uses the existing text allowance and never submits
a video. Repreparing a saved draft preserves its fact policies, references and
implications to avoid in a new editable variant. Original pieces/drafts remain.

Routes live on `MediaController`; UI and the registered `video.*` chat
capabilities call the same `VideoJobService`. Readers can reopen/play/download;
editors/admins may prepare/launch/cancel/retry saving; workspace video keys and
policy are admin-only. Download uses an authenticated, tenant-scoped attachment
door, so it works for cross-origin object storage as well as local storage.
The Media page follows client query/back navigation. An embedded video editor
retains the chat URL; video identity reaches the assistant's tenant-scoped
current-draft reader. Completed chat edits refresh that exact SWR reader and
preserve dirty manual edits behind an explicit conflict/reload action. Initial
defaults cannot overwrite a restored draft's model/locale/framing. Video
approval displays the matching saved script/settings before enabling Yes and
does not promise a billing ceiling, cancellation or a refund.

`VideoPromptDraft` stores optimistic versions. Every semantic edit clears
preflight. `VideoGenerationJob` stores the immutable brief/settings/source
revision, exact selected route/request, payer/credential identity, provider
receipt, cost evidence and owned Media ID. JSON identity uses canonical object
keys because PostgreSQL jsonb reorders them. One tenant/intent and one
tenant/preflight are unique: retrying through another entry point still returns
one job. A new result requires a new explicit preflight/intent.

## Execution and recovery

`videoGenerationWorkflowV1` runs on the existing `main` queue through the new
versioned activity. Payloads carry local org/job IDs only, never scripts or keys.
Polls sleep durably for 10 seconds, history continues as new every 100 steps,
and the persisted job age bounds status observation to 24 hours. Activities make
one attempt; domain leases own the bounded provider behavior. Bootstrap plus a
30-second recovery pass close the persisted-before-dispatch gap. Existing
Temporal/synchronous video contracts are unchanged.
At the deadline a busy lease or temporary storage error keeps a durable
execution until expiry is persisted; a nonterminal expiry result cannot close
the workflow successfully. Final Media attachment also checks tenant, owner,
unexpired lease and empty result atomically, rolling back a losing Media insert.

- Higgsfield: at most two immediate submit calls, with the same saved endpoint,
  JSON body and key. Interrupted/aged submits become `uncertain`; no new key.
- HeyGen: one submit call. A lost response remains `uncertain`; status/reload
  never manufactures another generation, despite a newer documented defensive
  idempotency header.
- Provider success moves to `saving`. Completion requires owned Media. Failed
  imports remain `save_failed`, retain spend, and have an explicit save-only
  cycle. A retry can refresh the existing provider ID/CDN link; it cannot submit.
- Cancellation is offered only for queued Higgsfield jobs. Request acceptance
  differs from confirmed provider cancellation. No refund is inferred.

Ingestion allows public HTTPS only, validates every redirect, pins DNS to checked
addresses, limits the request to 60 seconds / 100 MiB, and checks actual MP4 type
and container structure. Reference images are owned Media IDs, at most one,
bounded to 20 MiB; actual dimensions constrain Kling image framing. No renderer,
transcoder, timeline, TTS or social publishing was introduced.

## Payer, policy and migration

Workspace/instance settings have separate encrypted `videoApiKeys` maps and
`videoSpendPolicy` maps, addressed by `higgsfield` or `heygen`. Existing AI
`included` / `workspace_key` determines the payer. Saving a first video key does
not switch the inherited mode. The OpenAI/OpenRouter key slot is not reused.
The UI/model receive presence/limits only. All three settings writers merge
video-key/policy maps inside bounded serializable transactions, so an unrelated
concurrent edit cannot restore a disabled provider or removed key. The common
AI settings door also preserves inherited payer mode on its first video save.
Higgsfield's key input is the provider
pair `key_id:key_secret`; real credential retrieval/wiring was not performed.

Each enabled provider requires positive `maxCostUsd` and `monthlyBudgetUsd`.
Admission serializes reservations per workspace/provider/payer/calendar UTC
month and reuses the AI operation ledger. Included mode additionally needs its
existing operation allowance. A missing quote/key/policy submits nothing.
Unknown cost remains null; uncertainty/failed generation keeps its reservation
until actual spend is known. Observed costs replace estimates even if higher.
This is an admission reservation, **not a provider billing guarantee**. HeyGen
target duration is not actual duration and its public-rate estimate is not an
invoice or a hard ceiling. Actual voice/render compatibility and account
spending controls still require the provider pilot.

The generated additive SQL reference is
[video-generation-v1-schema-apply.sql](video-generation-v1-schema-apply.sql).
It adds two JSON fields to each existing settings table, two owned tables,
indexes and organization foreign keys. It was generated from the base/current
Prisma datamodels and passed the existing SQL allowlist guard for
`InstanceAiDefaults`, `AiProviderSetting`, `VideoPromptDraft`, `VideoGenerationJob`.
Only an owned disposable local database was changed. Future production apply
must follow [production deployment](production-deploy.md); never use production
`prisma db push`.

Rollback/disable: turn off new launches in the provider policy. Preserve jobs,
receipts, usage and media. Accepted provider jobs can poll/save with their exact
pinned payer/key even after mode/enable changes. Removing/rotating that key
cannot silently substitute another; the job retains the actionable error.

## Reproducing the local engineering proof

Use Node 22.23.2 / pnpm 10.6.1, the frozen lockfile and a generated Prisma client.
Create a new owned PostgreSQL, bound to loopback only, database
`cf_video_v1_test`. Apply the current Prisma schema **only there**. Export
`CF_VIDEO_DATABASE_DISPOSABLE=1` and its `CF_VIDEO_DATABASE_URL`. The fixture guard
rejects other names/hosts and redirection parameters. No existing account, DB,
credential, service or deployment is needed.

```sh
pnpm exec jest --runInBand --coverage=false tests/video-credentials-v1.test.cjs tests/video-settings-concurrency-v1.postgres.test.cjs tests/video-domain-v1.postgres.test.cjs tests/video-chat-domain-v1.postgres.test.cjs tests/video-reference-domain-v1.postgres.test.cjs tests/video-module-v1.postgres.test.cjs tests/video-chat-execution-v1.test.cjs tests/video-media-v1.test.cjs tests/video-ui-v1.test.cjs
pnpm exec node --test tests/video-provider-v1.contract.test.cjs
```

Run `scripts/development/video-v1-local-fixture.cjs` on loopback port 43311 and
Next dev on 43310 with backend URL `http://127.0.0.1:43311`. Use `localhost` for
the browser's frontend origin to match Next's dev-origin policy; the fixture
allows both loopback names. `CF_VIDEO_FIXTURE_INFO` optionally saves synthetic
workspace IDs outside Git. The runner filters its own created workspace IDs so
other tests sharing the disposable cluster are not consumed.

`pnpm exec node scripts/development/video-v1-browser-acceptance.cjs` exercises the
actual Next Media page, new Nest controller/policy guard, real services/Prisma
and local storage. It verifies edit/save/preflight/launch/reload/play/download
for both modes, reader 403, foreign-tenant 404 and mobile overflow. Identity,
unrelated shell reads, text/provider HTTP and Temporal transport are synthetic.
The fixture is never a production mode. The source MP4 is an unchanged public
CC0 asset with [provenance](../../tests/fixtures/video-v1/README.md).

An additional isolated Temporal server/SDK test bundles the actual workflow,
uses the actual versioned activity and domain service, and restarts the worker
and service after both provider receipts are persisted. Both workflows finish
with the same receipts, two total submits and two downloadable owned files.
A third workflow exercises deadline expiry while its lease is busy: the actual
history continues as new, then becomes terminal after the lease is released,
with zero extra submits.
Only provider/text HTTP is synthetic in this test. Start a **new dedicated**
loopback Temporal dev server (never the shared `main` queue), set
`CF_VIDEO_TEMPORAL_DISPOSABLE=1` and `CF_VIDEO_TEMPORAL_ADDRESS=127.0.0.1:PORT`, then:

```sh
pnpm exec node scripts/development/video-v1-temporal-acceptance.cjs
```

`CF_VIDEO_TEMPORAL_EVIDENCE` optionally selects the JSON receipt path. The script
uses the existing disposable database guard and cleans up its own synthetic
organizations. The dev server/container belongs to the caller and must be
removed separately. [Temporal Worker SDK](https://typescript.temporal.io/api/classes/worker.Worker).

Evidence lives under `.codex/stages/content-factory-next-zlq6-implementation-20261022/`.
The owner-requested [independent review and corrections](../../.codex/stages/content-factory-next-zlq6-implementation-20261022/review.md)
supersede the engineering verdict of the first implementation commit. The final
browser proof used Next's local Webpack dev mode: a Turbopack HMR panic interrupted
the first run, and Webpack's first cold route compilation took 31.7 seconds.
The subsequent warm-route journey passed; this measures neither production
performance nor a full production build.
No full release build/suite, real provider output, live LLM tool selection,
production Temporal check, push, public export, merge or deployment is claimed.
Those are separate from this scoped engineering proof. Final task-owned local
servers and disposable containers were stopped/removed; the worktree, sources,
reproduction tools and evidence remain.

## Remaining provider acceptance

The epic and `.7` remain open. Before activation obtain actual account access,
applicable terms/asset permissions, exact quotes/configurations and explicit
spend authority. The proposed pilot is capped at 20 submissions and **$25 only
as a proposal**, after conservative remaining spend can be bounded with account
controls. View samples for all enabled routes, have competent speakers check
the selected languages, record every attempt/elapsed time/known or unknown
cost, and compare raw/prepared prompts under identical configurations. Fixture
files, API schema tests and a funded account prove none of that quality.
