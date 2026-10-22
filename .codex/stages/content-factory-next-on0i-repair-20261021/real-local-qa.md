# Owned local HTTP/model/search QA stand

Authority: the current user explicitly authorized paid local model/search QA,
then a scoped read of server AI/search configuration and retaining it locally.
No push, deployment, production data mutation, social publication or real-user
message is part of this stand.

The private stand descriptor is
`/tmp/on0i-real-local-qa-s2nihQ/stand.json` (0600, directory 0700). It binds the
owned disposable product database, separate Mastra database, reserved initially
empty local Redis database 13, synthetic identities and localhost ports. Read
that descriptor for resource identities; never paste its content into logs.
The existing PostgreSQL and Redis containers were preserved.

Durable AI-only configuration is
`/home/me/.config/content-factory/local-ai.json` (0600, directory 0700).
It contains the effective configuration returned by the deployed existing
`loadAiConfig` for the exact authorized organization. Decryption happened on the
server; the application JWT secret, complete environment, customer records and
sessions were not transferred. The server process only read Prisma rows.

Only the existing configured original **local** organization's AI row was then
updated, encrypted using its existing local JWT secret. The old encrypted row
was backed up privately before mutation. The original `.env` and unrelated AI
rows were preserved. Source server mode `included` becomes `workspace_key`
locally, so local calls spend the explicitly provisioned key; the model and
effective search task routes remain visible in the receipts.

## Runtime and commands

Use Node 22.23.2 and pnpm 10.6.1:

```bash
export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH
node scripts/evidence/on0i-real-local-qa.cjs inspect \
  --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
node scripts/evidence/on0i-real-local-qa-backend.cjs \
  --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
node scripts/evidence/on0i-real-local-qa-scenarios.cjs smoke \
  --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
node scripts/evidence/on0i-real-local-qa-scenarios.cjs run \
  --case direct-no-search,fresh-research \
  --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
node scripts/evidence/on0i-real-local-qa-resume.cjs \
  --accept-owned-rewrite --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
node scripts/evidence/on0i-real-local-qa-resume.cjs \
  --decide-private-template --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
node scripts/evidence/on0i-real-local-qa-summary.cjs \
  --stand /tmp/on0i-real-local-qa-s2nihQ/stand.json
```

The existing prepared stand can be reused with its descriptor. Preparing a new
stand requires the fixed ports and the dedicated Redis database 13 to be free;
the command refuses to take over an existing reservation. After an explicitly
owned retirement, prepare from the working original local AI row by passing its
organization UUID privately as `CF_QA_SOURCE_ORG`, without committing that value:

```bash
node scripts/evidence/on0i-real-local-qa.cjs prepare \
  --local-env /home/me/code/content-factory-next/.env \
  --source-org "$CF_QA_SOURCE_ORG"
```

The command prints only the new private descriptor path and synthetic resource
metadata. It copies only configured encrypted AI/search fields, creates new
owned product/Mastra databases, and uses Prisma schema push only on that new
owned product database. Preparation expects its fixed local ports to be free;
it will refuse while this existing stand owns them. A private effective config
can be reapplied to that new stand with `on0i-real-local-qa-provision.cjs
from-file --credentials-file /home/me/.config/content-factory/local-ai.json
--stand PRIVATE_NEW_DESCRIPTOR`, without another server read.

Backend: `http://localhost:3478`. Frontend: `http://localhost:4278` (root-owned
launcher). Private Playwright storage state:
`/tmp/on0i-real-local-qa-s2nihQ/storage-state.json`. Root owns final browser
acceptance. Only stop the PIDs recorded by these private owned launchers.

The backend uses the actual `ApiModule`, auth middleware, permission guards,
Prisma services, domain tools, `ChatModule` and native Mastra store. It imports
the supported command Temporal module pointed at an unreachable local port,
omits cron/Temporal registration modules, and registers the actual newsletter
retry provider without its scheduler. There are no social integration records
or outbound mail/provider credentials. This is local module integration proof,
not a production-process or Temporal publication proof.

## Evidence interpretation

- `real-local-qa-preparation.json`: database/schema bootstrap, initial synthetic
  rows, untouched Docker inventory; zero paid calls at preparation.
- `real-local-qa-credentials.json`: scoped server read and owned QA credential
  roundtrip, without key values.
- `real-local-qa-original-local-provision.json`: durable private file, original
  local AI row backup, exact key roundtrip and unrelated-row preservation.
- `real-local-qa-http-smoke.json`: actual authenticated `/user/self` and native
  thread list, no paid call.
- `real-local-qa-scenario-*.json`: real HTTP stream, persisted native history,
  saved synthetic output/source references and per-caller AI ledger.
- `real-local-qa-research-reuse-resume.json`: exact displayed rewrite selected
  through the native public question-card door; persisted before/after and cost.
- `real-local-qa-private-question-resume.json`: exact displayed delegated-choice
  option, actual saved template readback, completed native task and cost.
- `real-local-qa-summary.json`: read-only consolidation, exact source hashes
  loaded at bootstrap versus the current files, matching root-review hashes,
  settings restoration and the complete synthetic HTTP actor ledger.
- `real-local-qa-root-browser-observe.json`: existing primary browser thread
  read back without replay: one persisted user request, one assistant with 45
  numbered lines, one real model request and matching succeeded usage row.
  Root reported a missing user message in the UI; server persistence passed.
  The frontend fix and final visual verification belong to root.
