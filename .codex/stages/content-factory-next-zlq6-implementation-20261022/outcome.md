# Video V1 local engineering implementation

Branch: `codex/video-v1-api`. Base: `e326aab7a7940814bc63f6dc229b018e53c759ac`.
Worktree: `/home/me/code/content-factory-next-worktrees/video-v1-api`.
Accepted scope: revision 3 of `docs/superpowers/plans/2026-10-22-video-generation.md`.
Six planning documents copied byte-for-byte from the shared checkout; its dirty
handoff, project index and research index were not overwritten or committed here.
No paid calls, real credentials, push, merge, public refresh or deployment authorized.

## Owner-requested independent review

The first engineering verdict at `00ffac5dc` is superseded by the subsequent
[independent review/corrections](review.md) and
[correction acceptance](review-evidence/root-acceptance.json). All confirmed
engineering findings were fixed; real provider gates remain. The review streams
delivered bounded settings and product corrections, accepted by root with
PostgreSQL/native UI/chat/browser/Temporal proofs. Their source/tests are retained;
their synthetic data was removed without touching another owner's workload.

## Engineering decisions and failure controls

Verdict: GO for local implementation; real provider acceptance remains gated.
UI/chat -> shared video service -> Prisma job/monetary reservation -> versioned
Temporal execution -> provider adapter -> bounded import -> existing owned Media.
Legacy synchronous routes/workflow contracts remain separate.

| Failure | Evidence/mechanism | Control and final proof |
| --- | --- | --- |
| Duplicate paid submission | Concurrent HTTP/chat, transport loss and activity replay | Tenant/intent and tenant/preflight unique identities, lease/CAS; one immediate Higgsfield same-key/body replay; orphan submit becomes uncertain; PostgreSQL integration |
| Payer/key substitution | Global text slot or settings rotation | Separate encrypted provider maps, pinned tenant/provider/payer/credential identity, no fallback; credential and admission tests |
| Provider charged but file missing | CDN expiry or storage interruption | Provider success retained, independent save_failed state, explicit save cycle refreshes existing provider ID; no regeneration |
| Local SSRF or unbounded result | Provider redirect and DNS rebinding | HTTPS + every redirect/public address check, pinned dispatcher, 100 MiB/60 sec bounds, MP4 structure/type checks |
| Wrong route/facts/locale | Model JSON or edited source controlling paid API | Strict settings and deterministic adapters; immutable source revision/snapshot, numbers/negation preflight aids, human-editable script, provider language quality UNKNOWN |
| Executor/schema drift | Research samples differ from current primary schemas | Fresh adapter contract evidence in docs/research/video-v1-api-contracts.md; no unverified implicit options |

Monetary policy is an admission reservation, not a promise of a provider hard
billing cap. Unknown provider cost stays null; known invoices replace estimates.
The reservation is retained after uncertainty/failed generation until spend is
known. Included routes default disabled without explicit credentials and policy.

Rollback: disable new launches in provider policy, retain jobs/media/receipts and
allow already accepted jobs to poll/save with the pinned credential. Key rotation
cannot silently substitute a new key. No destructive migration/cleanup is needed.

## Delegated streams

Each stream used gpt-6.1-sol/high with a clean context and isolated file ownership.
Concrete benefit: parallel external-schema research, UI implementation and shared
settings/execution work while root implemented persistence and safety boundaries.

- provider_adapters: adapters/catalog/API evidence and media contracts delivered and accepted through current-schema, ingestion and reference/recovery checks.
- video_settings: encrypted configuration/admission and Prisma fixture/tests delivered and accepted through key/payer/usage and persisted-domain checks.
- video_ui: interface, all 16 locales and existing chat/media consumers delivered and accepted through focused UI/design tests and actual Next browser journeys.
- chat_execution: shared capabilities, content-bound approval, versioned durable execution and tenant-safe refs delivered and accepted through capability/domain/receipt checks and a real isolated Temporal restart.

Root integrated corrections: canonical JSON hashes for PostgreSQL jsonb;
ADMIN permission enum; inherited payer on first video-key save; actual voice vs
avatar engine enums; preserved policies on AI reprepare; authenticated Blob
download; unknown actual cost visible; obsolete geometry allowance removed.
Reference quote/submit tests compare JSON values while actual replay remains
byte-identical. UI tests disable SWR's irrelevant loading timeout handles.
The browser fixture runner is scoped to its own organizations and its shutdown
removes the synthetic reader membership before the user. No stream owns an
unaccepted implementation tail.

## Acceptance and remaining gates

Local engineering ACCEPTED. See [root acceptance](evidence/root-acceptance.json),
[browser receipt](evidence/browser-acceptance.actual.json) and
[Temporal receipt](evidence/temporal-acceptance.actual.json). Exact successful
results are reused for unchanged inputs; superseded diagnostic failures are
identified in the root receipt. No full release build/suite was run.

| Existing task | Accepted engineering result | Remaining external gate |
| --- | --- | --- |
| `.2` | Persisted editable grounded brief/script, source revision, locale/references/policies, text preparation separate from video launch | Actual text/prompt usefulness and multilingual semantic fidelity |
| `.3` | Prisma reservation/tenant/payer/key/intent fences, uncertainty, restart, versioned real Temporal execution | Production migration/runtime validation only with separate release authority |
| `.4` | Wan/Kling Standard/Pro exact text/image schema, estimate, idempotency, cancel/status, reference dimensions | Account route availability, actual clips/quotes/terms |
| `.5` | HeyGen v3 exact script/locale/voice/avatar/render engine, catalog/status and no uncertain replay | Actual compatible assets, speech/fact/lip-sync quality and billing |
| `.6` | Both modes in actual Next/Nest/Prisma, playback and authenticated download, reader/tenant denial, mobile, bounded ingestion/save-only recovery | Real provider output observation |
| `.7` / epic | Independent local engineering checks PASS; remains in progress | Required actual provider pilot evidence |

Browser proof: edit/save/preflight/launch/reload/play/download in both modes,
decoded 960x540 fixture frames and exact downloaded SHA-256, one submit each,
no replay on reload, reader 403, foreign job 404, 390px layout without overflow.
Temporal proof: actual SDK workflow bundle/activity plus isolated dev cluster;
worker/service restarted while both jobs queued with saved provider receipts;
both complete with unchanged receipts, two submits total and two owned files.
These are engineering proofs with a CC0 fixture, not generated-video samples.
Live LLM tool selection was not exercised; real registered chat capabilities and
original-author/approval/domain paths were exercised without a paid model.

Real provider account availability, applicable terms, sample/voice/language
quality, actual cost and raw/prepared prompt benefit remain UNKNOWN. The
20-generation/$25 pilot is a proposal only, conditioned on exact quotes and
account controls bounding spend, followed by separate current authority.
Epic and `.7` remain open until required observations exist. No real credentials,
paid calls, push, merge, public refresh or deployment occurred.

Safe-only cleanup: task-owned Next/fixture processes and the two labelled
disposable Docker containers/owned anonymous DB volume removed after acceptance;
source/dependencies/evidence/worktree retained. No shared service, other owner
worktree or shared checkout change removed. Planning originals remain intact.

docs-reviewed: updated — API evidence, local runbook, component inventory,
research/project navigation and task-specific handoff. Task identities and
dependencies retained; Beads completion notes distinguish engineering from `.7`.

graph-reviewed: used the shared checkout's read-only graph at dd67538d for
VideoManager/media/database relationships; changed/current sources verified here.
New job symbols are not yet indexed; no external semantic graph/API calls.