- `real-local-qa-final-scope-bootstrap.json`: final service freeze
  `61cd7d65…`, PID 89221, no bootstrap source change, zero provider requests
  during restart/readback, and the previously stopped cold task still
  interrupted with no pending calls. Root's completed browser history retained
  both roles across that restart.

Full raw streams, histories and source results remain private in the stand
directory. Passive provider receipts contain model/endpoint, generation ID,
reported usage/cost and timing, never request headers, prompts or response text.
The final observer also reads a clone of the existing response stream and saves
generated text privately (0600 under a0700 directory), with only its hash, length,
numbered-label sequence and capture-completion state in the receipt. This permits
an independent provider-to-Memory comparison without changing the delivered stream.
The HTTP scenario caller is a separate synthetic user, so browser operation
costs do not contaminate its ledger. Time-window provider receipts may include
simultaneous browser requests and say so; they are not an invoice.

Supported real scenarios: direct no-search answer, fresh research/save/readback,
reference interpretation, saved-research continuation, private question and
unknown sources. The runner records pending questions/consents without inventing
an answer or automatically approving them. HTTP 200 and completed usage rows do
not decide semantic quality: each receipt retains its acceptance criteria for
root review. Native HTTP `DONE` can mean a handoff to a new native run. The
runner now follows the public observe door without resending the prompt, keeps
the temporary QA fallback configuration until completion, and requires a
terminal completed task plus output. A real fallback case also requires a
successful unscripted request to that exact configured fallback model.
No full suite is run by this child stream.

## Observed results and limits

Root semantic review is authoritative in `root-semantic-review.json`; the
consolidator verifies each reviewed artifact's content hash. Direct rewriting,
reference interpretation, fresh SQLite research/save/readback, saved-research
continuation after review, and honest rejection of the fictional SQLite
release were accepted individually. The private-question card asked for a
real cause; the selected delegated-choice option then created a template with
explicit blanks, without a fabricated cause or external search.

The fresh research used the existing configured **Exa** research route: two
actual searches, one saved CORE, completed readback, USD 0.03001562 across four
known ledger operations. Continuation edited that same CORE only after its
displayed change was selected, performed no new search, and completed at USD
0.01076455. The template branch completed three ledger operations at USD
0.00327069. No real Tavily request has been observed; configured/decryptable
Tavily credentials alone are not search-provider proof.

The first faulted fallback check did **not** prove fallback. Its explicit
single GLM model was interpreted as an inherited default and excluded for a
workspace key. A scripted primary 429 therefore took the native availability
handoff; after the fixture was disabled, the primary model answered. The
initial harness incorrectly called HTTP `DONE` a pass. The corrected
FAIL/NOT_PROVEN receipt is retained in history, with the readonly policy
preflight and full continuation receipts. The source owner reproduced and
fixed the explicit/default policy issue. After the coordinated restart to PID
53623, the one bounded actual fallback rerun passed: exactly one scripted
primary 429 (no real primary request) followed by one real OpenRouter GLM
response. The useful Russian sentence, generation ID, exact loaded source
hashes, terminal completed task and known USD 0.04842849 ledger cost are in
`real-local-qa-scenario-real-fallback-scripted-primary.json`. QA settings were
restored and the scripted fault disabled in `finally`, then independently read
back. This is resilience/quality evidence; it does not establish comparative
model speed, price or savings.

Earlier research failures and the premature transient-approval detach are
retained honestly. The later genuine warm failure was captured through the
actual cached public native APIs and exact PostgreSQL workflow snapshot, then
stopped only on its owned thread. Repeated diagnostic polling retained first
and last examples of each state in Git-safe evidence; all 124 other copies are
hash-verified private backups. No manual approval of an unarmed allow-policy
skill was used as acceptance proof.

The summary includes every HTTP caller ledger row, including one admitted
unknown-cost row from the earlier cold-run fixture. Its historical Stop had
HTTP 201 but returned `stopped:false` with no request claim; current readonly
history still projects running execution and the pending skill call. The
runtime retest on PID 53623 changed the Stop response to `stopped:true` but left
the history/pending projection unchanged; that FAIL is retained in history.
After the explicit service freeze and restart to PID 75266, the exact retained
thread/run passed: Stop returned true, actual GET history became
`settled/interrupted`, and pending calls became empty. The full restart/Stop
interval contained zero provider requests. The crashed billing row was
preserved exactly, including its unknown cost and admitted status; the test did
not invent an amount or settle it manually. Current proof and loaded hashes are
in `real-local-qa-final-bootstrap-cold-stop.json` and the latest
`real-local-qa-old-cold-stop-current.json`. The earlier readonly state is retained
in `real-local-qa-old-cold-ledger-residual.json`. That unknown amount is not
silently excluded from a claim about the whole QA spend. Loaded runtime hashes are
embedded in newer scenario receipts. The earlier direct/reference receipts
did not embed an immutable boot manifest, so they are not claimed as proof of
the exact final source revision. Classify and agent use the same configured
model; no cheap-classifier savings comparison is claimed.

graph-reviewed: owner checkout graph at
`/home/me/code/content-factory-next/graphify-out/graph.json` (dd67538d) was used
read-only for a focused `MastraService` query. Exact current source files were
then inspected in the repair worktree; no graph refresh or external backend ran.
